import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getLayoutAdvice, getPreferenceReview } from '../../server/gemini.mjs';
import { planSchema } from '../../server/planPrompt.mjs';
import { getOpenings, moveOpening, openingsProblem } from '../../src/domain/openings.ts';
import { defaultProject } from '../../src/domain/model.ts';
import { plantPlan, plantProject } from '../ai-fixtures.mjs';
import { fakeConfig } from './helpers.mjs';

const payload = () => ({ project: plantProject(), prompt: 'Plant near window' });
const response = (value = plantPlan()) => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] });

for (const reason of [
  'Unknown name "responseFormat" at generation_config.',
  'The JSON schema has too many constraints.',
  'response_schema is not supported for this model.',
]) test(`a recognised format rejection gets one JSON compatibility attempt: ${reason}`, async () => {
  let calls = 0;
  const value = await getLayoutAdvice(payload(), fakeConfig, async (_url, options) => {
    const request = JSON.parse(options.body);
    calls++;
    if (calls === 1) {
      assert.equal(request.generationConfig.responseFormat.text.mimeType, 'application/json');
      assert.equal(request.generationConfig.responseJsonSchema, undefined);
      return Response.json({ error: { message: reason } }, { status: 400 });
    }
    assert.equal(request.generationConfig.responseFormat, undefined);
    assert.equal(request.generationConfig.responseMimeType, 'application/json');
    assert.match(request.systemInstruction.parts[0].text, /exact structure/);
    return response();
  });
  assert.equal(calls, 2); assert.equal(value.positions.length, 3);
});

test('field-violation metadata can identify a rejected output format without exposing descriptions', async () => {
  let calls = 0;
  await getLayoutAdvice(payload(), fakeConfig, async () => ++calls === 1 ? Response.json({ error: {
    message: 'Invalid request', details: [{ fieldViolations: [{ field: 'generation_config.response_format', description: 'private text' }] }],
  } }, { status: 400 }) : response());
  assert.equal(calls, 2);
});

for (const [status, body] of [
  [400, { error: { message: 'Invalid model setting' } }],
  [400, { error: { message: 'responseFormat error', details: [{ reason: 'API_KEY_INVALID' }] } }],
  [403, { error: { message: 'Permission denied' } }],
  [429, { error: { message: 'Quota exceeded' } }],
]) test(`unrelated or credential failures do not retry (HTTP ${status})`, async () => {
  let calls = 0;
  await assert.rejects(getLayoutAdvice(payload(), fakeConfig, async () => { calls++; return Response.json(body, { status }); }));
  assert.equal(calls, 1);
});

test('compatibility failure is bounded and never exposes the raw Google message', async () => {
  let calls = 0;
  await assert.rejects(getLayoutAdvice(payload(), fakeConfig, async () => {
    calls++; return Response.json({ error: { message: 'Unknown responseFormat: private-key-echo' } }, { status: 400 });
  }), (error) => { assert.equal(error.code, 'GEMINI_BAD_REQUEST'); assert.doesNotMatch(error.message, /private-key-echo/); return true; });
  assert.equal(calls, 2);
});

test('JSON compatibility restores dropped confirmed conditions in a best-effort plan', async () => {
  let calls = 0;
  const review = { requirements: plantPlan().requirements, unmetRequests: [] };
  const result = await getLayoutAdvice({ ...payload(), review }, fakeConfig, async () => {
    calls++;
    if (calls % 2 === 1) return Response.json({ error: { message: 'responseFormat is unsupported' } }, { status: 400 });
    return response({ ...plantPlan(), requirements: [] });
  });
  assert.equal(calls, 4);
  assert.equal(result.partial, true);
  assert.deepEqual(result.requirements, review.requirements);
});

test('interpretation uses the same compatibility path', async () => {
  let calls = 0;
  const review = { requirements: plantPlan().requirements, unmetRequests: [] };
  assert.deepEqual(await getPreferenceReview(payload(), fakeConfig, async () => ++calls === 1
    ? Response.json({ error: { message: 'Unsupported responseFormat' } }, { status: 400 }) : response(review)), review);
  assert.equal(calls, 2);
});

test('dynamic furniture/opening IDs do not inflate the API schema', () => {
  const project = plantProject(); project.furniture[0].id = 'long-id-'.repeat(10);
  const schema = planSchema(project);
  assert.equal(schema.properties.positions.items.properties.id.enum, undefined);
  assert.equal(schema.properties.requirements.items.properties.targetId.enum, undefined);
});

for (const [wall, x, y, offset] of [
  ['top', 150, 0, 75], ['bottom', 150, 360, 75], ['left', 0, 150, 75], ['right', 420, 150, 75],
]) test(`dragging a window snaps to the ${wall} wall`, () => {
  const room = defaultProject().room;
  room.openings = [{ id: 'opening-test', kind: 'window', wall: 'top', offset: 10, width: 150 }];
  const moved = moveOpening(room, 'opening-test', x, y);
  assert.deepEqual(moved.openings[0], { id: 'opening-test', kind: 'window', wall, offset, width: 150 });
  assert.equal(openingsProblem(moved), null);
  assert.equal(room.openings[0].offset, 10);
});

test('dragging around occupied wall space finds the nearest legal gap', () => {
  const room = defaultProject().room; room.openings = getOpenings(room);
  const moved = moveOpening(room, 'opening-window', 210, 360);
  assert.equal(moved.openings[1].wall, 'bottom');
  assert.equal(openingsProblem(moved), null);
  assert.equal(moved.openings[1].offset, 12.5);
});

test('dragging beyond corners clamps the opening and keeps its width', () => {
  const room = defaultProject().room; room.openings = [getOpenings(room)[1]];
  for (const [x, y] of [[-500, 0], [3000, 0], [0, 3000], [420, -500]]) {
    const moved = moveOpening(room, 'opening-window', x, y);
    assert.equal(openingsProblem(moved), null); assert.equal(moved.openings[0].width, 155);
  }
  assert.equal(moveOpening(room, 'missing', 0, 0), room);
  assert.equal(moveOpening(room, 'opening-window', NaN, 0), room);
});
