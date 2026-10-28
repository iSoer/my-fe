import type { Rng } from "../rng"
import { createRng } from "../rng"
import type { BoardSize, Difficulty, EnemyPlacement, ExpeditionChest, MapDecor, MapDef, Pos, TerrainId } from "../types"
import { MAX_LEVEL, clamp, inMap, manhattan, posKey } from "../types"
import { isPassable } from "./pathing"
import { makeEnemy, pickEnemyLoadout, type EnemyRoles } from "./generate"
import { biomeDef } from "@game/content/biomes"
import { EXPEDITION, difficultyDef, teamLevels, teamTreats } from "@game/content/balance"
import { weaponRange } from "@game/content/weapons"

// Вылазка в мрачную чащу — карта «как в Dota»: квадратное поле `EXPEDITION.w`×`EXPEDITION.h`, старт в левом нижнем
// углу, выход в правом верхнем. Их связывают три дороги: верхняя (вдоль левого и верхнего края), нижняя (вдоль
// нижнего и правого) и извилистая средняя по диагонали. Поперёк средней течёт ручей (из левого верхнего угла в правый
// нижний) с мостами там, где его пересекают дороги, и парой бродов. В лесу между дорогами стоят лагеря стражей с
// сундуками; к каждому ведёт тропа от ближайшей дороги, часть лагерей соединена тропами между собой — получается сеть
// с кольцами, идти можно куда угодно и к кому угодно. Заросли проходимы, валуны и вековые стволы — нет.
// Каждая попытка проверяется на связность; не сложилось — следующая, в крайнем случае препятствия убираются.

export interface GenerateExpeditionOptions {
  seed: number
  difficulty: Difficulty
  team: number
  squadSize: number
  now?: number
}

export const EXPEDITION_BIOME = "deep_forest"

type Grid = TerrainId[][]

const N4: readonly Pos[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]

const blocked = (t: TerrainId): boolean => !isPassable(t, "infantry")

function cellsOf(size: BoardSize): Pos[] {
  const out: Pos[] = []
  for (let y = 0; y < size.h; y++) for (let x = 0; x < size.w; x++) out.push({ x, y })
  return out
}

const get = (g: Grid, p: Pos): TerrainId => g[p.y]?.[p.x] ?? "wall"
const set = (g: Grid, p: Pos, t: TerrainId): void => {
  const row = g[p.y]
  if (row) row[p.x] = t
}

/** Чаща: случайный засев зарослей и сглаживание — получаются сплошные заросли с прогалинами. */
function thickets(size: BoardSize, rng: Rng): Grid {
  let g: Grid = Array.from({ length: size.h }, () => Array.from({ length: size.w }, (): TerrainId => (rng.chance(0.52) ? "forest" : "plain")))
  for (let i = 0; i < 2; i++) {
    const next = g.map(r => [...r])
    for (const p of cellsOf(size)) {
      let n = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue
          const q = { x: p.x + dx, y: p.y + dy }
          // За краем карты — тоже лес
          if (!inMap(size, q) || get(g, q) === "forest") n++
        }
      }
      if (n >= 5) set(next, p, "forest")
      else if (n <= 3) set(next, p, "plain")
    }
    g = next
  }
  return g
}

/** Ромб радиуса `r` вокруг точки (внутри поля). */
function diamond(size: BoardSize, c: Pos, r: number): Pos[] {
  const out: Pos[] = []
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r + Math.abs(dy); dx <= r - Math.abs(dy); dx++) {
      const p = { x: c.x + dx, y: c.y + dy }
      if (inMap(size, p)) out.push(p)
    }
  }
  return out
}

/** Минимальная двоичная куча по `c` — поиск пути на большом поле без сортировки очереди на каждом шаге. */
class Heap<T extends { c: number }> {
  private items: T[] = []
  get size(): number {
    return this.items.length
  }

