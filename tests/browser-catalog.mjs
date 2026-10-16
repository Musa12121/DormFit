import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { catalog, furnitureLabels } from '../src/domain/model.ts';
import { analyze } from '../src/domain/planner.ts';

await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
let apiCalls = 0;
await page.route('**/api/**', async route => { apiCalls++; await route.fulfill({ status: 503, json: { error: 'AI is not used in this test.' } }); });
const current = () => page.evaluate(() => JSON.parse(localStorage.getItem('dormfit.workspace.v1')));
try {
  await page.goto(process.env.TEST_URL || 'http://127.0.0.1:5173', { waitUntil: 'networkidle' });
  await page.getByLabel('Room width', { exact: true }).fill('12');
  await page.getByLabel('Room length', { exact: true }).fill('10');
  await page.getByRole('button', { name: 'Next: furniture' }).click();
  assert.equal(await page.locator('.quantity-card').count(), 24);
  for (const entry of catalog) await page.getByLabel(`${furnitureLabels[entry.kind]} count`, { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Show layouts', exact: true }).click();
  await page.locator('.layout-card').first().waitFor();
  assert.equal(await page.locator('.layout-card').count(), 3);
  assert.equal((await current()).furniture.length, 24);
  assert.deepEqual(analyze(await current()).issues, []);
  console.log('PASS all 24 types can be chosen together and generate valid layouts');

  const newTypes = catalog.filter(entry => !['bed', 'desk', 'wardrobe', 'shelf', 'plant', 'rug'].includes(entry.kind));
  for (const entry of newTypes) assert.equal(await page.locator(`.canvas-panel [data-shape="${entry.kind}"]`).count(), 1);
  await page.locator('.canvas-panel [data-furniture="sofa-1"]').click();
  const before = (await current()).furniture.find(item => item.kind === 'sofa');
  await page.getByLabel('Furniture width', { exact: true }).fill('190');
  await page.getByLabel('Furniture width', { exact: true }).press('Enter');
  assert.equal((await current()).furniture.find(item => item.kind === 'sofa').width, 190);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.deepEqual((await current()).furniture.find(item => item.kind === 'sofa'), before);
  await page.screenshot({ path: 'test-results/catalog-2d.png', fullPage: true });
  console.log('PASS new furniture has distinct 2D drawings and supports resizing with undo');

  await page.getByRole('button', { name: '3D', exact: true }).click();
  for (const entry of newTypes) assert.equal(await page.locator(`.iso-svg [data-shape="iso-${entry.kind}"]`).count(), 1);
  assert.equal(await page.locator('.iso-svg [data-shape="iso-bunk-bed"] [data-bed-part="mattress"]').count(), 2);
  // Tall furniture may occlude the chair in a dense isometric scene. The
  // keyboard selection must still reach it without clicking through a cupboard.
  const officeChair = page.getByRole('button', { name: 'Select Office chair 1', exact: true });
  await officeChair.focus(); await officeChair.press('Enter');
  assert.equal(await page.getByLabel('Furniture width', { exact: true }).inputValue(), '65');
  await page.screenshot({ path: 'test-results/catalog-3d.png', fullPage: true });
  console.log('PASS all new types appear in 3D and can be selected for editing');

  await page.getByRole('button', { name: 'Save layout', exact: true }).click();
  await page.getByLabel('Layout name', { exact: true }).fill('All furniture types');
  await page.getByRole('button', { name: 'Save in this browser' }).click();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /My layouts/ }).click();
  await page.locator('.saved-open').filter({ hasText: 'All furniture types' }).click();
  assert.equal(new Set((await current()).furniture.map(item => item.kind)).size, 24);
  await page.getByRole('button', { name: 'Browse furniture' }).click();
  await page.getByRole('searchbox').fill('table');
  assert.equal(await page.locator('.catalog-card').count(), 3);
  await page.getByRole('searchbox').fill('not a furniture type');
  await page.getByText('No furniture matches your search.').waitFor();
  console.log('PASS expanded saved layouts reopen correctly and catalog search filters the available items');

  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Next: furniture' }).click();
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const language of ['ru', 'tr', 'en']) {
      await page.locator('.language-select').selectOption(language);
      assert.equal(await page.locator('.quantity-card').count(), 24);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${language} overflows at ${width}px`);
    }
  }
  await page.locator('.language-select').selectOption('tr');
  await page.getByRole('searchbox').fill('sehpa');
  assert.equal(await page.locator('.quantity-card').count(), 1);
  await page.screenshot({ path: 'test-results/catalog-mobile-turkish.png', fullPage: true });
  assert.equal(apiCalls, 0); assert.deepEqual(errors, []);
  console.log('PASS translated search and all 24 quantity cards fit desktop and mobile in dark mode');
} finally { await browser.close(); }
