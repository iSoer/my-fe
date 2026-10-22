import { STATS } from "@shared/api/schema/pokemon/generated"
import type { GeneratedCharacterType } from "@shared/api/schema/character/generated"
import { MAX_LEVEL, MIN_LEVEL, RARITIES, levelOneStats, totalOfStats } from "@shared/character/leveling"
import { canTakeClass, classById, statsInClass } from "@shared/character/classes"
import { MAX_TALENTS, MAX_WEAKNESSES, SKILLS, ranksAtLevel, skillsWith } from "@shared/character/skills"
import { predictLnHeight, predictLnWeight } from "@/server/pokemon-model/predict"
import { MIN_ROUND_SHARE, SIZE_SIGMAS, withinBand, type ValidationResult } from "@/server/pokemon-model/validate"
import { budgetRangeOf, referenceBstOf, type CharacterModel } from "./model"

const result = (violations: string[]): ValidationResult => ({ ok: violations.length === 0, violations })

/** Plausibility of one character: the pokemon rules for its MAX_LEVEL stats, its rarity tier, skills, level and class */
export const validateCharacter = (model: CharacterModel, character: GeneratedCharacterType): ValidationResult => {
  const violations: string[] = []
  const { rarity, maxStats, baseStats, aptitudes, level } = character

  if (!(RARITIES as readonly number[]).includes(rarity)) {
    return result([`rarity ${rarity} is not one of ${RARITIES.join(", ")}`])
  }

  const info = model.rarities[rarity]
  const reference = model.pokemon.classes[model.referenceClass]
  const total = totalOfStats(maxStats)
  const range = budgetRangeOf(model, rarity)

  if (total < range.min || total > range.max) {
    violations.push(`stats at max level ${total} are outside the ${rarity}★ tier ${range.min}-${range.max}`)
  }

  for (const stat of STATS) {
    if (maxStats[stat] < info.stat.min || maxStats[stat] > info.stat.max) {
      violations.push(`${stat} ${maxStats[stat]} is outside the ${rarity}★ range ${info.stat.min}-${info.stat.max}`)
    }
  }

  const round = STATS.filter(stat => maxStats[stat] % 5 === 0).length

  if (round / STATS.length < MIN_ROUND_SHARE) {
    violations.push(`only ${round} of 6 stats are multiples of 5`)
  }

  const expectedBase = levelOneStats(maxStats, model.growth, info)

  for (const stat of STATS) {
    if (baseStats[stat] !== expectedBase[stat]) {
      violations.push(`${stat} at level 1 is ${baseStats[stat]}, the ${rarity}★ growth gives ${expectedBase[stat]}`)
    }
  }

  const talents = skillsWith(aptitudes, "talent").length
  const weaknesses = skillsWith(aptitudes, "weak").length

  if (SKILLS.some(skill => aptitudes[skill] === undefined)) {
    violations.push("every skill needs an aptitude")
  }

  if (talents < 1 || talents > MAX_TALENTS) {
    violations.push(`${talents} talents, expected 1-${MAX_TALENTS}`)
  }

  if (weaknesses > MAX_WEAKNESSES) {
    violations.push(`${weaknesses} weaknesses, expected at most ${MAX_WEAKNESSES}`)
  }

  const item = classById(character.class)

  if (level < MIN_LEVEL || level > MAX_LEVEL) {
    violations.push(`level ${level} is outside ${MIN_LEVEL}-${MAX_LEVEL}`)
  }
  else if (!item) {
    violations.push(`unknown class "${character.class}"`)
  }
  else {
    const ranks = ranksAtLevel(aptitudes, level)

    if (!canTakeClass(item, ranks, level)) {
      violations.push(`class ${item.name} is not open at level ${level} with these skills`)
    }

    if (JSON.stringify(character.ranks) !== JSON.stringify(ranks)) {
      violations.push("ranks do not match the skills at the level")
    }

    if (JSON.stringify(character.stats) !== JSON.stringify(statsInClass(baseStats, maxStats, level, item))) {
      violations.push("stats do not match the level and the class")
    }
  }

  const ks = reference.experience.filter(({ p }) => p > 0).map(({ value }) => value)

  if (!ks.some(k => Math.round(total * k) === character.baseExperience)) {
    violations.push(`base experience ${character.baseExperience} is not round(BST × k) for k in ${ks.join(", ")}`)
  }

  const { height, weight, heightRange, weightRange } = model.pokemon.size
  const referenceBst = referenceBstOf(model, rarity, total)

  if (!withinBand(character.heightDm, predictLnHeight(model.pokemon, referenceBst), height.sd, SIZE_SIGMAS, heightRange)) {
    violations.push(`height ${character.heightDm} dm is implausible for BST ${total}`)
  }

  const expectedWeight = predictLnWeight(model.pokemon, character.heightDm, [])

  if (!withinBand(character.weightHg, expectedWeight, weight.sd, SIZE_SIGMAS, weightRange)) {
    violations.push(`weight ${character.weightHg} hg is implausible for height ${character.heightDm} dm`)
  }

  return result(violations)
}
