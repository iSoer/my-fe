import { z } from "zod"
import type { SaveGame } from "../types"
import { DEFAULT_SETTINGS, MAX_LEVEL } from "../types"
import { ARCHETYPES, statsSchema as modelStatsSchema } from "@shared/api/schema/pokemon/generated"
import { aptitudesSchema, classIdSchema } from "@shared/api/schema/character/generated"
import { WEAPON_SKILLS } from "@shared/character/skills"
import { isWeaponId } from "@game/content/weapons"
import { EMPTY_STORE } from "../items"
import { defaultVillage } from "../village"

/**
 * v6: деревня-хаб (позиция героя), признак начатой игры, инвентарь армии, Лавка, талисман бойца, рюкзак вылазки;
 * оружие — предмет, а не навык за SP (v5 и v4 мигрируют).
 */
export const SAVE_VERSION = 6

const stat = z.number()
const partialStats = z.object({
  hp: stat.optional(),
  atk: stat.optional(),
  spd: stat.optional(),
  def: stat.optional(),
  res: stat.optional()
})
const pos = z.object({ x: z.number().int(), y: z.number().int() })
/** Позиция героя в деревне дробная: движение свободное. */
const freePos = z.object({ x: z.number(), y: z.number() })
const difficulty = z.enum(["easy", "normal", "hard", "nightmare"])

const unitSchema = z.object({
  id: z.string(),
  seed: z.number(),
  name: z.string(),
  epithet: z.string().optional(),
  gender: z.enum(["m", "f"]),
  species: z.enum(["cat", "dog", "mouse"]),
  breedId: z.string(),
  traitId: z.string().optional(),
  personalityId: z.string(),
  classId: classIdSchema,
  weaponSkill: z.enum(WEAPON_SKILLS),
  rarity: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  level: z.number().int().min(1).max(MAX_LEVEL),
  xp: z.number(),
  sp: z.number(),
  aptitudes: aptitudesSchema,
  baseStats: modelStatsSchema,
  maxStats: modelStatsSchema,
  archetype: z.enum(ARCHETYPES),
  weaponTier: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  accessory: z.string().optional(),
  skills: z.object({
    weapon: z.string(),
    assist: z.string().optional(),
    special: z.string().optional(),
    a: z.string().optional(),
    b: z.string().optional(),
    c: z.string().optional()
  }),
  learned: z.array(z.string()),
  learnable: z.array(z.string()),
  appearance: z.object({
    build: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    furPalette: z.number(),
    pattern: z.number(),
    eyes: z.number(),
    eyeColor: z.number(),
    accessory: z.number()
  }),
  history: z.object({
    battles: z.number(),
    kills: z.number(),
    damageDealt: z.number(),
    damageTaken: z.number(),
    closestCall: z.number()
  }),
  createdAt: z.number(),
  isEnemy: z.boolean().optional(),
  isBoss: z.boolean().optional(),
  factionId: z.string().optional()
})

const armySchema = z.object({
  id: z.string(),
  units: z.array(unitSchema),
  squadIds: z.array(z.string()),
  createdAt: z.number(),
  battles: z.number(),
  wins: z.number()
})

const terrain = z.enum(["plain", "forest", "mountain", "water", "wall", "wall_breakable", "cover"])
const stance = z.enum(["hold", "advance", "guard"])

const mapSchema = z.object({
  seed: z.number(),
  biomeId: z.string(),
  factionId: z.string(),
  difficulty,
  objective: z.enum(["rout", "killBoss"]),
  tiles: z.array(z.array(terrain)),
  playerSpawns: z.array(pos),
  enemies: z.array(z.object({ unit: unitSchema, pos, stance })),
  reinforcements: z.array(z.object({ turn: z.number(), units: z.array(z.object({ unit: unitSchema, pos })) })),
  rewards: z.object({ treats: z.number(), glory: z.number() })
})

const battleUnitSchema = z.object({
  unitId: z.string(),
  side: z.enum(["player", "enemy"]),
  pos,
  hp: z.number(),
  maxHp: z.number(),
  specialCd: z.number(),
  acted: z.boolean(),
  alive: z.boolean(),
  bonuses: partialStats,
  penalties: partialStats,
  stance,
  flags: z.record(z.string(), z.number()),
  spawnedTurn: z.number()
})

