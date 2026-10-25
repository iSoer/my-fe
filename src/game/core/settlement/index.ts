import type { Army, CampLayoutSave, LevelUpSummary, Pos, SaveGame, Settlement, UnitInstance } from "../types"
import { MAX_LEVEL } from "../types"
import { createRng } from "../rng"
import { XP } from "@game/content/balance"
import {
  BARRACKS,
  BUILDING_IDS,
  CANTEEN,
  FATIGUE,
  FIELDS,
  FOOD,
  HOSPITAL,
  MAX_BUILDING_LEVEL,
  START_BUILDINGS,
  TRAINING,
  atLevel,
  buildingDef,
  dishDef,
  type BuildingId,
  type BuildingLevel
} from "@game/content/buildings"
import { generateStore, marketHour, marketSeed } from "../items"
import { rosterLevel } from "../progression"
import { levelGains } from "../units"
import { BUILDING_SHAPES, DECOR_LIMIT, decorDef, type DecorId } from "@game/content/village"
import { canPlace, findSpot, placedBuildings } from "../village"
import { tr } from "@game/i18n"

// Поселение: постройка и улучшение зданий и их механики. Чистые функции над сейвом; время — параметр `now`,
// так что офлайн-прогресс (полигон, поля, витрина) считается одинаково при входе в игру и в тестах.

const HOUR = 60 * 60 * 1000

export type Result<T> = { ok: true, value: T } | { ok: false, error: string }

const fail = (error: string): { ok: false, error: string } => ({ ok: false, error })

/** Декор нового лагеря: фонари у площади и костёр. */
const STARTER_DECOR: CampLayoutSave["decor"] = [
  { id: "lantern", x: 10, y: 13 },
  { id: "lantern", x: 12, y: 13 },
  { id: "campfire", x: 9, y: 18 }
]

export function defaultSettlement(now: number, seed: number): Settlement {
  const buildings = Object.fromEntries(
    BUILDING_IDS.filter(id => START_BUILDINGS[id] > 0).map(id => [id, { ...BUILDING_SHAPES[id].pref }])
  ) as CampLayoutSave["buildings"]
  return {
    buildings: { ...START_BUILDINGS },
    marketSeed: seed,
    training: { unitIds: [], since: now, bank: {} },
    fields: { since: now },
    hospital: { charges: 0 },
    layout: { buildings, decor: STARTER_DECOR.map(d => ({ ...d })) }
  }
}

/**
 * Каждому построенному зданию — место на карте: где не стоит, ставится на ближайшее к своему месту
 * по умолчанию свободное (миграция старых сейвов, постройка с экрана Поселения).
 */
export function placeMissing(settlement: Settlement): Settlement {
  let next = settlement
  for (const id of BUILDING_IDS) {
    if ((next.buildings[id] ?? 0) === 0 || next.layout.buildings[id]) continue
    const at = findSpot(next, id)
    if (at) next = { ...next, layout: { ...next.layout, buildings: { ...next.layout.buildings, [id]: at } } }
  }
  return next
}

export function buildingLevel(save: Pick<SaveGame, "settlement">, id: BuildingId): number {
  return save.settlement.buildings[id] ?? 0
}

/* ---------- Постройка и улучшение ---------- */

/** Цена и требование следующего уровня здания; `undefined` — уровень уже максимальный. */
export function nextLevelCost(save: Pick<SaveGame, "settlement">, id: BuildingId): BuildingLevel | undefined {
  const level = buildingLevel(save, id)
  return level >= MAX_BUILDING_LEVEL ? undefined : buildingDef(id).levels[level]
}

