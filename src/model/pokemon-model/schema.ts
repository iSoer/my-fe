import { z } from "zod"
import { ARCHETYPES, pokemonTypeSchema } from "@shared/api/schema/pokemon/generated"

/** Bump when the shape of model.json or the meaning of a field changes */
export const MODEL_VERSION = 1

/** Fine-grained classes the model is fitted for; GenerateRequest.class + stage map onto them */
export const CLASS_KEYS = [
  "stage1of2", "stage2of2", "stage1of3", "stage2of3", "stage3of3",
  "single", "semiLegendary", "pseudoLegendary", "legendary"
] as const

export const EVOLUTION_STEPS = ["1to2of2", "1to2of3", "2to3of3"] as const

/** base_experience = round(BST × k), k is one of these (docs/pokemon-model.md, "base_experience — функция BST") */
export const EXPERIENCE_KS = [0.2, 0.35, 0.45, 0.5] as const

export type ClassKey = typeof CLASS_KEYS[number]

export type EvolutionStep = typeof EVOLUTION_STEPS[number]

const classKeySchema = z.enum(CLASS_KEYS)

export const statVectorSchema = z.object({
  hp: z.number(),
  attack: z.number(),
  defense: z.number(),
  specialAttack: z.number(),
  specialDefense: z.number(),
  speed: z.number()
})

const probability = z.number().min(0).max(1)

const weighted = <T extends z.ZodType>(value: T) => z.array(z.object({ value, p: probability })).min(1)

const range = z.object({ min: z.number(), max: z.number() })

const regression = z.object({ intercept: z.number(), slope: z.number(), sd: z.number().min(0) })

const classSchema = z.object({
  count: z.number().int().min(0),
  bst: range.extend({ mean: z.number(), sd: z.number().min(0) }),
  // Any single stat of the class; compensation rules (e.g. wonder-guard HP = 1) may go below
  stat: range,
  experience: weighted(z.number()),
  // P(1 ability), P(2), P(3)
  abilityCount: z.tuple([probability, probability, probability])
})

const evolutionStepSchema = z.object({
  count: z.number().int().min(0),
  bstRatio: z.object({ median: z.number(), sd: z.number().min(0) }),
  statRatio: statVectorSchema,
  heightRatio: z.number(),
  weightRatio: z.number(),
  // Sd of the change of each stat share between the stages
  profileDriftSd: z.number().min(0),
  // P(the next stage gains a second type | the previous one has a single type)
  addSecondTypeP: probability
})

const typeSchema = z.object({
  // P(primary type = this type)
  primary: probability,
  // P(a second type | this primary type) and which one
  secondaryP: probability,
  secondary: z.partialRecord(pokemonTypeSchema, probability),
  // Mean BST of carriers minus the global mean
  bstShift: z.number(),
  // Mean stat shares of carriers minus the global mean
  profileShift: statVectorSchema,
  // Mean residual of ln(weight) ~ ln(height) of carriers
  weightShift: z.number()
})

const archetypeSchema = z.object({
  weight: probability,
  // Offset of the stat shares from mean + type shift
  center: statVectorSchema,
  // Covariance of the shares around the center, rows and columns in STATS order
  cov: z.array(z.array(z.number()).length(6)).length(6)
})

const abilitySchema = z.object({
  count: z.number().int().min(1),
  // Carriers by type (a dual-type carrier counts for both)
  types: z.partialRecord(pokemonTypeSchema, z.number().int().min(1)),
  // first: position 1 of any list; second / hidden: positions 2 / 3 of three-ability lists
  slots: z.object({ first: z.number().int(), second: z.number().int(), hidden: z.number().int() }),
  // Mean share residual of carriers (after the type shift); null with fewer than 8 carriers
  shift: statVectorSchema.nullable(),
  universal: z.boolean(),
  meanBst: z.number()
})

const formSchema = z.object({
  count: z.number().int().min(0),
  bstDelta: z.number(),
  sameTypes: probability,
  sameAbilities: probability
})

export const pokemonModelSchema = z.object({
  version: z.literal(MODEL_VERSION),
  fittedAt: z.string(),
  sourceCounts: z.object({
    pokemon: z.number().int(),
    forms: z.number().int(),
    abilities: z.number().int(),
    lines2: z.number().int(),
    lines3: z.number().int()
  }),
  forbiddenBst: z.array(z.tuple([z.number().int(), z.number().int()])),
  classes: z.record(classKeySchema, classSchema),
  evolution: z.object({
    steps: z.record(z.enum(["1to2of2", "1to2of3", "2to3of3"]), evolutionStepSchema),
    // Share of lines whose stages all have the same ability list
    sameAbilities: probability,
    // Median correlation of stat shares between consecutive stages
    profileCorrelation: z.number()
  }),
  types: z.record(pokemonTypeSchema, typeSchema),
  profile: z.object({
    mean: statVectorSchema,
    archetypes: z.record(z.enum(ARCHETYPES), archetypeSchema)
  }),
  size: z.object({
    // ln(height_dm) = intercept + slope × BST
    height: regression,
    // ln(weight_hg) = intercept + slope × ln(height_dm) + types[t].weightShift
    weight: regression,
    heightRange: range,
    weightRange: range
  }),
  abilities: z.record(z.string(), abilitySchema),
  forms: z.record(z.string(), formSchema),
  mega: z.object({
    statDelta: statVectorSchema,
    experienceDelta: weighted(z.number().int())
  })
})

export type PokemonModel = z.infer<typeof pokemonModelSchema>

export type StatVector = z.infer<typeof statVectorSchema>

export type ModelAbility = z.infer<typeof abilitySchema>
