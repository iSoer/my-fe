import type { Rng } from "../rng"
import { createRng } from "../rng"
import type {
  Difficulty,
  EnemyPlacement,
  MapDecor,
  MapDef,
  MapLayout,
  MoveType,
  ObjectiveKind,
  Pos,
  Rarity,
  ReinforcementWave,
  Species,
  TerrainId,
  UnitInstance,
  WeaponSkill
} from "../types"
import { MAP_H, MAP_W, MAX_LEVEL, clamp, inBounds, posKey } from "../types"
import { isPassable } from "./pathing"
import { emptyDraft, layoutDef, pickLayout } from "./layouts"
import { generateUnit, loadoutsAt, type Loadout } from "../units"
import type { StatValues } from "@shared/character/leveling"
import { enemyWeaponGrade } from "../items"
import { BIOMES, biomeDef, waterFillsTile } from "@game/content/biomes"
import { DIFFICULTIES, TERRAIN_SHARE, difficultyDef, teamLevels, teamTreats } from "@game/content/balance"
import { DANCER_CLASS, unitClass } from "@game/content/classes"
import { weaponRange } from "@game/content/weapons"
import { factionDef } from "@game/content/factions"

export interface GenerateMapOptions {
  seed: number
  /** «random» — любой из всех биомов (биомы не завязаны на прогрессию). */
  biomeId: string | "random"
  difficulty: Difficulty
  /** Вражеская команда 0…ENEMY_TEAMS−1: окно уровней внутри диапазона сложности (`teamLevels`). */
  team: number
  squadSize: number
  now?: number
}

type Grid = TerrainId[][]

function emptyGrid(): Grid {
  return Array.from({ length: MAP_H }, () => Array.from({ length: MAP_W }, (): TerrainId => "plain"))
}

function cells(): Pos[] {
  const out: Pos[] = []
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) out.push({ x, y })
  return out
}

function neighbors4(p: Pos): Pos[] {
  return [
    { x: p.x + 1, y: p.y },
    { x: p.x - 1, y: p.y },
    { x: p.x, y: p.y + 1 },
    { x: p.x, y: p.y - 1 }
  ].filter(inBounds)
}

function get(g: Grid, p: Pos): TerrainId {
  return g[p.y]?.[p.x] ?? "wall"
}
function set(g: Grid, p: Pos, t: TerrainId): void {
  const row = g[p.y]
  if (row) row[p.x] = t
}

function playerSpawnsFor(size: number): Pos[] {
  const order: Pos[] = [
    { x: 1, y: 7 },
    { x: 4, y: 7 },
    { x: 2, y: 7 },
    { x: 3, y: 7 },
    { x: 2, y: 6 },
    { x: 3, y: 6 }
  ]
  return order.slice(0, Math.max(1, Math.min(size, 6)))
}

function scatter(g: Grid, rng: Rng, terrain: TerrainId, count: number, allowed: (p: Pos) => boolean): void {
  let placed = 0
  let guard = 0
  while (placed < count && guard++ < 400) {
    const p = { x: rng.int(0, MAP_W - 1), y: rng.int(0, MAP_H - 1) }
    if (get(g, p) !== "plain" || !allowed(p)) continue
    set(g, p, terrain)
    placed++
  }
}

function bfsReach(g: Grid, from: Pos, moveType: MoveType): Set<string> {
  const seen = new Set<string>([posKey(from)])
  const q = [from]
  while (q.length > 0) {
    const c = q.shift() as Pos
    for (const n of neighbors4(c)) {
      const k = posKey(n)
      if (seen.has(k) || !isPassable(get(g, n), moveType)) continue
      seen.add(k)
      q.push(n)
    }
  }
  return seen
}

