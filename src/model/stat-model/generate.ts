import { ARCHETYPES, STATS, type Archetype } from "@shared/character/stats"
import { ceil5, cholesky, clamp, floor5, fromVector, round5, sum, toShares } from "./math"
import { predictLnHeight, predictLnWeight } from "./predict"
import type { Rng } from "./random"
import type { ClassKey, StatModel } from "./schema"

/** The request contradicts itself or the model; `violations` lists every conflict */
export class GenerateRequestError extends Error {
  constructor(public violations: string[]) {
    super(`Invalid generation request: ${violations.join("; ")}`)
  }
}

/** The generator produced a result its own validator rejects: a bug, not a user error */
export class GenerationError extends Error {
  constructor(public violations: string[]) {
    super(`Generated result is implausible: ${violations.join("; ")}`)
  }
}

const MIN_SHARE = 0.02
// Noise of shares and sizes is cut at this many sds, so the validator bands (2-3 sd) always hold
const PROFILE_NOISE_SIGMAS = 2.5
const SIZE_NOISE_SIGMAS = 2

// BST

/** Moves a BST out of forbidden windows and into the range, keeping multiples of 5 */
export const fitBst = (model: StatModel, bst: number, range: { min: number, max: number }) => {
  let value = clamp(round5(bst), ceil5(range.min), floor5(range.max))

  for (const [min, max] of model.forbiddenBst) {
    if (value >= min && value <= max) {
      const edges = [floor5(min - 1), ceil5(max + 1)].filter(edge => edge >= range.min && edge <= range.max)

      value = edges.sort((a, b) => Math.abs(a - value) - Math.abs(b - value))[0] ?? value
    }
  }

  return value
}

export const pickBst = (model: StatModel, rng: Rng, key: ClassKey) => {
  const { mean, sd, min, max } = model.classes[key].bst

  return fitBst(model, rng.truncatedNormal(mean, sd, min, max), { min, max })
}

// Profile

/** Stat shares: mean + archetype center + correlated noise */
export const sampleProfile = (model: StatModel, rng: Rng, archetype: Archetype) => {
  const { center, cov } = model.profile.archetypes[archetype]
  const lower = cholesky(cov)
  const z = STATS.map(() => rng.truncatedNormal(0, 1, -PROFILE_NOISE_SIGMAS, PROFILE_NOISE_SIGMAS))
  const noise = lower.map(row => sum(row.map((value, j) => value * z[j])))
  // Shares sum to 1, so the noise must sum to 0
  const noiseMean = sum(noise) / noise.length
  const residual = STATS.map((stat, j) => center[stat] + noise[j] - noiseMean)

  return {
    shares: STATS.map((stat, j) => model.profile.mean[stat] + residual[j]),
    residual
  }
}

/** Clamps shares to MIN_SHARE and renormalizes */
export const normalizeShares = (shares: number[]) => toShares(shares.map(share => Math.max(share, MIN_SHARE)))

// Stats

/**
 * Splits `target` (a multiple of 5) into multiples of 5 proportional to `weights`, within [min_i, max_i].
 * Rounding leftovers go to the values that lost the most to rounding.
 */
const allocate = (target: number, weights: number[], mins: number[], maxs: number[]) => {
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
 * Stats summing to `bst` (multiples of 5) within the per-stat `range`.
 * `tier` is the allowed BST range: the sum is rounded up only when rounding down would leave it.
 */
export const distributeStats = (
  bst: number,
  shares: number[],
  range: { min: number, max: number },
  tier: { min: number, max: number }
) => {
  const target = floor5(bst) + (floor5(bst) < tier.min ? 5 : 0)

  return fromVector(allocate(target, shares, STATS.map(() => range.min), STATS.map(() => range.max)))
}

// Size and experience

export const sampleSize = (model: StatModel, rng: Rng, bst: number) => {
  const { height, weight, heightRange, weightRange } = model.size
  const noise = () => rng.truncatedNormal(0, 1, -SIZE_NOISE_SIGMAS, SIZE_NOISE_SIGMAS)

  const residuals = { height: noise(), weight: noise() }
  const heightDm = clamp(
    Math.round(Math.exp(predictLnHeight(model, bst) + residuals.height * height.sd)),
    heightRange.min,
    heightRange.max
  )
  const weightHg = clamp(
    Math.round(Math.exp(predictLnWeight(model, heightDm) + residuals.weight * weight.sd)),
    weightRange.min,
    weightRange.max
  )

  return { heightDm, weightHg }
}

export const pickExperience = (model: StatModel, rng: Rng, key: ClassKey, bst: number) => {
  const { experience } = model.classes[key]
  const k = rng.pick(experience.map(({ value }) => value), experience.map(({ p }) => p))

  return { k, baseExperience: Math.round(bst * k) }
}

export const pickArchetype = (model: StatModel, rng: Rng) => rng.pick(
  [...ARCHETYPES],
  ARCHETYPES.map(archetype => model.profile.archetypes[archetype].weight)
)
