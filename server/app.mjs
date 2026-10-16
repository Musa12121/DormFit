import { createServer } from 'node:http';
import { ApiError, getLayoutAdvice, getPreferenceReview } from './gemini.mjs';
import { AI_PROTOCOL } from '../src/domain/ai.ts';
import { createAiLimiter } from './aiLimits.mjs';

async function readJson(request) {
  if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
    throw new ApiError(415, 'Send JSON data.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64_000) throw new ApiError(413, 'The request data is too large.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ApiError(400, 'Could not read the JSON data.');
  }
}

function isLocalOrigin(origin) {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  } catch {
    return false;
  }
}

// The config is injected so tests can run with a fake key and a mocked Google response.
export function createApp(config, fetchImpl = fetch, options = {}) {
  const takeAiCall = createAiLimiter(options.limits, options.now);
  const limitedFetch = (...args) => {
    takeAiCall();
    return fetchImpl(...args);
  };
  let activeRequests = 0;
  let lastFailure = null;
  return createServer(async (request, response) => {
    const send = (status, body) => {
      if (response.destroyed) return;
      response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-DormFit-AI-Version': AI_PROTOCOL,
      });
      response.end(JSON.stringify(body));
    };
    if (request.url === '/api/status' && request.method === 'GET') {
      // Metadata only: no key, model configuration, prompt, furniture or raw Google response.
      send(200, { aiProtocol: AI_PROTOCOL, lastFailure });
      return;
    }
    if (!['/api/layout-advice', '/api/interpret-preferences'].includes(request.url)) {
      send(404, { error: 'This address does not exist.' });
      return;
    }
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      send(405, { error: 'Only POST requests are accepted.' });
      return;
    }
    if (!isLocalOrigin(request.headers.origin)) {
      send(403, { error: 'This request origin is not allowed.' });
      return;
    }
    if (activeRequests >= 2) {
      send(429, { error: 'Wait for the previous request to finish.' });
      return;
    }
    activeRequests++;
    const controller = new AbortController();
    response.on('close', () => controller.abort());
    try {
      const payload = await readJson(request);
      const handler = request.url === '/api/interpret-preferences' ? getPreferenceReview : getLayoutAdvice;
      const advice = await handler(payload, config, limitedFetch, controller.signal);
      lastFailure = null;
      send(200, advice);
    } catch (error) {
      if (error instanceof ApiError && error.retryAfter) {
        response.setHeader('Retry-After', error.retryAfter);
      }
      lastFailure = {
        code: error instanceof ApiError ? error.code : 'INTERNAL_ERROR',
        upstreamStatus: error instanceof ApiError ? error.upstreamStatus : null,
        at: new Date().toISOString(),
        ...(error instanceof ApiError && error.checks?.length ? { checks: error.checks } : {}),
      };
      send(error instanceof ApiError ? error.status : 500, {
        error: error instanceof ApiError ? error.message : 'Could not complete the request.',
        code: lastFailure.code,
        upstreamStatus: lastFailure.upstreamStatus,
        ...(error instanceof ApiError && error.retryAfter ? { retryAfter: error.retryAfter } : {}),
        ...(lastFailure.checks ? { checks: lastFailure.checks } : {}),
      });
    } finally {
      activeRequests--;
    }
  });
}
