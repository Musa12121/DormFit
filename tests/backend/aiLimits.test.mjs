import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiLimiter } from '../../server/aiLimits.mjs';
import { startApp, fakeConfig, googleResponse, payload } from './helpers.mjs';

test('minute limit uses a rolling window and rounds the wait up', () => {
  let time = Date.parse('2026-10-17T12:00:00Z');
  const take = createAiLimiter({ perMinute: 2, perDay: 100 }, () => time);
  take();
  time += 30_000; take();
  time += 29_001;
  assert.throws(take, error => error.code === 'AI_RATE_LIMIT' && error.retryAfter === 1);
  time += 999; take(); // Only the first call has expired.
  assert.throws(take, error => error.code === 'AI_RATE_LIMIT' && error.retryAfter === 30);
});

test('daily limit survives minute expiry and resets at midnight UTC', () => {
  let time = Date.parse('2026-10-17T23:58:00Z');
  const take = createAiLimiter({ perMinute: 10, perDay: 1 }, () => time);
  take(); time += 60_000;
  assert.throws(take, error => error.code === 'AI_DAILY_LIMIT' && error.retryAfter === 60);
  time += 60_000; take();
});

test('blocked attempts do not extend the waiting period', () => {
  let time = 0;
  const take = createAiLimiter({ perMinute: 1, perDay: 100 }, () => time);
  take();
  for (let i = 0; i < 5; i++) {
    time += 10_000;
    assert.throws(take, error => error.retryAfter === (60_000 - time) / 1000);
  }
  time = 60_000; take();
});

test('midnight does not erase the rolling minute limit', () => {
  let time = Date.parse('2026-10-17T23:59:50Z');
  const take = createAiLimiter({ perMinute: 1, perDay: 100 }, () => time);
  take(); time += 10_000;
  assert.throws(take, error => error.code === 'AI_RATE_LIMIT' && error.retryAfter === 50);
});

test('invalid limit settings fail at startup', () => {
  for (const value of [0, -1, 1.5, NaN, Infinity, '10']) {
    assert.throws(() => createAiLimiter({ perMinute: value, perDay: 100 }));
    assert.throws(() => createAiLimiter({ perMinute: 10, perDay: value }));
  }
});

test('HTTP limit blocks Gemini, returns Retry-After and recovers after waiting', async t => {
  let time = Date.parse('2026-10-17T12:00:00Z');
  let calls = 0;
  const { post, base } = await startApp(t, async () => { calls++; return googleResponse(); }, fakeConfig,
    { limits: { perMinute: 1, perDay: 100 }, now: () => time });
  assert.equal((await post()).status, 200);
  const blocked = await post();
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('retry-after'), '60');
  const body = await blocked.json();
  assert.equal(body.code, 'AI_RATE_LIMIT');
  assert.equal(body.retryAfter, 60);
  assert.match(body.error, /Try again in 60 seconds/);
  assert.equal((await fetch(`${base}/api/status`)).status, 200);
  assert.equal(calls, 1);
  time += 60_000;
  assert.equal((await post()).status, 200);
  assert.equal(calls, 2);
});

test('layout and preference endpoints share one budget, regardless of caller headers', async t => {
  let calls = 0;
  const { post, base } = await startApp(t, async () => { calls++; return googleResponse(); }, fakeConfig,
    { limits: { perMinute: 1, perDay: 100 } });
  await post();
  const blocked = await fetch(`${base}/api/interpret-preferences`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.1' },
    body: JSON.stringify(payload()),
  });
  assert.equal(blocked.status, 429);
  assert.equal((await blocked.json()).code, 'AI_RATE_LIMIT');
  assert.equal(calls, 1);
});

test('daily HTTP cap remains after the minute window expires', async t => {
  let time = Date.parse('2026-10-17T23:58:00Z');
  const { post } = await startApp(t, async () => googleResponse(), fakeConfig,
    { limits: { perMinute: 10, perDay: 1 }, now: () => time });
  await post(); time += 60_000;
  const blocked = await post();
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('retry-after'), '60');
  assert.equal((await blocked.json()).code, 'AI_DAILY_LIMIT');
  time += 60_000;
  assert.equal((await post()).status, 200);
});

test('malformed requests and status checks do not consume the AI budget', async t => {
  let calls = 0;
  const { post, base } = await startApp(t, async () => { calls++; return googleResponse(); }, fakeConfig,
    { limits: { perMinute: 1, perDay: 1 } });
  await fetch(`${base}/api/status`);
  assert.equal((await post({})).status, 400);
  assert.equal((await post(payload(), { Origin: 'https://example.com' })).status, 403);
  assert.equal((await post()).status, 200);
  assert.equal(calls, 1);
});

test('non-retryable upstream failures still consume the budget', async t => {
  let calls = 0;
  const { post } = await startApp(t, async () => {
    calls++;
    return Response.json({ error: { message: 'Bad request' } }, { status: 400 });
  }, fakeConfig, { limits: { perMinute: 1, perDay: 100 } });
  assert.equal((await post()).status, 502);
  assert.equal((await post()).status, 429);
  assert.equal(calls, 1);
});

for (const retry of ['format compatibility', 'layout validation', 'malformed JSON']) {
  test(`${retry} retry cannot bypass the Gemini call limit`, async t => {
    let calls = 0;
    const { post } = await startApp(t, async () => {
      calls++;
      return retry === 'format compatibility'
        ? Response.json({ error: { message: 'Unknown responseFormat' } }, { status: 400 })
        : Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: retry === 'malformed JSON' ? '{' : '{}' }] } }] });
    }, fakeConfig, { limits: { perMinute: 1, perDay: 100 } });
    const result = await post();
    assert.equal(result.status, 429);
    assert.equal((await result.json()).code, 'AI_RATE_LIMIT');
    assert.equal(calls, 1);
  });
}
