import { z } from "zod"
import type { SaveGame } from "../types"
import { DEFAULT_SETTINGS, MAX_LEVEL } from "../types"
import { ARCHETYPES, statsSchema as modelStatsSchema } from "@shared/character/stats"
import { aptitudesSchema, classIdSchema } from "@shared/api/schema/character/generated"
import { SKILLS, WEAPON_SKILLS, rankAtLevel } from "@shared/character/skills"
import { xpOfRank } from "../units/proficiency"
import { isWeaponId } from "@game/content/weapons"
import { EMPTY_STORE } from "../items"
import { barracksLevelFor, defaultSettlement, emptyStore, storePeriod } from "../settlement"
import { BUILDING_MAX_LEVEL } from "@game/content/settlement"
import { DEFAULT_LANG, tr } from "@game/i18n"

/**
 * v5: армия — ростер, Приют — магазин. v6: деревня-хаб (позиция героя), признак начатой игры, инвентарь армии,
 * Лавка, талисман бойца, рюкзак вылазки; оружие — предмет, а не навык за SP (v5 и v4 мигрируют).
 * v7: без классов Commoner / Noble / Diviner. v8: без предметов лечения и рюкзака вылазки. v9: поселение со
 * зданиями и уровнями вместо деревни с героем, тренировочный полигон, витрина Лавки по периодам, воскрешение на
 * Кладбище; герой ходит по карте поселения. v10: бар (`tavern`), заказанная кружка в поселении и выпитый напиток
 * в бою. v11: сюжетные факты (`story`: счётчики и просмотренные диалоги) для триггеров диалогов.
 * v12: обновление витрины Лавки за Вкусняшки (`store.rerolls` — цена, `store.variant` — номер выкладки).
 */
export const SAVE_VERSION = 15

const stat = z.number()
/** Бонусы и штрафы боя; в старых сейвах — `atk` (Str/Mag разом), он раскладывается на оба стата. */
const partialStats = z.preprocess(
  (v) => {
    if (!v || typeof v !== "object" || !("atk" in v)) return v
    const { atk, ...rest } = v as Record<string, unknown>
    return { str: atk, mag: atk, ...rest }
  },
  z.object({
    hp: stat.optional(),
    str: stat.optional(),
    mag: stat.optional(),
    spd: stat.optional(),
    def: stat.optional(),
    res: stat.optional()
  })
)
const pos = z.object({ x: z.number().int(), y: z.number().int() })
const difficulty = z.enum(["easy", "normal", "hard", "nightmare"])
const rarity = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])

/**
 * Бойцы без опыта навыков (сейвы до владения от использования): опыт = порог ранга, который был у них на их уровне
 * по прежней формуле (склонность × уровень), — ранги и открытые классы не меняются, дальше растут от боёв.
 */
function withSkillXp(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || "skillXp" in raw) return raw
  const u = raw as { aptitudes?: Record<string, "weak" | "normal" | "talent">, level?: number }
  if (!u.aptitudes || typeof u.level !== "number") return raw
  const aptitudes = u.aptitudes
  const level = u.level
  return { ...u, skillXp: Object.fromEntries(SKILLS.map(skill => [skill, xpOfRank(rankAtLevel(aptitudes[skill] ?? "normal", level))])) }
}

const skillXpSchema = z.object(Object.fromEntries(SKILLS.map(skill => [skill, z.number().min(0)])) as Record<(typeof SKILLS)[number], z.ZodNumber>)

const unitSchema = z.preprocess(withSkillXp, z.object({
  id: z.string(),
  seed: z.number(),
  name: z.string(),
  epithet: z.string().optional(),
  gender: z.enum(["m", "f"]),
  species: z.enum(["cat", "dog", "mouse"]),
  breedId: z.string(),
  personalityId: z.string(),
  classId: classIdSchema,
  weaponSkill: z.enum(WEAPON_SKILLS),
  rarity,
  level: z.number().int().min(1).max(MAX_LEVEL),
  xp: z.number(),
  sp: z.number(),
  aptitudes: aptitudesSchema,
  skillXp: skillXpSchema,
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
}))

