import type {
  Army,
  BuildingId,
  LevelUpSummary,
  MemorialEntry,
  SaveGame,
  SettlementState,
  StoreStock,
  TrainingSlot,
  UnitInstance
} from "../types"
import { MAX_LEVEL, SQUAD_SIZE } from "../types"
import { createRng } from "../rng"
import { gainXp } from "../progression"
import { EMPTY_STORE, generateStore, itemPrice } from "../items"
import { equipWeapon, isUniqueClassId } from "../units"
import { invalidateKit } from "../skills/engine"
import {
  BARRACKS,
  BUILDING_IDS,
  BUILDING_MAX_LEVEL,
  GAME_DAY,
  GRAVEYARD,
  PLOTS,
  STORE,
  TRAINING,
  atLevel,
  buildingDef,
  type PlotDef
} from "@game/content/settlement"
import { gradeWeaponId, weaponDef } from "@game/content/weapons"
import { XP } from "@game/content/balance"
import { tr } from "@game/i18n"

// Поселение: строительство и улучшение зданий, вместимость Казарм, тренировки, витрина Лавки и воскрешение.
// Чистые функции над сейвом: проверка и изменение — одним шагом, состояние меняется целиком или никак.

export type Check = { ok: true } | { ok: false, error: string }
export type Outcome<T = object> = ({ ok: true, save: SaveGame } & T) | { ok: false, error: string }

const HOUR = 3_600_000
const DAY = 24 * HOUR
/** Сколько последних боёв помнит полигон, чтобы не начислить опыт за бой дважды. */
const SORTIES_REMEMBERED = 20

export function defaultSettlement(now: number): SettlementState {
  return { buildings: { barracks: { level: 1, builtAt: now } }, training: [], sortiesTrained: [] }
}

/* ---------- Здания ---------- */

/** Уровень здания; 0 — не построено. */
export function buildingLevel(save: Pick<SaveGame, "settlement">, id: BuildingId): number {
  return save.settlement.buildings[id]?.level ?? 0
}

export function isBuilt(save: Pick<SaveGame, "settlement">, id: BuildingId): boolean {
  return buildingLevel(save, id) > 0
}

/** Цена постройки (уровень 0) или улучшения с `level` на `level + 1`; null — выше некуда. */
export function levelCost(id: BuildingId, level: number): number | null {
  if (level >= BUILDING_MAX_LEVEL) return null
  return buildingDef(id).cost[level] ?? null
}

/** Чего не хватает для постройки по правилам (уровни других зданий); пусто — требования выполнены. */
export function missingRequirements(save: SaveGame, id: BuildingId): string[] {
  const req = buildingDef(id).requires ?? {}
  return (Object.entries(req) as [BuildingId, number][])
    .filter(([other, lv]) => buildingLevel(save, other) < lv)
    .map(([other, lv]) => tr(`${buildingDef(other).name} level ${lv}`, `${buildingDef(other).name} ${lv}-го уровня`))
}

const notEnough = (cost: number, have: number) =>
  tr(`Not enough Treats: ${cost - have} 🦴 short`, `Недостаточно Вкусняшек: не хватает ${cost - have} 🦴`)

export function canBuild(save: SaveGame, id: BuildingId): Check {
  if (isBuilt(save, id)) return { ok: false, error: tr("This plot is already taken", "Место уже занято") }
  const missing = missingRequirements(save, id)
  if (missing.length > 0) return { ok: false, error: `${tr("Requires", "Нужно")}: ${missing.join(", ")}` }
  const cost = levelCost(id, 0) ?? 0
  if (save.profile.treats < cost) return { ok: false, error: notEnough(cost, save.profile.treats) }
  return { ok: true }
}

export function canUpgrade(save: SaveGame, id: BuildingId): Check {
  const level = buildingLevel(save, id)
  if (level === 0) return { ok: false, error: tr("Build it first", "Сначала постройте здание") }
  const cost = levelCost(id, level)
  if (cost === null) return { ok: false, error: tr("Maximum level", "Максимальный уровень") }
  if (save.profile.treats < cost) return { ok: false, error: notEnough(cost, save.profile.treats) }
  return { ok: true }
}

