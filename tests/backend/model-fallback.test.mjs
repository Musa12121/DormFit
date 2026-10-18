import test from 'node:test';
import assert from 'node:assert/strict';
import { createModelRequest } from '../../server/modelFallback.mjs';
import { DEFAULT_GEMINI_MODELS, modelOrder } from '../../server/modelPolicy.mjs';
import { getLayoutAdvice, getPreferenceReview } from '../../server/gemini.mjs';
import { plantPlan } from '../ai-fixtures.mjs';
import { fakeConfig, googleResponse, payload, startApp } from './helpers.mjs';

const models = ['test-strong', 'test-medium', 'test-lite'];
const config = () => ({ ...fakeConfig, model: models[0], models: [...models] });
const modelFrom = url => decodeURIComponent(/models\/([^/]+):generateContent$/.exec(url)[1]);
const quota = (model, { window = 'minute', retry = '30s', shared = false } = {}) => Response.json({ error: {
  message: fakeConfig.apiKey,
  details: [
    { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{
      quotaId: window === 'day' ? 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' : 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier',
      quotaDimensions: shared ? {} : { model },
    }] },
    { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: retry },
  ],
} }, { status: 429 });

test('default policy prefers API free-tier Flash models and ends with 3.5 Flash-Lite', () => {
  assert.deepEqual(DEFAULT_GEMINI_MODELS, ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite']);
  assert.deepEqual(modelOrder({ model: 'gemini-3.5-flash-lite' }), DEFAULT_GEMINI_MODELS);
  assert.deepEqual(modelOrder({ model: 'my-custom-model' }), ['my-custom-model']);
  assert.deepEqual(modelOrder({ model: 'gemini-3.5-flash-lite', models: ['gemini-3.5-flash-lite'] }), ['gemini-3.5-flash-lite']);
});

test('falls through quotas in order, skips exhausted models and retries the strongest after cooldown', async () => {
  let time = 1000;
  const calls = [];
  const request = createModelRequest(config(), async url => {
    const model = modelFrom(url); calls.push(model);
    return model !== models[2] && time < 31_000 ? quota(model) : googleResponse();
  }, () => time);
  await request({}); await request({});
  assert.deepEqual(calls, [models[0], models[1], models[2], models[2]]);
  time = 31_000; await request({});
  assert.equal(calls.at(-1), models[0]);
});

for (const [start, reset] of [
  ['2026-10-18T20:00:00Z', '2026-10-19T07:00:00Z'],
  ['2026-11-01T07:00:00Z', '2026-11-02T08:00:00Z'], // 25-hour Pacific day.
  ['2026-03-08T08:00:00Z', '2026-03-09T07:00:00Z'], // 23-hour Pacific day.
]) test(`daily request quotas resume after Pacific midnight (${start})`, async () => {
  let time = Date.parse(start); const calls = [];
  const request = createModelRequest(config(), async url => {
    const model = modelFrom(url); calls.push(model);
    return model === models[0] && time < Date.parse(reset) ? quota(model, { window: 'day', retry: '10s' }) : googleResponse();
  }, () => time);
  await request({}); time = Date.parse(reset) - 1; await request({});
  assert.deepEqual(calls, [models[0], models[1], models[1]]);
  time++; await request({}); assert.equal(calls.at(-1), models[0]);
});

test('unknown and shared Google quotas stop without trying another model', async () => {
  for (const makeResponse of [() => quota(models[0], { shared: true }),
    () => quota('different-model'), () => Response.json({ error: { message: 'Quota exceeded' } }, { status: 429 })]) {
    const calls = [];
    const request = createModelRequest(config(), async url => { calls.push(modelFrom(url)); return makeResponse(); });
    assert.equal((await request({})).status, 429);
    assert.deepEqual(calls, [models[0]]);
  }
});

test('one shared violation prevents failover even when another violation is model-specific', async () => {
  let calls = 0;
  const request = createModelRequest(config(), async () => {
    calls++;
    const body = await quota(models[0]).json();
    body.error.details[0].violations.push({ quotaDimensions: {}, quotaId: 'SharedRequestsPerMinute' });
    return Response.json(body, { status: 429 });
  });
  assert.equal((await request({})).status, 429); assert.equal(calls, 1);
});

for (const status of [400, 401, 402, 403, 405, 501]) test(`HTTP ${status} does not cause model fallback`, async () => {
  let calls = 0;
  const request = createModelRequest(config(), async () => { calls++; return Response.json({ error: { message: fakeConfig.apiKey } }, { status }); });
  assert.equal((await request({})).status, status); assert.equal(calls, 1);
});

for (const status of [500, 502, 503, 504]) test(`temporary HTTP ${status} tries the next model and recovers after cooldown`, async () => {
  let time = 0; const calls = [];
  const request = createModelRequest(config(), async url => {
    const model = modelFrom(url); calls.push(model);
    return model === models[0] && time < 30_000
      ? Response.json({ error: { message: fakeConfig.apiKey } }, { status }) : googleResponse();
  }, () => time);
  assert.equal((await request({})).status, 200);
  await request({}); assert.deepEqual(calls, [models[0], models[1], models[1]]);
  time = 30_000; await request({}); assert.equal(calls.at(-1), models[0]);
});

test('a busy final model receives just one delayed retry and a successful retry clears its cooldown', async () => {
  const calls = [], waits = [];
  const request = createModelRequest(config(), async url => {
    calls.push(modelFrom(url));
    return calls.length === 4 || calls.length === 5 ? googleResponse()
      : Response.json({ error: {} }, { status: 503 });
  }, () => 0, undefined, async ms => { waits.push(ms); });
  assert.equal((await request({})).status, 200);
  assert.deepEqual(calls, [models[0], models[1], models[2], models[2]]);
  await request({}); assert.equal(calls.at(-1), models[2]);
  assert.deepEqual(waits, [1000]);
});

test('all busy models return a safe error and do not repeatedly call Google during cooldown', async () => {
  let calls = 0; const waits = [];
  const request = createModelRequest(config(), async () => {
    calls++; return Response.json({ error: { message: fakeConfig.apiKey } }, { status: 503 });
  }, () => 0, undefined, async ms => { waits.push(ms); });
  for (let attempt = 0; attempt < 2; attempt++) await assert.rejects(request({}), error => {
    assert.equal(error.code, 'GEMINI_UNAVAILABLE'); assert.equal(error.upstreamStatus, 503);
    assert.equal(error.retryAfter, 30); assert.ok(!error.message.includes(fakeConfig.apiKey)); return true;
  });
  assert.equal(calls, 4); assert.deepEqual(waits, [1000]);
});

test('long provider retry delays skip the immediate retry and preserve the cooldown', async () => {
  let time = 0; let calls = 0;
  const request = createModelRequest(config(), async () => {
    calls++; return Response.json({ error: {} }, { status: 503, headers: { 'Retry-After': '90' } });
  }, () => time, undefined, async () => { assert.fail('Do not wait and retry ahead of the provider delay'); });
  await assert.rejects(request({}), { code: 'GEMINI_UNAVAILABLE', retryAfter: 90 });
  time = 89_000; await assert.rejects(request({}), { retryAfter: 1 }); assert.equal(calls, 3);
  time = 90_000; await assert.rejects(request({}), { retryAfter: 90 }); assert.equal(calls, 6);
});

test('a pinned single model can recover once without selecting any other model', async () => {
  const calls = [];
  const request = createModelRequest(fakeConfig, async url => {
    calls.push(modelFrom(url));
    return calls.length === 1 ? Response.json({ error: {} }, { status: 503 }) : googleResponse();
  }, () => 0, undefined, async () => {});
  assert.equal((await request({})).status, 200);
  assert.deepEqual(calls, [fakeConfig.model, fakeConfig.model]);
});

test('a credential error reported with a server status still stops without fallback', async () => {
  let calls = 0;
  const request = createModelRequest(config(), async () => {
    calls++; return Response.json({ error: { details: [{ reason: 'API_KEY_INVALID' }] } }, { status: 503 });
  });
  assert.equal((await request({})).status, 503); assert.equal(calls, 1);
});

test('cancellation during the retry delay prevents the extra provider call', async () => {
  let calls = 0; const controller = new AbortController();
  const request = createModelRequest(fakeConfig, async () => {
    calls++; return Response.json({ error: {} }, { status: 503 });
  }, () => 0, undefined, async (ms, signal) => {
    assert.equal(signal, controller.signal); controller.abort();
  });
  await assert.rejects(request({ signal: controller.signal }), { name: 'AbortError' });
  assert.equal(calls, 1);
});

test('temporary server failover still consumes the shared app allowance', async t => {
  let calls = 0;
  const { post } = await startApp(t, async () => {
    calls++; return Response.json({ error: {} }, { status: 503 });
  }, config(), { limits: { perMinute: 1, perDay: 100 } });
  const response = await post();
  assert.equal(response.status, 429); assert.equal((await response.json()).code, 'AI_RATE_LIMIT');
  assert.equal(calls, 1);
});

test('the HTTP endpoint recovers from provider unavailability without leaking model or error details', async t => {
  const calls = [];
  const { post, base } = await startApp(t, async url => {
    calls.push(modelFrom(url));
    return calls.length === 1 ? Response.json({ error: { message: fakeConfig.apiKey } }, { status: 503 }) : googleResponse();
  }, config());
  const response = await post(); const body = await response.json();
  assert.equal(response.status, 200); assert.deepEqual(body, plantPlan());
  assert.deepEqual(calls, [models[0], models[1]]);
  const status = await (await fetch(`${base}/api/status`)).json();
  assert.equal(status.lastFailure, null);
  for (const value of [...models, fakeConfig.apiKey]) assert.ok(!JSON.stringify({ body, status }).includes(value));
});

test('an unavailable model is skipped temporarily', async () => {
  let time = 0; const calls = [];
  const request = createModelRequest(config(), async url => {
    const model = modelFrom(url); calls.push(model);
    return model === models[0] ? Response.json({ error: {} }, { status: 404 }) : googleResponse();
  }, () => time);
  await request({}); await request({});
  assert.deepEqual(calls, [models[0], models[1], models[1]]);
  time = 3_600_000; await request({}); assert.deepEqual(calls.slice(-2), [models[0], models[1]]);
});

test('all exhausted models fail safely without repeated requests until the earliest reset', async () => {
  let calls = 0; let time = 0;
  const request = createModelRequest(config(), async url => {
    calls++;
    return quota(modelFrom(url), { retry: `${modelFrom(url) === models[0] ? 10 : 30}s` });
  }, () => time);
  for (let attempt = 0; attempt < 2; attempt++) await assert.rejects(request({}), error => {
    assert.equal(error.code, 'GEMINI_QUOTA'); assert.equal(error.retryAfter, 10);
    assert.ok(!error.message.includes(fakeConfig.apiKey)); return true;
  });
  assert.equal(calls, 3);
  time = 10_000; await assert.rejects(request({}), { code: 'GEMINI_QUOTA' }); assert.equal(calls, 4);
});

test('respects Retry-After when it is longer than RetryInfo', async () => {
  let time = 0; const calls = [];
  const request = createModelRequest(config(), async url => {
    const model = modelFrom(url); calls.push(model);
    if (model !== models[0]) return googleResponse();
    const result = quota(model, { retry: '5s' }); result.headers.set('retry-after', '90'); return result;
  }, () => time);
  await request({}); time = 89_999; await request({});
  assert.deepEqual(calls, [models[0], models[1], models[1]]);
  time++; await request({}); assert.deepEqual(calls.slice(-2), [models[0], models[1]]);
});

test('preference review and layout generation share cooldowns and return no model metadata', async () => {
  const settings = config(); const calls = [];
  const provider = async (url, options) => {
    const model = modelFrom(url); calls.push(model);
    assert.equal(options.headers['x-goog-api-key'], fakeConfig.apiKey);
    if (model === models[0]) return quota(model);
    const input = JSON.parse(JSON.parse(options.body).contents[0].parts[0].text);
    const value = input.note ? { requirements: plantPlan().requirements, unmetRequests: [] } : plantPlan();
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] });
  };
  const review = await getPreferenceReview(payload(), settings, provider);
  const plan = await getLayoutAdvice({ ...payload(), review }, settings, provider);
  assert.deepEqual(calls, [models[0], models[1], models[1]]);
  assert.deepEqual(plan, plantPlan());
  for (const model of models) assert.ok(!JSON.stringify({ plan, review }).includes(model));
});

