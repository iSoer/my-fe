import type { Difficulty, ObjectiveKind, Rarity } from '@core/types';

export interface DifficultyDef {
  id: Difficulty;
  name: string;
  desc: string;
  enemies: [number, number];
  levelRange: [number, number];
  rarity: [Rarity, Rarity];
  /** Доля врагов в стойке hold. */
  holdRatio: number;
  reinforcements: { turn: number; count: number }[];
  objective: ObjectiveKind;
  boss: boolean;
  enemyCovers: number;
  treatsMult: number;
  glory: number;
  recruitChance: number;
  unlock: { difficulty: Difficulty; wins: number } | null;
  ai: AiProfile;
}

export interface AiProfile {
  /** Вес полученного урона при выборе атаки. */
  wTaken: number;
  /** Штраф за каждого бойца игрока, который сможет ударить по клетке назначения. */
  wExposure: number;
  /** Бонус за добивание раненых: умножается на долю потерянного HP цели. */
  focusLowHp: number;
  silentReinforcements: boolean;
  /** Стоящий (hold) враг просыпается, если боец игрока ближе этого расстояния. */
  alertRadius: number;
  /** С этого хода все стоящие враги идут в атаку сами. */
  wakeTurn: number;
  /** Штраф за отрыв от своих (за каждую клетку дальше 2 от ближайшего союзника). */
  cohesion: number;
  /** Доля HP, ниже которой враг без возможности убить отступает к лекарю/от угроз. */
  retreatHp: number;
}

export const DIFFICULTIES: readonly DifficultyDef[] = [
  {
    id: 'easy',
    name: 'Легко',
    desc: 'Враги ждут, пока вы подойдёте. Хорошо для новой армии.',
    enemies: [3, 4],
    levelRange: [-3, 0],
    rarity: [1, 2],
    holdRatio: 1,
    reinforcements: [],
    objective: 'rout',
    boss: false,
    enemyCovers: 0,
    treatsMult: 1.0,
    glory: 1,
    recruitChance: 0.5,
    unlock: null,
    ai: { wTaken: 0.3, wExposure: 0, focusLowHp: 0, silentReinforcements: false, alertRadius: 3, wakeTurn: 6, cohesion: 0, retreatHp: 0 },
  },
  {
    id: 'normal',
    name: 'Нормально',
    desc: 'Половина врагов идёт на вас сразу. Честный бой.',
    enemies: [4, 5],
    levelRange: [-1, 2],
    rarity: [2, 3],
    holdRatio: 0.5,
    reinforcements: [],
    objective: 'rout',
    boss: false,
    enemyCovers: 1,
    treatsMult: 1.6,
    glory: 3,
    recruitChance: 0.65,
    unlock: null,
    ai: { wTaken: 0.7, wExposure: 3, focusLowHp: 8, silentReinforcements: false, alertRadius: 4, wakeTurn: 4, cohesion: 1.5, retreatHp: 0.3 },
  },
  {
    id: 'hard',
    name: 'Сложно',
    desc: 'Все враги агрессивны, на 3-м ходу приходит подкрепление.',
    enemies: [5, 7],
    levelRange: [1, 4],
    rarity: [3, 4],
    holdRatio: 0,
    reinforcements: [{ turn: 3, count: 2 }],
    objective: 'rout',
    boss: false,
    enemyCovers: 2,
    treatsMult: 2.5,
    glory: 7,
    recruitChance: 0.8,
    unlock: { difficulty: 'normal', wins: 3 },
    ai: { wTaken: 1.0, wExposure: 6, focusLowHp: 14, silentReinforcements: false, alertRadius: 5, wakeTurn: 3, cohesion: 2.5, retreatHp: 0.35 },
  },
  {
    id: 'nightmare',
    name: 'Кошмар',
    desc: 'Вожак, две волны подкреплений без предупреждения и ИИ, который хочет вас убить.',
    enemies: [6, 8],
    levelRange: [3, 7],
    rarity: [4, 5],
    holdRatio: 0,
    reinforcements: [
      { turn: 2, count: 2 },
      { turn: 4, count: 2 },
    ],
    objective: 'killBoss',
    boss: true,
    enemyCovers: 2,
    treatsMult: 4.0,
    glory: 15,
    recruitChance: 1.0,
    unlock: { difficulty: 'hard', wins: 3 },
    ai: { wTaken: 1.0, wExposure: 8, focusLowHp: 20, silentReinforcements: true, alertRadius: 6, wakeTurn: 2, cohesion: 3, retreatHp: 0.4 },
  },
];