function validate(g: Grid, playerSpawns: Pos[], enemySpawns: Pos[], maxBlocked: number): boolean {
  const all = cells()
  const passable = all.filter(p => isPassable(get(g, p), "infantry"))
  if (all.length - passable.length > maxBlocked) return false
  for (let y = 0; y < MAP_H; y++) if ((g[y] ?? []).filter(t => isPassable(t, "infantry")).length < 2) return false
  const first = playerSpawns[0]
  if (!first) return false
  const reach = bfsReach(g, first, "infantry")
  for (const p of playerSpawns) if (!reach.has(posKey(p))) return false
  const reachableEnemies = enemySpawns.filter(p => reach.has(posKey(p))).length
  if (enemySpawns.length > 0 && reachableEnemies / enemySpawns.length < 0.8) return false
  for (const p of [...playerSpawns, ...enemySpawns]) {
    const blocked = neighbors4(p).filter(n => !isPassable(get(g, n), "infantry")).length
    if (blocked + (4 - neighbors4(p).length) >= 3) return false
  }
  return true
}

export type EnemyRoles = { melee: number, ranged: number, healer: number, dancer: number, heavy: number }

const isMelee = (skill: WeaponSkill): boolean => weaponRange(skill) === 1

/** Комплект врага (класс FW + оружие) из доступных модели на его уровне, с поправками на роли отряда. */
export function pickEnemyLoadout(rng: Rng, level: number, roles: EnemyRoles, difficulty: Difficulty): Loadout {
  const pool = loadoutsAt(level).filter(l => l.classId !== DANCER_CLASS || roles.dancer === 0)
  const weightOf = (l: Loadout): number => {
    let w = l.weight
    const k = l.weaponSkill
    if (roles.melee === 0 && isMelee(k)) w *= 4
    if (roles.ranged === 0 && !isMelee(k) && k !== "whiteMagic") w *= 4
    if (k === "whiteMagic") w = roles.healer > 0 || difficulty === "easy" ? 0 : w
    if (l.classId === DANCER_CLASS) w = difficulty === "easy" || difficulty === "normal" ? 0 : w
    if (
      (difficulty === "hard" || difficulty === "nightmare")
      && roles.heavy === 0
      && (l.cls.moveType === "armored" || l.cls.moveType === "cavalry")
    )
      w *= 3
    return w
  }
  return rng.weighted(pool.map(l => ({ item: l, w: weightOf(l) })))
}

export function makeEnemy(
  rng: Rng,
  level: number,
  rarityRange: [Rarity, Rarity],
  factionId: string,
  loadout: Loadout,
  difficulty: Difficulty,
  isBoss: boolean,
  now?: number
): UnitInstance {
  const faction = factionDef(factionId)
  const rarity = clamp(rng.int(rarityRange[0], rarityRange[1]) + (isBoss ? 1 : 0), 1, 5) as Rarity
  const species = rng.weighted(
    (Object.entries(faction.species) as [Species, number][]).map(([item, w]) => ({ item, w }))
  )
  const unit = generateUnit({
    seed: rng.int(0, 0x7fffffff),
    level,
    rarity,
    species,
    classId: loadout.classId,
    weaponSkill: loadout.weaponSkill,
    weaponGrade: enemyWeaponGrade(level),
    isEnemy: true,
    factionId,
    isBoss,
    now
  })
  const mult = difficultyDef(difficulty).enemyStatMult
  if (mult === 1) return unit
  // Ослабление врагов сложностью: масштабируем статы модели, рост по уровням сохраняет пропорции
  const scale = (s: StatValues): StatValues =>
    Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Math.max(1, Math.round(v * mult))])) as StatValues
  return { ...unit, baseStats: scale(unit.baseStats), maxStats: scale(unit.maxStats) }
}

