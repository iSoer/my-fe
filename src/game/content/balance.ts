import type { Difficulty, ObjectiveKind, Rarity } from "@game/core/types"

export interface DifficultyDef {
  id: Difficulty
  name: string
  desc: string
  enemies: [number, number]
  levelRange: [number, number]
  rarity: [Rarity, Rarity]
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
    name: "Легко",
    desc: "Враги ждут, пока вы подойдёте. Хорошо для новой армии.",
    enemies: [3, 4],
    levelRange: [-3, 0],
    rarity: [1, 2],
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
    name: "Нормально",
    desc: "Половина врагов идёт на вас сразу. Честный бой.",
    enemies: [4, 5],
    levelRange: [-1, 2],
    rarity: [2, 3],
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
    name: "Сложно",
    desc: "Все враги агрессивны, на 3-м ходу приходит подкрепление.",
    enemies: [5, 7],
    levelRange: [1, 4],
    rarity: [3, 4],
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
    name: "Кошмар",
    desc: "Вожак, две волны подкреплений без предупреждения и ИИ, который хочет вас убить.",
    enemies: [6, 8],
    levelRange: [3, 7],
    rarity: [4, 5],
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

export const XP = {
  /** 80 уровней модели персонажа: уровень вдвое дешевле, чем при прежних 40. */
  perLevel: 50,
  combatBase: 20,
  combatPerLevelDiff: 2,
  combatMin: 4,
  combatMax: 40,
  killBonus: 10,
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
  /** С 5-го уровня открыт начальный ярус классов FW (Gladiator, Hunter, Soldier, Diviner). */
  startLevel: 5,
  startLevelWithGlory75: 10
}

export interface GloryTier {
  glory: number
  rarityWeights: Record<Rarity, number>
  bonus: string
}

export const GLORY_TIERS: readonly GloryTier[] = [
  { glory: 0, rarityWeights: { 1: 40, 2: 40, 3: 20, 4: 0, 5: 0 }, bonus: "" },
  { glory: 25, rarityWeights: { 1: 20, 2: 40, 3: 35, 4: 5, 5: 0 }, bonus: "Стартовый ростер из 7 персонажей" },
  { glory: 75, rarityWeights: { 1: 10, 2: 30, 3: 45, 4: 15, 5: 0 }, bonus: "Ростер стартует с 10 уровня" },
  { glory: 150, rarityWeights: { 1: 0, 2: 25, 3: 50, 4: 22, 5: 3 }, bonus: "Витрина магазина из 5 кандидатов" },
  { glory: 300, rarityWeights: { 1: 0, 2: 10, 3: 50, 4: 32, 5: 8 }, bonus: "В стартовом ростере гарантированный ★5" },
  { glory: 600, rarityWeights: { 1: 0, 2: 0, 3: 40, 4: 45, 5: 15 }, bonus: "Стартовые Вкусняшки 500" }
]

export function gloryTier(glory: number): GloryTier {
  let t = GLORY_TIERS[0] as GloryTier
  for (const tier of GLORY_TIERS) if (glory >= tier.glory) t = tier
  return t
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

export const TERRAIN_SHARE = {
  forest: [0.15, 0.25] as const,
  walls: [0.05, 0.12] as const,
  impassable: [0.0, 0.12] as const,
  covers: [2, 4] as const,
  breakable: [0, 3] as const
}
