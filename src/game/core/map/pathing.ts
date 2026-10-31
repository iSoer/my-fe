import type { BattleState, BattleUnit, BoardSize, MoveType, Pos, Side, TerrainId } from "../types"
import { MAP_H, MAP_W, inMap, manhattan, mapSize, posKey } from "../types"
import { livingUnits, otherSide, terrainAt } from "../battle/query"
import { hasPassThrough, moveRange } from "../skills/engine"
import { buffMoveBonus } from "../battle/buffs"
import { unitClass } from "@game/content/classes"
import { weaponDef } from "@game/content/weapons"

/** Заросли и укрытия не мешают идти — они только дают бонус стоящему в них (`TERRAIN_BONUS`). */
export function moveCost(terrain: TerrainId, moveType: MoveType): number | null {
  switch (terrain) {
    case "plain":
    case "cover":
    case "forest":
      return 1
    case "mountain":
    case "water":
      return moveType === "flier" ? 1 : null
    case "wall":
    case "wall_breakable":
      return null
  }
}

export function isPassable(terrain: TerrainId, moveType: MoveType): boolean {
  return moveCost(terrain, moveType) !== null
}

export interface ReachNode {
  pos: Pos
  cost: number
  prev?: string
  /** Можно ли закончить движение здесь (клетка не занята другим юнитом). */
  canStop: boolean
}
export type ReachMap = Map<string, ReachNode>

function orthoNeighbors(p: Pos, size: BoardSize): Pos[] {
  const out: Pos[] = []
  for (const d of [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 }
  ]) {
    const n = { x: p.x + d.x, y: p.y + d.y }
    if (inMap(size, n)) out.push(n)
  }
  return out
}

/** Клетка, от которой считается ход бойца: где он начал ход (если уже передвигался) или где стоит. */
export function moveOrigin(bu: BattleUnit): Pos {
  return bu.turnStart ?? bu.pos
}

/**
 * Все клетки, достижимые юнитом (Дейкстра с бюджетом движения). Без `fromOverride` — от клетки начала хода
 * (`moveOrigin`): переставленный боец может встать куда угодно в пределах хода, в том числе вернуться.
 */
export function reachableTiles(state: BattleState, bu: BattleUnit, fromOverride?: Pos, budgetOverride?: number): ReachMap {
  const unit = state.roster[bu.unitId]
  if (!unit) return new Map()
  const cls = unitClass(unit)
  const budget = budgetOverride ?? moveRange(unit) + buffMoveBonus(state, bu.unitId)
  const pass = hasPassThrough(unit)
  const start = fromOverride ?? moveOrigin(bu)
  const result: ReachMap = new Map()
  const first: ReachNode = { pos: start, cost: 0, canStop: true }
  result.set(posKey(start), first)
  // Кто где стоит — один раз, а не перебором всех юнитов для каждой клетки (на большой карте их десятки)
  const occupied = new Map<string, BattleUnit>()
  for (const u of Object.values(state.units)) if (u.alive) occupied.set(posKey(u.pos), u)
  // Дейкстра с очередью по корзинам: стоимости хода — малые целые. Внутри корзины — порядок добавления,
  // как у устойчивой сортировки, так что пути выходят те же
  const buckets: ReachNode[][] = [[first]]
  const size = mapSize(state.map)
  for (let cost = 0; cost < buckets.length; cost++) {
    const bucket = buckets[cost]
    if (!bucket) continue
    for (let i = 0; i < bucket.length; i++) {
      const cur = bucket[i] as ReachNode
      const curKey = posKey(cur.pos)
      // Устаревшая запись: клетку уже достигли дешевле
      if (result.get(curKey) !== cur) continue
      for (const n of orthoNeighbors(cur.pos, size)) {
        const c = moveCost(terrainAt(state, n), cls.moveType)
        if (c === null) continue
        const total = cur.cost + c
        if (total > budget) continue
        const key = posKey(n)
        const occupant = occupied.get(key)
        if (occupant && occupant.unitId !== bu.unitId && occupant.side !== bu.side && !pass) continue
        const existing = result.get(key)
        if (existing && existing.cost <= total) continue
        const node: ReachNode = {
          pos: n,
          cost: total,
          prev: curKey,
          canStop: !occupant || occupant.unitId === bu.unitId
        }
        result.set(key, node)
        ;(buckets[total] ??= []).push(node)
      }
    }
  }
  return result
}

export function pathTo(reach: ReachMap, target: Pos): Pos[] {
  const path: Pos[] = []
  let key: string | undefined = posKey(target)
  let guard = 0
  while (key && guard++ < 100) {
    const node = reach.get(key)
    if (!node) break
    path.unshift(node.pos)
    key = node.prev
  }
  return path
}

