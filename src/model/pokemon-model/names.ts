import type { Rng } from "./random"

const ONSETS = [
  "b", "br", "ch", "d", "dr", "f", "g", "gr", "k", "kr", "l", "m",
  "n", "p", "r", "s", "sh", "sk", "t", "th", "tr", "v", "z", "zh"
]
const VOWELS = ["a", "e", "i", "o", "u", "y", "ae", "io", "ou"]
const ENDINGS = ["", "", "n", "r", "x", "th", "nt", "ra", "on", "ix", "or", "eon", "ite"]

/** Pseudo-syllable name from the seed (zorvanth, brikae); uniqueness is checked when saving */
export const generateName = (rng: Rng) => {
  const syllables = rng.int(2, 3)
  let name = ""

  for (let i = 0; i < syllables; i++) {
    name += rng.pick(ONSETS, ONSETS.map(() => 1)) + rng.pick(VOWELS, VOWELS.map(() => 1))
  }

  return name + rng.pick(ENDINGS, ENDINGS.map(() => 1))
}

const MAX_NAME_LENGTH = 40

/** `<base>-<suffix>`, with the base cut so the result fits the name length limit */
export const suffixedName = (base: string, suffix: string) => `${base.slice(0, MAX_NAME_LENGTH - suffix.length - 1)}-${suffix}`
