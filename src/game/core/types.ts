/** Базовые типы игрового ядра. Никаких зависимостей от DOM/Phaser. */
import type { Archetype } from "@shared/character/stats"
import { MAX_LEVEL as CHARACTER_MAX_LEVEL, type StatValues } from "@shared/character/leveling"
import type { Movement } from "@shared/character/classes"
import type { Aptitudes, Rank, Skill, WeaponSkill } from "@shared/character/skills"
import { DEFAULT_LANG, type Lang } from "@game/i18n"

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
/** Цель боя: перебить всех, убить вожака или (вылазка в чащу) вскрыть сундук и уйти через выход. */
export type ObjectiveKind = "rout" | "killBoss" | "extract"

/** Режим вылазки: обычная схватка на поле 6×8 или вылазка в мрачную чащу на поле втрое больше. */
export type BattleMode = "skirmish" | "expedition"
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
/** Размер поля карты: обычный бой — `MAP_W`×`MAP_H`, вылазка в чащу — больше (см. `MapDef.mode`). */
export interface BoardSize {
  w: number
  h: number
}

export function mapSize(map: { tiles: unknown[][] }): BoardSize {
  return { w: map.tiles[0]?.length ?? MAP_W, h: map.tiles.length || MAP_H }
}

/** Клетка внутри поля конкретной карты. */
export function inMap(size: BoardSize, p: Pos): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < size.w && p.y < size.h
}

/** Клетка внутри обычного поля 6×8 (генератор схваток и всё, что не знает карты). */
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
  /**
   * Опыт владения каждым навыком (оружие и передвижение): растёт от использования в бою, ранг — по порогам
   * `SKILL_XP.ranks` (`core/units/proficiency`). От уровня не зависит и переживает перерождение.
   */
  skillXp: Record<Skill, number>
  baseStats: StatValues
  maxStats: StatValues
  archetype: Archetype
  weaponTier: 0 | 1 | 2 | 3
  /** Талисман (`content/items.ts`): один слот, пассивные свойства через хуки навыков. */
  accessory?: string
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
  /** Страж сундука: стоит у поста и не преследует игрока дальше `leash` клеток от него. */
  post?: Pos
  leash?: number
}

/** Что лежит в сундуке: Вкусняшки, оружие или талисман (видно только клеймо категории на крышке). */
export type ChestKind = "treats" | "weapon" | "talisman"

/** Сундук вылазки в чащу: где стоит, что внутри, у какого стража ключ. */
export interface ExpeditionChest {
  id: string
  pos: Pos
  kind: ChestKind
  /** Вкусняшки внутри (сундук с Вкусняшками): при открытии идут в добычу вылазки. */
  treats: number
  /** Оружие или талисман внутри: достаётся армии, если отряд уйдёт через выход. */
  itemId?: string
  /** Враг, у которого ключ от этого сундука. */
  keyHolderId: string
}

/** Бонус до конца вылазки: выпадает из усиленного врага-одиночки, действует с момента, как его подобрали. */
export type BuffKind = "fury" | "swift" | "aegis" | "fortune"

/** Что лежит на клетке: сердечко (полное здоровье подобравшему) или бонус. */
export type PickupKind = "heart" | BuffKind

export interface Pickup {
  id: string
  pos: Pos
  kind: PickupKind
}

export interface ExpeditionDef {
  chests: ExpeditionChest[]
  /** Выходы в углах карты (три, кроме угла старта): боец на любом уводит отряд с добычей, если открыт хоть один сундук. */
  exits: Pos[]
  /** Сердечки на карте с начала вылазки. */
  pickups: Pickup[]
  /** Усиленные враги-одиночки и бонус, который остаётся на месте их гибели. */
  elites: { unitId: string, buff: BuffKind }[]
}

/** Где ключ от сундука: у бойца или на земле. */
export interface KeySpot {
  unitId?: string
  pos?: Pos
}

/** Ход вылазки: ключи, открытые сундуки, что лежит на земле, действующие бонусы и найденные предметы. */
export interface ExpeditionState {
  keys: Record<string, KeySpot>
  opened: string[]
  pickups: Pickup[]
  /** Бонусы всему отряду и личные (по id бойца). */
  buffs: { team: BuffKind[], units: Record<string, BuffKind[]> }
  /** Оружие и талисманы из сундуков: армия получит их, если отряд уйдёт через выход. */
  found: string[]
}

export interface ReinforcementWave {
  turn: number
  units: { unit: UnitInstance, pos: Pos }[]
}

/** Раскладка поля: узнаваемый шаблон карты (опушка, переправа, ущелье…), см. `core/map/layouts`. */
export type MapLayout = "glade" | "forestEdge" | "riverBridge" | "crossroads" | "pass" | "lake" | "fort" | "ruins"

/**
 * Оформление клетки поверх местности, без влияния на правила: тропинка по проходимой клетке и мост через воду
 * (клетка моста — обычная проходимая земля, под настилом рисуется вода).
 */