function withLevel(save: SaveGame, id: BuildingId, level: number, now: number): SaveGame {
  const prev = save.settlement.buildings[id]
  return {
    ...save,
    settlement: {
      ...save.settlement,
      buildings: { ...save.settlement.buildings, [id]: { level, builtAt: prev?.builtAt ?? now } }
    }
  }
}

/** Последствия нового уровня для связанных систем: Лавка сразу выкладывает витрину своего размера. */
function afterLevelChange(save: SaveGame, id: BuildingId, now: number): SaveGame {
  if (id === "store") return restockStore(save, now, save.store.weapons.length + save.store.talismans.length === 0)
  return save
}

export function build(save: SaveGame, id: BuildingId, now: number): Outcome {
  const check = canBuild(save, id)
  if (!check.ok) return check
  const cost = levelCost(id, 0) ?? 0
  const paid = { ...save, profile: { ...save.profile, treats: save.profile.treats - cost } }
  return { ok: true, save: afterLevelChange(withLevel(paid, id, 1, now), id, now) }
}

export function upgrade(save: SaveGame, id: BuildingId, now: number): Outcome {
  const check = canUpgrade(save, id)
  if (!check.ok) return check
  const level = buildingLevel(save, id)
  const cost = levelCost(id, level) ?? 0
  // Опыт за время до улучшения — по старой скорости полигона
  const settled = id === "training" ? settleTraining(save, now).save : save
  const paid = { ...settled, profile: { ...settled.profile, treats: settled.profile.treats - cost } }
  return { ok: true, save: afterLevelChange(withLevel(paid, id, level + 1, now), id, now) }
}

/**
 * Состояние места на карте: занято зданием; свободно и можно строить; свободно, но не хватает Вкусняшек;
 * недоступно — требования не выполнены или место пока в резерве.
 */
export type PlotStatus = "occupied" | "available" | "free" | "locked"

export function plotStatus(save: SaveGame, plot: PlotDef): PlotStatus {
  if (!plot.building) return "locked"
  if (isBuilt(save, plot.building)) return "occupied"
  if (missingRequirements(save, plot.building).length > 0) return "locked"
  return canBuild(save, plot.building).ok ? "available" : "free"
}

export function plotStatuses(save: SaveGame): Record<string, PlotStatus> {
  return Object.fromEntries(PLOTS.map(p => [p.id, plotStatus(save, p)]))
}

/* ---------- Казармы ---------- */

/** Вместимость ростера по уровню Казарм (Казармы есть всегда; в битом сейве считаем 1-й уровень). */
export function rosterCapacity(save: Pick<SaveGame, "settlement">): number {
  return atLevel(BARRACKS.capacity, Math.max(1, buildingLevel(save, "barracks")))
}

/** Свободные места в ростере: тренирующиеся занимают места, павшие — нет. */
export function freeRosterSlots(save: Pick<SaveGame, "settlement" | "army">): number {
  return Math.max(0, rosterCapacity(save) - (save.army?.units.length ?? 0))
}

/** Наименьший уровень Казарм, вмещающий `units` бойцов (для миграции старых сейвов). */
export function barracksLevelFor(units: number): number {
  const i = BARRACKS.capacity.findIndex(c => c >= units)
  return i < 0 ? BUILDING_MAX_LEVEL : i + 1
}

/* ---------- Тренировочный полигон ---------- */

export function trainingCapacity(save: SaveGame): number {
  const level = buildingLevel(save, "training")
  return level === 0 ? 0 : atLevel(TRAINING.capacity, level)
}

export function isTraining(save: Pick<SaveGame, "settlement">, unitId: string): boolean {
  return save.settlement.training.some(t => t.unitId === unitId)
}

