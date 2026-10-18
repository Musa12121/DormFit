import type { Project } from './model';
import { AI_PROTOCOL, checkAiPlan } from './ai';
import type { PreferenceReview } from './ai';
import { getLanguage } from '../i18n';
import type { Language } from '../i18n';
import { AI_CLIENT_GRACE_MS, AI_LAYOUT_TIMEOUT_MS } from './aiTiming';

export async function requestAiPlan(
  project: Project,
  prompt: string,
  signal: AbortSignal,
  review?: PreferenceReview,
  language: Language = getLanguage(),
) {
  let response: Response;
  try {
    response = await fetch('/api/layout-advice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project, prompt, language, ...(review ? { review } : {}) }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(AI_LAYOUT_TIMEOUT_MS + AI_CLIENT_GRACE_MS)]),
    });
  } catch (error) {
    if (signal.aborted) throw error;
    if (error && typeof error === 'object' && 'name' in error && error.name === 'TimeoutError') {
      throw new Error('Gemini took too long to respond. (GEMINI_TIMEOUT)');
    }
    throw new Error('Could not reach AI. Make sure the backend is running with npm run dev.');
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error('Could not read the backend response. Regular layouts are still available.');
  }
  if (!response.ok) {
    const message = (body as { error?: unknown })?.error;
    const code = (body as { code?: unknown })?.code;
    const suffix = typeof code === 'string' && /^[A-Z][A-Z0-9_]{2,50}$/.test(code)
      ? ` (${code})` : '';
    throw new Error(
      typeof message === 'string' && message.length <= 300
        ? message + suffix
        : 'No AI response was received. Regular layouts are still available.',
    );
  }
  if (response.headers.get('X-DormFit-AI-Version') !== AI_PROTOCOL) {
    throw new Error('An old or incompatible backend is running. Stop it with Ctrl+C, then restart it with npm run dev.');
  }
  const checked = checkAiPlan(body, project, prompt, review);
  if (!checked.ok) {
    throw new Error('The AI layout failed size and placement validation.');
  }
  return { plan: checked.plan, layout: checked.layout };
}
