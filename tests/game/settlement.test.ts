import { beforeEach, describe, expect, it } from "vitest"
import {
  $save,
  buyAction,
  buyItemAction,
  claimRewardAction,
  dispatchBattle,
  ensureRoster,
  finishBattle,
  newGame,
  releaseUnit,
  scoutBattle,
  startBattle,
  toggleSquad
} from "@game/state/save"
import {
  buildAction,
  collectAction,
  placeAlerts,
  reviveAction,
  tickSettlement,
  trainAction,
  upgradeAction
} from "@game/state/settlement"
import {
  STORE_PERIOD_MS,
  applySortieTraining,
  barracksLevelFor,
  buildingLevel,
  canRevive,
  freeRosterSlots,
  gameDay,
  nextDayStart,
  nextStoreRefresh,
  plotStatuses,
  reviveStatus,
  rosterCapacity,
  settleStore,
  settleTraining,
  storePeriod,
  storePrice,
  trainingCapacity
} from "@game/core/settlement"
import { SAVE_VERSION, createEmptySave, parseSave, serializeSave } from "@game/core/save"
import { itemPrice } from "@game/core/items"
import { memorialEntry } from "@game/core/progression"
import { generateRoster } from "@game/core/units"
import { XP } from "@game/content/balance"
import { BARRACKS, BUILDINGS, GAME_DAY, STORE, TRAINING, atLevel } from "@game/content/settlement"
import { weaponDef } from "@game/content/weapons"
import { MAX_LEVEL, type BuildingId, type SaveGame, type UnitInstance } from "@game/core/types"

const HOUR = 3_600_000
/** Начало игрового дня — удобная точка отсчёта для тестов времени. */
const T0 = nextDayStart(Date.UTC(2026, 9, 1))

function freshGame(treats = 100_000): void {
  const save = createEmptySave(T0)
  save.profile.treats = treats
  save.profile.startedAt = T0
  $save.set(save)
  ensureRoster()
}

const s = (): SaveGame => $save.get()
const units = (): UnitInstance[] => s().army!.units
const unit = (id: string): UnitInstance => units().find(u => u.id === id)!

function setLevel(id: BuildingId, level: number): void {
  $save.set({ ...s(), settlement: { ...s().settlement, buildings: { ...s().settlement.buildings, [id]: { level, builtAt: T0 } } } })
}

function setTreats(treats: number): void {
  $save.set({ ...s(), profile: { ...s().profile, treats } })
}

/** Похоронить бойца ростера, как после боя. */
function kill(id: string, at = T0): string {
  const u = unit(id)
  const entry = memorialEntry(u, "killed", at)
  const army = s().army!
  $save.set({
    ...s(),
    army: { ...army, units: army.units.filter(x => x.id !== id), squadIds: army.squadIds.filter(x => x !== id) },
    memorial: [...s().memorial, entry]
  })
  return entry.id
}