/** Можно ли построить / улучшить здание сейчас: хватает ли Вкусняшек и Еды, дорос ли ростер. */
export function canUpgrade(save: SaveGame, id: BuildingId): Result<BuildingLevel> {
  const cost = nextLevelCost(save, id)
  if (!cost) return fail(tr("Already at the top level", "Уже наивысший уровень"))
  const lvl = rosterLevel(save.army)
  if (lvl < cost.rosterLevel)
    return fail(tr(`Needs roster level ${cost.rosterLevel} (now ${lvl})`, `Нужен уровень ростера ${cost.rosterLevel} (сейчас ${lvl})`))
  if (save.profile.treats < cost.treats) return fail(tr("Not enough Treats", "Недостаточно Вкусняшек"))
  if (save.profile.food < cost.food) return fail(tr("Not enough Food", "Недостаточно Еды"))
  return { ok: true, value: cost }
}

/**
 * Построить или улучшить здание (мгновенно). Перед этим механика здания досчитывается по старому уровню:
 * Поля сдают урожай в амбар игрока, полигон начисляет опыт за время; Больница получает заряды нового уровня,
 * витрина площадки пересобирается под новый уровень.
 */
export function upgradeBuilding(save: SaveGame, id: BuildingId, now: number, at?: Pos): Result<SaveGame> {
  const check = canUpgrade(save, id)
  if (!check.ok) return check
  let next = save
  // Новое здание встаёт на выбранное место или на ближайшее свободное к своему месту по умолчанию
  if (buildingLevel(save, id) === 0) {
    const spot = at ?? findSpot(save.settlement, id)
    if (!spot) return fail(tr("No room left in the camp", "В лагере нет места"))
    const place = canPlace(save.settlement, id, spot)
    if (!place.ok) return place
    next = { ...next, settlement: { ...next.settlement, layout: { ...next.settlement.layout, buildings: { ...next.settlement.layout.buildings, [id]: { ...spot } } } } }
  }
  if (id === "fields" && buildingLevel(save, "fields") > 0) next = collectFood(next, now).save
  if (id === "training") next = accrueTraining(next, now)
  const from = buildingLevel(next, id)
  const to = from + 1
  const settlement: Settlement = { ...next.settlement, buildings: { ...next.settlement.buildings, [id]: to } }
  if (id === "fields" && from === 0) settlement.fields = { since: now }
  if (id === "training" && from === 0) settlement.training = { ...settlement.training, since: now }
  if (id === "hospital")
    settlement.hospital = { charges: next.settlement.hospital.charges + atLevel(HOSPITAL.charges, to) - (from > 0 ? atLevel(HOSPITAL.charges, from) : 0) }
  next = {
    ...next,
    settlement,
    profile: { ...next.profile, treats: next.profile.treats - check.value.treats, food: next.profile.food - check.value.food }
  }
  if (id === "market") next = { ...next, store: buildStore(next, marketHour(now)) }
  return { ok: true, value: next }
}

/* ---------- Лагерь: перенос зданий и декор ---------- */

/** Перенести построенное здание на новое место (бесплатно). */
export function moveBuilding(save: SaveGame, id: BuildingId, at: Pos): Result<SaveGame> {
  if (buildingLevel(save, id) === 0) return fail(tr("Not built yet", "Ещё не построено"))
  const check = canPlace(save.settlement, id, at)
  if (!check.ok) return check
  const layout = save.settlement.layout
  return { ok: true, value: { ...save, settlement: { ...save.settlement, layout: { ...layout, buildings: { ...layout.buildings, [id]: { ...at } } } } } }
}

/** Купить и поставить декор. */
export function placeDecor(save: SaveGame, id: DecorId, at: Pos): Result<SaveGame> {
  const def = decorDef(id)
  const layout = save.settlement.layout
  if (layout.decor.length >= DECOR_LIMIT) return fail(tr("The camp is full of decor", "В лагере больше нет места для декора"))
  if (save.profile.treats < def.cost) return fail(tr("Not enough Treats", "Недостаточно Вкусняшек"))
  const check = canPlace(save.settlement, id, at)
  if (!check.ok) return check
  return {
    ok: true,
    value: {
      ...save,
      profile: { ...save.profile, treats: save.profile.treats - def.cost },
      settlement: { ...save.settlement, layout: { ...layout, decor: [...layout.decor, { id, x: at.x, y: at.y }] } }
    }
  }
}

