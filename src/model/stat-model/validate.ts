export type ValidationResult = { ok: boolean, violations: string[] }

// Height and weight must be within this many residual sds of the model regressions
export const SIZE_SIGMAS = 3
// At least this share of the six stats must be multiples of 5
export const MIN_ROUND_SHARE = 0.7

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