test('every fallback call consumes the existing app-wide allowance', async t => {
  const calls = [];
  const { post } = await startApp(t, async url => {
    calls.push(modelFrom(url)); return quota(modelFrom(url));
  }, config(), { limits: { perMinute: 1, perDay: 100 } });
  const result = await post();
  assert.equal(result.status, 429); assert.equal((await result.json()).code, 'AI_RATE_LIMIT');
  assert.deepEqual(calls, [models[0]]);
});

test('HTTP responses and status contain no model selection details', async t => {
  const { post, base } = await startApp(t, async url => modelFrom(url) === models[0] ? quota(models[0]) : googleResponse(), config());
  const result = await post(); assert.equal(result.status, 200);
  const body = await result.json(); assert.deepEqual(body, plantPlan());
  const status = await (await fetch(`${base}/api/status`)).json();
  for (const model of models) {
    assert.ok(!JSON.stringify({ body, status }).includes(model));
    assert.ok(![...result.headers.values()].some(value => value.includes(model)));
  }
});

test('fallback retains JSON compatibility handling on the next model', async () => {
  const settings = config(); const calls = [];
  const result = await getLayoutAdvice(payload(), settings, async (url, options) => {
    const model = modelFrom(url); calls.push(model);
    if (model === models[0]) return quota(model);
    const request = JSON.parse(options.body);
    if (request.generationConfig.responseFormat) return Response.json({ error: { message: 'Unknown responseFormat' } }, { status: 400 });
    assert.equal(request.generationConfig.responseMimeType, 'application/json');
    return googleResponse();
  });
  assert.deepEqual(calls, [models[0], models[1], models[1]]);
  assert.deepEqual(result, plantPlan());
});