describe("поселение: начальное состояние и места", () => {
  beforeEach(() => freshGame())

  it("в новой игре построены только Казармы 1-го уровня, стартовый ростер — в Казармах", () => {
    newGame()
    expect(s().settlement.buildings).toEqual({ barracks: { level: 1, builtAt: expect.any(Number) } })
    expect(units().length).toBeGreaterThan(0)
    expect(units().length).toBeLessThanOrEqual(rosterCapacity(s()))
  })

  it("стартовый ростер помещается в Казармы 1-го уровня при любой Славе", () => {
    for (const glory of [0, 25, 75, 300, 600])
      expect(generateRoster({ seed: glory + 1, glory, maxRarity: 5 }).length).toBeLessThanOrEqual(BARRACKS.capacity[0])
  })

  it("состояния мест: занято, можно строить, свободно (нет денег)", () => {
    setTreats(0)
    const st = plotStatuses(s())
    expect(st["plot-barracks"]).toBe("occupied")
    expect(st["plot-training"]).toBe("free")
    expect(st["plot-tavern"]).toBe("free")
    setTreats(100_000)
    expect(plotStatuses(s())["plot-training"]).toBe("available")
  })

  it("постройка: списывает цену, здание 1-го уровня; на занятом месте и без денег — отказ без изменений", () => {
    const before = s().profile.treats
    expect(buildAction("training", T0).ok).toBe(true)
    expect(buildingLevel(s(), "training")).toBe(1)
    expect(s().profile.treats).toBe(before - BUILDINGS.training.cost[0])
    const again = buildAction("training", T0)
    expect(again.ok).toBe(false)
    expect(buildAction("barracks", T0).ok).toBe(false)
    setTreats(BUILDINGS.store.cost[0] - 1)
    const snapshot = s()
    const poor = buildAction("store", T0)
    expect(poor.ok).toBe(false)
    if (!poor.ok) expect(poor.error).toMatch(/Treats|Вкусняшек/)
    expect(s()).toBe(snapshot)
  })

  it("улучшение до 5-го уровня, выше — нельзя; без денег ресурсы не списываются", () => {
    for (let lv = 2; lv <= 5; lv++) {
      expect(upgradeAction("barracks", T0).ok).toBe(true)
      expect(buildingLevel(s(), "barracks")).toBe(lv)
      expect(rosterCapacity(s())).toBe(atLevel(BARRACKS.capacity, lv))
    }
    const treats = s().profile.treats
    expect(upgradeAction("barracks", T0).ok).toBe(false)
    expect(s().profile.treats).toBe(treats)
    expect(upgradeAction("graveyard", T0).ok).toBe(false)
    buildAction("graveyard", T0)
    setTreats(0)
    expect(upgradeAction("graveyard", T0).ok).toBe(false)
    expect(buildingLevel(s(), "graveyard")).toBe(1)
    expect(s().profile.treats).toBe(0)
  })

  it("здания и уровни переживают перезапуск (сериализация сейва)", () => {
    buildAction("store", T0)
    upgradeAction("store", T0)
    const r = parseSave(serializeSave(s()))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.save.settlement.buildings.store?.level).toBe(2)
  })
})

describe("Казармы", () => {
  beforeEach(() => freshGame())

  it("вместимость по уровню: при полном ростере набор и награда отклоняются, улучшение сразу даёт места", () => {
    const filler = Array.from({ length: rosterCapacity(s()) - units().length }, (_, i) => ({ ...units()[0]!, id: `f${i}` }))
    $save.set({ ...s(), army: { ...s().army!, units: [...units(), ...filler] } })
    expect(freeRosterSlots(s())).toBe(0)
    expect(buyAction(0).ok).toBe(false)
    $save.set({ ...s(), rewardChoice: s().shelter.candidates.slice(0, 1) })
    expect(claimRewardAction(0).ok).toBe(false)
    const count = units().length
    expect(upgradeAction("barracks", T0).ok).toBe(true)
    expect(units().length).toBe(count)
    expect(freeRosterSlots(s())).toBe(BARRACKS.capacity[1] - BARRACKS.capacity[0])
    expect(buyAction(0).ok).toBe(true)
  })

  it("тренирующиеся занимают места, павшие — нет", () => {
    buildAction("training", T0)
    const free = freeRosterSlots(s())
    trainAction(units()[0]!.id, T0)
    expect(freeRosterSlots(s())).toBe(free)
    kill(units()[1]!.id)
    expect(freeRosterSlots(s())).toBe(free + 1)
  })
})

