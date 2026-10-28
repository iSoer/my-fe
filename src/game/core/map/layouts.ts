import type { Rng } from "../rng"
import type { BoardSize, MapDecor, MapLayout, Pos, TerrainId } from "../types"
import { MAP_H, MAP_W, inBounds, inMap, posKey } from "../types"
import { TERRAIN_SHARE } from "@game/content/balance"

// Раскладки поля: вместо россыпи случайных клякс карта строится по узнаваемому шаблону (опушка, переправа,
// ущелье…) со случайными вариациями — подход «шаблон + процедурное наполнение». Массивы местности сглаживаются
// клеточным автоматом (без одиночных кустов посреди поля), тропинки прокладываются поиском пути со штрафом за
// повороты, а рисуются автотайлами по маске соседей (`decorMask`). Без DOM и Phaser.

export type Grid = TerrainId[][]

/** Черновик поля: местность, оформление клеток и сколько непроходимых клеток допускает раскладка. */
export interface Draft {
  g: Grid
  decor: Map<string, MapDecor>
  /** Клетки, которые должны остаться проходимой землёй (спавны игрока). */
  reserved: Set<string>
}

export interface LayoutEnv {
  /** Вода заливает клетки сплошь (реку и озеро можно собрать из клеток без швов). */
  waterOk: boolean
  /** Смещение доли зарослей биома. */
  forestBias: number
}

export interface LayoutDef {
  id: MapLayout
  /** Предел непроходимых для пехоты клеток на карте этой раскладки. */
  maxBlocked: number
  /** Нужна сплошная вода (река, озеро); в биомах с «лужами» раскладка не выпадает. */
  needsWater?: boolean
  build(d: Draft, rng: Rng, env: LayoutEnv): void
}

/* ---------- Сетка ---------- */

export function emptyDraft(reserved: Iterable<string>): Draft {
  return {
    g: Array.from({ length: MAP_H }, () => Array.from({ length: MAP_W }, (): TerrainId => "plain")),
    decor: new Map(),
    reserved: new Set(reserved)
  }
}

export function getT(g: Grid, p: Pos): TerrainId {
  return g[p.y]?.[p.x] ?? "wall"
}

export function setT(g: Grid, p: Pos, t: TerrainId): void {
  const row = g[p.y]
  if (row) row[p.x] = t
}

const N4: readonly Pos[] = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }]
const N8: readonly Pos[] = [...N4, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }, { x: -1, y: -1 }]

const add = (a: Pos, b: Pos): Pos => ({ x: a.x + b.x, y: a.y + b.y })

function allCells(): Pos[] {
  const out: Pos[] = []
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) out.push({ x, y })
  return out
}

/** Клетку можно занять местностью: внутри поля, не спавн и без тропинки или моста. */
function free(d: Draft, p: Pos): boolean {
  const k = posKey(p)
  return inBounds(p) && !d.reserved.has(k) && !d.decor.has(k)
}

/** Поставить местность на свободную клетку из «земли». */
function put(d: Draft, p: Pos, t: TerrainId): boolean {
  if (!free(d, p) || getT(d.g, p) !== "plain") return false
  setT(d.g, p, t)
  return true
}

const blocksFoot = (t: TerrainId): boolean => t === "water" || t === "mountain" || t === "wall" || t === "wall_breakable"

/**
 * Сглаживание клеточным автоматом: земля с ≥ `birth` соседями-`t` (из 8) становится `t`, `t` с ≤ `death`
 * соседями — землёй. `outside` — считать ли клетки за краем поля такими же (лес «уходит» за край карты).
 */
function smooth(d: Draft, t: TerrainId, iterations: number, birth: number, death: number, outside: (p: Pos) => boolean = () => false): void {
  for (let i = 0; i < iterations; i++) {
    const next = d.g.map(row => [...row])
    for (const p of allCells()) {
      if (!free(d, p)) continue
      const cur = getT(d.g, p)
      if (cur !== "plain" && cur !== t) continue
      let n = 0
      for (const o of N8) {
        const q = add(p, o)
        if (inBounds(q) ? getT(d.g, q) === t : outside(q)) n++
      }
      if (cur === "plain" && n >= birth) setT(next, p, t)
      else if (cur === t && n <= death) setT(next, p, "plain")
    }
    d.g = next
  }
}

/** Засеять `t` с вероятностью `chance(p)` на свободной земле. */
function seed(d: Draft, rng: Rng, t: TerrainId, chance: (p: Pos) => number): void {
  for (const p of allCells()) if (rng.chance(Math.max(0, Math.min(1, chance(p))))) put(d, p, t)
}

