import { DEFAULT_GEMINI_MODELS } from './modelPolicy.mjs';

// These defaults let a fresh clone run without AI or a private settings file.
// To enable AI, copy this file to config.local.mjs and fill in your key there.
export const geminiConfig = {
  // Paste your Gemini API key only between the quotes in config.local.mjs.
  apiKey: '',
  model: DEFAULT_GEMINI_MODELS[0],
  // Priority order; no model information is shown in the interface.
  models: [...DEFAULT_GEMINI_MODELS],
};
