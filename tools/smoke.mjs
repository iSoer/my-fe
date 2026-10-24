// Headless smoke test игрового цикла: главный экран → новая игра → деревня → Лавка → вылазка (2 шага) → бой →
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
await step('Лавка: покупка талисмана', async () => {
  await pf(() => {
    const s = window.__pf.save.get();
    window.__pf.save.set({ ...s, profile: { ...s.profile, treats: 500 } });
  });
  await pf(() => window.__pf.village.walkTo('store'));
  await page.getByRole('button', { name: /Shop: weapons/ }).click({ timeout: 15000 });
  await page.getByRole('tab', { name: 'Talismans' }).click();
  await page.locator('.store-item button').first().click();
  const inv = await pf(() => window.__pf.save.get().inventory);
  if (!Object.keys(inv).some((id) => id.startsWith('tal_'))) throw new Error(`инвентарь: ${JSON.stringify(inv)}`);
  await page.getByRole('button', { name: 'Back' }).click();
  await page.locator('.vl-canvas canvas').waitFor();
});
await step('ворота → вылазка 1/2 и 2/2', async () => {
  await pf(() => window.__pf.village.talk('sorties'));
  await page.getByRole('button', { name: /Plan a sortie/ }).click();
  await page.locator('.diff-card:not(.locked)').first().click();
  await page.getByRole('button', { name: /^Next/ }).click();
  await page.locator('.foe-card').first().waitFor();
  await page.getByRole('button', { name: /Start battle/ }).click();
  await page.locator('#battle-canvas canvas').waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500);
});
await step('сдача → итоги → деревня', async () => {
  await pf(() => {
    location.hash = '#/';
  });
  await page.getByRole('button', { name: /Surrender/ }).click();
  await page.getByRole('button', { name: 'Surrender' }).last().click();
  // Итоги по шагам: «Далее», пока не появится «В деревню»
  const village = page.getByRole('button', { name: /To the village/ });
  await page.getByRole('button', { name: /^(➜ )?Next$|To the village/ }).first().waitFor({ timeout: 15000 });
  for (let i = 0; i < 4 && !(await village.count()); i++) {
    await page.getByRole('button', { name: /Next/ }).first().click();
    await page.waitForTimeout(300);
  }
  await village.click({ timeout: 15000 });
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
