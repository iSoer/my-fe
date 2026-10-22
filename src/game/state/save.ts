import { atom, computed } from "nanostores"
import type {
  Army,
  Facing,
  Inventory,
  Pos,
  BattleAction,
  BattleEvent,
  BattleState,
  BattleSummary,
  Difficulty,
  SaveGame,
  Settings,
  UnitInstance,
  UnitSkills
} from "@game/core/types"
import { BARRACKS_CAP, MAX_LEVEL, SQUAD_SIZE } from "@game/core/types"
import { createEmptySave, parseSave, serializeSave } from "@game/core/save"
import { createRng, randomSeed } from "@game/core/rng"
import {
  canTakeClassNow,
  generateRoster,
  isUniqueClassId,
  learnSkill,
  equipSkill,
  equipWeapon,
  reclassUnit,
  skillCost
} from "@game/core/units"
import {
  addAll,
  addItem,
  generateStore,
  inStore,
  isWoodWeapon,
  itemCategory,
  itemCount,
  itemPrice,
  removeItem,
  totalCount,
  unitGear
} from "@game/core/items"
import { isConsumableId, isTalismanId } from "@game/content/items"
import { ITEMS } from "@game/content/balance"
import { HERO_RETURN } from "@game/content/village"
import { generateMap } from "@game/core/map/generate"
import { applyAction, createBattle } from "@game/core/battle/reducer"
import {
  generateShop,
  memorialEntry,
  resolveBattle,
  rosterLevel,
  unitPrice,
  sharpenCost,
  sharpenWeapon,
  trainCost,
  trainUnit
} from "@game/core/progression"
import { difficultyDef } from "@game/content/balance"
import { invalidateKit } from "@game/core/skills/engine"
import { BIOMES } from "@game/content/biomes"
import { clearLocal, loadLocal, saveLocal } from "@game/platform/storage"
import { setHapticsEnabled } from "@game/platform/haptics"

/* ---------- Сторы ---------- */

export const $save = atom<SaveGame>(createEmptySave(Date.now()))
export const $saveStatus = atom<"loading" | "ready" | "error">("loading")
export const $saveError = atom<string | null>(null)

export const $profile = computed($save, s => s.profile)
export const $army = computed($save, s => s.army)
export const $battle = computed($save, s => s.battle)
export const $settings = computed($save, s => s.settings)
export const $shelter = computed($save, s => s.shelter)
export const $memorial = computed($save, s => s.memorial)
export const $lastBattle = computed($save, s => s.lastBattle)
export const $pendingBattle = computed($save, s => s.pendingBattle)
export const $rewardChoice = computed($save, s => s.rewardChoice)
export const $inventory = computed($save, s => s.inventory)
export const $store = computed($save, s => s.store)

/** Начата ли игра: на главном экране есть «Продолжить». */
export function gameStarted(save: SaveGame): boolean {
  return save.profile.startedAt !== undefined
}

export const $unlockedBiomes = computed($save, (s) => {
  const totalWins = Object.values(s.profile.wins).reduce((a, b) => a + b, 0)
  return BIOMES.filter(b => totalWins >= b.unlockWins).map(b => b.id)
})

export function difficultyUnlocked(save: SaveGame, d: Difficulty): boolean {
  const def = difficultyDef(d)
  if (!def.unlock) return true
  return (save.profile.wins[def.unlock.difficulty] ?? 0) >= def.unlock.wins
}

/* ---------- Персистентность ---------- */

let localTimer: ReturnType<typeof setTimeout> | null = null
let persistEnabled = false
let visibilityHooked = false

function persist(save: SaveGame): void {
  if (!persistEnabled) return
  const json = serializeSave(save)
  if (localTimer) clearTimeout(localTimer)
  localTimer = setTimeout(() => saveLocal(json), 100)
}

export function flushPersist(): void {
  if (!persistEnabled) return
  if (localTimer) clearTimeout(localTimer)
  saveLocal(serializeSave($save.get()))
}

export function updateSave(fn: (s: SaveGame) => SaveGame): SaveGame {
  const next = { ...fn($save.get()), updatedAt: Date.now() }
  $save.set(next)
  persist(next)
  return next
}

