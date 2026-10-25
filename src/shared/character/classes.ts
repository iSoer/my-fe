import { STATS, type Stat } from "./stats"
import { MAX_LEVEL, MIN_LEVEL, statsAtLevel, type StatValues } from "./leveling"
import {
  MOVEMENT_SKILLS, WEAPON_SKILLS, meanSkillShift, rankAtLevel, rankIndex, ranksAtLevel, type Aptitudes, type Rank, type Ranks, type Skill
} from "./skills"

// Classes of Fire Emblem: Fortune's Weave and when a character may take them (docs/character-model.md, "Классы")

export const CLASS_TIERS = ["beginner", "specialty", "advanced", "master", "divine"] as const

export type ClassTier = typeof CLASS_TIERS[number]

/** Level a tier opens at: every character starts in a beginner class, then 10 / 20 / 35, divine at 60 */
export const TIER_LEVELS: Record<ClassTier, number> = {
  beginner: MIN_LEVEL,
  specialty: 10,
  advanced: 20,
  master: 35,
  divine: 60
}

export const TIER_LABELS: Record<ClassTier, string> = {
  beginner: "Beginner",
  specialty: "Specialty",
  advanced: "Advanced",
  master: "Master",
  divine: "Divine"
}

export type Movement = "infantry" | "cavalry" | "flier" | "armored"

// Only these mounts are kept: horses for every Riding class, pegasi and dragons (Bau in FW) for the fliers
export type Mount = "horse" | "pegasus" | "dragon"

export const MOVEMENT_LABELS: Record<Movement, string> = {
  infantry: "Infantry",
  cavalry: "Cavalry",
  flier: "Flier",
  armored: "Armored"
}

export const MOUNT_LABELS: Record<Mount, string> = {
  horse: "Horse",
  pegasus: "Pegasus",
  dragon: "Dragon"
}

type Requirement = Partial<Record<Skill, Rank>>

export type CharacterClass = {
  id: string
  name: string
  tier: ClassTier
  // Every one of these ranks ("primary" in FW)
  all: Requirement
  // At least one of these ranks ("secondary" in FW)
  any: Requirement
}

/**
 * A requirement never asks for more than a talent has when the tier opens (`rankAtLevel("talent", …)`): FW ranks
 * are lowered to that, so a talented character can take the class right at `TIER_LEVELS`.
 */
const reachable = (name: ClassTier, requirement: Requirement): Requirement => {
  const cap = rankAtLevel("talent", TIER_LEVELS[name])

  return Object.fromEntries((Object.entries(requirement) as [Skill, Rank][])
    .map(([skill, rank]) => [skill, rankIndex(rank) > rankIndex(cap) ? cap : rank]))
}

const tier = (name: ClassTier, classes: [string, string, Requirement, Requirement?][]): CharacterClass[] => classes
  .map(([id, className, all, any = {}]) => ({ id, name: className, tier: name, all: reachable(name, all), any: reachable(name, any) }))

/**
 * Classes of FW except the enemy-only ones and the riders of anything but horses, pegasi and dragons
 * (Ornius, elephant and chariot classes); quest and route locks are left out
 */
