import { STATS, type Stat } from "../api/schema/pokemon/generated"
import { MAX_LEVEL, MIN_LEVEL } from "./leveling"

// Weapon and movement skills of characters, after Fire Emblem: Fortune's Weave (docs/character-model.md, "Навыки")

export const WEAPON_SKILLS = ["sword", "axe", "spear", "bow", "gauntlet", "whiteMagic", "blackMagic"] as const

export const MOVEMENT_SKILLS = ["riding", "flying", "heavyArmor"] as const

export const SKILLS = [...WEAPON_SKILLS, ...MOVEMENT_SKILLS] as const

// E is where everyone starts, S is the top; FW asks for E+, D, C, B, A and S
export const RANKS = ["E", "E+", "D", "D+", "C", "C+", "B", "B+", "A", "A+", "S"] as const

export const APTITUDES = ["weak", "normal", "talent"] as const

export const MAX_TALENTS = 3

export const MAX_WEAKNESSES = 4

export type Skill = typeof SKILLS[number]

export type WeaponSkill = typeof WEAPON_SKILLS[number]

export type Rank = typeof RANKS[number]

export type Aptitude = typeof APTITUDES[number]

export type Aptitudes = Record<Skill, Aptitude>

export type Ranks = Record<Skill, Rank>

export const SKILL_LABELS: Record<Skill, string> = {
  sword: "Sword",
  axe: "Axe",
  spear: "Spear",
  bow: "Bow",
  gauntlet: "Gauntlet",
  whiteMagic: "White Magic",
  blackMagic: "Black Magic",
  riding: "Riding",
  flying: "Flying",
  heavyArmor: "Heavy Armor"
}

/** Weapon grades, from the starting wooden weapon to silver (the game sells them, the rank of the skill wields them) */
export const WEAPON_GRADES = ["wood", "iron", "steel", "silver"] as const

export type WeaponGrade = typeof WEAPON_GRADES[number]

export const WEAPON_GRADE_LABELS: Record<WeaponGrade, string> = {
  wood: "Wooden",
  iron: "Iron",
  steel: "Steel",
  silver: "Silver"
}

/**
 * How a rank grows with the level: `start` at level 1, then linearly to `end` at `endLevel`, rounded down.
 * A talent reaches C by level 20, B+ by 35, A by 45 and S by 55, just in time for each class tier;
 * a normal skill ends at A, a weak one at C.
 */
export const APTITUDE_CURVES: Record<Aptitude, { start: Rank, end: Rank, endLevel: number }> = {
  weak: { start: "E", end: "C", endLevel: MAX_LEVEL },
  normal: { start: "E+", end: "A", endLevel: MAX_LEVEL },
  talent: { start: "D", end: "S", endLevel: 55 }
}

export const rankIndex = (rank: Rank) => RANKS.indexOf(rank)

export const rankAtLevel = (aptitude: Aptitude, level: number): Rank => {
  const { start, end, endLevel } = APTITUDE_CURVES[aptitude]
  const from = rankIndex(start)
  const steps = rankIndex(end) - from
  const progress = Math.min(Math.max(Math.trunc(level), MIN_LEVEL), endLevel) - MIN_LEVEL

  return RANKS[from + Math.floor(steps * progress / (endLevel - MIN_LEVEL))]
}

export const ranksAtLevel = (aptitudes: Aptitudes, level: number) => Object.fromEntries(
  SKILLS.map(skill => [skill, rankAtLevel(aptitudes[skill], level)])
) as Ranks

/** Every skill normal, then the talents and weaknesses */
export const aptitudesOf = (talents: readonly Skill[], weaknesses: readonly Skill[] = []) => Object.fromEntries(
  SKILLS.map(skill => [skill, talents.includes(skill) ? "talent" : weaknesses.includes(skill) ? "weak" : "normal"])
) as Aptitudes

export const skillsWith = (aptitudes: Aptitudes, aptitude: Aptitude) => SKILLS.filter(skill => aptitudes[skill] === aptitude)

/**
 * Share of the stat budget a talent moves to each stat (sums to 0), like a pokemon type shifts the profile.
 * Hand-set from the FE roles: axes and gauntlets are strength and HP, magic is magic and resistance,
 * swords and bows are speed, heavy armor is defense paid with speed.
 */
export const SKILL_PROFILE_SHIFTS: Record<Skill, Record<Stat, number>> = {
  sword: { hp: -0.01, attack: 0.02, defense: -0.015, specialAttack: -0.02, specialDefense: -0.01, speed: 0.035 },
  axe: { hp: 0.025, attack: 0.04, defense: 0.005, specialAttack: -0.035, specialDefense: -0.015, speed: -0.02 },
  spear: { hp: 0.01, attack: 0.025, defense: 0.025, specialAttack: -0.03, specialDefense: -0.01, speed: -0.02 },
  bow: { hp: -0.015, attack: 0.025, defense: -0.02, specialAttack: -0.01, specialDefense: -0.005, speed: 0.025 },
  gauntlet: { hp: 0.03, attack: 0.03, defense: 0, specialAttack: -0.035, specialDefense: -0.015, speed: -0.01 },
  whiteMagic: { hp: 0.005, attack: -0.04, defense: -0.015, specialAttack: 0.02, specialDefense: 0.035, speed: -0.005 },
  blackMagic: { hp: -0.01, attack: -0.04, defense: -0.02, specialAttack: 0.05, specialDefense: 0.015, speed: 0.005 },
  riding: { hp: 0.015, attack: 0.01, defense: 0.005, specialAttack: -0.01, specialDefense: -0.005, speed: -0.015 },
  flying: { hp: -0.01, attack: 0, defense: -0.025, specialAttack: 0, specialDefense: 0.02, speed: 0.015 },
  heavyArmor: { hp: 0.015, attack: 0.01, defense: 0.06, specialAttack: -0.025, specialDefense: -0.02, speed: -0.04 }
}

/** Mean profile shift of the skills, 0 for none */
export const meanSkillShift = (skills: readonly Skill[]) => Object.fromEntries(STATS.map(stat => [
  stat,
  skills.length === 0 ? 0 : skills.reduce((sum, skill) => sum + SKILL_PROFILE_SHIFTS[skill][stat], 0) / skills.length
])) as Record<Stat, number>
