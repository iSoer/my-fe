import { beforeEach, describe, expect, it } from "vitest"
import {
  $save,
  buyAction,
  claimRewardAction,
  ensureRoster,
  scoutBattle,
  setMealAction,
  startBattle,
  surrenderFromMenu,
  toggleSquad
} from "@game/state/save"
import { SAVE_VERSION, createEmptySave, parseSave, serializeSave } from "@game/core/save"
import { BUILDING_SHAPES, HERO_START } from "@game/content/village"
import { campConnected, campLayout } from "@game/core/village"
import type { SaveGame } from "@game/core/types"
import {
  accrueTraining,
  canUpgrade,
  collectFood,
  collectTraining,
  cureFatigue,
  fieldsStored,
  mealSlots,
  refreshMarket,
  rosterCap,
  sellFood,
  setTraining,
  trainingCap,
  trainingGain,
  upgradeBuilding
} from "@game/core/settlement"
import { generateStore, marketHour } from "@game/core/items"
import { visibleStats } from "@game/core/units"
import { weaponDef } from "@game/content/weapons"
import {
  BARRACKS,
  CANTEEN,
  FATIGUE,
  FIELDS,
  FOOD,
  HOSPITAL,
  TRAINING,
  buildingDef,
  type BuildingId
} from "@game/content/buildings"
import { XP } from "@game/content/balance"

const HOUR = 60 * 60 * 1000
const T0 = 1_000 * HOUR

function freshGame(treats = 100000): SaveGame {
  const save = createEmptySave(1)
  save.profile.treats = treats
  save.profile.food = 1000
  $save.set(save)
  ensureRoster()
  return $save.get()
}

/** Поднять здание до уровня, не глядя на цену и требования. */
function withLevel(save: SaveGame, id: BuildingId, level: number, now = T0): SaveGame {
  const s = { ...save, settlement: { ...save.settlement, buildings: { ...save.settlement.buildings, [id]: level } } }
  if (id === "fields") s.settlement = { ...s.settlement, fields: { since: now } }
  if (id === "training") s.settlement = { ...s.settlement, training: { ...s.settlement.training, since: now } }
  return s
}

function ok<T>(r: { ok: true, value: T } | { ok: false, error: string }): T {
  if (!r.ok) throw new Error(r.error)
  return r.value
}

describe("поселение: постройка и улучшение", () => {
  beforeEach(() => void freshGame())

  it("цена списывается, уровень растёт до 5, выше — нельзя; Казармы и площадка стоят с начала", () => {
    let s = $save.get()
    expect(s.settlement.buildings.barracks).toBe(1)
    expect(s.settlement.buildings.market).toBe(1)
    expect(s.settlement.buildings.hospital).toBe(0)
    // Требование по уровню ростера снимаем, подняв бойцов
    s = { ...s, army: { ...s.army!, units: s.army!.units.map(u => ({ ...u, level: 60 })) } }
    const treats = s.profile.treats
    s = ok(upgradeBuilding(s, "hospital", T0))
    expect(s.settlement.buildings.hospital).toBe(1)
    expect(s.profile.treats).toBe(treats - buildingDef("hospital").levels[0]!.treats)
    for (let i = 0; i < 4; i++) s = ok(upgradeBuilding(s, "hospital", T0))
    expect(s.settlement.buildings.hospital).toBe(5)
    expect(canUpgrade(s, "hospital").ok).toBe(false)
  })

  it("нехватка Вкусняшек, Еды или уровня ростера — отказ с причиной", () => {
    const s = $save.get()
    const poor = { ...s, profile: { ...s.profile, treats: 0 } }
    const r = canUpgrade(poor, "fields")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Treats/)
    // Столовая 2 стоит Еды
    const canteen = { ...withLevel(s, "canteen", 1), army: { ...s.army!, units: s.army!.units.map(u => ({ ...u, level: 60 })) } }
    const noFood = { ...canteen, profile: { ...canteen.profile, food: 0 } }
    const r2 = canUpgrade(noFood, "canteen")
    expect(r2.ok).toBe(false)
    if (!r2.ok) expect(r2.error).toMatch(/Food/)
    // Казармы 3 — с уровня ростера 10
    const lowRoster = withLevel({ ...s, army: { ...s.army!, units: s.army!.units.map(u => ({ ...u, level: 3 })) } }, "barracks", 2)
    const r3 = canUpgrade(lowRoster, "barracks")
    expect(r3.ok).toBe(false)
    if (!r3.ok) expect(r3.error).toMatch(/roster level 10/)
  })
})

