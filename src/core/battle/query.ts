import type { BattleState, BattleUnit, Pos, Side, TerrainId } from '../types';
import { inBounds, manhattan, posKey } from '../types';

export function unitAt(state: BattleState, pos: Pos): BattleUnit | undefined {
  for (const u of Object.values(state.units)) {
    if (u.alive && u.pos.x === pos.x && u.pos.y === pos.y) return u;
  }
  return undefined;
}

export function livingUnits(state: BattleState, side?: Side): BattleUnit[] {
  return Object.values(state.units).filter((u) => u.alive && (side === undefined || u.side === side));
}

export function otherSide(side: Side): Side {
  return side === 'player' ? 'enemy' : 'player';
}

export function alliesWithin(state: BattleState, self: BattleUnit, range: number): BattleUnit[] {
  return livingUnits(state, self.side).filter(
    (u) => u.unitId !== self.unitId && manhattan(u.pos, self.pos) <= range,
  );
}

export function foesWithin(state: BattleState, self: BattleUnit, range: number): BattleUnit[] {
  return livingUnits(state, otherSide(self.side)).filter((u) => manhattan(u.pos, self.pos) <= range);
}

export function unitsWithinOf(state: BattleState, pos: Pos, range: number, side: Side, excludeId?: string): BattleUnit[] {
  return livingUnits(state, side).filter((u) => u.unitId !== excludeId && manhattan(u.pos, pos) <= range);
}

export function terrainAt(state: BattleState, pos: Pos): TerrainId {
  if (!inBounds(pos)) return 'wall';
  const t = state.map.tiles[pos.y]?.[pos.x] ?? 'wall';
  if (t === 'wall_breakable' && (state.walls[posKey(pos)] ?? 0) <= 0) return 'plain';
  return t;
}

export function neighbors(pos: Pos): Pos[] {
  const out: Pos[] = [];
  const cands = [
    { x: pos.x + 1, y: pos.y },
    { x: pos.x - 1, y: pos.y },
    { x: pos.x, y: pos.y + 1 },
    { x: pos.x, y: pos.y - 1 },
  ];
  for (const c of cands) if (inBounds(c)) out.push(c);
  return out;
}

export function hpPct(u: BattleUnit): number {
  return u.maxHp <= 0 ? 0 : u.hp / u.maxHp;
}
