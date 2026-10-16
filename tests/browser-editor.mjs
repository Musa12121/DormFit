import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, colorScheme: 'light' });
const base = process.env.TEST_URL || 'http://127.0.0.1:5173';
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/api/layout-advice', () => assert.fail('Editor checks must not call Gemini'));
const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('dormfit.workspace.v1')));

try {
  assert.equal((await page.goto(base, { waitUntil: 'networkidle' })).status(), 200);
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  const darkBackground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.equal(darkBackground, 'rgb(16, 21, 30)');
  await page.screenshot({ path: 'test-results/dark-setup.png', fullPage: true });
  console.log('PASS dark mode updates the palette and persists after reload');

  await page.getByRole('button', { name: 'Example room', exact: true }).click();
  await page.getByRole('button', { name: 'Open example', exact: true }).click();
  await page.locator('.canvas-panel [data-furniture="bed-b"]').click();
  const editor = page.getByRole('region', { name: 'Selected furniture' });
  assert.equal(await page.locator('.left-panel').getByRole('region', { name: 'Selected furniture' }).count(), 1);
  const width = editor.getByLabel('Furniture width', { exact: true });
  assert.equal(await width.inputValue(), '100');
  await width.fill('180'); await width.press('Enter');
  let bed = (await saved()).furniture.find(item => item.id === 'bed-b');
  assert.equal(bed.width, 180); assert.equal(bed.x + bed.width, 420);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  bed = (await saved()).furniture.find(item => item.id === 'bed-b');
  assert.equal(bed.width, 100); assert.equal(bed.x, 304);
  await page.locator('.canvas-panel [data-furniture="bed-b"]').click();
  await width.fill('0'); await width.press('Enter');
  assert.equal(await width.getAttribute('aria-invalid'), 'true');
  assert.equal((await saved()).furniture.find(item => item.id === 'bed-b').width, 100);
  await page.screenshot({ path: 'test-results/dark-editor.png', fullPage: true });
  console.log('PASS clicking furniture opens left sizes; resize, room-edge clamping, validation and undo work');

  await page.getByRole('button', { name: '3D', exact: true }).click();
  await page.getByRole('button', { name: 'Select Shared wardrobe', exact: true }).click();
  assert.equal(await editor.getByLabel('Furniture width').inputValue(), '80');
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await page.screenshot({ path: 'test-results/light-editor.png', fullPage: true });
  // Language names intentionally stay in their native spelling in the menu.
  assert.doesNotMatch((await page.locator('body').innerText()).replace('Türkçe', ''), /[\u0259\u018f\u0131\u0130\u011f\u011e\u015f\u015e\u00e7\u00c7\u00f6\u00d6\u00fc\u00dc]/);
  console.log('PASS 3D furniture opens the same editor and the interface is in English');

  await page.getByRole('button', { name: 'Change sizes and quantities', exact: true }).click();
  await page.getByLabel('Room width', { exact: true }).fill('100');
  await page.getByLabel('Room length', { exact: true }).fill('80');
  await page.getByRole('button', { name: 'Next: furniture' }).click();
  await page.getByRole('button', { name: 'Show layouts', exact: true }).click();
  await page.locator('.layout-card').first().waitFor();
  const project = await saved();
  assert.equal(project.room.width, 10_000); assert.equal(project.room.depth, 8000);
  assert.equal(project.furniture.length, 6);
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.getByLabel('Room width').inputValue(), '100');
  assert.equal((await saved()).furniture.length, 6);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: 'test-results/mobile-theme.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS 100 × 80 metre room generation, saving, reload and mobile viewport');
} finally {
  await browser.close();
}
