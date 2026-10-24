import type { Difficulty, ObjectiveKind, Rarity, Stats, TerrainId } from "@game/core/types"
import { tr } from "@game/i18n"

export interface DifficultyDef {
  id: Difficulty
  name: string
  desc: string
  enemies: [number, number]
  /** Уровни врагов на этой сложности (не зависят от уровня армии): делятся на `ENEMY_TEAMS` команд. */
  levels: [number, number]
  rarity: [Rarity, Rarity]
  /** Множитель статов модели у врагов (HP, атака, защиты, скорость); 1 — без изменений. */
  enemyStatMult: number
  /** Доля врагов в стойке hold. */
  holdRatio: number
  reinforcements: { turn: number, count: number }[]
  objective: ObjectiveKind
  boss: boolean
  enemyCovers: number
  treatsMult: number
  glory: number
  unlock: { difficulty: Difficulty, wins: number } | null
  ai: AiProfile
}

export interface AiProfile {
  /** Вес полученного урона при выборе атаки. */
  wTaken: number
  /** Штраф за каждого бойца игрока, который сможет ударить по клетке назначения. */
  wExposure: number
  /** Бонус за добивание раненых: умножается на долю потерянного HP цели. */
  focusLowHp: number
  silentReinforcements: boolean
  /** Стоящий (hold) враг просыпается, если боец игрока ближе этого расстояния. */
  alertRadius: number
  /** С этого хода все стоящие враги идут в атаку сами. */
  wakeTurn: number
  /** Штраф за отрыв от своих (за каждую клетку дальше 2 от ближайшего союзника). */
  cohesion: number
  /** Доля HP, ниже которой враг без возможности убить отступает к лекарю/от угроз. */
  retreatHp: number
}

export const DIFFICULTIES: readonly DifficultyDef[] = [
  {
    id: "easy",
    get name() { return tr("Easy", "Легко") },
    get desc() { return tr("Enemies are a little weaker and wait for you to come to them. Good for a new army.", "Враги чуть слабее и ждут, пока вы подойдёте. Хорошо для новой армии.") },
    enemies: [3, 4],
    levels: [1, 20],
    rarity: [1, 2],
    // Враги на 7 % слабее: в автобоях отряд теряет ≈ на 20 % меньше HP (урон — разность атаки и защиты, эффект нелинейный)
    enemyStatMult: 0.93,
    holdRatio: 1,
    reinforcements: [],
    objective: "rout",
    boss: false,
    enemyCovers: 0,
    treatsMult: 1.0,
    glory: 1,
    unlock: null,
    ai: {
      wTaken: 0.3,
      wExposure: 0,
      focusLowHp: 0,
      silentReinforcements: false,
      alertRadius: 3,
      wakeTurn: 6,
      cohesion: 0,
      retreatHp: 0
    }
  },
  {
    id: "normal",
    get name() { return tr("Normal", "Нормально") },
    get desc() { return tr("Half the enemies charge right away. A fair fight.", "Половина врагов идёт на вас сразу. Честный бой.") },
    enemies: [4, 5],
    levels: [15, 40],
    rarity: [2, 3],
    enemyStatMult: 1,
    holdRatio: 0.5,
    reinforcements: [],
    objective: "rout",
    boss: false,
    enemyCovers: 1,
    treatsMult: 1.6,
    glory: 3,
    unlock: null,
    ai: {
      wTaken: 0.7,
      wExposure: 3,
      focusLowHp: 8,
      silentReinforcements: false,
      alertRadius: 4,
      wakeTurn: 4,
      cohesion: 1.5,
      retreatHp: 0.3
    }
  },
  {
    id: "hard",
    get name() { return tr("Hard", "Сложно") },
    get desc() { return tr("Every enemy is aggressive; reinforcements arrive on turn 3.", "Все враги агрессивны, на 3-м ходу приходит подкрепление.") },
    enemies: [5, 7],
    levels: [35, 60],
    rarity: [3, 4],
    enemyStatMult: 1,
    holdRatio: 0,
    reinforcements: [{ turn: 3, count: 2 }],
    objective: "rout",
    boss: false,
    enemyCovers: 2,
    treatsMult: 2.5,
    glory: 7,
    unlock: { difficulty: "normal", wins: 3 },
    ai: {
      wTaken: 1.0,
      wExposure: 6,
      focusLowHp: 14,
      silentReinforcements: false,
      alertRadius: 5,
      wakeTurn: 3,
      cohesion: 2.5,
      retreatHp: 0.35
    }
  },
  {
    id: "nightmare",
    get name() { return tr("Nightmare", "Кошмар") },
    get desc() { return tr("A Leader, two waves of surprise reinforcements and an AI that wants you dead.", "Вожак, две волны подкреплений без предупреждения и ИИ, который хочет вас убить.") },
    enemies: [6, 8],
    levels: [55, 80],
    rarity: [4, 5],
    enemyStatMult: 1,
    holdRatio: 0,
    reinforcements: [
      { turn: 2, count: 2 },
      { turn: 4, count: 2 }
    ],
    objective: "killBoss",
    boss: true,
    enemyCovers: 2,
    treatsMult: 4.0,
    glory: 15,
    unlock: { difficulty: "hard", wins: 3 },
    ai: {
      wTaken: 1.0,
      wExposure: 8,
      focusLowHp: 20,
      silentReinforcements: true,
      alertRadius: 6,
      wakeTurn: 2,
      cohesion: 3,
      retreatHp: 0.4
    }
  }
]