export function trainingIds(save: Pick<SaveGame, "settlement">): Set<string> {
  return new Set(save.settlement.training.map(t => t.unitId))
}

/** Боец в идущем бою (его нельзя отправить на тренировку). */
function inBattle(save: SaveGame, unitId: string): boolean {
  return !!save.battle && !save.battle.result && !!save.battle.units[unitId]
}

export function canTrain(save: SaveGame, unitId: string): Check {
  if (!isBuilt(save, "training")) return { ok: false, error: tr("Build the Training Ground first", "Сначала постройте полигон") }
  const unit = save.army?.units.find(u => u.id === unitId)
  if (!unit) {
    const dead = save.memorial.some(m => m.unit.id === unitId)
    return { ok: false, error: dead ? tr("The fallen can’t train", "Павшие не тренируются") : tr("No such fighter", "Нет такого бойца") }
  }
  if (isTraining(save, unitId)) return { ok: false, error: tr("Already training", "Уже тренируется") }
  if (inBattle(save, unitId)) return { ok: false, error: tr("This fighter is in battle", "Боец сейчас в бою") }
  if (save.settlement.training.length >= trainingCapacity(save))
    return { ok: false, error: tr("No free training slots", "Свободных мест на полигоне нет") }
  return { ok: true }
}

/** Отправить бойца на тренировку: он уходит из отряда на вылазку, но остаётся в ростере. */
export function startTraining(save: SaveGame, unitId: string, now: number): Outcome {
  const check = canTrain(save, unitId)
  if (!check.ok) return check
  const army = save.army as Army
  const slot: TrainingSlot = { unitId, since: now, lastTick: now, carryMs: 0, xp: 0 }
  return {
    ok: true,
    save: {
      ...save,
      army: { ...army, squadIds: army.squadIds.filter(id => id !== unitId) },
      settlement: { ...save.settlement, training: [...save.settlement.training, slot] }
    }
  }
}

/** Забрать бойца с полигона (опыт за прошедшее время начисляется). */
export function stopTraining(save: SaveGame, unitId: string, now: number): Outcome<{ levelUps: LevelUpSummary[] }> {
  if (!isTraining(save, unitId)) return { ok: false, error: tr("Not training", "Боец не тренируется") }
  const settled = settleTraining(save, now)
  const s = settled.save
  return {
    ok: true,
    levelUps: settled.levelUps,
    save: { ...s, settlement: { ...s.settlement, training: s.settlement.training.filter(t => t.unitId !== unitId) } }
  }
}

/** Сколько опыта боец ещё может получить до максимального уровня (на максимуме — 0). */
function xpRoom(u: UnitInstance): number {
  return u.level >= MAX_LEVEL ? 0 : (MAX_LEVEL - u.level) * XP.perLevel - u.xp
}

/**
 * Начислить опыт тренирующимся. В счётчик слота (`xp`, «+N опыта» на панели) идёт только реально полученный
 * опыт: на максимальном уровне он не копится.
 */
function giveXp(save: SaveGame, gains: Map<string, number>): { save: SaveGame, levelUps: LevelUpSummary[] } {
  if (!save.army || gains.size === 0) return { save, levelUps: [] }
  const levelUps: LevelUpSummary[] = []
  const received = new Map<string, number>()
  const units = save.army.units.map((u) => {
    const xp = Math.min(gains.get(u.id) ?? 0, xpRoom(u))
    if (xp <= 0) return u
    received.set(u.id, xp)
    const r = gainXp(u, xp)
    levelUps.push(...r.levelUps)
    return r.unit
  })
  const training = save.settlement.training.map(t => (received.has(t.unitId) ? { ...t, xp: t.xp + (received.get(t.unitId) ?? 0) } : t))
  return { save: { ...save, army: { ...save.army, units }, settlement: { ...save.settlement, training } }, levelUps }
}