/** Убрать декор с клетки: возвращается половина цены. */
export function removeDecor(save: SaveGame, at: Pos): Result<{ save: SaveGame, refund: number, id: DecorId }> {
  const layout = save.settlement.layout
  const item = layout.decor.find(d => d.x === at.x && d.y === at.y)
  if (!item) return fail(tr("Nothing to remove here", "Здесь нечего убирать"))
  const refund = Math.floor(decorDef(item.id).cost / 2)
  return {
    ok: true,
    value: {
      save: {
        ...save,
        profile: { ...save.profile, treats: save.profile.treats + refund },
        settlement: { ...save.settlement, layout: { ...layout, decor: layout.decor.filter(d => d !== item) } }
      },
      refund,
      id: item.id
    }
  }
}

export { placedBuildings }

/* ---------- Казармы ---------- */

/** Сколько бойцов вмещает ростер (по уровню Казарм). */
export function rosterCap(save: Pick<SaveGame, "settlement">): number {
  return atLevel(BARRACKS.rosterCap, Math.max(1, buildingLevel(save, "barracks")))
}

/** Наименьший уровень Казарм, вмещающий ростер такого размера (для миграции старых сейвов). */
export function barracksLevelFor(units: number): number {
  const i = BARRACKS.rosterCap.findIndex(cap => cap >= units)
  return i < 0 ? MAX_BUILDING_LEVEL : i + 1
}

/* ---------- Торговая площадка ---------- */

function buildStore(save: SaveGame, hour: number) {
  const level = Math.max(1, buildingLevel(save, "market"))
  return generateStore(marketSeed(save.settlement.marketSeed, hour), save.army, save.profile.glory, level, hour)
}

/** Витрина площадки на текущий час: на границе часа (или пустая) собирается заново и помечается свежей. */
export function refreshMarket(save: SaveGame, now: number): SaveGame {
  const hour = marketHour(now)
  if (save.store.hour === hour && save.store.weapons.length > 0) return save
  return { ...save, store: buildStore(save, hour) }
}

/** Сколько миллисекунд до следующего обновления витрины. */
export function msToMarketRefresh(now: number): number {
  return (marketHour(now) + 1) * HOUR - now
}

/* ---------- Поля и Еда ---------- */

/** Еда, выросшая на Полях с последнего сбора (до вместимости амбара); часы, переведённые назад, ничего не дают. */
export function fieldsStored(save: Pick<SaveGame, "settlement">, now: number): number {
  const level = buildingLevel(save, "fields")
  if (level === 0) return 0
  const hours = Math.max(0, now - save.settlement.fields.since) / HOUR
  return Math.min(atLevel(FIELDS.storage, level), Math.floor(hours * atLevel(FIELDS.perHour, level)))
}

/**
 * Собрать урожай в Еду игрока. Пока амбар не полон, отсчёт сдвигается ровно на собранное (дробный остаток
 * продолжает расти); полный амбар сбрасывает отсчёт на `now`.
 */
export function collectFood(save: SaveGame, now: number): { save: SaveGame, amount: number } {
  const level = buildingLevel(save, "fields")
  const amount = fieldsStored(save, now)
  if (level === 0 || amount === 0) return { save, amount: 0 }
  const full = amount >= atLevel(FIELDS.storage, level)
  const since = full ? now : save.settlement.fields.since + (amount / atLevel(FIELDS.perHour, level)) * HOUR
  return {
    save: {
      ...save,
      profile: { ...save.profile, food: save.profile.food + amount },
      settlement: { ...save.settlement, fields: { since } }
    },
    amount
  }
}

