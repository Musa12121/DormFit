import test from 'node:test';
import assert from 'node:assert/strict';
import { getLayoutAdvice, getPreferenceReview } from '../../server/gemini.mjs';
import { plantPlan } from '../ai-fixtures.mjs';
import { fakeConfig, payload } from './helpers.mjs';

const response = text => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }] });

for (const fence of ['```json', '```JSON', '```']) {
  test(`accepts a complete JSON response inside ${fence}`, async () => {
    let calls = 0;
    const plan = plantPlan();
    const actual = await getLayoutAdvice(payload(), fakeConfig, async () => {
      calls++;
      return response('\n' + fence + '\n' + JSON.stringify(plan) + '\n```\n');
    });
    assert.equal(calls, 1);
    assert.deepEqual(actual, plan);
  });
}

for (const badResponse of [
  () => response('{"positions": ['),
  () => response(''),
  () => Response.json({ candidates: [] }),
  () => new Response('{not an HTTP JSON document'),
]) {
  test('retries an unreadable response once using JSON mode and preserves the returned AI plan', async () => {
    let calls = 0;
    const actual = await getLayoutAdvice(payload(), fakeConfig, async (_url, options) => {
      calls++;
      const request = JSON.parse(options.body);
      if (calls === 1) return badResponse();
      assert.equal(request.generationConfig.responseFormat, undefined);
      assert.equal(request.generationConfig.responseMimeType, 'application/json');
      assert.match(request.systemInstruction.parts[0].text, /Return only a JSON object/);
      assert.equal(request.contents.length, 1, 'Do not resend invalid model text');
      return response(JSON.stringify(plantPlan()));
    });
    assert.equal(calls, 2);
    assert.deepEqual(actual, plantPlan());
  });
}

test('two unreadable responses fail with a safe message and a bounded call count', async () => {
  let calls = 0;
  await assert.rejects(getLayoutAdvice(payload(), fakeConfig, async () => {
    calls++;
    return response(`{"private": "${fakeConfig.apiKey}`);
  }), error => {
    assert.equal(error.code, 'GEMINI_RESPONSE_INVALID');
    assert.ok(!error.message.includes(fakeConfig.apiKey));
    return true;
  });
  assert.equal(calls, 2);
});

test('does not extract JSON fragments from prose or invent missing closing brackets', async () => {
  for (const text of ['Here is the result:\n' + JSON.stringify(plantPlan()),
    '```json\n' + JSON.stringify(plantPlan()), JSON.stringify(plantPlan()).slice(0, -1)]) {
    await assert.rejects(getLayoutAdvice(payload(), fakeConfig, async () => response(text)),
      { code: 'GEMINI_RESPONSE_INVALID' });
  }
});

test('a format compatibility attempt and malformed output share the same retry budget', async () => {
  let calls = 0;
  await assert.rejects(getLayoutAdvice(payload(), fakeConfig, async () => {
    calls++;
    return calls === 1
      ? Response.json({ error: { message: 'Unknown responseFormat' } }, { status: 400 })
      : response('{');
  }), { code: 'GEMINI_RESPONSE_INVALID' });
  assert.equal(calls, 2);
});

test('complete but invalid plans still undergo furniture and preference validation', async () => {
  const bad = { ...plantPlan(), positions: [] };
  let calls = 0;
  await assert.rejects(getLayoutAdvice(payload(), fakeConfig, async () => {
    calls++;
    return response('```json\n' + JSON.stringify(bad) + '\n```');
  }), { code: 'AI_PLAN_INVALID' });
  assert.equal(calls, 2);
});

test('preference interpretation also recovers from malformed JSON once', async () => {
  const review = { requirements: plantPlan().requirements, unmetRequests: [] };
  let calls = 0;
  const actual = await getPreferenceReview(payload(), fakeConfig, async () => {
    calls++;
    return response(calls === 1 ? '{' : JSON.stringify(review));
  });
  assert.equal(calls, 2);
  assert.deepEqual(actual, review);
});

test('split text parts are joined and thought parts are excluded', async () => {
  const json = JSON.stringify(plantPlan());
  const actual = await getLayoutAdvice(payload(), fakeConfig, async () => Response.json({
    candidates: [{ finishReason: 'STOP', content: { parts: [
      { thought: true, text: 'private reasoning' }, { text: json.slice(0, 80) }, { text: json.slice(80) },
    ] } }],
  }));
  assert.deepEqual(actual, plantPlan());
});
