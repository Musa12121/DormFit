import { createApp } from './app.mjs';
import { loadGeminiConfig } from './loadConfig.mjs';

// A config syntax error must not print a source line containing the private key.
let geminiConfig;
try {
  geminiConfig = await loadGeminiConfig();
} catch {
  console.error('Could not read backend settings. Check the syntax and setting names in config.local.mjs.');
  process.exit(1);
}

const server = createApp(geminiConfig);
server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE'
    ? 'Port 3001 is busy. Stop the previous DormFit backend process.'
    : 'Could not start the DormFit backend.');
  process.exitCode = 1;
});
server.listen(3001, '127.0.0.1', () => {
  console.log('DormFit backend: http://127.0.0.1:3001');
  console.log(geminiConfig.apiKey.trim()
    ? 'Gemini is configured. The key will be checked on the first request.'
    : 'The Gemini key is empty. Add it to server/config.local.mjs to use AI.');
});