const battleSchema = z.object({
  id: z.string(),
  seed: z.number(),
  map: mapSchema,
  difficulty,
  turn: z.number(),
  phase: z.enum(["player", "enemy"]),
  units: z.record(z.string(), battleUnitSchema),
  roster: z.record(z.string(), unitSchema),
  walls: z.record(z.string(), z.number()),
  decals: z.array(z.object({ pos, kind: z.enum(["splat", "pool"]) })),
  result: z.enum(["victory", "defeat", "retreat"]).optional(),
  stats: z.object({
    kills: z.number(),
    damage: z.number(),
    turns: z.number(),
    deaths: z.array(z.string()),
    xpGained: z.record(z.string(), z.number()),
    loot: z.number(),
    mvpId: z.string().optional()
  }),
  spawnedWaves: z.array(z.number()),
  enemyQueue: z.array(z.string()).nullable(),
  startedAt: z.number(),
  pack: z.record(z.string(), z.number())
})

const memorialSchema = z.object({
  id: z.string(),
  unit: unitSchema,
  diedAt: z.number(),
  killerName: z.string().optional(),
  battleTurn: z.number().optional(),
  biomeId: z.string().optional(),
  epitaph: z.string(),
  reason: z.enum(["killed", "released"])
})

const settingsSchema = z.object({
  music: z.number(),
  sfx: z.number(),
  haptics: z.boolean(),
  animSpeed: z.union([z.literal(1), z.literal(2)]),
  cinematic: z.enum(["always", "mine", "never"]),
  autoEndTurn: z.boolean(),
  dangerZoneDefault: z.boolean(),
  blood: z.enum(["sea", "pools"]),
  confirmAttack: z.boolean()
})

const levelUpSchema = z.object({ unitId: z.string(), from: z.number(), to: z.number(), gains: partialStats })

const summarySchema = z.object({
  result: z.enum(["victory", "defeat", "retreat"]),
  difficulty,
  biomeId: z.string(),
  turns: z.number(),
  kills: z.number(),
  damage: z.number(),
  fallen: z.array(memorialSchema),
  xp: z.record(z.string(), z.number()),
  levelUps: z.array(levelUpSchema),
  rewards: z.object({ treats: z.number(), loot: z.number(), lost: z.number(), glory: z.number(), flawless: z.boolean() }),
  mvpId: z.string().optional(),
  survivors: z.array(unitSchema),
  armyFell: z.boolean()
})

export const saveSchema = z.object({
  version: z.number().int(),
  updatedAt: z.number(),
  profile: z.object({
    startedAt: z.number().optional(),
    glory: z.number(),
    treats: z.number(),
    wins: z.object({ easy: z.number(), normal: z.number(), hard: z.number(), nightmare: z.number() }),
    armiesCreated: z.number()
  }),
  army: armySchema.optional(),
  battle: battleSchema.optional(),
  shelter: z.object({ candidates: z.array(unitSchema), seed: z.number() }),
  inventory: z.record(z.string(), z.number()),
  store: z.object({
    seed: z.number(),
    weapons: z.array(z.string()),
    consumables: z.array(z.string()),
    talismans: z.array(z.string()),
    fresh: z.boolean()
  }),
  village: z.object({ pos: freePos, facing: z.enum(["down", "up", "left", "right"]) }),
  memorial: z.array(memorialSchema),
  achievements: z.array(z.string()),
  settings: settingsSchema,
  stats: z.object({
    battles: z.number(),
    wins: z.number(),
    kills: z.number(),
    deaths: z.number(),
    armiesLost: z.number()
  }),
  pendingBattle: z
    .object({
      seed: z.number(),
      difficulty,
      biomeId: z.string(),
      map: mapSchema,
      pack: z.record(z.string(), z.number()).optional()
    })
    .optional(),
  rewardChoice: z.array(unitSchema).optional(),
  lastBattle: summarySchema.optional()
})

export function createEmptySave(now: number): SaveGame {
  return {
    version: SAVE_VERSION,
    updatedAt: now,
    profile: {
      glory: 0,
      treats: 0,
      wins: { easy: 0, normal: 0, hard: 0, nightmare: 0 },
      armiesCreated: 0
    },
    shelter: { candidates: [], seed: 0 },
    inventory: {},
    store: { ...EMPTY_STORE },
    village: defaultVillage(),
    memorial: [],
    achievements: [],
    settings: { ...DEFAULT_SETTINGS },
    stats: { battles: 0, wins: 0, kills: 0, deaths: 0, armiesLost: 0 }
  }
}

/**
 * Миграции: ключ — версия, С которой мигрируем. Сейвы v1–v2 (шаблоны статов FEH, до модели персонажа)
 * и v3 («звериное» оружие поверх навыков модели) не переводятся, их отклоняет `parseSave`.
 */
