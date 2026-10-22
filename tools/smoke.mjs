// Headless smoke test игрового цикла: главный экран → новая игра → деревня → Лавка → вылазка (2 шага) → бой с предметом →
// сдача → итоги → деревня → «Продолжить» после перезагрузки. Нужен запущенный `VITE_BASE_PATH=/my-fe/ pnpm preview`.
//   node tools/smoke.mjs [url] [путь к Chromium]
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:4173/my-fe/';
const executablePath = process.argv[3] ?? process.env.CHROMIUM_PATH;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});
const pf = (fn, arg) => page.evaluate(fn, arg);
const step = async (name, fn) => {
  try {
    await fn();
    console.log('✓', name);
  } catch (e) {
    console.log('✗', name, '—', e.message.split('\n')[0]);
    await page.screenshot({ path: '/tmp/smoke-fail.png' });
    await browser.close();
    process.exit(1);
  }
};

await step('splash → главный экран', async () => {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await pf(() => localStorage.clear());
  await page.reload();
  await page.getByText('Tap to start').click({ timeout: 30000 });
  await page.getByRole('button', { name: /New game/ }).waitFor();
});
await step('новая игра → деревня', async () => {
  await page.getByRole('button', { name: /New game/ }).click();
  await page.locator('.vl-canvas canvas').waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
});
await step('Лавка: покупка пластырей', async () => {
  await pf(() => {
    const s = window.__pf.save.get();
    window.__pf.save.set({ ...s, profile: { ...s.profile, treats: 500 } });
  });
  await pf(() => window.__pf.village.walkTo('store'));
  await page.getByRole('button', { name: /Shop: weapons/ }).click({ timeout: 15000 });
  await page.getByRole('tab', { name: 'Healing' }).click();
  await page.locator('.store-item button').first().click();
  await page.locator('.store-item button').first().click();
  const inv = await pf(() => window.__pf.save.get().inventory);
  if (!inv.itm_bandage) throw new Error(`инвентарь: ${JSON.stringify(inv)}`);
  await page.getByRole('button', { name: 'Back' }).click();
  await page.locator('.vl-canvas canvas').waitFor();
});
await step('ворота → вылазка 1/2 и 2/2', async () => {
  await pf(() => window.__pf.village.talk('sorties'));
  await page.getByRole('button', { name: /Plan a sortie/ }).click();
  await page.getByRole('button', { name: /^Next/ }).click();
  await page.locator('.foe-card').first().waitFor();
  await page.locator('.pack-row button', { hasText: '+' }).first().click();
  await page.getByRole('button', { name: /Start battle/ }).click();
  await page.locator('#battle-canvas canvas').waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500);
});
await step('бой: предмет из рюкзака', async () => {
  const pos = await pf(
    () => Object.values(window.__pf.save.get().battle.units).find((u) => u.side === 'player').pos,
  );
  await pf((p) => window.__pf.battle.tapTile(p), pos);
  await page.getByRole('button', { name: 'Items' }).click();
  await page.locator('.bf-item-target').first().click();
  await page.waitForTimeout(1200);
  const pack = await pf(() => window.__pf.save.get().battle.pack);
  if (Object.keys(pack).length !== 0) throw new Error(`рюкзак не потрачен: ${JSON.stringify(pack)}`);
});
await step('сдача → итоги → деревня', async () => {
  await pf(() => {
    location.hash = '#/';
  });
  await page.getByRole('button', { name: /Surrender/ }).click();
  await page.getByRole('button', { name: 'Surrender' }).last().click();
  await page.getByRole('button', { name: /To the village/ }).click({ timeout: 15000 });
  await page.locator('.vl-canvas canvas').waitFor();
});
await step('перезагрузка → «Продолжить»', async () => {
  await page.reload();
  await page.getByText('Tap to start').click({ timeout: 30000 });
  await pf(() => {
    location.hash = '#/';
  });
  await page
    .getByRole('button', { name: /^🏡 Continue|Continue/ })
    .first()
    .waitFor();
});

await browser.close();
if (errors.length) {
  console.log('Ошибки на странице:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('smoke ok');