/** Убрать с полигона тех, кого больше нет в ростере (пал, отпущен, вся армия погибла): их тренировка окончена. */
export function pruneTraining(save: SaveGame): SaveGame {
  const alive = new Set(save.army?.units.map(u => u.id) ?? [])
  const training = save.settlement.training.filter(t => alive.has(t.unitId))
  return training.length === save.settlement.training.length ? save : { ...save, settlement: { ...save.settlement, training } }
}

/**
 * Начислить опыт за прошедшее время: `xpPerHour` уровня полигона, дробный остаток копится в `carryMs`.
 * Часы, переведённые назад, опыта не дают (отсчёт начинается заново). Опыт идёт через `gainXp` — на максимальном
 * уровне он не копится, как и в бою.
 */
export function settleTraining(save: SaveGame, now: number): { save: SaveGame, levelUps: LevelUpSummary[] } {
  const pruned = pruneTraining(save)
  const level = buildingLevel(pruned, "training")
  if (level === 0 || pruned.settlement.training.length === 0) return { save: pruned, levelUps: [] }
  const msPerXp = HOUR / atLevel(TRAINING.xpPerHour, level)
  const gains = new Map<string, number>()
  let changed = false
  const training = pruned.settlement.training.map((t) => {
    if (now <= t.lastTick) {
      if (now === t.lastTick) return t
      changed = true
      return { ...t, lastTick: now, carryMs: 0 }
    }
    const total = now - t.lastTick + t.carryMs
    const xp = Math.floor(total / msPerXp)
    changed = true
    if (xp > 0) gains.set(t.unitId, xp)
    return { ...t, lastTick: now, carryMs: total - xp * msPerXp }
  })
  if (!changed) return { save: pruned, levelUps: [] }
  return giveXp({ ...pruned, settlement: { ...pruned.settlement, training } }, gains)
}

/**
 * Бонус полигона за вылазку `battleId`: каждому тренирующемуся `sortieXp` уровня. За один бой — один раз
 * (id боя запоминается), сначала досчитывается опыт за время.
 */
export function applySortieTraining(save: SaveGame, battleId: string, now: number): { save: SaveGame, levelUps: LevelUpSummary[] } {
  if (save.settlement.sortiesTrained.includes(battleId)) return { save, levelUps: [] }
  const settled = settleTraining(save, now)
  const s = settled.save
  const sortiesTrained = [...s.settlement.sortiesTrained, battleId].slice(-SORTIES_REMEMBERED)
  const level = buildingLevel(s, "training")
  if (level === 0 || s.settlement.training.length === 0)
    return { save: { ...s, settlement: { ...s.settlement, sortiesTrained } }, levelUps: settled.levelUps }
  const bonus = atLevel(TRAINING.sortieXp, level)
  const gains = new Map(s.settlement.training.map(t => [t.unitId, bonus]))
  const given = giveXp({ ...s, settlement: { ...s.settlement, sortiesTrained } }, gains)
  return { save: given.save, levelUps: [...settled.levelUps, ...given.levelUps] }
}

/** Опыт в час и сколько ждать следующей единицы опыта (для полоски прогресса). */
export function trainingRate(save: SaveGame): number {
  const level = buildingLevel(save, "training")
  return level === 0 ? 0 : atLevel(TRAINING.xpPerHour, level)
}

/* ---------- Торговая лавка ---------- */

export const STORE_PERIOD_MS = STORE.refreshHours * HOUR

/** Номер периода витрины: интервалы от эпохи Unix, одинаковые при любом перезапуске. */
export function storePeriod(now: number): number {
  return Math.floor(now / STORE_PERIOD_MS)
}

/** Когда сменится витрина. */
export function nextStoreRefresh(store: Pick<StoreStock, "period">): number {
  return (store.period + 1) * STORE_PERIOD_MS
}

export function storeOfferCount(save: SaveGame): number {
  const level = buildingLevel(save, "store")
  return level === 0 ? 0 : atLevel(STORE.offers, level)
}