/** Сколько вражеских команд предлагает вылазка на каждой сложности. */
export const ENEMY_TEAMS = 4

/**
 * Уровни героев команды `team` (0 — самая слабая): диапазон сложности делится на `ENEMY_TEAMS` почти равных окон,
 * «Легко» 1–20 → 1–5, 6–10, 11–15, 16–20.
 */
export function teamLevels(d: Pick<DifficultyDef, "levels">, team: number): [number, number] {
  const [min, max] = d.levels
  const span = (max - min + 1) / ENEMY_TEAMS
  const t = Math.max(0, Math.min(ENEMY_TEAMS - 1, Math.floor(team)))
  return [min + Math.floor(t * span), t === ENEMY_TEAMS - 1 ? max : min + Math.floor((t + 1) * span) - 1]
}

/** Вкусняшки карты команды: (treatsBase + treatsPerLevel × средний уровень окна) × множитель сложности. */
export function teamTreats(d: Pick<DifficultyDef, "levels" | "treatsMult">, team: number): number {
  const [lo, hi] = teamLevels(d, team)
  return Math.round((REWARDS.treatsBase + REWARDS.treatsPerLevel * ((lo + hi) / 2)) * d.treatsMult)
}

export function difficultyDef(id: Difficulty): DifficultyDef {
  const d = DIFFICULTIES.find(x => x.id === id)
  if (!d) throw new Error(`unknown difficulty ${id}`)
  return d
}

export const PRICES = {
  trainBase: 40,
  /** Уровней 80, а не 40 — рост цены за уровень вдвое меньше. */
  trainPerLevel: 6,
  sharpen: [200, 500, 1000] as const
}

/**
 * Цены оружия в Лавке. Базовое — по грейду (деревянное бесплатно и не продаётся), разновидности — железного грейда.
 * Медианный бой на «Нормально» отрядом 5-го уровня (~125 🦴) окупает железное оружие с запасом, стальное — за бой.
 */
export const WEAPON_PRICES = {
  grade: { wood: 0, iron: 60, steel: 160, silver: 420 },
  variant: { brave: 320, killer: 220, armorslayer: 200, cavslayer: 200 }
} as const

/** Лавка и рюкзак вылазки. */
export const ITEMS = {
  /** Сколько расходников всего можно взять в одну вылазку. */
  packSize: 5,
  /** Больше этого количества одного предмета в инвентаре не купить. */
  stackCap: 99,
  /** Разновидностей оружия на витрине (Славы ≥ 150 — на одну больше). */
  variantOffers: 2,
  /** Стальное оружие — с уровня ростера 10 (3 навыка), серебряное — с 30 (2 навыка). */
  steelFromLevel: 10,
  steelOffers: 3,
  silverFromLevel: 30,
  silverOffers: 2,
  /** Талисманов на витрине (Славы ≥ 150 — на один больше). */
  talismanOffers: 4
}