describe("тренировочный полигон", () => {
  beforeEach(() => {
    freshGame()
    buildAction("training", T0)
  })

  it("1-й уровень — один боец, 5-й — восемь; повторно и сверх мест — нельзя", () => {
    const [a, b] = units()
    expect(trainingCapacity(s())).toBe(1)
    expect(trainAction(a!.id, T0).ok).toBe(true)
    expect(trainAction(a!.id, T0).ok).toBe(false)
    expect(trainAction(b!.id, T0).ok).toBe(false)
    setLevel("training", 5)
    expect(trainingCapacity(s())).toBe(8)
    expect(TRAINING.capacity[0]).toBe(1)
    expect(TRAINING.capacity[4]).toBe(8)
  })

  it("без полигона, павшего и чужого не отправить", () => {
    const id = units()[0]!.id
    const dead = kill(units()[1]!.id)
    expect(trainAction(s().memorial.find(m => m.id === dead)!.unit.id, T0).ok).toBe(false)
    expect(trainAction("nobody", T0).ok).toBe(false)
    $save.set({ ...s(), settlement: { ...s().settlement, buildings: { barracks: { level: 1, builtAt: T0 } } } })
    expect(trainAction(id, T0).ok).toBe(false)
  })

  it("тренирующийся уходит из отряда и не идёт в бой, но остаётся в ростере", () => {
    const id = s().army!.squadIds[0]!
    expect(trainAction(id, T0).ok).toBe(true)
    expect(s().army!.squadIds).not.toContain(id)
    expect(units().some(u => u.id === id)).toBe(true)
    expect(toggleSquad(id).ok).toBe(false)
    scoutBattle("easy")
    expect(startBattle([id]).ok).toBe(false)
  })

  it("опыт копится со временем по скорости уровня, дробный остаток не теряется", () => {
    const id = units()[0]!.id
    const xp0 = unit(id).xp
    const lv0 = unit(id).level
    trainAction(id, T0)
    const rate = TRAINING.xpPerHour[0]
    tickSettlement(T0 + HOUR / 2)
    tickSettlement(T0 + HOUR / 2 + HOUR / 2)
    const gained = (unit(id).level - lv0) * XP.perLevel + unit(id).xp - xp0
    expect(gained).toBe(rate)
    expect(s().settlement.training[0]!.xp).toBe(rate)
  })

  it("перезапуск во время тренировки: опыт за отсутствие считается по сохранённому времени", () => {
    const id = units()[0]!.id
    trainAction(id, T0)
    const r = parseSave(serializeSave(s()))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const offline = settleTraining(r.save, T0 + 5 * HOUR).save
    expect(offline.settlement.training[0]!.xp).toBe(5 * TRAINING.xpPerHour[0])
  })

  it("часы назад опыта не дают", () => {
    const id = units()[0]!.id
    trainAction(id, T0)
    tickSettlement(T0 - 10 * HOUR)
    expect(s().settlement.training[0]!.xp).toBe(0)
    tickSettlement(T0 - 9 * HOUR)
    expect(s().settlement.training[0]!.xp).toBe(TRAINING.xpPerHour[0])
  })

  it("на максимальном уровне опыт не копится (правила gainXp)", () => {
    const id = units()[0]!.id
    $save.set({ ...s(), army: { ...s().army!, units: units().map(u => (u.id === id ? { ...u, level: MAX_LEVEL, xp: 0 } : u)) } })
    trainAction(id, T0)
    tickSettlement(T0 + 50 * HOUR)
    expect(unit(id).level).toBe(MAX_LEVEL)
    expect(unit(id).xp).toBe(0)
  })

  it("опыт за вылазку начисляется один раз за бой", () => {
    const id = units()[0]!.id
    trainAction(id, T0)
    const once = applySortieTraining(s(), "battle-1", T0).save
    const twice = applySortieTraining(once, "battle-1", T0).save
    expect(twice.settlement.training[0]!.xp).toBe(TRAINING.sortieXp[0])
    expect(twice.army).toEqual(once.army)
    const other = applySortieTraining(twice, "battle-2", T0).save
    expect(other.settlement.training[0]!.xp).toBe(2 * TRAINING.sortieXp[0])
  })

  it("после завершения вылазки тренирующиеся получают опыт автоматически", () => {
    const squad = s().army!.squadIds
    const trainee = units().find(u => !squad.includes(u.id))!.id
    trainAction(trainee, Date.now())
    scoutBattle("easy")
    expect(startBattle(squad).ok).toBe(true)
    dispatchBattle({ type: "retreat" })
    finishBattle()
    const slot = s().settlement.training.find(t => t.unitId === trainee)!
    expect(slot.xp).toBeGreaterThanOrEqual(TRAINING.sortieXp[0])
    expect(s().settlement.sortiesTrained.length).toBe(1)
    // Повторный вызов не начисляет второй раз
    finishBattle()
    expect(s().settlement.training.find(t => t.unitId === trainee)!.xp).toBe(slot.xp)
  })

  it("гибель или уход бойца прекращает тренировку", () => {
    setLevel("training", 5)
    const [a, b] = units()
    trainAction(a!.id, T0)
    trainAction(b!.id, T0)
    kill(a!.id)
    tickSettlement(T0 + HOUR)
    expect(s().settlement.training.map(t => t.unitId)).toEqual([b!.id])
    releaseUnit(b!.id)
    expect(s().settlement.training).toEqual([])
  })

  it("забрать с тренировки: опыт за время начислен, боец снова свободен", () => {
    const id = units()[0]!.id
    trainAction(id, T0)
    const r = collectAction(id, T0 + 3 * HOUR)
    expect(r.ok).toBe(true)
    expect(s().settlement.training).toEqual([])
    expect(toggleSquad(id).ok).toBe(true)
    expect(collectAction(id, T0).ok).toBe(false)
  })

  it("улучшение полигона: время до улучшения — по старой скорости", () => {
    const id = units()[0]!.id
    trainAction(id, T0)
    upgradeAction("training", T0 + HOUR)
    tickSettlement(T0 + 2 * HOUR)
    expect(s().settlement.training[0]!.xp).toBe(TRAINING.xpPerHour[0] + TRAINING.xpPerHour[1])
  })
})

