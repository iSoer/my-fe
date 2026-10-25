import { z } from "zod"
import { ARCHETYPES } from "@shared/character/stats"

/** Bump when the shape of model.json or the meaning of a field changes */
export const MODEL_VERSION = 2

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
  bst: range.extend({ mean: z.number(), sd: z.number().min(0) }),
  // Any single stat of the class
  stat: range,
  experience: weighted(z.number())
})

const evolutionStepSchema = z.object({
  bstRatio: z.object({ median: z.number() }),
  statRatio: statVectorSchema
})

const archetypeSchema = z.object({
  weight: probability,
  // Offset of the stat shares from the mean
  center: statVectorSchema,
  // Covariance of the shares around the center, rows and columns in STATS order
  cov: z.array(z.array(z.number()).length(6)).length(6)
})

export const statModelSchema = z.object({
  version: z.literal(MODEL_VERSION),
  fittedAt: z.string(),
  forbiddenBst: z.array(z.tuple([z.number().int(), z.number().int()])),
  // Final stage of a three-stage line: the class a 5★ character at MAX_LEVEL corresponds to
  classes: z.object({ stage3of3: classSchema }),
  evolution: z.object({
    steps: z.object({ "1to2of3": evolutionStepSchema, "2to3of3": evolutionStepSchema })
  }),
  profile: z.object({
    mean: statVectorSchema,
    archetypes: z.record(z.enum(ARCHETYPES), archetypeSchema)
  }),
  size: z.object({
    // ln(height_dm) = intercept + slope × BST
    height: regression,
    // ln(weight_hg) = intercept + slope × ln(height_dm)
    weight: regression,
    heightRange: range,
    weightRange: range
  })
})

export type StatModel = z.infer<typeof statModelSchema>

export type ClassKey = keyof StatModel["classes"]

export type StatVector = z.infer<typeof statVectorSchema>
