import {
  ARCHETYPES, POKEMON_TYPES, STATS, type Archetype, type GeneratedPokemonType, type GenerateLineRequestType,
  type CustomPokemonType, type GenerateRequestType, type GenerationInputType, type PokemonType, type Stat
} from "@shared/api/schema/pokemon/generated"
import { classKeyOf, classOfKey, combineByTypes, isFinalStage } from "./classes"
import { COMPENSATION, RANDOM_EXCLUDED_ABILITIES, bstFactorOf, compensationOf, fixedStatsOf } from "./compensation"
import { ceil5, cholesky, clamp, cosine, floor5, fromVector, round5, sum, toShares, toVector } from "./math"
import { generateName, suffixedName } from "./names"
import { bstRangeOf, isForbiddenBst, predictLnHeight, predictLnWeight } from "./predict"
import { createRng, type Rng } from "./random"
import { CLASS_KEYS, type ClassKey, type PokemonModel } from "./schema"
import { MIN_PROFILE_CORRELATION, profileCorrelation, validateLine, validateMega, validatePokemon } from "./validate"

/** The request contradicts itself or the model; `violations` lists every conflict */
export class GenerateRequestError extends Error {
  constructor(public violations: string[]) {
    super(`Invalid generation request: ${violations.join("; ")}`)
  }
}

/** The generator produced a pokemon its own validator rejects: a bug, not a user error */
export class GenerationError extends Error {
  constructor(public violations: string[]) {
    super(`Generated pokemon is implausible: ${violations.join("; ")}`)
  }
}

export type GeneratedPokemon = GeneratedPokemonType

// Share of the type's mean BST deviation applied to the class mean (the rest is class composition)
const TYPE_BST_WEIGHT = 0.5
// Weight of a randomly picked ability's profile shift; a requested ability shifts the profile fully
const RANDOM_ABILITY_SHIFT = 0.5
// How strongly the fit between an ability's shift and the profile drives the choice: weight × exp(k × cosine)
const ABILITY_ALIGNMENT = 2
// Universal abilities count as this share of their carriers in every type
const UNIVERSAL_AFFINITY = 0.35
const MIN_SHARE = 0.02
// Noise of shares and sizes is cut at this many sds, so the validator bands (2-3 sd) always hold
const PROFILE_NOISE_SIGMAS = 2.5
const SIZE_NOISE_SIGMAS = 2
// Correlation of the size residuals between evolution stages
const SIZE_PERSISTENCE = 0.7
// Evolution drift of a share is at most this part of the profile's own spread
const DRIFT_SCALE = 0.25
const LINE_RATIO_SIGMAS = 1.5
const MAX_LINE_BST = 600
const MEGA_BST_DELTA = 100
// Mega abilities prefer abilities of strong pokemon: weight × (meanBst / mean)^k
const MEGA_STRENGTH_POWER = 4

const classLabel = (key: ClassKey) => {
  const { class: pokemonClass, stage } = classOfKey(key)

  return stage ? `stage ${stage.index}/${stage.of}` : pokemonClass
}

const signed = (value: number) => (value >= 0 ? `+${Math.round(value)}` : String(Math.round(value)))

const pp = (share: number) => {
  const value = Math.round(share * 1000) / 10

  return value >= 0 ? `+${value}` : String(value)
}

// Classes

type ClassFilter = Pick<GenerateRequestType, "class" | "stage" | "bst" | "abilities">

const classCandidates = (model: PokemonModel, { class: pokemonClass, stage, bst, abilities }: ClassFilter) => CLASS_KEYS
  .filter((key) => {
    const info = classOfKey(key)
    const { min, max } = bstRangeOf(model, key, abilities)

    return model.classes[key].count > 0
      && (pokemonClass === undefined || info.class === pokemonClass)
      && (stage === undefined || (info.stage?.index === stage.index && info.stage?.of === stage.of))
      && (bst === undefined || (bst >= min && bst <= max))
      && (abilities === undefined || model.classes[key].abilityCount[abilities.length - 1] > 0)
  })

