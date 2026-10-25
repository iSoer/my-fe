import type { DecorPlacement, Facing, Pos, Settlement, VillageState } from "../types"
import {
  BUILDABLE_TILES,
  BUILDING_SHAPES,
  DECOR_IDS,
  GATE,
  GATE_FRONT,
  GRAVEYARD,
  HALL,
  HERO_RADIUS,
  HERO_START,
  NPCS,
  NPC_RADIUS,
  ROOF,
  TALK_RADIUS,
  VILLAGE_H,
  VILLAGE_LEGEND,
  VILLAGE_MAP,
  VILLAGE_W,
  WALKABLE_TILES,
  decorDef,
  npcOf,
  type DecorId,
  type NpcDef,
  type PlaceId,
  type VillageTile
} from "@game/content/village"
import { BUILDING_IDS, type BuildingId } from "@game/content/buildings"
import { tr } from "@game/i18n"

// Лагерь: раскладка из сейва (здания и декор поверх местности), движение героя (дробные координаты в клетках)
// со столкновениями, путь по сетке для «тап по земле» и правила расстановки построек. Без DOM и Phaser.

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** То, что игрок ставит в лагере: здание или декор. */
export type Placeable = BuildingId | DecorId

export function isBuilding(kind: Placeable): kind is BuildingId {
  return (BUILDING_IDS as readonly string[]).includes(kind)
}

export function isDecor(kind: string): kind is DecorId {
  return (DECOR_IDS as readonly string[]).includes(kind)
}

export interface NpcSpot {
  def: NpcDef
  pos: Pos
}

export interface PlaceSpot {
  id: PlaceId
  /** Спрайт целиком (с крышей) в клетках: тап по нему ведёт к месту, над ним — вывеска. */
  rect: Rect
  /** Житель места; нет — разговаривают со входом. */
  npc?: NpcSpot
  /** Куда подойти, чтобы заговорить: к жителю или ко входу. */
  talk: Pos
}

/** Лагерь в клетках: что проходимо, где строить нельзя, кто где стоит. Собирается из сейва (`campLayout`). */
export interface Camp {
  /** 1 — герой может пройти клетку (местность, здания и непроходимый декор учтены; жители — нет). */
  walk: Uint8Array
  /** 1 — клетку занимает здание, вход, житель или непроходимый декор: ставить сюда нельзя. */
  taken: Uint8Array
  /** 1 — вход здания, клетка перед дверью Ратуши или место жителя: их нельзя загораживать и накрывать крышей. */
  reserved: Uint8Array
  /** 1 — клетку сверху накрывает крыша (свес спрайта) здания: вход сюда не поставить — его не будет видно. */
  covered: Uint8Array
  /** Декор по клеткам. */
  decor: Map<number, DecorPlacement>
  npcs: NpcSpot[]
  places: PlaceSpot[]
}

export const tileIndex = (x: number, y: number): number => y * VILLAGE_W + x

const inMap = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < VILLAGE_W && y < VILLAGE_H

export function villageTile(x: number, y: number): VillageTile {
  const ch = VILLAGE_MAP[y]?.[x]
  return (ch && VILLAGE_LEGEND[ch]) || "tree"
}

function terrainBuildable(x: number, y: number): boolean {
  return inMap(x, y) && BUILDABLE_TILES.has(villageTile(x, y))
}

/* ---------- Здания на карте ---------- */

export function footprint(kind: Placeable, at: Pos): Rect {
  if (!isBuilding(kind)) return { x: at.x, y: at.y, w: 1, h: 1 }
  const s = BUILDING_SHAPES[kind]
  return { x: at.x, y: at.y, w: s.w, h: s.h }
}

/** Клетка входа: под серединой нижнего ряда. */
export function doorFront(id: BuildingId, at: Pos): Pos {
  const s = BUILDING_SHAPES[id]
  return { x: at.x + Math.floor(s.w / 2), y: at.y + s.h }
}

