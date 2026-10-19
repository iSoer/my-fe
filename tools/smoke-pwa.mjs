// PWA smoke: первый визит → SW взял управление → офлайн → перезагрузка → меню → бой (ленивый чанк Phaser из кэша).
// Запуск: VITE_BASE_PATH=/my-fe/ pnpm build && pnpm smoke:pwa
import { preview } from 'vite';
import { chromium } from 'playwright-core';

const base = process.env.VITE_BASE_PATH ?? '/my-fe/';
const server = await preview({ base, preview: { port: 4174, strictPort: true }, logLevel: 'error' });
const url = `http://localhost:4174${base}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});

let failed = false;
const step = async (name, fn) => {
  try {
    await fn();
    console.log('✓', name);
  } catch (e) {
    failed = true;
    console.log('✗', name, '—', e.message);
    await page.screenshot({ path: '/tmp/smoke-pwa-fail.png' }).catch(() => undefined);
    throw e;
  }
};

try {
  await step('первый визит, манифест подключён', async () => {
    await page.goto(url, { waitUntil: 'load' });
    const href = await page.getAttribute('link[rel="manifest"]', 'href');
    if (href !== `${base}manifest.webmanifest`) throw new Error(`manifest href = ${href}`);
    const res = await page.request.get(new URL(href, url).href);
    const m = await res.json();
    if (!m.icons?.some((i) => i.purpose === 'maskable')) throw new Error('нет maskable-иконки');
  });
  await step('SW установлен и контролирует страницу', async () => {
    await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 15000 });
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.scope);
    if (scope !== url) throw new Error(`scope = ${scope}`);
  });
  await step('precache и SDK Telegram в кэше', async () => {
    const info = await page.evaluate(async () => {
      const names = await caches.keys();
      let entries = [];
      for (const n of names) entries = entries.concat((await (await caches.open(n)).keys()).map((r) => r.url));
      return { names, entries };
    });
    if (!info.entries.some((u) => /assets\/phaser-[\w-]+\.js/.test(u))) throw new Error('phaser не в кэше');
    if (!info.entries.some((u) => u.startsWith('https://telegram.org/js/'))) throw new Error(`SDK Telegram не в кэше: ${info.names.join(', ')}`);
  });
  await step('офлайн: холодная перезагрузка', async () => {
    await ctx.setOffline(true);
    await page.reload({ waitUntil: 'load' });
    const splash = page.getByText('Нажмите, чтобы начать');
    await splash.first().waitFor({ timeout: 8000 });
    await splash.first().click();
    await page.getByRole('button', { name: /В бой/ }).first().waitFor({ timeout: 5000 });
  });
  await step('офлайн: создание армии', async () => {
    await page.getByRole('button', { name: /В бой/ }).first().click();
    await page.waitForURL(/army\/create/, { timeout: 5000 });
    await page.waitForTimeout(300);
    const cards = page.locator('[data-roster-card], .roster-card, .card');
    for (let i = 0; i < 4; i++) {
      await cards.nth(i).click();
      await page.waitForTimeout(150);
      const take = page.getByRole('button', { name: /^Взять$/ });
      if (await take.count()) await take.first().click();
      await page.waitForTimeout(150);
      const close = page.getByRole('button', { name: /Закрыть|✕|Назад/ });
      if ((await close.count()) && !(await page.getByRole('button', { name: /Подтвердить/ }).first().isVisible().catch(() => false))) await close.first().click();
    }
    await page.getByRole('button', { name: /Подтвердить/ }).first().click();
    await page.waitForURL(/battle\/setup/, { timeout: 5000 });
  });
  await step('офлайн: бой с канвасом Phaser', async () => {
    await page.getByRole('button', { name: /Начать бой/ }).first().click();
    await page.waitForURL(/#\/battle$/, { timeout: 5000 });
    await page.waitForSelector('#battle-canvas canvas', { timeout: 10000 });
  });
  await step('офлайн: сейв на месте после перезагрузки', async () => {
    await page.waitForTimeout(500);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__pf?.save?.get?.()?.battle != null, null, { timeout: 8000 });
  });
} catch {
  /* шаг уже залогирован */
}

console.log(errors.length ? `ERRORS (${errors.length}):\n${errors.join('\n')}` : 'no console/page errors');
await browser.close();
await new Promise((r) => server.httpServer.close(r));
process.exit(failed || errors.length ? 1 : 0);