export function sellFood(save: SaveGame, amount: number): Result<SaveGame> {
  const n = Math.floor(amount)
  if (n <= 0) return fail(tr("Nothing to sell", "Нечего продавать"))
  if (save.profile.food < n) return fail(tr("Not enough Food", "Недостаточно Еды"))
  return {
    ok: true,
    value: { ...save, profile: { ...save.profile, food: save.profile.food - n, treats: save.profile.treats + n * FOOD.sellPrice } }
  }
}

/* ---------- Тренировочный полигон ---------- */

/** Бойцы полигона, которые ещё есть в ростере. */
export function trainees(save: Pick<SaveGame, "settlement" | "army">): UnitInstance[] {
  const units = save.army?.units ?? []
  return save.settlement.training.unitIds.map(id => units.find(u => u.id === id)).filter((u): u is UnitInstance => !!u)
}

export function isTraining(save: Pick<SaveGame, "settlement">, unitId: string): boolean {
  return save.settlement.training.unitIds.includes(unitId)
}

/**
 * Предел роста на полигоне: на уровень ниже сильнейшего бойца ростера, который сам не тренируется.
 * Если тренируются все — расти некуда (0).
 */
export function trainingCap(save: Pick<SaveGame, "settlement" | "army">): number {
  const others = (save.army?.units ?? []).filter(u => !isTraining(save, u.id))
  if (others.length === 0) return 0
  return Math.min(MAX_LEVEL, Math.max(...others.map(u => u.level)) - 1)
}

/** Сколько опыта бойцу ещё можно получить до предела полигона. */
function xpRoom(unit: UnitInstance, cap: number): number {
  return Math.max(0, (cap - unit.level) * XP.perLevel - unit.xp)
}

function addBank(bank: Record<string, number>, ids: string[], xp: number): Record<string, number> {
  const next = { ...bank }
  for (const id of ids) next[id] = (next[id] ?? 0) + xp
  return next
}

/**
 * Начислить в копилку опыт за время на полигоне с `since` до `now` (не больше `TRAINING.maxHours` за раз).
 * Часы, переведённые назад, ничего не дают и не сдвигают отсчёт назад.
 */
export function accrueTraining(save: SaveGame, now: number): SaveGame {
  const t = save.settlement.training
  const level = buildingLevel(save, "training")
  if (now <= t.since) return save
  const ids = trainees(save).map(u => u.id)
  let bank = t.bank
  if (level > 0 && ids.length > 0) {
    const hours = Math.min(atLevel(TRAINING.maxHours, level), (now - t.since) / HOUR)
    bank = addBank(bank, ids, hours * atLevel(TRAINING.xpPerHour, level))
  }
  return { ...save, settlement: { ...save.settlement, training: { ...t, unitIds: ids, since: now, bank } } }
}

/** Опыт бойцам полигона за завершённый бой основного отряда. */
export function trainingBattleXp(settlement: Settlement, army: Army | undefined): Settlement {
  const level = settlement.buildings.training
  const ids = settlement.training.unitIds.filter(id => army?.units.some(u => u.id === id))
  if (level === 0 || ids.length === 0) return settlement
  return { ...settlement, training: { ...settlement.training, unitIds: ids, bank: addBank(settlement.training.bank, ids, atLevel(TRAINING.xpPerBattle, level)) } }
}

/** Сколько опыта из копилки боец реально получит (с учётом предела полигона). */
export function trainingGain(save: SaveGame, unit: UnitInstance): number {
  return Math.min(Math.floor(save.settlement.training.bank[unit.id] ?? 0), xpRoom(unit, trainingCap(save)))
}

export interface TrainingLevelUp {
  unit: UnitInstance
  from: number
  to: number
}

/**
 * Забрать опыт из копилки: каждый боец получает его до предела полигона, излишек сгорает. Возвращает
 * повышения уровней (для экрана нового уровня). `unitIds` — только этим бойцам (по умолчанию — всем).
 */
