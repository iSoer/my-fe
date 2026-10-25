/** Базовые типы игрового ядра. Никаких зависимостей от DOM/Phaser. */
import type { Archetype } from "@shared/api/schema/pokemon/generated"
import { MAX_LEVEL as CHARACTER_MAX_LEVEL, type StatValues } from "@shared/character/leveling"
import type { Movement } from "@shared/character/classes"
import type { Aptitudes, WeaponSkill } from "@shared/character/skills"
import { DEFAULT_LANG, type Lang } from "@game/i18n"
import type { BuildingId } from "@game/content/buildings"
import type { DecorId } from "@game/content/village"

export type { WeaponSkill }

export type Species = "cat" | "dog" | "mouse"
export type Gender = "m" | "f"
/** Типы движения — из модели персонажа (`movementOf` класса FW). */
export type MoveType = Movement
export type Color = "red" | "blue" | "green" | "colorless"
/** Боевые статы: у каждого бойца есть и Сила (`str`), и Магия (`mag`); бьёт он тем, чем бьёт его оружие. */
export type Stat = "hp" | "str" | "mag" | "spd" | "def" | "res"
export type Stats = Record<Stat, number>
export type Rarity = 1 | 2 | 3 | 4 | 5
export type Side = "player" | "enemy"
export type Difficulty = "easy" | "normal" | "hard" | "nightmare"
export type TerrainId = "plain" | "forest" | "mountain" | "water" | "wall" | "wall_breakable" | "cover"
export type SkillSlot = "weapon" | "assist" | "special" | "a" | "b" | "c"
export type Stance = "hold" | "advance" | "guard"
export type ObjectiveKind = "rout" | "killBoss"
export type BattleResult = "victory" | "defeat" | "retreat"

export interface Pos {
  x: number
  y: number
}

export const STATS: readonly Stat[] = ["hp", "str", "mag", "spd", "def", "res"] as const
export const MAP_W = 6
export const MAP_H = 8
/** Уровни бойцов — уровни модели персонажа (1–80). */
export const MAX_LEVEL = CHARACTER_MAX_LEVEL
/** В бой выходят до 4 бойцов ростера. */
export const SQUAD_SIZE = 4

export function posKey(p: Pos): string {
  return `${p.x},${p.y}`
}
export function samePos(a: Pos, b: Pos): boolean {
  return a.x === b.x && a.y === b.y
}
export function manhattan(a: Pos, b: Pos): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}
export function inBounds(p: Pos): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < MAP_W && p.y < MAP_H
}
export function emptyStats(): Stats {
  return { hp: 0, str: 0, mag: 0, spd: 0, def: 0, res: 0 }
}
export function addStats(a: Stats, b: Partial<Stats>): Stats {
  return {
    hp: a.hp + (b.hp ?? 0),
    str: a.str + (b.str ?? 0),
    mag: a.mag + (b.mag ?? 0),
    spd: a.spd + (b.spd ?? 0),
    def: a.def + (b.def ?? 0),
    res: a.res + (b.res ?? 0)
  }
}
/** Стат, которым бьёт оружие: Mag у магии и посохов, иначе Str. */
export function attackStatOf(magical: boolean): "str" | "mag" {
  return magical ? "mag" : "str"
}
/** Бонус «+N к Str и Mag» (навыки, талисманы, Поддержка): действует на атаку любым оружием. */
export function bothAttacks(n: number): { str: number, mag: number } {
  return { str: n, mag: n }
}
export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

/** Внешность — индексы слоёв, из которых собирается портрет и спрайт. */
export interface Appearance {
  build: 0 | 1 | 2
  furPalette: number
  pattern: number
  eyes: number
  eyeColor: number
  accessory: number
}

export interface UnitHistory {
  battles: number
  kills: number
  damageDealt: number
  damageTaken: number
  closestCall: number
}

export interface UnitSkills {
  weapon: string
  assist?: string
  special?: string
  a?: string
  b?: string
  c?: string
}

