// Public policy, containing no credentials. Listed models offer an API free
// tier; actual access and billing still depend on the Google project's tier.
export const DEFAULT_GEMINI_MODELS = Object.freeze([
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
]);

const validModel = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(value);
export function validModelSettings(config) {
  return !!config && validModel(config.model) && (config.models === undefined
    || (Array.isArray(config.models) && config.models.length >= 1 && config.models.length <= 5
      && config.models.every(validModel) && new Set(config.models).size === config.models.length));
}

export function modelOrder(config) {
  if (!validModelSettings(config)) throw new Error('Invalid model settings');
  if (config.models) return [...config.models];
  // Existing settings using a default model get the new policy without editing
  // the private key file. Preserve an explicitly configured custom model.
  return DEFAULT_GEMINI_MODELS.includes(config.model) ? [...DEFAULT_GEMINI_MODELS] : [config.model];
}