describe("Казармы", () => {
  beforeEach(() => void freshGame())

  it("уровень задаёт вместимость ростера: полный ростер не нанимает и не берёт награду", () => {
    const s = $save.get()
    expect(rosterCap(s)).toBe(BARRACKS.rosterCap[0])
    const filler = Array.from({ length: rosterCap(s) - s.army!.units.length }, (_, i) => ({ ...s.army!.units[0]!, id: `f${i}` }))
    $save.set({ ...s, army: { ...s.army!, units: [...s.army!.units, ...filler] }, rewardChoice: [s.shelter.candidates[0]!] })
    expect(buyAction(0).ok).toBe(false)
    const r = claimRewardAction(0)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/Barracks/)
    // Улучшили Казармы — место есть
    $save.set(withLevel($save.get(), "barracks", 2))
    expect(rosterCap($save.get())).toBe(BARRACKS.rosterCap[1])
    expect(buyAction(0).ok).toBe(true)
  })
})

describe("Поля и Еда", () => {
  it("Еда растёт по времени до вместимости амбара; сбор оставляет дробный остаток; часы назад — ничего", () => {
    const s = withLevel(freshGame(), "fields", 1)
    const rate = FIELDS.perHour[0]
    expect(fieldsStored(s, T0)).toBe(0)
    expect(fieldsStored(s, T0 + 2 * HOUR)).toBe(2 * rate)
    expect(fieldsStored(s, T0 + 1000 * HOUR)).toBe(FIELDS.storage[0])
    expect(fieldsStored(s, T0 - 5 * HOUR)).toBe(0)
    // 1.5 ч → 9 Еды, отсчёт сдвигается ровно на них: ещё через полчаса — +3
    const food = s.profile.food
    const c = collectFood(s, T0 + 1.5 * HOUR)
    expect(c.amount).toBe(Math.floor(1.5 * rate))
    expect(c.save.profile.food).toBe(food + c.amount)
    expect(fieldsStored(c.save, T0 + 2 * HOUR)).toBe(2 * rate - c.amount)
    // Без Полей ничего не растёт
    expect(fieldsStored(withLevel(s, "fields", 0), T0 + 10 * HOUR)).toBe(0)
  })

  it("уровень Полей — больше Еды в час и амбар вместительнее; излишки продаются за Вкусняшки", () => {
    const s = freshGame()
    const lv1 = withLevel(s, "fields", 1)
    const lv5 = withLevel(s, "fields", 5)
    expect(fieldsStored(lv5, T0 + HOUR)).toBeGreaterThan(fieldsStored(lv1, T0 + HOUR))
    expect(fieldsStored(lv5, T0 + 1000 * HOUR)).toBe(FIELDS.storage[4])
    const sold = ok(sellFood(s, 10))
    expect(sold.profile.food).toBe(s.profile.food - 10)
    expect(sold.profile.treats).toBe(s.profile.treats + 10 * FOOD.sellPrice)
    expect(sellFood({ ...s, profile: { ...s.profile, food: 3 } }, 10).ok).toBe(false)
  })
})

