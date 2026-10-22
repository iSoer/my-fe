import { STATS, type Stat } from "../api/schema/pokemon/generated"

// Deterministic leveling of generated characters (docs/character-model.md, "Прокачка")

export const MIN_LEVEL = 1

export const MAX_LEVEL = 80

export const RARITIES = [1, 2, 3, 4, 5] as const

export type Rarity = typeof RARITIES[number]

export type StatValues = Record<Stat, number>

/** How a rarity scales a character relative to its 5★ version */
export type RarityScale = {
  // Level-1 stats relative to 5★
  baseMultiplier: number
  // Gain from level 1 to MAX_LEVEL relative to 5★
  growthMultiplier: number
}

/**
 * Level-1 value of a stat that reaches `max` at MAX_LEVEL. `growth` is the 5★ ratio max / base;
 * a rarity keeps the 5★ proportions: base = b × baseMultiplier, gain = b × (growth − 1) × growthMultiplier.
 */
export const levelOneStat = (max: number, growth: number, { baseMultiplier, growthMultiplier }: RarityScale) => {
  const base = Math.round(max * baseMultiplier / (baseMultiplier + (growth - 1) * growthMultiplier))

  return Math.min(max, Math.max(1, base))
}

export const levelOneStats = (maxStats: StatValues, growth: StatValues, scale: RarityScale) => Object.fromEntries(
  STATS.map(stat => [stat, levelOneStat(maxStats[stat], growth[stat], scale)])
) as StatValues

/** Linear growth from `base` at level 1 to `max` at MAX_LEVEL, rounded down: the same level always gives the same value */
export const statAtLevel = (base: number, max: number, level: number) => {
  const clamped = Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.trunc(level)))

  return base + Math.floor((max - base) * (clamped - MIN_LEVEL) / (MAX_LEVEL - MIN_LEVEL))
}

export const statsAtLevel = (baseStats: StatValues, maxStats: StatValues, level: number) => Object.fromEntries(
  STATS.map(stat => [stat, statAtLevel(baseStats[stat], maxStats[stat], level)])
) as StatValues

export const totalOfStats = (stats: StatValues) => STATS.reduce((sum, stat) => sum + stats[stat], 0)

/** Fire Emblem names of the six stats a character shares with pokemon */
export const CHARACTER_STAT_LABELS: Record<Stat, string> = {
  hp: "HP",
  attack: "Str",
  defense: "Def",
  specialAttack: "Mag",
  specialDefense: "Res",
  speed: "Spd"
}