/** Загрузить сейв из localStorage (повреждённый заменяется новым). Повторный вызов ничего не делает. */
export function initSave(): void {
  if ($saveStatus.get() === "ready") return
  const localJson = loadLocal()
  let local: SaveGame | null = null
  if (localJson) {
    const r = parseSave(localJson)
    if (r.ok) local = r.save
    else $saveError.set(r.error)
  }
  setHapticsEnabled(local?.settings.haptics ?? true)
  $save.set(local ?? createEmptySave(Date.now()))
  persistEnabled = true
  $saveStatus.set("ready")
  if (!visibilityHooked && typeof document !== "undefined") {
    visibilityHooked = true
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushPersist()
    })
  }
}

/* ---------- Ростер и армия ---------- */

/**
 * Выдать стартовый ростер, если армии нет (новая игра или все пали): персонажи модели с гарантиями ролей,
 * первые 4 — в отряде. Заодно заполняет пустую витрину магазина.
 */
export function ensureRoster(): void {
  ensureStore()
  const s = $save.get()
  if (s.army && s.army.units.length > 0) {
    if (s.shelter.candidates.length === 0)
      updateSave(st => ({ ...st, shelter: generateShop(randomSeed(), st.army, st.profile.glory, Date.now()) }))
    return
  }
  const now = Date.now()
  const units = generateRoster({ seed: randomSeed(), glory: s.profile.glory, now }).map(u => ({ ...u, createdAt: now }))
  const army: Army = {
    id: `army_${now.toString(36)}`,
    units,
    squadIds: units.slice(0, SQUAD_SIZE).map(u => u.id),
    createdAt: now,
    battles: 0,
    wins: 0
  }
  updateSave((st) => {
    const next: SaveGame = {
      ...st,
      army,
      shelter: generateShop(randomSeed(), army, st.profile.glory, now),
      profile: {
        ...st.profile,
        armiesCreated: st.profile.armiesCreated + 1,
        treats: st.profile.treats + (st.profile.glory >= 600 && st.profile.armiesCreated > 0 ? 500 : 0)
      }
    }
    delete next.pendingBattle
    delete next.rewardChoice
    return next
  })
}

/** Сгенерировать ассортимент Лавки, если его ещё нет (новый сейв или миграция с v5). */
export function ensureStore(): void {
  if ($save.get().store.weapons.length > 0) return
  updateSave(st => ({ ...st, store: generateStore(randomSeed(), st.army, st.profile.glory) }))
}

/**
 * Новая игра: всё, кроме Настроек, стирается (ростер, инвентарь, Слава, Кладбище), выдаётся стартовый ростер,
 * герой — на площади деревни.
 */
export function newGame(): void {
  const now = Date.now()
  const settings = $save.get().settings
  const fresh = createEmptySave(now)
  updateSave(() => ({ ...fresh, settings, profile: { ...fresh.profile, startedAt: now } }))
  ensureRoster()
}

/** Свободные места в ростере (из 20). */
export function freeSlots(save: SaveGame): number {
  return Math.max(0, BARRACKS_CAP - (save.army?.units.length ?? 0))
}

function joinRoster(st: SaveGame, cand: UnitInstance): Army {
  const army = st.army as Army
  const unit: UnitInstance = { ...cand, createdAt: Date.now(), isEnemy: false }
  delete unit.factionId
  delete unit.isBoss
  const squadIds = army.squadIds.length < SQUAD_SIZE ? [...army.squadIds, unit.id] : army.squadIds
  return { ...army, units: [...army.units, unit], squadIds }
}

/** Купить персонажа с витрины магазина за Вкусняшки. */
export function buyAction(index: number): { ok: boolean, error?: string, unit?: UnitInstance } {
  const s = $save.get()
  if (!s.army) return { ok: false, error: "нет армии" }
  if (freeSlots(s) === 0) return { ok: false, error: `Ростер полон (${BARRACKS_CAP})` }
  const cand = s.shelter.candidates[index]
  if (!cand) return { ok: false, error: "нет кандидата" }
  const cost = unitPrice(cand)
  if (s.profile.treats < cost) return { ok: false, error: "Недостаточно Вкусняшек" }
  updateSave(st => ({
    ...st,
    army: joinRoster(st, cand),
    shelter: { ...st.shelter, candidates: st.shelter.candidates.filter((_, i) => i !== index) },
    profile: { ...st.profile, treats: st.profile.treats - cost }
  }))
  return { ok: true, unit: cand }
}