/** Персонаж (боец игрока или враг) вне боя. */
export interface UnitInstance {
  id: string
  seed: number
  name: string
  epithet?: string
  gender: Gender
  species: Species
  breedId: string
  personalityId: string
  /** Класс Fortune's Weave (`CHARACTER_CLASSES`); тип движения выводится из него. */
  classId: string
  /** Оружейный навык модели, которым боец сражается; его ранг добавляет Mt. */
  weaponSkill: WeaponSkill
  rarity: Rarity
  level: number
  xp: number
  sp: number
  /** Модель персонажа: склонности к навыкам и собственные статы на 1-м и 80-м уровне (шкала модели). */
  aptitudes: Aptitudes
  baseStats: StatValues
  maxStats: StatValues
  archetype: Archetype
  weaponTier: 0 | 1 | 2 | 3
  /** Талисман (`content/items.ts`): один слот, пассивные свойства через хуки навыков. */
  accessory?: string
  /** Стаки усталости после боёв (`FATIGUE`): штраф к статам, снимает Больница. */
  fatigue?: number
  /** Блюдо Столовой (`DISHES`) — только у копии бойца внутри боя, бафф на этот бой. */
  meal?: string
  skills: UnitSkills
  learned: string[]
  learnable: string[]
  appearance: Appearance
  history: UnitHistory
  createdAt: number
  isEnemy?: boolean
  isBoss?: boolean
  factionId?: string
}

export interface Army {
  id: string
  units: UnitInstance[]
  squadIds: string[]
  createdAt: number
  battles: number
  wins: number
}

export interface MapRewards {
  treats: number
  glory: number
}

export interface EnemyPlacement {
  unit: UnitInstance
  pos: Pos
  stance: Stance
}

export interface ReinforcementWave {
  turn: number
  units: { unit: UnitInstance, pos: Pos }[]
}

export interface MapDef {
  seed: number
  biomeId: string
  factionId: string
  difficulty: Difficulty
  objective: ObjectiveKind
  tiles: TerrainId[][]
  playerSpawns: Pos[]
  enemies: EnemyPlacement[]
  reinforcements: ReinforcementWave[]
  rewards: MapRewards
}

/** Состояние юнита внутри боя. */
export interface BattleUnit {
  unitId: string
  side: Side
  pos: Pos
  hp: number
  maxHp: number
  specialCd: number
  acted: boolean
  alive: boolean
  bonuses: Partial<Stats>
  penalties: Partial<Stats>
  stance: Stance
  flags: Record<string, number>
  /** На каком ходу появился (для подкреплений). */
  spawnedTurn: number
  /**
   * Клетка, с которой боец начал ход, если он уже передвинулся, но ещё не действовал. Переставлять бойца
   * можно сколько угодно раз, но дальность хода всегда считается от неё.
   */
  turnStart?: Pos
}

export interface Decal {
  pos: Pos
  kind: "splat" | "pool"
}

export interface BattleStats {
  kills: number
  damage: number
  turns: number
  deaths: string[]
  xpGained: Record<string, number>
  /** Вкусняшки, выбитые из врагов за бой (остаются и при поражении). */
  loot: number
  mvpId?: string
}

export interface MemorialEntry {
  id: string
  unit: UnitInstance
  diedAt: number
  killerName?: string
  battleTurn?: number
  biomeId?: string
  epitaph: string
  reason: "killed" | "released"
}

export interface Settings {
  music: number
  sfx: number
  haptics: boolean
  animSpeed: 1 | 2
  cinematic: "always" | "mine" | "never"
  autoEndTurn: boolean
  dangerZoneDefault: boolean
  blood: "sea" | "pools"
  confirmAttack: boolean
  /** Язык интерфейса. */
  lang: Lang
}

export const DEFAULT_SETTINGS: Settings = {
  music: 60,
  sfx: 80,
  haptics: true,
  animSpeed: 1,
  cinematic: "always",
  autoEndTurn: false,
  dangerZoneDefault: false,
  blood: "sea",
  confirmAttack: true,
  lang: DEFAULT_LANG
}

/* ---------- Бой: состояние, действия, события ---------- */