/** Клетки на расстоянии `dist` (манхэттен) внутри поля `size` (по умолчанию обычное 6×8). */
export function tilesAtDistance(from: Pos, dist: number, size: BoardSize = { w: MAP_W, h: MAP_H }): Pos[] {
  const out: Pos[] = []
  for (let dx = -dist; dx <= dist; dx++) {
    const dy = dist - Math.abs(dx)
    const a = { x: from.x + dx, y: from.y + dy }
    const b = { x: from.x + dx, y: from.y - dy }
    if (inMap(size, a)) out.push(a)
    if (dy !== 0 && inMap(size, b)) out.push(b)
  }
  return out
}

export function weaponRange(state: BattleState, bu: BattleUnit): number {
  const unit = state.roster[bu.unitId]
  if (!unit) return 1
  return weaponDef(unit.skills.weapon).range
}

/** Враги, которых юнит может атаковать с клетки from. */
export function targetsFrom(state: BattleState, bu: BattleUnit, from: Pos): BattleUnit[] {
  const range = weaponRange(state, bu)
  return livingUnits(state, otherSide(bu.side)).filter(u => manhattan(u.pos, from) === range)
}

/** Целое (ещё не сломанное) хлипкое препятствие на клетке. */
export function isBreakableWall(state: BattleState, p: Pos): boolean {
  return state.map.tiles[p.y]?.[p.x] === "wall_breakable" && (state.walls[posKey(p)] ?? 0) > 0
}

/** Хлипкие стены, атакуемые с клетки from. */
export function wallsFrom(state: BattleState, bu: BattleUnit, from: Pos): Pos[] {
  const range = weaponRange(state, bu)
  return tilesAtDistance(from, range, mapSize(state.map)).filter(p => isBreakableWall(state, p))
}

export interface WallOption {
  wall: Pos
  from: Pos
}

/** Все пары (стена, клетка) для юнита с учётом движения — в том числе с места, где он уже стоит. */
export function wallOptions(state: BattleState, bu: BattleUnit, reach?: ReachMap): WallOption[] {
  const r = reach ?? reachableTiles(state, bu)
  const out: WallOption[] = []
  for (const node of r.values()) {
    if (!node.canStop) continue
    for (const w of wallsFrom(state, bu, node.pos)) out.push({ wall: w, from: node.pos })
  }
  return out
}

export interface AttackOption {
  targetId: string
  from: Pos
}

/** Все пары (цель, клетка) для юнита с учётом движения. */
export function attackOptions(state: BattleState, bu: BattleUnit, reach?: ReachMap): AttackOption[] {
  const r = reach ?? reachableTiles(state, bu)
  const out: AttackOption[] = []
  for (const node of r.values()) {
    if (!node.canStop) continue
    for (const t of targetsFrom(state, bu, node.pos)) out.push({ targetId: t.unitId, from: node.pos })
  }
  return out
}

/** Клетки, которые юнит может атаковать на своём ходу (движение + дальность). */
export function threatTiles(state: BattleState, bu: BattleUnit): Set<string> {
  const reach = reachableTiles(state, bu)
  const range = weaponRange(state, bu)
  const out = new Set<string>()
  for (const node of reach.values()) {
    if (!node.canStop) continue
    for (const p of tilesAtDistance(node.pos, range, mapSize(state.map))) out.add(posKey(p))
  }
  return out
}

/** Зона опасности: клетки, атакуемые хотя бы одним юнитом стороны. */
export function dangerZone(state: BattleState, side: Side): Set<string> {
  const out = new Set<string>()
  for (const u of livingUnits(state, side)) for (const k of threatTiles(state, u)) out.add(k)
  return out
}

/** Сколько юнитов стороны могут атаковать каждую клетку. */
export function threatCounts(state: BattleState, side: Side): Map<string, number> {
  const out = new Map<string, number>()
  for (const u of livingUnits(state, side)) {
    for (const k of threatTiles(state, u)) out.set(k, (out.get(k) ?? 0) + 1)
  }
  return out
}

/** BFS-расстояния от набора клеток по местности (без учёта юнитов). */
export function distanceField(state: BattleState, sources: Pos[], moveType: MoveType): Map<string, number> {
  const dist = new Map<string, number>()
  const queue: Pos[] = []
  for (const s of sources) {
    dist.set(posKey(s), 0)
    queue.push(s)
  }
  const size = mapSize(state.map)
  while (queue.length > 0) {
    const cur = queue.shift() as Pos
    const d = dist.get(posKey(cur)) as number
    for (const n of orthoNeighbors(cur, size)) {
      if (!isPassable(terrainAt(state, n), moveType)) continue
      const k = posKey(n)
      if (dist.has(k)) continue
      dist.set(k, d + 1)
      queue.push(n)
    }
  }
  return dist
}