  push(item: T): void {
    const a = this.items
    a.push(item)
    let i = a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if ((a[p] as T).c <= item.c) break
      a[i] = a[p] as T
      i = p
    }
    a[i] = item
  }

  pop(): T | undefined {
    const a = this.items
    const top = a[0]
    const last = a.pop()
    if (a.length === 0 || last === undefined) return top
    a[0] = last
    let i = 0
    for (;;) {
      const l = i * 2 + 1
      const r = l + 1
      let m = i
      if (l < a.length && (a[l] as T).c < (a[m] as T).c) m = l
      if (r < a.length && (a[r] as T).c < (a[m] as T).c) m = r
      if (m === i) break
      const tmp = a[i] as T
      a[i] = a[m] as T
      a[m] = tmp
      i = m
    }
    return top
  }
}

/**
 * Дорога или тропа от `from` до `to`: поиск пути со случайной ценой клеток и штрафом за поворот — петляет, но без
 * зигзагов; сквозь заросли (вырубает), в обход валунов и стволов. Ручей переходит дороже (`waterCost`) и строит
 * на переходе мост. Уже проложенные тропы дешевле — новые к ним примыкают, сеть получается связной.
 */
function carve(
  g: Grid,
  size: BoardSize,
  rng: Rng,
  from: Pos,
  to: Pos,
  decor: Map<string, MapDecor>,
  waterCost = 4
): boolean {
  const noise = new Float32Array(size.w * size.h).map(() => rng.next() * 0.8)
  const idx = (p: Pos) => p.y * size.w + p.x
  const stateKey = (p: Pos, d: number) => idx(p) * 5 + (d + 1)
  const best = new Map<number, number>([[stateKey(from, -1), 0]])
  const prev = new Map<number, number>()
  const heap = new Heap<{ p: Pos, d: number, c: number }>()
  heap.push({ p: from, d: -1, c: 0 })
  let endKey: number | null = null
  while (heap.size > 0) {
    const cur = heap.pop() as { p: Pos, d: number, c: number }
    const ck = stateKey(cur.p, cur.d)
    if (cur.c > (best.get(ck) ?? Infinity)) continue
    if (cur.p.x === to.x && cur.p.y === to.y) {
      endKey = ck
      break
    }
    N4.forEach((o, d) => {
      const q = { x: cur.p.x + o.x, y: cur.p.y + o.y }
      if (!inMap(size, q)) return
      const t = get(g, q)
      if (t !== "water" && blocked(t)) return
      const onTrail = decor.has(posKey(q))
      const step = (onTrail ? 0.55 : 1) + (noise[idx(q)] ?? 0) + (t === "water" ? waterCost : 0)
      const c = cur.c + step + (cur.d >= 0 && cur.d !== d ? 0.6 : 0)
      const k = stateKey(q, d)
      if (c >= (best.get(k) ?? Infinity)) return
      best.set(k, c)
      prev.set(k, ck)
      heap.push({ p: q, d, c })
    })
  }
  if (endKey === null) return false
  for (let k: number | undefined = endKey; k !== undefined; k = prev.get(k)) {
    const i = Math.floor(k / 5)
    const p = { x: i % size.w, y: Math.floor(i / size.w) }
    if (get(g, p) === "water") {
      set(g, p, "plain")
      decor.set(posKey(p), "bridge")
    }
    else {
      set(g, p, "plain")
      if (!decor.has(posKey(p))) decor.set(posKey(p), "path")
    }
  }
  return true
}

/** Дорога через опорные точки. */
function road(g: Grid, size: BoardSize, rng: Rng, points: Pos[], decor: Map<string, MapDecor>): boolean {
  for (let i = 1; i < points.length; i++) if (!carve(g, size, rng, points[i - 1] as Pos, points[i] as Pos, decor)) return false
  return true
}

/** Достижимые пехотой клетки от точки. */
function reach(g: Grid, size: BoardSize, from: Pos): Set<string> {
  const seen = new Set([posKey(from)])
  const q = [from]
  for (let head = 0; head < q.length; head++) {
    const c = q[head] as Pos
    for (const o of N4) {
      const n = { x: c.x + o.x, y: c.y + o.y }
      if (!inMap(size, n) || blocked(get(g, n)) || seen.has(posKey(n))) continue
      seen.add(posKey(n))
      q.push(n)
    }
  }
  return seen
}