/**
 * Проложить тропинку от `from` до `to` (4 направления): поиск пути со случайной ценой клеток и штрафом за поворот —
 * дорожка петляет, но не зигзагом. Идёт по земле и зарослям (заросли на ней вырубаются), обходит воду и стены.
 */
export function carvePath(d: Draft, rng: Rng, from: Pos, to: Pos): Pos[] {
  const noise = new Map(allCells().map(p => [posKey(p), rng.next() * 0.9]))
  type Node = { p: Pos, dir: number, cost: number }
  const key = (p: Pos, dir: number) => `${posKey(p)}|${dir}`
  const best = new Map<string, number>([[key(from, -1), 0]])
  const prev = new Map<string, string>()
  const open: Node[] = [{ p: from, dir: -1, cost: 0 }]
  let end: Node | null = null
  while (open.length > 0) {
    open.sort((a, b) => a.cost - b.cost)
    const cur = open.shift() as Node
    if (cur.p.x === to.x && cur.p.y === to.y) {
      end = cur
      break
    }
    N4.forEach((o, dir) => {
      const q = add(cur.p, o)
      if (!inBounds(q) || blocksFoot(getT(d.g, q))) return
      const cost = cur.cost + 1 + (noise.get(posKey(q)) ?? 0) + (cur.dir >= 0 && cur.dir !== dir ? 0.7 : 0)
      const k = key(q, dir)
      if (cost >= (best.get(k) ?? Infinity)) return
      best.set(k, cost)
      prev.set(k, key(cur.p, cur.dir))
      open.push({ p: q, dir, cost })
    })
  }
  if (!end) return []
  const path: Pos[] = []
  for (let k: string | undefined = key(end.p, end.dir); k; k = prev.get(k)) {
    const [xy] = k.split("|")
    const [x, y] = (xy ?? "0,0").split(",").map(Number)
    path.unshift({ x: x ?? 0, y: y ?? 0 })
  }
  for (const p of path) {
    if (getT(d.g, p) !== "plain") setT(d.g, p, "plain")
    if (!d.decor.has(posKey(p))) d.decor.set(posKey(p), "path")
  }
  return path
}

/** Тропинка через всё поле снизу вверх (от строя игрока к врагам), начало и конец — у середины. */
function mainPath(d: Draft, rng: Rng, xs: readonly number[] = [2, 3], via?: Pos): void {
  const bottom = { x: rng.pick(xs), y: MAP_H - 1 }
  const top = { x: rng.pick(xs), y: 0 }
  if (via) {
    carvePath(d, rng, bottom, via)
    carvePath(d, rng, via, top)
  }
  else carvePath(d, rng, bottom, top)
}

/** Заросли у кромки воды (камыш, кусты на берегу). */
function banks(d: Draft, rng: Rng, chance: number): void {
  for (const p of allCells()) {
    if (getT(d.g, p) !== "plain") continue
    if (N4.some(o => getT(d.g, add(p, o)) === "water" && inBounds(add(p, o))) && rng.chance(chance)) put(d, p, "forest")
  }
}

/** Сколько соседей (из 8) клетки уже заняты `t`. */
function around(d: Draft, p: Pos, t: TerrainId): number {
  return N8.filter(o => getT(d.g, add(p, o)) === t && inBounds(add(p, o))).length
}

/**
 * Рощи: из нескольких семян растут компактные куртины по 3–5 клеток — новая клетка выбирается тем охотнее, чем
 * больше у неё лесных соседей (как рост кристалла). Одиночных кустов не остаётся, дыры внутри рощи зарастают.
 */
function groves(d: Draft, rng: Rng, density: number, keepOff: (p: Pos) => boolean = () => false): void {
  const ok = (p: Pos) => free(d, p) && getT(d.g, p) === "plain" && !keepOff(p)
  const target = Math.round(MAP_W * MAP_H * Math.max(0, density))
  let planted = 0
  for (let guard = 0; planted < target && guard < 12; guard++) {
    const start = rng.pick(allCells().filter(p => ok(p) && around(d, p, "forest") === 0))
    if (!start) break
    setT(d.g, start, "forest")
    const grove = [start]
    const size = Math.min(rng.int(3, 5), target - planted)
    while (grove.length < size) {
      const options = grove.flatMap(p => N4.map(o => add(p, o))).filter(ok)
      if (options.length === 0) break
      const next = rng.weighted(options.map(p => ({ item: p, w: 1 + around(d, p, "forest") ** 2 })))
      setT(d.g, next, "forest")
      grove.push(next)
    }
    planted += grove.length
  }
  // Дыра внутри рощи зарастает
  smooth(d, "forest", 1, 6, -1)
}

