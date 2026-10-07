import { describe, expect, it } from 'vitest';
import { simulateCombat, triangleOf } from '@core/combat';
import { weaponDef } from '@content/weapons';
import { makeBattle, plainTiles } from './helpers';
import { visibleStats } from '@core/units';
import { applyAction } from '@core/battle/reducer';

const flat = { hp: 20, atk: 10, spd: 5, def: 5, res: 5 };

describe('треугольник оружия', () => {
  it('коготь > палка > клык > коготь; бесцветные нейтральны', () => {
    expect(triangleOf(weaponDef('claw_basic'), weaponDef('stick_basic'))).toBe('adv');
    expect(triangleOf(weaponDef('stick_basic'), weaponDef('fang_basic'))).toBe('adv');
    expect(triangleOf(weaponDef('fang_basic'), weaponDef('claw_basic'))).toBe('adv');
    expect(triangleOf(weaponDef('claw_basic'), weaponDef('fang_basic'))).toBe('dis');
    expect(triangleOf(weaponDef('slingshot_basic'), weaponDef('claw_basic'))).toBe('neutral');
    expect(triangleOf(weaponDef('hiss_basic'), weaponDef('growl_basic'))).toBe('adv');
  });
});

describe('simulateCombat', () => {
  it('базовый урон = Atk − Def, обе стороны бьют по разу при равной скорости', () => {
    const b = makeBattle(
      [{ classId: 'infantry_claw', pos: { x: 2, y: 4 }, baseStats: flat, species: 'dog' }],
      [{ classId: 'infantry_claw', pos: { x: 2, y: 3 }, baseStats: flat, species: 'dog' }],
    );
    const [p] = b.players;
    const [e] = b.enemies;
    const out = simulateCombat(b.state, p!.id, e!.id, { x: 2, y: 4 });
    const atk = visibleStats(p!).atk; // 10 + Mt 6 (+ видовой сдвиг не трогает atk)
    const def = visibleStats(e!).def;
    expect(out.strikes.length).toBe(2);
    expect(out.strikes[0]!.damage).toBe(Math.max(0, atk - def));
    expect(out.strikes[1]!.isCounter).toBe(true);
    expect(out.attackerFollowUp).toBe(false);
    expect(out.defenderFollowUp).toBe(false);
  });

  it('преимущество треугольника даёт +20 % атаки, недостаток −20 %', () => {
    const b = makeBattle(
      [{ classId: 'infantry_claw', pos: { x: 2, y: 4 }, baseStats: flat, species: 'dog' }],
      [
        { classId: 'infantry_stick', pos: { x: 2, y: 3 }, baseStats: flat, species: 'dog' },
        { classId: 'infantry_fang', pos: { x: 3, y: 4 }, baseStats: flat, species: 'dog' },
      ],
    );
    const p = b.players[0]!;
    const atk = visibleStats(p).atk;
    const def = visibleStats(b.enemies[0]!).def;
    const adv = simulateCombat(b.state, p.id, b.enemies[0]!.id, { x: 2, y: 4 });
    const dis = simulateCombat(b.state, p.id, b.enemies[1]!.id, { x: 2, y: 4 });
    expect(adv.triangle).toBe('adv');
    expect(adv.strikes[0]!.damage).toBe(atk + Math.floor(atk * 0.2) - def);
    expect(dis.triangle).toBe('dis');
    expect(dis.strikes[0]!.damage).toBe(Math.max(0, atk - Math.floor(atk * 0.2) - def));
  });

  it('скорость +5 даёт двойную атаку в правильном порядке', () => {
    const b = makeBattle(
      [{ classId: 'infantry_claw', pos: { x: 2, y: 4 }, baseStats: { ...flat, spd: 12 }, species: 'dog' }],
      [{ classId: 'infantry_claw', pos: { x: 2, y: 3 }, baseStats: { ...flat, spd: 5 }, species: 'dog' }],
    );
    const out = simulateCombat(b.state, b.players[0]!.id, b.enemies[0]!.id, { x: 2, y: 4 });
    expect(out.attackerFollowUp).toBe(true);
    expect(out.strikes.map((s) => s.isCounter)).toEqual([false, true, false]);
  });

  it('дальник не получает контратаку от ближника и наоборот', () => {
    const b = makeBattle(
      [{ classId: 'infantry_slingshot', pos: { x: 2, y: 5 }, baseStats: flat, species: 'dog' }],
      [{ classId: 'infantry_claw', pos: { x: 2, y: 3 }, baseStats: flat, species: 'dog' }],
    );
    const out = simulateCombat(b.state, b.players[0]!.id, b.enemies[0]!.id, { x: 2, y: 5 });
    expect(out.defenderCanCounter).toBe(false);
    expect(out.strikes.every((s) => !s.isCounter)).toBe(true);
  });

  it('Дальний контрудар позволяет ближнику ответить дальнику', () => {
    const b = makeBattle(
      [{ classId: 'infantry_slingshot', pos: { x: 2, y: 5 }, baseStats: flat, species: 'dog' }],
      [{ classId: 'infantry_claw', pos: { x: 2, y: 3 }, baseStats: flat, species: 'dog', skills: { a: 'a_distant_counter' } }],
    );
    const out = simulateCombat(b.state, b.players[0]!.id, b.enemies[0]!.id, { x: 2, y: 5 });
    expect(out.defenderCanCounter).toBe(true);
  });

  it('рогатка эффективна против летунов (×1.5)', () => {
    const b = makeBattle(
      [{ classId: 'infantry_slingshot', pos: { x: 2, y: 5 }, baseStats: flat, species: 'dog' }],
      [{ classId: 'flier_claw', pos: { x: 2, y: 3 }, baseStats: flat, species: 'dog' }],
    );
    const p = b.players[0]!;
    const out = simulateCombat(b.state, p.id, b.enemies[0]!.id, { x: 2, y: 5 });
    const atk = Math.floor(visibleStats(p).atk * 1.5);
    expect(out.attackerEffective).toBe(true);
    expect(out.strikes[0]!.damage).toBe(atk - visibleStats(b.enemies[0]!).def);
  });

  it('Укрытие даёт +30 % Def, Бинт бьёт вполсилы по Res', () => {
    const b = makeBattle(
      [{ classId: 'infantry_bandage', pos: { x: 2, y: 5 }, baseStats: flat, species: 'dog' }],
      [{ classId: 'infantry_claw', pos: { x: 2, y: 3 }, baseStats: { ...flat, res: 4 }, species: 'dog' }],
      { tiles: plainTiles({ '2,3': 'cover' }) },
    );
    const p = b.players[0]!;
    const out = simulateCombat(b.state, p.id, b.enemies[0]!.id, { x: 2, y: 5 });
    const atk = visibleStats(p).atk;
    let res = visibleStats(b.enemies[0]!).res;
    res += Math.floor(res * 0.3);
    expect(out.strikes[0]!.damage).toBe(Math.floor(Math.max(0, atk - res) * 0.5));
  });

  it('спецприём срабатывает при кулдауне 0 и сбрасывается', () => {
    const b = makeBattle(
      [{ classId: 'infantry_claw', pos: { x: 2, y: 4 }, baseStats: { ...flat, spd: 20 }, species: 'dog', skills: { special: 'sp_glimmer' } }],
      [{ classId: 'infantry_claw', pos: { x: 2, y: 3 }, baseStats: { ...flat, hp: 60 }, species: 'dog' }],
    );
    const p = b.players[0]!;
    const st = b.state;
    st.units[p.id]!.specialCd = 0;
    const out = simulateCombat(st, p.id, b.enemies[0]!.id, { x: 2, y: 4 });
    const base = visibleStats(p).atk - visibleStats(b.enemies[0]!).def;
    expect(out.strikes[0]!.special).toBe('sp_glimmer');
    expect(out.strikes[0]!.damage).toBe(base + Math.floor(base * 0.5));
    // кулдаун сброшен до 2, затем −1 за полученный контрудар и −1 за свою двойную атаку → 0, но второго срабатывания нет
    expect(out.strikes.filter((s) => s.special).length).toBe(1);
    expect(out.attacker.specialTriggered).toBe(true);
  });

  it('двойное оружие бьёт дважды подряд при инициативе и не при защите', () => {
    const b = makeBattle(
      [{ classId: 'infantry_claw', pos: { x: 2, y: 4 }, baseStats: { ...flat, spd: 10 }, species: 'dog', skills: { weapon: 'claw_brave' } }],
      [{ classId: 'infantry_claw', pos: { x: 2, y: 3 }, baseStats: { ...flat, hp: 80, spd: 5 }, species: 'dog' }],
    );
    const out = simulateCombat(b.state, b.players[0]!.id, b.enemies[0]!.id, { x: 2, y: 4 });
    // brave даёт -5 Spd → 10-5=5 → без двойной от скорости; 2 удара подряд + контратака
    expect(out.strikes.map((s) => s.isCounter)).toEqual([false, false, true]);
  });

  it('смерть прерывает бой, прогноз совпадает с результатом редьюсера', () => {
    const b = makeBattle(
      [{ classId: 'infantry_claw', pos: { x: 2, y: 4 }, baseStats: { ...flat, atk: 40 }, species: 'dog' }],
      [{ classId: 'infantry_claw', pos: { x: 2, y: 3 }, baseStats: { ...flat, hp: 15 }, species: 'dog' }],
    );
    const p = b.players[0]!;
    const e = b.enemies[0]!;
    const fc = simulateCombat(b.state, p.id, e.id, { x: 2, y: 4 });
    expect(fc.defender.died).toBe(true);
    expect(fc.strikes.length).toBe(1);
    const { state, events } = applyAction(b.state, { type: 'attack', unitId: p.id, to: { x: 2, y: 4 }, targetId: e.id });
    expect(state.units[e.id]!.alive).toBe(false);
    expect(state.units[e.id]!.hp).toBe(fc.defender.hpAfter);
    expect(events.some((ev) => ev.type === 'died' && ev.unitId === e.id)).toBe(true);
    expect(state.result).toBe('victory');
  });

  it('Ответка даёт гарантированную двойную при защите', () => {
    const b = makeBattle(
      [{ classId: 'infantry_claw', pos: { x: 2, y: 4 }, baseStats: { ...flat, spd: 10 }, species: 'dog' }],
      [{ classId: 'infantry_claw', pos: { x: 2, y: 3 }, baseStats: { ...flat, hp: 80, spd: 1 }, species: 'dog', skills: { b: 'b_quick_riposte' } }],
    );
    const out = simulateCombat(b.state, b.players[0]!.id, b.enemies[0]!.id, { x: 2, y: 4 });
    expect(out.defenderFollowUp).toBe(true);
  });

  it('Отчаяние переносит двойную атаку до контрудара', () => {
    const b = makeBattle(
      [{ classId: 'infantry_claw', pos: { x: 2, y: 4 }, baseStats: { ...flat, spd: 20 }, species: 'dog', skills: { b: 'b_desperation' } }],
      [{ classId: 'infantry_claw', pos: { x: 2, y: 3 }, baseStats: { ...flat, hp: 80 }, species: 'dog' }],
    );
    const st = b.state;
    const p = st.units[b.players[0]!.id]!;
    p.hp = Math.floor(p.maxHp * 0.5);
    const out = simulateCombat(st, b.players[0]!.id, b.enemies[0]!.id, { x: 2, y: 4 });
    expect(out.strikes.map((s) => s.isCounter)).toEqual([false, false, true]);
  });

  it('Девять жизней спасает кота с 1 HP', () => {
    const b = makeBattle(
      [{ classId: 'infantry_claw', pos: { x: 2, y: 4 }, baseStats: { ...flat, atk: 50 }, species: 'dog' }],
      [{ classId: 'infantry_claw', pos: { x: 2, y: 3 }, baseStats: { ...flat, hp: 20 }, species: 'cat', skills: { special: 'sp_miracle' } }],
    );
    const st = b.state;
    st.units[b.enemies[0]!.id]!.specialCd = 0;
    const out = simulateCombat(st, b.players[0]!.id, b.enemies[0]!.id, { x: 2, y: 4 });
    expect(out.strikes[0]!.miracle).toBe(true);
    expect(out.defender.hpAfter).toBe(1);
  });

  it('Репейник вешает штраф после боя', () => {
    const b = makeBattle(
      [{ classId: 'infantry_burr', pos: { x: 2, y: 5 }, baseStats: flat, species: 'dog' }],
      [{ classId: 'infantry_claw', pos: { x: 2, y: 3 }, baseStats: { ...flat, hp: 90 }, species: 'dog' }],
    );
    const { state } = applyAction(b.state, { type: 'attack', unitId: b.players[0]!.id, to: { x: 2, y: 5 }, targetId: b.enemies[0]!.id });
    expect(state.units[b.enemies[0]!.id]!.penalties.def).toBe(-5);
  });
});
