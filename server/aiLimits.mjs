import { ApiError } from './geminiErrors.mjs';

// Shared by every visitor, tab and AI endpoint on this backend.
export const AI_LIMITS = { perMinute: 10, perDay: 100 };

export function createAiLimiter(limits = AI_LIMITS, now = Date.now) {
  if (![limits.perMinute, limits.perDay].every(value => Number.isInteger(value) && value > 0)) {
    throw new Error('AI limits must be positive whole numbers.');
  }
  let recentCalls = [];
  let day = '';
  let dailyCalls = 0;

  return function takeAiCall() {
    const time = now();
    const today = new Date(time).toISOString().slice(0, 10);
    if (today !== day) {
      day = today;
      dailyCalls = 0;
    }
    recentCalls = recentCalls.filter(start => time - start < 60_000);

    let wait = 0;
    let daily = false;
    if (dailyCalls >= limits.perDay) {
      wait = Date.parse(`${day}T00:00:00Z`) + 86_400_000 - time;
      daily = true;
    } else if (recentCalls.length >= limits.perMinute) {
      wait = recentCalls[0] + 60_000 - time;
    }
    if (wait > 0) {
      const seconds = Math.max(1, Math.ceil(wait / 1000));
      const message = daily ? 'Daily AI request limit reached.' : 'AI request limit reached.';
      const error = new ApiError(429,
        `${message} Try again in ${seconds} seconds. Regular layouts are still available.`,
        daily ? 'AI_DAILY_LIMIT' : 'AI_RATE_LIMIT');
      error.retryAfter = seconds;
      throw error;
    }

    // Reserve before sending; failures and retries also consume Gemini quota.
    recentCalls.push(time);
    dailyCalls++;
  };
}