/**
 * Ручей — по диагонали из левого верхнего угла в правый нижний, поперёк средней дороги, с плавными изгибами.
 * Лестница из пар клеток: по нему не пройти пешком, только по мостам и бродам.
 */
function river(g: Grid, size: BoardSize, rng: Rng): void {
  let off = 0
  for (let t = 0; t < size.w; t++) {
    if (t % 4 === 0) off = clamp(off + rng.int(-1, 1), -2, 2)
    const y = t + off
    for (const p of [{ x: t, y }, { x: t + 1, y }]) if (inMap(size, p)) set(g, p, "water")
  }
}

/** Точки лагерей: в лесу между дорогами (не ближе 2 клеток к тропам и ручью), далеко от старта и друг от друга. */
function pickCamps(g: Grid, size: BoardSize, rng: Rng, count: number, start: Pos, exit: Pos, decor: Map<string, MapDecor>): Pos[] {
  const trail = [...decor.keys()].map((k) => {
    const [x, y] = k.split(",").map(Number)
    return { x: x ?? 0, y: y ?? 0 }
  })
  const water = cellsOf(size).filter(p => get(g, p) === "water")
  const nearest = (p: Pos, list: Pos[]) => list.reduce((m, q) => Math.min(m, manhattan(p, q)), Infinity)
  for (let relax = 0; relax < 4; relax++) {
    const camps: Pos[] = []
    for (let tries = 0; tries < 600 && camps.length < count; tries++) {
      const p = { x: rng.int(3, size.w - 4), y: rng.int(3, size.h - 4) }
      if (manhattan(p, start) < 10 - relax || manhattan(p, exit) < 7 - relax) continue
      if (camps.some(c => manhattan(c, p) < 9 - relax * 2)) continue
      if (nearest(p, trail) < 3 - Math.min(relax, 1) || nearest(p, water) < 3) continue
      camps.push(p)
    }
    if (camps.length === count) return camps
  }
  return []
}

/** Стражи лагеря: ближайшие к сундуку свободные проходимые клетки (на 1–3 клетки от него). */
function guardSpots(g: Grid, size: BoardSize, rng: Rng, chest: Pos, count: number, taken: Set<string>): Pos[] {
  const cands = rng.shuffle(diamond(size, chest, 3).filter((p) => {
    const d = manhattan(p, chest)
    return d >= 1 && !blocked(get(g, p)) && !taken.has(posKey(p))
  })).sort((a, b) => manhattan(a, chest) - manhattan(b, chest))
  return cands.slice(0, count)
}

const isMelee = (skill: Parameters<typeof weaponRange>[0]): boolean => weaponRange(skill) === 1