export type MapDecor = "path" | "bridge"

export interface MapDef {
  seed: number
  biomeId: string
  factionId: string
  difficulty: Difficulty
  objective: ObjectiveKind
  /** Шаблон раскладки (в старых сейвах нет). */
  layout?: MapLayout
  /** Режим: нет — обычная схватка. */
  mode?: BattleMode
  /** Сундуки и выход вылазки в чащу. */
  expedition?: ExpeditionDef
  /** Оформление клеток по `posKey`: тропинки и мосты. */
  decor?: Record<string, MapDecor>
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
  /** Страж сундука: пост и поводок (`EnemyPlacement`). */
  post?: Pos
  leash?: number
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
  /** Воскрешён на Кладбище: запись остаётся в истории, но воскресить по ней снова нельзя. */
  revivedAt?: number
}

export interface Settings {
  music: number
  sfx: number
  haptics: boolean
  animSpeed: 1 | 2
  cinematic: "always" | "mine" | "never"
  autoEndTurn: boolean
  /**
   * Подтверждение «Завершить ход», если не все бойцы действовали: двойным нажатием (по умолчанию: первое меняет
   * надпись, второе в течение 2 с завершает ход), окном с вопросом или без подтверждения.
   */
  endTurnConfirm: "modal" | "none" | "double"
  dangerZoneDefault: boolean
  blood: "sea" | "pools"
  confirmAttack: boolean
  /** Разговоры с жителями (визуальная новелла): выключены — тап по жителю открывает его место, как раньше. */
  dialogues: boolean
  /** Язык интерфейса. */
  lang: Lang
  /**
   * Качество графики Phaser-сцен: «auto» — плотность пикселей экрана, но не больше 2 (1.5 на слабых устройствах),
   * «crisp» — до 3, «eco» — 1 (как раньше: канвас в CSS-пикселях, бережёт батарею).
   */
  graphics: GraphicsQuality
}

export type GraphicsQuality = "auto" | "crisp" | "eco"

export const DEFAULT_SETTINGS: Settings = {
  music: 60,
  sfx: 80,
  haptics: true,
  animSpeed: 1,
  cinematic: "always",
  autoEndTurn: false,
  endTurnConfirm: "double",
  dangerZoneDefault: false,
  blood: "sea",
  confirmAttack: true,
  dialogues: true,
  lang: DEFAULT_LANG,
  graphics: "auto"
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
  /** Вылазка в чащу: где ключи, какие сундуки открыты. */
  expedition?: ExpeditionState
  /**
   * Вылазка в чащу: идёт разведка — ходов и фаз нет, отряд ходит свободно. Нет поля — пошаговый бой
   * (и всегда — вне чащи).
   */
  explore?: boolean
  /**
   * Вылазка в чащу, туман войны: разведанные клетки — строка из "0"/"1" по `y * w + x`. Нет поля — тумана нет
   * (видно всё; и всегда вне чащи).
   */
  revealed?: string
  /** Напиток из бара: прибавка к статам отряда игрока на весь бой. */
  drink?: BattleDrink
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
  /** Защитник вылечился после удара (Верность: доля снятого урона); `defenderHpAfter` — уже с лечением. */
  defenderHealed?: number
}

export type BattleAction
  = | { type: "attack", unitId: string, to: Pos, targetId: string, newStance?: Stance }
    | { type: "attackWall", unitId: string, to: Pos, wall: Pos, newStance?: Stance }
    /** Передвинуться, не завершая ход: боец остаётся готовым к действию. */
    | { type: "move", unitId: string, to: Pos }
    | { type: "assist", unitId: string, to: Pos, targetId: string, newStance?: Stance }
    | { type: "wait", unitId: string, to: Pos, newStance?: Stance }
    /** Открыть сундук, на котором стоит боец с ключом от него (ход не тратится). */
    | { type: "openChest", unitId: string }
    /** Увести отряд через выход, на котором стоит боец: победа. */
    | { type: "extract", unitId: string }
    /**
     * Вылазка в чащу, разведка (`BattleState.explore`): боец идёт к клетке без ограничения дальности, а без `solo` —
     * весь отряд строем за ним. Путь обрывается перед зоной тревоги врагов — тогда начинается пошаговый бой.
     */
    | { type: "explore", unitId: string, to: Pos, solo?: boolean }
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
    /** Навык (оружие или передвижение) бойца вырос до нового ранга от использования. */
    | { type: "rankUp", unitId: string, skill: Skill, rank: Rank }
    | { type: "waited", unitId: string }
    | { type: "phaseChanged", phase: Side, turn: number }
    | { type: "reinforcements", unitIds: string[] }
    | { type: "battleEnded", result: BattleResult }
    /** Вылазка в чащу: ключ перешёл к бойцу (убил носителя или подобрал с земли) или упал на землю. */
    | { type: "keyTaken", chestId: string, unitId: string, pos: Pos }
    | { type: "keyDropped", chestId: string, pos: Pos }
    | { type: "chestOpened", chestId: string, unitId: string, pos: Pos, treats: number, itemId?: string }
    /** Боец подобрал сердечко (`healed` — сколько HP вернулось) или бонус. */
    | { type: "pickup", unitId: string, pos: Pos, kind: PickupKind, healed?: number }
    /** Усиленный одиночка пал — на его клетке остался бонус. */
    | { type: "pickupDropped", pos: Pos, kind: PickupKind }
    | { type: "extracted", unitId: string, pos: Pos }
    /** Разведка: отряд (или один боец) прошёл к клеткам — все пути разом. */
    | { type: "squadMoved", leaderId: string, moves: { unitId: string, path: Pos[] }[] }
    /** Разведка кончилась: отряд упёрся в зону тревоги врагов — начинается пошаговый бой. */
    | { type: "alarm" }
    /** Бой кончился: проснувшихся врагов не осталось — снова разведка. */
    | { type: "calm" }

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
}

