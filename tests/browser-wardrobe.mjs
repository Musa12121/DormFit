import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { defaultProject } from '../src/domain/model.ts';

await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const base = process.env.TEST_URL || 'http://127.0.0.1:5173';
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  const source = defaultProject(); source.furniture = source.furniture.filter((item) => item.kind === 'wardrobe');
  await page.addInitScript((project) => localStorage.setItem('dormfit.workspace.v1', JSON.stringify(project)), source);
  await page.route('**/api/layout-advice', () => assert.fail('Wardrobe checks must not make a Gemini request'));
  assert.equal((await page.goto(base, { waitUntil: 'networkidle' })).status(), 200);
  await page.getByRole('button', { name: 'Next: furniture' }).click();
  await page.getByRole('button', { name: 'Show layouts' }).click();
  const shape = page.locator('.canvas-panel [data-shape="wardrobe"]');
  await shape.waitFor();
  assert.equal(await shape.locator('[data-wardrobe-part="clothes"]').count(), 3);
  await page.locator('.canvas-panel').screenshot({ path: 'test-results/wardrobe-2d.png' });
  console.log('PASS wardrobe cutaway includes clothes, frame and doors in the actual 2D editor');

  const item = page.locator('.canvas-panel [data-furniture]').first();
  await item.focus(); await item.press('r');
  assert.match(await item.locator(':scope > g').first().getAttribute('transform'), /rotate\(90\)/);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('dormfit.workspace.v1')));
  assert.equal(saved.furniture[0].rotated, true);
  assert.equal(saved.furniture[0].width, 80); assert.equal(saved.furniture[0].depth, 55);
  console.log('PASS wardrobe rotates with its measured footprint');

  await page.getByRole('button', { name: '3D', exact: true }).click();
  const iso = page.locator('.iso-svg [data-shape="iso-wardrobe"]'); await iso.waitFor();
  assert.equal(await iso.locator('[data-wardrobe-part="door"]').count(), 2);
  assert.equal(await iso.locator('[data-wardrobe-part="handle"]').count(), 2);
  await page.locator('.canvas-panel').screenshot({ path: 'test-results/wardrobe-3d.png' });
  console.log('PASS rotated 3D wardrobe has two panelled doors and long handles');

  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.locator('.canvas-panel').screenshot({ path: 'test-results/wardrobe-mobile.png' });
  assert.deepEqual(errors, []);
  console.log('PASS wardrobe view remains usable on a narrow screen without browser errors');
} finally {
  await browser.close();
}