/** Conflicts of the request with itself and the model (TZ 5.2) */
export const validateRequest = (model: PokemonModel, request: GenerateRequestType) => {
  const violations: string[] = []

  if (request.stage && request.class && request.class !== "stage") {
    violations.push(`stage is only allowed with class "stage", got class "${request.class}"`)
  }

  for (const ability of request.abilities ?? []) {
    if (!model.abilities[ability]) {
      violations.push(`unknown ability "${ability}"`)
    }
  }

  if (request.bst !== undefined && isForbiddenBst(model, request.bst)) {
    violations.push(`bst ${request.bst} is in a forbidden window (${model.forbiddenBst.map(([a, b]) => `${a}-${b}`).join(", ")})`)
  }

  const byClass = classCandidates(model, { class: request.class, stage: request.stage })

  if (violations.length === 0 && byClass.length === 0) {
    violations.push("no class matches class and stage")
  }
  else if (
    violations.length === 0
    && request.bst !== undefined
    && classCandidates(model, { ...request, abilities: undefined }).length === 0
  ) {
    const tiers = byClass.map(key => `${classLabel(key)} ${bstRangeOf(model, key).min}-${bstRangeOf(model, key).max}`)

    violations.push(`bst ${request.bst} is outside the tier: ${tiers.join(", ")}`)
  }
  else if (violations.length === 0 && request.abilities && classCandidates(model, request).length === 0) {
    violations.push(`${request.abilities.length} abilities are not possible for the requested class`)
  }

  return violations
}

const pickClass = (model: PokemonModel, rng: Rng, request: GenerateRequestType) => {
  const candidates = classCandidates(model, request)

  return rng.pick(candidates, candidates.map(key => model.classes[key].count))
}

// Types

export const pickSecondType = (model: PokemonModel, rng: Rng, primary: PokemonType) => {
  const entries = Object.entries(model.types[primary].secondary) as [PokemonType, number][]

  return entries.length > 0 ? rng.pick(entries.map(([type]) => type), entries.map(([, p]) => p)) : undefined
}

export const pickTypes = (model: PokemonModel, rng: Rng): PokemonType[] => {
  const primary = rng.pick([...POKEMON_TYPES], POKEMON_TYPES.map(type => model.types[type].primary))
  const second = rng.chance(model.types[primary].secondaryP) ? pickSecondType(model, rng, primary) : undefined

  return second ? [primary, second] : [primary]
}

// BST

/** Moves a BST out of forbidden windows and into the range, keeping multiples of 5 */
export const fitBst = (model: PokemonModel, bst: number, range: { min: number, max: number }) => {
  let value = clamp(round5(bst), ceil5(range.min), floor5(range.max))

  for (const [min, max] of model.forbiddenBst) {
    if (value >= min && value <= max) {
      const edges = [floor5(min - 1), ceil5(max + 1)].filter(edge => edge >= range.min && edge <= range.max)

      value = edges.sort((a, b) => Math.abs(a - value) - Math.abs(b - value))[0] ?? value
    }
  }

  return value
}

export const pickBst = (model: PokemonModel, rng: Rng, key: ClassKey, types: PokemonType[]) => {
  const { mean, sd, min, max } = model.classes[key].bst
  const shift = TYPE_BST_WEIGHT * combineByTypes(types, type => model.types[type as PokemonType].bstShift)

  return { bst: fitBst(model, rng.truncatedNormal(mean + shift, sd, min, max), { min, max }), shift }
}

// Profile

export const typeShiftOf = (model: PokemonModel, types: PokemonType[]) => STATS
  .map(stat => combineByTypes(types, type => model.types[type as PokemonType].profileShift[stat]))

