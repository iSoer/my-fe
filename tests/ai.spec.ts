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