/* ---------- Раскладки ---------- */

/** Опушка: густой лес с одного края поля редеет к середине, через поле петляет тропинка. */
const forestEdge: LayoutDef = {
  id: "forestEdge",
  maxBlocked: TERRAIN_SHARE.maxBlocked,
  build(d, rng, env) {
    const side = rng.chance(0.5) ? 0 : MAP_W - 1
    const density = [0.92, 0.7, 0.3, 0.08, 0.04, 0.04]
    seed(d, rng, "forest", p => (density[Math.abs(p.x - side)] ?? 0) + env.forestBias)
    // За краем со стороны леса — тоже лес: опушка не обрывается у рамки поля
    smooth(d, "forest", 2, 5, 2, q => (side === 0 ? q.x < 0 : q.x >= MAP_W))
    // В чаще — валун или поваленное дерево
    const rock = { x: side, y: rng.int(2, 5) }
    if (rng.chance(0.55) && free(d, rock)) setT(d.g, rock, "mountain")
    mainPath(d, rng)
  }
}

/** Переправа: река поперёк поля делит его на две части, посередине — мост; иногда у края есть брод. */
const riverBridge: LayoutDef = {
  id: "riverBridge",
  maxBlocked: TERRAIN_SHARE.maxBlocked,
  needsWater: true,
  build(d, rng) {
    const row = rng.int(3, 4)
    // Река может изогнуться на соседний ряд в одном месте (только между рядами 3 и 4)
    const bend = rng.chance(0.5) ? rng.int(1, MAP_W - 2) : -1
    const dir = row === 3 ? 1 : -1
    const rowAt = (x: number) => (bend >= 0 && x >= bend ? row + dir : row)
    for (let x = 0; x < MAP_W; x++) {
      setT(d.g, { x, y: rowAt(x) }, "water")
      if (x === bend) setT(d.g, { x, y: row }, "water")
    }
    const bx = rng.pick([2, 3].filter(x => x !== bend))
    const bridge = { x: bx, y: rowAt(bx) }
    setT(d.g, bridge, "plain")
    d.decor.set(posKey(bridge), "bridge")
    // Без изгиба река перегородила бы ряд целиком — тогда у края обязательно брод
    if (bend < 0 || rng.chance(0.3)) {
      const fx = rng.pick([0, MAP_W - 1])
      setT(d.g, { x: fx, y: rowAt(fx) }, "plain")
    }
    carvePath(d, rng, { x: rng.pick([2, 3]), y: MAP_H - 1 }, { x: bx, y: bridge.y + 1 })
    carvePath(d, rng, { x: bx, y: bridge.y - 1 }, { x: rng.pick([2, 3]), y: 0 })
    // Тропинка доходит до моста и продолжается за ним
    d.decor.set(posKey({ x: bx, y: bridge.y + 1 }), "path")
    d.decor.set(posKey({ x: bx, y: bridge.y - 1 }), "path")
    banks(d, rng, 0.3)
    groves(d, rng, 0.06)
  }
}

/** Перекрёсток: дорога поперёк поля и тропинка вдоль, по углам — рощи и укрытия у развилки. */
const crossroads: LayoutDef = {
  id: "crossroads",
  maxBlocked: TERRAIN_SHARE.maxBlocked,
  build(d, rng, env) {
    const y = rng.int(3, 4)
    carvePath(d, rng, { x: 0, y }, { x: MAP_W - 1, y })
    mainPath(d, rng)
    groves(d, rng, 0.22 + env.forestBias)
  }
}

/** Ущелье: скалы с обеих сторон сжимают поле к середине, проход — по тропинке посередине. */
const pass: LayoutDef = {
  id: "pass",
  maxBlocked: 8,
  build(d, rng) {
    const cells: Pos[] = []
    for (let y = 2; y <= 5; y++) {
      const narrow = y === 3 || y === 4
      for (const side of [0, MAP_W - 1]) {
        const inward = side === 0 ? 1 : -1
        const depth = narrow ? rng.int(1, 2) : rng.chance(0.55) ? 1 : 0
        for (let i = 0; i < depth; i++) cells.push({ x: side + inward * i, y })
      }
    }
    // Не больше 8 скал: лишние с краёв ряда убираются (сначала внутренние выступы)
    const ordered = rng.shuffle(cells).sort((a, b) => Math.min(a.x, MAP_W - 1 - a.x) - Math.min(b.x, MAP_W - 1 - b.x))
    for (const p of ordered.slice(0, 8)) put(d, p, "mountain")
    mainPath(d, rng)
    // У подножия скал — кусты
    for (const p of allCells())
      if (N4.some(o => getT(d.g, add(p, o)) === "mountain") && rng.chance(0.3)) put(d, p, "forest")
  }
}

