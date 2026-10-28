import type { Facing, Pos, SaveGame } from "../types"
import {
  HERO_RADIUS,
  NPCS,
  NPC_RADIUS,
  PLOTS,
  REACH_RADIUS,
  SETTLEMENT_H,
  SETTLEMENT_TILES,
  SETTLEMENT_W,
  SORTIE_GATE,
  TILE_LEGEND,
  WALKABLE_TILES,
  type NpcDef,
  type PlaceId,
  type SettlementTile
} from "@game/content/settlement"

// Движение героя по поселению: свободное (дробные координаты в клетках), столкновения с непроходимыми клетками
// и жителями, путь по сетке для «тап по земле». Жители стоят только у построенных зданий, поэтому функции берут
// список тех, кто сейчас на карте (`activeNpcs`). Без DOM и Phaser.

export function settlementTile(x: number, y: number): SettlementTile {
  const ch = SETTLEMENT_TILES[y]?.[x]
  return (ch && TILE_LEGEND[ch]) || "tree"
}

export function walkableTile(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < SETTLEMENT_W && y < SETTLEMENT_H && WALKABLE_TILES.has(settlementTile(x, y))
}

/** Жители на карте: у построенных зданий и у ворот. */
export function activeNpcs(save: Pick<SaveGame, "settlement">): NpcDef[] {
  return NPCS.filter(n => !n.building || (save.settlement.buildings[n.building]?.level ?? 0) > 0)
}

/** Свободна ли точка для героя: круг радиуса HERO_RADIUS не задевает стен и жителей. */
export function heroFits(p: Pos, npcs: readonly NpcDef[]): boolean {
  const r = HERO_RADIUS
  for (const [dx, dy] of [[-r, -r], [r, -r], [-r, r], [r, r]] as const)
    if (!walkableTile(Math.floor(p.x + dx), Math.floor(p.y + dy))) return false
  return npcs.every(n => Math.hypot(n.pos.x - p.x, n.pos.y - p.y) >= r + NPC_RADIUS)
}

/**
 * Сдвиг героя на (dx, dy) клеток со скольжением вдоль препятствий: сначала по x, потом по y,
 * длинный шаг дробится, чтобы не проскочить сквозь стену.
 */
export function moveHero(from: Pos, dx: number, dy: number, npcs: readonly NpcDef[]): Pos {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (HERO_RADIUS * 0.9)))
  let p = { ...from }
  for (let i = 0; i < steps; i++) {
    const nx = { x: p.x + dx / steps, y: p.y }
    if (heroFits(nx, npcs)) p = nx
    const ny = { x: p.x, y: p.y + dy / steps }
    if (heroFits(ny, npcs)) p = ny
  }
  return p
}

/** Нормализованное направление ввода по 8 направлениям: диагональ не быстрее прямой. */
export function normalizeInput(dx: number, dy: number): Pos {
  const len = Math.hypot(dx, dy)
  return len > 0 ? { x: dx / len, y: dy / len } : { x: 0, y: 0 }
}

/** Куда смотрит герой при движении (горизонталь важнее при равенстве — так видно профиль). */
export function facingOf(dx: number, dy: number, prev: Facing): Facing {
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return prev
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "right" : "left"
  return dy > 0 ? "down" : "up"
}

const DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]
] as const

const tileKey = (x: number, y: number) => y * SETTLEMENT_W + x

/** Клетка для пути: проходима и без жителя в центре. */
function pathTile(x: number, y: number, npcs: readonly NpcDef[]): boolean {
  return walkableTile(x, y) && npcs.every(n => Math.floor(n.pos.x) !== x || Math.floor(n.pos.y) !== y)
}

/** Ближайшая к точке клетка, куда можно прийти (если тапнули по дереву или дому). */
export function nearestPathTile(p: Pos, npcs: readonly NpcDef[]): Pos | null {
  const cx = Math.floor(p.x)
  const cy = Math.floor(p.y)
  let best: { x: number, y: number, d: number } | null = null
  for (let r = 0; r <= 3 && !best; r++) {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (!pathTile(x, y, npcs)) continue
        const d = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y)
        if (!best || d < best.d) best = { x, y, d }
      }
    }
  }
  return best ? { x: best.x, y: best.y } : null
}

/**
 * Путь по сетке (8 направлений, без срезания углов) от позиции героя к точке: список центров клеток.
 * Пусто — идти некуда или уже на месте.
 */
export function findPath(from: Pos, to: Pos, npcs: readonly NpcDef[]): Pos[] {
  const start = { x: Math.floor(from.x), y: Math.floor(from.y) }
  const goal = nearestPathTile(to, npcs)
  if (!goal) return []
  const prev = new Map<number, number>()
  const dist = new Map<number, number>([[tileKey(start.x, start.y), 0]])
  const open: { x: number, y: number, f: number }[] = [{ ...start, f: 0 }]
  const h = (x: number, y: number) => Math.hypot(goal.x - x, goal.y - y)
  while (open.length > 0) {
    open.sort((a, b) => a.f - b.f)
    const cur = open.shift() as { x: number, y: number, f: number }
    if (cur.x === goal.x && cur.y === goal.y) break
    const g = dist.get(tileKey(cur.x, cur.y)) ?? 0
    for (const [dx, dy] of DIRS) {
      const nx = cur.x + dx
      const ny = cur.y + dy
      if (!pathTile(nx, ny, npcs)) continue
      if (dx !== 0 && dy !== 0 && (!pathTile(cur.x + dx, cur.y, npcs) || !pathTile(cur.x, cur.y + dy, npcs))) continue
      const ng = g + (dx !== 0 && dy !== 0 ? Math.SQRT2 : 1)
      const k = tileKey(nx, ny)
      if (ng >= (dist.get(k) ?? Infinity)) continue
      dist.set(k, ng)
      prev.set(k, tileKey(cur.x, cur.y))
      open.push({ x: nx, y: ny, f: ng + h(nx, ny) })
    }
  }
  const goalKey = tileKey(goal.x, goal.y)
  if (!dist.has(goalKey)) return []
  const path: Pos[] = []
  for (let k: number | undefined = goalKey; k !== undefined && k !== tileKey(start.x, start.y); k = prev.get(k))
    path.unshift({ x: (k % SETTLEMENT_W) + 0.5, y: Math.floor(k / SETTLEMENT_W) + 0.5 })
  return path
}

/** Место, карточку которого можно открыть с этой точки: ближайший вход в радиусе `REACH_RADIUS`. */
export function placeInReach(p: Pos): PlaceId | undefined {
  let best: { id: PlaceId, d: number } | undefined
  const fronts: [PlaceId, Pos][] = [...PLOTS.map(pl => [pl.id, pl.front] as [PlaceId, Pos]), ["gate", SORTIE_GATE.front]]
  for (const [id, front] of fronts) {
    const d = Math.hypot(front.x - p.x, front.y - p.y)
    if (d <= REACH_RADIUS && (!best || d < best.d)) best = { id, d }
  }
  return best?.id
}