/** Stat shares: mean + type shift + archetype center + correlated noise (docs/pokemon-model.md, step 4) */
export const sampleProfile = (model: PokemonModel, rng: Rng, types: PokemonType[], archetype: Archetype) => {
  const { center, cov } = model.profile.archetypes[archetype]
  const lower = cholesky(cov)
  const z = STATS.map(() => rng.truncatedNormal(0, 1, -PROFILE_NOISE_SIGMAS, PROFILE_NOISE_SIGMAS))
  const noise = lower.map(row => sum(row.map((value, j) => value * z[j])))
  // Shares sum to 1, so the noise must sum to 0
  const noiseMean = sum(noise) / noise.length
  const typeShift = typeShiftOf(model, types)
  const residual = STATS.map((stat, j) => center[stat] + noise[j] - noiseMean)

  return {
    shares: STATS.map((stat, j) => model.profile.mean[stat] + typeShift[j] + residual[j]),
    residual
  }
}

/** Clamps shares to MIN_SHARE, applies the max-share rules of the abilities and renormalizes */
export const normalizeShares = (shares: number[], abilities: string[]) => {
  let result = toShares(shares.map(share => Math.max(share, MIN_SHARE)))

  for (const { rule } of compensationOf(abilities)) {
    for (const [stat, max] of Object.entries(rule.maxShare ?? {}) as [Stat, number][]) {
      const j = STATS.indexOf(stat)

      if (result[j] > max) {
        const excess = result[j] - max
        const rest = sum(result) - result[j]

        result = result.map((share, i) => (i === j ? max : share + excess * share / rest))
      }
    }
  }

  return result
}

// Abilities

type SlotKind = "first" | "second" | "hidden" | "secondOrHidden"

const slotKindOf = (slot: number, count: number): SlotKind => {
  if (slot === 0) {
    return "first"
  }

  return count === 3 ? (slot === 1 ? "second" : "hidden") : "secondOrHidden"
}

export const pickAbilities = (
  model: PokemonModel,
  rng: Rng,
  key: ClassKey,
  types: PokemonType[],
  residual: number[],
  requested: string[]
) => {
  const counts = model.classes[key].abilityCount
  const count = Math.max(1 + rng.pickIndex([...counts]), requested.length)
  const chosen = [...requested]
  const candidates = Object.entries(model.abilities).filter(([name]) => !RANDOM_EXCLUDED_ABILITIES.has(name)
    && !COMPENSATION[name]?.restrictedClasses.includes(key))

  for (let slot = chosen.length; slot < count; slot++) {
    const kind = slotKindOf(slot, count)
    const available = candidates.filter(([name]) => !chosen.includes(name))
    const affinityOf = ([, ability]: typeof available[number]) => {
      const primary = ability.types[types[0]] ?? 0

      return slot === 0
        ? primary
        : primary + (types[1] ? ability.types[types[1]] ?? 0 : 0) + (ability.universal ? UNIVERSAL_AFFINITY * ability.count : 0)
    }
    const weights = available.map((entry) => {
      const [, ability] = entry
      const slots = kind === "secondOrHidden" ? ability.slots.second + ability.slots.hidden : ability.slots[kind]
      const alignment = ability.shift ? Math.exp(ABILITY_ALIGNMENT * cosine(residual, toVector(ability.shift))) : 1

      return affinityOf(entry) * (slots + 0.5) / (ability.count + 1) * alignment
    })

    chosen.push(rng.pick(available, weights)[0])
  }

  return chosen
}

export const applyAbilityShifts = (
  model: PokemonModel,
  shares: number[],
  abilities: string[],
  requested: string[],
  explain: string[]
) => {
  let result = [...shares]

  for (const name of abilities) {
    const { shift } = model.abilities[name]
    const rule = COMPENSATION[name]
    const weight = requested.includes(name) ? 1 : RANDOM_ABILITY_SHIFT

    if (shift) {
      const vector = toVector(shift).map(value => value * weight)
      const strongest = vector.reduce((best, value, j) => (Math.abs(value) > Math.abs(vector[best]) ? j : best), 0)

      result = result.map((share, j) => share + vector[j])
      explain.push(`ability ${name}: ${STATS[strongest]} share ${pp(vector[strongest])}pp`)
    }
    else {
      explain.push(`ability ${name}: no profile shift (few carriers)`)
    }

    if (rule) {
      explain.push(`ability ${name}: ${rule.note}`)
    }
  }

  return result
}