/** Озеро: вода посреди поля, тропинка обходит его с одной стороны, берега в зарослях. */
const lake: LayoutDef = {
  id: "lake",
  maxBlocked: TERRAIN_SHARE.maxBlocked,
  needsWater: true,
  build(d, rng) {
    const start = { x: rng.int(2, 3), y: rng.int(3, 4) }
    const lakeCells = [start]
    setT(d.g, start, "water")
    const size = rng.int(3, 4)
    for (let guard = 0; lakeCells.length < size && guard < 60; guard++) {
      const q = add(rng.pick(lakeCells), rng.pick(N4))
      if (q.x < 2 || q.x > 3 || q.y < 3 || q.y > 4 || getT(d.g, q) !== "plain") continue
      setT(d.g, q, "water")
      lakeCells.push(q)
    }
    const minX = Math.min(...lakeCells.map(p => p.x))
    const maxX = Math.max(...lakeCells.map(p => p.x))
    const around = rng.chance(0.5) ? Math.max(0, minX - 1) : Math.min(MAP_W - 1, maxX + 1)
    mainPath(d, rng, [2, 3], { x: around, y: 3 })
    banks(d, rng, 0.45)
  }
}

/** Крепость: враги за стеной с воротами (и хлипкими пролётами), к воротам ведёт тропинка. */
const fort: LayoutDef = {
  id: "fort",
  maxBlocked: TERRAIN_SHARE.maxBlocked,
  build(d, rng, env) {
    const y = rng.int(2, 3)
    const gate = rng.int(1, MAP_W - 2)
    for (let x = 0; x < MAP_W; x++) {
      const dist = Math.abs(x - gate)
      if (dist === 0 || dist === 3) continue
      setT(d.g, { x, y }, dist % 2 === 0 ? "wall_breakable" : "wall")
    }
    mainPath(d, rng, [2, 3], { x: gate, y })
    // Во дворе крепости — укрытия, снаружи — редкие кусты
    for (let i = 0; i < 2; i++) put(d, { x: rng.int(0, MAP_W - 1), y: rng.int(0, y - 1) }, "cover")
    groves(d, rng, 0.14 + env.forestBias, p => p.y <= y)
  }
}

/** Руины: обломки стен буквой «Г», вокруг обломки-укрытия и пробившиеся заросли; иногда — старая дорога. */
const ruins: LayoutDef = {
  id: "ruins",
  maxBlocked: TERRAIN_SHARE.maxBlocked,
  build(d, rng) {
    if (rng.chance(0.5)) mainPath(d, rng)
    const shapes: Pos[][] = [
      [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }],
      [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
      [{ x: 0, y: 0 }, { x: 1, y: 0 }],
      [{ x: 0, y: 0 }, { x: 0, y: 1 }]
    ]
    const want = rng.int(2, 3)
    for (let i = 0, placed = 0; i < 12 && placed < want; i++) {
      const at = { x: rng.int(0, MAP_W - 2), y: rng.int(2, 4) }
      const shape = rng.pick(shapes).map(o => add(at, o))
      if (!shape.every(p => free(d, p) && getT(d.g, p) === "plain")) continue
      for (const p of shape) setT(d.g, p, rng.chance(0.3) ? "wall_breakable" : "wall")
      placed++
    }
    for (const p of rng.shuffle(allCells())) {
      const nearWall = N4.some(o => getT(d.g, add(p, o)) === "wall" && inBounds(add(p, o)))
      if (nearWall && rng.chance(0.25)) put(d, p, rng.chance(0.5) ? "cover" : "forest")
    }
  }
}

/** Поляна: открытое поле с несколькими цельными рощами, иногда тропинка и валун. */
const glade: LayoutDef = {
  id: "glade",
  maxBlocked: TERRAIN_SHARE.maxBlocked,
  build(d, rng, env) {
    if (rng.chance(0.5)) mainPath(d, rng)
    groves(d, rng, 0.2 + env.forestBias)
    if (rng.chance(0.4)) put(d, { x: rng.int(0, MAP_W - 1), y: rng.int(2, 5) }, "mountain")
  }
}