/** Где стоит житель постройки: клеткой правее входа. */
export function buildingNpcPos(id: BuildingId, at: Pos): Pos {
  const d = doorFront(id, at)
  return { x: d.x + 1.5, y: d.y + 0.55 }
}

/** Клетки перед зданием, которые должны остаться свободными: вход и (если есть житель) его место. */
export function entranceTiles(id: BuildingId, at: Pos): Pos[] {
  const d = doorFront(id, at)
  return npcOf(id) ? [d, { x: d.x + 1, y: d.y }] : [d]
}

/** Спрайт здания целиком (с крышей) в клетках. */
export function buildingSpriteRect(id: BuildingId, at: Pos): Rect {
  const s = BUILDING_SHAPES[id]
  return { x: at.x, y: at.y - s.over, w: s.w, h: s.h + s.over }
}

/** Построенные здания с местом на карте. */
export function placedBuildings(settlement: Settlement): { id: BuildingId, at: Pos }[] {
  return BUILDING_IDS.flatMap((id) => {
    const at = settlement.layout.buildings[id]
    return at && (settlement.buildings[id] ?? 0) > 0 ? [{ id, at }] : []
  })
}

/* ---------- Раскладка ---------- */

const HALL_FRONT: Pos = { x: HALL.x + Math.floor(HALL.w / 2), y: HALL.y + HALL.h }

export function campLayout(settlement: Settlement): Camp {
  const n = VILLAGE_W * VILLAGE_H
  const walk = new Uint8Array(n)
  const taken = new Uint8Array(n)
  for (let y = 0; y < VILLAGE_H; y++) {
    for (let x = 0; x < VILLAGE_W; x++) {
      const t = villageTile(x, y)
      walk[tileIndex(x, y)] = WALKABLE_TILES.has(t) ? 1 : 0
      taken[tileIndex(x, y)] = BUILDABLE_TILES.has(t) ? 0 : 1
    }
  }
  const reserved = new Uint8Array(n)
  const covered = new Uint8Array(n)
  const take = (p: Pos) => {
    if (!inMap(p.x, p.y)) return
    taken[tileIndex(p.x, p.y)] = 1
    reserved[tileIndex(p.x, p.y)] = 1
  }
  const cover = (r: Rect) => {
    for (let x = r.x; x < r.x + r.w; x++) if (inMap(x, r.y - 1)) covered[tileIndex(x, r.y - 1)] = 1
  }
  cover(HALL)
  const npcs: NpcSpot[] = []
  const places: PlaceSpot[] = []
  for (const def of NPCS) if (def.pos) npcs.push({ def, pos: def.pos })
  take(HALL_FRONT)
  for (const { pos } of npcs) take({ x: Math.floor(pos.x), y: Math.floor(pos.y) })

  for (const { id, at } of placedBuildings(settlement)) {
    const r = footprint(id, at)
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        if (!inMap(x, y)) continue
        walk[tileIndex(x, y)] = 0
        taken[tileIndex(x, y)] = 1
      }
    }
    for (const e of entranceTiles(id, at)) take(e)
    cover(r)
    const def = npcOf(id)
    const npc = def ? { def, pos: buildingNpcPos(id, at) } : undefined
    if (npc) npcs.push(npc)
    const d = doorFront(id, at)
    places.push({ id, rect: buildingSpriteRect(id, at), ...(npc ? { npc } : {}), talk: npc?.pos ?? { x: d.x + 0.5, y: d.y + 0.5 } })
  }

  const decor = new Map<number, DecorPlacement>()
  for (const d of settlement.layout.decor) {
    if (!inMap(d.x, d.y)) continue
    const i = tileIndex(d.x, d.y)
    decor.set(i, d)
    taken[i] = 1
    if (!decorDef(d.id).walkable) walk[i] = 0
  }

  const fixed = (id: PlaceId, rect: Rect) => {
    const npc = npcs.find(s => s.def.id === id)
    if (npc) places.push({ id, rect, npc, talk: npc.pos })
  }
  fixed("settlement", { x: HALL.x, y: HALL.y - ROOF, w: HALL.w, h: HALL.h + ROOF })
  fixed("graveyard", { x: GRAVEYARD.x, y: GRAVEYARD.y - 0.5, w: GRAVEYARD.w, h: GRAVEYARD.h + 0.5 })
  fixed("sorties", { x: GATE.x, y: GATE.y - 1.3, w: GATE.w, h: 2.3 })
  return { walk, taken, reserved, covered, decor, npcs, places }
}