describe("торговая лавка", () => {
  beforeEach(() => {
    freshGame()
    buildAction("store", T0)
  })

  it("постройка выкладывает витрину размера уровня; в пределах периода она не меняется", () => {
    const stock = s().store
    expect(stock.weapons.length + stock.talismans.length).toBe(STORE.offers[0])
    expect(stock.period).toBe(storePeriod(T0))
    expect(settleStore(s(), T0 + STORE_PERIOD_MS - 1)).toBe(s())
  })

  it("перезапуск не обновляет витрину раньше времени, наступление периода — обновляет", () => {
    const stock = s().store
    const r = parseSave(serializeSave(s()))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    $save.set(r.save)
    tickSettlement(T0 + 60_000)
    expect(s().store).toEqual(stock)
    tickSettlement(nextStoreRefresh(stock))
    expect(s().store.period).toBe(stock.period + 1)
    expect(s().store.fresh).toBe(true)
    expect(placeAlerts(s(), T0).store).toBe(true)
  })

  it("часы назад витрину не меняют", () => {
    const stock = s().store
    tickSettlement(T0 - 10 * STORE_PERIOD_MS)
    expect(s().store).toEqual(stock)
  })

  it("улучшение — больше товаров (прежние остаются) и скидка", () => {
    const before = [...s().store.weapons, ...s().store.talismans]
    upgradeAction("store", T0)
    const after = [...s().store.weapons, ...s().store.talismans]
    expect(after.length).toBe(STORE.offers[1])
    expect(before.every(id => after.includes(id))).toBe(true)
    const id = after[0]!
    expect(storePrice(s(), id)).toBe(Math.round(itemPrice(id) * (1 - STORE.discount[1])))
  })

  it("покупка по цене со скидкой; без денег и из сменившейся витрины — отказ без списания", () => {
    setLevel("store", 3)
    const id = s().store.weapons[0]!
    const treats = s().profile.treats
    expect(buyItemAction(id, s().store.period, T0).ok).toBe(true)
    expect(s().profile.treats).toBe(treats - storePrice(s(), id))
    expect(s().inventory[id]).toBe(1)
    const period = s().store.period
    const later = buyItemAction(id, period, T0 + STORE_PERIOD_MS)
    expect(later.ok).toBe(false)
    expect(later.restocked).toBe(true)
    expect(s().inventory[id]).toBe(1)
    setTreats(0)
    expect(buyItemAction(s().store.weapons[0]!, s().store.period, T0 + STORE_PERIOD_MS).ok).toBe(false)
    expect(buyItemAction("sword_none", undefined, T0 + STORE_PERIOD_MS).ok).toBe(false)
  })

  it("без построенной Лавки купить нельзя", () => {
    const id = s().store.weapons[0]!
    $save.set({ ...s(), settlement: { ...s().settlement, buildings: { barracks: { level: 1, builtAt: T0 } } } })
    expect(buyItemAction(id, undefined, T0).ok).toBe(false)
  })
})

