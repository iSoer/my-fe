import type { BattleState, BattleUnit, MoveType, Pos, Side, TerrainId } from '../types';
import { inBounds, manhattan, posKey } from '../types';
import { livingUnits, otherSide, terrainAt, unitAt } from '../battle/query';
import { hasPassThrough, ignoresForest, moveRange } from '../skills/engine';
import { classDef } from '@content/classes';
import { weaponDef } from '@content/weapons';

export function moveCost(terrain: TerrainId, moveType: MoveType, ignoreForest = false): number | null {
  switch (terrain) {
    case 'plain':
    case 'cover':
      return 1;
    case 'forest':
      if (moveType === 'cavalry') return null;
      if (moveType === 'infantry' && !ignoreForest) return 2;
      return 1;
    case 'mountain':
    case 'water':
      return moveType === 'flier' ? 1 : null;
    case 'wall':
    case 'wall_breakable':
      return null;
  }
}

export function isPassable(terrain: TerrainId, moveType: MoveType): boolean {
  return moveCost(terrain, moveType) !== null;
}

export interface ReachNode {
  pos: Pos;
  cost: number;
  prev?: string;
  /** Можно ли закончить движение здесь (клетка не занята другим юнитом). */
  canStop: boolean;
}
export type ReachMap = Map<string, ReachNode>;

function orthoNeighbors(p: Pos): Pos[] {
  const out: Pos[] = [];
  for (const d of [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ]) {
    const n = { x: p.x + d.x, y: p.y + d.y };
    if (inBounds(n)) out.push(n);
  }
  return out;
}

/** Все клетки, достижимые юнитом (Дейкстра с бюджетом движения). */
export function reachableTiles(state: BattleState, bu: BattleUnit, fromOverride?: Pos): ReachMap {
  const unit = state.roster[bu.unitId];
  if (!unit) return new Map();
  const cls = classDef(unit.classId);
  const budget = moveRange(unit);
  const pass = hasPassThrough(unit);
  const ignoreForest = ignoresForest(unit);
  const start = fromOverride ?? bu.pos;
  const result: ReachMap = new Map();
  result.set(posKey(start), { pos: start, cost: 0, canStop: true });
  const frontier: ReachNode[] = [{ pos: start, cost: 0, canStop: true }];
  while (frontier.length > 0) {
    frontier.sort((a, b) => a.cost - b.cost);
    const cur = frontier.shift() as ReachNode;
    for (const n of orthoNeighbors(cur.pos)) {
      const c = moveCost(terrainAt(state, n), cls.moveType, ignoreForest);
      if (c === null) continue;
      const total = cur.cost + c;
      if (total > budget) continue;
      const occupant = unitAt(state, n);
      if (occupant && occupant.unitId !== bu.unitId && occupant.side !== bu.side && !pass) continue;
      const key = posKey(n);
      const existing = result.get(key);
      if (existing && existing.cost <= total) continue;
      const node: ReachNode = {
        pos: n,
        cost: total,
        prev: posKey(cur.pos),
        canStop: !occupant || occupant.unitId === bu.unitId,
      };
      result.set(key, node);
      frontier.push(node);
    }
  }
  return result;
}

export function pathTo(reach: ReachMap, target: Pos): Pos[] {
  const path: Pos[] = [];
  let key: string | undefined = posKey(target);
  let guard = 0;
  while (key && guard++ < 100) {
    const node = reach.get(key);
    if (!node) break;
    path.unshift(node.pos);
    key = node.prev;
  }
  return path;
}

export function tilesAtDistance(from: Pos, dist: number): Pos[] {
  const out: Pos[] = [];
  for (let dx = -dist; dx <= dist; dx++) {
    const dy = dist - Math.abs(dx);
    const a = { x: from.x + dx, y: from.y + dy };
    const b = { x: from.x + dx, y: from.y - dy };
    if (inBounds(a)) out.push(a);
    if (dy !== 0 && inBounds(b)) out.push(b);
  }
  return out;
}

export function weaponRange(state: BattleState, bu: BattleUnit): number {
  const unit = state.roster[bu.unitId];
  if (!unit) return 1;
  return weaponDef(unit.skills.weapon).range;
}

/** Враги, которых юнит может атаковать с клетки from. */
export function targetsFrom(state: BattleState, bu: BattleUnit, from: Pos): BattleUnit[] {
  const range = weaponRange(state, bu);
  return livingUnits(state, otherSide(bu.side)).filter((u) => manhattan(u.pos, from) === range);
}

/** Хлипкие стены, атакуемые с клетки from. */
export function wallsFrom(state: BattleState, bu: BattleUnit, from: Pos): Pos[] {
  const range = weaponRange(state, bu);
  return tilesAtDistance(from, range).filter(
    (p) => state.map.tiles[p.y]?.[p.x] === 'wall_breakable' && (state.walls[posKey(p)] ?? 0) > 0,
  );
}

export interface AttackOption {
  targetId: string;
  from: Pos;
}

/** Все пары (цель, клетка) для юнита с учётом движения. */
export function attackOptions(state: BattleState, bu: BattleUnit, reach?: ReachMap): AttackOption[] {
  const r = reach ?? reachableTiles(state, bu);
  const out: AttackOption[] = [];
  for (const node of r.values()) {
    if (!node.canStop) continue;
    for (const t of targetsFrom(state, bu, node.pos)) out.push({ targetId: t.unitId, from: node.pos });
  }
  return out;
}

/** Клетки, которые юнит может атаковать на своём ходу (движение + дальность). */
export function threatTiles(state: BattleState, bu: BattleUnit): Set<string> {
  const reach = reachableTiles(state, bu);
  const range = weaponRange(state, bu);
  const out = new Set<string>();
  for (const node of reach.values()) {
    if (!node.canStop) continue;
    for (const p of tilesAtDistance(node.pos, range)) out.add(posKey(p));
  }
  return out;
}

/** Зона опасности: клетки, атакуемые хотя бы одним юнитом стороны. */
export function dangerZone(state: BattleState, side: Side): Set<string> {
  const out = new Set<string>();
  for (const u of livingUnits(state, side)) for (const k of threatTiles(state, u)) out.add(k);
  return out;
}

/** Сколько юнитов стороны могут атаковать каждую клетку. */
export function threatCounts(state: BattleState, side: Side): Map<string, number> {
  const out = new Map<string, number>();
  for (const u of livingUnits(state, side)) {
    for (const k of threatTiles(state, u)) out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

/** BFS-расстояния от набора клеток по местности (без учёта юнитов). */
export function distanceField(state: BattleState, sources: Pos[], moveType: MoveType): Map<string, number> {
  const dist = new Map<string, number>();
  const queue: Pos[] = [];
  for (const s of sources) {
    dist.set(posKey(s), 0);
    queue.push(s);
  }
  while (queue.length > 0) {
    const cur = queue.shift() as Pos;
    const d = dist.get(posKey(cur)) as number;
    for (const n of orthoNeighbors(cur)) {
      if (!isPassable(terrainAt(state, n), moveType)) continue;
      const k = posKey(n);
      if (dist.has(k)) continue;
      dist.set(k, d + 1);
      queue.push(n);
    }
  }
  return dist;
}
