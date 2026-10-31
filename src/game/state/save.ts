import { recordEvent } from "@game/core/story/facts"
import { drinkForBattle } from "@game/core/settlement/tavern"
import { atom, computed } from "nanostores"
import type {
  Army,
  BattleMode,
  MapDef,
  Rarity,
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
import { MAX_LEVEL, SQUAD_SIZE } from "@game/core/types"
import { createEmptySave, parseSave, serializeSave } from "@game/core/save"
import { createRng, randomSeed } from "@game/core/rng"
import {
  canRebirth,
  canTakeClassNow,
  generateRoster,
  isUniqueClassId,
  learnSkill,
  equipSkill,
  equipWeapon,
  rebirthUnit,
  reclassUnit,
  skillCost
} from "@game/core/units"
import {
  addAll,
  addItem,
  inStore,
  isWoodWeapon,
  itemCategory,
  itemCount,
  removeItem,
  unitGear
} from "@game/core/items"
import {
  applySortieTraining,
  freeRosterSlots,
  isBuilt,
  isTraining,
  pruneTraining,
  rerollStore,
  rosterCapacity,
  settleStore,
  storePrice,
  storeRerollCost
} from "@game/core/settlement"
import { isTalismanId } from "@game/content/items"
import { HERO_RETURN } from "@game/content/settlement"
import { ENEMY_TEAMS, ITEMS, REWARDS } from "@game/content/balance"
import { generateMap } from "@game/core/map/generate"
import { generateExpedition } from "@game/core/map/expedition"
import { applyAction, createBattle } from "@game/core/battle/reducer"
import {
  generateShop,
  reinforcements,
  withRecruits,
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
import { clearLocal, loadLocal, localKey, saveLocal } from "@game/platform/storage"
import { setHapticsEnabled } from "@game/platform/haptics"
import { setLang, tr } from "@game/i18n"

/* ---------- Сторы ---------- */

export const $save = atom<SaveGame>(createEmptySave(Date.now()))
export const $saveStatus = atom<"loading" | "ready" | "error">("loading")
export const $saveError = atom<string | null>(null)
/** Локальный сейв записан более новой версией игры: игра не стартует и ничего не перезаписывает (ни локально, ни в облаке). */
export const $saveNewer = atom(false)

// Язык интерфейса следует за сейвом: загрузка, импорт, сброс, облако и настройки меняют его одинаково
$save.subscribe(s => setLang(s.settings.lang))

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
  if (localTimer) clearTimeout(localTimer)
  // Сериализуем уже в таймере: серия действий подряд (ход врагов на большой карте) пишет сейв один раз
  localTimer = setTimeout(() => {
    localTimer = null
    saveLocal(serializeSave(save))
  }, 100)
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

/** Ключ резервной копии нечитаемого сейва — рядом с сейвом, но не под префиксом `pawfield:save:`. */
function backupKey(): string {
  return localKey().replace(/^pawfield:save:/, "pawfield:backup:")
}

/**
 * Сохранить сырой нечитаемый сейв перед тем, как его заменит новая игра: из копии его можно вернуть
 * (`exportBackupCode` → импорт в версии, которая его прочтёт). Хранится одна, последняя копия.
 */
export function backupRawSave(json: string): void {
  try {
    localStorage.setItem(backupKey(), json)
  }
  catch {
    /* quota or private mode */
  }
}

/** Код резервной копии нечитаемого сейва для импорта (как `exportSaveCode`); null — копии нет. */
export function exportBackupCode(): string | null {
  let json: string | null = null
  try {
    json = localStorage.getItem(backupKey())
  }
  catch {
    return null
  }
  return json ? btoa(unescape(encodeURIComponent(json))) : null
}

/**
 * Загрузить сейв из localStorage. Повреждённый заменяется новым, но сначала копируется в резерв (`backupRawSave`),
 * а причина — в `$saveError`. Сейв более новой версии игры не трогается: статус «error», `$saveNewer`, запись
 * выключена. Повторный вызов ничего не делает.
 */
export function initSave(): void {
  if ($saveStatus.get() === "ready") return
  const localJson = loadLocal()
  let local: SaveGame | null = null
  if (localJson) {
    const r = parseSave(localJson)
    if (r.ok) local = r.save
    else if (r.newer) {
      $saveError.set(r.error)
      $saveNewer.set(true)
      $saveStatus.set("error")
      return
    }
    else {
      backupRawSave(localJson)
      $saveError.set(`${r.error} (${tr("a copy is kept", "копия сохранена")})`)
    }
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
 * первые 4 — в отряде. Если армия есть, но бойцов в ней меньше, чем мест в отряде, — недостающие приходят сами
 * под нехватку ролей (`reinforcements`), так выручаются и сейвы, застрявшие до этого правила. Заодно заполняет
 * пустую витрину магазина.
 */
export function ensureRoster(): void {
  ensureStore()
  const s = $save.get()
  if (s.army && s.army.units.length > 0) {
    if (s.army.units.length < SQUAD_SIZE) {
      const recruits = reinforcements(randomSeed(), s.army, s.profile, Date.now())
      if (recruits.length > 0) updateSave(st => (st.army ? { ...st, army: withRecruits(st.army, recruits) } : st))
    }
    if ($save.get().shelter.candidates.length === 0)
      updateSave(st => ({ ...st, shelter: generateShop(randomSeed(), st.army, st.profile, Date.now()) }))
    return
  }
  const now = Date.now()
  const units = generateRoster({ seed: randomSeed(), glory: s.profile.glory, maxRarity: s.profile.maxRarity, now }).map(u => ({ ...u, createdAt: now }))
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
      shelter: generateShop(randomSeed(), army, st.profile, now),
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

/** Выложить витрину Лавки, если её период прошёл или её ещё нет (Лавка должна быть построена). */
export function ensureStore(now = Date.now()): void {
  const s = $save.get()
  const next = settleStore(s, now)
  if (next !== s) updateSave(() => next)
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

/** Свободные места в ростере: вместимость — по уровню Казарм. */
export function freeSlots(save: SaveGame): number {
  return freeRosterSlots(save)
}

function rosterFullError(save: SaveGame): string {
  const cap = rosterCapacity(save)
  return tr(`Roster full (${cap}) — upgrade the Barracks or release someone`, `Ростер полон (${cap}) — улучшите Казармы или отпустите кого-нибудь`)
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
  if (!s.army) return { ok: false, error: tr("No army", "нет армии") }
  if (freeSlots(s) === 0) return { ok: false, error: rosterFullError(s) }
  const cand = s.shelter.candidates[index]
  if (!cand) return { ok: false, error: tr("No recruit", "нет кандидата") }
  const cost = unitPrice(cand)
  if (s.profile.treats < cost) return { ok: false, error: tr("Not enough Treats", "Недостаточно Вкусняшек") }
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
  if (!s.army || !cand) return { ok: false, error: tr("No reward", "нет награды") }
  if (freeSlots(s) === 0) return { ok: false, error: rosterFullError(s) }
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

const trainingError = () => tr("Training at the Training Ground — collect them first", "Тренируется на полигоне — сначала заберите")

export function setSquad(ids: string[]): void {
  updateSave(s => (s.army ? { ...s, army: { ...s.army, squadIds: ids.slice(0, SQUAD_SIZE) } } : s))
}

/**
 * Поставить бойца ростера в слот отряда (0…3). Если он уже в отряде — меняется местами с бойцом слота;
 * `null` — освободить слот. Порядок отряда — порядок клеток появления на карте.
 */
export function assignSquadSlot(slot: number, unitId: string | null): { ok: boolean, error?: string } {
  const s = $save.get()
  if (!s.army) return { ok: false, error: tr("No army", "нет армии") }
  if (slot < 0 || slot >= SQUAD_SIZE) return { ok: false, error: tr("No such slot", "нет такого слота") }
  const ids = s.army.squadIds.filter(id => s.army?.units.some(u => u.id === id))
  if (unitId === null) {
    if (slot < ids.length) ids.splice(slot, 1)
    setSquad(ids)
    return { ok: true }
  }
  if (!s.army.units.some(u => u.id === unitId)) return { ok: false, error: tr("No such fighter", "нет бойца") }
  if (isTraining(s, unitId)) return { ok: false, error: trainingError() }
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
  if (!s.army) return { ok: false, error: tr("No army", "нет армии") }
  const inSquad = s.army.squadIds.includes(unitId)
  if (!inSquad && isTraining(s, unitId)) return { ok: false, error: trainingError() }
  if (!inSquad && s.army.squadIds.length >= SQUAD_SIZE) return { ok: false, error: tr("Squad is full", "Отряд полон") }
  setSquad(inSquad ? s.army.squadIds.filter(id => id !== unitId) : [...s.army.squadIds, unitId])
  return { ok: true }
}

export function trainUnitAction(unitId: string): { ok: boolean, error?: string } {
  const s = $save.get()
  const unit = s.army?.units.find(u => u.id === unitId)
  if (!s.army || !unit) return { ok: false, error: tr("No such fighter", "нет бойца") }
  if (unit.level >= MAX_LEVEL) return { ok: false, error: tr("Max level", "Максимальный уровень") }
  const cost = trainCost(unit.level)
  if (s.profile.treats < cost) return { ok: false, error: tr("Not enough Treats", "Недостаточно Вкусняшек") }
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
  if (!s.army || !unit) return { ok: false, error: tr("No such fighter", "нет бойца") }
  if (unit.sp < skillCost(skillId)) return { ok: false, error: tr("Not enough SP", "Недостаточно SP") }
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
  if (!s.army || !unit) return { ok: false, error: tr("No such fighter", "нет бойца") }
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
  if (!s.army || !unit) return { ok: false, error: tr("No such fighter", "нет бойца") }
  if (!canTakeClassNow(unit, classId)) return { ok: false, error: tr("Class not unlocked yet", "Класс ещё не открыт") }
  if (isUniqueClassId(classId) && s.army.units.some(u => u.id !== unitId && u.classId === classId)) {
    return { ok: false, error: tr("Another fighter already has this divine class", "Божественный класс уже у другого бойца") }
  }
  const next = reclassUnit(unit, classId)
  updateSave(st => ({ ...st, army: replaceUnit(st.army as Army, next) }))
  return { ok: true }
}

/**
 * Переродить бойца 80-го уровня: 1-й уровень и +★. Новая звезда, если её ещё не было, открывается для случайных
 * бойцов (стартовый ростер, магазин, награды) — `unlocked` сообщает об этом экрану.
 */
export function rebirthAction(unitId: string): { ok: boolean, error?: string, unlocked?: Rarity } {
  const s = $save.get()
  const unit = s.army?.units.find(u => u.id === unitId)
  if (!s.army || !unit) return { ok: false, error: tr("No such fighter", "нет бойца") }
  if (!canRebirth(unit)) return { ok: false, error: tr(`Rebirth needs level ${MAX_LEVEL}`, `Перерождение — с ${MAX_LEVEL} уровня`) }
  const next = rebirthUnit(unit)
  const unlocked = next.rarity > s.profile.maxRarity ? next.rarity : undefined
  updateSave(st => ({
    ...st,
    army: replaceUnit(st.army as Army, next),
    profile: unlocked ? { ...st.profile, maxRarity: unlocked } : st.profile
  }))
  return unlocked ? { ok: true, unlocked } : { ok: true }
}

/* ---------- Лавка и снаряжение ---------- */

/**
 * Купить предмет из ассортимента Лавки в инвентарь армии по цене со скидкой Лавки. `period` — витрина, которую видел
 * игрок: если она успела смениться, покупка не проходит (новая витрина выкладывается, игрок решает заново).
 * Списание и выдача — одним обновлением сейва.
 */
export function buyItemAction(itemId: string, period?: number, now = Date.now()): { ok: boolean, error?: string, restocked?: boolean } {
  const before = $save.get()
  if (!isBuilt(before, "store")) return { ok: false, error: tr("Build the Trading Post first", "Сначала постройте Лавку") }
  const s = settleStore(before, now)
  if (s !== before) updateSave(() => s)
  if (period !== undefined && s.store.period !== period)
    return { ok: false, restocked: true, error: tr("The stock has just changed — take a look at the new goods", "Ассортимент только что сменился — взгляните на новые товары") }
  if (!inStore(s.store, itemId)) return { ok: false, error: tr("This item is no longer in stock", "Этого товара больше нет") }
  const price = storePrice(s, itemId)
  if (s.profile.treats < price) return { ok: false, error: tr("Not enough Treats", "Недостаточно Вкусняшек") }
  if (itemCount(s.inventory, itemId) >= ITEMS.stackCap) return { ok: false, error: tr("Can’t carry any more", "Больше не унести") }
  updateSave(st => ({
    ...st,
    inventory: addItem(st.inventory, itemId),
    profile: { ...st.profile, treats: st.profile.treats - price }
  }))
  return { ok: true }
}

/**
 * Обновить витрину Лавки за Вкусняшки. `period` — период витрины, которую видит игрок: если она успела смениться
 * по времени, обновление отклоняется (новый товар и так привезли), Вкусняшки не списываются.
 */
export function rerollStoreAction(period?: number, now = Date.now()): { ok: boolean, error?: string, restocked?: boolean } {
  const before = $save.get()
  if (!isBuilt(before, "store")) return { ok: false, error: tr("Build the Trading Post first", "Сначала постройте Лавку") }
  const s = settleStore(before, now)
  if (s !== before) updateSave(() => s)
  if (period !== undefined && s.store.period !== period)
    return { ok: false, restocked: true, error: tr("The stock has just changed — take a look at the new goods", "Ассортимент только что сменился — взгляните на новые товары") }
  if (s.profile.treats < storeRerollCost(s)) return { ok: false, error: tr("Not enough Treats", "Недостаточно Вкусняшек") }
  updateSave(st => rerollStore(st, now))
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
  if (!s.army || !unit) return { ok: false, error: tr("No such fighter", "нет бойца") }
  if (itemCategory(weaponId) !== "weapon") return { ok: false, error: tr("Not a weapon", "Это не оружие") }
  if (unit.skills.weapon === weaponId) return { ok: true }
  if (!isWoodWeapon(weaponId) && itemCount(s.inventory, weaponId) < 1) return { ok: false, error: tr("Not in inventory", "Нет в инвентаре") }
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
  if (!s.army || !unit) return { ok: false, error: tr("No such fighter", "нет бойца") }
  if (talismanId && !isTalismanId(talismanId)) return { ok: false, error: tr("Not a talisman", "Это не талисман") }
  if (talismanId === unit.accessory) return { ok: true }
  if (talismanId && itemCount(s.inventory, talismanId) < 1) return { ok: false, error: tr("Not in inventory", "Нет в инвентаре") }
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

export function sharpenAction(unitId: string): { ok: boolean, error?: string } {
  const s = $save.get()
  const unit = s.army?.units.find(u => u.id === unitId)
  if (!s.army || !unit) return { ok: false, error: tr("No such fighter", "нет бойца") }
  const cost = sharpenCost(unit.weaponTier)
  if (cost === null) return { ok: false, error: tr("Weapon is fully sharpened", "Оружие заточено до предела") }
  if (s.profile.treats < cost) return { ok: false, error: tr("Not enough Treats", "Недостаточно Вкусняшек") }
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
    // Отпущенный уходит и с полигона
    return pruneTraining(next)
  })
  return { ok: true, armyFell: remaining.length === 0 }
}

/* ---------- Бой ---------- */

/** Вражеская команда вылазки: карта с врагами, их реальные уровни и награда за победу. */
export interface EnemyTeamOffer {
  team: number
  seed: number
  map: MapDef
  /** Минимальный и максимальный уровень героев команды (с подкреплениями). */
  levels: [number, number]
  /** Сколько врагов на поле и в подкреплениях. */
  count: number
  reinforcements: number
  /** Вкусняшки за победу (без выбитого из врагов) и Слава. */
  treats: number
  glory: number
  /** Опыт против этой команды для армии: меньше (армия выше), обычный, больше (армия ниже). */
  xp: "less" | "normal" | "more"
}

const offerCache = new Map<string, EnemyTeamOffer[]>()

/** Зерно команд вылазки: создаётся при первом заходе и держится до конца следующего боя. */
export function ensureSortieSeed(): number {
  const s = $save.get()
  if (s.sortieSeed !== undefined) return s.sortieSeed
  const seed = randomSeed()
  updateSave(st => ({ ...st, sortieSeed: seed }))
  return seed
}

/** Режим, выбранный на первом шаге вылазки: обычная схватка или вылазка в мрачную чащу. */
export const $sortieMode = atom<BattleMode>("skirmish")

/**
 * Четыре вражеские команды на сложности: уровни — окна диапазона сложности (`teamLevels`), не уровень армии;
 * биом у каждой случайный из всех (в чаще — мрачный лес). Детерминированы по `sortieSeed`: переключение
 * сложности и режима туда-обратно не перебрасывает врагов.
 */
export function enemyTeams(difficulty: Difficulty, mode: BattleMode = "skirmish"): EnemyTeamOffer[] {
  const s = $save.get()
  const sortie = s.sortieSeed ?? ensureSortieSeed()
  const armyLevel = rosterLevel(s.army)
  const key = `${sortie}:${difficulty}:${mode}:${armyLevel}`
  const cached = offerCache.get(key)
  if (cached) return cached
  const offers = Array.from({ length: ENEMY_TEAMS }, (_, team): EnemyTeamOffer => {
    const seed = createRng(sortie).fork(`${difficulty}:${team}${mode === "expedition" ? ":expedition" : ""}`).int(0, 0x7fffffff)
    const map = mode === "expedition"
      ? generateExpedition({ seed, difficulty, team, squadSize: SQUAD_SIZE, now: Date.now() })
      : generateMap({ seed, biomeId: "random", difficulty, team, squadSize: SQUAD_SIZE, now: Date.now() })
    const units = [...map.enemies.map(e => e.unit), ...map.reinforcements.flatMap(w => w.units.map(u => u.unit))]
    const lv = units.map(u => u.level)
    const levels: [number, number] = [Math.min(...lv), Math.max(...lv)]
    return {
      team,
      seed,
      map,
      levels,
      count: units.length,
      reinforcements: units.length - map.enemies.length,
      treats: Math.round(map.rewards.treats * REWARDS.victoryShare),
      glory: map.rewards.glory,
      xp: armyLevel > levels[1] ? "less" : armyLevel < levels[0] ? "more" : "normal"
    }
  })
  offerCache.clear()
  offerCache.set(key, offers)
  return offers
}

/**
 * Разведка: выбранная вражеская команда на сложности становится боем; отряд выбирается на следующем шаге.
 * Карта та же, что в предложении команды (тот же seed и случайный биом).
 */
export function scoutBattle(difficulty: Difficulty, team = 0, mode: BattleMode = "skirmish"): { ok: boolean, error?: string } {
  const s = $save.get()
  if (!s.army) return { ok: false, error: tr("No army", "нет армии") }
  if (!difficultyUnlocked(s, difficulty)) return { ok: false, error: tr("Difficulty locked", "Сложность закрыта") }
  const pb = s.pendingBattle
  if (pb && pb.difficulty === difficulty && pb.team === team && (pb.map.mode ?? "skirmish") === mode) return { ok: true }
  const offer = enemyTeams(difficulty, mode)[team]
  if (!offer) return { ok: false, error: tr("No such enemy army", "Нет такой армии врагов") }
  updateSave(st => ({ ...st, pendingBattle: { seed: offer.seed, difficulty, biomeId: offer.map.biomeId, team, map: offer.map } }))
  return { ok: true }
}

/** Начать разведанный бой выбранным отрядом (1–4 бойца ростера). */
export function startBattle(squadIds: string[]): { ok: boolean, error?: string, events?: BattleEvent[] } {
  const s = $save.get()
  if (!s.army) return { ok: false, error: tr("No army", "нет армии") }
  if (s.battle && !s.battle.result) return { ok: false, error: tr("Battle already in progress", "бой уже идёт") }
  const pb = s.pendingBattle
  if (!pb) return { ok: false, error: tr("Scout a battle first", "Сначала разведайте бой") }
  const squad = squadIds.map(id => s.army?.units.find(u => u.id === id)).filter((u): u is UnitInstance => !!u)
  if (squad.length === 0) return { ok: false, error: tr("Squad is empty", "Пустой отряд") }
  if (squad.length > SQUAD_SIZE) return { ok: false, error: tr(`Squad holds at most ${SQUAD_SIZE}`, `В отряде не больше ${SQUAD_SIZE}`) }
  if (squad.some(u => isTraining(s, u.id))) return { ok: false, error: trainingError() }
  const { state, events } = createBattle({
    map: pb.map,
    squad,
    seed: createRng(pb.seed).fork("battle").seed,
    now: Date.now(),
    drink: drinkForBattle(s.settlement.drink)
  })
  updateSave((st) => {
    const next: SaveGame = {
      ...st,
      battle: state,
      army: st.army ? { ...st.army, squadIds: squad.map(u => u.id) } : st.army
    }
    delete next.pendingBattle
    // Кружка из бара выпита: она на одну вылазку
    let out = recordEvent(next, { type: "sortieStarted", mode: pb.map.mode ?? "skirmish", difficulty: pb.difficulty })
    if (next.settlement.drink) {
      out = recordEvent(out, { type: "drinkDrunk", drinkId: next.settlement.drink.id })
      const settlement = { ...out.settlement }
      delete settlement.drink
      out = { ...out, settlement }
    }
    return out
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
  let summary = res.summary
  updateSave((st) => {
    const next: SaveGame = {
      ...st,
      profile: res.profile,
      memorial: res.memorial,
      shelter: res.shelter,
      inventory: res.inventory,
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
    // Новый бой — новые вражеские команды
    delete next.sortieSeed
    if (res.army) next.army = res.army
    else delete next.army
    if (res.rewardChoice) next.rewardChoice = res.rewardChoice
    else delete next.rewardChoice
    // После боя герой возвращается в поселение через ворота
    next.settlement = { ...next.settlement, hero: { pos: { ...HERO_RETURN }, facing: "up" } }
    // Цена обновления витрины Лавки сбрасывается после каждой вылазки
    next.store = { ...next.store, rerolls: 0 }
    // Павшие уходят с полигона; тренирующиеся получают опыт за вылазку (за этот бой — один раз)
    const trained = applySortieTraining(pruneTraining(next), state.id, now)
    // Повышения уровня на полигоне — в итоги вылазки рядом с боевыми
    if (trained.levelUps.length > 0) summary = { ...res.summary, levelUps: [...res.summary.levelUps, ...trained.levelUps] }
    return recordEvent({ ...trained.save, lastBattle: summary }, {
      type: "sortieFinished",
      mode: state.map.mode ?? "skirmish",
      difficulty: state.difficulty,
      result: res.summary.result,
      kills: res.summary.kills,
      fallen: res.summary.fallen.length
    })
  })
  return summary
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
    // Импорт — свежее изменение: иначе более новый сейв другого устройства выиграл бы конфликт с облаком
    $save.set({ ...r.save, updatedAt: Date.now() })
    setHapticsEnabled(r.save.settings.haptics)
    flushPersist()
    return { ok: true }
  }
  catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