describe("кладбище и воскрешение", () => {
  beforeEach(() => {
    freshGame()
    buildAction("graveyard", T0)
  })

  it("на уровнях 1–4 воскрешение закрыто", () => {
    const entry = kill(units()[0]!.id)
    for (let lv = 1; lv <= 4; lv++) {
      setLevel("graveyard", lv)
      expect(reviveStatus(s(), T0).unlocked).toBe(false)
      expect(reviveAction(entry, T0).ok).toBe(false)
    }
  })

  it("на 5-м уровне: боец возвращается в ростер без снаряжения, запись остаётся в истории", () => {
    setLevel("graveyard", 5)
    const id = units()[0]!.id
    $save.set({ ...s(), army: { ...s().army!, units: units().map(u => (u.id === id ? { ...u, skills: { ...u.skills, weapon: "sword_steel" }, weaponSkill: "sword", accessory: "tal_fang" } : u)) } })
    const inventory = s().inventory
    const entry = kill(id)
    const r = reviveAction(entry, T0 + HOUR)
    expect(r.ok).toBe(true)
    const back = unit(id)
    expect(weaponDef(back.skills.weapon).grade).toBe("wood")
    expect(weaponDef(back.skills.weapon).kind).toBe("sword")
    expect(back.accessory).toBeUndefined()
    expect(s().inventory).toEqual(inventory)
    expect(s().memorial.find(m => m.id === entry)!.revivedAt).toBe(T0 + HOUR)
    expect(s().settlement.lastReviveAt).toBe(T0 + HOUR)
  })

  it("одно воскрешение в игровой день, один и тот же — не дважды, живого и ушедшего — нельзя", () => {
    setLevel("graveyard", 5)
    const [a, b, c] = units()
    const ea = kill(a!.id)
    const eb = kill(b!.id)
    expect(reviveAction(ea, T0).ok).toBe(true)
    expect(reviveAction(ea, T0).ok).toBe(false)
    expect(reviveAction(eb, T0 + HOUR).ok).toBe(false)
    expect(canRevive(s(), ea, T0 + 25 * HOUR).ok).toBe(false)
    $save.set({ ...s(), memorial: [...s().memorial, memorialEntry(c!, "killed", T0)] })
    expect(reviveAction(s().memorial.at(-1)!.id, T0 + 25 * HOUR).ok).toBe(false)
    // Ушедший сам — не павший в бою
    const released = memorialEntry(b!, "released", T0 + 1)
    $save.set({ ...s(), memorial: [...s().memorial, released] })
    expect(canRevive(s(), released.id, T0 + 25 * HOUR).ok).toBe(false)
    // Новый игровой день — можно снова
    expect(reviveAction(eb, T0 + 24 * HOUR).ok).toBe(true)
  })

  it("нет мест в Казармах — погибший остаётся, дневной лимит не тратится", () => {
    setLevel("graveyard", 5)
    const entry = kill(units()[0]!.id)
    const filler = Array.from({ length: freeRosterSlots(s()) }, (_, i) => ({ ...units()[0]!, id: `f${i}` }))
    $save.set({ ...s(), army: { ...s().army!, units: [...units(), ...filler] } })
    const r = reviveAction(entry, T0)
    expect(r.ok).toBe(false)
    expect(s().settlement.lastReviveAt).toBeUndefined()
    expect(s().memorial.find(m => m.id === entry)!.revivedAt).toBeUndefined()
    expect(reviveStatus(s(), T0).readyToday).toBe(true)
  })

  it("лимит переживает перезапуск и перевод часов назад; сброс — по правилу игрового дня", () => {
    setLevel("graveyard", 5)
    const ea = kill(units()[0]!.id)
    const eb = kill(units()[0]!.id)
    reviveAction(ea, T0 + HOUR)
    const r = parseSave(serializeSave(s()))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(canRevive(r.save, eb, T0 + 2 * HOUR).ok).toBe(false)
    expect(canRevive(r.save, eb, T0 - 48 * HOUR).ok).toBe(false)
    const status = reviveStatus(r.save, T0 + 2 * HOUR)
    expect(status.nextAt).toBe(nextDayStart(T0))
    expect(canRevive(r.save, eb, nextDayStart(T0)).ok).toBe(true)
  })

  it("игровой день начинается в resetHour по UTC+offset", () => {
    const start = nextDayStart(T0) // начало следующего дня
    expect(gameDay(start) - gameDay(start - 1)).toBe(1)
    const local = new Date(start + GAME_DAY.utcOffsetMinutes * 60_000)
    expect(local.getUTCHours()).toBe(GAME_DAY.resetHour)
    expect(local.getUTCMinutes()).toBe(0)
  })
})