// Stats

/**
 * Splits `target` (a multiple of 5) into multiples of 5 proportional to `weights`, within [min_i, max_i].
 * Rounding leftovers go to the values that lost the most to rounding.
 */
export const allocate = (target: number, weights: number[], mins: number[], maxs: number[]) => {
  const total = sum(weights)
  const raw = weights.map(weight => (total === 0 ? target / weights.length : target * weight / total))
  const values = raw.map((value, i) => clamp(round5(value), ceil5(mins[i]), floor5(maxs[i])))
  let diff = target - sum(values)

  for (let guard = 0; diff !== 0 && guard < 1000; guard++) {
    const direction = diff > 0 ? 5 : -5
    const movable = values
      .map((value, i) => ({ i, error: raw[i] - value }))
      .filter(({ i }) => (direction > 0 ? values[i] + 5 <= floor5(maxs[i]) : values[i] - 5 >= ceil5(mins[i])))

    if (movable.length === 0) {
      break
    }

    const better = (item: typeof movable[number], best: typeof movable[number]) => (direction > 0
      ? item.error > best.error
      : item.error < best.error)
    const { i } = movable.reduce((best, item) => (better(item, best) ? item : best))

    values[i] += direction
    diff -= direction
  }

  return values
}

/**
 * Stats summing to `bst` (multiples of 5) within the per-stat `range`, with the abilities' rules applied.
 * `tier` is the allowed BST range: equal stats and fixed stats are rounded to stay inside it.
 */
export const distributeStats = (
  bst: number,
  shares: number[],
  range: { min: number, max: number },
  tier: { min: number, max: number },
  abilities: string[]
) => {
  if (compensationOf(abilities).some(({ rule }) => rule.equalStats)) {
    let value = clamp(round5(bst / 6), ceil5(range.min), floor5(range.max))

    while (value * 6 > tier.max && value - 5 >= range.min) value -= 5
    while (value * 6 < tier.min && value + 5 <= range.max) value += 5

    return fromVector(STATS.map(() => value))
  }

  const fixed = fixedStatsOf(abilities)
  const free = STATS.filter(stat => fixed[stat] === undefined)
  const fixedSum = sum(Object.values(fixed))
  // The free stats stay multiples of 5; round up only when rounding down would leave the tier
  const target = floor5(bst - fixedSum) + (floor5(bst - fixedSum) + fixedSum < tier.min ? 5 : 0)
  const values = allocate(
    target,
    free.map(stat => shares[STATS.indexOf(stat)]),
    free.map(() => range.min),
    free.map(() => range.max)
  )

  return fromVector(STATS.map(stat => fixed[stat] ?? values[free.indexOf(stat)]))
}

const buildStats = (model: PokemonModel, bst: number, shares: number[], key: ClassKey, abilities: string[]) => distributeStats(
  bst,
  shares,
  model.classes[key].stat,
  bstRangeOf(model, key, abilities),
  abilities
)

// Size and experience

export type SizeResiduals = { height: number, weight: number }

export const sampleSize = (model: PokemonModel, rng: Rng, bst: number, types: PokemonType[], previous?: SizeResiduals) => {
  const { height, weight, heightRange, weightRange } = model.size
  const noise = () => rng.truncatedNormal(0, 1, -SIZE_NOISE_SIGMAS, SIZE_NOISE_SIGMAS)
  const persistent = (last: number | undefined) => (last === undefined
    ? noise()
    : clamp(SIZE_PERSISTENCE * last + Math.sqrt(1 - SIZE_PERSISTENCE ** 2) * noise(), -SIZE_NOISE_SIGMAS, SIZE_NOISE_SIGMAS))

  const residuals = { height: persistent(previous?.height), weight: persistent(previous?.weight) }
  const heightDm = clamp(
    Math.round(Math.exp(predictLnHeight(model, bst) + residuals.height * height.sd)),
    heightRange.min,
    heightRange.max
  )
  const weightHg = clamp(
    Math.round(Math.exp(predictLnWeight(model, heightDm, types) + residuals.weight * weight.sd)),
    weightRange.min,
    weightRange.max
  )

  return { heightDm, weightHg, residuals }
}

