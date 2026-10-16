import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { defaultProject } from '../src/domain/model.ts';
import { generateLayouts } from '../src/domain/planner.ts';
import { AI_PROTOCOL } from '../src/domain/ai.ts';
import { orientation } from '../src/domain/rotation.ts';

await mkdir('test-results', { recursive: true });
const source = defaultProject();
source.room = { width: 300, depth: 500, door: 85, window: 155, openings: [
  { id: 'opening-entry', kind: 'door', wall: 'top', offset: 45, width: 85 },
  { id: 'opening-window', kind: 'window', wall: 'bottom', offset: 105, width: 155 },
] };
source.furniture = [
  ['bed', 'double-bed', 130, 15, 160, 200], ['drawers', 'dresser', 15, 95, 100, 50],
  ['bedside', 'nightstand', 85, 145, 45, 40], ['wardrobe', 'wardrobe', 210, 215, 80, 55],
  ['desk', 'desk', 15, 425, 120, 50], ['plant', 'plant', 240, 460, 35, 35],
].map(([id, kind, x, y, width, depth]) => ({ id, name: id, kind, x, y, width, depth, owner: 'shared', ...orientation(0) }));
const proposal = project => ({ positions: project.furniture.map(({ id, x, y, rotation }) => ({ id, x, y, rotation })),
  requirements: [], unmetRequests: [], explanation: 'AI layout with an open entrance.', tips: [] });
const valid = generateLayouts(source).find(layout => layout.issueCount === 0);
assert.ok(valid);
let reject = true;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/api/layout-advice', route => {
  const request = route.request().postDataJSON();
  const result = proposal(reject ? source : valid.project);
  // The setup form assigns fresh IDs. Simulate Gemini using those actual IDs.
  result.positions.forEach((position, index) => {
    position.id = request.project.furniture.find(item => item.kind === source.furniture[index].kind).id;
  });
  return route.fulfill({ headers: { 'X-DormFit-AI-Version': AI_PROTOCOL }, json: result });
});
await page.route('**/api/interpret-preferences', () => assert.fail('An empty note must not make an interpretation request'));
const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('dormfit.workspace.v1')));
const begin = async () => {
  await page.getByRole('button', { name: 'Next: furniture', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Create an AI layout using my notes' }).check();
  await page.getByRole('button', { name: 'Show layouts', exact: true }).click();
};
try {
  await page.goto(process.env.TEST_URL || 'http://127.0.0.1:5173');
  await page.evaluate(project => localStorage.setItem('dormfit.workspace.v1', JSON.stringify(project)), source);
  await page.reload(); await begin();
  await page.getByText('AI layout failed — showing regular layouts', { exact: true }).waitFor();
  console.log('PASS entrance-blocking AI output is rejected in the browser');
  reject = false;
  await page.evaluate(project => localStorage.setItem('dormfit.workspace.v1', JSON.stringify(project)), source);
  await page.reload(); await begin();
  await page.getByText('AI layout with an open entrance.', { exact: true }).waitFor();
  assert.equal(await page.locator('.canvas-panel [data-door-part="landing"]').count(), 1);
  await page.locator('.canvas-panel').screenshot({ path: 'test-results/entrance-clear-ai.png' });
  console.log('PASS valid AI positions preserve the entrance landing and walking access');
  const bedId = (await saved()).furniture.find(item => item.kind === 'double-bed').id;
  const bed = page.locator(`.canvas-panel [data-furniture="${bedId}"]`);
  await bed.focus();
  const initial = (await saved()).furniture.find(item => item.id === bedId).rotation;
  for (let turn = 1; turn <= 4; turn++) {
    await bed.press('r');
    const angle = (initial + turn * 90) % 360;
    const stored = (await saved()).furniture.find(item => item.id === bedId);
    assert.equal(stored.rotation, angle);
    assert.equal(stored.width, 160); assert.equal(stored.depth, 200);
    assert.equal(await bed.locator(':scope > g').first().getAttribute('data-rotation'), String(angle));
    await page.locator('.canvas-panel').screenshot({ path: `test-results/room-rotation-${angle}.png` });
  }
  console.log('PASS four keyboard rotations change facing, preserve sizes and save all angles');
  await page.getByRole('button', { name: '3D', exact: true }).click();
  const isoBed = page.locator(`.iso-svg [data-furniture="${bedId}"]`);
  assert.equal(await isoBed.getAttribute('data-rotation'), String(initial));
  await page.locator('.canvas-panel').screenshot({ path: 'test-results/entrance-clear-3d.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  console.log('PASS isometric facing and narrow-screen layout remain correct without browser errors');
} finally { await browser.close(); }