export interface BattleState {
  id: string
  seed: number
  map: MapDef
  difficulty: Difficulty
  turn: number
  phase: Side
  units: Record<string, BattleUnit>
  /** Снимок всех персонажей боя (игрок + враги), XP/уровни меняются здесь, затем сливаются в армию. */
  roster: Record<string, UnitInstance>
  /** HP хлипких стен по ключу "x,y". */
  walls: Record<string, number>
  decals: Decal[]
  result?: BattleResult
  /** Бой закончился по лимиту ходов (`BATTLE.turnLimit`): исход — отступление. */
  timeUp?: boolean
  stats: BattleStats
  spawnedWaves: number[]
  /** Порядок хода врагов в текущей фазе (null = не рассчитан). */
  enemyQueue: string[] | null
  startedAt: number
}

export type Effect
  = | { type: "buff", unitId: string, stats: Partial<Stats> }
    | { type: "debuff", unitId: string, stats: Partial<Stats> }
    | { type: "heal", unitId: string, amount: number, sourceId?: string }
    | { type: "damage", unitId: string, amount: number, sourceId?: string }
    | { type: "flag", unitId: string, key: string, value: number }

export type Triangle = "adv" | "dis" | "neutral"

export interface Strike {
  attackerId: string
  defenderId: string
  damage: number
  special?: string
  defenseSpecial?: string
  effective: boolean
  triangle: Triangle
  healed: number
  isCounter: boolean
  range: number
  attackerHpAfter: number
  defenderHpAfter: number
  miracle?: boolean
}

export type BattleAction
  = | { type: "attack", unitId: string, to: Pos, targetId: string, newStance?: Stance }
    | { type: "attackWall", unitId: string, to: Pos, wall: Pos, newStance?: Stance }
    /** Передвинуться, не завершая ход: боец остаётся готовым к действию. */
    | { type: "move", unitId: string, to: Pos }
    | { type: "assist", unitId: string, to: Pos, targetId: string, newStance?: Stance }
    | { type: "wait", unitId: string, to: Pos, newStance?: Stance }
    | { type: "endPhase" }
    | { type: "retreat" }

export type BattleEvent
  = | { type: "moved", unitId: string, path: Pos[] }
    | {
      type: "combat"
      attackerId: string
      defenderId: string
      attackerPos: Pos
      defenderPos: Pos
      strikes: Strike[]
      attackerHpBefore: number
      defenderHpBefore: number
      attackerHpAfter: number
      defenderHpAfter: number
    }
    | { type: "wallHit", unitId: string, pos: Pos, hpAfter: number }
    | {
      type: "assist"
      unitId: string
      targetId: string
      assistId: string
      moves: { unitId: string, to: Pos }[]
      heal: number
      targetHpAfter?: number
      unitHpAfter?: number
    }
    | { type: "effect", effect: Effect, hpAfter?: number }
    | { type: "died", unitId: string, killerId?: string, pos: Pos, side: Side }
    | { type: "loot", unitId: string, pos: Pos, amount: number }
    | { type: "xp", unitId: string, amount: number, sp: number }
    | { type: "levelUp", unitId: string, level: number, gains: Partial<Stats> }
    | { type: "waited", unitId: string }
    | { type: "phaseChanged", phase: Side, turn: number }
    | { type: "reinforcements", unitIds: string[] }
    | { type: "battleEnded", result: BattleResult }

export interface ReduceResult {
  state: BattleState
  events: BattleEvent[]
}

/* ---------- Сейв ---------- */

export interface Profile {
  /** Когда начата текущая игра; нет — игры нет, на главном экране только «Новая игра». */
  startedAt?: number
  glory: number
  treats: number
  wins: Record<Difficulty, number>
  armiesCreated: number
  /** Еда с Полей: для Столовой и на продажу. */
  food: number
  /** Высшая звезда, открытая перерождением бойца: случайные бойцы (ростер, магазин, награды) — ★1…maxRarity. */
  maxRarity: Rarity
}

/** Магазин: витрина персонажей за Вкусняшки, обновляется после каждого боя. */
export interface Shelter {
  candidates: UnitInstance[]
  seed: number
}

