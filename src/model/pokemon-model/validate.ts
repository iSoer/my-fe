import { POKEMON_TYPES, STATS, type GeneratedPokemonType, type PokemonType } from "@shared/api/schema/pokemon/generated"
import { classKeyOf } from "./classes"
import { fixedStatsOf } from "./compensation"
import { correlation, sum, toVector } from "./math"
import { bstRangeOf, isForbiddenBst, predictLnHeight, predictLnWeight, requestedAbilitiesOf } from "./predict"
import type { PokemonModel } from "./schema"

export type ValidationResult = { ok: boolean, violations: string[] }

// Height and weight must be within this many residual sds of the model regressions
export const SIZE_SIGMAS = 3
// Evolution BST ratios must be within this many sds of the model median
const RATIO_SIGMAS = 2
export const MIN_PROFILE_CORRELATION = 0.85
// At least this share of the six stats must be multiples of 5
export const MIN_ROUND_SHARE = 0.7
// Profiles flatter than this (sd of the stats) have no shape to keep, the correlation check skips them
const FLAT_PROFILE_SD = 5
const MAX_LINE_BST = 600

const result = (violations: string[]): ValidationResult => ({ ok: violations.length === 0, violations })

const bstOf = (pokemon: GeneratedPokemonType) => sum(toVector(pokemon.stats))

/** |ln(value) − expected| within `sigmas` sd, allowing for rounding to an integer and for the range clamp */
export const withinBand = (value: number, expected: number, sd: number, sigmas: number, range: { min: number, max: number }) => {
  if (value === range.min && expected < Math.log(range.min)) {
    return true
  }

  if (value === range.max && expected > Math.log(range.max)) {
    return true
  }

  const roundingTolerance = Math.log((value + 0.5) / value)

  return Math.abs(Math.log(value) - expected) <= sigmas * sd + roundingTolerance
}

const stdOf = (values: number[]) => {
  const m = sum(values) / values.length

  return Math.sqrt(sum(values.map(value => (value - m) ** 2)) / values.length)
}

/** Correlation of two stat vectors; flat vectors have no profile to compare and count as 1 */
export const profileCorrelation = (a: number[], b: number[]) => (stdOf(a) < FLAT_PROFILE_SD || stdOf(b) < FLAT_PROFILE_SD
  ? 1
  : correlation(a, b))

/** Checks shared by every pokemon, forms included */
export const validateBasics = (model: PokemonModel, pokemon: GeneratedPokemonType) => {
  const violations: string[] = []
  const { types, abilities } = pokemon

  if (types.length < 1 || types.length > 2 || new Set(types).size !== types.length) {
    violations.push(`types must be 1-2 different types, got ${types.join(", ")}`)
  }

  for (const type of types) {
    if (!(POKEMON_TYPES as readonly string[]).includes(type)) {
      violations.push(`unknown type "${type}"`)
    }
  }

  if (abilities.length < 1 || abilities.length > 3 || new Set(abilities).size !== abilities.length) {
    violations.push(`abilities must be 1-3 different abilities, got ${abilities.join(", ")}`)
  }

  for (const ability of abilities) {
    if (!model.abilities[ability]) {
      violations.push(`unknown ability "${ability}"`)
    }
  }

  for (const stat of STATS) {
    if (pokemon.stats[stat] < 1 || pokemon.stats[stat] > 255) {
      violations.push(`${stat} ${pokemon.stats[stat]} is outside 1-255`)
    }
  }

  return violations
}

