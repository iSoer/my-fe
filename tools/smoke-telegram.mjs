// Смоук Telegram-слоя с моком window.Telegram.WebApp (SDK telegram.org заблокирован): сейв по id пользователя,
// зеркало сейва в CloudStorage, кнопка «Назад» и экран конфликта, когда облако новее локального сейва.
// Нужен запущенный `VITE_BASE_PATH=/my-fe/ pnpm preview`.   node tools/smoke-telegram.mjs [url]   (CHROMIUM_PATH=…)
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:4173/my-fe/';
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);

/** Мок WebApp: CloudStorage в памяти (начальное содержимое — `cloud`), кнопка «Назад» с доступом из теста. */
const mockTelegram = (cloud) => {
  const store = new Map(Object.entries(cloud));
  const cb = (fn, ...args) => setTimeout(() => fn?.(null, ...args), 5);
  const back = { isVisible: false, handlers: [] };
  window.__tg = { store, back };
  window.Telegram = {
    WebApp: {
      ready() {},
      expand() {},
      close() {},
      enableClosingConfirmation() {
        window.__tg.closing = true;
      },
      disableClosingConfirmation() {
        window.__tg.closing = false;
      },
      isVersionAtLeast: () => true,
      version: '8.0',
      platform: 'tdesktop',
      colorScheme: 'dark',
      themeParams: {},
      viewportHeight: 844,
      viewportStableHeight: 844,
      safeAreaInset: { top: 20, bottom: 10, left: 0, right: 0 },
      contentSafeAreaInset: { top: 30, bottom: 0, left: 0, right: 0 },
      initDataUnsafe: { user: { id: 42, first_name: 'Test' } },
      BackButton: {
        get isVisible() {
          return back.isVisible;
        },
        show() {
          back.isVisible = true;
        },
        hide() {
          back.isVisible = false;
        },
        onClick(h) {
          back.handlers.push(h);
        },
        offClick(h) {
          back.handlers = back.handlers.filter((x) => x !== h);
        },
      },
      HapticFeedback: { impactOccurred() {}, notificationOccurred() {}, selectionChanged() {} },
      CloudStorage: {
        setItem: (k, v, f) => (store.set(k, v), cb(f, true)),
        getItem: (k, f) => cb(f, store.get(k) ?? ''),
        getItems: (ks, f) =>
          cb(f, Object.fromEntries(ks.filter((k) => store.has(k)).map((k) => [k, store.get(k)]))),
        removeItem: (k, f) => (store.delete(k), cb(f, true)),
        removeItems: (ks, f) => (ks.forEach((k) => store.delete(k)), cb(f, true)),
        getKeys: (f) => cb(f, [...store.keys()]),
      },
      onEvent() {},
      offEvent() {},
      openTelegramLink() {},
    },
  };
};

const open = async (cloud, local) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await ctx.route(/telegram\.org/, (r) => r.abort());
  await ctx.addInitScript(mockTelegram, cloud);
  if (local)
    await ctx.addInitScript(([k, v]) => localStorage.getItem(k) ?? localStorage.setItem(k, v), local);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  return { ctx, page, errors };
};
const step = async (name, fn) => {
  try {
    await fn();
    console.log('✓', name);
  } catch (e) {
    console.log('✗', name, '—', e.message.split('\n')[0]);
    await browser.close();
    process.exit(1);
  }
};

let cloudSnapshot = {};
let localSnapshot = '';
await step('сейв по id пользователя, отступы Telegram, зеркало в облако', async () => {
  const { ctx, page, errors } = await open({});
  await page.getByText('Tap to start').click({ timeout: 30000 });
  await page.getByRole('button', { name: /New game/ }).click();
  await page.locator('.st-canvas canvas').waitFor({ timeout: 30000 });
  // Сейв пишется с задержкой в 100 мс, а поселение открывается сразу
  await page.waitForFunction(() => Object.keys(localStorage).some((k) => k.startsWith('pawfield:save:')), null, { timeout: 5000 });
  const key = await page.evaluate(() =>
    Object.keys(localStorage).find((k) => k.startsWith('pawfield:save:')),
  );
  if (key !== 'pawfield:save:42') throw new Error(`ключ сейва ${key}`);
  const top = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.pawfield')).getPropertyValue('--tg-safe-top').trim(),
  );
  if (top !== '50px') throw new Error(`--tg-safe-top = ${top}`);
  await page.waitForFunction(() => window.__tg.store.has('pf_meta'), null, { timeout: 8000 });
  cloudSnapshot = await page.evaluate(() => Object.fromEntries(window.__tg.store));
  localSnapshot = await page.evaluate(() => localStorage.getItem('pawfield:save:42'));
  if (errors.length) throw new Error(errors.join('; '));
  await ctx.close();
});
await step('кнопка «Назад»: из деревни — в меню, в бою — пауза и подтверждение закрытия', async () => {
  const { ctx, page } = await open(cloudSnapshot, ['pawfield:save:42', localSnapshot]);
  await page.getByText('Tap to start').click({ timeout: 30000 });
  await page.evaluate(() => {
    location.hash = '#/village';
  });
  await page.waitForFunction(() => window.__tg.back.isVisible);
  await page.evaluate(() => window.__tg.back.handlers.at(-1)());
  await page.waitForFunction(() => location.hash === '#/' || location.hash === '');
  await page
    .getByRole('button', { name: /Continue/ })
    .first()
    .click();
  await page.evaluate(() => window.__pf.settlement.open('gate'));
  await page.getByRole('button', { name: /Plan a sortie/ }).click();
  await page.getByRole('button', { name: 'Skirmish' }).click();
  await page.locator('.diff-card:not(.locked)').first().click();
  await page.getByRole('button', { name: /^Next/ }).click();
  await page.getByRole('button', { name: /Start battle/ }).click();
  await page.locator('#battle-canvas canvas').waitFor({ timeout: 30000 });
  await page.waitForFunction(() => window.__tg.closing === true);
  await page.evaluate(() => window.__tg.back.handlers.at(-1)());
  await page
    .getByText(/Retreat|Отступить/)
    .first()
    .waitFor({ timeout: 5000 });
  await ctx.close();
});
await step('облако новее локального — экран выбора, «Загрузить из облака»', async () => {
  // Локальный сейв «старее» на час и без ростера; в облаке — сыгранная игра
  const old = JSON.parse(localSnapshot);
  old.updatedAt -= 3_600_000;
  delete old.army;
  const { ctx, page, errors } = await open(cloudSnapshot, ['pawfield:save:42', JSON.stringify(old)]);
  await page.getByText('Found progress from another device').waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: /Load from cloud/ }).click();
  await page.getByText('Tap to start').click({ timeout: 30000 });
  const units = await page.evaluate(() => window.__pf.save.get().army?.units.length ?? 0);
  if (units === 0) throw new Error('облачный сейв не загружен');
  if (errors.length) throw new Error(errors.join('; '));
  await ctx.close();
});

await browser.close();
console.log('telegram smoke ok');