/**
 * Опыт как в Fire Emblem: за каждое действие, за добивание — больше всего. Уровень — `perLevel` опыта.
 * Схватка: нанёс урон — `combatBase` + `combatPerLevelDiff` × (уровень врага − свой), в пределах [combatMin, combatMax];
 * не нанёс (не дотянулся, ноль урона) — `noDamage`; добил — ещё `killBonus` + `killPerLevelDiff` × разница,
 * вожак — ещё `bossBonus`. Боец выше врага — всё это −`overlevelPenalty` за уровень, но не меньше `combatMin`.
 * Лечение: `heal` + `healPerHp` × вылеченное HP (до `healMax`), предметом — вдвое меньше (не меньше `itemMin`).
 */
export const XP = {
  /** 80 уровней модели персонажа: уровень вдвое дешевле, чем при прежних 40. */
  perLevel: 50,
  combatBase: 20,
  combatPerLevelDiff: 2,
  combatMin: 1,
  combatMax: 40,
  /** Участвовал в схватке, но урона не нанёс. */
  noDamage: 1,
  killBonus: 30,
  killPerLevelDiff: 2,
  bossBonus: 20,
  /** Боец выше врага по уровню: опыт за схватку и добивание −10 % за каждый уровень разницы. */
  overlevelPenalty: 0.1,
  /** Выжившие при победе получают хотя бы столько опыта, даже если не дрались. */
  victoryMin: 1,
  heal: 10,
  healPerHp: 0.5,
  healMax: 25,
  itemMin: 3,
  /** Танец (вернуть союзнику ход). */
  dance: 10,
  /** Прочие Поддержки: перемещения, удар по стене и т. п. */
  assist: 10,
  rally: 8
}

export const SP = {
  combat: 4,
  kill: 8,
  assist: 4,
  costs: { assist: 150, special: 200, passive: [120, 200, 300] as const }
}

export const REWARDS = {
  /** Бонус за победу (Вкусняшки карты) = (treatsBase + treatsPerLevel × уровень) × множитель сложности × victoryShare. */
  treatsBase: 40,
  treatsPerLevel: 8,
  victoryShare: 0.5,
  flawlessBonus: 0.5,
  /** Доля выбитых Вкусняшек, которая достаётся при поражении (всё выбитое — только при победе). */
  defeatLootShare: 0.5,
  /** Доля выбитого при отступлении и сдаче: больше, чем при поражении, — отступить вовремя разумно. */
  retreatLootShare: 0.75,
  gloryPerDeath: 1,
  armyFallMinGlory: 5,
  /** Сколько кандидатов в бесплатной награде после боя (забрать можно одного). */
  rewardChoices: 3
}

/**
 * Вкусняшки, которые роняет убитый враг: (base + perLevel × уровень) × редкость × вожак × множитель сложности.
 * Медианный бой на «Нормально» с отрядом 5-го уровня даёт ~60 выбитых + ~65 за победу — примерно цена одного 3★.
 */
export const LOOT = {
  base: 3,
  perLevel: 0.6,
  rarityMult: { 1: 1, 2: 1.15, 3: 1.3, 4: 1.5, 5: 1.75 } as Record<Rarity, number>,
  bossMult: 5
}

/** Магазин персонажей: витрина обновляется после каждого боя, цена = (base + perLevel × уровень) × редкость. */
export const SHOP = {
  size: 4,
  sizeWithGlory150: 5,
  priceBase: 40,
  pricePerLevel: 8,
  rarityMult: { 1: 0.8, 2: 1.1, 3: 1.6, 4: 2.4, 5: 3.6 } as Record<Rarity, number>
}

/** Стартовый ростер новой армии (выдаётся целиком, отряд на бой выбирается из него). */
export const ROSTER = {
  size: 6,
  sizeWithGlory25: 7,
  /** Уровень стартового ростера; классы всегда стартовые (Soldier, Hunter, Mage, Healer, Gladiator). */
  startLevel: 5,
  startLevelWithGlory75: 10
}

/**
 * Звёзды случайных бойцов игрока (стартовый ростер, магазин, награды). Новая игра — только ★1; каждая звезда
 * открывается, когда первый боец перерождается в неё (80 ур. → 1 ур., +★). Вес звезды — только среди открытых.
 */
export const RECRUIT_RARITY_WEIGHTS: Record<Rarity, number> = { 1: 40, 2: 30, 3: 18, 4: 9, 5: 3 }