export const pickExperience = (model: PokemonModel, rng: Rng, key: ClassKey, bst: number) => {
  const { experience } = model.classes[key]
  const k = rng.pick(experience.map(({ value }) => value), experience.map(({ p }) => p))

  return { k, baseExperience: Math.round(bst * k) }
}

export const pickArchetype = (model: PokemonModel, rng: Rng) => rng.pick(
  [...ARCHETYPES],
  ARCHETYPES.map(archetype => model.profile.archetypes[archetype].weight)
)

const assemble = (
  model: PokemonModel,
  fields: Omit<GeneratedPokemon, "class" | "stage" | "modelVersion"> & { key: ClassKey }
): GeneratedPokemon => {
  const { key, ...rest } = fields
  const { class: pokemonClass, stage } = classOfKey(key)

  return { ...rest, class: pokemonClass, stage, modelVersion: model.version }
}

// Public API

/** One pokemon (TZ 5.1-5.3); throws GenerateRequestError on a contradictory request */
export const generatePokemon = (model: PokemonModel, request: GenerateRequestType, seed: number): GeneratedPokemon => {
  const violations = validateRequest(model, request)

  if (violations.length > 0) {
    throw new GenerateRequestError(violations)
  }

  const rng = createRng(seed)
  const explain: string[] = []
  const requested = request.abilities ?? []

  const key = pickClass(model, rng, request)
  explain.push(`class ${classLabel(key)}${request.class ? " (requested)" : ""}`)

  const types = (request.types as PokemonType[] | undefined) ?? pickTypes(model, rng)
  explain.push(`types ${types.join("/")}${request.types ? " (requested)" : ""}`)

  const archetype = request.archetype ?? pickArchetype(model, rng)
  explain.push(`archetype ${archetype}${request.archetype ? " (requested)" : ""}`)

  let bst: number

  if (request.bst !== undefined) {
    bst = request.bst
    explain.push(`bst ${bst} (requested)`)
  }
  else {
    const picked = pickBst(model, rng, key, types)

    bst = picked.bst
    explain.push(`bst ${bst}: class ${classLabel(key)}, type ${types.join("/")} ${signed(picked.shift)}`)
  }

  const profile = sampleProfile(model, rng, types, archetype)
  const abilities = pickAbilities(model, rng, key, types, profile.residual, requested)
  const shares = normalizeShares(applyAbilityShifts(model, profile.shares, abilities, requested, explain), abilities)

  const factor = bstFactorOf(abilities)

  if (factor !== 1 && request.bst === undefined) {
    bst = fitBst(model, bst * factor, bstRangeOf(model, key, abilities))
    explain.push(`bst ${bst}: ×${factor} for the abilities`)
  }

  const stats = buildStats(model, bst, shares, key, abilities)
  const total = sum(toVector(stats))
  const size = sampleSize(model, rng, total, types)
  const { k, baseExperience } = pickExperience(model, rng, key, total)

  explain.push(`height ${size.heightDm} dm, weight ${size.weightHg} hg`)
  explain.push(`base experience ${baseExperience}: BST ${total} × ${k}`)

  const pokemon = assemble(model, {
    key,
    name: request.name ?? generateName(rng),
    types,
    abilities,
    heightDm: size.heightDm,
    weightHg: size.weightHg,
    baseExperience,
    stats,
    archetype,
    form: null,
    seed,
    input: { mode: "single", request },
    explain
  })

  const check = validatePokemon(model, pokemon)

  if (!check.ok) {
    throw new GenerationError(check.violations)
  }

  return pokemon
}