/** Plausibility of one generated pokemon (TZ 9); mega forms are checked by validateMega */
export const validatePokemon = (model: PokemonModel, pokemon: GeneratedPokemonType): ValidationResult => {
  const violations = validateBasics(model, pokemon)

  if (pokemon.form !== null) {
    return result(violations)
  }

  const key = classKeyOf(pokemon.class, pokemon.stage)
  const modelClass = model.classes[key]
  const bst = bstOf(pokemon)
  const range = bstRangeOf(model, key, pokemon.abilities)
  const fixed = fixedStatsOf(pokemon.abilities)

  if (bst < range.min || bst > range.max) {
    violations.push(`BST ${bst} is outside the ${key} tier ${range.min}-${range.max}`)
  }

  if (isForbiddenBst(model, bst)) {
    violations.push(`BST ${bst} is in a forbidden window`)
  }

  for (const stat of STATS) {
    const value = pokemon.stats[stat]

    if (fixed[stat] !== undefined ? value !== fixed[stat] : value < modelClass.stat.min || value > modelClass.stat.max) {
      violations.push(`${stat} ${value} is outside the ${key} range ${modelClass.stat.min}-${modelClass.stat.max}`)
    }
  }

  const round = STATS.filter(stat => pokemon.stats[stat] % 5 === 0).length

  if (round / STATS.length < MIN_ROUND_SHARE) {
    violations.push(`only ${round} of 6 stats are multiples of 5`)
  }

  const abilityCountP = modelClass.abilityCount[pokemon.abilities.length - 1] ?? 0

  if (abilityCountP === 0) {
    violations.push(`${key} never has ${pokemon.abilities.length} abilities`)
  }

  const first = pokemon.abilities[0]
  const requested = requestedAbilitiesOf(pokemon.input)

  if (first && model.abilities[first] && !requested.includes(first) && !model.abilities[first].types[pokemon.types[0]]) {
    violations.push(`slot 1 ability "${first}" has no ${pokemon.types[0]} carriers`)
  }

  const ks = modelClass.experience.filter(({ p }) => p > 0).map(({ value }) => value)

  if (!ks.some(k => Math.round(bst * k) === pokemon.baseExperience)) {
    violations.push(`base experience ${pokemon.baseExperience} is not round(BST × k) for k in ${ks.join(", ")}`)
  }

  const { height, weight, heightRange, weightRange } = model.size

  if (!withinBand(pokemon.heightDm, predictLnHeight(model, bst), height.sd, SIZE_SIGMAS, heightRange)) {
    violations.push(`height ${pokemon.heightDm} dm is implausible for BST ${bst}`)
  }

  const expectedWeight = predictLnWeight(model, pokemon.heightDm, pokemon.types as PokemonType[])

  if (!withinBand(pokemon.weightHg, expectedWeight, weight.sd, SIZE_SIGMAS, weightRange)) {
    violations.push(`weight ${pokemon.weightHg} hg is implausible for height ${pokemon.heightDm} dm`)
  }

  return result(violations)
}

/** Every stage on its own plus the growth between stages */
export const validateLine = (model: PokemonModel, line: GeneratedPokemonType[]): ValidationResult => {
  const violations = line
    .flatMap((pokemon, i) => validatePokemon(model, pokemon).violations.map(text => `stage ${i + 1}: ${text}`))

  line.slice(1).forEach((next, i) => {
    const previous = line[i]
    const step = model.evolution.steps[`${i + 1}to${i + 2}of${line.length}` as keyof PokemonModel["evolution"]["steps"]]

    if (!step) {
      violations.push(`no evolution step ${i + 1} → ${i + 2} of ${line.length}`)

      return
    }

    const ratio = bstOf(next) / bstOf(previous)
    const { median, sd } = step.bstRatio

    if (Math.abs(ratio - median) > RATIO_SIGMAS * sd) {
      violations.push(`stage ${i + 1} → ${i + 2}: BST ratio ${ratio.toFixed(2)} is outside ${median} ± ${RATIO_SIGMAS * sd}`)
    }

    const corr = profileCorrelation(toVector(previous.stats), toVector(next.stats))

    if (corr < MIN_PROFILE_CORRELATION) {
      violations.push(`stage ${i + 1} → ${i + 2}: profile correlation ${corr.toFixed(2)} < ${MIN_PROFILE_CORRELATION}`)
    }
  })

  const final = line.at(-1)

  if (final && bstOf(final) > MAX_LINE_BST) {
    violations.push(`final stage BST ${bstOf(final)} exceeds ${MAX_LINE_BST}`)
  }

  return result(violations)
}

/** Mega form against its base: BST +100, the same HP, one ability */
export const validateMega = (model: PokemonModel, base: GeneratedPokemonType, mega: GeneratedPokemonType): ValidationResult => {
  const violations = validateBasics(model, mega)
  const delta = bstOf(mega) - bstOf(base)

  if (delta !== 100) {
    violations.push(`mega BST delta is ${delta}, expected 100`)
  }

  if (mega.stats.hp !== base.stats.hp) {
    violations.push(`mega HP ${mega.stats.hp} differs from the base ${base.stats.hp}`)
  }

  if (mega.abilities.length !== 1) {
    violations.push(`mega must have one ability, got ${mega.abilities.length}`)
  }

  if (mega.form !== "mega") {
    violations.push("form must be \"mega\"")
  }

  return result(violations)
}