describe("Тренировочный полигон", () => {
  function trainingGame(): SaveGame {
    const s = withLevel(freshGame(), "training", 1)
    // Лидер ростера — 20 уровня, остальные — 5
    const units = s.army!.units.map((u, i) => ({ ...u, level: i === 0 ? 20 : 5, xp: 0 }))
    return { ...s, army: { ...s.army!, units } }
  }

  it("боец на полигоне уходит из отряда и не может вернуться в него или выйти в бой", () => {
    const s = trainingGame()
    const id = s.army!.squadIds[1]!
    const next = ok(setTraining(s, id, true, T0)).save
    expect(next.army!.squadIds).not.toContain(id)
    $save.set(next)
    expect(toggleSquad(id).ok).toBe(false)
    expect(scoutBattle("easy").ok).toBe(true)
    expect(startBattle([id]).ok).toBe(false)
  })

  it("опыт за время (с пределом часов отлучки) и за бой отряда; часы назад ничего не дают", () => {
    const s = trainingGame()
    const id = s.army!.units[1]!.id
    let t = ok(setTraining(s, id, true, T0)).save
    t = accrueTraining(t, T0 + 2 * HOUR)
    expect(t.settlement.training.bank[id]).toBeCloseTo(2 * TRAINING.xpPerHour[0])
    // Часы перевели назад — копилка и отсчёт не меняются
    const back = accrueTraining(t, T0)
    expect(back.settlement.training.bank[id]).toBeCloseTo(2 * TRAINING.xpPerHour[0])
    expect(back.settlement.training.since).toBe(T0 + 2 * HOUR)
    // Неделя отлучки засчитывается не больше чем за maxHours
    const away = accrueTraining(t, T0 + 2 * HOUR + 7 * 24 * HOUR)
    expect(away.settlement.training.bank[id]).toBeCloseTo((2 + TRAINING.maxHours[0]) * TRAINING.xpPerHour[0])
    // Бой отряда: +xpPerBattle
    $save.set(t)
    expect(scoutBattle("easy").ok).toBe(true)
    expect(startBattle($save.get().army!.squadIds).ok).toBe(true)
    surrenderFromMenu()
    expect($save.get().settlement.training.bank[id]).toBeCloseTo(2 * TRAINING.xpPerHour[0] + TRAINING.xpPerBattle[0])
  })

  it("предел — на уровень ниже сильнейшего бойца не на полигоне; излишек сгорает", () => {
    const s = trainingGame()
    const id = s.army!.units[1]!.id
    let t = ok(setTraining(s, id, true, T0)).save
    expect(trainingCap(t)).toBe(19)
    t = { ...t, settlement: { ...t.settlement, training: { ...t.settlement.training, bank: { [id]: 100000 } } } }
    const unit = t.army!.units.find(u => u.id === id)!
    expect(trainingGain(t, unit)).toBe((19 - 5) * XP.perLevel)
    const c = collectTraining(t)
    const after = c.save.army!.units.find(u => u.id === id)!
    expect(after.level).toBe(19)
    expect(c.levelUps[0]).toMatchObject({ from: 5, to: 19 })
    expect(c.save.settlement.training.bank[id]).toBeUndefined()
    // Сильнейший сам на полигоне — предел считается по остальным
    const leader = t.army!.units[0]!.id
    const both = ok(setTraining(t, leader, true, T0)).save
    expect(trainingCap(both)).toBe(4)
  })

  it("уровень полигона ускоряет рост; снятый боец забирает свою копилку", () => {
    const s = trainingGame()
    const id = s.army!.units[1]!.id
    const lv1 = accrueTraining(ok(setTraining(s, id, true, T0)).save, T0 + HOUR)
    const lv5 = accrueTraining(ok(setTraining(withLevel(s, "training", 5), id, true, T0)).save, T0 + HOUR)
    expect(lv5.settlement.training.bank[id]!).toBeGreaterThan(lv1.settlement.training.bank[id]!)
    const off = ok(setTraining({ ...lv1, settlement: { ...lv1.settlement, training: { ...lv1.settlement.training, bank: { [id]: 120 } } } }, id, false, T0 + HOUR))
    expect(off.save.settlement.training.unitIds).not.toContain(id)
    expect(off.save.army!.units.find(u => u.id === id)!.level).toBe(7)
    expect(off.levelUps.length).toBe(1)
  })

  it("без полигона и при занятых слотах поставить нельзя", () => {
    const s = trainingGame()
    expect(setTraining(withLevel(s, "training", 0), s.army!.units[1]!.id, true, T0).ok).toBe(false)
    let t = s
    for (const u of s.army!.units.slice(1, 1 + TRAINING.slots)) t = ok(setTraining(t, u.id, true, T0)).save
    expect(setTraining(t, s.army!.units[0]!.id, true, T0).ok).toBe(false)
  })
})

