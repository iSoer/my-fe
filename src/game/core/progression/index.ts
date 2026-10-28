import { createRng } from "../rng"
import type {
  Army,
  BattleResult,
  Inventory,
  BattleState,
  BattleSummary,
  LevelUpSummary,
  MemorialEntry,
  Profile,
  SaveGame,
  Rarity,
  WeaponSkill,
  Shelter,
  Stats,
  UnitInstance
} from "../types"
import { MAX_LEVEL, SQUAD_SIZE, STATS } from "../types"
import { generateUnit, levelGains, loadoutsAt, unitClassName } from "../units"
import { addItem } from "../items"
import { treatsMultiplier } from "../skills/engine"
import { LOOT, PRICES, REWARDS, SHOP, XP, recruitRarityWeights } from "@game/content/balance"
import { EPITAPHS } from "@game/content/epitaphs"
import { personalityText } from "@game/content/personalities"
import { biomeDef } from "@game/content/biomes"
import { tr } from "@game/i18n"

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
        ? tr(
            `${unit.name} walked away. Nobody stopped ${unit.gender === "f" ? "her" : "him"}.`,
            `${unit.name} ушёл${unit.gender === "f" ? "а" : ""} сам${unit.gender === "f" ? "а" : ""}. Никто не остановил.`
          )
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
  /** Инвентарь армии (снаряжение павших потеряно вместе с ними). */
  inventory: Inventory
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
  // Победа даёт выжившим хотя бы `XP.victoryMin` опыта — даже бойцу, который не дрался или бил только слабых
  const xpGained = { ...state.stats.xpGained }

  for (const u of army.units) {
    const bu = state.units[u.id]
    const roster = state.roster[u.id]
    if (!bu || !roster) {
      nextUnits.push(u)
      continue
    }
    let merged: UnitInstance = {
      ...roster,
      history: { ...roster.history, battles: roster.history.battles + 1 }
    }
    const short = XP.victoryMin - (xpGained[u.id] ?? 0)
    if (bu.alive && result === "victory" && short > 0) {
      merged = gainXp(merged, short).unit
      xpGained[u.id] = XP.victoryMin
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

  let nextArmy: Army | undefined = armyFell
    ? undefined
    : {
        ...army,
        units: nextUnits,
        squadIds: army.squadIds.filter(id => nextUnits.some(u => u.id === id)),
        battles: army.battles + 1,
        wins: army.wins + (result === "victory" ? 1 : 0)
      }
  // Выжило меньше, чем нужно на отряд, — недостающие приходят сами, под нехватку ролей (`reinforceArmy`)
  const recruits = nextArmy ? reinforcements(rng.int(0, 0x7fffffff), nextArmy, profile, now) : []
  if (nextArmy && recruits.length > 0) nextArmy = withRecruits(nextArmy, recruits)

  const summary: BattleSummary = {
    result,
    difficulty: state.difficulty,
    biomeId: state.map.biomeId,
    turns: state.turn,
    kills: state.stats.kills,
    damage: state.stats.damage,
    fallen,
    xp: xpGained,
    levelUps,
    rewards: { treats, loot, lost: loot - kept, glory, flawless },
    survivors,
    armyFell
  }
  if (state.timeUp) summary.timeUp = true
  if (recruits.length > 0) summary.recruits = recruits
  const mvp = Object.entries(xpGained).sort((a, b) => b[1] - a[1])[0]
  if (mvp) summary.mvpId = mvp[0]

  // Витрина набора в Казармах обновляется после каждого боя (Лавка — по времени, см. `core/settlement`);
  // бесплатная награда — если ростер ещё жив
  const shelter: Shelter = generateShop(rng.int(0, 0x7fffffff), nextArmy, profile, now)
  // Вылазка в чащу: оружие и талисманы из сундуков достаются армии, только если отряд ушёл через выход (победа)
  const found = result === "victory" ? state.expedition?.found ?? [] : []
  let inventory = save.inventory
  for (const id of found) inventory = addItem(inventory, id)
  if (found.length > 0) summary.found = [...found]
  const rewardChoice = nextArmy
    ? generateRewardChoice(rng.int(0, 0x7fffffff), nextArmy, profile, result === "victory", now)
    : undefined

  return { summary, army: nextArmy, profile, memorial: [...save.memorial, ...fallen], shelter, inventory, rewardChoice }
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

const MELEE_SKILLS: readonly WeaponSkill[] = ["sword", "spear", "axe", "gauntlet"]
const TRIANGLE: readonly WeaponSkill[] = ["sword", "spear", "axe"]

/**
 * Какое оружие нужнее отряду из `units` следующим бойцом — по гарантиям состава, как у стартового ростера:
 * сначала ближник (по возможности недостающего цвета треугольника), потом лекарь, дальник, второй ближник,
 * недостающие цвета; если всё есть — любое.
 */
export function neededWeapons(units: readonly Pick<UnitInstance, "weaponSkill">[]): WeaponSkill[] {
  const skills = units.map(u => u.weaponSkill)
  const melee = skills.filter(s => MELEE_SKILLS.includes(s)).length
  const missingColors = TRIANGLE.filter(c => !skills.includes(c))
  const meleeNeed = missingColors.length > 0 ? missingColors : [...MELEE_SKILLS]
  if (melee < 1) return meleeNeed
  if (!skills.includes("whiteMagic")) return ["whiteMagic"]
  if (!skills.some(s => s === "bow" || s === "blackMagic")) return ["bow", "blackMagic"]
  if (melee < 2) return meleeNeed
  if (missingColors.length > 0) return missingColors
  return ["sword", "spear", "axe", "gauntlet", "bow", "blackMagic", "whiteMagic"]
}

/**
 * Бесплатное пополнение: если в армии меньше бойцов, чем мест в отряде (`SQUAD_SIZE`), недостающие приходят сами —
 * игра не застревает, когда бойцы пали, а Вкусняшек на набор нет. Каждый следующий закрывает главную нехватку
 * ролей (`neededWeapons`); звезда — из открытых, уровень — по ростеру этой звезды, статы — по пресету класса.
 * Армию, павшую целиком, это не касается: для неё есть новый стартовый ростер.
 */
export function reinforcements(seed: number, army: Army, profile: Pick<Profile, "maxRarity">, now: number): UnitInstance[] {
  const rng = createRng(seed).fork("reinforce")
  const weights = recruitRarityWeights(profile.maxRarity)
  const out: UnitInstance[] = []
  while (army.units.length + out.length < SQUAD_SIZE) {
    const need = neededWeapons([...army.units, ...out])
    const rarity = rng.weighted(([1, 2, 3, 4, 5] as Rarity[]).map(r => ({ item: r, w: weights[r] })))
    const level = Math.max(1, recruitLevel(army, rarity))
    const all = loadoutsAt(level)
    const fit = all.filter(l => need.includes(l.weaponSkill))
    const loadout = rng.weighted((fit.length > 0 ? fit : all).map(l => ({ item: l, w: l.weight })))
    out.push(generateUnit({
      seed: rng.int(0, 0x7fffffff),
      level,
      rarity,
      classId: loadout.classId,
      weaponSkill: loadout.weaponSkill,
      preset: true,
      now
    }))
  }
  return out
}

/** Новобранцы — в ростер и сразу в отряд (пока в нём есть места). */
export function withRecruits(army: Army, recruits: readonly UnitInstance[]): Army {
  const squadIds = [...army.squadIds]
  for (const u of recruits) if (squadIds.length < SQUAD_SIZE) squadIds.push(u.id)
  return { ...army, units: [...army.units, ...recruits], squadIds }
}

/** Уровень, под который подбираются враги, награды и витрина: средний уровень сильнейших бойцов отряда ростера. */
export function rosterLevel(army: Pick<Army, "units"> | undefined): number {
  if (!army || army.units.length === 0) return 1
  const top = [...army.units].sort((a, b) => b.level - a.level).slice(0, SQUAD_SIZE)
  return Math.max(1, Math.round(top.reduce((a, u) => a + u.level, 0) / top.length))
}

/**
 * Уровень, до которого предлагаются кандидаты звезды `rarity`: средний уровень сильнейших бойцов ростера этой
 * звезды и выше. Каждая звезда растёт с нуля: только что открытая перерождением ★2 даёт кандидатов около уровня
 * перерождённого бойца (1-го), а не около 80-го, как сильнейшие ★1 ростера; нет бойцов этой звезды — 1-й уровень.
 * Для ★1 это обычный `rosterLevel`.
 */
export function recruitLevel(army: Pick<Army, "units"> | undefined, rarity: Rarity): number {
  return rosterLevel(army ? { units: army.units.filter(u => u.rarity >= rarity) } : undefined)
}

/**
 * Кандидаты набора: сначала звезда (по весам открытых), потом уровень около уровня ростера этой звезды, класс
 * открытый на этом уровне; статы — по пресету класса, владение оружием — по классу и уровню (`presetSkillXp`).
 */
function candidates(seed: number, label: string, count: number, army: Pick<Army, "units"> | undefined, weights: Record<Rarity, number>, now: number) {
  const rng = createRng(seed).fork(label)
  return Array.from({ length: count }, () => {
    const unitSeed = rng.int(0, 0x7fffffff)
    const rarity = rng.weighted(([1, 2, 3, 4, 5] as Rarity[]).map(r => ({ item: r, w: weights[r] })))
    const level = Math.max(1, recruitLevel(army, rarity) + rng.int(-2, 1))
    // Класс — из тех, что открыты на уровне (божественные не выпадают: их ранг S только своими руками)
    const loadout = rng.weighted(loadoutsAt(level).map(l => ({ item: l, w: l.weight })))
    return generateUnit({ seed: unitSeed, level, rarity, classId: loadout.classId, weaponSkill: loadout.weaponSkill, preset: true, now })
  })
}

/** Витрина магазина: звёзды — только открытые перерождением, уровень — по ростеру своей звезды (`recruitLevel`), размер — по Славе. */
export function generateShop(seed: number, army: Army | undefined, profile: Pick<Profile, "glory" | "maxRarity">, now: number): Shelter {
  const size = profile.glory >= 150 ? SHOP.sizeWithGlory150 : SHOP.size
  return { candidates: candidates(seed, "shop", size, army, recruitRarityWeights(profile.maxRarity), now), seed }
}

/** Бесплатная награда за бой: три кандидата открытых звёзд; после победы высшая открытая звезда вдвое чаще. */
export function generateRewardChoice(
  seed: number,
  army: Army,
  profile: Pick<Profile, "maxRarity">,
  victory: boolean,
  now: number
): UnitInstance[] {
  const weights = recruitRarityWeights(profile.maxRarity, victory)
  return candidates(seed, "reward", REWARDS.rewardChoices, army, weights, now)
}

export function biomeName(id: string): string {
  return biomeDef(id).name
}
