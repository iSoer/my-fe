import { STATS } from "@shared/api/schema/pokemon/generated"
import type {
  CustomCharacterType, GenerateCharacterRequestType, GeneratedCharacterType, UpdateCharacterBodyType
} from "@shared/api/schema/character/generated"
import { MAX_LEVEL, MIN_LEVEL, RARITIES, levelOneStats, totalOfStats, type Rarity } from "@shared/character/leveling"
import {
  CLASS_TIERS, TIER_LABELS, TIER_LEVELS, availableClasses, canTakeClass, classById, earliestLevelOf, statsInClass,
  type CharacterClass
} from "@shared/character/classes"
import {
  MAX_TALENTS, SKILLS, SKILL_LABELS, aptitudesOf, meanSkillShift, rankAtLevel, rankIndex, ranksAtLevel, skillsWith,
  type Aptitudes, type Rank, type Skill
} from "@shared/character/skills"
import {
  GenerateRequestError, GenerationError, distributeStats, fitBst, nearestArchetype, normalizeShares, pickArchetype, pickBst,
  pickExperience, sampleProfile, sampleSize
} from "@/server/pokemon-model/generate"
import { cosine, toShares, toVector } from "@/server/pokemon-model/math"
import { generateName } from "@/server/pokemon-model/names"
import { createRng, type Rng } from "@/server/pokemon-model/random"
import { budgetRangeOf, referenceBstOf, type CharacterModel } from "./model"
import { validateCharacter } from "./validate"

export type GeneratedCharacter = GeneratedCharacterType

// P(1 talent), P(2), P(3)
const TALENT_COUNT_WEIGHTS = [0.3, 0.5, 0.2]
// How strongly the fit between a skill's profile shift and the sampled profile drives the choice: exp(k × cosine)
const SKILL_ALIGNMENT = 2
// Weight of the talents' profile shift when they were picked at random; requested talents shift the profile fully
const RANDOM_TALENT_SHIFT = 0.7
const MIN_WEAKNESSES = 1
const MAX_RANDOM_WEAKNESSES = 3
// Random classes prefer higher tiers, the way players promote: weight (tier index + 1)^k
const CLASS_TIER_POWER = 2

const stars = (rarity: Rarity) => `${rarity}★`

const classLabel = (item: CharacterClass) => `${item.name} (${TIER_LABELS[item.tier]})`

/** Rarities the request allows: the requested one, or every rarity whose tier holds the requested budget */
const rarityCandidates = (model: CharacterModel, { rarity, budget }: GenerateCharacterRequestType) => RARITIES
  .filter((item) => {
    const { min, max } = budgetRangeOf(model, item)

    return (rarity === undefined || item === rarity) && (budget === undefined || (budget >= min && budget <= max))
  })

/**
 * Skills that must be talents for the class to be open at `level`: every `all` requirement a normal skill
 * does not reach yet, and one `any` option when no normal skill meets one. `pick` chooses among the `any` options.
 */
const neededTalents = (item: CharacterClass, level: number, pick: (options: Skill[]) => Skill) => {
  const reached = (skill: Skill, rank: Rank) => rankIndex(rankAtLevel("normal", level)) >= rankIndex(rank)
  const all = (Object.entries(item.all) as [Skill, Rank][])
    .filter(([skill, rank]) => !reached(skill, rank))
    .map(([skill]) => skill)
  const any = Object.entries(item.any) as [Skill, Rank][]

  if (any.length === 0 || any.some(([skill, rank]) => reached(skill, rank))) {
    return all
  }

  const fromAll = any.find(([skill]) => all.includes(skill))

  return fromAll ? all : [...all, pick(any.map(([skill]) => skill))]
}

