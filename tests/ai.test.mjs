import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { analyze } from '../src/domain/planner.ts';
import { AI_PROTOCOL, checkAiPlan, checkAiPlanBestEffort, requirementDistance } from '../src/domain/ai.ts';
import { plantProject, plantPlan } from './ai-fixtures.mjs';
import { getLayoutAdvice } from '../server/gemini.mjs';
import { repairAiPlan } from '../src/domain/repairAiPlan.ts';
import { createApp } from '../server/app.mjs';

// No real config file, real key or Google request is used in these tests.
const fakeKey = 'test-only-private-key';
const config = { apiKey: fakeKey, model: 'test-model' };
const payload = { project: plantProject(), prompt: 'Place the plant near the window.' };
const advice = plantPlan();
const googleResponse = (result = advice, finishReason = 'STOP') => Response.json({
  candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(result) }] } }],
});

test('asks Gemini for actual positions, keeps the key in the header and preserves furniture', async () => {
  let called = false;
  const result = await getLayoutAdvice(payload, config, async (url, options) => {
    called = true;
    assert.match(url, /test-model:generateContent$/);
    assert.ok(!url.includes(fakeKey));
    assert.equal(options.headers['x-goog-api-key'], fakeKey);
    assert.ok(!options.body.includes(fakeKey));
    const request = JSON.parse(options.body);
    const input = JSON.parse(request.contents[0].parts[0].text);
    assert.equal(input.furniture.length, payload.project.furniture.length);
    assert.equal(input.localExample, undefined);
    assert.ok(input.furniture.every(item => !('x' in item) && !('y' in item)), 'Do not seed Gemini with existing coordinates');
    assert.ok(input.furniture.every((item) => item.id && item.width && item.depth));
    assert.equal(input.preference, payload.prompt);
    assert.equal(input.units, 'centimetres');
    assert.equal(input.minimumFurnitureGap, 30);
    assert.equal(input.preferredFurnitureGap, 60);
    assert.equal(input.name, undefined);
    assert.equal(request.generationConfig.responseFormat.text.schema.properties.positions.minItems, 3);
    assert.ok(request.generationConfig.responseFormat.text.schema.required.includes('requirements'));
    return googleResponse({ ...advice, extra: 'Do not return arbitrary fields' });
  });
  assert.ok(called);
  assert.deepEqual(result, advice);
  assert.ok(!JSON.stringify(result).includes(fakeKey));
  const checked = checkAiPlan(result, payload.project, payload.prompt);
  assert.equal(checked.ok, true);
  assert.equal(checked.layout.id, 'ai');
  assert.equal(checked.layout.project.furniture.find((item) => item.id === 'plant-1').y, 10);
  assert.deepEqual(analyze(checked.layout.project).issues, []);
  assert.ok(requirementDistance(checked.layout.project, advice.requirements[0]) <= 60);
  assert.equal(payload.project.furniture.find((item) => item.id === 'plant-1').y, 300);
  for (const item of checked.layout.project.furniture) {
    const original = payload.project.furniture.find((original) => original.id === item.id);
    assert.equal(item.width, original.width);
    assert.equal(item.depth, original.depth);
    assert.equal(item.name, original.name);
  }
});

test('missing key never calls Google', async () => {
  await assert.rejects(getLayoutAdvice(payload, { apiKey: '' }, () => {
    assert.fail('Google must not be called');
  }), { status: 503 });
});

test('different valid Gemini proposals keep their own coordinates for the same room', async () => {
  const alternative = plantPlan();
  alternative.positions[2].x = 170;
  const results = [];
  for (const proposal of [plantPlan(), alternative]) {
    assert.equal(checkAiPlan(proposal, payload.project, payload.prompt).ok, true);
    const result = await getLayoutAdvice(payload, config, async () => googleResponse(proposal));
    assert.deepEqual(result.positions, proposal.positions);
    results.push(result);
  }
  assert.notDeepEqual(results[0].positions, results[1].positions);
});

test('an unusable AI response is retried and the second proposal retains its coordinates', async () => {
  const bad = { ...plantPlan(), positions: [] };
  const good = plantPlan();
  good.positions[2].x = 170;
  let calls = 0;
  const result = await getLayoutAdvice(payload, config, async (_url, options) => {
    calls++;
    const request = JSON.parse(options.body);
    if (calls === 1) return googleResponse(bad);
    assert.equal(request.contents.length, 3);
    assert.ok(JSON.parse(request.contents[2].parts[0].text).validationProblems.length);
    return googleResponse(good);
  });
  assert.equal(calls, 2);
  assert.deepEqual(result.positions, good.positions);
});