const armySchema = z.object({
  id: z.string(),
  units: z.array(unitSchema),
  squadIds: z.array(z.string()),
  createdAt: z.number(),
  battles: z.number(),
  wins: z.number()
})

const terrain = z.enum(["plain", "forest", "mountain", "water", "wall", "wall_breakable", "cover"])
const buffKind = z.enum(["fury", "swift", "aegis", "fortune"])
const pickupSchema = z.object({ id: z.string(), pos, kind: z.union([z.literal("heart"), buffKind]) })
const stance = z.enum(["hold", "advance", "guard"])

const mapSchema = z.object({
  seed: z.number(),
  biomeId: z.string(),
  factionId: z.string(),
  difficulty,
  objective: z.enum(["rout", "killBoss", "extract"]),
  mode: z.enum(["skirmish", "expedition"]).optional(),
  // Карты с одним выходом (до трёх выходов) — список из одного
  expedition: z.preprocess(raw => (raw && typeof raw === "object" && "exit" in raw && !("exits" in raw)
    ? { ...(raw as Record<string, unknown>), exits: [(raw as { exit: unknown }).exit] }
    : raw), z.object({
    chests: z.array(z.object({
      id: z.string(),
      pos,
      kind: z.enum(["treats", "weapon", "talisman"]).default("treats"),
      treats: z.number(),
      itemId: z.string().optional(),
      keyHolderId: z.string()
    })),
    exits: z.array(pos),
    pickups: z.array(pickupSchema).default([]),
    elites: z.array(z.object({ unitId: z.string(), buff: buffKind })).default([])
  })).optional(),
  layout: z.enum(["glade", "forestEdge", "riverBridge", "crossroads", "pass", "lake", "fort", "ruins"]).optional(),
  decor: z.record(z.string(), z.enum(["path", "bridge"])).optional(),
  tiles: z.array(z.array(terrain)),
  playerSpawns: z.array(pos),
  enemies: z.array(z.object({ unit: unitSchema, pos, stance, post: pos.optional(), leash: z.number().optional() })),
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
  spawnedTurn: z.number(),
  turnStart: pos.optional(),
  post: pos.optional(),
  leash: z.number().optional()
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
  timeUp: z.boolean().optional(),
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
  expedition: z.object({
    keys: z.record(z.string(), z.object({ unitId: z.string().optional(), pos: pos.optional() })),
    opened: z.array(z.string()),
    pickups: z.array(pickupSchema).default([]),
    buffs: z.object({ team: z.array(buffKind), units: z.record(z.string(), z.array(buffKind)) }).default({ team: [], units: {} }),
    found: z.array(z.string()).default([])
  }).optional(),
  explore: z.boolean().optional(),
  revealed: z.string().optional(),
  drink: z.object({ id: z.string(), pct: partialStats }).optional()
})

const memorialSchema = z.object({
  id: z.string(),
  unit: unitSchema,
  diedAt: z.number(),
  killerName: z.string().optional(),
  battleTurn: z.number().optional(),
  biomeId: z.string().optional(),
  epitaph: z.string(),
  reason: z.enum(["killed", "released"]),
  revivedAt: z.number().optional()
})

const settingsSchema = z.object({
  music: z.number(),
  sfx: z.number(),
  haptics: z.boolean(),
  animSpeed: z.union([z.literal(1), z.literal(2)]),
  cinematic: z.enum(["always", "mine", "never"]),
  autoEndTurn: z.boolean(),
  // Сейвы без этой настройки — двойное нажатие, как в новой игре
  endTurnConfirm: z.enum(["modal", "none", "double"]).default("double"),
  dangerZoneDefault: z.boolean(),
  blood: z.enum(["off", "pools", "sea"]),
  confirmAttack: z.boolean(),
  // Сейвы до диалогов — разговоры включены
  dialogues: z.boolean().default(true),
  // Сейвы до выбора языка — английский по умолчанию
  lang: z.enum(["en", "ru"]).default(DEFAULT_LANG),
  // Сейвы до настройки качества графики — «авто»
  graphics: z.enum(["auto", "crisp", "eco"]).default("auto")
})

