import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { AI_PROTOCOL } from '../src/domain/ai.ts';

await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
const base = process.env.TEST_URL || 'http://127.0.0.1:5173';
const choose = language => page.locator('.language-select').selectOption(language);
const current = () => page.evaluate(() => JSON.parse(localStorage.getItem('dormfit.workspace.v1')));
try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await choose('ru');
  await page.getByRole('heading', { name: 'Какого размера ваша комната?' }).waitFor();
  await page.getByLabel('Ширина комнаты', { exact: true }).fill('5');
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('html').getAttribute('lang'), 'ru');
  assert.equal(await page.locator('.language-select').inputValue(), 'ru');
  assert.match(await page.locator('.setup-room-preview [data-opening-kind="door"]').getAttribute('aria-label'), /Переместить Дверь 1/);
  console.log('PASS Russian interface, accessibility labels and language persistence');

  await choose('tr');
  await page.getByRole('button', { name: 'Sonraki: eşyalar' }).click();
  await page.getByLabel('Yatak adedi', { exact: true }).fill('1');
  await page.getByLabel('Bitki adedi', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Planları göster', exact: true }).click();
  await page.locator('.layout-card').first().waitFor();
  assert.equal(await page.locator('.layout-card').count(), 3);
  await page.getByRole('heading', { name: 'Algoritma planları' }).waitFor();
  await page.locator('.canvas-panel [data-furniture="bed-1"]').click();
  const width = page.getByLabel('Eşya genişliği', { exact: true });
  await width.fill('120'); await width.press('Enter');
  assert.equal((await current()).furniture[0].width, 120);
  await width.fill('0'); await width.press('Enter');
  await page.getByText('20–400 cm girin.', { exact: true }).waitFor();
  console.log('PASS Turkish quantities, generated layouts, selected furniture and validation');

  await page.getByRole('button', { name: 'Planı kaydet', exact: true }).click();
  await page.getByLabel('Plan adı', { exact: true }).fill('Berlin Zimmer 42');
  await page.getByRole('button', { name: 'Bu tarayıcıya kaydet' }).click();
  const before = await current(); await choose('ru');
  assert.deepEqual(await current(), before);
  await page.getByRole('button', { name: /Мои планировки/ }).click();
  await page.getByRole('dialog').getByText('Berlin Zimmer 42', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Закрыть окно' }).click();
  await page.getByRole('button', { name: 'Как это работает' }).click();
  await page.getByRole('heading', { name: '01. Измерьте комнату' }).waitFor();
  await page.getByRole('button', { name: 'Закрыть окно' }).click();
  console.log('PASS translated saved/help dialogs preserve custom names and room data');

  let reviews = 0, plans = 0;
  const note = 'Растение рядом с окном, und das Bett weit weg von der Tür.';
  await page.route('**/api/interpret-preferences', async route => {
    reviews++; const body = route.request().postDataJSON();
    assert.equal(body.language, 'ru'); assert.equal(body.prompt, note);
    await route.fulfill({ headers: { 'X-DormFit-AI-Version': AI_PROTOCOL }, json: { requirements: [{ itemId: 'plant-1', targetId: 'window', relation: 'near' }], unmetRequests: [] } });
  });
  await page.route('**/api/layout-advice', async route => {
    plans++; const body = route.request().postDataJSON();
    assert.equal(body.language, 'ru'); assert.equal(body.prompt, note);
    await route.fulfill({ headers: { 'X-DormFit-AI-Version': AI_PROTOCOL }, json: {
      positions: [{ id: 'bed-1', x: 10, y: 100, rotated: false }, { id: 'plant-1', x: 190, y: 10, rotated: false }],
      ...body.review, explanation: 'Растение размещено у окна.', tips: ['Проверьте реальные размеры.'],
    } });
  });
  await page.getByRole('checkbox', { name: 'Создать планировку с ИИ по моим пожеланиям' }).check();
  await page.getByLabel('Ваши пожелания', { exact: true }).fill(note);
  await page.getByRole('button', { name: 'Создать планировки', exact: true }).click();
  await page.getByLabel('Условие 1: ориентир').waitFor();
  assert.equal(reviews, 1); assert.equal(plans, 0);
  assert.equal(await page.locator('.review-note').innerText(), note);
  await page.getByRole('button', { name: 'Подтвердить и создать план' }).click();
  await page.locator('.ai-success').waitFor();
  assert.equal(plans, 1);
  await page.getByText('Растение размещено у окна.', { exact: true }).waitFor();
  assert.match(await page.locator('.ai-requirements').innerText(), /Растение 1 → окно: рядом/);
  await page.screenshot({ path: 'test-results/language-russian-ai.png', fullPage: true });
  console.log('PASS mixed Russian/German note stays unchanged through review and AI planning');

  await choose('tr');
  await page.getByText('Seçili dilde yapay zekâ açıklamaları almak için planları yeniden oluşturun.').waitFor();
  assert.equal(await page.getByLabel('Odanız için tercihleriniz', { exact: true }).inputValue(), note);
  await page.getByRole('button', { name: 'Koyu temaya geç' }).click();
  for (const size of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width: size, height: 900 });
    for (const language of ['ru', 'tr', 'en']) {
      await choose(language);
      assert.ok(await page.locator('.language-select').isVisible());
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      if (overflow) console.log(await page.evaluate(() => [...document.querySelectorAll('body *')].filter(el => {
        const box = el.getBoundingClientRect(); return box.width && (box.right > innerWidth + 1 || box.left < -1);
      }).slice(0, 12).map(el => ({ tag: el.tagName, className: el.getAttribute('class'), width: el.getBoundingClientRect().width, text: el.textContent.slice(0, 70) }))));
      assert.equal(overflow, false, `${language} overflows at ${size}px`);
      const box = await page.locator('.header-actions').boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= size + 1);
    }
  }
  await choose('tr');
  await page.screenshot({ path: 'test-results/language-turkish-mobile.png', fullPage: true });
  console.log('PASS three languages fit desktop, tablet and mobile headers in dark mode');
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
