import { z } from "zod"

// Stats, archetypes and names shared by the stat model (src/model/stat-model) and the characters

export const STATS = ["hp", "attack", "defense", "specialAttack", "specialDefense", "speed"] as const

export const ARCHETYPES = ["physical", "special", "tank", "fast", "hpWall", "balanced"] as const

export const MAX_SEED = 2 ** 32 - 1

export type Stat = typeof STATS[number]

export type Archetype = typeof ARCHETYPES[number]

export const nameSchema = z.string().min(1).max(40).regex(/^[a-z0-9-]+$/, { error: "Only a-z, 0-9 and -" })

export const seedSchema = z.number().int().min(0).max(MAX_SEED)

export const statsSchema = z.object({
  hp: z.number().int(),
  attack: z.number().int(),
  defense: z.number().int(),
  specialAttack: z.number().int(),
  specialDefense: z.number().int(),
  speed: z.number().int()
})