/** Земля, дороги и лагеря одной попытки; null — не сложилось. */
function terrainAttempt(size: BoardSize, rng: Rng, start: Pos, exit: Pos, campCount: number, spawns: Pos[]): { g: Grid, decor: Map<string, MapDecor>, camps: Pos[] } | null {
  const g = thickets(size, rng)
  const decor = new Map<string, MapDecor>()
  river(g, size, rng.fork("river"))
  // Валуны грудами и вековые стволы — непроходимые ориентиры чащи
  for (let i = 0; i < Math.round(size.w * size.h * 0.015); i++) {
    let p = { x: rng.int(0, size.w - 1), y: rng.int(0, size.h - 1) }
    const blob = rng.int(2, 4)
    for (let k = 0; k < blob; k++) {
      if (get(g, p) !== "water") set(g, p, "mountain")
      const o = rng.pick(N4)
      p = { x: clamp(p.x + o.x, 0, size.w - 1), y: clamp(p.y + o.y, 0, size.h - 1) }
    }
  }
  for (let i = 0; i < Math.round(size.w * size.h * 0.01); i++) {
    const p = { x: rng.int(0, size.w - 1), y: rng.int(0, size.h - 1) }
    if (get(g, p) !== "water") set(g, p, "wall")
  }
  // Поляны старта и выхода
  for (const p of [...diamond(size, start, 3), ...diamond(size, exit, 3)]) if (get(g, p) !== "water") set(g, p, "plain")
  // Три дороги, как линии в Dota: по краям и извилистая средняя по диагонали
  const m = { w: size.w - 1, h: size.h - 1 }
  const j = () => rng.int(-1, 1)
  const top = [start, { x: 2 + Math.max(0, j()), y: Math.round(m.h / 2) }, { x: 2, y: 2 }, { x: Math.round(m.w / 2), y: 2 + Math.max(0, j()) }, exit]
  const bottom = [start, { x: Math.round(m.w / 2), y: m.h - 2 - Math.max(0, j()) }, { x: m.w - 2, y: m.h - 2 }, { x: m.w - 2 - Math.max(0, j()), y: Math.round(m.h / 2) }, exit]
  const mid: Pos[] = [start]
  const steps = 6
  for (let s = 1; s < steps; s++) {
    const t = s / steps
    mid.push({
      x: clamp(Math.round(start.x + (exit.x - start.x) * t) + j() * 2, 2, m.w - 2),
      y: clamp(Math.round(start.y + (exit.y - start.y) * t) + j() * 2, 2, m.h - 2)
    })
  }
  mid.push(exit)
  for (const lane of [mid, top, bottom]) if (!road(g, size, rng, lane, decor)) return null
  // Пара бродов через ручей подальше от мостов: срезка через лес
  const water = rng.shuffle(cellsOf(size).filter(p => get(g, p) === "water"))
  let fords = 0
  for (const p of water) {
    if (fords >= 2) break
    if ([...decor.entries()].some(([k, d]) => d === "bridge" && manhattan(p, { x: Number(k.split(",")[0]), y: Number(k.split(",")[1]) }) < 6)) continue
    // Брод — клетка ручья и её пара на одной линии
    for (const q of [p, { x: p.x + 1, y: p.y }, { x: p.x - 1, y: p.y }]) if (get(g, q) === "water") set(g, q, "plain")
    fords++
  }
  // Лагеря в лесу и тропы к ним: от ближайшей точки дорог, часть лагерей — ещё и друг к другу
  const camps = pickCamps(g, size, rng.fork("camps"), campCount, start, exit, decor)
  if (camps.length < campCount) return null
  for (const c of camps) for (const p of diamond(size, c, 2)) if (get(g, p) !== "water") set(g, p, "plain")
  for (const c of camps) {
    const trailCells = [...decor.keys()].map((k) => {
      const [x, y] = k.split(",").map(Number)
      return { x: x ?? 0, y: y ?? 0 }
    })
    const nearest = trailCells.sort((a, b) => manhattan(a, c) - manhattan(b, c))[0]
    if (!nearest || !carve(g, size, rng, c, nearest, decor)) return null
  }
  for (const c of camps) {
    if (!rng.chance(0.6)) continue
    const other = camps.filter(o => o !== c).sort((a, b) => manhattan(a, c) - manhattan(b, c))[0]
    if (other) carve(g, size, rng, c, other, decor, 3)
  }
  // У лагерей — пни и гнилые брёвна (укрытия стражей), не на тропе
  for (const c of camps) {
    const spots = rng.shuffle(diamond(size, c, 3).filter(q => manhattan(q, c) >= 2 && !decor.has(posKey(q)) && get(g, q) !== "water"))
    for (const p of spots.slice(0, rng.int(1, 2))) set(g, p, rng.chance(0.7) ? "cover" : "wall_breakable")
  }
  for (const p of spawns) set(g, p, "plain")
  set(g, exit, "plain")
  // Связность: от старта достижимы выход и каждый сундук
  const seen = reach(g, size, start)
  if (!seen.has(posKey(exit)) || !camps.every(c => seen.has(posKey(c)))) return null
  return { g, decor, camps }
}

