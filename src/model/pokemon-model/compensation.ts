import type { Stat } from "@shared/api/schema/pokemon/generated"
import type { ClassKey } from "./schema"

/**
 * Abilities strong or weak enough that the stat budget is bent around them
 * (docs/pokemon-model.md, "Способности, которые меняют бюджет"). Set by hand, not fitted.
 */
export type CompensationRule = {
  // Classes the ability is never picked for at random; an explicit request still allows it
  restrictedClasses: ClassKey[]
  // Upper bound of a stat share, the excess goes to the other stats
  maxShare?: Partial<Record<Stat, number>>
  // Stats with a fixed value; the rest of the budget is spread over the others
  fixedStats?: Partial<Record<Stat, number>>
  // All six stats equal
  equalStats?: boolean
  // BST multiplier; the class tier is widened by the same factor
  bstFactor?: number
  // In-battle stat multipliers the budget pays for; shown by the /generate page
  statMultiplier?: Partial<Record<Stat, number>>
  note: string
}

const LEGENDARY_CLASSES: ClassKey[] = ["semiLegendary", "pseudoLegendary", "legendary"]

export const COMPENSATION: Record<string, CompensationRule> = {
  "huge-power": {
    restrictedClasses: LEGENDARY_CLASSES,
    maxShare: { attack: 0.12 },
    statMultiplier: { attack: 2 },
    note: "doubles Attack: low attack share"
  },
  "pure-power": {
    restrictedClasses: LEGENDARY_CLASSES,
    maxShare: { attack: 0.12 },
    statMultiplier: { attack: 2 },
    note: "doubles Attack: low attack share"
  },
  "wonder-guard": { restrictedClasses: LEGENDARY_CLASSES, fixedStats: { hp: 1 }, note: "only super effective hits: HP = 1" },
  "imposter": { restrictedClasses: LEGENDARY_CLASSES, equalStats: true, note: "transforms: all stats equal" },
  "truant": { restrictedClasses: LEGENDARY_CLASSES, bstFactor: 1.15, note: "acts every other turn: BST ×1.15" },
  "slow-start": { restrictedClasses: ["semiLegendary", "pseudoLegendary"], bstFactor: 1.15, note: "five weak turns: BST ×1.15" }
}

/**
 * Abilities that only make sense with a form change or a species mechanic; never picked at random.
 * They can still be requested explicitly.
 */
export const RANDOM_EXCLUDED_ABILITIES = new Set([
  "stance-change", "zen-mode", "schooling", "shields-down", "disguise", "power-construct", "battle-bond",
  "multitype", "rks-system", "forecast", "flower-gift", "gulp-missile", "hunger-switch", "ice-face",
  "zero-to-hero", "commander", "tera-shift", "tera-shell", "teraform-zero", "poison-puppeteer",
  "as-one-glastrier", "as-one-spectrier", "embody-aspect-teal", "embody-aspect-hearthflame",
  "embody-aspect-wellspring", "embody-aspect-cornerstone", "mimicry", "illusion", "comatose", "imposter"
])

export const compensationOf = (abilities: readonly string[]) => abilities
  .map(ability => ({ ability, rule: COMPENSATION[ability] }))
  .filter((item): item is { ability: string, rule: CompensationRule } => item.rule !== undefined)

/** Largest BST factor of the abilities, 1 when none bends the budget */
export const bstFactorOf = (abilities: readonly string[]) => Math.max(
  1,
  ...compensationOf(abilities).map(({ rule }) => rule.bstFactor ?? 1)
)

/** Stats fixed by the abilities' rules */
export const fixedStatsOf = (abilities: readonly string[]): Partial<Record<Stat, number>> => Object.assign(
  {},
  ...compensationOf(abilities).map(({ rule }) => rule.fixedStats ?? {})
)