export function walkableTile(camp: Camp, x: number, y: number): boolean {
  return inMap(x, y) && camp.walk[tileIndex(x, y)] === 1
}

/* ---------- Движение ---------- */

/** Свободна ли точка для героя: круг радиуса HERO_RADIUS не задевает стен, построек и жителей. */
export function heroFits(camp: Camp, p: Pos): boolean {
  const r = HERO_RADIUS
  for (const [dx, dy] of [[-r, -r], [r, -r], [-r, r], [r, r]] as const)
    if (!walkableTile(camp, Math.floor(p.x + dx), Math.floor(p.y + dy))) return false
  return camp.npcs.every(n => Math.hypot(n.pos.x - p.x, n.pos.y - p.y) >= r + NPC_RADIUS)
}

/**
 * Сдвиг героя на (dx, dy) клеток со скольжением вдоль препятствий: сначала по x, потом по y,
 * длинный шаг дробится, чтобы не проскочить сквозь стену.
 */
export function moveHero(camp: Camp, from: Pos, dx: number, dy: number): Pos {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (HERO_RADIUS * 0.9)))
  let p = { ...from }
  for (let i = 0; i < steps; i++) {
    const nx = { x: p.x + dx / steps, y: p.y }
    if (heroFits(camp, nx)) p = nx
    const ny = { x: p.x, y: p.y + dy / steps }
    if (heroFits(camp, ny)) p = ny
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

/** Клетка для пути: проходима и без жителя в центре. */
function pathTile(camp: Camp, x: number, y: number): boolean {
  return walkableTile(camp, x, y) && camp.npcs.every(n => Math.floor(n.pos.x) !== x || Math.floor(n.pos.y) !== y)
}

/** Ближайшая к точке клетка, куда можно прийти (если тапнули по дереву или дому). */
export function nearestPathTile(camp: Camp, p: Pos, radius = 4): Pos | null {
  const cx = Math.floor(p.x)
  const cy = Math.floor(p.y)
  let best: { x: number, y: number, d: number } | null = null
  for (let r = 0; r <= radius && !best; r++) {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (!pathTile(camp, x, y)) continue
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
export function findVillagePath(camp: Camp, from: Pos, to: Pos): Pos[] {
  const start = { x: Math.floor(from.x), y: Math.floor(from.y) }
  const goal = nearestPathTile(camp, to)
  if (!goal) return []
  const prev = new Map<number, number>()
  const dist = new Map<number, number>([[tileIndex(start.x, start.y), 0]])
  const open: { x: number, y: number, f: number }[] = [{ ...start, f: 0 }]
  const h = (x: number, y: number) => Math.hypot(goal.x - x, goal.y - y)
  while (open.length > 0) {
    open.sort((a, b) => a.f - b.f)
    const cur = open.shift() as { x: number, y: number, f: number }
    if (cur.x === goal.x && cur.y === goal.y) break
    const g = dist.get(tileIndex(cur.x, cur.y)) ?? 0
    for (const [dx, dy] of DIRS) {
      const nx = cur.x + dx
      const ny = cur.y + dy
      if (!pathTile(camp, nx, ny)) continue
      if (dx !== 0 && dy !== 0 && (!pathTile(camp, cur.x + dx, cur.y) || !pathTile(camp, cur.x, cur.y + dy))) continue
      const ng = g + (dx !== 0 && dy !== 0 ? Math.SQRT2 : 1)
      const k = tileIndex(nx, ny)
      if (ng >= (dist.get(k) ?? Infinity)) continue
      dist.set(k, ng)
      prev.set(k, tileIndex(cur.x, cur.y))
      open.push({ x: nx, y: ny, f: ng + h(nx, ny) })
    }
  }
  const goalKey = tileIndex(goal.x, goal.y)
  if (!dist.has(goalKey)) return []
  const path: Pos[] = []
  for (let k: number | undefined = goalKey; k !== undefined && k !== tileIndex(start.x, start.y); k = prev.get(k))
    path.unshift({ x: (k % VILLAGE_W) + 0.5, y: Math.floor(k / VILLAGE_W) + 0.5 })
  return path
}

/** Место, с которым можно заговорить с этой точки (ближайшее в радиусе разговора). */
export function placeInReach(camp: Camp, p: Pos): PlaceSpot | undefined {
  let best: { place: PlaceSpot, d: number } | undefined
  for (const place of camp.places) {
    const d = Math.hypot(place.talk.x - p.x, place.talk.y - p.y)
    // Ко входу без жителя подходят вплотную: он сам — клетка, где стоит герой
    if (d <= (place.npc ? TALK_RADIUS : 0.9) && (!best || d < best.d)) best = { place, d }
  }
  return best?.place
}

export function placeSpot(camp: Camp, id: PlaceId): PlaceSpot | undefined {
  return camp.places.find(p => p.id === id)
}

/** Точка, откуда с местом можно поговорить (для подхода по тапу и телепорта). */
export function spotNear(camp: Camp, id: PlaceId): Pos | undefined {
  const place = placeSpot(camp, id)
  if (!place) return undefined
  if (!place.npc) return { ...place.talk }
  const at = place.npc.pos
  const k = NPC_RADIUS + HERO_RADIUS + 0.15
  for (const [dx, dy] of [[0, 1], [-1, 0], [1, 0], [0, -1], [-1, 1], [1, 1]] as const) {
    const p = { x: at.x + dx * k, y: at.y + dy * k }
    if (heroFits(camp, p)) return p
  }
  return { ...at }
}

/** Ближайшая к точке позиция, где герой помещается (после постройки поверх него). */
export function freeSpotNear(camp: Camp, p: Pos): Pos {
  if (heroFits(camp, p)) return { ...p }
  const t = nearestPathTile(camp, p, 8)
  return t ? { x: t.x + 0.5, y: t.y + 0.5 } : { ...HERO_START }
}

export function defaultVillage(): VillageState {
  return { pos: { ...HERO_START }, facing: "up" }
}

/* ---------- Расстановка ---------- */

export type PlaceCheck = { ok: true } | { ok: false, error: string }

const no = (error: string): PlaceCheck => ({ ok: false, error })

/** Сейв без этого здания на карте (для переноса: старое место не мешает новому). */
function without(settlement: Settlement, id: BuildingId): Settlement {
  const buildings = { ...settlement.layout.buildings }
  delete buildings[id]
  return { ...settlement, layout: { ...settlement.layout, buildings } }
}

/**
 * Клетки, к которым должен вести путь от ворот: вход каждого здания без жителя, соседи каждого жителя.
 * Нужна хотя бы одна клетка из каждой группы.
 */
function approaches(camp: Camp): Pos[][] {
  return camp.places.map((place) => {
    if (!place.npc) return [{ x: Math.floor(place.talk.x), y: Math.floor(place.talk.y) }]
    const nx = Math.floor(place.npc.pos.x)
    const ny = Math.floor(place.npc.pos.y)
    return DIRS.map(([dx, dy]) => ({ x: nx + dx, y: ny + dy }))
  })
}

/** Все места лагеря достижимы от ворот (жители — препятствия). */
export function campConnected(camp: Camp): boolean {
  const seen = new Uint8Array(VILLAGE_W * VILLAGE_H)
  const queue: Pos[] = [{ ...GATE_FRONT }]
  seen[tileIndex(GATE_FRONT.x, GATE_FRONT.y)] = 1
  while (queue.length > 0) {
    const cur = queue.pop() as Pos
    for (const [dx, dy] of DIRS.slice(0, 4)) {
      const x = cur.x + dx
      const y = cur.y + dy
      if (!pathTile(camp, x, y) || seen[tileIndex(x, y)]) continue
      seen[tileIndex(x, y)] = 1
      queue.push({ x, y })
    }
  }
  return approaches(camp).every(group => group.some(p => inMap(p.x, p.y) && seen[tileIndex(p.x, p.y)] === 1))
}

/**
 * Можно ли поставить здание или декор сюда (`at` — левый верхний угол участка). Здание переносится, если
 * уже стоит на карте (его старое место не мешает). Проверки: участок на траве и свободен, вход свободен и
 * проходим, путь от ворот ко всем местам лагеря не перекрыт.
 */
export function canPlace(settlement: Settlement, kind: Placeable, at: Pos): PlaceCheck {
  const base = isBuilding(kind) ? without(settlement, kind) : settlement
  const camp = campLayout(base)
  const r = footprint(kind, at)
  // Тропинку и клумбу можно класть и перед входом: по ним ходят
  if (isDecor(kind) && decorDef(kind).walkable) {
    const i = tileIndex(at.x, at.y)
    if (!terrainBuildable(at.x, at.y)) return no(tr("Can't build here", "Здесь строить нельзя"))
    if (!camp.walk[i] || camp.decor.has(i) || !pathTile(camp, at.x, at.y)) return no(tr("The spot is taken", "Место занято"))
    return { ok: true }
  }
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      if (!terrainBuildable(x, y)) return no(tr("Can't build here", "Здесь строить нельзя"))
      if (camp.taken[tileIndex(x, y)]) return no(tr("The spot is taken", "Место занято"))
    }
  }
  if (isBuilding(kind)) {
    for (const e of entranceTiles(kind, at)) {
      const i = tileIndex(e.x, e.y)
      if (!pathTile(camp, e.x, e.y) || (camp.taken[i] && !camp.decor.has(i))) return no(tr("The entrance is blocked", "Вход загорожен"))
      if (camp.covered[i]) return no(tr("The entrance would hide under a roof", "Вход окажется под чужой крышей"))
    }
    // Крыша нового здания не должна накрывать чужие входы
    for (let x = r.x; x < r.x + r.w; x++)
      if (inMap(x, r.y - 1) && camp.reserved[tileIndex(x, r.y - 1)]) return no(tr("The roof would cover an entrance", "Крыша закроет чужой вход"))
  }
  const next = isBuilding(kind)
    ? { ...base, buildings: { ...base.buildings, [kind]: Math.max(1, base.buildings[kind] ?? 0) }, layout: { ...base.layout, buildings: { ...base.layout.buildings, [kind]: { ...at } } } }
    : { ...base, layout: { ...base.layout, decor: [...base.layout.decor, { id: kind, x: at.x, y: at.y }] } }
  if (!campConnected(campLayout(next))) return no(tr("That would block the way", "Перекроет проход"))
  return { ok: true }
}

/** Ближайшее к точке место, куда можно поставить постройку; `undefined` — места нет. */
export function findSpot(settlement: Settlement, kind: Placeable, near?: Pos): Pos | undefined {
  const r = footprint(kind, { x: 0, y: 0 })
  const c = near ?? (isBuilding(kind) ? BUILDING_SHAPES[kind].pref : HERO_START)
  const spots: { x: number, y: number, d: number }[] = []
  for (let y = 0; y + r.h <= VILLAGE_H; y++)
    for (let x = 0; x + r.w <= VILLAGE_W; x++) spots.push({ x, y, d: Math.hypot(x - c.x, y - c.y) })
  spots.sort((a, b) => a.d - b.d)
  for (const s of spots) if (terrainBuildable(s.x, s.y) && canPlace(settlement, kind, s).ok) return { x: s.x, y: s.y }
  return undefined
}