export const CHARACTER_CLASSES: CharacterClass[] = [
  // Starting classes: E+ is a normal skill at level 1, so only a weakness closes one (and a character has at most 3)
  ...tier("beginner", [
    ["soldier", "Soldier", {}, { axe: "E+", spear: "E+" }],
    ["hunter", "Hunter", {}, { bow: "E+", sword: "E+" }],
    ["mage", "Mage", { blackMagic: "E+" }],
    ["healer", "Healer", { whiteMagic: "E+" }],
    ["gladiator", "Gladiator", {}, { gauntlet: "E+", axe: "E+", sword: "E+" }]
  ]),
  ...tier("specialty", [
    ["myrmidon", "Myrmidon", { sword: "C" }],
    ["brigand", "Brigand", {}, { axe: "C", sword: "C" }],
    ["pugilist", "Pugilist", { gauntlet: "C" }],
    ["archer", "Archer", { bow: "C" }],
    ["rogue", "Rogue", {}, { bow: "C", sword: "C" }],
    ["armored-knight", "Armored Knight", { heavyArmor: "E+" }, { axe: "C", spear: "C" }],
    ["light-cavalry", "Light Cavalry", { riding: "D" }, { spear: "C", sword: "C" }],
    ["wing-soldier", "Wing Soldier", { flying: "D" }, { spear: "C", sword: "C" }],
    ["priest", "Priest", { whiteMagic: "C" }],
    ["shaman", "Shaman", { blackMagic: "C" }]
  ]),
  ...tier("advanced", [
    ["shido", "Shido", { sword: "B" }],
    ["dancer", "Dancer", {}, { bow: "B", sword: "B" }],
    ["warrior", "Warrior", {}, { gauntlet: "B", axe: "B", sword: "B" }],
    ["blacksmith", "Blacksmith", { blackMagic: "D", axe: "C" }],
    ["sniper", "Sniper", { bow: "B" }],
    ["forest-knight", "Forest Knight", { riding: "D", bow: "B" }],
    ["ranger", "Ranger", {}, { bow: "B", sword: "B" }],
    ["guardian", "Guardian", { spear: "B" }],
    ["dreadnought", "Dreadnought", { heavyArmor: "D" }, { axe: "B", spear: "B" }],
    ["bardinger", "Bardinger", { riding: "C" }, { spear: "C", sword: "B" }],
    ["cataphract", "Cataphract", { heavyArmor: "E+", riding: "D" }, { axe: "B", spear: "B" }],
    ["dragoon", "Dragoon", { flying: "C" }, { axe: "B", spear: "B" }],
    ["ovate", "Ovate", { blackMagic: "B" }],
    ["bishop", "Bishop", { whiteMagic: "B" }],
    ["troubadour", "Troubadour", { riding: "D" }, { whiteMagic: "B", blackMagic: "B" }]
  ]),
  ...tier("master", [
    ["swordmaster", "Swordmaster", { sword: "A" }],
    ["high-savant", "High Savant", { riding: "D", blackMagic: "D", sword: "B" }],
    ["battlemaster", "Battlemaster", {}, { gauntlet: "A", axe: "A", sword: "A" }],
    ["war-monk", "War Monk", { whiteMagic: "D", gauntlet: "B" }],
    ["bow-adept", "Bow Adept", { bow: "A" }],
    ["bow-knight", "Bow Knight", { riding: "D", bow: "A" }],
    ["shadow-seeker", "Shadow Seeker", {}, { bow: "A", sword: "A" }],
    ["sentinel", "Sentinel", { spear: "A" }],
    ["castle-knight", "Castle Knight", { heavyArmor: "C" }, { axe: "A", spear: "A" }],
    ["orichaldia", "Orichaldia", { riding: "B" }, { spear: "A", sword: "A" }],
    ["great-knight", "Great Knight", { heavyArmor: "D", riding: "D" }, { axe: "A", spear: "A" }],
    ["celestial-trooper", "Celestial Trooper", { flying: "C" }, { spear: "A", sword: "A" }],
    ["bau-lord", "Bau Lord", { flying: "C" }, { axe: "A", spear: "A" }],
    ["druid", "Druid", { blackMagic: "A" }],
    ["wiseman", "Wiseman", { whiteMagic: "A" }],
    ["valkyrium", "Valkyrium", { riding: "D" }, { whiteMagic: "A", blackMagic: "A" }]
  ]),
  ...tier("divine", [
    ["the-blade", "The Blade", { sword: "S" }],
    ["the-apsara", "The Apsara", { bow: "C", sword: "A" }],
    ["the-eternal", "The Eternal", {}, { gauntlet: "S", axe: "S", sword: "S" }],
    ["the-godhand", "The Godhand", { whiteMagic: "C", gauntlet: "S" }],
    ["the-calamity", "The Calamity", {}, { bow: "S", sword: "S" }],
    ["the-trident", "The Trident", { spear: "S" }],
    ["the-cavalier", "The Cavalier", { riding: "A" }, { axe: "S", spear: "S", sword: "S" }],
    ["the-avatar", "The Avatar", {}, { whiteMagic: "S", blackMagic: "S" }]
  ])
]

export const CLASS_IDS = CHARACTER_CLASSES.map(item => item.id)