const buildingSchema = z.object({ level: z.number().int().min(1).max(BUILDING_MAX_LEVEL), builtAt: z.number() })

const settlementSchema = z.object({
  buildings: z.object({
    barracks: buildingSchema.optional(),
    training: buildingSchema.optional(),
    store: buildingSchema.optional(),
    graveyard: buildingSchema.optional(),
    tavern: buildingSchema.optional()
  }),
  training: z.array(z.object({
    unitId: z.string(),
    since: z.number(),
    lastTick: z.number(),
    carryMs: z.number().min(0),
    xp: z.number()
  })),
  sortiesTrained: z.array(z.string()),
  lastReviveAt: z.number().optional(),
  hero: z.object({ pos: z.object({ x: z.number(), y: z.number() }), facing: z.enum(["down", "up", "left", "right"]) }).optional(),
  drink: z.object({ id: z.string(), level: z.number().int().min(1).max(BUILDING_MAX_LEVEL) }).optional()
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
  armyFell: z.boolean(),
  timeUp: z.boolean().optional(),
  recruits: z.array(unitSchema).optional(),
  found: z.array(z.string()).optional()
})

export const saveSchema = z.object({
  version: z.number().int(),
  updatedAt: z.number(),
  profile: z.object({
    startedAt: z.number().optional(),
    glory: z.number(),
    treats: z.number(),
    wins: z.object({ easy: z.number(), normal: z.number(), hard: z.number(), nightmare: z.number() }),
    armiesCreated: z.number(),
    // Сейвы до перерождений — открыта только ★1
    maxRarity: rarity.default(1)
  }),
  army: armySchema.optional(),
  battle: battleSchema.optional(),
  shelter: z.object({ candidates: z.array(unitSchema), seed: z.number() }),
  inventory: z.record(z.string(), z.number()),
  store: z.object({
    seed: z.number(),
    weapons: z.array(z.string()),
    talismans: z.array(z.string()),
    fresh: z.boolean(),
    period: z.number().int(),
    salt: z.number(),
    rerolls: z.number().int().min(0),
    variant: z.number().int().min(0)
  }),
  settlement: settlementSchema,
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
  story: z.object({ counters: z.record(z.string(), z.number()), seen: z.array(z.string()) }),
  pendingBattle: z
    .object({
      seed: z.number(),
      difficulty,
      biomeId: z.string(),
      // Разведки до выбора команды — самая слабая команда
      team: z.number().int().min(0).default(0),
      map: mapSchema
    })
    .optional(),
  sortieSeed: z.number().optional(),
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
      armiesCreated: 0,
      maxRarity: 1
    },
    shelter: { candidates: [], seed: 0 },
    inventory: {},
    store: emptyStore(now & 0x7fffffff),
    settlement: defaultSettlement(now),
    memorial: [],
    achievements: [],
    settings: { ...DEFAULT_SETTINGS },
    stats: { battles: 0, wins: 0, kills: 0, deaths: 0, armiesLost: 0 },
    story: { counters: {}, seen: [] }
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
    data["village"] = { pos: { x: 5.5, y: 6.5 }, facing: "up" }
    data["version"] = 6
    return data
  },
  // v6 → v7: базовые классы Commoner и Noble и Diviner убраны — бойцы где угодно в сейве (ростер, магазин, награды,
  // бой, Кладбище) переходят в стартовый класс по оружию в лапах: магия — Mage / Healer, лук — Hunter, копьё и
  // топор — Soldier, остальное — Gladiator.
  6: (old) => {
    const removed = new Set(["commoner", "noble", "diviner"])
    const starter: Record<string, string> = {
      whiteMagic: "healer",
      blackMagic: "mage",
      bow: "hunter",
      spear: "soldier",
      axe: "soldier"
    }
    const walk = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.map(walk)
      if (!v || typeof v !== "object") return v
      const out: Record<string, unknown> = {}
      for (const [k, x] of Object.entries(v)) out[k] = walk(x)
      if (typeof out["classId"] === "string" && removed.has(out["classId"]))
        out["classId"] = starter[String(out["weaponSkill"])] ?? "gladiator"
      return out
    }
    return { ...(walk(old) as Record<string, unknown>), version: 7 }
  },
  // v7 → v8: предметы лечения (расходники) убраны из игры — пропадают из инвентаря, из рюкзака разведанного
  // и идущего боя и с витрины Лавки.
  7: (old) => {
    const data = { ...old }
    const inventory = (data["inventory"] ?? {}) as Record<string, number>
    data["inventory"] = Object.fromEntries(Object.entries(inventory).filter(([id]) => !id.startsWith("itm_")))
    for (const key of ["battle", "pendingBattle"]) {
      const v = data[key] as Record<string, unknown> | undefined
      if (v) {
        const next = { ...v }
        delete next["pack"]
        data[key] = next
      }
    }
    const store = data["store"] as Record<string, unknown> | undefined
    if (store) {
      const next = { ...store }
      delete next["consumables"]
      data["store"] = next
    }
    data["version"] = 8
    return data
  },
  // v8 → v9: деревня с героем стала поселением со зданиями. Казармы — наименьшего уровня, вмещающего весь ростер
  // (никто не теряется); в начатой игре Лавка и Кладбище, которые уже были в деревне, построены на 1-м уровне,
  // полигон — нет. Витрина Лавки сохраняется до конца текущего периода, позиция героя больше не нужна.
  8: (old) => {
    const data = { ...old }
    const at = typeof data["updatedAt"] === "number" ? (data["updatedAt"] as number) : 0
    const army = data["army"] as { units?: unknown[] } | undefined
    const started = (data["profile"] as { startedAt?: number } | undefined)?.startedAt !== undefined
    const settlement = defaultSettlement(at)
    settlement.buildings.barracks = { level: barracksLevelFor(army?.units?.length ?? 0), builtAt: at }
    if (started) {
      settlement.buildings.store = { level: 1, builtAt: at }
      settlement.buildings.graveyard = { level: 1, builtAt: at }
    }
    data["settlement"] = settlement
    const store = (data["store"] ?? {}) as Record<string, unknown>
    const seed = typeof store["seed"] === "number" ? (store["seed"] as number) : 0
    data["store"] = { ...store, period: storePeriod(at), salt: seed & 0x7fffffff }
    delete data["village"]
    data["version"] = 9
    return data
  },
  // v9 → v10: на пустыре встал бар (здание `tavern`), в поселении — заказанная кружка, в бою — выпитый напиток.
  // Всё новое необязательно: старый сейв читается как есть, бара в нём просто ещё нет.
  9: (old) => ({ ...old, version: 10 }),
  // v10 → v11: сюжетные факты для триггеров диалогов. Что можно восстановить из общей статистики — переносится
  // (вылазки, победы, убитые, павшие), остальные счётчики начинаются с нуля.
  10: (old) => {
    const st = (old["stats"] ?? {}) as Partial<Record<"battles" | "wins" | "kills" | "deaths", number>>
    const counters: Record<string, number> = {}
    const put = (k: string, v: number | undefined) => {
      if (v) counters[k] = v
    }
    put("sortie.started", st.battles)
    put("sortie.finished", st.battles)
    put("sortie.victory", st.wins)
    put("kills", st.kills)
    put("fallen", st.deaths)
    return { ...old, story: { counters, seen: [] }, version: 11 }
  },
  // v11 → v12: витрину Лавки можно обновить за Вкусняшки — счётчик обновлений (цена) и номер выкладки (зерно).
  // Текущая витрина остаётся плановой выкладкой своего периода.
  11: (old) => {
    const store = (old["store"] ?? {}) as Record<string, unknown>
    return { ...old, store: { ...store, rerolls: 0, variant: 0 }, version: 12 }
  },
  // v12 → v13: в чаще убран бонус «Живица» (`regen`). В идущей вылазке он пропадает у отряда и с земли, а одиночка,
  // который его нёс, теперь оставит «Удачу». Разведки (`explore`) в старом бою нет — он продолжается пошагово.
  12: (old) => ({ ...old, battle: dropRegen(old["battle"]), version: 13 }),
  // v13 → v14: туман войны в чаще (`battle.revealed`). Поле необязательное: в идущей вылазке из старого сейва тумана
  // нет — видно всё поле. Версия поднята, чтобы старый клиент не прочитал новый сейв и не потерял разведанное.
  13: (old) => ({ ...old, version: 14 }),
  // v14 → v15: у настройки крови появился вариант «Выкл.» (`blood: "off"`). Выбор игрока («Море» или «Лужи»)
  // сохраняется; версия поднята, чтобы старый клиент не прочитал сейв с незнакомым значением
  14: (old) => ({ ...old, version: 15 })
}

