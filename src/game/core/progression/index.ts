import { createRng } from "../rng"
import type {
  Army,
  BattleResult,
  Inventory,
  StoreStock,
  BattleState,
  BattleSummary,
  LevelUpSummary,
  MemorialEntry,
  Profile,
  SaveGame,
  Rarity,
  Shelter,
  Stats,
  UnitInstance
} from "../types"
import { BARRACKS_CAP, MAX_LEVEL, SQUAD_SIZE, STATS } from "../types"
import { generateUnit, levelGains, unitClassName } from "../units"
import { treatsMultiplier } from "../skills/engine"
import { addAll, generateStore } from "../items"
import { GLORY_TIERS, LOOT, PRICES, REWARDS, SHOP, XP, gloryTier } from "@game/content/balance"
import { EPITAPHS } from "@game/content/epitaphs"
import { personalityText } from "@game/content/personalities"
import { biomeDef } from "@game/content/biomes"

/* ---------- Цены ---------- */

export function trainCost(level: number): number {
  return PRICES.trainBase + PRICES.trainPerLevel * level
}
export function sharpenCost(currentTier: number): number | null {
  return PRICES.sharpen[currentTier] ?? null
}
/** Цена персонажа в магазине: растёт с уровнем и редкостью. */
export function unitPrice(unit: Pick<UnitInstance, "level" | "rarity">): number {
  return Math.round((SHOP.priceBase + SHOP.pricePerLevel * unit.level) * SHOP.rarityMult[unit.rarity])
}

/** Вкусняшки, которые роняет убитый враг (множитель сложности применяется в бою). */
export function lootFor(unit: Pick<UnitInstance, "level" | "rarity" | "isBoss">, treatsMult: number): number {
  const base = (LOOT.base + LOOT.perLevel * unit.level) * LOOT.rarityMult[unit.rarity] * (unit.isBoss ? LOOT.bossMult : 1)
  return Math.max(1, Math.round(base * treatsMult))
}

/* ---------- XP вне боя ---------- */

export function gainXp(unit: UnitInstance, xp: number): { unit: UnitInstance, levelUps: LevelUpSummary[] } {
  let next: UnitInstance = { ...unit, xp: unit.xp + xp }
  const levelUps: LevelUpSummary[] = []
  while (next.xp >= XP.perLevel && next.level < MAX_LEVEL) {
    const from = next.level
    next = { ...next, level: from + 1, xp: next.xp - XP.perLevel }
    levelUps.push({ unitId: unit.id, from, to: from + 1, gains: levelGains(next, from, from + 1) })
  }
  if (next.level >= MAX_LEVEL) next = { ...next, xp: 0 }
  return { unit: next, levelUps }
}

export function trainUnit(unit: UnitInstance): { unit: UnitInstance, levelUp: LevelUpSummary } {
  const from = unit.level
  const next: UnitInstance = { ...unit, level: Math.min(MAX_LEVEL, from + 1), xp: 0 }
  return { unit: next, levelUp: { unitId: unit.id, from, to: next.level, gains: levelGains(next, from, next.level) } }
}

export function sharpenWeapon(unit: UnitInstance): UnitInstance {
  if (unit.weaponTier >= 3) return unit
  return { ...unit, weaponTier: (unit.weaponTier + 1) as 1 | 2 | 3 }
}

/* ---------- Эпитафии ---------- */

export function epitaphFor(
  unit: UnitInstance,
  killerName: string | undefined,
  turn: number | undefined,
  seed: number
): string {
  const rng = createRng(seed).fork("epitaph")
  const tpl = rng.pick(EPITAPHS)
  return tpl({
    name: unit.name,
    gender: unit.gender,
    killer: killerName,
    className: unitClassName(unit),
    turn,
    personality: personalityText(unit.personalityId)
  })
}