/** Веса звёзд при открытых ★1…`maxRarity`; `boost` (награда за победу) удваивает вес высшей открытой звезды. */
export function recruitRarityWeights(maxRarity: Rarity, boost = false): Record<Rarity, number> {
  const w = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<Rarity, number>
  for (const r of [1, 2, 3, 4, 5] as Rarity[]) if (r <= maxRarity) w[r] = RECRUIT_RARITY_WEIGHTS[r]
  if (boost && maxRarity > 1) w[maxRarity] *= 2
  return w
}

export interface GloryTier {
  glory: number
  bonus: string
}

export const GLORY_TIERS: readonly GloryTier[] = [
  { glory: 0, bonus: "" },
  { glory: 25, get bonus() { return tr("Starting Roster of 7 characters", "Стартовый ростер из 7 персонажей") } },
  { glory: 75, get bonus() { return tr("Roster starts at level 10", "Ростер стартует с 10 уровня") } },
  { glory: 150, get bonus() { return tr("Shop shows 5 candidates", "Витрина магазина из 5 кандидатов") } },
  { glory: 300, get bonus() { return tr("Starting Roster has a fighter of your highest unlocked ★", "В стартовом ростере гарантирован боец высшей открытой ★") } },
  { glory: 600, get bonus() { return tr("500 starting Treats", "Стартовые Вкусняшки 500") } }
]

export function gloryTier(glory: number): GloryTier {
  let t = GLORY_TIERS[0] as GloryTier
  for (const tier of GLORY_TIERS) if (glory >= tier.glory) t = tier
  return t
}

/** Бонус к статам бойцу, стоящему на клетке местности (по ним можно ходить, как по равнине). */
export const TERRAIN_BONUS: Partial<Record<TerrainId, Partial<Stats>>> = {
  forest: { def: 1, res: 1 }
}

/** Прокачка: каждый уровень растит хотя бы столько разных статов (+1 каждому). */
export const LEVEL_UP = {
  minStats: 2
}

/** Лечение Поддержкой растёт с уровнем лекаря: +bonus HP за каждые `every` уровней. */
export const HEAL_SCALING = {
  every: 5,
  bonus: 5
}

/** Прибавка к лечению от уровня лекаря: 0 до 4-го, +5 с 5-го, +10 с 10-го… */
export function healLevelBonus(level: number): number {
  return Math.floor(level / HEAL_SCALING.every) * HEAL_SCALING.bonus
}

export const COMBAT = {
  triangle: 0.2,
  effective: 1.5,
  coverBonus: 0.3,
  followUpSpd: 5,
  staffMult: 0.5,
  weaponTierMt: 2,
  /** Ниже требуемого ранга навыка оружие теряет столько Mt за каждую ступень ранга. */
  rankShortMt: 2,
  /** Mt за ранг оружейного навыка FW: floor(номер ранга × rankMt), E…D — 0, S — +3. */
  rankMt: 1 / 3,
  /** Вожак сильнее обычного врага на столько к каждому боевому стату. */
  bossBonus: 3
}

/**
 * Перевод статов модели персонажа (шкала покемонов, 25–180 на 80-м уровне) в боевые статы FEH.
 * HP = round(hp × hpMul) + hpAdd, остальные = round((стат − statOffset) × statMul), не меньше 0.
 * Медиана 1-го уровня (стат ≈ 45) даёт HP 19 / стат 7, 5★ на 80-м уровне (≈ 95) — HP 36 / стат 18.
 */
export const MODEL_SCALE = {
  hpMul: 0.33,
  hpAdd: 5,
  statMul: 0.22,
  statOffset: 15
}

/**
 * Доли местности на поле 6×8. Заросли и укрытия проходимы (дают бонус); стены, вода, горы и хлипкие препятствия
 * мешают идти — их немного, чтобы бойцам было где развернуться (генератор держит непроходимых ≤ `maxBlocked`).
 */
export const TERRAIN_SHARE = {
  forest: [0.15, 0.25] as const,
  walls: [0, 0.02] as const,
  impassable: [0.0, 0.03] as const,
  covers: [2, 4] as const,
  breakable: [0, 1] as const,
  /** Непроходимых клеток на карте не больше. */
  maxBlocked: 6
}
