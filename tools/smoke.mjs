// Headless smoke test: splash → menu → roster → battle setup → battle → one action.
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:4173/my-fe/';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

const step = async (name, fn) => {
  try { await fn(); console.log('✓', name); } catch (e) { console.log('✗', name, '—', e.message); await page.screenshot({ path: `/tmp/smoke-fail.png` }); throw e; }
};

await step('open', async () => { await page.goto(base, { waitUntil: 'networkidle' }); await page.waitForTimeout(500); });
await step('splash → menu', async () => {
  const splash = page.getByText('Нажмите, чтобы начать');
  if (await splash.count()) await splash.first().click();
  await page.getByRole('button', { name: /В бой/ }).first().waitFor({ timeout: 5000 });
});
await step('В бой → создание армии', async () => {
  await page.getByRole('button', { name: /В бой/ }).first().click();
  await page.waitForURL(/army\/create/, { timeout: 5000 });
  await page.waitForTimeout(300);
});
await step('выбрать 4 бойцов', async () => {
  const cards = page.locator('[data-roster-card], .roster-card, .card');
  const n = await cards.count();
  if (n < 4) throw new Error(`карточек: ${n}`);
  for (let i = 0; i < 4; i++) {
    await cards.nth(i).click();
    await page.waitForTimeout(150);
    const take = page.getByRole('button', { name: /^Взять$/ });
    if (await take.count()) await take.first().click();
    await page.waitForTimeout(150);
    const close = page.getByRole('button', { name: /Закрыть|✕|Назад/ });
    if (await close.count() && !(await page.getByRole('button', { name: /Подтвердить/ }).first().isVisible().catch(() => false))) await close.first().click();
  }
});
await step('подтвердить ростер → подготовка', async () => {
  await page.getByRole('button', { name: /Подтвердить/ }).first().click();
  await page.waitForURL(/battle\/setup/, { timeout: 5000 });
});
await step('начать бой', async () => {
  await page.getByRole('button', { name: /Начать бой/ }).first().click();
  await page.waitForURL(/#\/battle$/, { timeout: 5000 });
  await page.waitForSelector('#battle-canvas canvas', { timeout: 10000 });
  await page.waitForTimeout(1500);
});
await step('тап по своему юниту и «Завершить ход»', async () => {
  const canvas = page.locator('#battle-canvas canvas');
  const box = await canvas.boundingBox();
  // нижний ряд, вторая колонка (спавн 1,7)
  const tile = Math.min(box.width / 6, box.height / 8);
  const ox = box.x + (box.width - tile * 6) / 2;
  const oy = box.y + (box.height - tile * 8) / 2;
  await page.mouse.click(ox + tile * 1.5, oy + tile * 7.5);
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/smoke-selected.png' });
  const cancel = page.getByRole('button', { name: /Отмена/ });
  if (await cancel.count()) await cancel.first().click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: /Завершить ход/ }).first().click();
  await page.waitForTimeout(6000);
  await page.screenshot({ path: '/tmp/smoke-after-enemy.png' });
});
await step('пауза → отступить → итоги', async () => {
  await page.getByRole('button', { name: /≡|Пауза/ }).first().click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /Отступить/ }).first().click();
  await page.waitForTimeout(300);
  const confirmBtn = page.getByRole('button', { name: /Отступить|Да|Подтвердить/ }).last();
  await confirmBtn.click();
  await page.waitForURL(/battle\/result/, { timeout: 8000 });
  await page.screenshot({ path: '/tmp/smoke-result.png' });
});
await step('в казарму', async () => {
  await page.getByRole('button', { name: /В казарму/ }).first().click();
  await page.waitForURL(/#\/army$/, { timeout: 5000 });
});

console.log(errors.length ? `ERRORS (${errors.length}):\n` + errors.join('\n') : 'no console/page errors');
await browser.close();
process.exit(errors.length ? 1 : 0);