/** Archetype whose center is closest to the shares left after the type shift */
export const nearestArchetype = (model: PokemonModel, shares: number[], types: PokemonType[]): Archetype => {
  const typeShift = typeShiftOf(model, types)
  const residual = STATS.map((stat, j) => shares[j] - model.profile.mean[stat] - typeShift[j])
  const distance = (archetype: Archetype) => sum(STATS
    .map((stat, j) => (residual[j] - model.profile.archetypes[archetype].center[stat]) ** 2))

  return ARCHETYPES.reduce((best, archetype) => (distance(archetype) < distance(best) ? archetype : best))
}

/**
 * A pokemon whose class, types, abilities and stats were chosen by hand (the /generate page).
 * The model adds size, experience, archetype and a name; implausible stats are a request error.
 */
export const buildCustomPokemon = (model: PokemonModel, custom: CustomPokemonType, seed: number): GeneratedPokemon => {
  const violations: string[] = []

  if (custom.class === "stage" && !custom.stage) {
    violations.push("class \"stage\" needs a stage")
  }

  if (custom.class !== "stage" && custom.stage) {
    violations.push(`stage is only allowed with class "stage", got class "${custom.class}"`)
  }

  for (const ability of custom.abilities) {
    if (!model.abilities[ability]) {
      violations.push(`unknown ability "${ability}"`)
    }
  }

  if (violations.length > 0) {
    throw new GenerateRequestError(violations)
  }

  const key = classKeyOf(custom.class, custom.stage)

  if (model.classes[key].count === 0) {
    throw new GenerateRequestError([`class ${classLabel(key)} has no pokemon in the model`])
  }

  const rng = createRng(seed)
  const types = custom.types as PokemonType[]
  const total = sum(toVector(custom.stats))
  const archetype = custom.archetype ?? nearestArchetype(model, toShares(toVector(custom.stats)), types)
  const size = sampleSize(model, rng, total, types)
  const { k, baseExperience } = pickExperience(model, rng, key, total)

  const pokemon = assemble(model, {
    key,
    name: custom.name ?? generateName(rng),
    types,
    abilities: custom.abilities,
    heightDm: size.heightDm,
    weightHg: size.weightHg,
    baseExperience,
    stats: custom.stats,
    archetype,
    form: null,
    seed,
    input: { mode: "custom", pokemon: custom },
    explain: [
      `class ${classLabel(key)}, stats by hand: BST ${total}`,
      `archetype ${archetype}${custom.archetype ? " (requested)" : " (closest to the stats)"}`,
      `height ${size.heightDm} dm, weight ${size.weightHg} hg`,
      `base experience ${baseExperience}: BST ${total} × ${k}`
    ]
  })

  // The stats are the user's: an implausible result is their error, not the generator's
  const check = validatePokemon(model, pokemon)

  if (!check.ok) {
    throw new GenerateRequestError(check.violations)
  }

  return pokemon
}

const LINE_ATTEMPTS = 200

/** BSTs of every stage: stage 1 from its class, then the evolution ratios, all inside their tiers */
const sampleLineBsts = (model: PokemonModel, rng: Rng, keys: ClassKey[], types: PokemonType[]) => {
  for (let attempt = 0; attempt < LINE_ATTEMPTS; attempt++) {
    const bsts = [pickBst(model, rng, keys[0], types).bst]
    let ok = true

    for (let i = 1; i < keys.length && ok; i++) {
      const step = model.evolution.steps[`${i}to${i + 1}of${keys.length}` as keyof PokemonModel["evolution"]["steps"]]
      const { median, sd } = step.bstRatio
      const ratio = rng.truncatedNormal(median, sd, median - LINE_RATIO_SIGMAS * sd, median + LINE_RATIO_SIGMAS * sd)
      const bst = round5(bsts[i - 1] * ratio)
      const { min, max } = model.classes[keys[i]].bst

      ok = bst >= min && bst <= Math.min(max, MAX_LINE_BST) && !isForbiddenBst(model, bst)
      bsts.push(bst)
    }

    if (ok) {
      return bsts
    }
  }

  throw new GenerationError([`no BST chain fits the tiers of ${keys.join(", ")}`])
}

