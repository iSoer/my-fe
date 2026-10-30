// Headless smoke test игрового цикла: главный экран → новая игра → поселение (герой идёт по карте в три экрана) → постройка Лавки
// и покупка → вылазка (2 шага) → бой → сдача → итоги → поселение → «Продолжить» после перезагрузки. Нужен запущенный `VITE_BASE_PATH=/my-fe/ pnpm preview`.
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
await step('новая игра → поселение: Phaser-карта, построены одни Казармы, герой доходит до третьего экрана', async () => {
  await page.getByRole('button', { name: /New game/ }).click();
  await page.locator('.st-canvas canvas').waitFor({ timeout: 30000 });
  const built = await pf(() => Object.keys(window.__pf.save.get().settlement.buildings));
  if (built.join() !== 'barracks') throw new Error(`построено: ${built}`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: process.env.SMOKE_SHOT ?? '/tmp/smoke-settlement.png' });
  // Кладбище ещё не построено, но к участку можно подойти: герой идёт сам и открывает карточку
  await pf(() => window.__pf.settlement.walkTo('plot-graveyard'));
  await page.waitForFunction(() => window.__pf.settlement.panel.get() === 'plot-graveyard', null, { timeout: 20000 });
  const hero = await pf(() => window.__pf.save.get().settlement.hero);
  if (!hero || hero.pos.x < 22) throw new Error(`герой не дошёл до третьего экрана: ${JSON.stringify(hero)}`);
  await page.getByRole('button', { name: /^Build ·/ }).waitFor();
  await page.screenshot({ path: '/tmp/smoke-settlement-graveyard.png' });
  await page.keyboard.press('Escape');
  await pf(() => window.__pf.settlement.panel.set(null));
});
await step('Лавка: постройка и покупка талисмана', async () => {
  await pf(() => {
    const s = window.__pf.save.get();
    window.__pf.save.set({ ...s, profile: { ...s.profile, treats: 500 } });
  });
  // Здания — в меню над кнопкой ☰ рядом с «Вылазкой»
  await page.locator('.st-menu-toggle').click();
  await page.locator('.st-menu-item', { hasText: 'Shop' }).click();
  await page.getByRole('button', { name: /^Build ·/ }).click();
  await page.getByRole('button', { name: /Open the shop/ }).click({ timeout: 15000 });
  await page.getByRole('tab', { name: 'Talismans' }).click();
  await page.locator('.store-item button').first().click();
  const inv = await pf(() => window.__pf.save.get().inventory);
  if (!Object.keys(inv).some((id) => id.startsWith('tal_'))) throw new Error(`инвентарь: ${JSON.stringify(inv)}`);
  await page.getByRole('button', { name: 'Back' }).click();
  await page.locator('.st-canvas canvas').waitFor();
});
await step('ворота → вылазка 1/2 и 2/2', async () => {
  await page.locator('.st-sortie').click();
  await page.getByRole('button', { name: /Plan a sortie/ }).click();
  await page.locator('.diff-card:not(.locked)').first().click();
  await page.getByRole('button', { name: /^Next/ }).click();
  await page.locator('.foe-card').first().waitFor();
  await page.getByRole('button', { name: /Start battle/ }).click();
  await page.locator('#battle-canvas canvas').waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500);
});
// Кинематика удара: CinematicScene останавливается через scene.stop(), пока на экране ещё живут закреплённые
// (pinToScreen) кляксы крови. При плотности 2 это ловит падения при уничтожении сцены.
await step('кинематики ударов → сцена останавливается без ошибок', async () => {
  await pf(() => {
    const s = window.__pf.save.get();
    window.__pf.save.set({
      ...s,
      settings: { ...s.settings, cinematic: 'always', blood: 'sea', confirmAttack: true },
    });
  });
  // Враги ждут, пока к ним подойдут: каждый боец бьёт ближайшего врага, если достаёт, иначе идёт к нему
  const advance = () =>
    pf(async () => {
      const pf = window.__pf;
      const units = () => Object.values(pf.save.get().battle?.units ?? {});
      const idle = async () => {
        while (pf.ui.get().busy) await new Promise((r) => setTimeout(r, 50));
      };
      const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      let attacks = 0;
      for (const { unitId } of units().filter((u) => u.side === 'player')) {
        const me = units().find((u) => u.unitId === unitId);
        const foe = units()
          .filter((u) => u.side === 'enemy' && u.alive)
          .sort((a, b) => dist(a.pos, me?.pos) - dist(b.pos, me?.pos))[0];
        if (!me?.alive || me.acted || !foe) continue;
        pf.battle.tapTile(me.pos);
        pf.battle.tapTile(foe.pos);
        if (pf.ui.get().mode === 'forecast') {
          // Каждый удар (и ответный тоже) снимает больше 40% maxHp, и кинематика ставит кляксы (screenBloodSplat),
          // живущие ~1.4 с. Оба бойца выживают: долгой анимации смерти нет, сцена закрывается при кляксах на экране
          const s = pf.save.get();
          const tough = (u) => ({ ...u, hp: 999, maxHp: 1 });
          pf.save.set({
            ...s,
            battle: {
              ...s.battle,
              units: {
                ...s.battle.units,
                [foe.unitId]: tough(s.battle.units[foe.unitId]),
                [unitId]: tough(s.battle.units[unitId]),
              },
            },
          });
          // confirm ждёт проигрывания боя вместе с кинематикой
          await pf.battle.confirm();
          await idle();
          attacks++;
          continue;
        }
        pf.battle.tapTile(me.pos);
        const reach = [...(pf.ui.get().reach?.values() ?? [])].filter((n) => n.canStop);
        const to = reach.sort((a, b) => dist(a.pos, foe.pos) - dist(b.pos, foe.pos))[0];
        if (to) pf.battle.tapTile(to.pos);
        await idle();
      }
      return attacks;
    });
  // Исключение в цикле Phaser останавливает игру: кинематика не закончится, и ожидание повиснет навсегда.
  // Поэтому падаем сразу по первой ошибке на странице или по тайм-ауту
  const guarded = async (promise, what) => {
    let timer;
    const fail = new Promise((_, reject) => {
      const started = Date.now();
      timer = setInterval(() => {
        if (errors.length) reject(new Error(errors[0]));
        else if (Date.now() - started > 60000) reject(new Error(`${what}: игра зависла на 60 с`));
      }, 200);
    });
    try {
      return await Promise.race([promise, fail]);
    } finally {
      clearInterval(timer);
    }
  };
  // Несколько ударов: у отдельного удара может не быть урона (лекарь, броня), и тогда клякс нет
  let attacks = 0;
  for (let turn = 0; turn < 8 && attacks < 3; turn++) {
    attacks += await guarded(advance(), 'ход игрока');
    // endTurn ждёт всю фазу врагов вместе с кинематиками
    if (attacks < 3)
      await guarded(
        pf(() => window.__pf.battle.endTurn()),
        'ход врагов',
      );
    if (await pf(() => window.__pf.save.get().battle?.result))
      throw new Error('бой закончился раньше проверки');
  }
  if (attacks < 3) throw new Error(`за 8 ходов только ${attacks} удара`);
  // Остановка сцены обрабатывается в следующем кадре Phaser
  await page.waitForTimeout(1000);
  if (errors.length) throw new Error(errors[0]);
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
  await page.locator('.st-canvas canvas').waitFor();
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
