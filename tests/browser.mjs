import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1512, height: 1080 },
  acceptDownloads: true,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const base = process.env.TEST_URL || 'http://127.0.0.1:5173';
const check = async (label, action) => {
  await action();
  console.log(`PASS ${label}`);
};
try {
  const response = await page.goto(base, { waitUntil: 'networkidle' });
  assert.equal(response.status(), 200);
  await page.getByRole('heading', { name: 'For your room, the right layout.' }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  assert.deepEqual(errors, [], 'No errors during initial render');
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
  if (process.env.SCREENSHOT_ONLY) process.exitCode = 0;
  else {
    await check(
      'dimensions, optional height, quantities and measured layout suggestions',
      async () => {
        assert.equal(
          await page.locator('.canvas-panel').count(),
          0,
          'Start with the form, not the editor',
        );
        await page.getByLabel('Room width', { exact: true }).fill('4.8');
        await page.getByLabel('Room length', { exact: true }).fill('4');
        await page.getByLabel('Room height', { exact: true }).fill('1');
        await page.getByRole('button', { name: 'Next: furniture' }).click();
        assert.equal(
          await page.locator('.setup-room').count(),
          1,
          'Invalid height prevents continuing',
        );
        await page.getByLabel('Room height', { exact: true }).fill('2.7');
        await page.getByRole('button', { name: 'Next: furniture' }).click();
        assert.equal(
          await page.getByRole('button', { name: 'Show layouts' }).isDisabled(),
          true,
        );
        await page.getByLabel('Bed count', { exact: true }).fill('1');
        await page.getByLabel('Wardrobe count', { exact: true }).fill('2');
        await page.getByLabel('Desk count', { exact: true }).fill('1');
        await page.getByLabel('Bed width', { exact: true }).fill('90');
        await page.getByLabel('Bed length', { exact: true }).fill('190');
        await page.screenshot({ path: 'test-results/quantities.png', fullPage: true });
        await page.getByRole('button', { name: 'Show layouts', exact: true }).click();
        await page.locator('.layout-card').first().waitFor();
        assert.equal(await page.locator('.layout-card').count(), 3);
        const data = await page.evaluate(() =>
          JSON.parse(localStorage.getItem('dormfit.workspace.v1')),
        );
        assert.equal(data.room.width, 480);
        assert.equal(data.room.depth, 400);
        assert.equal(data.room.height, 270);
        assert.equal(data.furniture.length, 4);
        assert.equal(data.furniture.filter((f) => f.kind === 'wardrobe').length, 2);
        assert.equal(data.furniture.find((f) => f.kind === 'bed').width, 90);
        assert.equal(await page.locator('#room-plan [data-furniture]').count(), 4);
        await page.screenshot({ path: 'test-results/suggestions.png', fullPage: true });
        await page.locator('.layout-card').nth(1).click();
        assert.equal(await page.locator('.layout-card.active').count(), 1);
      },
    );
    await check(
      'editing quantities preserves inputs and optional height can be removed',
      async () => {
        await page.getByRole('button', { name: 'Change sizes and quantities', exact: true }).click();
        assert.equal(await page.getByLabel('Room width', { exact: true }).inputValue(), '4.8');
        assert.equal(
          await page.getByLabel('Room height', { exact: true }).inputValue(),
          '2.7',
        );
        await page.getByLabel('Room height', { exact: true }).fill('');
        await page.getByRole('button', { name: 'Next: furniture' }).click();
        assert.equal(await page.getByLabel('Wardrobe count', { exact: true }).inputValue(), '2');
        await page.getByLabel('Wardrobe count', { exact: true }).fill('1');
        await page.getByRole('button', { name: 'Show layouts', exact: true }).click();
        await page.locator('.canvas-panel').waitFor();
        const data = await page.evaluate(() =>
          JSON.parse(localStorage.getItem('dormfit.workspace.v1')),
        );
        assert.equal(data.room.height, undefined);
        assert.equal(data.furniture.length, 3);
        // Use the explicit example room for the existing editor regression checks.
        await page.getByRole('button', { name: 'Example room', exact: true }).click();
        await page.getByRole('button', { name: 'Open example', exact: true }).click();
        await page.locator('[data-furniture="bed-a"]').waitFor();
      },
    );
    await check(
      'zoom visibly scales furniture in both views and resets independently',
      async () => {
        const bed = page.locator('[data-furniture="bed-a"]');
        const base = await bed.boundingBox();
        await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
        assert.ok(
          (await bed.boundingBox()).width > base.width * 1.09,
          '110% must visibly enlarge furniture',
        );
        await page
          .getByRole('button', { name: 'Zoom out', exact: true })
          .click({ clickCount: 2 });
        assert.ok(
          (await bed.boundingBox()).width < base.width * 0.91,
          '90% must visibly shrink furniture',
        );
        await page.getByRole('button', { name: 'Reset zoom', exact: true }).click();
        assert.ok(Math.abs((await bed.boundingBox()).width - base.width) < 1);
        await page.getByRole('button', { name: '3D', exact: true }).click();
        const floor = page.locator('.iso-svg > polygon').first();
        const isoBase = await floor.boundingBox();
        await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
        assert.ok((await floor.boundingBox()).width > isoBase.width * 1.09);
        await page.getByRole('button', { name: 'Reset zoom', exact: true }).click();
        await page.getByRole('button', { name: '2D', exact: true }).click();
      },
    );
    await check(
      'native fullscreen enters, fills the viewport and exits without resetting zoom',
      async () => {
        await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
        await page.getByRole('button', { name: 'Enter fullscreen', exact: true }).click();
        await page.waitForFunction(() => document.fullscreenElement?.matches('.canvas-panel'));
        const panel = await page.locator('.canvas-panel').boundingBox();
        const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
        assert.ok(
          Math.abs(panel.width - viewport.width) <= 1 &&
            Math.abs(panel.height - viewport.height) <= 1,
        );
        assert.equal(
          await page.getByRole('button', { name: 'Reset zoom' }).textContent(),
          '110%',
        );
        await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).click();
        await page.waitForFunction(() => document.fullscreenElement === null);
        await page.getByRole('button', { name: 'Enter fullscreen', exact: true }).click();
        await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).waitFor();
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.fullscreenElement === null);
        await page.getByRole('button', { name: 'Enter fullscreen', exact: true }).waitFor();
        await page.getByRole('button', { name: 'Reset zoom', exact: true }).click();
      },
    );
    await check('zoom limits and mobile fullscreen fallback', async () => {
      for (let i = 0; i < 10; i++)
        await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
      assert.equal(
        await page.getByRole('button', { name: 'Zoom in', exact: true }).isDisabled(),
        true,
      );
      assert.equal(
        await page.getByRole('button', { name: 'Reset zoom' }).textContent(),
        '200%',
      );
      for (let i = 0; i < 15; i++)
        await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
      assert.equal(
        await page.getByRole('button', { name: 'Zoom out', exact: true }).isDisabled(),
        true,
      );
      assert.equal(
        await page.getByRole('button', { name: 'Reset zoom' }).textContent(),
        '50%',
      );
      await page.getByRole('button', { name: 'Reset zoom', exact: true }).click();
      const mobile = await context.newPage();
      await mobile.addInitScript(() =>
        Object.defineProperty(document, 'fullscreenEnabled', {
          configurable: true,
          get: () => false,
        }),
      );
      await mobile.goto(base, { waitUntil: 'networkidle' });
      await mobile.getByRole('button', { name: 'Example room', exact: true }).click();
      await mobile.getByRole('button', { name: 'Open example', exact: true }).click();
      await mobile.locator('[data-furniture="bed-a"]').waitFor();
      await mobile.setViewportSize({ width: 390, height: 844 });
      const before = await mobile.locator('[data-furniture="bed-a"]').boundingBox();
      await mobile.getByRole('button', { name: 'Zoom in', exact: true }).click();
      assert.ok(
        (await mobile.locator('[data-furniture="bed-a"]').boundingBox()).width >
          before.width * 1.09,
      );
      await mobile.getByRole('button', { name: 'Enter fullscreen', exact: true }).click();
      await mobile.locator('.canvas-panel.is-expanded').waitFor();
      const rect = await mobile.locator('.canvas-panel').boundingBox();
      assert.equal(Math.round(rect.width), 390);
      assert.equal(Math.round(rect.height), 844);
      await mobile.keyboard.press('Escape');
      await mobile.getByRole('button', { name: 'Enter fullscreen', exact: true }).waitFor();
      assert.equal(await mobile.evaluate(() => document.body.style.overflow), '');
      await mobile.close();
    });
    await check('keyboard movement, rotation warning and undo', async () => {
      const bed = page.locator('[data-furniture="bed-a"]');
      const before = await bed.getAttribute('transform');
      await bed.focus();
      await bed.press('ArrowRight');
      assert.notEqual(await bed.getAttribute('transform'), before);
      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      assert.equal(await bed.getAttribute('transform'), before);
      await bed.focus();
      await bed.press('r');
      await page.getByText('Some adjustments needed').waitFor();
      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      await page.getByText('Looking good!').waitFor();
      await page.getByRole('button', { name: 'Redo', exact: true }).click();
      await page.getByText('Some adjustments needed').waitFor();
      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      await page.getByText('Looking good!').waitFor();
    });
    await check('pointer dragging changes a furniture position', async () => {
      const bed = page.locator('[data-furniture="bed-a"]');
      const before = await bed.getAttribute('transform');
      const rect = await bed.boundingBox();
      await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
      await page.mouse.down();
      await page.mouse.move(rect.x + rect.width / 2 + 35, rect.y + rect.height / 2 + 5, {
        steps: 5,
      });
      await page.mouse.up();
      assert.notEqual(await bed.getAttribute('transform'), before);
      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      assert.equal(await bed.getAttribute('transform'), before);
    });
    await check('validated dimensions and computed room area', async () => {
      const width = page.getByLabel('Width', { exact: true }).first();
      await width.fill('1');
      await width.press('Enter');
      await page.getByText('Enter 2–100 m.').waitFor();
      await width.fill('4');
      await width.press('Enter');
      const saved = await page.evaluate(() =>
        JSON.parse(localStorage.getItem('dormfit.workspace.v1')),
      );
      assert.equal(saved.room.width, 400);
      await page.getByRole('button', { name: 'Undo', exact: true }).click();
    });
    await check('three generated layouts and applying an alternative', async () => {
      await page.getByRole('button', { name: 'Generate layouts' }).click();
      await page.locator('.layout-card').first().waitFor();
      assert.equal(await page.locator('.layout-card').count(), 3);
      assert.equal(await page.locator('.layout-tag.tag-warning').count(), 0);
      await page.locator('.layout-card').nth(1).click();
      assert.equal(await page.locator('.layout-card.active').count(), 1);
    });
    await check('isometric view and return to editable plan', async () => {
      await page.getByRole('button', { name: '3D', exact: true }).click();
      await page.getByRole('img', { name: 'Isometric room view' }).waitFor();
      await page.screenshot({ path: 'test-results/isometric.png', fullPage: true });
      await page.getByRole('button', { name: '2D', exact: true }).click();
    });
    await check('furniture catalog, inspector and delete', async () => {
      await page.getByRole('tab', { name: /Furniture/ }).click();
      const before = await page.locator('#room-plan [data-furniture]').count();
      await page.locator('.catalog-card').filter({ hasText: 'Shelf' }).click();
      assert.equal(await page.locator('#room-plan [data-furniture]').count(), before + 1);
      await page.getByLabel('Furniture name', { exact: true }).fill('New bookshelf');
      await page
        .locator('.inspector')
        .getByRole('button', { name: 'Delete furniture', exact: true })
        .click();
      assert.equal(await page.locator('#room-plan [data-furniture]').count(), before);
    });
    await check('JSON export and PNG image export', async () => {
      await page.getByRole('button', { name: 'Download layout', exact: true }).click();
      let waiting = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Layout file (JSON)', exact: true }).click();
      const json = await waiting;
      await json.saveAs('test-results/export.json');
      assert.equal(JSON.parse(await readFile('test-results/export.json', 'utf8')).version, 1);
      await page.getByRole('button', { name: 'Download layout', exact: true }).click();
      waiting = page.waitForEvent('download');
      await page.getByRole('button', { name: 'PNG image', exact: true }).click();
      const png = await waiting;
      await png.saveAs('test-results/export.png');
      const bytes = await readFile('test-results/export.png');
      assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    });
    await check('save, reload, open and delete a saved plan', async () => {
      await page.getByRole('button', { name: 'Save layout', exact: true }).click();
      await page.getByLabel('Layout name', { exact: true }).fill('Browser check');
      await page.getByRole('button', { name: 'Save in this browser', exact: true }).click();
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByRole('button', { name: /My layouts/ }).click();
      await page.locator('.saved-open').filter({ hasText: 'Browser check' }).click();
      await page.locator('.breadcrumb').getByText('Browser check').waitFor();
      await page.getByRole('button', { name: /My layouts/ }).click();
      await page.getByRole('button', { name: 'Browser check delete layout' }).click();
      await page.getByRole('dialog', { name: 'Delete saved layout?' }).waitFor();
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('dormfit.saved.v1')).length), 1);
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.getByRole('button', { name: 'Browser check delete layout' }).click();
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Browser check delete layout' }).click();
      await page.getByRole('button', { name: 'Delete layout', exact: true }).click();
      await page.getByText('Your first layout belongs here.').waitFor();
      await page.getByRole('button', { name: 'Close dialog' }).click();
    });
    await check('invalid import does not replace the workspace', async () => {
      const before = await page.locator('.breadcrumb').textContent();
      await page.locator('input[type="file"]').setInputFiles({
        name: 'bad.json',
        mimeType: 'application/json',
        buffer: Buffer.from('{"version":1}'),
      });
      await page
        .getByRole('status')
        .filter({ hasText: 'This file is not a valid DormFit layout.' })
        .waitFor();
      assert.equal(await page.locator('.breadcrumb').textContent(), before);
      await page
        .locator('input[type="file"]')
        .setInputFiles(path.resolve('test-results/export.json'));
      await page.getByRole('status').filter({ hasText: 'Layout opened from file.' }).waitFor();
    });
    await check('modal keyboard and narrow screen layout', async () => {
      await page.getByRole('button', { name: 'How it works', exact: true }).click();
      await page.getByRole('dialog').waitFor();
      await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('dialog').count(), 0);
      for (const width of [390, 768, 1024]) {
        await page.setViewportSize({ width, height: 844 });
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        assert.ok(overflow <= 1, `page overflows by ${overflow}px at ${width}px`);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
    });
    await check(
      'mobile setup and an overfilled room keep every requested item visible',
      async () => {
        const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const mobile = await mobileContext.newPage();
        mobile.on('pageerror', (error) => errors.push(error.message));
        await mobile.goto(base, { waitUntil: 'networkidle' });
        assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await mobile.screenshot({ path: 'test-results/mobile-setup.png', fullPage: true });
        await mobile.getByLabel('Room width', { exact: true }).fill('3');
        await mobile.getByLabel('Room length', { exact: true }).fill('3');
        await mobile.getByRole('button', { name: 'Next: furniture' }).click();
        await mobile.getByLabel('Bed count', { exact: true }).fill('1');
        await mobile.getByLabel('Wardrobe count', { exact: true }).fill('1');
        assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await mobile.screenshot({ path: 'test-results/mobile-quantities.png', fullPage: true });
        await mobile.getByRole('button', { name: 'Show layouts', exact: true }).click();
        await mobile.locator('.layout-card').first().waitFor();
        assert.equal(await mobile.locator('#room-plan [data-furniture]').count(), 2);
        await mobile.getByRole('button', { name: 'Change sizes and quantities' }).click();
        await mobile.getByLabel('Room width', { exact: true }).fill('2');
        await mobile.getByLabel('Room length', { exact: true }).fill('2');
        await mobile.getByRole('button', { name: 'Next: furniture' }).click();
        await mobile.getByLabel('Bed count', { exact: true }).fill('10');
        await mobile.getByLabel('Wardrobe count', { exact: true }).fill('0');
        await mobile.getByRole('button', { name: 'Show layouts', exact: true }).click();
        await mobile.locator('.layout-warning').waitFor();
        assert.equal(await mobile.locator('.layout-tag.tag-warning').count(), 3);
        assert.equal(await mobile.locator('#room-plan [data-furniture]').count(), 10);
        assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await mobileContext.close();
      },
    );
    assert.deepEqual(errors, [], 'Browser should have no uncaught application errors');
    console.log('All browser checks passed.');
  }
} finally {
  await browser.close();
}