/** Забрать бесплатного персонажа из награды за бой (остальные кандидаты уходят). */
export function claimRewardAction(index: number): { ok: boolean, error?: string, unit?: UnitInstance } {
  const s = $save.get()
  const cand = s.rewardChoice?.[index]
  if (!s.army || !cand) return { ok: false, error: "нет награды" }
  if (freeSlots(s) === 0) return { ok: false, error: `Ростер полон (${BARRACKS_CAP}) — отпустите кого-нибудь` }
  updateSave((st) => {
    const next: SaveGame = { ...st, army: joinRoster(st, cand) }
    delete next.rewardChoice
    return next
  })
  return { ok: true, unit: cand }
}

/** Отказаться от награды за бой. */
export function skipRewardAction(): void {
  updateSave((st) => {
    const next = { ...st }
    delete next.rewardChoice
    return next
  })
}

function replaceUnit(army: Army, unit: UnitInstance): Army {
  return { ...army, units: army.units.map(u => (u.id === unit.id ? unit : u)) }
}

export function setSquad(ids: string[]): void {
  updateSave(s => (s.army ? { ...s, army: { ...s.army, squadIds: ids.slice(0, SQUAD_SIZE) } } : s))
}

/**
 * Поставить бойца ростера в слот отряда (0…3). Если он уже в отряде — меняется местами с бойцом слота;
 * `null` — освободить слот. Порядок отряда — порядок клеток появления на карте.
 */
export function assignSquadSlot(slot: number, unitId: string | null): { ok: boolean, error?: string } {
  const s = $save.get()
  if (!s.army) return { ok: false, error: "нет армии" }
  if (slot < 0 || slot >= SQUAD_SIZE) return { ok: false, error: "нет такого слота" }
  const ids = s.army.squadIds.filter(id => s.army?.units.some(u => u.id === id))
  if (unitId === null) {
    if (slot < ids.length) ids.splice(slot, 1)
    setSquad(ids)
    return { ok: true }
  }
  if (!s.army.units.some(u => u.id === unitId)) return { ok: false, error: "нет бойца" }
  const cur = ids.indexOf(unitId)
  if (slot >= ids.length) {
    if (cur >= 0) return { ok: true }
    ids.push(unitId)
  }
  else if (cur >= 0) [ids[cur], ids[slot]] = [ids[slot] as string, unitId]
  else ids[slot] = unitId
  setSquad(ids)
  return { ok: true }
}

export function toggleSquad(unitId: string): { ok: boolean, error?: string } {
  const s = $save.get()
  if (!s.army) return { ok: false, error: "нет армии" }
  const inSquad = s.army.squadIds.includes(unitId)
  if (!inSquad && s.army.squadIds.length >= SQUAD_SIZE) return { ok: false, error: "Отряд полон" }
  setSquad(inSquad ? s.army.squadIds.filter(id => id !== unitId) : [...s.army.squadIds, unitId])
  return { ok: true }
}

export function trainUnitAction(unitId: string): { ok: boolean, error?: string } {
  const s = $save.get()
  const unit = s.army?.units.find(u => u.id === unitId)
  if (!s.army || !unit) return { ok: false, error: "нет бойца" }
  if (unit.level >= MAX_LEVEL) return { ok: false, error: "Максимальный уровень" }
  const cost = trainCost(unit.level)
  if (s.profile.treats < cost) return { ok: false, error: "Недостаточно Вкусняшек" }
  const { unit: next } = trainUnit(unit)
  updateSave(st => ({
    ...st,
    army: replaceUnit(st.army as Army, next),
    profile: { ...st.profile, treats: st.profile.treats - cost }
  }))
  return { ok: true }
}