test('geometry retries include measured footprints and validator explanations', async () => {
  const bad = plantPlan();
  bad.positions[2] = { ...bad.positions[2], x: 10, y: 110 };
  bad.requirements.push({ itemId: 'plant-1', targetId: 'window', relation: 'away' });
  let calls = 0;
  const result = await getLayoutAdvice(payload, config, async (_url, options) => {
    calls++;
    if (calls === 1) return googleResponse(bad);
    const request = JSON.parse(options.body);
    const feedback = JSON.parse(request.contents.at(-1).parts[0].text);
    assert.ok(feedback.placementDetails.some(issue => issue.type === 'overlap' && issue.message.includes('overlap')));
    assert.deepEqual(feedback.actualFootprints.find(item => item.id === 'plant-1'),
      { id: 'plant-1', x: 10, y: 110, width: 35, depth: 35, rotation: 0 });
    assert.match(feedback.instruction, /viewing group/);
    return googleResponse(plantPlan());
  });
  assert.equal(calls, 2);
  assert.deepEqual(result.positions, plantPlan().positions);
});

test('small geometry repair preserves the other AI positions', async () => {
  const proposal = plantPlan();
  proposal.positions[2].y = -5;
  const result = await getLayoutAdvice(payload, config, async () => googleResponse(proposal));
  assert.equal(result.adjusted, true);
  for (const id of ['bed-1', 'desk-1']) {
    const before = proposal.positions.find(position => position.id === id);
    const after = result.positions.find(position => position.id === id);
    assert.equal(after.x, before.x);
    assert.equal(after.y, before.y);
  }
  assert.equal(checkAiPlan(result, payload.project, payload.prompt).ok, true);
});

test('invalid room, empty furniture and overlong preference are rejected before Google', async () => {
  for (const invalid of [
    {},
    { ...payload, project: { ...payload.project, room: { width: 0, depth: 300 } } },
    { ...payload, project: { ...payload.project, furniture: [] } },
    { ...payload, prompt: 'a'.repeat(601) },
  ]) {
    await assert.rejects(getLayoutAdvice(invalid, config, () => {
      assert.fail('Google must not be called');
    }), { status: 400 });
  }
});

test('invented/missing IDs, empty explanations, invalid tips and incomplete responses are rejected', async () => {
  const unknown = plantPlan();
  unknown.positions[2].id = 'invented';
  for (const result of [
    unknown,
    { ...advice, positions: advice.positions.slice(1) },
    { ...advice, positions: [advice.positions[0], advice.positions[0], advice.positions[2]] },
    { ...advice, explanation: '' },
    { ...advice, tips: ['a', 'b', 'c', 'd'] },
    { ...advice, tips: [42] },
  ]) {
    await assert.rejects(getLayoutAdvice(payload, config, async () => googleResponse(result)),
      { status: 502 });
  }
  await assert.rejects(getLayoutAdvice(payload, config, async () => googleResponse(advice, 'MAX_TOKENS')),
    { status: 502 });
  await assert.rejects(getLayoutAdvice(payload, config, async () => Response.json({ candidates: [] })),
    { status: 502 });
});

test('plant at the top corner is not accepted as beside the actual window', () => {
  const plan = plantPlan();
  plan.positions[2] = { id: 'plant-1', x: 0, y: 0, rotated: false };
  // Top wall alone is insufficient: this plant is >60 cm from the centred window.
  const checked = checkAiPlan(plan, payload.project, payload.prompt);
  assert.equal(checked.ok, false);
  assert.ok(checked.problems.some((problem) => problem.includes('near window')));
});

test('a wrong plant location is repaired locally without a second paid request', async () => {
  const bad = plantPlan();
  bad.positions[2].x = 330;
  bad.positions[2].y = 300;
  let calls = 0;
  const result = await getLayoutAdvice(payload, config, async (_url, options) => {
    calls++;
    assert.ok(JSON.parse(options.body).contents.length === 1);
    return googleResponse(bad);
  });
  assert.equal(calls, 1);
  assert.equal(result.adjusted, true);
  const checked = checkAiPlan(result, payload.project, payload.prompt);
  assert.equal(checked.ok, true);
  assert.ok(requirementDistance(checked.layout.project, result.requirements[0]) <= 60);
});