/** Карта вылазки в чащу. Детерминирована по seed. */
export function generateExpedition(opts: GenerateExpeditionOptions): MapDef {
  const size: BoardSize = { w: EXPEDITION.w, h: EXPEDITION.h }
  const root = createRng(opts.seed)
  const diff = difficultyDef(opts.difficulty)
  const biome = biomeDef(EXPEDITION_BIOME)
  const campCount = EXPEDITION.chests[opts.difficulty]
  const [gMin, gMax] = EXPEDITION.group[opts.difficulty]

  // Старт — левый нижний угол, выход — правый верхний («древний» в конце всех трёх дорог)
  const start = { x: 2, y: size.h - 3 }
  const exit = { x: size.w - 1, y: 0 }
  const spawnOrder: Pos[] = [
    { x: 1, y: size.h - 2 }, { x: 2, y: size.h - 2 }, { x: 1, y: size.h - 3 },
    { x: 2, y: size.h - 3 }, { x: 3, y: size.h - 2 }, { x: 3, y: size.h - 3 }
  ]
  const playerSpawns = spawnOrder.slice(0, Math.max(1, Math.min(opts.squadSize, spawnOrder.length)))

  let built: { g: Grid, decor: Map<string, MapDecor>, camps: Pos[] } | null = null
  for (let attempt = 0; attempt < 30 && !built; attempt++)
    built = terrainAttempt(size, root.fork(`terrain:${attempt}`), start, exit, campCount, playerSpawns)
  if (!built) {
    // Крайний случай: ровная поляна без препятствий и ручья, дороги и лагеря на ней
    const rng = root.fork("fallback")
    const g: Grid = Array.from({ length: size.h }, () => Array.from({ length: size.w }, (): TerrainId => "plain"))
    const decor = new Map<string, MapDecor>()
    carve(g, size, rng, start, exit, decor)
    const camps = pickCamps(g, size, rng, campCount, start, exit, decor)
    for (const c of camps) carve(g, size, rng, c, start, decor)
    built = { g, decor, camps }
  }
  const { g: tiles, decor, camps } = built

  // Стражи: группа на каждый лагерь, у одного из них ключ; чем больше группа, тем богаче сундук
  const erng = root.fork("enemies")
  const [minLevel, maxLevel] = teamLevels(diff, opts.team)
  const taken = new Set<string>([...playerSpawns, ...camps].map(posKey))
  const enemies: EnemyPlacement[] = []
  const chests: ExpeditionChest[] = []
  const baseTreats = teamTreats(diff, opts.team)
  camps.forEach((pos, i) => {
    const roles: EnemyRoles = { melee: 0, ranged: 0, healer: 0, dancer: 0, heavy: 0 }
    const places = guardSpots(tiles, size, erng, pos, erng.int(gMin, gMax), taken)
    const ids: string[] = []
    for (const at of places) {
      const level = clamp(erng.int(minLevel, maxLevel), 1, MAX_LEVEL)
      const loadout = pickEnemyLoadout(erng, level, roles, opts.difficulty)
      if (isMelee(loadout.weaponSkill)) roles.melee++
      else if (loadout.weaponSkill !== "whiteMagic") roles.ranged++
      if (loadout.weaponSkill === "whiteMagic") roles.healer++
      if (loadout.cls.moveType === "armored" || loadout.cls.moveType === "cavalry") roles.heavy++
      const unit = makeEnemy(erng, level, diff.rarity, biome.factionId, loadout, opts.difficulty, false, opts.now)
      taken.add(posKey(at))
      ids.push(unit.id)
      enemies.push({ unit, pos: at, stance: "hold", post: { ...pos }, leash: EXPEDITION.leash })
    }
    if (ids.length === 0) return
    const spread = 1 + (erng.next() * 2 - 1) * EXPEDITION.chestSpread
    const treats = Math.round(baseTreats * EXPEDITION.chestShare * (ids.length / 3) * spread)
    chests.push({ id: `chest_${i}`, pos: { ...pos }, treats, keyHolderId: erng.pick(ids) })
  })

  return {
    seed: opts.seed,
    biomeId: EXPEDITION_BIOME,
    factionId: biome.factionId,
    difficulty: opts.difficulty,
    objective: "extract",
    mode: "expedition",
    expedition: { chests, exit },
    decor: Object.fromEntries(decor),
    tiles,
    playerSpawns,
    enemies,
    reinforcements: [],
    rewards: { treats: baseTreats, glory: diff.glory }
  }
}