export function collectTraining(save: SaveGame, unitIds?: string[]): { save: SaveGame, levelUps: TrainingLevelUp[], xp: number } {
  const cap = trainingCap(save)
  const bank = { ...save.settlement.training.bank }
  const levelUps: TrainingLevelUp[] = []
  let total = 0
  const units = (save.army?.units ?? []).map((u) => {
    if (bank[u.id] === undefined || (unitIds && !unitIds.includes(u.id))) return u
    const xp = Math.min(Math.floor(bank[u.id] ?? 0), xpRoom(u, cap))
    delete bank[u.id]
    if (xp <= 0) return u
    total += xp
    const next = gainXpUpTo(u, xp)
    if (next.level > u.level) levelUps.push({ unit: next, from: u.level, to: next.level })
    return next
  })
  const army = save.army ? { ...save.army, units } : save.army
  const next: SaveGame = { ...save, settlement: { ...save.settlement, training: { ...save.settlement.training, bank } } }
  if (army) next.army = army
  return { save: next, levelUps, xp: total }
}

function gainXpUpTo(unit: UnitInstance, xp: number): UnitInstance {
  let next: UnitInstance = { ...unit, xp: unit.xp + xp }
  while (next.xp >= XP.perLevel && next.level < MAX_LEVEL) next = { ...next, level: next.level + 1, xp: next.xp - XP.perLevel }
  return next
}

/** Повышения уровня для итогов (как у `gainXp`): приросты статов от уровня `from` до `to`. */
export function levelUpSummary(u: TrainingLevelUp): LevelUpSummary {
  return { unitId: u.unit.id, from: u.from, to: u.to, gains: levelGains(u.unit, u.from, u.to) }
}

/**
 * Поставить бойца на полигон или снять с него. Сначала досчитывается опыт за время; поставленный боец уходит
 * из отряда, снятый забирает свою копилку.
 */
export function setTraining(save: SaveGame, unitId: string, on: boolean, now: number): Result<{ save: SaveGame, levelUps: TrainingLevelUp[] }> {
  if (buildingLevel(save, "training") === 0) return fail(tr("Build the Training Ground first", "Сначала постройте полигон"))
  if (!save.army?.units.some(u => u.id === unitId)) return fail(tr("No such fighter", "Нет бойца"))
  let next = accrueTraining(save, now)
  const ids = next.settlement.training.unitIds
  if (on) {
    if (ids.includes(unitId)) return { ok: true, value: { save: next, levelUps: [] } }
    if (ids.length >= TRAINING.slots) return fail(tr("All training slots are taken", "Все места на полигоне заняты"))
    const army = next.army as Army
    next = {
      ...next,
      army: { ...army, squadIds: army.squadIds.filter(id => id !== unitId) },
      settlement: { ...next.settlement, training: { ...next.settlement.training, unitIds: [...ids, unitId] } }
    }
    return { ok: true, value: { save: next, levelUps: [] } }
  }
  if (!ids.includes(unitId)) return { ok: true, value: { save: next, levelUps: [] } }
  const collected = collectTraining(next, [unitId])
  next = collected.save
  next = { ...next, settlement: { ...next.settlement, training: { ...next.settlement.training, unitIds: ids.filter(id => id !== unitId) } } }
  return { ok: true, value: { save: next, levelUps: collected.levelUps } }
}

/* ---------- Усталость и Больница ---------- */

export function fatigueOf(unit: Pick<UnitInstance, "fatigue">): number {
  return Math.min(FATIGUE.maxStacks, unit.fatigue ?? 0)
}

/** Боец вернулся из боя: +1 стак усталости (до `FATIGUE.maxStacks`), блюдо Столовой съедено. */
export function returnFromBattle(unit: UnitInstance): UnitInstance {
  const next: UnitInstance = { ...unit, fatigue: Math.min(FATIGUE.maxStacks, fatigueOf(unit) + 1) }
  delete next.meal
  return next
}

/** Сколько бойцов Больница может вылечить за раз на своём уровне. */
export function hospitalCharges(save: Pick<SaveGame, "settlement">): number {
  const level = buildingLevel(save, "hospital")
  return level === 0 ? 0 : atLevel(HOSPITAL.charges, level)
}