/** Разведанный бой: карта и враги уже известны, игрок собирает под них отряд. */
export interface PendingBattle {
  seed: number
  difficulty: Difficulty
  biomeId: string
  /** Выбранная вражеская команда 0…ENEMY_TEAMS−1. */
  team: number
  map: MapDef
  /** Блюда Столовой на эту вылазку: id бойца отряда → id блюда. Еда списывается при старте боя. */
  meals?: Record<string, string>
}

/** Инвентарь армии: id предмета (оружие, талисман) → количество. */
export type Inventory = Record<string, number>

export type ItemCategory = "weapon" | "talisman"

/** Ассортимент Лавки (Торговой площадки): обновляется каждый реальный час, товаров не убывает. */
export interface StoreStock {
  seed: number
  /** Номер часа (`now / MARKET.refreshMs`), на который собрана витрина. */
  hour: number
  weapons: string[]
  talismans: string[]
  /** Ассортимент обновился, а игрок ещё не заглядывал в Лавку («!» над торговцем). */
  fresh: boolean
}

export type Facing = "down" | "up" | "left" | "right"

/** Герой в деревне: позиция в клетках карты (дробная — движение свободное). */
export interface VillageState {
  pos: Pos
  facing: Facing
}

export interface GlobalStats {
  battles: number
  wins: number
  kills: number
  deaths: number
  armiesLost: number
}

export interface LevelUpSummary {
  unitId: string
  from: number
  to: number
  gains: Partial<Stats>
}

export interface BattleSummary {
  result: BattleResult
  difficulty: Difficulty
  biomeId: string
  turns: number
  kills: number
  damage: number
  fallen: MemorialEntry[]
  xp: Record<string, number>
  levelUps: LevelUpSummary[]
  /**
   * treats — всего за бой: доля выбитого (loot) по исходу + бонус за победу; lost — сколько выбитого потеряно
   * из-за поражения или отступления.
   */
  rewards: { treats: number, loot: number, lost: number, glory: number, flawless: boolean }
  mvpId?: string
  survivors: UnitInstance[]
  armyFell: boolean
  /** Отступление по лимиту ходов, а не по решению игрока. */
  timeUp?: boolean
}

/** Поселение: уровни зданий и состояние их механик. Время — `Date.now()`, офлайн-прогресс считается при входе. */
export interface Settlement {
  /** Уровень здания 0–5 (0 — не построено). */
  buildings: Record<BuildingId, number>
  /** Зерно витрин Торговой площадки: витрина часа — от него и номера часа. */
  marketSeed: number
  training: {
    /** Бойцы на полигоне (до `TRAINING.slots`); в отряд вылазки их не взять. */
    unitIds: string[]
    /** До какого момента опыт за время уже начислен. */
    since: number
    /** Накопленный, но ещё не забранный опыт по бойцам. */
    bank: Record<string, number>
  }
  /** Поля: Еда растёт с момента `since` (до вместимости амбара). */
  fields: { since: number }
  /** Сколько бойцов Больница ещё вылечит до следующего боя. */
  hospital: { charges: number }
  /** Где что стоит в лагере: построенные здания (левый верхний угол участка) и декор. */
  layout: CampLayoutSave
}

export interface DecorPlacement {
  id: DecorId
  x: number
  y: number
}

export interface CampLayoutSave {
  /** Есть у каждого построенного здания (уровень > 0). */
  buildings: Partial<Record<BuildingId, Pos>>
  decor: DecorPlacement[]
}

export interface SaveGame {
  version: number
  updatedAt: number
  profile: Profile
  army?: Army
  battle?: BattleState
  shelter: Shelter
  inventory: Inventory
  store: StoreStock
  village: VillageState
  settlement: Settlement
  memorial: MemorialEntry[]
  achievements: string[]
  settings: Settings
  stats: GlobalStats
  pendingBattle?: PendingBattle
  /** Зерно вражеских команд вылазки: держится до конца следующего боя, смена сложности не перебрасывает врагов. */
  sortieSeed?: number
  /** Бесплатная награда за бой: три кандидата, игрок забирает одного. */
  rewardChoice?: UnitInstance[]
  lastBattle?: BattleSummary
}