/** Conflicts of the request with itself and the model */
export const validateCharacterRequest = (model: CharacterModel, request: GenerateCharacterRequestType) => {
  const violations: string[] = []

  if (request.budget !== undefined && rarityCandidates(model, request).length === 0) {
    const tiers = (request.rarity ? [request.rarity] : RARITIES)
      .map(rarity => `${stars(rarity)} ${budgetRangeOf(model, rarity).min}-${budgetRangeOf(model, rarity).max}`)

    violations.push(`budget ${request.budget} is outside the tier: ${tiers.join(", ")}`)
  }

  const item = request.class === undefined ? undefined : classById(request.class)

  if (!item) {
    return violations
  }

  if (request.level !== undefined && request.level < TIER_LEVELS[item.tier]) {
    violations.push(`${classLabel(item)} opens at level ${TIER_LEVELS[item.tier]}, the request asks for level ${request.level}`)
  }
  else if (request.talents) {
    const aptitudes = aptitudesOf(request.talents)
    const level = request.level ?? earliestLevelOf(item, aptitudes)

    if (level === undefined || !canTakeClass(item, ranksAtLevel(aptitudes, level), level)) {
      violations.push(`talents ${request.talents.join(", ")} do not open ${classLabel(item)}`
        + `${request.level === undefined ? "" : ` at level ${request.level}`}`)
    }
  }
  else if (neededTalents(item, request.level ?? TIER_LEVELS[item.tier], options => options[0]).length > MAX_TALENTS) {
    violations.push(`${classLabel(item)} needs more than ${MAX_TALENTS} talents`)
  }

  return violations
}

const pickRarity = (model: CharacterModel, rng: Rng, request: GenerateCharacterRequestType) => {
  const candidates = rarityCandidates(model, request)

  return rng.pick(candidates, candidates.map(rarity => model.rarities[rarity].weight))
}

/** Skills weighted by how well their profile shift fits the sampled profile (or misfits it, for weaknesses) */
const skillWeights = (skills: Skill[], residual: number[], sign: 1 | -1) => skills
  .map(skill => Math.exp(sign * SKILL_ALIGNMENT * cosine(residual, STATS.map(stat => meanSkillShift([skill])[stat]))))

const pickSkills = (rng: Rng, from: Skill[], count: number, residual: number[], sign: 1 | -1) => {
  const chosen: Skill[] = []

  for (let i = 0; i < count && chosen.length < from.length; i++) {
    const available = from.filter(skill => !chosen.includes(skill))

    chosen.push(rng.pick(available, skillWeights(available, residual, sign)))
  }

  return chosen
}

const pickClass = (rng: Rng, classes: CharacterClass[]) => rng.pick(
  classes,
  classes.map(item => (CLASS_TIERS.indexOf(item.tier) + 1) ** CLASS_TIER_POWER)
)

/** Height, weight and experience; size follows the 5★ BST, so a rarity does not change it */
const finish = (model: CharacterModel, rng: Rng, rarity: Rarity, maxStats: GeneratedCharacter["maxStats"]) => {
  const total = totalOfStats(maxStats)
  const size = sampleSize(model.pokemon, rng, referenceBstOf(model, rarity, total), [])
  const { k, baseExperience } = pickExperience(model.pokemon, rng, model.referenceClass, total)

  return {
    heightDm: size.heightDm,
    weightHg: size.weightHg,
    baseExperience,
    explain: [`height ${size.heightDm} dm, weight ${size.weightHg} hg`, `base experience ${baseExperience}: BST ${total} × ${k}`]
  }
}

/** Fields derived from the stored ones: stats at the level in the class and the ranks at the level */
export const derivedOf = (character: Pick<GeneratedCharacter, "baseStats" | "maxStats" | "level" | "class" | "aptitudes">) => {
  const item = classById(character.class)

  if (!item) {
    throw new Error(`Unknown class "${character.class}"`)
  }

  return {
    stats: statsInClass(character.baseStats, character.maxStats, character.level, item),
    ranks: ranksAtLevel(character.aptitudes, character.level)
  }
}