describe("миграция v8 → v9", () => {
  function v8(unitCount: number, started = true): Record<string, unknown> {
    freshGame()
    const extra = Array.from({ length: Math.max(0, unitCount - units().length) }, (_, i) => ({ ...units()[0]!, id: `x${i}` }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- сырой JSON сейва v8
    const raw = JSON.parse(serializeSave({ ...s(), army: { ...s().army!, units: [...units(), ...extra].slice(0, unitCount) } })) as Record<string, any>
    raw.version = 8
    delete raw.settlement
    delete raw.store.period
    delete raw.store.salt
    raw.store = { ...raw.store, weapons: ["sword_iron", "axe_iron"], talismans: ["tal_fang"], fresh: false }
    raw.village = { pos: { x: 5.5, y: 13.2 }, facing: "down" }
    if (!started) delete raw.profile.startedAt
    return raw
  }

  it("старый сейв: ростер целиком, Казармы под его размер, Лавка и Кладбище построены, витрина сохранена", () => {
    const r = parseSave(JSON.stringify(v8(15)))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.save.version).toBe(SAVE_VERSION)
    expect(r.save.army!.units.length).toBe(15)
    expect(rosterCapacity(r.save)).toBeGreaterThanOrEqual(15)
    expect(r.save.settlement.buildings.barracks!.level).toBe(barracksLevelFor(15))
    expect(r.save.settlement.buildings.store!.level).toBe(1)
    expect(r.save.settlement.buildings.graveyard!.level).toBe(1)
    expect(r.save.settlement.buildings.training).toBeUndefined()
    expect(r.save.settlement.training).toEqual([])
    expect(r.save.store.weapons).toEqual(["sword_iron", "axe_iron"])
    expect("village" in r.save).toBe(false)
  })

  it("20 бойцов (прежний предел) — Казармы 5-го уровня; неначатая игра — только Казармы", () => {
    const full = parseSave(JSON.stringify(v8(20)))
    expect(full.ok && full.save.settlement.buildings.barracks!.level).toBe(5)
    const empty = parseSave(JSON.stringify(v8(6, false)))
    expect(empty.ok && Object.keys(empty.save.settlement.buildings)).toEqual(["barracks"])
  })
})
