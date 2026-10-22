import type {
  BattleState,
  MapDef,
  MoveType,
  Pos,
  Stats,
  TerrainId,
  UnitInstance,
  UnitSkills,
  Difficulty,
  Stance,
  WeaponSkill
} from "@game/core/types"
import { MAP_H, MAP_W, STATS } from "@game/core/types"
import { generateUnit, statsAtLevel } from "@game/core/units"
import { createBattle } from "@game/core/battle/reducer"
import { MODEL_SCALE } from "@game/content/balance"
import { fwClass } from "@game/content/classes"
import { classBonusOf, type CharacterClass } from "@shared/character/classes"
import { aptitudesOf } from "@shared/character/skills"
import type { StatValues } from "@shared/character/leveling"

export interface TestUnitSpec {
  /** Комплект «движение_оружие» в терминах модели: infantry_sword, armored_spear, flier_bow, dancer_sword… */
  classId: string
  level?: number
  seed?: number
  pos: Pos
  skills?: Partial<UnitSkills>
  traitId?: string | null
  species?: "cat" | "dog"
  stance?: Stance
  /** Боевые статы (шкала FEH), одинаковые на любом уровне. */
  baseStats?: Partial<Stats>
  weaponTier?: 0 | 1 | 2 | 3
  isBoss?: boolean
}

/** Класс модели для типа движения (`movementOf`); `dancer_*` — класс Dancer. */
const MOVE_CLASS: Record<MoveType | "dancer", string> = {
  infantry: "commoner",
  armored: "armored-knight",
  cavalry: "light-cavalry",
  flier: "wing-soldier",
  dancer: "dancer"
}

/** Стат модели, который после `MODEL_SCALE` даёт ровно `target` (модель → бой обратимо на целых). */
function modelValue(target: number, toCombat: (v: number) => number, guess: number): number {
  for (const v of [guess, guess - 1, guess + 1, guess - 2, guess + 2]) if (v >= 1 && toCombat(v) === target) return v
  throw new Error(`no model value for combat stat ${target}`)
}

/** Статы модели (без бонуса класса), при которых боевые статы равны `combat` на любом уровне. */
function pinnedModelStats(combat: Stats, cls: CharacterClass): StatValues {
  const { hpMul, hpAdd, statMul, statOffset } = MODEL_SCALE
  const hp = modelValue(combat.hp, v => Math.round(v * hpMul) + hpAdd, Math.round((combat.hp - hpAdd) / hpMul))
  const stat = (t: number): number =>
    t <= 0
      ? statOffset
      : modelValue(t, v => Math.max(0, Math.round((v - statOffset) * statMul)), Math.round(statOffset + t / statMul))
  const inClass: StatValues = {
    hp,
    attack: stat(combat.atk),
    specialAttack: stat(combat.atk),
    speed: stat(combat.spd),
    defense: stat(combat.def),
    specialDefense: stat(combat.res)
  }
  const bonus = classBonusOf(cls)
  const own = { ...inClass }
  for (const k of Object.keys(own) as (keyof StatValues)[]) {
    own[k] = inClass[k] - bonus[k]
    if (own[k] < 1) throw new Error(`class bonus ${bonus[k]} of ${cls.id} does not fit ${k} ${inClass[k]}`)
  }
  return own
}

let counter = 1

export function makeUnit(spec: TestUnitSpec, isEnemy: boolean): UnitInstance {
  const seed = spec.seed ?? counter++ * 7919
  const [move, weapon] = spec.classId.split("_") as [MoveType | "dancer", WeaponSkill]
  const u = generateUnit({
    seed,
    level: spec.level ?? 1,
    classId: "commoner",
    rarity: 3,
    isEnemy,
    species: spec.species,
    withTrait: false,
    isBoss: spec.isBoss
  })
  // Комплект ставится напрямую, в обход ярусов: бою не важно, открыт ли класс на уровне
  u.classId = MOVE_CLASS[move]
  u.weaponSkill = weapon
  u.skills = { ...u.skills, weapon: `${weapon}_basic` }
  // Все навыки обычные: ранг оружия на низких уровнях не добавляет Mt
  u.aptitudes = aptitudesOf([])
  if (spec.baseStats) {
    const combat = { ...statsAtLevel(u, u.level), ...spec.baseStats }
    for (const s of STATS) combat[s] = Math.max(s === "hp" ? 5 : 0, combat[s])
    const own = pinnedModelStats(combat, fwClass(u.classId))
    u.baseStats = own
    u.maxStats = { ...own }
  }
  if (spec.traitId === null) delete u.traitId
  else if (spec.traitId) u.traitId = spec.traitId
  if (spec.skills) u.skills = { ...u.skills, ...spec.skills }
  if (spec.weaponTier !== undefined) u.weaponTier = spec.weaponTier
  // убрать стартовые пассивки/спецприёмы, если явно не заданы — чтобы тесты были предсказуемы
  if (!spec.skills?.special) delete u.skills.special
  if (!spec.skills?.a) delete u.skills.a
  if (!spec.skills?.b) delete u.skills.b
  if (!spec.skills?.c) delete u.skills.c
  if (weapon === "whiteMagic") u.skills.assist = spec.skills?.assist ?? "as_heal"
  else if (move === "dancer") u.skills.assist = spec.skills?.assist ?? "as_dance"
  else if (!spec.skills?.assist) delete u.skills.assist
  return u
}

export function plainTiles(overrides: Record<string, TerrainId> = {}): TerrainId[][] {
  const tiles: TerrainId[][] = Array.from({ length: MAP_H }, () =>
    Array.from({ length: MAP_W }, (): TerrainId => "plain")
  )
  for (const [k, t] of Object.entries(overrides)) {
    const [x, y] = k.split(",").map(Number)
    if (x !== undefined && y !== undefined && tiles[y]) (tiles[y] as TerrainId[])[x] = t
  }
  return tiles
}

export interface TestBattle {
  state: BattleState
  players: UnitInstance[]
  enemies: UnitInstance[]
}

export function makeBattle(
  players: TestUnitSpec[],
  enemies: TestUnitSpec[],
  opts: {
    tiles?: TerrainId[][]
    difficulty?: Difficulty
    reinforcements?: MapDef["reinforcements"]
    objective?: MapDef["objective"]
  } = {}
): TestBattle {
  const pUnits = players.map(p => makeUnit(p, false))
  const eUnits = enemies.map(e => makeUnit(e, true))
  const map: MapDef = {
    seed: 1,
    biomeId: "yard",
    factionId: "yard_pack",
    difficulty: opts.difficulty ?? "normal",
    objective: opts.objective ?? "rout",
    tiles: opts.tiles ?? plainTiles(),
    playerSpawns: players.map(p => p.pos),
    enemies: eUnits.map((u, i) => ({
      unit: u,
      pos: (enemies[i] as TestUnitSpec).pos,
      stance: (enemies[i] as TestUnitSpec).stance ?? "advance"
    })),
    reinforcements: opts.reinforcements ?? [],
    rewards: { treats: 100, glory: 3 }
  }
  const { state } = createBattle({ map, squad: pUnits, seed: 42, now: 1000 })
  return { state, players: pUnits, enemies: eUnits }
}