/** После боя заряды Больницы восстанавливаются. */
export function refillHospital(settlement: Settlement): Settlement {
  const level = settlement.buildings.hospital
  return level === 0 ? settlement : { ...settlement, hospital: { charges: atLevel(HOSPITAL.charges, level) } }
}

/** Вылечить бойца в Больнице: вся усталость снимается, тратится один заряд. */
export function cureFatigue(save: SaveGame, unitId: string): Result<SaveGame> {
  if (buildingLevel(save, "hospital") === 0) return fail(tr("Build the Hospital first", "Сначала постройте Больницу"))
  const unit = save.army?.units.find(u => u.id === unitId)
  if (!save.army || !unit) return fail(tr("No such fighter", "Нет бойца"))
  if (fatigueOf(unit) === 0) return fail(tr("Not tired", "Боец не устал"))
  if (save.settlement.hospital.charges <= 0) return fail(tr("No beds left until the next battle", "Мест нет до следующего боя"))
  const cured: UnitInstance = { ...unit }
  delete cured.fatigue
  return {
    ok: true,
    value: {
      ...save,
      army: { ...save.army, units: save.army.units.map(u => (u.id === unitId ? cured : u)) },
      settlement: { ...save.settlement, hospital: { charges: save.settlement.hospital.charges - 1 } }
    }
  }
}

/* ---------- Столовая ---------- */

/** Скольких бойцов отряда можно накормить перед вылазкой (0 — Столовой нет). */
export function mealSlots(save: Pick<SaveGame, "settlement">): number {
  const level = buildingLevel(save, "canteen")
  return level === 0 ? 0 : atLevel(CANTEEN.fed, level)
}

export function mealsFood(meals: Record<string, string> | undefined): number {
  return Object.values(meals ?? {}).reduce((a, id) => a + (dishDef(id)?.food ?? 0), 0)
}

/** Выбрать бойцу отряда блюдо на вылазку (`undefined` — без блюда). Еда списывается при старте боя. */
export function setMeal(save: SaveGame, unitId: string, dishId: string | undefined): Result<SaveGame> {
  const pb = save.pendingBattle
  if (!pb) return fail(tr("Scout a battle first", "Сначала разведайте бой"))
  // Блюда тех, кто ушёл из отряда, не в счёт
  const meals = Object.fromEntries(Object.entries(pb.meals ?? {}).filter(([id]) => id !== unitId && save.army?.squadIds.includes(id)))
  if (dishId) {
    const level = buildingLevel(save, "canteen")
    const dish = dishDef(dishId)
    if (level === 0) return fail(tr("Build the Canteen first", "Сначала постройте Столовую"))
    if (!dish || dish.minLevel > level) return fail(tr("Not on the menu yet", "Этого блюда пока нет в меню"))
    if (!save.army?.squadIds.includes(unitId)) return fail(tr("Only the squad eats before a sortie", "Перед вылазкой едят только бойцы отряда"))
    if (Object.keys(meals).length >= mealSlots(save)) return fail(tr("The Canteen can't feed more fighters", "Столовая не накормит больше бойцов"))
    meals[unitId] = dishId
    if (mealsFood(meals) > save.profile.food) return fail(tr("Not enough Food", "Недостаточно Еды"))
  }
  return { ok: true, value: { ...save, pendingBattle: { ...pb, meals } } }
}

/* ---------- Сводка ---------- */

/** Шаг поселения при входе и на действиях: опыт полигона за время и витрина площадки текущего часа. */
export function tickSettlement(save: SaveGame, now: number): SaveGame {
  return refreshMarket(accrueTraining(save, now), now)
}

/** Новое зерно площадки для нового сейва или миграции. */
export function newMarketSeed(seed: number): number {
  return createRng(seed).fork("market").int(0, 0x7fffffff)
}

export { BUILDING_IDS }