export function memorialEntry(
  unit: UnitInstance,
  reason: MemorialEntry["reason"],
  now: number,
  extra: { killerName?: string, turn?: number, biomeId?: string } = {}
): MemorialEntry {
  const e: MemorialEntry = {
    id: `m_${unit.id}_${now.toString(36)}`,
    unit,
    diedAt: now,
    epitaph:
      reason === "released"
        ? `${unit.name} ушёл${unit.gender === "f" ? "а" : ""} сам${unit.gender === "f" ? "а" : ""}. Никто не остановил.`
        : epitaphFor(unit, extra.killerName, extra.turn, unit.seed ^ now),
    reason
  }
  if (extra.killerName) e.killerName = extra.killerName
  if (extra.turn !== undefined) e.battleTurn = extra.turn
  if (extra.biomeId) e.biomeId = extra.biomeId
  return e
}

/* ---------- Итоги боя ---------- */

export interface BattleResolution {
  summary: BattleSummary
  army: Army | undefined
  profile: Profile
  memorial: MemorialEntry[]
  shelter: Shelter
  /** Инвентарь с вернувшимся остатком рюкзака (снаряжение павших потеряно вместе с ними). */
  inventory: Inventory
  store: StoreStock
  rewardChoice?: UnitInstance[]
}

/** Доля выбитых за бой Вкусняшек, которая достаётся игроку при этом исходе. */
export function lootShare(result: BattleResult): number {
  return result === "victory" ? 1 : result === "defeat" ? REWARDS.defeatLootShare : REWARDS.retreatLootShare
}

export function resolveBattle(save: SaveGame, state: BattleState, now: number): BattleResolution {
  const army = save.army
  if (!army) throw new Error("нет армии")
  const result = state.result ?? "retreat"
  const rng = createRng(state.seed ^ (now & 0xffff)).fork("resolve")

  const fallen: MemorialEntry[] = []
  const survivors: UnitInstance[] = []
  const levelUps: LevelUpSummary[] = []
  const nextUnits: UnitInstance[] = []

  for (const u of army.units) {
    const bu = state.units[u.id]
    const roster = state.roster[u.id]
    if (!bu || !roster) {
      nextUnits.push(u)
      continue
    }
    const merged: UnitInstance = {
      ...roster,
      history: { ...roster.history, battles: roster.history.battles + 1 }
    }
    if (bu.alive) {
      survivors.push(merged)
      nextUnits.push(merged)
      if (merged.level > u.level)
        levelUps.push({ unitId: u.id, from: u.level, to: merged.level, gains: statDiff(u, merged) })
    }
    else {
      const killerEvent = [...state.decals]
      void killerEvent
      const killerId = findKiller(state, u.id)
      const killerName = killerId ? state.roster[killerId]?.name : undefined
      const extra: { killerName?: string, turn?: number, biomeId: string } = {
        turn: state.turn,
        biomeId: state.map.biomeId
      }
      if (killerName) extra.killerName = killerName
      fallen.push(memorialEntry(merged, "killed", now, extra))
    }
  }

  const flawless = result === "victory" && fallen.length === 0
  // Выбитое из врагов достаётся целиком только при победе: поражение и отступление забирают часть; победа — бонус карты
  const loot = state.stats.loot
  const kept = Math.round(loot * lootShare(result))
  let bonus = 0
  let glory = 0
  if (result === "victory") {
    bonus = Math.round(state.map.rewards.treats * REWARDS.victoryShare)
    if (flawless) bonus = Math.round(bonus * (1 + REWARDS.flawlessBonus))
    glory = state.map.rewards.glory
  }
  let mult = 1
  for (const s of survivors) mult *= treatsMultiplier(s)
  const treats = Math.round((kept + bonus) * mult)
  glory += fallen.length * REWARDS.gloryPerDeath

  const armyFell = nextUnits.length === 0
  if (armyFell) {
    const totalLevels = [...army.units].reduce((a, u) => a + u.level, 0)
    glory += Math.max(REWARDS.armyFallMinGlory, Math.round(totalLevels / 4))
  }

  const wins = { ...save.profile.wins }
  if (result === "victory") wins[state.difficulty] = (wins[state.difficulty] ?? 0) + 1
  const profile: Profile = {
    ...save.profile,
    treats: save.profile.treats + treats,
    glory: save.profile.glory + glory,
    wins
  }

  const nextArmy: Army | undefined = armyFell
    ? undefined
    : {
        ...army,
        units: nextUnits,
        squadIds: army.squadIds.filter(id => nextUnits.some(u => u.id === id)),
        battles: army.battles + 1,
        wins: army.wins + (result === "victory" ? 1 : 0)
      }

  const summary: BattleSummary = {
    result,
    difficulty: state.difficulty,
    biomeId: state.map.biomeId,
    turns: state.turn,
    kills: state.stats.kills,
    damage: state.stats.damage,
    fallen,
    xp: state.stats.xpGained,
    levelUps,
    rewards: { treats, loot, lost: loot - kept, glory, flawless },
    survivors,
    armyFell
  }
  const mvp = Object.entries(state.stats.xpGained).sort((a, b) => b[1] - a[1])[0]
  if (mvp) summary.mvpId = mvp[0]

  // Витрина Казармы и Лавка обновляются после каждого боя; бесплатная награда — если ростер ещё жив
  const shelter: Shelter = generateShop(rng.int(0, 0x7fffffff), nextArmy, profile.glory, now)
  const store = generateStore(rng.int(0, 0x7fffffff), nextArmy, profile.glory)
  const inventory = addAll(save.inventory, state.pack ?? {})
  const rewardChoice = nextArmy
    ? generateRewardChoice(rng.int(0, 0x7fffffff), nextArmy, profile.glory, result === "victory", now)
    : undefined

  return { summary, army: nextArmy, profile, memorial: [...save.memorial, ...fallen], shelter, inventory, store, rewardChoice }
}