/** Инвентарь армии: id предмета (оружие, талисман) → количество. */
export type Inventory = Record<string, number>

export type ItemCategory = "weapon" | "talisman"

/**
 * Ассортимент Лавки: сменяется раз в период (`STORE.refreshHours`), товаров не убывает. Период — номер интервала
 * от эпохи Unix, поэтому перезапуск игры не обновляет витрину раньше времени.
 */
export interface StoreStock {
  seed: number
  weapons: string[]
  talismans: string[]
  /** Ассортимент обновился, а игрок ещё не заглядывал в Лавку («!» над зданием). */
  fresh: boolean
  /** Период, к которому относится витрина. */
  period: number
  /** Соль игры: зерно витрины периода — `salt` + `period`. */
  salt: number
  /** Платных обновлений витрины с последней вылазки: от них растёт цена следующего (`storeRerollCost`). */
  rerolls: number
  /** Номер выкладки внутри периода: 0 — плановая, дальше — после каждого обновления. Входит в зерно витрины. */
  variant: number
}

/* ---------- Поселение ---------- */

export type BuildingId = "barracks" | "training" | "store" | "graveyard" | "tavern"

/** Построенное здание: уровень 1…`BUILDING_MAX_LEVEL`. */
export interface BuildingState {
  level: number
  builtAt: number
}

/** Боец на тренировочном полигоне: опыт капает со временем (от `lastTick`) и после каждой вылазки. */
export interface TrainingSlot {
  unitId: string
  since: number
  /** Время последнего начисления опыта. */
  lastTick: number
  /** Остаток времени (мс), который ещё не дал целой единицы опыта. */
  carryMs: number
  /** Опыта получено за эту тренировку. */
  xp: number
}

export interface SettlementState {
  /** Построенные здания; места под строительство заданы картой (`content/settlement`). */
  buildings: Partial<Record<BuildingId, BuildingState>>
  training: TrainingSlot[]
  /** Бои, за которые полигон уже начислил опыт (последние несколько) — повторно за них не начисляется. */
  sortiesTrained: string[]
  /** Последнее успешное воскрешение на Кладбище. */
  lastReviveAt?: number
  /** Где стоит герой на карте поселения; нет — появляется на стартовой точке. */
  hero?: HeroSpot
  /** Кружка из бара, заказанная на следующую вылазку: выпивается при её начале. */
  drink?: OrderedDrink
}

/**
 * Сюжетные факты (`core/story`): счётчики событий по иерархическим ключам («sortie.victory», «drink.drunk.pale_ale»)
 * и увиденные сцены разговоров.
 */
export interface StoryState {
  counters: Record<string, number>
  seen: string[]
}

/** Заказанный напиток: сорт и уровень бара на момент заказа (от него сила). */
export interface OrderedDrink {
  id: string
  level: number
}

/** Напиток, выпитый перед боем: прибавка к статам бойцов игрока в процентах (снимок — от правок контента не зависит). */
export interface BattleDrink {
  id: string
  pct: Partial<Stats>
}

export type Facing = "down" | "up" | "left" | "right"

/** Герой в поселении: позиция в клетках карты (дробная — движение свободное). */
export interface HeroSpot {
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
  /** Бойцов осталось меньше, чем мест в отряде, — недостающие пришли сами (`reinforcements`). */
  recruits?: UnitInstance[]
  /** Вылазка в чащу: оружие и талисманы из сундуков, унесённые через выход. */
  found?: string[]
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
  settlement: SettlementState
  memorial: MemorialEntry[]
  achievements: string[]
  settings: Settings
  stats: GlobalStats
  /** Сюжетные факты для триггеров диалогов. */
  story: StoryState
  pendingBattle?: PendingBattle
  /** Зерно вражеских команд вылазки: держится до конца следующего боя, смена сложности не перебрасывает врагов. */
  sortieSeed?: number
  /** Бесплатная награда за бой: три кандидата, игрок забирает одного. */
  rewardChoice?: UnitInstance[]
  lastBattle?: BattleSummary
}
