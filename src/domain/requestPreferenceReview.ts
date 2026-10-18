import type { Project } from './model';
import { AI_PROTOCOL, isPreferenceReview } from './ai';
import { getLanguage } from '../i18n';
import type { Language } from '../i18n';
import { AI_CLIENT_GRACE_MS, AI_REVIEW_TIMEOUT_MS } from './aiTiming';

export async function requestPreferenceReview(project: Project, prompt: string, signal: AbortSignal, language: Language = getLanguage()) {
  const response = await fetch('/api/interpret-preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project, prompt, language }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(AI_REVIEW_TIMEOUT_MS + AI_CLIENT_GRACE_MS)]),
  });
  let body: unknown;
  try { body = await response.json(); } catch { throw new Error('Could not read the preference review. Check that the backend is running.'); }
  if (!response.ok) {
    const error = (body as { error?: unknown })?.error;
    throw new Error(typeof error === 'string' && error.length <= 300 ? error : 'Could not interpret preferences. Try again or add conditions manually.');
  }
  if (response.headers.get('X-DormFit-AI-Version') !== AI_PROTOCOL) throw new Error('An old or incompatible backend is running. Restart it with npm run dev.');
  if (!isPreferenceReview(body, project) || (!body.requirements.length && !body.unmetRequests.length)) throw new Error('AI returned an invalid preference review. Add conditions manually or try a simpler note.');
  return body;
}