export function learnSkillAction(unitId: string, skillId: string): { ok: boolean, error?: string } {
  const s = $save.get()
  const unit = s.army?.units.find(u => u.id === unitId)
  if (!s.army || !unit) return { ok: false, error: "нет бойца" }
  if (unit.sp < skillCost(skillId)) return { ok: false, error: "Недостаточно SP" }
  try {
    const next = learnSkill(unit, skillId)
    updateSave(st => ({ ...st, army: replaceUnit(st.army as Army, next) }))
    return { ok: true }
  }
  catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export function equipAction(
  unitId: string,
  slot: keyof UnitSkills,
  skillId: string | undefined
): { ok: boolean, error?: string } {
  const s = $save.get()
  const unit = s.army?.units.find(u => u.id === unitId)
  if (!s.army || !unit) return { ok: false, error: "нет бойца" }
  try {
    const next = equipSkill(unit, skillId, slot)
    updateSave(st => ({ ...st, army: replaceUnit(st.army as Army, next) }))
    return { ok: true }
  }
  catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** Смена класса FW: класс открыт на уровне бойца, божественный — только у одного бойца армии. */
export function reclassAction(unitId: string, classId: string): { ok: boolean, error?: string } {
  const s = $save.get()
  const unit = s.army?.units.find(u => u.id === unitId)
  if (!s.army || !unit) return { ok: false, error: "нет бойца" }
  if (!canTakeClassNow(unit, classId)) return { ok: false, error: "Класс ещё не открыт" }
  if (isUniqueClassId(classId) && s.army.units.some(u => u.id !== unitId && u.classId === classId)) {
    return { ok: false, error: "Божественный класс уже у другого бойца" }
  }
  const next = reclassUnit(unit, classId)
  updateSave(st => ({ ...st, army: replaceUnit(st.army as Army, next) }))
  return { ok: true }
}

/* ---------- Лавка и снаряжение ---------- */

/** Купить предмет из ассортимента Лавки в инвентарь армии. */
export function buyItemAction(itemId: string): { ok: boolean, error?: string } {
  const s = $save.get()
  if (!inStore(s.store, itemId)) return { ok: false, error: "Такого товара нет" }
  const price = itemPrice(itemId)
  if (s.profile.treats < price) return { ok: false, error: "Недостаточно Вкусняшек" }
  if (itemCount(s.inventory, itemId) >= ITEMS.stackCap) return { ok: false, error: "Больше не унести" }
  updateSave(st => ({
    ...st,
    inventory: addItem(st.inventory, itemId),
    profile: { ...st.profile, treats: st.profile.treats - price }
  }))
  return { ok: true }
}

/** Торговец показал новый ассортимент — снять «!» над ним. */
export function markStoreSeen(): void {
  if ($save.get().store.fresh) updateSave(st => ({ ...st, store: { ...st.store, fresh: false } }))
}

/**
 * Дать бойцу оружие: из инвентаря или бесплатное деревянное любого навыка. Прежнее купленное оружие возвращается
 * в инвентарь, деревянное просто откладывается.
 */
export function equipWeaponAction(unitId: string, weaponId: string): { ok: boolean, error?: string } {
  const s = $save.get()
  const unit = s.army?.units.find(u => u.id === unitId)
  if (!s.army || !unit) return { ok: false, error: "нет бойца" }
  if (itemCategory(weaponId) !== "weapon") return { ok: false, error: "Это не оружие" }
  if (unit.skills.weapon === weaponId) return { ok: true }
  if (!isWoodWeapon(weaponId) && itemCount(s.inventory, weaponId) < 1) return { ok: false, error: "Нет в инвентаре" }
  const next = equipWeapon(unit, weaponId)
  updateSave((st) => {
    let inventory = isWoodWeapon(weaponId) ? st.inventory : removeItem(st.inventory, weaponId)
    inventory = addItem(inventory, unit.skills.weapon)
    return { ...st, inventory, army: replaceUnit(st.army as Army, next) }
  })
  return { ok: true }
}

/** Надеть талисман из инвентаря (прежний возвращается) или снять (`undefined`). */
export function equipTalismanAction(unitId: string, talismanId: string | undefined): { ok: boolean, error?: string } {
  const s = $save.get()
  const unit = s.army?.units.find(u => u.id === unitId)
  if (!s.army || !unit) return { ok: false, error: "нет бойца" }
  if (talismanId && !isTalismanId(talismanId)) return { ok: false, error: "Это не талисман" }
  if (talismanId === unit.accessory) return { ok: true }
  if (talismanId && itemCount(s.inventory, talismanId) < 1) return { ok: false, error: "Нет в инвентаре" }
  const next: UnitInstance = { ...unit }
  if (talismanId) next.accessory = talismanId
  else delete next.accessory
  invalidateKit(unit)
  updateSave((st) => {
    let inventory = talismanId ? removeItem(st.inventory, talismanId) : st.inventory
    if (unit.accessory) inventory = addItem(inventory, unit.accessory)
    return { ...st, inventory, army: replaceUnit(st.army as Army, next) }
  })
  return { ok: true }
}

/** Рюкзак вылазки: расходники из инвентаря, всего не больше `ITEMS.packSize`. Списываются при старте боя. */
export function setPackAction(pack: Inventory): { ok: boolean, error?: string } {
  const s = $save.get()
  if (!s.pendingBattle) return { ok: false, error: "Сначала разведайте бой" }
  const clean: Inventory = {}
  for (const [id, n] of Object.entries(pack)) {
    if (n <= 0) continue
    if (!isConsumableId(id)) return { ok: false, error: "В рюкзак — только расходники" }
    if (itemCount(s.inventory, id) < n) return { ok: false, error: "Столько нет в инвентаре" }
    clean[id] = n
  }
  if (totalCount(clean) > ITEMS.packSize) return { ok: false, error: `В рюкзак влезает ${ITEMS.packSize}` }
  updateSave(st => (st.pendingBattle ? { ...st, pendingBattle: { ...st.pendingBattle, pack: clean } } : st))
  return { ok: true }
}

/* ---------- Деревня ---------- */

/** Запомнить, где стоит герой (сцена зовёт это при остановке и уходе, а не каждый кадр). */
export function setHeroPosition(pos: Pos, facing: Facing): void {
  const v = $save.get().village
  if (Math.abs(v.pos.x - pos.x) < 0.01 && Math.abs(v.pos.y - pos.y) < 0.01 && v.facing === facing) return
  updateSave(st => ({ ...st, village: { pos: { x: pos.x, y: pos.y }, facing } }))
}

export function sharpenAction(unitId: string): { ok: boolean, error?: string } {
  const s = $save.get()
  const unit = s.army?.units.find(u => u.id === unitId)
  if (!s.army || !unit) return { ok: false, error: "нет бойца" }
  const cost = sharpenCost(unit.weaponTier)
  if (cost === null) return { ok: false, error: "Оружие заточено до предела" }
  if (s.profile.treats < cost) return { ok: false, error: "Недостаточно Вкусняшек" }
  updateSave(st => ({
    ...st,
    army: replaceUnit(st.army as Army, sharpenWeapon(unit)),
    profile: { ...st.profile, treats: st.profile.treats - cost }
  }))
  return { ok: true }
}

export function releaseUnit(unitId: string): { ok: boolean, armyFell?: boolean } {
  const s = $save.get()
  const unit = s.army?.units.find(u => u.id === unitId)
  if (!s.army || !unit) return { ok: false }
  const now = Date.now()
  const remaining = s.army.units.filter(u => u.id !== unitId)
  updateSave((st) => {
    const next: SaveGame = {
      ...st,
      memorial: [...st.memorial, memorialEntry(unit, "released", now)],
      // Отпущенный оставляет купленное оружие и талисман
      inventory: addAll(st.inventory, unitGear(unit))
    }
    if (remaining.length === 0) {
      delete next.army
      next.stats = { ...st.stats, armiesLost: st.stats.armiesLost + 1 }
    }
    else next.army = { ...(st.army as Army), units: remaining, squadIds: (st.army as Army).squadIds.filter(id => id !== unitId) }
    return next
  })
  return { ok: true, armyFell: remaining.length === 0 }
}

/* ---------- Бой ---------- */

/**
 * Разведка: карта и враги боя на выбранной сложности и биоме. Уровень врагов — по уровню ростера (`rosterLevel`),
 * поэтому разведка не зависит от того, кого игрок возьмёт в отряд. Seed закреплён до начала боя: смена настроек
 * туда-обратно не перебрасывает врагов.
 */
export function scoutBattle(difficulty: Difficulty, biomeId: string | "random"): { ok: boolean, error?: string } {
  const s = $save.get()
  if (!s.army) return { ok: false, error: "нет армии" }
  if (!difficultyUnlocked(s, difficulty)) return { ok: false, error: "Сложность закрыта" }
  const pb = s.pendingBattle
  if (pb && pb.difficulty === difficulty && pb.biomeId === biomeId) return { ok: true }
  const pack = pb?.pack
  const seed = pb?.seed ?? randomSeed()
  const map = generateMap({
    seed,
    biomeId,
    difficulty,
    squadAvgLevel: rosterLevel(s.army),
    squadSize: SQUAD_SIZE,
    unlockedBiomes: $unlockedBiomes.get(),
    now: Date.now()
  })
  updateSave(st => ({ ...st, pendingBattle: { seed, difficulty, biomeId, map, ...(pack ? { pack } : {}) } }))
  return { ok: true }
}

/** Начать разведанный бой выбранным отрядом (1–4 бойца ростера). */
export function startBattle(squadIds: string[]): { ok: boolean, error?: string, events?: BattleEvent[] } {
  const s = $save.get()
  if (!s.army) return { ok: false, error: "нет армии" }
  if (s.battle && !s.battle.result) return { ok: false, error: "бой уже идёт" }
  const pb = s.pendingBattle
  if (!pb) return { ok: false, error: "Сначала разведайте бой" }
  const squad = squadIds.map(id => s.army?.units.find(u => u.id === id)).filter((u): u is UnitInstance => !!u)
  if (squad.length === 0) return { ok: false, error: "Пустой отряд" }
  if (squad.length > SQUAD_SIZE) return { ok: false, error: `В отряде не больше ${SQUAD_SIZE}` }
  // Рюкзак списывается из инвентаря (то, чего уже нет, не берётся); остаток вернётся после боя
  const pack: Inventory = {}
  for (const [id, n] of Object.entries(pb.pack ?? {})) {
    const take = Math.min(n, itemCount(s.inventory, id))
    if (take > 0) pack[id] = take
  }
  const { state, events } = createBattle({
    map: pb.map,
    squad,
    seed: createRng(pb.seed).fork("battle").seed,
    now: Date.now(),
    pack
  })
  updateSave((st) => {
    let inventory = st.inventory
    for (const [id, n] of Object.entries(pack)) inventory = removeItem(inventory, id, n)
    const next: SaveGame = {
      ...st,
      inventory,
      battle: state,
      army: st.army ? { ...st.army, squadIds: squad.map(u => u.id) } : st.army
    }
    delete next.pendingBattle
    return next
  })
  return { ok: true, events }
}

export function dispatchBattle(action: BattleAction): { state: BattleState, events: BattleEvent[] } {
  const s = $save.get()
  if (!s.battle) throw new Error("нет боя")
  const { state, events } = applyAction(s.battle, action)
  updateSave(st => ({ ...st, battle: state }))
  return { state, events }
}

/** Сдаться из меню: отступление + подведение итогов. */
export function surrenderFromMenu(): BattleSummary | null {
  const s = $save.get()
  if (!s.battle) return s.lastBattle ?? null
  if (!s.battle.result) dispatchBattle({ type: "retreat" })
  return finishBattle()
}

/** Завершить бой: применить итоги к армии/профилю, убрать battle, записать lastBattle. */
export function finishBattle(): BattleSummary | null {
  const s = $save.get()
  if (!s.battle) return s.lastBattle ?? null
  const state = s.battle
  const now = Date.now()
  const res = resolveBattle(s, state, now)
  updateSave((st) => {
    const next: SaveGame = {
      ...st,
      profile: res.profile,
      memorial: res.memorial,
      shelter: res.shelter,
      inventory: res.inventory,
      store: res.store,
      // После боя герой возвращается в деревню через ворота
      village: { pos: { ...HERO_RETURN }, facing: "down" },
      lastBattle: res.summary,
      stats: {
        ...st.stats,
        battles: st.stats.battles + 1,
        wins: st.stats.wins + (res.summary.result === "victory" ? 1 : 0),
        kills: st.stats.kills + res.summary.kills,
        deaths: st.stats.deaths + res.summary.fallen.length,
        armiesLost: st.stats.armiesLost + (res.summary.armyFell ? 1 : 0)
      }
    }
    delete next.battle
    if (res.army) next.army = res.army
    else delete next.army
    if (res.rewardChoice) next.rewardChoice = res.rewardChoice
    else delete next.rewardChoice
    return next
  })
  return res.summary
}

/* ---------- Настройки ---------- */

export function updateSettings(patch: Partial<Settings>): void {
  updateSave(s => ({ ...s, settings: { ...s.settings, ...patch } }))
  if (patch.haptics !== undefined) setHapticsEnabled(patch.haptics)
}

export function resetProgress(): void {
  persistEnabled = false
  clearLocal()
  $save.set(createEmptySave(Date.now()))
  persistEnabled = true
  flushPersist()
}

export function exportSaveCode(): string {
  return btoa(unescape(encodeURIComponent(serializeSave($save.get()))))
}

export function importSaveCode(code: string): { ok: boolean, error?: string } {
  try {
    const json = decodeURIComponent(escape(atob(code.trim())))
    const r = parseSave(json)
    if (!r.ok) return { ok: false, error: r.error }
    $save.set(r.save)
    flushPersist()
    return { ok: true }
  }
  catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
