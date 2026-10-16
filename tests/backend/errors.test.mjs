import test from 'node:test';
import assert from 'node:assert/strict';
import { geminiError, planValidationError } from '../../server/geminiErrors.mjs';
import { getLayoutAdvice } from '../../server/gemini.mjs';
import { fakeConfig, payload } from './helpers.mjs';

for (const [status, code, exposedStatus] of [
  [400, 'GEMINI_BAD_REQUEST', 502], [401, 'GEMINI_ACCESS_DENIED', 502],
  [402, 'GEMINI_BILLING', 502], [403, 'GEMINI_ACCESS_DENIED', 502],
  [404, 'GEMINI_MODEL_NOT_FOUND', 502], [429, 'GEMINI_QUOTA', 429],
  [500, 'GEMINI_UNAVAILABLE', 502], [503, 'GEMINI_UNAVAILABLE', 502],
]) {
  test(`Google HTTP ${status} maps to ${code} without exposing its raw body`, async () => {
    const error = await geminiError(new Response(fakeConfig.apiKey, { status }));
    assert.equal(error.code, code); assert.equal(error.status, exposedStatus); assert.equal(error.upstreamStatus, status);
    assert.ok(!error.message.includes(fakeConfig.apiKey));
  });
}
for (const [reason, code] of [
  ['API_KEY_INVALID', 'GEMINI_KEY_INVALID'], ['API_KEY_EXPIRED', 'GEMINI_KEY_INVALID'],
  ['SERVICE_DISABLED', 'GEMINI_API_DISABLED'], ['API_KEY_SERVICE_BLOCKED', 'GEMINI_KEY_RESTRICTED'],
]) {
  test(`uses only known Google reason ${reason}`, async () => {
    const error = await geminiError(Response.json({ error: {
      message: fakeConfig.apiKey, details: [{ reason, metadata: { key: fakeConfig.apiKey } }],
    } }, { status: 403 }));
    assert.equal(error.code, code); assert.ok(!JSON.stringify(error).includes(fakeConfig.apiKey));
  });
}
test('unknown reason codes are not returned to the browser', async () => {
  const error = await geminiError(Response.json({ error: { details: [{ reason: fakeConfig.apiKey }] } }, { status: 400 }));
  assert.equal(error.code, 'GEMINI_BAD_REQUEST'); assert.ok(!JSON.stringify(error).includes(fakeConfig.apiKey));
});
for (const [problem, category] of [
  ['outside: bed-1', 'outside'], ['door: bed-1', 'door'], ['overlap: bed-1, desk-1', 'overlap'],
  ['plant-1 must be away door; actual distance 20 cm.', 'placement'],
  ['Return every original furniture ID exactly once', 'furniture'],
  ['A note was supplied. Interpret it.', 'note'], ['Expected a plan object.', 'format'],
]) {
  test(`reports validation category ${category} using safe labels`, () => {
    const error = planValidationError([problem]); assert.deepEqual(error.checks, [category]);
    assert.equal(error.code, 'AI_PLAN_INVALID'); assert.ok(!error.message.includes('bed-1'));
  });
}
for (const reason of ['SAFETY', 'RECITATION', 'MAX_TOKENS']) {
  test(`handles model finish reason ${reason}`, async () => {
    const code = reason === 'MAX_TOKENS' ? 'GEMINI_OUTPUT_LIMIT' : 'GEMINI_RESPONSE_BLOCKED';
    await assert.rejects(getLayoutAdvice(payload(), fakeConfig, async () => Response.json({
      candidates: [{ finishReason: reason, content: { parts: [{ text: fakeConfig.apiKey }] } }],
    })), (error) => { assert.equal(error.code, code); assert.ok(!error.message.includes(fakeConfig.apiKey)); return true; });
  });
}
test('handles prompt blocking when there are no candidates', async () => {
  await assert.rejects(getLayoutAdvice(payload(), fakeConfig, async () => Response.json({
    promptFeedback: { blockReason: 'SAFETY' },
  })), { code: 'GEMINI_RESPONSE_BLOCKED' });
});
test('rejects malformed model JSON with a safe response code', async () => {
  await assert.rejects(getLayoutAdvice(payload(), fakeConfig, async () => Response.json({
    candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{' + fakeConfig.apiKey }] } }],
  })), { code: 'GEMINI_RESPONSE_INVALID' });
});
