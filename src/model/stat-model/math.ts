import { STATS, type Stat } from "@shared/character/stats"
import type { StatVector } from "./schema"

export const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

/**
 * Lower triangular L with L × Lᵀ = matrix. Share covariances are singular (shares sum to 1),
 * so a small jitter is added to the diagonal.
 */
export const cholesky = (matrix: number[][], jitter = 1e-8) => {
  const size = matrix.length
  const lower = Array.from({ length: size }, () => new Array<number>(size).fill(0))

  for (let i = 0; i < size; i++) {
    for (let j = 0; j <= i; j++) {
      let value = matrix[i][j] + (i === j ? jitter : 0)

      for (let k = 0; k < j; k++) {
        value -= lower[i][k] * lower[j][k]
      }

      lower[i][j] = i === j ? Math.sqrt(Math.max(value, 0)) : (lower[j][j] === 0 ? 0 : value / lower[j][j])
    }
  }

  return lower
}

export const toVector = (stats: StatVector) => STATS.map(stat => stats[stat])

export const fromVector = (values: number[]): StatVector => Object.fromEntries(
  STATS.map((stat, i) => [stat, values[i]])
) as Record<Stat, number>

/** Stats divided by their sum */
export const toShares = (values: number[]) => {
  const total = sum(values)

  return values.map(value => (total === 0 ? 1 / values.length : value / total))
}

export const cosine = (a: number[], b: number[]) => {
  const dot = sum(a.map((value, i) => value * b[i]))
  const norm = Math.sqrt(sum(a.map(value => value ** 2))) * Math.sqrt(sum(b.map(value => value ** 2)))

  return norm === 0 ? 0 : dot / norm
}

export const roundTo = (value: number, digits = 5) => {
  const factor = 10 ** digits

  return Math.round(value * factor) / factor
}

export const round5 = (value: number) => Math.round(value / 5) * 5

export const floor5 = (value: number) => Math.floor(value / 5) * 5

export const ceil5 = (value: number) => Math.ceil(value / 5) * 5

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