export function generateMap(opts: GenerateMapOptions): MapDef {
  const root = createRng(opts.seed)
  const diff = difficultyDef(opts.difficulty)
  const biomeId
    = opts.biomeId === "random" ? root.fork("biome").pick(BIOMES.map(b => b.id)) : opts.biomeId
  const biome = biomeDef(biomeId)
  const playerSpawns = playerSpawnsFor(opts.squadSize)
  const enemyCount = root.fork("count").int(diff.enemies[0], diff.enemies[1])

  let tiles: Grid | null = null
  let enemySpawns: Pos[] = []
  const reserved = new Set<string>(playerSpawns.map(posKey))

  const env = { waterOk: waterFillsTile(biome.id), forestBias: biome.bias.forest }
  let layout: MapLayout = pickLayout(root.fork("layout"), biome.id, env)
  let decor = new Map<string, MapDecor>()

  for (let attempt = 0; attempt < 50 && !tiles; attempt++) {
    const rng = root.fork(`terrain:${attempt}`)
    // Шаблон не сложился за 30 попыток (тесный биом, неудачные спавны) — поляна: она складывается всегда
    if (attempt === 30) layout = "glade"
    const def = layoutDef(layout)
    const draft = emptyDraft(reserved)
    def.build(draft, rng.fork("layout"), env)
    const g = draft.g
    const allowed = (p: Pos): boolean => !reserved.has(posKey(p)) && !draft.decor.has(posKey(p))
    // Укрытия — у края зарослей и стен (за ними прячутся), а не посреди чистого поля; два укрытия рядом не встают
    const sheltered = (p: Pos): boolean =>
      neighbors4(p).some(n => get(g, n) !== "plain" && get(g, n) !== "cover") && !neighbors4(p).some(n => get(g, n) === "cover")
    const covers = rng.int(TERRAIN_SHARE.covers[0], TERRAIN_SHARE.covers[1]) + biome.bias.covers
    scatter(g, rng, "cover", covers, p => allowed(p) && p.y > 2 && p.y < 6 && (sheltered(p) || (rng.chance(0.25) && !neighbors4(p).some(n => get(g, n) === "cover"))))
    scatter(g, rng, "cover", diff.enemyCovers, p => allowed(p) && p.y <= 2 && !neighbors4(p).some(n => get(g, n) === "cover"))
    const breakable = rng.int(TERRAIN_SHARE.breakable[0], TERRAIN_SHARE.breakable[1])
    scatter(g, rng, "wall_breakable", breakable, p => allowed(p) && p.y > 1 && p.y < 6 && sheltered(p))

    // Спавны игрока — всегда проходимы
    for (const p of playerSpawns) set(g, p, "plain")

    // Спавны врагов в рядах 0–2
    const candidates = rng.shuffle(cells().filter(p => p.y <= 2 && isPassable(get(g, p), "infantry")))
    enemySpawns = candidates.slice(0, enemyCount)
    if (enemySpawns.length < enemyCount) continue
    if (validate(g, playerSpawns, enemySpawns, def.maxBlocked)) {
      tiles = g
      decor = draft.decor
    }
  }

  if (!tiles) {
    layout = "glade"
    decor = new Map()
    tiles = emptyGrid()
    for (const p of [
      { x: 0, y: 3 },
      { x: 5, y: 4 },
      { x: 2, y: 3 },
      { x: 3, y: 4 }
    ])
      set(tiles, p, "forest")
    set(tiles, { x: 2, y: 5 }, "cover")
    set(tiles, { x: 3, y: 2 }, "cover")
    enemySpawns = [
      { x: 1, y: 0 },
      { x: 4, y: 0 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
      { x: 0, y: 2 },
      { x: 5, y: 2 },
      { x: 1, y: 2 },
      { x: 4, y: 2 }
    ].slice(0, enemyCount)
  }

  // Враги
  const erng = root.fork("enemies")
  const factionId = biome.factionId
  const roles = { melee: 0, ranged: 0, healer: 0, dancer: 0, heavy: 0 }
  const colorCount: Record<string, number> = {}
  const enemies: EnemyPlacement[] = []
  const bossIndex = diff.boss ? 0 : -1
  const sortedSpawns = [...enemySpawns].sort((a, b) => b.y - a.y || a.x - b.x) // ближние к игроку — первыми (ближники)

  const [minLevel, maxLevel] = teamLevels(diff, opts.team)
  const levelOf = (): number => clamp(erng.int(minLevel, maxLevel), 1, MAX_LEVEL)
  const loadoutFor = (i: number, level: number): Loadout => {
    let loadout = pickEnemyLoadout(erng, level, roles, opts.difficulty)
    // не более 60 % одного оружия
    if ((colorCount[loadout.weaponSkill] ?? 0) + 1 > Math.ceil(enemyCount * 0.6) && i > 0)
      loadout = pickEnemyLoadout(erng, level, roles, opts.difficulty)
    const k = loadout.weaponSkill
    colorCount[k] = (colorCount[k] ?? 0) + 1
    if (isMelee(k)) roles.melee++
    else if (k !== "whiteMagic") roles.ranged++
    if (k === "whiteMagic") roles.healer++
    if (loadout.classId === DANCER_CLASS) roles.dancer++
    if (loadout.cls.moveType === "armored" || loadout.cls.moveType === "cavalry") roles.heavy++
    return loadout
  }

  const picks = Array.from({ length: enemyCount }, (_, i) => {
    const level = levelOf()
    return { level, loadout: loadoutFor(i, level) }
  })
  // Расстановка: ближники/броня — ближе к игроку, дальники/лекари — дальше
  const isMeleePick = (p: { loadout: Loadout }): boolean => isMelee(p.loadout.weaponSkill)
  const ordered = [...picks.filter(isMeleePick), ...picks.filter(p => !isMeleePick(p))]
  const holdCount = Math.round(enemyCount * diff.holdRatio)
  ordered.forEach(({ level, loadout }, i) => {
    const pos = sortedSpawns[i]
    if (!pos) return
    const isBoss = i === bossIndex && diff.boss
    const unit = makeEnemy(erng, level, diff.rarity, factionId, loadout, opts.difficulty, isBoss, opts.now)
    const stance = isBoss ? "guard" : i < holdCount ? "hold" : "advance"
    enemies.push({ unit, pos, stance })
  })
  if (diff.boss) {
    // Босс стоит дальше всех — в ряду 0 по центру, если свободно
    const boss = enemies.find(e => e.unit.isBoss)
    const far = [...enemySpawns].sort((a, b) => a.y - b.y || Math.abs(a.x - 2.5) - Math.abs(b.x - 2.5))[0]
    if (boss && far) {
      const other = enemies.find(e => e.pos.x === far.x && e.pos.y === far.y)
      if (other && other !== boss) other.pos = boss.pos
      boss.pos = far
    }
  }
  // Клетка под каждым врагом должна быть проходима для его типа движения
  for (const e of enemies) if (!isPassable(get(tiles, e.pos), unitClass(e.unit).moveType)) set(tiles, e.pos, "plain")

  // Подкрепления
  const reinforcements: ReinforcementWave[] = []
  const rrng = root.fork("reinforcements")
  const topFree = cells().filter(p => p.y === 0 && isPassable(get(tiles, p), "infantry"))
  for (const wave of diff.reinforcements) {
    const units: ReinforcementWave["units"] = []
    const spots = rrng.shuffle(topFree)
    for (let i = 0; i < wave.count; i++) {
      const pos = spots[i % Math.max(1, spots.length)] ?? { x: i, y: 0 }
      const level = levelOf()
      const loadout = pickEnemyLoadout(
        rrng,
        level,
        { melee: 1, ranged: 1, healer: 1, dancer: 1, heavy: 0 },
        opts.difficulty
      )
      if (!isPassable(get(tiles, pos), loadout.cls.moveType)) set(tiles, pos, "plain")
      units.push({
        unit: makeEnemy(rrng, level, diff.rarity, factionId, loadout, opts.difficulty, false, opts.now),
        pos
      })
    }
    reinforcements.push({ turn: wave.turn, units })
  }

  const objective: ObjectiveKind = diff.objective
  const treats = teamTreats(diff, opts.team)

  return {
    seed: opts.seed,
    biomeId,
    factionId,
    difficulty: opts.difficulty,
    objective,
    layout,
    decor: Object.fromEntries(decor),
    tiles,
    playerSpawns,
    enemies,
    reinforcements,
    rewards: { treats, glory: diff.glory }
  }
}

export { DIFFICULTIES }