/** Shares of the next stage: the previous ones plus a drift small enough to keep the profile */
const driftShares = (rng: Rng, previous: number[], driftSd: number) => {
  const mean = sum(previous) / previous.length
  const spread = Math.sqrt(sum(previous.map(share => (share - mean) ** 2)) / previous.length)
  const sd = Math.min(driftSd, DRIFT_SCALE * spread)

  return previous.map(share => share + rng.truncatedNormal(0, sd, -2 * sd, 2 * sd))
}

/** Evolution line of 2 or 3 stages (TZ 5.4) */
export const generateEvolutionLine = (
  model: PokemonModel,
  request: GenerateLineRequestType,
  seed: number
): GeneratedPokemon[] => {
  const unknown = (request.abilities ?? []).filter(ability => !model.abilities[ability])

  if (unknown.length > 0) {
    throw new GenerateRequestError(unknown.map(ability => `unknown ability "${ability}"`))
  }

  const rng = createRng(seed)
  const input: GenerationInputType = { mode: "line", request }
  const requested = request.abilities ?? []
  const keys = Array.from({ length: request.length }, (_, i) => classKeyOf("stage", { index: i + 1, of: request.length }))
  const keepAbilities = requested.length > 0 || rng.chance(model.evolution.sameAbilities)
  const archetype = request.archetype ?? pickArchetype(model, rng)
  let types = (request.types as PokemonType[] | undefined) ?? pickTypes(model, rng)
  const bsts = sampleLineBsts(model, rng, keys, types)

  const line: GeneratedPokemon[] = []
  let previousSize: SizeResiduals | undefined
  let residual: number[] = []

  keys.forEach((key, i) => {
    const explain = [`class ${classLabel(key)}`, `archetype ${archetype}${request.archetype ? " (requested)" : ""}`]
    const previous = line[i - 1]
    let abilities: string[]
    let stats: GeneratedPokemon["stats"]

    if (!previous) {
      const profile = sampleProfile(model, rng, types, archetype)

      residual = profile.residual
      abilities = pickAbilities(model, rng, key, types, residual, requested)

      const shares = normalizeShares(applyAbilityShifts(model, profile.shares, abilities, requested, explain), abilities)

      stats = buildStats(model, bsts[i], shares, key, abilities)
      explain.push(`bst ${bsts[i]}: first stage of ${request.length}`)
    }
    else {
      const step = model.evolution.steps[`${i}to${i + 1}of${request.length}` as keyof PokemonModel["evolution"]["steps"]]

      if (!request.types && types.length === 1 && rng.chance(step.addSecondTypeP)) {
        const second = pickSecondType(model, rng, types[0])

        if (second) {
          types = [types[0], second]
          explain.push(`gains type ${second}`)
        }
      }

      const canKeep = model.classes[key].abilityCount[previous.abilities.length - 1] > 0

      abilities = keepAbilities && canKeep ? previous.abilities : pickAbilities(model, rng, key, types, residual, requested)
      explain.push(abilities === previous.abilities ? "abilities kept" : `abilities ${abilities.join(", ")}`)

      const previousValues = toVector(previous.stats)
      const previousShares = toShares(previousValues)
      stats = buildStats(model, bsts[i], normalizeShares(previousShares, abilities), key, abilities)

      // Rounding to 5 may still flatten the shape of a small pokemon; retry the drift, then fall back to none
      for (let attempt = 0; attempt < 20; attempt++) {
        const drifted = normalizeShares(driftShares(rng, previousShares, step.profileDriftSd), abilities)
        const candidate = buildStats(model, bsts[i], drifted, key, abilities)

        if (profileCorrelation(previousValues, toVector(candidate)) >= MIN_PROFILE_CORRELATION) {
          stats = candidate
          break
        }
      }

      explain.push(`bst ${bsts[i]}: ×${(bsts[i] / bsts[i - 1]).toFixed(2)} from stage ${i}`)
    }

    const total = sum(toVector(stats))
    const size = sampleSize(model, rng, total, types, previousSize)
    const { k, baseExperience } = pickExperience(model, rng, key, total)

    previousSize = size.residuals
    explain.push(
      `height ${size.heightDm} dm, weight ${size.weightHg} hg`,
      `base experience ${baseExperience}: BST ${total} × ${k}`
    )

    line.push(assemble(model, {
      key,
      name: generateName(rng),
      types,
      abilities,
      heightDm: size.heightDm,
      weightHg: size.weightHg,
      baseExperience,
      stats,
      archetype,
      form: null,
      seed,
      input,
      explain
    }))
  })

  const check = validateLine(model, line)

  if (!check.ok) {
    throw new GenerationError(check.violations)
  }

  return line
}