test('invalid furniture results still fail validation instead of triggering a model downgrade', async () => {
  const calls = [];
  await assert.rejects(getLayoutAdvice(payload(), config(), async url => {
    calls.push(modelFrom(url));
    const bad = { ...plantPlan(), positions: [] };
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(bad) }] } }] });
  }), { code: 'AI_PLAN_INVALID' });
  assert.deepEqual(calls, [models[0], models[0]]);
});

test('network failures and cancellation do not cascade through models', async () => {
  let calls = 0;
  const request = createModelRequest(config(), async () => { calls++; throw new Error('offline'); });
  await assert.rejects(request({}), /offline/); assert.equal(calls, 1);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(request({ signal: controller.signal }), { name: 'AbortError' }); assert.equal(calls, 1);
});

test('a slow model times out, aborts its request and uses the next model with a fresh deadline', async () => {
  let time = 0; const calls = []; const signals = [];
  const request = createModelRequest(config(), async (url, options) => {
    const model = modelFrom(url); calls.push(model); signals.push(options.signal);
    if (model !== models[0]) return googleResponse();
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 1000);
      options.signal.addEventListener('abort', () => { clearTimeout(timer); reject(options.signal.reason); }, { once: true });
    });
  }, () => time, 10);
  assert.equal((await request({})).status, 200);
  assert.deepEqual(calls, [models[0], models[1]]);
  assert.equal(signals[0].aborted, true); assert.equal(signals[1].aborted, false);
  await request({}); assert.deepEqual(calls.slice(-1), [models[1]]);
  time = 60_000; await request({}); assert.deepEqual(calls.slice(-2), [models[0], models[1]]);
});

