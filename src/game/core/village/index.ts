import type { Facing, Pos, VillageState } from "../types"
import {
  HERO_RADIUS,
  HERO_START,
  NPCS,
  NPC_RADIUS,
  TALK_RADIUS,
  VILLAGE_H,
  VILLAGE_LEGEND,
  VILLAGE_MAP,
  VILLAGE_W,
  WALKABLE_TILES,
  type NpcDef,
  type VillageTile
} from "@game/content/village"

// Движение по деревне: свободное (дробные координаты в клетках), столкновения с непроходимыми клетками и NPC,
// путь по сетке для «тап по земле». Без DOM и Phaser.

export function villageTile(x: number, y: number): VillageTile {
  const ch = VILLAGE_MAP[y]?.[x]
  return (ch && VILLAGE_LEGEND[ch]) || "tree"
}

export function walkableTile(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < VILLAGE_W && y < VILLAGE_H && WALKABLE_TILES.has(villageTile(x, y))
}

/** Свободна ли точка для героя: круг радиуса HERO_RADIUS не задевает стен и NPC. */
export function heroFits(p: Pos): boolean {
  const r = HERO_RADIUS
  for (const [dx, dy] of [[-r, -r], [r, -r], [-r, r], [r, r]] as const)
    if (!walkableTile(Math.floor(p.x + dx), Math.floor(p.y + dy))) return false
  return NPCS.every(n => Math.hypot(n.pos.x - p.x, n.pos.y - p.y) >= r + NPC_RADIUS)
}

/**
 * Сдвиг героя на (dx, dy) клеток со скольжением вдоль препятствий: сначала по x, потом по y,
 * длинный шаг дробится, чтобы не проскочить сквозь стену.
 */
export function moveHero(from: Pos, dx: number, dy: number): Pos {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (HERO_RADIUS * 0.9)))
  let p = { ...from }
  for (let i = 0; i < steps; i++) {
    const nx = { x: p.x + dx / steps, y: p.y }
    if (heroFits(nx)) p = nx
    const ny = { x: p.x, y: p.y + dy / steps }
    if (heroFits(ny)) p = ny
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

const tileKey = (x: number, y: number) => y * VILLAGE_W + x

/** Клетка для пути: проходима и без NPC в центре. */
function pathTile(x: number, y: number): boolean {
  return walkableTile(x, y) && NPCS.every(n => Math.floor(n.pos.x) !== x || Math.floor(n.pos.y) !== y)
}

/** Ближайшая к точке клетка, куда можно прийти (если тапнули по дереву или дому). */
export function nearestPathTile(p: Pos): Pos | null {
  const cx = Math.floor(p.x)
  const cy = Math.floor(p.y)
  let best: { x: number, y: number, d: number } | null = null
  for (let r = 0; r <= 3 && !best; r++) {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (!pathTile(x, y)) continue
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
export function findVillagePath(from: Pos, to: Pos): Pos[] {
  const start = { x: Math.floor(from.x), y: Math.floor(from.y) }
  const goal = nearestPathTile(to)
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
      if (!pathTile(nx, ny)) continue
      if (dx !== 0 && dy !== 0 && (!pathTile(cur.x + dx, cur.y) || !pathTile(cur.x, cur.y + dy))) continue
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
    path.unshift({ x: (k % VILLAGE_W) + 0.5, y: Math.floor(k / VILLAGE_W) + 0.5 })
  return path
}

/** NPC, с которым можно поговорить с этой точки (ближайший в радиусе разговора). */
export function npcInReach(p: Pos): NpcDef | undefined {
  let best: { npc: NpcDef, d: number } | undefined
  for (const npc of NPCS) {
    const d = Math.hypot(npc.pos.x - p.x, npc.pos.y - p.y)
    if (d <= TALK_RADIUS && (!best || d < best.d)) best = { npc, d }
  }
  return best?.npc
}

/** Точка рядом с NPC, откуда с ним можно поговорить (для подхода по тапу и телепорта в смоук-тестах). */
export function spotNear(npc: NpcDef): Pos {
  for (const [dx, dy] of [[0, 1], [-1, 0], [1, 0], [0, -1], [-1, 1], [1, 1]] as const) {
    const p = { x: npc.pos.x + dx * (NPC_RADIUS + HERO_RADIUS + 0.15), y: npc.pos.y + dy * (NPC_RADIUS + HERO_RADIUS + 0.15) }
    if (heroFits(p)) return p
  }
  return { ...npc.pos }
}

export function defaultVillage(): VillageState {
  return { pos: { ...HERO_START }, facing: "up" }
}