const aptitudeLine = (aptitudes: Aptitudes) => {
  const talents = skillsWith(aptitudes, "talent").map(skill => SKILL_LABELS[skill]).join(", ")
  const weak = skillsWith(aptitudes, "weak").map(skill => SKILL_LABELS[skill]).join(", ")

  return `talents ${talents}${weak ? `; weak in ${weak}` : ""}`
}

const levelLine = (model: CharacterModel, character: Pick<GeneratedCharacter, "baseStats" | "maxStats">) => `own BST level 1 → ${
  model.maxLevel}: ${totalOfStats(character.baseStats)} → ${totalOfStats(character.maxStats)}`

/** One character; throws GenerateRequestError on a contradictory request */
export const generateCharacter = (
  model: CharacterModel,
  request: GenerateCharacterRequestType,
  seed: number
): GeneratedCharacter => {
  const violations = validateCharacterRequest(model, request)

  if (violations.length > 0) {
    throw new GenerateRequestError(violations)
  }

  const { pokemon } = model
  const rng = createRng(seed)
  const explain: string[] = []

  const rarity = pickRarity(model, rng, request)
  const info = model.rarities[rarity]
  explain.push(`rarity ${stars(rarity)}${request.rarity ? " (requested)" : ""}`)

  const archetype = request.archetype ?? pickArchetype(pokemon, rng)
  explain.push(`archetype ${archetype}${request.archetype ? " (requested)" : ""}`)

  let budget: number

  if (request.budget !== undefined) {
    budget = request.budget
    explain.push(`budget ${budget} (requested)`)
  }
  else {
    // The 5★ budget is a final-stage BST, the rarity scales it
    const picked = pickBst(pokemon, rng, model.referenceClass, [])

    budget = fitBst(pokemon, picked.bst * info.budgetFactor, budgetRangeOf(model, rarity))
    explain.push(`budget ${budget}: 5★ BST ${picked.bst} × ${info.budgetFactor} for ${stars(rarity)}`)
  }

  const profile = sampleProfile(pokemon, rng, [], archetype)
  const requestedClass = request.class === undefined ? undefined : classById(request.class)

  // Talents: requested, or what the requested class needs topped up at random, picked to fit the profile
  let talents = request.talents ?? []

  if (!request.talents) {
    const needed = requestedClass
      ? neededTalents(requestedClass, request.level ?? TIER_LEVELS[requestedClass.tier], options => pickSkills(
          rng,
          options,
          1,
          profile.residual,
          1
        )[0])
      : []
    const count = Math.max(needed.length, 1 + rng.pickIndex(TALENT_COUNT_WEIGHTS))

    const rest = SKILLS.filter(skill => !needed.includes(skill))

    talents = [...needed, ...pickSkills(rng, rest, count - needed.length, profile.residual, 1)]
  }

  const required = requestedClass ? [...Object.keys(requestedClass.all), ...Object.keys(requestedClass.any)] : []
  const weaknesses = pickSkills(
    rng,
    SKILLS.filter(skill => !talents.includes(skill) && !required.includes(skill)),
    rng.int(MIN_WEAKNESSES, MAX_RANDOM_WEAKNESSES),
    profile.residual,
    -1
  )
  const aptitudes = aptitudesOf(talents, weaknesses)

  explain.push(`${aptitudeLine(aptitudes)}${request.talents ? " (talents requested)" : ""}`)

  const level = request.level
    ?? (requestedClass ? earliestLevelOf(requestedClass, aptitudes)! : rng.int(MIN_LEVEL, MAX_LEVEL))
  const item = requestedClass ?? pickClass(rng, availableClasses(aptitudes, level))

  explain.push(`level ${level}${request.level ? " (requested)" : requestedClass ? " (first level the class opens at)" : ""}`)
  explain.push(`class ${classLabel(item)}${requestedClass ? " (requested)" : ""}`)

  const talentShift = meanSkillShift(talents)
  const weight = request.talents ? 1 : RANDOM_TALENT_SHIFT
  const shares = normalizeShares(profile.shares.map((share, j) => share + weight * talentShift[STATS[j]]), [])
  const maxStats = distributeStats(budget, shares, info.stat, budgetRangeOf(model, rarity), [])
  const baseStats = levelOneStats(maxStats, model.growth, info)
  const rest = finish(model, rng, rarity, maxStats)

  explain.push(levelLine(model, { baseStats, maxStats }), ...rest.explain)

  const stored = {
    name: request.name ?? generateName(rng),
    rarity,
    aptitudes,
    heightDm: rest.heightDm,
    weightHg: rest.weightHg,
    baseExperience: rest.baseExperience,
    baseStats,
    maxStats,
    level,
    class: item.id,
    archetype,
    seed,
    modelVersion: model.version,
    input: { mode: "single" as const, request },
    explain
  }
  const character: GeneratedCharacter = { ...stored, ...derivedOf(stored) }

  const check = validateCharacter(model, character)

  if (!check.ok) {
    throw new GenerationError(check.violations)
  }

  return character
}