function statDiff(a: UnitInstance, b: UnitInstance): Partial<Stats> {
  const ga = levelGains(b, a.level, b.level)
  const out: Partial<Stats> = {}
  for (const s of STATS) if (ga[s]) out[s] = ga[s]
  return out
}

function findKiller(state: BattleState, unitId: string): string | undefined {
  // Последний combat-ивент в логе недоступен (лог не хранится), поэтому ищем по истории: враг с убийствами, ближайший к телу.
  const bu = state.units[unitId]
  if (!bu) return undefined
  let best: { id: string, d: number } | undefined
  for (const e of Object.values(state.units)) {
    if (e.side === bu.side) continue
    const d = Math.abs(e.pos.x - bu.pos.x) + Math.abs(e.pos.y - bu.pos.y)
    if (!best || d < best.d) best = { id: e.unitId, d }
  }
  return best?.id
}

/* ---------- Ростер, магазин, награда ---------- */

/** Уровень, под который подбираются враги, награды и витрина: средний уровень сильнейших бойцов отряда ростера. */
export function rosterLevel(army: Pick<Army, "units"> | undefined): number {
  if (!army || army.units.length === 0) return 1
  const top = [...army.units].sort((a, b) => b.level - a.level).slice(0, SQUAD_SIZE)
  return Math.max(1, Math.round(top.reduce((a, u) => a + u.level, 0) / top.length))
}

function candidates(seed: number, label: string, count: number, level: number, weights: Record<Rarity, number>, now: number) {
  const rng = createRng(seed).fork(label)
  return Array.from({ length: count }, () =>
    generateUnit({ seed: rng.int(0, 0x7fffffff), level: Math.max(1, level + rng.int(-2, 1)), rarityWeights: weights, now })
  )
}

/** Витрина магазина: персонажи около уровня ростера, редкость — по Славе. */
export function generateShop(seed: number, army: Army | undefined, glory: number, now: number): Shelter {
  const size = glory >= 150 ? SHOP.sizeWithGlory150 : SHOP.size
  return { candidates: candidates(seed, "shop", size, rosterLevel(army), gloryTier(glory).rarityWeights, now), seed }
}

/** Бесплатная награда за бой: три кандидата; после победы — редкость следующего яруса Славы. */
export function generateRewardChoice(seed: number, army: Army, glory: number, victory: boolean, now: number): UnitInstance[] {
  const tier = GLORY_TIERS.indexOf(gloryTier(glory))
  const weights = (GLORY_TIERS[victory ? Math.min(tier + 1, GLORY_TIERS.length - 1) : tier] ?? gloryTier(glory)).rarityWeights
  return candidates(seed, "reward", REWARDS.rewardChoices, rosterLevel(army), weights, now)
}

export function canRecruit(army: Army | undefined): boolean {
  return !!army && army.units.length < BARRACKS_CAP
}

export function biomeName(id: string): string {
  return biomeDef(id).name
}
