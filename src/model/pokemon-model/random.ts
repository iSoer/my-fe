import { MAX_SEED } from "@shared/api/schema/pokemon/generated"

export type Rng = ReturnType<typeof createRng>

/**
 * Seeded PRNG (mulberry32). Every random decision of the generator goes through it,
 * so the same seed always gives the same pokemon.
 */
export const createRng = (seed: number) => {
  let state = seed >>> 0

  const next = () => {
    state = (state + 0x6D2B79F5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const normal = () => {
    // Box-Muller; 1 - next() is in (0, 1], so the log is finite
    const u = 1 - next()
    const v = next()

    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }

  /** Normal(mean, sd) restricted to [min, max] by rejection; falls back to clamping */
  const truncatedNormal = (mean: number, sd: number, min: number, max: number) => {
    if (sd === 0 || min >= max) {
      return Math.min(max, Math.max(min, mean))
    }

    for (let attempt = 0; attempt < 100; attempt++) {
      const value = mean + sd * normal()

      if (value >= min && value <= max) {
        return value
      }
    }

    return Math.min(max, Math.max(min, mean))
  }

  /** Index chosen with probability proportional to its weight; non-positive weights are never chosen */
  const pickIndex = (weights: number[]) => {
    const total = weights.reduce((sum, weight) => sum + Math.max(weight, 0), 0)

    if (total <= 0) {
      throw new Error("Nothing to pick from")
    }

    let target = next() * total

    for (let i = 0; i < weights.length; i++) {
      target -= Math.max(weights[i], 0)

      if (target < 0 && weights[i] > 0) {
        return i
      }
    }

    return weights.findLastIndex(weight => weight > 0)
  }

  const pick = <T>(items: T[], weights: number[]) => items[pickIndex(weights)]

  const chance = (p: number) => next() < p

  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1))

  return { next, normal, truncatedNormal, pickIndex, pick, chance, int }
}

/** A fresh seed for requests that did not give one; never used inside the generator itself */
export const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0] % (MAX_SEED + 1)
