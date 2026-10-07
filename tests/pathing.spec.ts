import { describe, expect, it } from 'vitest';
import { reachableTiles, moveCost, threatTiles, attackOptions, dangerZone } from '@core/map/pathing';
import { posKey } from '@core/types';
import { makeBattle, plainTiles } from './helpers';

describe('moveCost', () => {
  it('заросли: пехота 2, броня 1, кавалерия нельзя, летун 1', () => {
    expect(moveCost('forest', 'infantry')).toBe(2);
    expect(moveCost('forest', 'armor')).toBe(1);
    expect(moveCost('forest', 'cavalry')).toBeNull();
    expect(moveCost('forest', 'flier')).toBe(1);
    expect(moveCost('forest', 'infantry', true)).toBe(1);
  });
  it('вода/гора только летунам, стены никому', () => {
    expect(moveCost('water', 'infantry')).toBeNull();
    expect(moveCost('mountain', 'flier')).toBe(1);
    expect(moveCost('wall', 'flier')).toBeNull();
    expect(moveCost('wall_breakable', 'flier')).toBeNull();
  });
});

describe('reachableTiles', () => {
  it('пехота ходит на 2, кавалерия на 3, броня на 1', () => {
    const b = makeBattle(
      [
        { classId: 'infantry_claw', pos: { x: 0, y: 7 } },
        { classId: 'cavalry_claw', pos: { x: 5, y: 7 } },
        { classId: 'armor_claw', pos: { x: 2, y: 7 } },
      ],
      [{ classId: 'infantry_claw', pos: { x: 2, y: 0 } }],
    );
    const inf = reachableTiles(b.state, b.state.units[b.players[0]!.id]!);
    const cav = reachableTiles(b.state, b.state.units[b.players[1]!.id]!);
    const arm = reachableTiles(b.state, b.state.units[b.players[2]!.id]!);
    expect(inf.has(posKey({ x: 0, y: 5 }))).toBe(true);
    expect(inf.has(posKey({ x: 0, y: 4 }))).toBe(false);
    expect(cav.has(posKey({ x: 5, y: 4 }))).toBe(true);
    expect(arm.has(posKey({ x: 2, y: 6 }))).toBe(true);
    expect(arm.has(posKey({ x: 2, y: 5 }))).toBe(false);
  });
  it('проходит сквозь союзников, но не сквозь врагов и не останавливается на занятых', () => {
    const b = makeBattle(
      [
        { classId: 'infantry_claw', pos: { x: 2, y: 7 } },
        { classId: 'infantry_claw', pos: { x: 2, y: 6 } },
      ],
      [{ classId: 'infantry_claw', pos: { x: 3, y: 7 } }],
    );
    const r = reachableTiles(b.state, b.state.units[b.players[0]!.id]!);
    expect(r.get(posKey({ x: 2, y: 6 }))?.canStop).toBe(false);
    expect(r.has(posKey({ x: 2, y: 5 }))).toBe(true);
    expect(r.has(posKey({ x: 3, y: 7 }))).toBe(false);
    expect(r.has(posKey({ x: 4, y: 7 }))).toBe(false);
  });
  it('заросли заканчивают движение пехоты', () => {
    const b = makeBattle([{ classId: 'infantry_claw', pos: { x: 2, y: 7 } }], [{ classId: 'infantry_claw', pos: { x: 2, y: 0 } }], {
      tiles: plainTiles({ '2,6': 'forest' }),
    });
    const r = reachableTiles(b.state, b.state.units[b.players[0]!.id]!);
    expect(r.has(posKey({ x: 2, y: 6 }))).toBe(true);
    expect(r.has(posKey({ x: 2, y: 5 }))).toBe(false);
    expect(r.has(posKey({ x: 1, y: 6 }))).toBe(true);
  });
});

describe('зоны', () => {
  it('attackOptions и threatTiles согласованы с дальностью', () => {
    const b = makeBattle([{ classId: 'infantry_slingshot', pos: { x: 2, y: 7 } }], [{ classId: 'infantry_claw', pos: { x: 2, y: 3 } }]);
    const bu = b.state.units[b.players[0]!.id]!;
    const opts = attackOptions(b.state, bu);
    expect(opts.length).toBeGreaterThan(0);
    expect(opts.every((o) => Math.abs(o.from.x - 2) + Math.abs(o.from.y - 3) === 2)).toBe(true);
    const threat = threatTiles(b.state, bu);
    expect(threat.has(posKey({ x: 2, y: 3 }))).toBe(true);
    expect(threat.has(posKey({ x: 2, y: 0 }))).toBe(false);
    const dz = dangerZone(b.state, 'enemy');
    expect(dz.has(posKey({ x: 2, y: 6 }))).toBe(true);
    expect(dz.has(posKey({ x: 0, y: 7 }))).toBe(false);
  });
});