test('two invalid attempts return the last readable AI plan with visible placement warnings', async () => {
  const bad = plantPlan();
  bad.positions[2].x = 330;
  bad.positions[2].y = 300;
  bad.requirements.push({ itemId: 'plant-1', targetId: 'window', relation: 'away' });
  let calls = 0;
  const result = await getLayoutAdvice(payload, config, async () => {
    calls++;
    return googleResponse(bad);
  });
  assert.equal(calls, 2);
  assert.equal(result.partial, true);
  const checked = checkAiPlan(result, payload.project, payload.prompt);
  assert.equal(checked.ok, false, 'The strict validator still reports the unsatisfied conditions');
  const shown = checkAiPlanBestEffort(result, payload.project, payload.prompt);
  assert.equal(shown.ok, true);
  assert.ok(shown.layout.issueCount > 0);
  assert.equal(shown.layout.project.furniture.length, payload.project.furniture.length);
});

test('keeps a readable best-effort plan if the retry request fails', async () => {
  const bad = plantPlan();
  bad.positions[2].x = 330;
  bad.positions[2].y = 300;
  bad.requirements.push({ itemId: 'plant-1', targetId: 'window', relation: 'away' });
  let calls = 0;
  const result = await getLayoutAdvice(payload, config, async () => {
    calls++;
    return calls === 1
      ? googleResponse(bad)
      : Response.json({ error: 'temporary service issue' }, { status: 503 });
  });
  assert.ok(calls > 1, 'The retry tries the configured model order before failing');
  assert.equal(result.partial, true);
  assert.equal(result.positions.find(position => position.id === 'plant-1').x, 330);
});

test('local repair fixes overlapping furniture while keeping the three example-note requirements', () => {
  const bad = plantPlan();
  for (const position of bad.positions) { position.x = 10; position.y = 10; }
  bad.requirements = [
    { itemId: 'plant-1', targetId: 'window', relation: 'near' },
    { itemId: 'desk-1', targetId: 'right-wall', relation: 'near' },
    { itemId: 'bed-1', targetId: 'door', relation: 'away' },
  ];
  assert.equal(checkAiPlan(bad, payload.project, payload.prompt).ok, false);
  const original = structuredClone(bad);
  const fixed = repairAiPlan(bad, payload.project, payload.prompt);
  assert.ok(fixed);
  assert.deepEqual(bad, original, 'Repair must not mutate the model response');
  assert.deepEqual(fixed.requirements, bad.requirements, 'No declared requirement is relaxed');
  const checked = checkAiPlan(fixed, payload.project, payload.prompt);
  assert.equal(checked.ok, true);
  assert.deepEqual(analyze(checked.layout.project).issues, []);
  assert.ok(requirementDistance(checked.layout.project, bad.requirements[0]) <= 60);
  assert.ok(requirementDistance(checked.layout.project, bad.requirements[1]) <= 60);
  assert.ok(requirementDistance(checked.layout.project, bad.requirements[2]) >= 100);
  assert.equal(fixed.positions.length, payload.project.furniture.length);
});

test('local repair cannot invent missing furniture or ignore contradictory requirements', () => {
  const bad = plantPlan();
  bad.positions.pop();
  assert.equal(repairAiPlan(bad, payload.project, payload.prompt), null);
  const contradictory = plantPlan();
  contradictory.requirements.push({ itemId: 'plant-1', targetId: 'window', relation: 'away' });
  assert.equal(repairAiPlan(contradictory, payload.project, payload.prompt), null);
});

test('validation diagnostics identify geometry and placement failures without model text', async () => {
  const { planValidationError } = await import('../server/geminiErrors.mjs');
  const error = planValidationError([
    'overlap: bed-1, desk-1',
    'plant-1 must be near window; actual distance 200 cm.',
  ]);
  assert.equal(error.code, 'AI_PLAN_INVALID');
  assert.deepEqual(error.checks, ['overlap', 'placement']);
  assert.match(error.message, /overlaps/);
  assert.match(error.message, /near/);
  assert.ok(!error.message.includes('bed-1'));
});

test('Google key errors and request-format errors have different safe codes', async () => {
  const { geminiError } = await import('../server/geminiErrors.mjs');
  const invalidKey = await geminiError(Response.json({ error: {
    message: fakeKey,
    details: [{ reason: 'API_KEY_INVALID', metadata: { key: fakeKey } }],
  } }, { status: 400 }));
  assert.equal(invalidKey.code, 'GEMINI_KEY_INVALID');
  assert.equal(invalidKey.upstreamStatus, 400);
  assert.ok(!JSON.stringify(invalidKey).includes(fakeKey));
  assert.ok(!invalidKey.message.includes(fakeKey));
  const invalidRequest = await geminiError(Response.json({ error: { message: fakeKey } }, { status: 400 }));
  assert.equal(invalidRequest.code, 'GEMINI_BAD_REQUEST');
});