/** Убрать бонус `regen` из боя в сейве (миграция v12 → v13). */
function dropRegen(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw
  const battle = raw as Record<string, unknown>
  const noRegen = (list: unknown) => (Array.isArray(list) ? list.filter(k => k !== "regen") : list)
  const noRegenPickups = (list: unknown) =>
    (Array.isArray(list) ? list.filter(p => !(p && typeof p === "object" && (p as { kind?: unknown }).kind === "regen")) : list)
  const map = battle["map"] as Record<string, unknown> | undefined
  const def = map?.["expedition"] as Record<string, unknown> | undefined
  const exp = battle["expedition"] as Record<string, unknown> | undefined
  const buffs = exp?.["buffs"] as { team?: unknown, units?: Record<string, unknown> } | undefined
  return {
    ...battle,
    ...(map && def
      ? {
          map: {
            ...map,
            expedition: {
              ...def,
              pickups: noRegenPickups(def["pickups"]),
              elites: Array.isArray(def["elites"])
                ? def["elites"].map((e: Record<string, unknown>) => (e["buff"] === "regen" ? { ...e, buff: "fortune" } : e))
                : def["elites"]
            }
          }
        }
      : {}),
    ...(exp
      ? {
          expedition: {
            ...exp,
            pickups: noRegenPickups(exp["pickups"]),
            ...(buffs
              ? {
                  buffs: {
                    ...buffs,
                    team: noRegen(buffs.team),
                    units: Object.fromEntries(Object.entries(buffs.units ?? {}).map(([id, l]) => [id, noRegen(l)]))
                  }
                }
              : {})
          }
        }
      : {})
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

/**
 * `newer` — сейв записан более новой версией игры: эта версия его не читает и не должна перезаписывать
 * (zod отбросил бы незнакомые поля, и сейв обрезался бы при первой же записи).
 */
export type ParseResult = { ok: true, save: SaveGame } | { ok: false, error: string, newer?: true }

export function parseSave(json: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  }
  catch (e) {
    return { ok: false, error: `JSON: ${(e as Error).message}` }
  }
  if (!raw || typeof raw !== "object") return { ok: false, error: tr("not an object", "не объект") }
  const version = (raw as Record<string, unknown>)["version"]
  if (typeof version === "number" && version < MIN_SAVE_VERSION)
    return {
      ok: false,
      error: tr(
        `Save version ${version} is outdated: fighters and weapons now come from the character model`,
        `сейв версии ${version} устарел: бойцы и оружие теперь из модели персонажа`
      )
    }
  if (typeof version === "number" && version > SAVE_VERSION)
    return {
      ok: false,
      newer: true,
      error: tr(
        `Save version ${version} is from a newer game version (this one reads up to ${SAVE_VERSION}) — reload to update`,
        `сейв версии ${version} записан более новой версией игры (эта читает до ${SAVE_VERSION}) — перезагрузите, чтобы обновиться`
      )
    }
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
  // Без каста: если схема и тип SaveGame разойдутся, это ошибка компиляции
  return { ok: true, save: res.data }
}

export function serializeSave(save: SaveGame): string {
  return JSON.stringify(save)
}