describe("Торговая площадка", () => {
  it("витрина детерминирована по часу и меняется на его границе", () => {
    const s = freshGame()
    const a = refreshMarket({ ...s, store: { ...s.store, hour: -1 } }, T0 + 10)
    const b = refreshMarket({ ...s, store: { ...s.store, hour: -1 } }, T0 + HOUR - 10)
    expect(b.store).toEqual(a.store)
    expect(a.store.hour).toBe(marketHour(T0))
    // Тот же час — витрина не пересобирается
    expect(refreshMarket(a, T0 + 30 * 60 * 1000)).toBe(a)
    const next = refreshMarket(a, T0 + HOUR + 10)
    expect(next.store.hour).toBe(a.store.hour + 1)
    expect(next.store.fresh).toBe(true)
  })

  it("уровень площадки: товаров больше, усиленное оружие чаще", () => {
    const s = freshGame()
    let lowUpgrades = 0
    let highUpgrades = 0
    for (let seed = 1; seed <= 40; seed++) {
      const low = generateStore(seed, s.army, 0, 1)
      const high = generateStore(seed, s.army, 0, 5)
      expect(high.weapons.length + high.talismans.length).toBeGreaterThan(low.weapons.length + low.talismans.length)
      lowUpgrades += low.weapons.filter(id => weaponDef(id).variant === "basic" && weaponDef(id).grade !== "iron").length
      highUpgrades += high.weapons.filter(id => weaponDef(id).variant === "basic" && weaponDef(id).grade !== "iron").length
    }
    expect(highUpgrades).toBeGreaterThan(lowUpgrades)
  })
})

describe("усталость и Больница", () => {
  it("каждый бой добавляет отряду стак усталости, штраф к статам растёт; HP не трогает", () => {
    freshGame()
    const squad = () => $save.get().army!.squadIds.map(id => $save.get().army!.units.find(u => u.id === id)!)
    const fresh = squad()[0]!
    for (let i = 1; i <= 2; i++) {
      expect(scoutBattle("easy").ok).toBe(true)
      expect(startBattle($save.get().army!.squadIds).ok).toBe(true)
      surrenderFromMenu()
      expect(squad().every(u => u.fatigue === i)).toBe(true)
    }
    const tired = squad()[0]!
    const a = visibleStats(fresh)
    const b = visibleStats(tired)
    expect(b.hp).toBe(a.hp)
    expect(b.str).toBeLessThan(a.str)
    expect(b.def).toBeLessThan(a.def)
    // Потолок стаков
    expect(visibleStats({ ...fresh, fatigue: 99 })).toEqual(visibleStats({ ...fresh, fatigue: FATIGUE.maxStacks }))
    // Не ходившие в бой не устают
    const bench = $save.get().army!.units.filter(u => !$save.get().army!.squadIds.includes(u.id))
    expect(bench.every(u => !u.fatigue)).toBe(true)
  })

  it("Больница снимает усталость с N бойцов за раз, заряды восстанавливаются после боя", () => {
    const s0 = freshGame()
    const units = s0.army!.units.map(u => ({ ...u, fatigue: 3 }))
    let s = ok(upgradeBuilding({ ...s0, army: { ...s0.army!, units } }, "hospital", T0))
    expect(s.settlement.hospital.charges).toBe(HOSPITAL.charges[0])
    s = ok(cureFatigue(s, units[0]!.id))
    expect(s.army!.units[0]!.fatigue).toBeUndefined()
    const r = cureFatigue(s, units[1]!.id)
    expect(r.ok).toBe(false)
    // Улучшение добавляет места
    s = ok(upgradeBuilding({ ...s, army: { ...s.army!, units: s.army!.units.map(u => ({ ...u, level: 60 })) } }, "hospital", T0))
    expect(s.settlement.hospital.charges).toBe(HOSPITAL.charges[1] - HOSPITAL.charges[0])
    $save.set(s)
    expect(scoutBattle("easy").ok).toBe(true)
    expect(startBattle(s.army!.squadIds).ok).toBe(true)
    surrenderFromMenu()
    expect($save.get().settlement.hospital.charges).toBe(HOSPITAL.charges[1])
  })
})

