// Server budgets include format/geometry retries and model failover. The
// browser waits a little longer so it can display the server's useful error.
export const AI_LAYOUT_TIMEOUT_MS = 95_000;
export const AI_REVIEW_TIMEOUT_MS = 50_000;
export const AI_MODEL_TIMEOUT_MS = 35_000;
export const AI_CLIENT_GRACE_MS = 5_000;
