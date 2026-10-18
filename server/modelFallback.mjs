import { ApiError, geminiError } from './geminiErrors.mjs';
import { modelOrder } from './modelPolicy.mjs';
import { AI_MODEL_TIMEOUT_MS } from '../src/domain/aiTiming.ts';
import { setTimeout as pause } from 'node:timers/promises';

const clients = new WeakMap();

// One state per backend/config and fetch transport. Preference interpretation,
// JSON retries and layout generation all share the same model cooldowns.
export function modelRequest(config, fetchImpl) {
  let transports = clients.get(config);
  if (!transports) { transports = new WeakMap(); clients.set(config, transports); }
  let request = transports.get(fetchImpl);
  if (!request) { request = createModelRequest(config, fetchImpl); transports.set(fetchImpl, request); }
  return request;
}

function nextPacificMidnight(time) {
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' });
  const today = formatter.format(time);
  // Binary-search the date change, including 23/25-hour daylight-saving days.
  let low = time, high = time + 26 * 60 * 60 * 1000;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (formatter.format(middle) === today) low = middle; else high = middle;
  }
  return high;
}

export function createModelRequest(config, fetchImpl, now = () => Date.now(), attemptTimeoutMs = AI_MODEL_TIMEOUT_MS,
  wait = (ms, signal) => pause(ms, undefined, { signal })) {
  const models = modelOrder(config);
  const blocked = new Map();
  const cooldownError = () => {
    const earliest = [...blocked.values()].reduce((a, b) => a.until < b.until ? a : b);
    const error = new ApiError(earliest.error.status, earliest.error.message, earliest.error.code, earliest.error.upstreamStatus);
    if (['GEMINI_QUOTA', 'GEMINI_UNAVAILABLE'].includes(error.code)) error.retryAfter = Math.max(1, Math.ceil((earliest.until - now()) / 1000));
    return error;
  };
  return async options => {
    options.signal?.throwIfAborted();
    const time = now();
    const available = models.filter(model => !blocked.has(model) || blocked.get(model).until <= time);
    if (!available.length) throw cooldownError();
    // Try each eligible model once. Only a temporary server failure on the
    // last model gets one extra attempt, after a short, cancellable wait.
    let retryDelay;
    for (const [index, model] of [...available, available.at(-1)].entries()) {
      options.signal?.throwIfAborted();
      if (index === available.length) {
        if (!retryDelay) break;
        await wait(retryDelay, options.signal);
        options.signal?.throwIfAborted();
      }
      // fetchImpl is the app's limited transport, so every attempted model counts.
      const deadline = AbortSignal.timeout(attemptTimeoutMs);
      const attemptSignal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
      let response;
      try {
        response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { ...options, signal: attemptSignal });
        // Keep the deadline through the response body, not just its headers.
        if (response instanceof Response) {
          const body = await response.arrayBuffer();
          response = new Response([204, 205, 304].includes(response.status) ? null : body,
            { status: response.status, statusText: response.statusText, headers: response.headers });
        }
      } catch (error) {
        options.signal?.throwIfAborted();
        if (!deadline.aborted && error?.name !== 'TimeoutError') throw error;
        blocked.set(model, { until: now() + 60_000,
          error: new ApiError(504, 'Gemini took too long to respond.', 'GEMINI_TIMEOUT') });
        continue;
      }
      // Let the caller handle a broken injected transport as an internal error,
      // rather than misclassifying it as a provider/network failure.
      if (!response || typeof response.ok !== 'boolean' || response.ok) {
        blocked.delete(model);
        return response;
      }
      const error = await geminiError(response.clone(), model);
      const quota = error.code === 'GEMINI_QUOTA' && error.quotaScope === 'model';
      const unavailable = error.code === 'GEMINI_MODEL_NOT_FOUND';
      const temporary = error.code === 'GEMINI_UNAVAILABLE' && [500, 502, 503, 504].includes(response.status);
      // Unknown/shared quotas and credential/billing/other failures are not a
      // reason to issue more requests against the same Google project.
      if ((!quota && !unavailable && !temporary) || (models.length === 1 && !temporary)) {
        blocked.delete(model);
        return response;
      }
      const failedAt = now();
      const delay = temporary ? Math.max(30, error.retryAfter ?? 0) * 1000
        : quota ? (error.retryAfter ?? 60) * 1000 : 60 * 60 * 1000;
      const until = quota && error.quotaWindow === 'day'
        ? Math.max(failedAt + delay, nextPacificMidnight(failedAt)) : failedAt + delay;
      blocked.set(model, { until, error });
      // Respect longer provider delays by returning a retry time instead of
      // holding the browser open or repeatedly hitting a busy service.
      if (temporary && index === available.length - 1 && (error.retryAfter ?? 1) <= 2) {
        retryDelay = (error.retryAfter ?? 1) * 1000;
      }
    }
    throw cooldownError();
  };
}