export function difficultyDef(id: Difficulty): DifficultyDef {
  const d = DIFFICULTIES.find((x) => x.id === id);
  if (!d) throw new Error(`unknown difficulty ${id}`);
  return d;
}

export const PRICES = {
  trainBase: 40,
  trainPerLevel: 12,
  sharpen: [200, 500, 1000] as const,
  /** Найм в пустой слот: 60, затем +20 за каждый найм до следующего боя. */
  hireBase: 60,
  hireStep: 20,
  rerollRoster: [0, 10, 20, 40, 80, 160] as const,
};

export const XP = {
  perLevel: 100,
  combatBase: 20,
  combatPerLevelDiff: 2,
  combatMin: 4,
  combatMax: 40,
  killBonus: 10,
  assist: 10,
  rally: 8,
};

export const SP = {
  combat: 4,
  kill: 8,
  assist: 4,
  costs: { assist: 150, special: 200, passive: [120, 200, 300] as const, weapon: 300 },
};

export const REWARDS = {
  treatsBase: 40,
  treatsPerLevel: 8,
  flawlessBonus: 0.5,
  gloryPerDeath: 1,
  armyFallMinGlory: 5,
  /** Если после боя в казарме меньше бойцов, чем в отряде, пленник гарантирован. */
  guaranteeCaptiveBelow: 4,
};

export const ROSTER = {
  size: 8,
  sizeWithGlory150: 10,
  pick: 4,
};

export interface GloryTier {
  glory: number;
  rarityWeights: Record<Rarity, number>;
  bonus: string;
}

export const GLORY_TIERS: readonly GloryTier[] = [
  { glory: 0, rarityWeights: { 1: 40, 2: 40, 3: 20, 4: 0, 5: 0 }, bonus: '' },
  { glory: 25, rarityWeights: { 1: 20, 2: 40, 3: 35, 4: 5, 5: 0 }, bonus: '+1 бесплатное «Перемешать»' },
  { glory: 75, rarityWeights: { 1: 10, 2: 30, 3: 45, 4: 15, 5: 0 }, bonus: 'Ростер стартует с 3 уровня' },
  { glory: 150, rarityWeights: { 1: 0, 2: 25, 3: 50, 4: 22, 5: 3 }, bonus: 'Ростер из 10 кандидатов' },
  { glory: 300, rarityWeights: { 1: 0, 2: 10, 3: 50, 4: 32, 5: 8 }, bonus: 'Один гарантированный ★5' },
  { glory: 600, rarityWeights: { 1: 0, 2: 0, 3: 40, 4: 45, 5: 15 }, bonus: 'Стартовые Вкусняшки 500' },
];

export function gloryTier(glory: number): GloryTier {
  let t = GLORY_TIERS[0] as GloryTier;
  for (const tier of GLORY_TIERS) if (glory >= tier.glory) t = tier;
  return t;
}

export const COMBAT = {
  triangle: 0.2,
  effective: 1.5,
  coverBonus: 0.3,
  followUpSpd: 5,
  staffMult: 0.5,
  weaponTierMt: 2,
};

export const TERRAIN_SHARE = {
  forest: [0.15, 0.25] as const,
  walls: [0.05, 0.12] as const,
  impassable: [0.0, 0.12] as const,
  covers: [2, 4] as const,
  breakable: [0, 3] as const,
};
