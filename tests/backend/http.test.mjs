import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, payload, googleResponse, fakeConfig } from './helpers.mjs';
import { AI_PROTOCOL } from '../../src/domain/ai.ts';

test('successful JSON response is private, versioned and safe to display', async (t) => {
  const { post } = await startApp(t);
  const response = await post();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-dormfit-ai-version'), AI_PROTOCOL);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('content-type'), /application\/json/);
  const body = await response.json();
  assert.equal(body.positions.length, 3);
  assert.ok(!JSON.stringify(body).includes(fakeConfig.apiKey));
});

for (const method of ['GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
  test(`${method} cannot trigger Gemini generation`, async (t) => {
    let calls = 0; const { base } = await startApp(t, async () => { calls++; return googleResponse(); });
    const response = await fetch(`${base}/api/layout-advice`, { method });
    assert.equal(response.status, 405); assert.equal(response.headers.get('allow'), 'POST'); assert.equal(calls, 0);
  });
}

for (const origin of ['https://example.com', 'http://localhost.attacker.test', 'https://127.0.0.1', 'null', 'ftp://localhost']) {
  test(`rejects cross-site origin ${origin} before a model request`, async (t) => {
    let calls = 0; const { post } = await startApp(t, async () => { calls++; return googleResponse(); });
    assert.equal((await post(payload(), { Origin: origin })).status, 403); assert.equal(calls, 0);
  });
}

for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5174']) {
  test(`accepts local development origin ${origin}`, async (t) => {
    const { post } = await startApp(t); assert.equal((await post(payload(), { Origin: origin })).status, 200);
  });
}

test('accepts JSON content type with a charset', async (t) => {
  const { post } = await startApp(t);
  assert.equal((await post(payload(), { 'Content-Type': 'application/json; charset=utf-8' })).status, 200);
});

test('text and malformed bodies never reach Gemini', async (t) => {
  let calls = 0; const { base } = await startApp(t, async () => { calls++; return googleResponse(); });
  for (const [body, type, status] of [['hello', 'text/plain', 415], ['{', 'application/json', 400]]) {
    const response = await fetch(`${base}/api/layout-advice`, { method: 'POST', headers: { 'Content-Type': type }, body });
    assert.equal(response.status, status);
  }
  assert.equal(calls, 0);
});

for (const body of [null, [], {}, { project: {}, prompt: '' }]) {
  test(`rejects an invalid project payload ${JSON.stringify(body)}`, async (t) => {
    let calls = 0; const { post } = await startApp(t, async () => { calls++; return googleResponse(); });
    assert.equal((await post(body)).status, 400); assert.equal(calls, 0);
  });
}

test('rejects an oversized UTF-8 request without forwarding it', async (t) => {
  let calls = 0; const { post } = await startApp(t, async () => { calls++; return googleResponse(); });
  const body = payload(); body.prompt = '🙂'.repeat(20_000);
  assert.equal((await post(body)).status, 413); assert.equal(calls, 0);
});

test('unknown paths and backend filenames cannot be served', async (t) => {
  const { base } = await startApp(t);
  // These requests target the isolated fake server, never the real private file.
  for (const path of ['/unknown', '/server/config.local.mjs', '/api/../server/config.local.mjs']) {
    assert.equal((await fetch(`${base}${path}`)).status, 404);
  }
});

test('status checks do not send model requests or expose configuration', async (t) => {
  let calls = 0; const { base } = await startApp(t, async () => { calls++; return googleResponse(); });
  const status = await (await fetch(`${base}/api/status`)).json();
  assert.deepEqual(status, { aiProtocol: AI_PROTOCOL, lastFailure: null }); assert.equal(calls, 0);
});

test('last failure is cleared after a successful generation', async (t) => {
  let failing = true;
  const { base, post } = await startApp(t, async () => failing
    ? Response.json({ error: { message: fakeConfig.apiKey } }, { status: 429 })
    : googleResponse());
  assert.equal((await post()).status, 429);
  assert.equal((await (await fetch(`${base}/api/status`)).json()).lastFailure.code, 'GEMINI_QUOTA');
  failing = false; assert.equal((await post()).status, 200);
  assert.equal((await (await fetch(`${base}/api/status`)).json()).lastFailure, null);
});

test('at most two model requests run concurrently and the slot is released', async (t) => {
  let calls = 0; let markStarted;
  let markThird;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const thirdStarted = new Promise((resolve) => { markThird = resolve; });
  const releases = [];
  const { post } = await startApp(t, async () => {
    calls++; if (calls === 2) markStarted(); if (calls === 3) markThird();
    return new Promise((resolve) => releases.push(() => resolve(googleResponse())));
  });
  const first = post(), second = post(); await started;
  assert.equal((await post()).status, 429); assert.equal(calls, 2);
  releases.splice(0).forEach((release) => release());
  assert.equal((await first).status, 200); assert.equal((await second).status, 200);
  const third = post(); await thirdStarted; releases.pop()();
  assert.equal((await third).status, 200); assert.equal(calls, 3);
});

test('disconnecting the browser aborts the upstream model request and releases its slot', async (t) => {
  let markStarted, markAborted; let blocking = true;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const aborted = new Promise((resolve) => { markAborted = resolve; });
  const { base, post } = await startApp(t, async (_url, options) => {
    if (!blocking) return googleResponse();
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => { markAborted(); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
      markStarted();
    });
  });
  const controller = new AbortController();
  const request = fetch(`${base}/api/layout-advice`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()), signal: controller.signal,
  });
  const rejected = assert.rejects(request, { name: 'AbortError' });
  await started; controller.abort(); await rejected; await aborted;
  blocking = false;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await post()).status, 200);
});

test('internal failures return generic text rather than stack traces or credentials', async (t) => {
  const { post } = await startApp(t, async () => null);
  const response = await post(); assert.equal(response.status, 500);
  const body = await response.json(); assert.equal(body.code, 'INTERNAL_ERROR');
  assert.ok(!JSON.stringify(body).includes(fakeConfig.apiKey)); assert.ok(!body.error.includes('TypeError'));
});
