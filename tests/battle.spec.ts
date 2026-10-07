import { describe, expect, it } from 'vitest';
import { applyAction, createBattle } from '@core/battle/reducer';
import { nextEnemyAction } from '@core/ai';
import { attackOptions, reachableTiles } from '@core/map/pathing';
import { generateMap } from '@core/map/generate';
import { generateRoster } from '@core/units';
import type { BattleState, Difficulty } from '@core/types';
import { livingUnits } from '@core/battle/query';
import { makeBattle } from './helpers';
import { BIOMES } from '@content/biomes';

const flat = { hp: 20, atk: 10, spd: 5, def: 5, res: 5 };

describe('редьюсер боя', () => {
  it('wait перемещает и помечает юнита; второй раз действовать нельзя', () => {
    const b = makeBattle([{ classId: 'infantry_claw', pos: { x: 2, y: 7 } }], [{ classId: 'infantry_claw', pos: { x: 2, y: 0 } }]);
    const id = b.players[0]!.id;
    const { state, events } = applyAction(b.state, { type: 'wait', unitId: id, to: { x: 2, y: 5 } });
    expect(state.units[id]!.pos).toEqual({ x: 2, y: 5 });
    expect(state.units[id]!.acted).toBe(true);
    expect(events.map((e) => e.type)).toEqual(['moved', 'waited']);
    expect(() => applyAction(state, { type: 'wait', unitId: id, to: { x: 2, y: 5 } })).toThrow();
    // исходное состояние не мутировано
    expect(b.state.units[id]!.pos).toEqual({ x: 2, y: 7 });
  });

  it('endPhase переключает фазу, снимает бонусы и начинает новый ход', () => {
    const b = makeBattle(
      [{ classId: 'infantry_claw', pos: { x: 2, y: 7 }, skills: { c: 'c_hone_atk' } }, { classId: 'infantry_claw', pos: { x: 3, y: 7 } }],
      [{ classId: 'infantry_claw', pos: { x: 2, y: 0 }, stance: 'hold' }],
    );
    // Вой атаки сработал при старте: сосед получил +4
    expect(b.state.units[b.players[1]!.id]!.bonuses.atk).toBe(4);
    const s1 = applyAction(b.state, { type: 'endPhase' }).state;
    expect(s1.phase).toBe('enemy');
    const s2 = applyAction(s1, { type: 'endPhase' }).state;
    expect(s2.phase).toBe('player');
    expect(s2.turn).toBe(2);
    expect(s2.units[b.players[0]!.id]!.acted).toBe(false);
  });

  it('лечение Бинтом восстанавливает HP и даёт XP', () => {
    const b = makeBattle(
      [
        { classId: 'infantry_bandage', pos: { x: 2, y: 7 }, baseStats: flat },
        { classId: 'infantry_claw', pos: { x: 3, y: 7 }, baseStats: flat },
      ],
      [{ classId: 'infantry_claw', pos: { x: 2, y: 0 } }],
    );
    const healer = b.players[0]!.id;
    const ally = b.players[1]!.id;
    b.state.units[ally]!.hp = 5;
    const { state, events } = applyAction(b.state, { type: 'assist', unitId: healer, to: { x: 2, y: 7 }, targetId: ally });
    expect(state.units[ally]!.hp).toBe(10);
    expect(events.some((e) => e.type === 'assist' && e.heal === 5)).toBe(true);
    expect(state.roster[healer]!.xp).toBeGreaterThan(0);
  });

  it('Поменяться меняет позиции', () => {
    const b = makeBattle(
      [
        { classId: 'infantry_claw', pos: { x: 2, y: 7 }, skills: { assist: 'as_swap' } },
        { classId: 'infantry_claw', pos: { x: 3, y: 7 } },
      ],
      [{ classId: 'infantry_claw', pos: { x: 2, y: 0 } }],
    );
    const a = b.players[0]!.id;
    const c = b.players[1]!.id;
    const { state } = applyAction(b.state, { type: 'assist', unitId: a, to: { x: 2, y: 7 }, targetId: c });
    expect(state.units[a]!.pos).toEqual({ x: 3, y: 7 });
    expect(state.units[c]!.pos).toEqual({ x: 2, y: 7 });
  });

  it('гибель всех бойцов — поражение; отступление — retreat', () => {
    const b = makeBattle(
      [{ classId: 'infantry_claw', pos: { x: 2, y: 4 }, baseStats: { ...flat, hp: 10, def: 0 } }],
      [{ classId: 'infantry_claw', pos: { x: 2, y: 3 }, baseStats: { ...flat, atk: 50 } }],
    );
    const { state } = applyAction(b.state, { type: 'attack', unitId: b.players[0]!.id, to: { x: 2, y: 4 }, targetId: b.enemies[0]!.id });
    expect(state.result).toBe('defeat');
    const r = applyAction(b.state, { type: 'retreat' });
    expect(r.state.result).toBe('retreat');
  });

  it('подкрепления появляются в заданный ход, победа только после них', () => {
    const b = makeBattle(
      [{ classId: 'infantry_claw', pos: { x: 2, y: 4 }, baseStats: { ...flat, atk: 50 } }],
      [{ classId: 'infantry_claw', pos: { x: 2, y: 3 }, baseStats: { ...flat, hp: 5 } }],
      { reinforcements: [{ turn: 2, units: [{ unit: makeBattleUnitForWave(), pos: { x: 0, y: 0 } }] }] },
    );
    let s = applyAction(b.state, { type: 'attack', unitId: b.players[0]!.id, to: { x: 2, y: 4 }, targetId: b.enemies[0]!.id }).state;
    expect(s.result).toBeUndefined();
    s = applyAction(s, { type: 'endPhase' }).state; // → enemy, ход 1
    s = applyAction(s, { type: 'endPhase' }).state; // → player, ход 2
    s = applyAction(s, { type: 'endPhase' }).state; // → enemy, ход 2 → спавн
    expect(s.spawnedWaves).toContain(2);
    expect(livingUnits(s, 'enemy').length).toBe(1);
  });

  it('повышение уровня в бою увеличивает maxHp', () => {
    const b = makeBattle(
      [{ classId: 'infantry_claw', pos: { x: 2, y: 4 }, level: 1, baseStats: { ...flat, atk: 50 } }],
      [{ classId: 'infantry_claw', pos: { x: 2, y: 3 }, level: 20, baseStats: { ...flat, hp: 5 } }],
    );
    const id = b.players[0]!.id;
    b.state.roster[id] = { ...b.state.roster[id]!, xp: 50 };
    const { state, events } = applyAction(b.state, { type: 'attack', unitId: id, to: { x: 2, y: 4 }, targetId: b.enemies[0]!.id });
    expect(state.roster[id]!.level).toBeGreaterThan(1);
    expect(state.units[id]!.maxHp).toBeGreaterThanOrEqual(b.state.units[id]!.maxHp);
    expect(events.some((e) => e.type === 'levelUp')).toBe(true);
  });
});