export const canHaveMega = (pokemon: GeneratedPokemon) => pokemon.form === null
  && (pokemon.class === "single" || pokemon.class === "semiLegendary" || pokemon.class === "pseudoLegendary"
    || (pokemon.class === "stage" && isFinalStage(pokemon.stage)))

/** Mega form of a final stage, single, semi- or pseudo-legendary (TZ 5.4) */
export const generateMegaForm = (model: PokemonModel, base: GeneratedPokemon, seed: number): GeneratedPokemon => {
  if (!canHaveMega(base)) {
    throw new GenerateRequestError(["a mega form needs a final stage, single, semi- or pseudo-legendary pokemon without a form"])
  }

  const rng = createRng(seed)
  const explain: string[] = []
  const values = toVector(base.stats)
  const shares = toShares(values)
  const { statDelta } = model.mega
  // HP never changes; the other stats grow with their share, biased like real megas
  const weights = STATS.map((stat, j) => (stat === "hp" ? 0 : shares[j] * Math.max(statDelta[stat], 1)))
  const maxDeltas = STATS.map((stat, j) => (stat === "hp" ? 0 : 255 - values[j]))
  const deltas = allocate(MEGA_BST_DELTA, weights, STATS.map(() => 0), maxDeltas)
  const stats = fromVector(values.map((value, j) => value + deltas[j]))

  const types = base.types as PokemonType[]
  const meanBst = sum(Object.values(model.abilities).map(ability => ability.meanBst)) / Object.keys(model.abilities).length
  const candidates = Object.entries(model.abilities)
    .filter(([name]) => !RANDOM_EXCLUDED_ABILITIES.has(name) && !COMPENSATION[name])
  const ability = rng.pick(
    candidates.map(([name]) => name),
    candidates.map(([, item]) => (item.types[types[0]] ?? 0) * (item.meanBst / meanBst) ** MEGA_STRENGTH_POWER)
  )
  const { experienceDelta: deltaOptions } = model.mega
  const experienceDelta = rng.pick(deltaOptions.map(({ value }) => value), deltaOptions.map(({ p }) => p))

  const grown = STATS.flatMap((stat, j) => (deltas[j] > 0 ? [`${stat} +${deltas[j]}`] : [])).join(", ")

  explain.push(
    `mega of ${base.name}: BST +${MEGA_BST_DELTA}, ${grown}`,
    `ability ${ability}`,
    `base experience +${experienceDelta}`
  )

  // Field by field: a base read from the database also carries id and parentId
  const mega: GeneratedPokemon = {
    name: suffixedName(base.name, "mega"),
    types: base.types,
    abilities: [ability],
    heightDm: base.heightDm,
    weightHg: base.weightHg,
    baseExperience: base.baseExperience + experienceDelta,
    stats,
    class: base.class,
    stage: base.stage,
    archetype: base.archetype,
    form: "mega",
    seed,
    modelVersion: model.version,
    input: { mode: "mega" },
    explain
  }

  const check = validateMega(model, base, mega)

  if (!check.ok) {
    throw new GenerationError(check.violations)
  }

  return mega
}
