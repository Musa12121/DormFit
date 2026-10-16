import { once } from 'node:events';
import { createApp } from '../../server/app.mjs';
import { plantProject, plantPlan } from '../ai-fixtures.mjs';

export const fakeConfig = { apiKey: 'fake-key-for-tests-only', model: 'fake-model' };
export const payload = () => ({ project: plantProject(), prompt: 'Place the plant near the window.' });
export const googleResponse = () => Response.json({
  candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(plantPlan()) }] } }],
});

export async function startApp(t, fetchImpl = async () => googleResponse(), config = fakeConfig, options = {}) {
  const server = createApp(config, fetchImpl, options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body = payload(), headers = {}) => fetch(`${base}/api/layout-advice`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
  return { base, post, server };
}
