import { describe, expect, it } from 'vitest';
import { decideAction, enemyOrder, nextEnemyAction } from '@core/ai';
import { applyAction } from '@core/battle/reducer';
import { makeBattle } from './helpers';

const flat = { hp: 20, atk: 10, spd: 5, def: 5, res: 5 };

describe('ИИ врага', () => {
  it('hold стоит на месте, пока игрок вне зоны угрозы', () => {
    const b = makeBattle([{ classId: 'infantry_claw', pos: { x: 2, y: 7 } }], [{ classId: 'infantry_claw', pos: { x: 2, y: 0 }, stance: 'hold' }]);
    const s = applyAction(b.state, { type: 'endPhase' }).state;
    const a = decideAction(s, b.enemies[0]!.id);
    expect(a).toEqual({ type: 'wait', unitId: b.enemies[0]!.id, to: { x: 2, y: 0 } });
  });

  it('advance идёт к игроку, если не может атаковать', () => {
    const b = makeBattle([{ classId: 'infantry_claw', pos: { x: 2, y: 7 } }], [{ classId: 'infantry_claw', pos: { x: 2, y: 0 }, stance: 'advance' }]);
    const s = applyAction(b.state, { type: 'endPhase' }).state;
    const a = decideAction(s, b.enemies[0]!.id);
    expect(a.type).toBe('wait');
    if (a.type === 'wait') expect(a.to.y).toBeGreaterThan(0);
  });

  it('атакует, когда может убить, и выбирает убийство', () => {
    const b = makeBattle(
      [
        { classId: 'infantry_claw', pos: { x: 1, y: 4 }, baseStats: { ...flat, hp: 50 } },
        { classId: 'infantry_claw', pos: { x: 3, y: 4 }, baseStats: { ...flat, hp: 12, def: 0 } },
      ],
      [{ classId: 'infantry_claw', pos: { x: 2, y: 2 }, baseStats: { ...flat, atk: 12 }, stance: 'advance' }],
    );
    const s = applyAction(b.state, { type: 'endPhase' }).state;
    const a = decideAction(s, b.enemies[0]!.id);
    expect(a.type).toBe('attack');
    if (a.type === 'attack') expect(a.targetId).toBe(b.players[1]!.id);
  });

  it('детерминирован и порядок хода стабилен', () => {
    const b = makeBattle(
      [{ classId: 'infantry_claw', pos: { x: 2, y: 7 } }],
      [
        { classId: 'infantry_claw', pos: { x: 2, y: 0 } },
        { classId: 'infantry_claw', pos: { x: 2, y: 3 } },
      ],
    );
    const s = applyAction(b.state, { type: 'endPhase' }).state;
    expect(enemyOrder(s)[0]).toBe(b.enemies[1]!.id);
    expect(nextEnemyAction(s)).toEqual(nextEnemyAction(s));
  });

  it('hold просыпается от «шума боя» рядом и по таймеру хода', () => {
    const b = makeBattle(
      [{ classId: 'infantry_claw', pos: { x: 2, y: 7 } }],
      [
        { classId: 'infantry_claw', pos: { x: 2, y: 0 }, stance: 'hold' },
        { classId: 'infantry_claw', pos: { x: 3, y: 0 }, stance: 'hold', baseStats: { ...flat, hp: 30 } },
      ],
    );
    let s = applyAction(b.state, { type: 'endPhase' }).state;
    // раненый сосед — тревога
    s.units[b.enemies[1]!.id]!.hp = 10;
    const a = decideAction(s, b.enemies[0]!.id);
    expect(a.type).toBe('wait');
    if (a.type === 'wait') expect(a.to.y).toBeGreaterThan(0);
    // таймер: на нормальной сложности с 4-го хода все идут в атаку
    const b2 = makeBattle([{ classId: 'infantry_claw', pos: { x: 2, y: 7 } }], [{ classId: 'infantry_claw', pos: { x: 2, y: 0 }, stance: 'hold' }]);
    s = applyAction(b2.state, { type: 'endPhase' }).state;
    s = { ...s, turn: 4 };
    const a2 = decideAction(s, b2.enemies[0]!.id);
    if (a2.type === 'wait') expect(a2.to.y).toBeGreaterThan(0);
  });

  it('раненый враг отступает, если не может убить', () => {
    const b = makeBattle(
      [{ classId: 'infantry_claw', pos: { x: 2, y: 4 }, baseStats: { ...flat, hp: 60, def: 30 } }],
      [{ classId: 'infantry_claw', pos: { x: 2, y: 2 }, baseStats: { ...flat, hp: 40 }, stance: 'advance' }],
      { difficulty: 'hard' },
    );
    const s = applyAction(b.state, { type: 'endPhase' }).state;
    s.units[b.enemies[0]!.id]!.hp = 5;
    const a = decideAction(s, b.enemies[0]!.id);
    expect(a.type).toBe('wait');
    if (a.type === 'wait') expect(a.to.y).toBeLessThanOrEqual(2);
  });

  it('лекарь лечит раненого союзника', () => {
    const b = makeBattle(
      [{ classId: 'infantry_claw', pos: { x: 2, y: 7 } }],
      [
        { classId: 'infantry_bandage', pos: { x: 2, y: 0 } },
        { classId: 'infantry_claw', pos: { x: 3, y: 0 }, baseStats: { ...flat, hp: 30 } },
      ],
    );
    const s = applyAction(b.state, { type: 'endPhase' }).state;
    s.units[b.enemies[1]!.id]!.hp = 10;
    const a = decideAction(s, b.enemies[0]!.id);
    expect(a.type).toBe('assist');
  });
});