const byId = new Map(CHARACTER_CLASSES.map(item => [item.id, item]))

export const classById = (id: string) => byId.get(id)

/** Only one character may hold a divine class at a time, like in FW */
export const isUniqueClass = (item: CharacterClass) => item.tier === "divine"

export const requiredSkillsOf = (item: CharacterClass) => [...Object.keys(item.all), ...Object.keys(item.any)] as Skill[]

/** Weapons the class fights with: the weapon skills it requires */
export const weaponsOf = (item: CharacterClass) => {
  const required = requiredSkillsOf(item)

  return WEAPON_SKILLS.filter(skill => required.includes(skill))
}

export const movementOf = (item: CharacterClass): Movement => {
  const required = requiredSkillsOf(item).filter(skill => (MOVEMENT_SKILLS as readonly string[]).includes(skill))

  return required.includes("flying")
    ? "flier"
    : required.includes("riding")
      ? "cavalry"
      : required.includes("heavyArmor") ? "armored" : "infantry"
}

const FLIER_MOUNTS: Record<string, Mount> = {
  "wing-soldier": "pegasus",
  "celestial-trooper": "pegasus",
  "dragoon": "dragon",
  "bau-lord": "dragon"
}

/** What the class rides, undefined on foot */
export const mountOf = (item: CharacterClass): Mount | undefined => {
  switch (movementOf(item)) {
    case "cavalry":
      return "horse"
    case "flier":
      return FLIER_MOUNTS[item.id]
    default:
      return undefined
  }
}

const meets = (ranks: Ranks, requirement: Requirement, every: boolean) => {
  const entries = Object.entries(requirement) as [Skill, Rank][]
  const ok = ([skill, rank]: [Skill, Rank]) => rankIndex(ranks[skill]) >= rankIndex(rank)

  return entries.length === 0 || (every ? entries.every(ok) : entries.some(ok))
}

/** The tier is open at the level and the ranks meet every `all` requirement and one of `any` */
export const canTakeClass = (item: CharacterClass, ranks: Ranks, level: number) => level >= TIER_LEVELS[item.tier]
  && meets(ranks, item.all, true)
  && meets(ranks, item.any, false)

export const availableClasses = (aptitudes: Aptitudes, level: number) => {
  const ranks = ranksAtLevel(aptitudes, level)

  return CHARACTER_CLASSES.filter(item => canTakeClass(item, ranks, level))
}

/** First level the class opens at for these aptitudes, undefined when it never does */
export const earliestLevelOf = (item: CharacterClass, aptitudes: Aptitudes) => {
  for (let level = TIER_LEVELS[item.tier]; level <= MAX_LEVEL; level++) {
    if (canTakeClass(item, ranksAtLevel(aptitudes, level), level)) {
      return level
    }
  }

  return undefined
}

// Class bonus: a flat part for the tier plus the profile shift of the class skills scaled by the tier
const TIER_FLAT_BONUS: Record<ClassTier, number> = { beginner: 2, specialty: 4, advanced: 6, master: 8, divine: 12 }
const TIER_SHAPE_BONUS: Record<ClassTier, number> = {
  beginner: 150,
  specialty: 250,
  advanced: 350,
  master: 450,
  divine: 600
}

/** Stats the class adds while the character is in it, like the stat boosts of a FE class */
export const classBonusOf = (item: CharacterClass): StatValues => {
  const shift = meanSkillShift(requiredSkillsOf(item))

  return Object.fromEntries(STATS.map(stat => [
    stat,
    Math.round(TIER_FLAT_BONUS[item.tier] + TIER_SHAPE_BONUS[item.tier] * shift[stat])
  ])) as Record<Stat, number>
}

const MAX_STAT = 255

/** Stats at the level in the class: the character's own leveled stats plus the class bonus, within 1-255 */
export const statsInClass = (baseStats: StatValues, maxStats: StatValues, level: number, item: CharacterClass) => {
  const own = statsAtLevel(baseStats, maxStats, level)
  const bonus = classBonusOf(item)

  return Object.fromEntries(STATS.map(stat => [stat, Math.min(MAX_STAT, Math.max(1, own[stat] + bonus[stat]))])) as StatValues
}
