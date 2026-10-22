import { STATS, type Stat } from "@shared/api/schema/pokemon/generated"
import type { StatVector } from "./schema"

export const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

export const mean = (values: number[]) => (values.length > 0 ? sum(values) / values.length : 0)

export const sd = (values: number[]) => {
  if (values.length < 2) {
    return 0
  }

  const m = mean(values)

  return Math.sqrt(sum(values.map(value => (value - m) ** 2)) / (values.length - 1))
}

/** Linear interpolation between closest ranks, q in [0, 1] */
export const quantile = (values: number[], q: number) => {
  if (values.length === 0) {
    return 0
  }

  const sorted = [...values].sort((a, b) => a - b)
  const position = (sorted.length - 1) * q
  const lower = Math.floor(position)
  const upper = Math.ceil(position)

  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

export const median = (values: number[]) => quantile(values, 0.5)

/** Pearson correlation; 0 when either side is constant */
export const correlation = (a: number[], b: number[]) => {
  const ma = mean(a)
  const mb = mean(b)
  let covariance = 0
  let va = 0
  let vb = 0

  for (let i = 0; i < a.length; i++) {
    covariance += (a[i] - ma) * (b[i] - mb)
    va += (a[i] - ma) ** 2
    vb += (b[i] - mb) ** 2
  }

  return va === 0 || vb === 0 ? 0 : covariance / Math.sqrt(va * vb)
}

/** Least squares y = intercept + slope × x and the residual sd */
export const linearFit = (x: number[], y: number[]) => {
  const mx = mean(x)
  const my = mean(y)
  let sxy = 0
  let sxx = 0

  for (let i = 0; i < x.length; i++) {
    sxy += (x[i] - mx) * (y[i] - my)
    sxx += (x[i] - mx) ** 2
  }

  const slope = sxx === 0 ? 0 : sxy / sxx
  const intercept = my - slope * mx

  return { intercept, slope, sd: sd(x.map((value, i) => y[i] - intercept - slope * value)) }
}

/** Sample covariance matrix of row vectors */
export const covariance = (rows: number[][]) => {
  const size = rows[0]?.length ?? 0
  const means = Array.from({ length: size }, (_, j) => mean(rows.map(row => row[j])))

  return Array.from({ length: size }, (_, i) => Array.from({ length: size }, (_, j) => (rows.length < 2
    ? 0
    : sum(rows.map(row => (row[i] - means[i]) * (row[j] - means[j]))) / (rows.length - 1))))
}

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

export const mapStats = (stats: StatVector, fn: (value: number, stat: Stat) => number): StatVector => fromVector(
  STATS.map(stat => fn(stats[stat], stat))
)

export const zeroStats = (): StatVector => fromVector(STATS.map(() => 0))

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