export const MIGRATIONS: Record<number, (old: Record<string, unknown>) => Record<string, unknown>> = {
  // v4 → v5: армия становится ростером (её бойцы сохраняются), Приют — магазином; пленник, наём и создание армии
  // из ростера убраны. Бой в процессе и итоги прошлого боя отбрасываются: у них нет счётчика выбитых Вкусняшек.
  4: (old) => {
    const data = { ...old }
    const profile = { ...(data["profile"] as Record<string, unknown>) }
    delete profile["rosterRerolls"]
    delete profile["freeRerolls"]
    delete profile["hiresSinceBattle"]
    data["profile"] = profile
    data["shelter"] = { candidates: [], seed: 0 }
    delete data["pendingRoster"]
    delete data["battle"]
    delete data["lastBattle"]
    data["version"] = 5
    return data
  },
  // v5 → v6: деревня, инвентарь и Лавка. Разновидности оружия были навыками за SP — изученные, но не взятые в лапы,
  // переходят в инвентарь, экипированные остаются у бойца; id оружия убираются из пулов навыков всех бойцов.
  // Сейв с ростером или боями считается начатой игрой. Незаконченный бой сохраняется (с пустым рюкзаком).
  5: (old) => {
    const data = { ...old }
    type RawUnit = Record<string, unknown> & { learned?: string[], learnable?: string[], skills?: { weapon?: string } }
    const inventory: Record<string, number> = {}
    const strip = (u: RawUnit, keepVariants: boolean): RawUnit => {
      const learned = u.learned ?? []
      if (keepVariants)
        for (const id of learned)
          if (isWeaponId(id) && id !== u.skills?.weapon) inventory[id] = (inventory[id] ?? 0) + 1
      return {
        ...u,
        learned: learned.filter(id => !isWeaponId(id)),
        learnable: (u.learnable ?? []).filter(id => !isWeaponId(id))
      }
    }
    const army = data["army"] as (Record<string, unknown> & { units: RawUnit[] }) | undefined
    if (army) data["army"] = { ...army, units: army.units.map(u => strip(u, true)) }
    const shelter = data["shelter"] as { candidates: RawUnit[], seed: number } | undefined
    if (shelter) data["shelter"] = { ...shelter, candidates: shelter.candidates.map(u => strip(u, false)) }
    if (Array.isArray(data["rewardChoice"])) data["rewardChoice"] = (data["rewardChoice"] as RawUnit[]).map(u => strip(u, false))
    const battle = data["battle"] as (Record<string, unknown> & { roster: Record<string, RawUnit> }) | undefined
    if (battle)
      data["battle"] = {
        ...battle,
        pack: {},
        roster: Object.fromEntries(Object.entries(battle.roster).map(([id, u]) => [id, strip(u, false)]))
      }
    const lastBattle = data["lastBattle"] as (Record<string, unknown> & { rewards: Record<string, unknown> }) | undefined
    if (lastBattle) data["lastBattle"] = { ...lastBattle, rewards: { ...lastBattle.rewards, lost: 0 } }
    const stats = data["stats"] as { battles?: number } | undefined
    const profile = { ...(data["profile"] as Record<string, unknown>) }
    if (army || (stats?.battles ?? 0) > 0) profile["startedAt"] = data["updatedAt"]
    data["profile"] = profile
    data["inventory"] = inventory
    data["store"] = { ...EMPTY_STORE }
    data["village"] = defaultVillage()
    data["version"] = 6
    return data
  }
}

/** Первая версия сейва, которую ещё можно прочитать. */
export const MIN_SAVE_VERSION = 4

export function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  let data = raw
  let v = typeof data["version"] === "number" ? (data["version"] as number) : 0
  while (v < SAVE_VERSION) {
    const m = MIGRATIONS[v]
    if (!m) break
    data = m(data)
    v = typeof data["version"] === "number" ? (data["version"] as number) : v + 1
  }
  return data
}

export type ParseResult = { ok: true, save: SaveGame } | { ok: false, error: string }

export function parseSave(json: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  }
  catch (e) {
    return { ok: false, error: `JSON: ${(e as Error).message}` }
  }
  if (!raw || typeof raw !== "object") return { ok: false, error: "не объект" }
  const version = (raw as Record<string, unknown>)["version"]
  if (typeof version === "number" && version < MIN_SAVE_VERSION)
    return { ok: false, error: `сейв версии ${version} устарел: бойцы и оружие теперь из модели персонажа` }
  const migrated = migrate(raw as Record<string, unknown>)
  const res = saveSchema.safeParse(migrated)
  if (!res.success)
    return {
      ok: false,
      error: res.error.issues
        .map(i => `${i.path.join(".")}: ${i.message}`)
        .slice(0, 5)
        .join("; ")
    }
  return { ok: true, save: res.data as SaveGame }
}

export function serializeSave(save: SaveGame): string {
  return JSON.stringify(save)
}
