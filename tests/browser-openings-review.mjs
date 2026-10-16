import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { AI_PROTOCOL } from '../src/domain/ai.ts';
import { analyze } from '../src/domain/planner.ts';
import { dragOpening } from './drag-opening.mjs';

await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, hasTouch: true });
const base = process.env.TEST_URL || 'http://127.0.0.1:5173';
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let generationCalls = 0;
let interpretationCalls = 0;
let delayed = false;
let release;
const current = () => page.evaluate(() => JSON.parse(localStorage.getItem('dormfit.workspace.v1')));
const field = async (label, value) => { const input = page.getByLabel(label, { exact: true }); await input.fill(value); await input.press('Enter'); };

await page.route('**/api/interpret-preferences', async route => {
  interpretationCalls++;
  const body = route.request().postDataJSON();
  if (delayed) await new Promise(resolve => { release = resolve; });
  const windows = body.project.room.openings.filter(opening => opening.kind === 'window');
  await route.fulfill({ headers: { 'X-DormFit-AI-Version': AI_PROTOCOL }, json: {
    requirements: [{ itemId: 'plant-1', targetId: windows[1].id, relation: 'near' }],
    unmetRequests: ['Cannot verify sunlight.'],
  } });
});
await page.route('**/api/layout-advice', async route => {
  generationCalls++;
  const body = route.request().postDataJSON();
  const rightWindow = body.project.room.openings.find(opening => opening.kind === 'window' && opening.wall === 'right');
  assert.equal(body.review.requirements[0].targetId, rightWindow.id);
  assert.equal(body.review.requirements[1].relation, 'away');
  assert.deepEqual(body.review.unmetRequests, []);
  await route.fulfill({ headers: { 'X-DormFit-AI-Version': AI_PROTOCOL }, json: {
    positions: [{ id: 'bed-1', x: 160, y: 100, rotated: false }, { id: 'plant-1', x: 375, y: 150, rotated: false }],
    requirements: body.review.requirements, unmetRequests: [],
    explanation: 'The plant is near Window 1 on the right wall. The bed is away from the left wall.', tips: [],
  } });
});

try {
  assert.equal((await page.goto(base, { waitUntil: 'networkidle' })).status(), 200);
  await dragOpening(page, '.setup-room-preview', 'Door 1', 'left', 200);
  await field('Window 1 width', '100');
  await dragOpening(page, '.setup-room-preview', 'Window 1', 'right', 100);
  await page.getByRole('button', { name: 'Add window' }).click();
  await field('Window 2 offset', '80');
  // Enter in an opening field must not accidentally advance the room form.
  await page.getByRole('heading', { name: 'What size is your room?' }).waitFor();
  assert.equal(await page.locator('.setup-room-preview [data-opening]').count(), 3);
  await page.screenshot({ path: 'test-results/openings-setup.png', fullPage: true });
  console.log('PASS doors/windows can move to side walls, use measured offsets and include multiple windows');

  await page.getByRole('button', { name: 'Next: furniture' }).click();
  await page.getByLabel('Bed count', { exact: true }).fill('1');
  await page.getByLabel('Plant count', { exact: true }).fill('1');
  await page.getByRole('checkbox', { name: 'Create an AI layout using my notes' }).check();
  await page.getByLabel('Your room preferences').fill('Put the plant near Window 1.');
  await page.getByRole('button', { name: 'Show layouts', exact: true }).click();
  await page.getByLabel('Condition 1 target').waitFor();
  assert.equal(interpretationCalls, 1); assert.equal(generationCalls, 0);
  const target = page.getByLabel('Condition 1 target');
  const rightWindowId = await target.locator('option').filter({ hasText: 'Window 1 (right wall)' }).getAttribute('value');
  await target.selectOption(rightWindowId);
  await page.getByRole('button', { name: 'Add condition' }).click();
  await page.getByLabel('Condition 2 relation').selectOption('away');
  await page.getByLabel('Condition 2 target').selectOption('left-wall');
  await page.getByRole('button', { name: 'Remove unsupported request 1' }).click();
  await page.screenshot({ path: 'test-results/preferences-review.png', fullPage: true });
  console.log('PASS AI interpretation is reviewed and edited before any layout generation request');

  await page.getByRole('button', { name: 'Confirm & create layout' }).click();
  await page.locator('.ai-success').waitFor();
  assert.equal(generationCalls, 1);
  const saved = await current();
  assert.equal(saved.room.openings.length, 3); assert.deepEqual(analyze(saved).issues, []);
  assert.match(await page.locator('.ai-requirements').innerText(), /Window 1 \(right wall\)/);
  assert.equal(await page.getByRole('region', { name: 'AI-designed layout' }).locator('[data-layout-id="ai"]').count(), 1);
  assert.equal(await page.getByRole('region', { name: 'Algorithm layouts' }).locator('.layout-card').count(), 3);
  assert.equal(await page.getByText('DESIGNED BY GEMINI AI').isVisible(), true);
  await page.screenshot({ path: 'test-results/featured-ai-layout.png', fullPage: true });
  assert.equal(await page.locator('.canvas-panel [data-opening][data-wall="right"]').count(), 1);
  await dragOpening(page, '.canvas-panel', 'Door 1', 'bottom', 20);
  assert.equal((await current()).room.openings.find(opening => opening.kind === 'door').wall, 'bottom');
  assert.equal((await current()).room.openings.find(opening => opening.kind === 'door').offset, 20);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.deepEqual((await current()).room.openings, saved.room.openings);
  console.log('PASS main-plan opening drag is saved and a single Undo restores its starting position');
  await page.getByRole('button', { name: '3D', exact: true }).click();
  assert.equal(await page.locator('.iso-svg [data-opening]').count(), 3);
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await page.screenshot({ path: 'test-results/openings-dark-3d.png', fullPage: true });
  console.log('PASS confirmed conditions control the returned layout and openings appear in both 2D and 3D');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Generate layouts', exact: true }).click();
  await page.getByLabel('Condition 1 target').waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: 'test-results/preferences-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Back to editing' }).click();
  assert.equal(generationCalls, 1); assert.deepEqual(await current(), saved);
  delayed = true;
  await page.getByRole('button', { name: 'Generate layouts', exact: true }).click();
  await page.getByText('Reading your note… No AI layout has been generated yet.').waitFor();
  await page.getByRole('button', { name: 'Back to editing' }).click();
  if (release) release();
  assert.equal(generationCalls, 1);
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.getByLabel('Window 1 position').textContent(), 'Right wall');
  assert.equal(await page.getByLabel('Door 1 offset').inputValue(), '200');
  assert.equal(await page.getByLabel('Window 2 offset').inputValue(), '80');
  await dragOpening(page, '.setup-room-preview', 'Window 1', 'bottom', 280, { width: 420, depth: 360 }, 'touch');
  assert.equal(await page.getByLabel('Window 1 position').textContent(), 'Bottom wall');
  const touchOffset = Number(await page.getByLabel('Window 1 offset').inputValue());
  assert.ok(Math.abs(touchOffset - 280) <= 5, 'Touch placement should be within one 5 cm snap step');
  console.log('PASS touch dragging snaps a window to another wall on a mobile viewport');
  assert.deepEqual(errors, []);
  console.log('PASS mobile review, cancelling pending interpretation and reopening saved openings');
} finally {
  if (release) release();
  await browser.close();
}
