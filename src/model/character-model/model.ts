import { STATS } from "@shared/api/schema/pokemon/generated"
import { MAX_LEVEL, MIN_LEVEL, RARITIES, type Rarity, type RarityScale, type StatValues } from "@shared/character/leveling"
import { loadModel } from "@/server/pokemon-model/loadModel"
import { ceil5, floor5, fromVector, roundTo } from "@/server/pokemon-model/math"
import type { ClassKey, PokemonModel } from "@/server/pokemon-model/schema"

/** Bump when the derivation or the meaning of a field changes */
export const CHARACTER_MODEL_VERSION = 2

/**
 * Pokemon class a 5★ character at MAX_LEVEL corresponds to: its BST tier, stat range and experience.
 * Level 1 is the first stage of the same line, so the whole growth is the stage 1 → 3 growth of a line of three.
 */
export const REFERENCE_CLASS: ClassKey = "stage3of3"

const GROWTH_STEPS = ["1to2of3", "2to3of3"] as const

// Fire Emblem Heroes: growth is multiplied by 0.79 + 0.07 × rarity, here relative to 5★
const FEH_GROWTH_BASE = 0.79
const FEH_GROWTH_PER_STAR = 0.07
// Level-1 stats lose this share per star below 5★ (FEH takes about one point off two stats per star)
const BASE_LOSS_PER_STAR = 0.015
// How often random generation picks each rarity
const RARITY_WEIGHTS: Record<Rarity, number> = { 1: 0.1, 2: 0.15, 3: 0.35, 4: 0.3, 5: 0.1 }

export type CharacterRarity = RarityScale & {
  rarity: Rarity
  weight: number
  // Sum of the stats at MAX_LEVEL relative to 5★
  budgetFactor: number
  // Sum of the stats at MAX_LEVEL: the 5★ tier scaled by budgetFactor
  budget: { min: number, max: number, mean: number, sd: number }
  // Any single stat at MAX_LEVEL
  stat: { min: number, max: number }
}

export type CharacterModel = {
  version: number
  minLevel: number
  maxLevel: number
  referenceClass: ClassKey
  // 5★ ratio of each stat at MAX_LEVEL to the stat at level 1
  growth: StatValues
  // The same for the BST
  bstGrowth: number
  rarities: Record<Rarity, CharacterRarity>
  // Profile, archetypes and size come from the pokemon model; pokemon types and abilities are not used
  pokemon: PokemonModel
}

const growthMultiplierOf = (rarity: Rarity) => (FEH_GROWTH_BASE + FEH_GROWTH_PER_STAR * rarity)
  / (FEH_GROWTH_BASE + FEH_GROWTH_PER_STAR * 5)

/** Pure derivation from the pokemon model; nothing is fitted again */
export const buildCharacterModel = (pokemon: PokemonModel): CharacterModel => {
  const steps = GROWTH_STEPS.map(step => pokemon.evolution.steps[step])
  const growth = fromVector(STATS.map(stat => roundTo(steps.reduce((ratio, step) => ratio * step.statRatio[stat], 1))))
  const bstGrowth = roundTo(steps.reduce((ratio, step) => ratio * step.bstRatio.median, 1))
  const reference = pokemon.classes[REFERENCE_CLASS]

  const rarities = Object.fromEntries(RARITIES.map((rarity) => {
    const baseMultiplier = roundTo(1 - BASE_LOSS_PER_STAR * (5 - rarity))
    const growthMultiplier = roundTo(growthMultiplierOf(rarity))
    // Level 1 is 1 / bstGrowth of the 5★ budget, the rest is growth
    const budgetFactor = roundTo((baseMultiplier + (bstGrowth - 1) * growthMultiplier) / bstGrowth)
    const info: CharacterRarity = {
      rarity,
      weight: RARITY_WEIGHTS[rarity],
      baseMultiplier,
      growthMultiplier,
      budgetFactor,
      budget: {
        min: ceil5(reference.bst.min * budgetFactor),
        max: floor5(reference.bst.max * budgetFactor),
        mean: roundTo(reference.bst.mean * budgetFactor),
        sd: roundTo(reference.bst.sd * budgetFactor)
      },
      stat: { min: floor5(reference.stat.min * budgetFactor), max: ceil5(reference.stat.max * budgetFactor) }
    }

    return [rarity, info]
  })) as Record<Rarity, CharacterRarity>

  return {
    version: CHARACTER_MODEL_VERSION,
    minLevel: MIN_LEVEL,
    maxLevel: MAX_LEVEL,
    referenceClass: REFERENCE_CLASS,
    growth,
    bstGrowth,
    rarities,
    pokemon
  }
}

let cached: CharacterModel | undefined

export const loadCharacterModel = (): CharacterModel => {
  cached ??= buildCharacterModel(loadModel())

  return cached
}

/** Budget tier of the rarity: the sum of the stats at MAX_LEVEL */
export const budgetRangeOf = (model: CharacterModel, rarity: Rarity) => {
  const { min, max } = model.rarities[rarity].budget

  return { min, max }
}

/** BST of the 5★ version at MAX_LEVEL: what size is predicted from, so rarity does not change height */
export const referenceBstOf = (model: CharacterModel, rarity: Rarity, total: number) => total
  / model.rarities[rarity].budgetFactor