test('a shared request deadline or user cancellation stops fallback immediately', async () => {
  for (const reason of [new DOMException('Cancelled', 'AbortError'), new DOMException('Deadline reached', 'TimeoutError')]) {
    const controller = new AbortController(); let calls = 0;
    const request = createModelRequest(config(), async (url, options) => {
      calls++; controller.abort(reason); options.signal.throwIfAborted();
    }, () => 0, 10);
    await assert.rejects(request({ signal: controller.signal }), error => error === reason);
    assert.equal(calls, 1);
  }
});

test('a stalled response body also triggers timeout failover', async () => {
  const calls = [];
  const request = createModelRequest(config(), async (url, options) => {
    calls.push(modelFrom(url));
    if (calls.length > 1) return googleResponse();
    return new Response(new ReadableStream({ start(controller) {
      options.signal.addEventListener('abort', () => controller.error(options.signal.reason), { once: true });
    } }));
  }, () => 0, 10);
  // Keep a handle alive: production fetch sockets normally do that for us.
  const keepAlive = setTimeout(() => {}, 1000);
  try { assert.equal((await request({})).status, 200); } finally { clearTimeout(keepAlive); }
  assert.deepEqual(calls, [models[0], models[1]]);
});

test('all slow models stop with a safe timeout and respect their cooldown', async () => {
  let calls = 0;
  const request = createModelRequest(config(), async () => { calls++; throw new DOMException('Upstream slow', 'TimeoutError'); });
  await assert.rejects(request({}), { code: 'GEMINI_TIMEOUT', status: 504 });
  await assert.rejects(request({}), { code: 'GEMINI_TIMEOUT' });
  assert.equal(calls, 3);
});

test('a broken fallback transport returns the existing safe internal-error response', async t => {
  const { post } = await startApp(t, async () => null, config());
  const response = await post();
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.code, 'INTERNAL_ERROR');
  assert.ok(!JSON.stringify(body).includes(fakeConfig.apiKey));
});