export function storeDiscount(save: SaveGame): number {
  const level = buildingLevel(save, "store")
  return level === 0 ? 0 : atLevel(STORE.discount, level)
}

/** Цена товара в Лавке с её скидкой (не меньше 1 🦴). */
export function storePrice(save: SaveGame, itemId: string): number {
  return Math.max(1, Math.round(itemPrice(itemId) * (1 - storeDiscount(save))))
}

/**
 * Выложить витрину текущего периода под уровень Лавки. Зерно — соль игры + период + номер выкладки (`variant`):
 * так смена уровня Лавки не откатывает обновлённую за Вкусняшки витрину. Новый период — снова плановая выкладка.
 */
export function restockStore(save: SaveGame, now: number, fresh: boolean): SaveGame {
  const period = Math.max(storePeriod(now), save.store.period)
  const salt = save.store.salt
  const variant = period === save.store.period ? save.store.variant : 0
  const seed = createRng(salt).fork(variant > 0 ? `period:${period}:v${variant}` : `period:${period}`).int(0, 0x7fffffff)
  const goods = generateStore(seed, save.army, save.profile.glory, storeOfferCount(save))
  return { ...save, store: { ...goods, fresh: fresh || save.store.fresh, period, salt, rerolls: save.store.rerolls, variant } }
}

/** Цена следующего обновления витрины: растёт с каждым обновлением, сбрасывается после вылазки. */
export function storeRerollCost(save: SaveGame): number {
  return STORE.reroll.base + STORE.reroll.step * save.store.rerolls
}

/**
 * Обновить витрину за Вкусняшки: новая выкладка того же периода, цена следующего обновления растёт.
 * Проверки (Лавка построена, хватает Вкусняшек, период не сменился) — у вызывающего.
 */
export function rerollStore(save: SaveGame, now: number): SaveGame {
  const cost = storeRerollCost(save)
  const paid: SaveGame = {
    ...save,
    profile: { ...save.profile, treats: save.profile.treats - cost },
    store: { ...save.store, rerolls: save.store.rerolls + 1, variant: save.store.variant + 1 }
  }
  return restockStore(paid, now, false)
}

/**
 * Сменить витрину, если её период прошёл (и Лавка построена). Перевод часов назад витрину не меняет:
 * период только растёт.
 */
export function settleStore(save: SaveGame, now: number): SaveGame {
  if (!isBuilt(save, "store")) return save
  const empty = save.store.weapons.length + save.store.talismans.length === 0
  if (!empty && storePeriod(now) <= save.store.period) return save
  return restockStore(save, now, true)
}

export function emptyStore(salt: number): StoreStock {
  return { ...EMPTY_STORE, salt }
}

/* ---------- Кладбище ---------- */

const DAY_SHIFT = GAME_DAY.utcOffsetMinutes * 60_000 - GAME_DAY.resetHour * HOUR

/** Номер игрового дня по единому правилу `GAME_DAY`. */
export function gameDay(now: number): number {
  return Math.floor((now + DAY_SHIFT) / DAY)
}

/** Начало следующего игрового дня. */
export function nextDayStart(now: number): number {
  return (gameDay(now) + 1) * DAY - DAY_SHIFT
}

export interface ReviveStatus {
  /** Кладбище 5-го уровня: воскрешение открыто. */
  unlocked: boolean
  /** Сегодня ещё никого не воскрешали. */
  readyToday: boolean
  /** Когда снова можно воскресить (если сегодня уже воскрешали). */
  nextAt?: number
}

export function reviveStatus(save: SaveGame, now: number): ReviveStatus {
  const unlocked = buildingLevel(save, "graveyard") >= GRAVEYARD.reviveLevel
  const last = save.settlement.lastReviveAt
  // Часы, переведённые назад, не открывают новое воскрешение: день последнего не раньше сегодняшнего
  const readyToday = last === undefined || gameDay(now) > gameDay(last)
  const status: ReviveStatus = { unlocked, readyToday }
  if (!readyToday && last !== undefined) status.nextAt = nextDayStart(Math.max(now, last))
  return status
}

