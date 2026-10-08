// Смоук боя: Нормально → ходы до первого столкновения → атака игрока с кинематиком → до конца или 10 ходов.
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:4173/my-fe/';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const confirmEndTurn = async () => {
  await page.waitForTimeout(250);
  const c = page.getByRole('button', { name: /^Завершить$/ });
  if (await c.count()) await c.first().click();
};
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
const log = (...a) => console.log(...a);

const readBattle = () => page.evaluate(() => {
  const raw = localStorage.getItem('pawfield:save:local');
  if (!raw) return null;
  const s = JSON.parse(raw);
  return s.battle ? { difficulty: s.battle.difficulty, phase: s.battle.phase, turn: s.battle.turn, result: s.battle.result ?? null, units: Object.values(s.battle.units).map((u) => ({ id: u.unitId, side: u.side, pos: u.pos, hp: u.hp, alive: u.alive, acted: u.acted, weapon: s.battle.roster[u.unitId]?.skills.weapon, cls: s.battle.roster[u.unitId]?.classId })) } : null;
});

const geom = async () => {
  const box = await page.locator('#battle-canvas canvas').boundingBox();
  const lay = await page.evaluate(() => window.__pf?.layout?.get?.() ?? null);
  const tile = lay?.tile ?? Math.min(box.width / 6, box.height / 8);
  const ox = box.x + (lay?.ox ?? (box.width - tile * 6) / 2);
  const oy = box.y + (lay?.oy ?? (box.height - tile * 8) / 2);
  return { tile, ox, oy };
};
const tileClick = async (pos) => {
  const { tile, ox, oy } = await geom();
  await page.mouse.click(ox + tile * (pos.x + 0.5), oy + tile * (pos.y + 0.5));
};

const waitIdle = async (ms = 20000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const b = await readBattle();
    if (!b) return;
    if (b.result) return;
    if (b.phase === 'player' && (await page.getByRole('button', { name: /Завершить ход/ }).count())) return;
    await page.waitForTimeout(300);
  }
};

await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const splash = page.getByText('Нажмите, чтобы начать');
if (await splash.count()) await splash.first().click();
await page.getByRole('button', { name: /В бой/ }).first().click();
await page.waitForURL(/army\/create/);
await page.waitForTimeout(300);
const cards = page.locator('.card');
for (let i = 0; i < 4; i++) {
  await cards.nth(i).click();
  await page.waitForTimeout(120);
  const take = page.getByRole('button', { name: /^Взять$/ });
  if (await take.count()) await take.first().click();
  await page.waitForTimeout(120);
}
await page.getByRole('button', { name: /Подтвердить/ }).first().click();
await page.waitForURL(/battle\/setup/);
const normal = page.getByText(/^Нормально$/);
if (await normal.count()) await normal.first().click();
await page.getByRole('button', { name: /Начать бой/ }).first().click();
await page.waitForURL(/#\/battle$/);
await page.waitForSelector('#battle-canvas canvas');
await page.waitForTimeout(1200);
log('✓ бой начат');

const readUi = () => page.evaluate(() => {
  const ui = window.__pf?.ui?.get();
  if (!ui) return null;
  return { mode: ui.mode, busy: ui.busy, selectedId: ui.selectedId ?? null, attackTiles: [...(ui.attackTiles ?? [])], assistTiles: [...(ui.assistTiles ?? [])] };
});
const cancelAny = async () => {
  for (const name of [/Отмена/, /Закрыть/]) {
    const btn = page.getByRole('button', { name });
    if (await btn.count()) { await btn.first().click(); await page.waitForTimeout(150); return; }
  }
};

let attacks = 0;
for (let iter = 0; iter < 40; iter++) {
  await waitIdle();
  let b = await readBattle();
  if (!b || b.result) break;
  if (b.phase !== 'player') { await page.waitForTimeout(500); continue; }
  const players = b.units.filter((u) => u.side === 'player' && u.alive && !u.acted);
  let attacked = false;
  for (const p of players) {
    await tileClick(p.pos);
    await page.waitForTimeout(250);
    const ui = await readUi();
    if (!ui || ui.selectedId !== p.id || ui.attackTiles.length === 0) { await cancelAny(); continue; }
    const [tx, ty] = ui.attackTiles[0].split(',').map(Number);
    await tileClick({ x: tx, y: ty });
    await page.waitForTimeout(350);
    const confirmBtn = page.getByRole('button', { name: /Атаковать|Подтвердить/ });
    if (!(await confirmBtn.count())) { await cancelAny(); continue; }
    await confirmBtn.first().click();
    attacks++;
    log(`✓ атака #${attacks} (ход ${b.turn})`);
    if (process.env.SMOKE_BURST && attacks === 1) {
      for (let k = 0; k < 16; k++) {
        await page.waitForTimeout(250);
        await page.screenshot({ path: `/tmp/burst-${String(k).padStart(2, '0')}.png` });
      }
    }
    await page.waitForTimeout(700);
    await page.screenshot({ path: `/tmp/smoke-combat-${attacks}.png` });
    await waitIdle();
    attacked = true;
    if (process.env.SMOKE_BURST) { iter = 999; }
    break;
  }
  b = await readBattle();
  if (!b || b.result) break;
  if (!attacked) {
    await cancelAny();
    const endBtn = page.getByRole('button', { name: /Завершить ход/ });
    if (await endBtn.count()) {
      await endBtn.first().click();
      await confirmEndTurn();
      log(`→ конец хода ${b.turn}`);
      await page.waitForTimeout(800);
      await waitIdle(30000);
    } else {
      const ui = await readUi();
      log('нет кнопки конца хода; ui =', JSON.stringify(ui));
      await page.waitForTimeout(500);
    }
  }
  if (b.turn > 12) break;
}
const fin = await readBattle();
log('итог:', fin ? `${fin.difficulty}, ход ${fin.turn}, result=${fin.result}` : 'бой завершён (battle удалён)', `атак игрока: ${attacks}`);
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/smoke-combat-end.png' });
log('URL:', page.url());
console.log(errors.length ? `ERRORS (${errors.length}):\n` + errors.join('\n') : 'no console/page errors');
await browser.close();
process.exit(errors.length ? 1 : 0);