export const LAYOUTS: Record<MapLayout, LayoutDef> = { glade, forestEdge, riverBridge, crossroads, pass, lake, fort, ruins }

export function layoutDef(id: MapLayout): LayoutDef {
  return LAYOUTS[id]
}

/** Какие раскладки выпадают в биоме и как часто. */
export const LAYOUT_WEIGHTS: Record<string, Partial<Record<MapLayout, number>>> = {
  default: { glade: 3, forestEdge: 2, crossroads: 2, ruins: 1, fort: 1, riverBridge: 2, lake: 1, pass: 1 },
  yard: { glade: 3, forestEdge: 3, riverBridge: 2, crossroads: 2, fort: 2, lake: 1, ruins: 1 },
  roofs: { glade: 3, crossroads: 3, pass: 2, ruins: 2, fort: 1 },
  basement: { crossroads: 3, ruins: 3, fort: 2, pass: 2, riverBridge: 1 },
  dump: { ruins: 3, glade: 2, forestEdge: 2, crossroads: 2, pass: 1 },
  winter_park: { forestEdge: 3, riverBridge: 2, glade: 2, lake: 2, crossroads: 1 },
  jungle: { forestEdge: 4, riverBridge: 3, lake: 2, ruins: 2, glade: 1 },
  desert: { glade: 3, ruins: 3, pass: 2, crossroads: 2 },
  glacier: { pass: 3, glade: 2, crossroads: 2, ruins: 1 },
  canyon: { pass: 5, crossroads: 2, fort: 1, ruins: 1 },
  deep_forest: { forestEdge: 5, riverBridge: 3, glade: 2, lake: 1 },
  indoors: { crossroads: 3, fort: 2, ruins: 2, glade: 2 },
  factory: { crossroads: 3, pass: 2, fort: 2, riverBridge: 1, ruins: 1 },
  infested: { ruins: 3, lake: 2, forestEdge: 2, riverBridge: 1, glade: 1 }
}

export function pickLayout(rng: Rng, biomeId: string, env: LayoutEnv): MapLayout {
  const w = LAYOUT_WEIGHTS[biomeId] ?? LAYOUT_WEIGHTS["default"] ?? {}
  const items = (Object.entries(w) as [MapLayout, number][])
    .filter(([id]) => env.waterOk || !LAYOUTS[id].needsWater)
    .map(([item, wt]) => ({ item, w: wt }))
  return items.length > 0 ? rng.weighted(items) : "glade"
}

/* ---------- Автотайлы оформления ---------- */

/** Биты маски соседей: сверху, справа, снизу, слева. */
export const MASK = { n: 1, e: 2, s: 4, w: 8 } as const

/**
 * Маска тропинки для автотайла (0…15): с какими сторонами клетка соединена — с соседней тропинкой, мостом или
 * краем поля. Конец тропинки у края поля уходит за край (дорога не обрывается у рамки).
 */
export function decorMask(decor: Readonly<Record<string, MapDecor>> | undefined, p: Pos, size: BoardSize = { w: MAP_W, h: MAP_H }): number {
  if (!decor) return 0
  const bits = [MASK.n, MASK.e, MASK.s, MASK.w]
  let mask = 0
  let links = 0
  N4.forEach((o, i) => {
    const q = add(p, o)
    if (inMap(size, q) && decor[posKey(q)]) {
      mask |= bits[i] ?? 0
      links++
    }
  })
  if (links <= 1) {
    // Тупик у рамки: продолжить за край (верх и низ важнее — тропинки идут вдоль поля)
    const exits: [boolean, number][] = [
      [p.y === 0, MASK.n],
      [p.y === size.h - 1, MASK.s],
      [p.x === 0, MASK.w],
      [p.x === size.w - 1, MASK.e]
    ]
    const exit = exits.find(([on, bit]) => on && !(mask & bit))
    if (exit) mask |= exit[1]
  }
  return mask
}

/** Мост лежит вдоль оси «север–юг», если вода слева или справа от него, иначе — «запад–восток». */
export function bridgeVertical(tiles: TerrainId[][], p: Pos): boolean {
  const water = (q: Pos) => tiles[q.y]?.[q.x] === "water"
  return water({ x: p.x - 1, y: p.y }) || water({ x: p.x + 1, y: p.y })
}