/** Павшие, которых можно вернуть: погибли в бою (не ушли сами), ещё не воскрешены и сейчас не в ростере. */
export function revivable(save: SaveGame): MemorialEntry[] {
  const alive = new Set(save.army?.units.map(u => u.id) ?? [])
  return save.memorial.filter(m => m.reason === "killed" && m.revivedAt === undefined && !alive.has(m.unit.id))
}

export function canRevive(save: SaveGame, entryId: string, now: number): Check {
  const entry = save.memorial.find(m => m.id === entryId)
  if (!entry) return { ok: false, error: tr("No such grave", "Такой могилы нет") }
  if (save.army?.units.some(u => u.id === entry.unit.id)) return { ok: false, error: tr("This fighter is alive", "Этот боец жив") }
  if (entry.reason !== "killed") return { ok: false, error: tr("Only the fallen can be revived", "Воскресить можно только павших в бою") }
  if (entry.revivedAt !== undefined) return { ok: false, error: tr("Already revived", "Уже воскрешён") }
  const status = reviveStatus(save, now)
  if (!status.unlocked)
    return { ok: false, error: tr(`Resurrection opens at Graveyard level ${GRAVEYARD.reviveLevel}`, `Воскрешение откроется на ${GRAVEYARD.reviveLevel}-м уровне Кладбища`) }
  if (!status.readyToday) return { ok: false, error: tr("Someone was already revived today", "Сегодня уже воскрешали") }
  if (freeRosterSlots(save) === 0) return { ok: false, error: tr("The Barracks are full", "В Казармах нет мест") }
  // Божественный класс — один на армию: пока он у другого бойца, павшего с тем же классом не вернуть
  if (isUniqueClassId(entry.unit.classId) && save.army?.units.some(u => u.classId === entry.unit.classId))
    return { ok: false, error: tr("Another fighter already has this divine class", "Божественный класс уже у другого бойца") }
  return { ok: true }
}

/** Воскрешённый возвращается без снаряжения: деревянное оружие своего навыка, без талисмана. */
export function strippedUnit(unit: UnitInstance): UnitInstance {
  const wood = gradeWeaponId(weaponDef(unit.skills.weapon).kind, "wood")
  const next = unit.skills.weapon === wood ? { ...unit } : equipWeapon(unit, wood)
  delete next.accessory
  invalidateKit(unit)
  return next
}

/**
 * Воскресить павшего: боец без снаряжения — в ростер (и в отряд, если там есть место), запись Кладбища помечается,
 * время воскрешения запоминается. Нет мест или сегодня уже воскрешали — ничего не меняется.
 */
export function revive(save: SaveGame, entryId: string, now: number): Outcome<{ unit: UnitInstance }> {
  const check = canRevive(save, entryId, now)
  if (!check.ok) return check
  const entry = save.memorial.find(m => m.id === entryId) as MemorialEntry
  const unit = strippedUnit(entry.unit)
  const army: Army = save.army ?? { id: `army_${now.toString(36)}`, units: [], squadIds: [], createdAt: now, battles: 0, wins: 0 }
  const squadIds = army.squadIds.length < SQUAD_SIZE ? [...army.squadIds, unit.id] : army.squadIds
  return {
    ok: true,
    unit,
    save: {
      ...save,
      army: { ...army, units: [...army.units, unit], squadIds },
      memorial: save.memorial.map(m => (m.id === entryId ? { ...m, revivedAt: now } : m)),
      settlement: { ...save.settlement, lastReviveAt: now }
    }
  }
}

/* ---------- Сводка для карты ---------- */

/** Что улучшить можно прямо сейчас (для значка ⬆ на карте). */
export function upgradable(save: SaveGame): Set<BuildingId> {
  return new Set(BUILDING_IDS.filter(id => isBuilt(save, id) && canUpgrade(save, id).ok))
}
