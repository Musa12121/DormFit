import { access } from 'node:fs/promises';
import { geminiConfig as defaults } from './config.example.mjs';
import { validModelSettings } from './modelPolicy.mjs';

export async function loadGeminiConfig(configUrl = new URL('./config.local.mjs', import.meta.url)) {
  try {
    try {
      await access(configUrl);
    } catch (error) {
      // A fresh clone can run without creating a private settings file.
      if (error.code === 'ENOENT') return { ...defaults, models: [...defaults.models] };
      throw error;
    }

    const { geminiConfig } = await import(configUrl.href);
    if (typeof geminiConfig?.apiKey !== 'string' || !validModelSettings(geminiConfig)) {
      throw new Error('Invalid settings');
    }
    return geminiConfig;
  } catch {
    // Syntax errors can contain source lines with a key. Never forward them.
    throw new Error('Could not read backend settings. Check the syntax and setting names in config.local.mjs.');
  }
}