/**
 * A character whose rarity, talents, weaknesses, stats at MAX_LEVEL, level and class were chosen by hand
 * (the /characters page). The model adds level 1, size, experience, archetype and a name; an implausible
 * character is a request error.
 */
export const buildCustomCharacter = (model: CharacterModel, custom: CustomCharacterType, seed: number): GeneratedCharacter => {
  const rng = createRng(seed)
  const { rarity, maxStats, level } = custom
  const aptitudes = aptitudesOf(custom.talents, custom.weaknesses)
  const archetype = custom.archetype ?? nearestArchetype(model.pokemon, toShares(toVector(maxStats)), [])
  const baseStats = levelOneStats(maxStats, model.growth, model.rarities[rarity])
  const rest = finish(model, rng, rarity, maxStats)
  const item = classById(custom.class)!

  const stored = {
    name: custom.name ?? generateName(rng),
    rarity,
    aptitudes,
    heightDm: rest.heightDm,
    weightHg: rest.weightHg,
    baseExperience: rest.baseExperience,
    baseStats,
    maxStats,
    level,
    class: custom.class,
    archetype,
    seed,
    modelVersion: model.version,
    input: { mode: "custom" as const, character: custom }
  }
  const character: GeneratedCharacter = {
    ...stored,
    ...derivedOf(stored),
    explain: [
      `rarity ${stars(rarity)}, stats by hand: BST ${totalOfStats(maxStats)} at level ${model.maxLevel}`,
      aptitudeLine(aptitudes),
      `level ${level}, class ${classLabel(item)}`,
      `archetype ${archetype}${custom.archetype ? " (requested)" : " (closest to the stats)"}`,
      levelLine(model, { baseStats, maxStats }),
      ...rest.explain
    ]
  }

  // The choices are the user's: an implausible result is their error, not the generator's
  const check = validateCharacter(model, character)

  if (!check.ok) {
    throw new GenerateRequestError(check.violations)
  }

  return character
}

/**
 * Levels up and / or changes the class of a saved character. Levels only go up; the class must be open
 * at the new level. Ranks never drop with the level, so the current class stays open when only the level changes.
 */
export const updateCharacter = <T extends GeneratedCharacter>(character: T, update: UpdateCharacterBodyType): T => {
  const level = update.level ?? character.level
  const item = classById(update.class ?? character.class)!
  const violations: string[] = []

  if (level < character.level) {
    violations.push(`level ${level} is below the current level ${character.level}: levels only go up`)
  }
  else if (!canTakeClass(item, ranksAtLevel(character.aptitudes, level), level)) {
    violations.push(`${classLabel(item)} is not open at level ${level}`)
  }

  if (violations.length > 0) {
    throw new GenerateRequestError(violations)
  }

  const updated = { ...character, level, class: item.id }

  return { ...updated, ...derivedOf(updated) }
}