describe("Столовая", () => {
  it("скольких накормить — по уровню; блюдо даёт бафф на один бой, Еда списывается при старте", () => {
    const s = withLevel(freshGame(), "canteen", 1)
    expect(mealSlots(s)).toBe(CANTEEN.fed[0])
    expect(mealSlots(withLevel(s, "canteen", 5))).toBe(4)
    $save.set(s)
    expect(scoutBattle("easy").ok).toBe(true)
    const [a, b] = $save.get().army!.squadIds as [string, string]
    // Блюдо выше уровня Столовой — нельзя; второе блюдо при 1 месте — нельзя
    expect(setMealAction(a, "meat_pie").ok).toBe(false)
    expect(setMealAction(a, "fish_soup").ok).toBe(true)
    expect(setMealAction(b, "fish_soup").ok).toBe(false)
    const food = $save.get().profile.food
    const unit = $save.get().army!.units.find(u => u.id === a)!
    expect(startBattle($save.get().army!.squadIds).ok).toBe(true)
    const battle = $save.get().battle!
    expect($save.get().profile.food).toBe(food - 8)
    expect(battle.roster[a]!.meal).toBe("fish_soup")
    expect(battle.units[a]!.maxHp).toBeGreaterThan(visibleStats(unit).hp)
    surrenderFromMenu()
    expect($save.get().army!.units.find(u => u.id === a)!.meal).toBeUndefined()
  })

  it("без Столовой и не бойцу отряда блюдо не выбрать; не хватает Еды — отказ", () => {
    const s = freshGame()
    $save.set(s)
    expect(scoutBattle("easy").ok).toBe(true)
    const inSquad = $save.get().army!.squadIds[0]!
    expect(setMealAction(inSquad, "fish_soup").ok).toBe(false)
    $save.set({ ...withLevel($save.get(), "canteen", 1), profile: { ...$save.get().profile, food: 2 } })
    expect(setMealAction(inSquad, "fish_soup").ok).toBe(false)
    $save.set({ ...$save.get(), profile: { ...$save.get().profile, food: 100 } })
    const bench = $save.get().army!.units.find(u => !$save.get().army!.squadIds.includes(u.id))!
    expect(setMealAction(bench.id, "fish_soup").ok).toBe(false)
  })
})

describe("сейв v10", () => {
  it("v9 → v10: построенные здания встают на карту лагеря, герой — на площадь", () => {
    const s = withLevel(withLevel(freshGame(), "fields", 2), "hospital", 1)
    const raw = JSON.parse(serializeSave(s)) as Record<string, unknown>
    delete (raw["settlement"] as Record<string, unknown>)["layout"]
    raw["village"] = { pos: { x: 5.5, y: 6.5 }, facing: "up" }
    raw["version"] = 9
    const r = parseSave(JSON.stringify(raw))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const layout = r.save.settlement.layout
    expect(Object.keys(layout.buildings).sort()).toEqual(["barracks", "fields", "hospital", "market"])
    expect(layout.buildings.fields).toEqual(BUILDING_SHAPES.fields.pref)
    expect(layout.decor.length).toBeGreaterThan(0)
    expect(campConnected(campLayout(r.save.settlement))).toBe(true)
    expect(r.save.village.pos).toEqual(HERO_START)
  })
})

describe("сейв v9", () => {
  it("v8 → v9: Казармы вмещают нынешний ростер, остальное не построено, Еды нет; поселение переживает сохранение", () => {
    const s = freshGame()
    const big = Array.from({ length: 11 }, (_, i) => ({ ...s.army!.units[0]!, id: `u${i}` }))
    const raw = JSON.parse(serializeSave({ ...s, army: { ...s.army!, units: big } })) as Record<string, unknown>
    delete raw["settlement"]
    delete (raw["profile"] as Record<string, unknown>)["food"]
    raw["version"] = 8
    const r = parseSave(JSON.stringify(raw))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.save.version).toBe(SAVE_VERSION)
    expect(r.save.settlement.buildings.barracks).toBe(3)
    expect(rosterCap(r.save)).toBeGreaterThanOrEqual(11)
    expect(r.save.settlement.buildings.training).toBe(0)
    expect(r.save.profile.food).toBe(0)

    const built = withLevel({ ...s, army: { ...s.army!, units: s.army!.units.map(u => ({ ...u, fatigue: 2 })) } }, "fields", 3)
    const back = parseSave(serializeSave(built))
    expect(back.ok).toBe(true)
    if (back.ok) {
      expect(back.save.settlement.buildings.fields).toBe(3)
      expect(back.save.army!.units[0]!.fatigue).toBe(2)
    }
  })
})