test('safe diagnostics expose only an error code and upstream status, never credentials', async (t) => {
  const server = createApp(config, async () => Response.json({ error: {
    message: fakeKey, details: [{ reason: 'API_KEY_INVALID' }],
  } }, { status: 400 }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const failed = await fetch(`${url}/api/layout-advice`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  assert.equal(failed.status, 502);
  const error = await failed.json();
  assert.equal(error.code, 'GEMINI_KEY_INVALID');
  assert.ok(!JSON.stringify(error).includes(fakeKey));
  const status = await (await fetch(`${url}/api/status`)).json();
  assert.equal(status.lastFailure.code, 'GEMINI_KEY_INVALID');
  assert.equal(status.lastFailure.upstreamStatus, 400);
  assert.deepEqual(Object.keys(status.lastFailure).sort(), ['at', 'code', 'upstreamStatus']);
  assert.ok(!JSON.stringify(status).includes(fakeKey));
});

test('wall escapes, collisions and door blockage are rejected', () => {
  for (const position of [
    { x: -1, y: 10 },
    { x: 10, y: 120 },
    { x: 195, y: 300 },
  ]) {
    const bad = plantPlan();
    bad.positions[2] = { ...bad.positions[2], ...position };
    assert.equal(checkAiPlan(bad, payload.project).ok, false);
  }
});

test('opposite notes produce different valid positions with checked near/away relationships', () => {
  const near = checkAiPlan(plantPlan(), payload.project, payload.prompt);
  const awayPlan = plantPlan();
  awayPlan.positions[2].x = 330;
  awayPlan.positions[2].y = 300;
  awayPlan.requirements[0].relation = 'away';
  awayPlan.explanation = 'The plant is placed away from the window.';
  const away = checkAiPlan(awayPlan, payload.project, 'Place the plant away from the window.');
  assert.equal(near.ok, true);
  assert.equal(away.ok, true);
  assert.ok(requirementDistance(near.layout.project, plantPlan().requirements[0]) <= 60);
  assert.ok(requirementDistance(away.layout.project, awayPlan.requirements[0]) >= 100);
  assert.notDeepEqual(near.layout.project.furniture, away.layout.project.furniture);
});

test('nonempty notes cannot silently disappear; unsupported requests remain visible', () => {
  const plan = plantPlan();
  plan.requirements = [];
  assert.equal(checkAiPlan(plan, payload.project, payload.prompt).ok, false);
  plan.unmetRequests = ['This request could not be checked automatically.'];
  const checked = checkAiPlan(plan, payload.project, payload.prompt);
  assert.equal(checked.ok, true);
  assert.match(checked.layout.name, /partially/);
});

test('invalid target IDs and self references are rejected', () => {
  for (const targetId of ['nonexistent', 'plant-1']) {
    const plan = plantPlan();
    plan.requirements[0].targetId = targetId;
    assert.equal(checkAiPlan(plan, payload.project).ok, false);
  }
});

test('quota and authorization failures do not expose raw Google errors or the key', async () => {
  for (const [upstreamStatus, expected] of [[429, 429], [403, 502], [404, 502], [500, 502]]) {
    await assert.rejects(getLayoutAdvice(payload, config, async () => new Response(fakeKey, {
      status: upstreamStatus,
    })), (error) => {
      assert.equal(error.status, expected);
      assert.ok(!error.message.includes(fakeKey));
      return true;
    });
  }
});

test('network and timeout failures return actionable, safe errors', async () => {
  await assert.rejects(getLayoutAdvice(payload, config, async () => {
    throw new Error(fakeKey);
  }), { status: 502 });
  await assert.rejects(getLayoutAdvice(payload, config, async () => {
    throw new DOMException('timeout', 'TimeoutError');
  }), { status: 504 });
});

test('local HTTP endpoint validates requests, rejects external origins and hides backend files', async (t) => {
  const server = createApp(config, async () => googleResponse());
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const post = (body, headers = {}) => fetch(`${url}/api/layout-advice`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const success = await post(payload, { Origin: 'http://127.0.0.1:5173' });
  assert.equal(success.status, 200);
  assert.equal(success.headers.get('cache-control'), 'no-store');
  assert.equal(success.headers.get('x-dormfit-ai-version'), AI_PROTOCOL);
  assert.deepEqual(await success.json(), advice);
  assert.equal((await post(payload, { Origin: 'https://example.com' })).status, 403);
  assert.equal((await post('{')).status, 400);
  assert.equal((await post({}, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await post({ prompt: 'a'.repeat(65_000) })).status, 413);
  assert.equal((await fetch(`${url}/api/layout-advice`)).status, 405);
  assert.equal((await fetch(`${url}/server/config.local.mjs`)).status, 404);
});

test('HTTP missing-key response keeps local planning available', async (t) => {
  const server = createApp({ apiKey: '' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/layout-advice`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /key/);
});
