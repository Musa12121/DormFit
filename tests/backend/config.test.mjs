import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadGeminiConfig } from '../../server/loadConfig.mjs';
import { geminiConfig as defaults } from '../../server/config.example.mjs';
import { startApp } from './helpers.mjs';

// Every settings file is an isolated test fixture; never open the user's config.
async function settings(t, source) {
  const folder = await mkdtemp(join(tmpdir(), 'dormfit-config-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const file = join(folder, 'settings.mjs');
  if (source !== undefined) await writeFile(file, source);
  return pathToFileURL(file);
}

test('missing settings use empty-key defaults without creating a private file', async t => {
  const url = await settings(t);
  const result = await loadGeminiConfig(url);
  assert.deepEqual(result, defaults);
  assert.equal(result.apiKey, '');
  await assert.rejects(access(url), { code: 'ENOENT' });
  result.apiKey = 'fake-key';
  assert.equal(defaults.apiKey, '');
});

test('valid private settings override defaults', async t => {
  const url = await settings(t, "export const geminiConfig = { apiKey: 'fake-key', model: 'fake-model' };");
  assert.deepEqual(await loadGeminiConfig(url), { apiKey: 'fake-key', model: 'fake-model' });
});

test('an existing empty key is accepted for regular layouts', async t => {
  const url = await settings(t, "export const geminiConfig = { apiKey: '', model: 'fake-model' };");
  assert.equal((await loadGeminiConfig(url)).apiKey, '');
});

for (const source of [
  "export const geminiConfig = { apiKey: 'fake-secret-marker', model: ; };",
  "export const geminiConfig = { apiKey: 123, model: 'fake-secret-marker' };",
  "export const geminiConfig = { apiKey: 'fake-secret-marker' };",
  'export const geminiConfig = null;',
  'export const differentName = {};',
  "throw new Error('fake-secret-marker');",
  "import './missing-dependency.mjs'; export const geminiConfig = {};",
]) {
  test(`existing invalid settings fail safely (${source.slice(0, 35)})`, async t => {
    const url = await settings(t, source);
    await assert.rejects(loadGeminiConfig(url), error => {
      assert.equal(error.message, 'Could not read backend settings. Check the syntax and setting names in config.local.mjs.');
      assert.doesNotMatch(error.stack, /fake-secret-marker/);
      return true;
    });
  });
}

test('a fresh-clone backend serves status and returns a safe no-key AI response', async t => {
  const config = await loadGeminiConfig(await settings(t));
  let calls = 0;
  const { post, base } = await startApp(t, async () => { calls++; throw new Error('No network call should occur'); }, config);
  assert.equal((await fetch(`${base}/api/status`)).status, 200);
  const response = await post();
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /No Gemini key has been added/);
  assert.equal(calls, 0);
});
