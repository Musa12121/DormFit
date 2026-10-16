import { describe, it, expect, vi } from 'vitest';
import { requestAiPlan } from '../../src/domain/requestAiPlan';
import { AI_PROTOCOL } from '../../src/domain/ai';
import { project, aiPlan } from './fixtures';

const request = (signal = new AbortController().signal) =>
  requestAiPlan(project(), 'Place the plant near the window.', signal);
function response(body: unknown = aiPlan(), status = 200, version = AI_PROTOCOL) {
  return Response.json(body, { status, headers: { 'X-DormFit-AI-Version': version } });
}
function mock(result: Response) { const fetch = vi.fn().mockResolvedValue(result); vi.stubGlobal('fetch', fetch); return fetch; }

describe('browser AI requests', () => {
  it('sends the project, note and response language to the local endpoint; applies returned coordinates', async () => {
    const fetch = mock(response()); const result = await request();
    expect(fetch).toHaveBeenCalledOnce();
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('/api/layout-advice'); expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ project: project(), prompt: 'Place the plant near the window.', language: 'en' });
    expect(options.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(result.layout.project.furniture.find((item) => item.id === 'plant-1')?.y).toBe(10);
  });
  it('shows a safe provider error code alongside its explanation', async () => {
    mock(response({ error: 'The request limit has been reached.', code: 'GEMINI_QUOTA' }, 429));
    await expect(request()).rejects.toThrow('The request limit has been reached. (GEMINI_QUOTA)');
  });
  it('shows the local AI limit and wait time without retrying automatically', async () => {
    const message = 'AI request limit reached. Try again in 45 seconds. Regular layouts are still available.';
    const fetch = mock(response({ error: message, code: 'AI_RATE_LIMIT', retryAfter: 45 }, 429));
    await expect(request()).rejects.toThrow(`${message} (AI_RATE_LIMIT)`);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('does not echo arbitrary strings in an error-code field', async () => {
    mock(response({ error: 'Error.', code: 'do not echo this private-looking string!' }, 502));
    await expect(request()).rejects.toThrow(/^Error\.$/);
  });
  it('gives restart instructions for comparison-only or outdated backends', async () => {
    mock(response({ recommendedId: 'balanced' }, 200, 'old-version'));
    await expect(request()).rejects.toThrow(/An old or incompatible backend/);
  });
  it('rejects a claimed near-window placement that is actually far away', async () => {
    const plan = aiPlan(); plan.positions[1].x = 330; plan.positions[1].y = 300; mock(response(plan));
    await expect(request()).rejects.toThrow(/failed size and placement validation/);
  });
  it('rejects invented furniture IDs even when the response has the right version', async () => {
    const plan = aiPlan(); plan.positions[0].id = 'invented'; mock(response(plan));
    await expect(request()).rejects.toThrow(/failed size and placement validation/);
  });
  it('rejects HTML or malformed JSON without printing the response body', async () => {
    mock(new Response('<html>private-looking provider output</html>', { status: 502 }));
    await expect(request()).rejects.toThrow('Could not read the backend response.');
  });
  it('gives a useful network failure instead of raw transport details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('secret-looking transport details')));
    await expect(request()).rejects.toThrow(/Could not reach AI/);
  });
  it('lets cancellation propagate so late requests cannot replace manual choices', async () => {
    const controller = new AbortController(); const error = new DOMException('Aborted', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error)); controller.abort();
    await expect(request(controller.signal)).rejects.toBe(error);
  });
  it('handles an error response without an error message', async () => {
    mock(response(null, 500)); await expect(request()).rejects.toThrow('No AI response was received.');
  });
  it('preserves the disclosure for coordinates repaired by the backend', async () => {
    const plan = aiPlan(); plan.adjusted = true; mock(response(plan));
    expect((await request()).plan.adjusted).toBe(true);
  });
});