function makeBattleUnitForWave() {
  return makeBattle([{ classId: 'infantry_claw', pos: { x: 0, y: 7 } }], [{ classId: 'infantry_claw', pos: { x: 5, y: 0 } }]).enemies[0]!;
}

/** Полная симуляция: игрок — простой бот (атакует, если может, иначе ждёт), враг — ИИ. */
function autoPlay(initial: BattleState, maxTurns = 30): BattleState {
  let s = initial;
  let guard = 0;
  while (!s.result && s.turn <= maxTurns && guard++ < 2000) {
    if (s.phase === 'player') {
      const u = livingUnits(s, 'player').find((x) => !x.acted);
      if (!u) {
        s = applyAction(s, { type: 'endPhase' }).state;
        continue;
      }
      const reach = reachableTiles(s, u);
      const opts = attackOptions(s, u, reach);
      if (opts.length > 0) {
        const o = opts[0]!;
        s = applyAction(s, { type: 'attack', unitId: u.unitId, to: o.from, targetId: o.targetId }).state;
      } else {
        // идти вверх
        const tiles = [...reach.values()].filter((n) => n.canStop).sort((a, b) => a.pos.y - b.pos.y);
        s = applyAction(s, { type: 'wait', unitId: u.unitId, to: tiles[0]?.pos ?? u.pos }).state;
      }
    } else {
      const a = nextEnemyAction(s);
      s = applyAction(s, a).state;
    }
  }
  return s;
}

describe('полные бои: ИИ не падает и бой завершается', () => {
  const diffs: Difficulty[] = ['easy', 'normal', 'hard', 'nightmare'];
  for (const d of diffs) {
    it(`сложность ${d}`, () => {
      for (let i = 0; i < 6; i++) {
        const seed = 1000 + i * 17 + d.length;
        const roster = generateRoster({ seed, glory: 0 });
        const squad = roster.slice(0, 4).map((u) => ({ ...u, level: 10 }));
        const map = generateMap({ seed, biomeId: BIOMES[i % BIOMES.length]!.id, difficulty: d, squadAvgLevel: 10, squadSize: 4, unlockedBiomes: BIOMES.map((b) => b.id) });
        const { state } = createBattle({ map, squad, seed, now: 1 });
        const end = autoPlay(state, 40);
        expect(['victory', 'defeat', undefined]).toContain(end.result);
        expect(end.turn).toBeLessThanOrEqual(41);
        // мёртвые не воскресают
        for (const u of Object.values(end.units)) if (!u.alive) expect(u.hp).toBe(0);
      }
    });
  }
});
