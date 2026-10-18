import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { plantProject, plantPlan } from './ai-fixtures.mjs';
import { AI_PROTOCOL, requirementDistance } from '../src/domain/ai.ts';

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1512, height: 1080 } });
const base = process.env.TEST_URL || 'http://127.0.0.1:5173';
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.addInitScript((project) => {
    localStorage.setItem('dormfit.workspace.v1', JSON.stringify(project));
  }, plantProject());
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Next: furniture', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Create an AI layout' }).check();
  const nearPrompt = 'Place the plant near the window.';
  let expectedPrompt = nearPrompt;
  await page.getByLabel('Your room preferences', { exact: true }).fill(expectedPrompt);

  let mode = 'success';
  let pending;
  let markDelayed;
  let markFinished;
  await page.route('**/api/interpret-preferences', async (route) => {
    assert.equal(route.request().postDataJSON().prompt, expectedPrompt);
    const { requirements } = plantPlan();
    if (mode === 'away') requirements[0].relation = 'away';
    await route.fulfill({ headers: { 'X-DormFit-AI-Version': AI_PROTOCOL }, json: { requirements, unmetRequests: [] } });
  });
  await page.route('**/api/layout-advice', async (route) => {
    const body = route.request().postDataJSON();
    assert.equal(body.prompt, expectedPrompt);
    assert.equal(body.apiKey, undefined);
    if (mode === 'delayed') await new Promise((resolve) => {
      pending = resolve;
      markDelayed();
    });
    if (mode === 'failure') {
      await route.fulfill({ status: 503, json: { error: 'No Gemini key has been added.' } });
    } else {
      const plan = plantPlan();
      if (mode === 'away' || mode === 'invalid') {
        plan.positions[2].x = 330;
        plan.positions[2].y = 300;
      }
      if (mode === 'away') {
        plan.requirements[0].relation = 'away';
        plan.explanation = 'The plant is placed away from the window.';
      }
      if (mode === 'partial') plan.unmetRequests = ['Could not verify the exact walkway width with this layout.'];
      if (mode === 'adjusted') plan.adjusted = true;
      if (mode === 'legacy') {
        await route.fulfill({ json: {
          recommendedId: 'balanced', explanation: 'Old comparison-only response', tips: [],
        } });
      } else {
        await route.fulfill({ headers: { 'X-DormFit-AI-Version': AI_PROTOCOL }, json: plan });
      }
      if (mode === 'delayed') markFinished();
    }
  });
  const generate = async () => {
    const submit = page.getByRole('button', { name: 'Show layouts', exact: true });
    if (await submit.count()) await submit.click();
    else await page.getByRole('button', { name: 'Generate layouts', exact: true }).click();
    await page.getByLabel('Condition 1 target').waitFor();
    await page.getByRole('button', { name: 'Confirm & create layout' }).click();
  };
  const workspace = () => page.evaluate(() => JSON.parse(localStorage.getItem('dormfit.workspace.v1')));

  await generate();
  await page.locator('.ai-success').waitFor();
  assert.equal(await page.locator('.layout-card').count(), 4);
  assert.match(await page.locator('.layout-card.active').textContent(), /Gemini layout/);
  assert.match(await page.locator('.ai-requirements').textContent(), /plant.*window.*near/i);
  const near = await workspace();
  assert.equal(near.furniture.find((item) => item.id === 'plant-1').y, 10);
  assert.ok(requirementDistance(near, plantPlan().requirements[0]) <= 60);
  await page.screenshot({ path: 'test-results/ai-desktop.png', fullPage: true });
  console.log('PASS plant note changes actual coordinates, with a separate AI layout and checked requirement');

  await page.locator('[data-layout-id="balanced"]').click();
  await page.locator('.ai-selection-note').waitFor();
  assert.match(await page.locator('.layout-card.active').textContent(), /Regular layout/);
  await page.locator('[data-layout-id="ai"]').click();
  assert.equal(await page.locator('.ai-selection-note').count(), 0);
  console.log('PASS local alternatives are clearly separated from the note-based AI plan');

  expectedPrompt = 'Place the plant away from the window.';
  mode = 'away';
  await page.getByLabel('Your room preferences', { exact: true }).fill(expectedPrompt);
  assert.equal(await page.locator('[data-layout-id="ai"]').count(), 0);
  await generate();
  await page.locator('.ai-success').waitFor();
  const away = await workspace();
  assert.equal(away.furniture.find((item) => item.id === 'plant-1').y, 300);
  assert.ok(requirementDistance(away, { itemId: 'plant-1', targetId: 'window', relation: 'away' }) >= 100);
  console.log('PASS opposite note produces a different placement; old advice is cleared');

  expectedPrompt = nearPrompt;
  await page.getByLabel('Your room preferences', { exact: true }).fill(expectedPrompt);

  mode = 'failure';
  await generate();
  await page.locator('.ai-fallback').waitFor();
  assert.match(await page.locator('.ai-fallback').textContent(), /key/);
  assert.equal(await page.locator('.layout-card').count(), 3);
  console.log('PASS missing key preserves local plans');

  mode = 'legacy';
  await generate();
  await page.locator('.ai-fallback').waitFor();
  const legacyMessage = await page.locator('.ai-fallback').textContent();
  assert.match(legacyMessage, /An old or incompatible backend/);
  assert.match(legacyMessage, /Ctrl\+C/);
  assert.match(legacyMessage, /npm run dev/);
  assert.equal((legacyMessage.match(/do not use your written notes/g) ?? []).length, 1);
  console.log('PASS old comparison backend produces restart instructions without duplicate fallback text');

  mode = 'invalid';
  await generate();
  await page.locator('.ai-fallback').waitFor();
  assert.match(await page.locator('.ai-fallback').textContent(), /failed size and placement validation/);
  assert.equal(await page.locator('[data-layout-id="ai"]').count(), 0);
  console.log('PASS claiming plant/window compliance without matching coordinates is rejected');

  mode = 'delayed';
  const delayedReached = new Promise((resolve) => { markDelayed = resolve; });
  const delayedFinished = new Promise((resolve) => { markFinished = resolve; });
  await generate();
  await page.locator('.ai-loading').waitFor();
  await delayedReached;
  assert.match(await page.locator('.ai-loading').textContent(), /do not use your notes/);
  await page.locator('.layout-card').nth(2).click();
  const chosen = await page.locator('.layout-card.active strong').textContent();
  pending();
  await delayedFinished;
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.getByRole('button', { name: 'Generate layouts', exact: true }).waitFor();
  assert.equal(await page.locator('.layout-card.active strong').textContent(), chosen);
  assert.equal(await page.locator('.ai-success').count(), 0);
  console.log('PASS choosing a local plan cancels a pending AI layout');

  mode = 'success';
  await generate();
  await page.locator('.ai-success').waitFor();
  await page.locator('.canvas-panel [data-furniture="bed-1"]').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('.ai-success').count(), 0);
  console.log('PASS editing geometry clears stale AI advice');

  mode = 'partial';
  await generate();
  await page.locator('.ai-unmet').waitFor();
  assert.match(await page.locator('.layout-card.active').textContent(), /partially matched/);
  console.log('PASS unfulfilled requests remain visible and the AI plan is labelled partial');

  mode = 'adjusted';
  await generate();
  await page.locator('.ai-success').waitFor();
  assert.match(await page.locator('.ai-success').textContent(), /adjusted the positions to fit the room/);
  assert.match(await page.locator('.layout-card.active').textContent(), /adjusted to fit the room/);
  console.log('PASS locally adjusted AI plans disclose the repair while preserving the checked note');

  mode = 'success';
  await page.setViewportSize({ width: 390, height: 844 });
  await generate();
  await page.locator('.ai-success').waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: 'test-results/ai-mobile.png', fullPage: true });
  console.log('PASS mobile AI controls and explanation fit viewport');
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
