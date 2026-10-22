import { beforeEach, describe, expect, it } from "vitest"
import {
  $save,
  assignSquadSlot,
  buyAction,
  claimRewardAction,
  dispatchBattle,
  ensureRoster,
  finishBattle,
  freeSlots,
  releaseUnit,
  scoutBattle,
  skipRewardAction,
  startBattle,
  toggleSquad
} from "@game/state/save"
import { SAVE_VERSION, createEmptySave, parseSave, serializeSave } from "@game/core/save"
import { lootFor, rosterLevel, unitPrice } from "@game/core/progression"
import { BARRACKS_CAP, SQUAD_SIZE } from "@game/core/types"
import { ROSTER, SHOP } from "@game/content/balance"

function freshGame(treats = 1000): void {
  const save = createEmptySave(1)
  save.profile.treats = treats
  $save.set(save)
  ensureRoster()
}

describe("ростер", () => {
  beforeEach(() => freshGame())

  it("новая игра выдаёт стартовый ростер, первые 4 — в отряде, витрина магазина заполнена", () => {
    const s = $save.get()
    expect(s.army!.units.length).toBe(ROSTER.size)
    expect(s.army!.squadIds.length).toBe(SQUAD_SIZE)
    expect(s.shelter.candidates.length).toBe(SHOP.size)
    // повторный вызов ничего не меняет
    ensureRoster()
    expect($save.get().army!.id).toBe(s.army!.id)
  })

  it("слот отряда: замена бойцом ростера, обмен местами, пустой слот и «убрать»", () => {
    const army = () => $save.get().army!
    const [a, b] = army().squadIds as [string, string]
    const outside = army().units.find(u => !army().squadIds.includes(u.id))!
    expect(assignSquadSlot(0, outside.id).ok).toBe(true)
    expect(army().squadIds[0]).toBe(outside.id)
    expect(army().squadIds).not.toContain(a)
    // боец уже в отряде — меняется местами со слотом
    expect(assignSquadSlot(0, b).ok).toBe(true)
    expect(army().squadIds.slice(0, 2)).toEqual([b, outside.id])
    // освободить слот и добавить в пустой
    expect(assignSquadSlot(3, null).ok).toBe(true)
    expect(army().squadIds.length).toBe(SQUAD_SIZE - 1)
    expect(assignSquadSlot(3, a).ok).toBe(true)
    expect(army().squadIds[3]).toBe(a)
    expect(assignSquadSlot(SQUAD_SIZE, a).ok).toBe(false)
  })

  it("отряд — не больше 4 из ростера", () => {
    const s = $save.get()
    const outside = s.army!.units.find(u => !s.army!.squadIds.includes(u.id))!
    expect(toggleSquad(outside.id).ok).toBe(false)
    expect(toggleSquad(s.army!.squadIds[0]!).ok).toBe(true)
    expect(toggleSquad(outside.id).ok).toBe(true)
    expect($save.get().army!.squadIds).toContain(outside.id)
    expect($save.get().army!.squadIds.length).toBe(SQUAD_SIZE)
  })

  it("магазин: покупка списывает цену по уровню и редкости и убирает кандидата с витрины", () => {
    const before = $save.get()
    const cand = before.shelter.candidates[0]!
    const price = unitPrice(cand)
    const r = buyAction(0)
    expect(r.ok).toBe(true)
    const after = $save.get()
    expect(after.profile.treats).toBe(before.profile.treats - price)
    expect(after.army!.units.some(u => u.id === cand.id)).toBe(true)
    expect(after.shelter.candidates.length).toBe(before.shelter.candidates.length - 1)
  })

  it("магазин: без Вкусняшек и при полном ростере купить нельзя", () => {
    freshGame(0)
    expect(buyAction(0).ok).toBe(false)
    freshGame(100000)
    const s = $save.get()
    const filler = Array.from({ length: BARRACKS_CAP - s.army!.units.length }, (_, i) => ({ ...s.army!.units[0]!, id: `f${i}` }))
    $save.set({ ...s, army: { ...s.army!, units: [...s.army!.units, ...filler] } })
    expect(freeSlots($save.get())).toBe(0)
    expect(buyAction(0).ok).toBe(false)
  })

  it("цена растёт с редкостью и уровнем", () => {
    expect(unitPrice({ level: 5, rarity: 5 })).toBeGreaterThan(unitPrice({ level: 5, rarity: 1 }))
    expect(unitPrice({ level: 30, rarity: 3 })).toBeGreaterThan(unitPrice({ level: 5, rarity: 3 }))
  })

  it("отпущенный уходит на Кладбище и из отряда, последний — ростер пустеет", () => {
    const s = $save.get()
    const victim = s.army!.squadIds[0]!
    releaseUnit(victim)
    expect($save.get().army!.squadIds).not.toContain(victim)
    for (const u of [...$save.get().army!.units]) releaseUnit(u.id)
    expect($save.get().army).toBeUndefined()
    expect($save.get().memorial.length).toBe(ROSTER.size)
  })
})

describe("разведка, бой и награда", () => {
  beforeEach(() => freshGame())

  it("разведка показывает врагов до боя; seed закреплён, пока бой не начат", () => {
    expect(scoutBattle("easy", "yard").ok).toBe(true)
    const first = $save.get().pendingBattle!
    expect(first.map.enemies.length).toBeGreaterThan(0)
    scoutBattle("normal", "yard")
    scoutBattle("easy", "yard")
    const again = $save.get().pendingBattle!
    expect(again.seed).toBe(first.seed)
    expect(again.map.enemies.map(e => e.unit.id)).toEqual(first.map.enemies.map(e => e.unit.id))
    // уровень врагов — от ростера, а не от выбранного отряда
    const level = rosterLevel($save.get().army)
    for (const e of again.map.enemies) expect(Math.abs(e.unit.level - level)).toBeLessThanOrEqual(3)
  })

  it("бой идёт против разведанных врагов выбранным отрядом", () => {
    scoutBattle("easy", "yard")
    const enemies = $save.get().pendingBattle!.map.enemies.map(e => e.unit.id)
    const squad = $save.get().army!.squadIds.slice(0, 3)
    expect(startBattle(squad).ok).toBe(true)
    const battle = $save.get().battle!
    expect(Object.values(battle.units).filter(u => u.side === "player").map(u => u.unitId).sort()).toEqual([...squad].sort())
    expect(Object.values(battle.units).filter(u => u.side === "enemy").map(u => u.unitId).sort()).toEqual([...enemies].sort())
    expect($save.get().pendingBattle).toBeUndefined()
  })

  it("без разведки и с пустым отрядом бой не начинается", () => {
    expect(startBattle($save.get().army!.squadIds).ok).toBe(false)
    scoutBattle("easy", "yard")
    expect(startBattle([]).ok).toBe(false)
  })

  it("после боя: выбитые Вкусняшки, новая витрина и награда 1 из 3", () => {
    scoutBattle("easy", "yard")
    const shopBefore = $save.get().shelter.candidates.map(u => u.id)
    startBattle($save.get().army!.squadIds)
    dispatchBattle({ type: "retreat" })
    const treatsBefore = $save.get().profile.treats
    const summary = finishBattle()!
    const s = $save.get()
    expect(summary.rewards.treats).toBeGreaterThanOrEqual(summary.rewards.loot)
    expect(s.profile.treats).toBe(treatsBefore + summary.rewards.treats)
    expect(s.shelter.candidates.map(u => u.id)).not.toEqual(shopBefore)
    expect(s.rewardChoice!.length).toBe(3)
    const pick = s.rewardChoice![1]!
    const size = s.army!.units.length
    expect(claimRewardAction(1).ok).toBe(true)
    expect($save.get().army!.units.length).toBe(size + 1)
    expect($save.get().army!.units.some(u => u.id === pick.id)).toBe(true)
    expect($save.get().rewardChoice).toBeUndefined()
  })

  it("от награды можно отказаться", () => {
    scoutBattle("easy", "yard")
    startBattle($save.get().army!.squadIds)
    dispatchBattle({ type: "retreat" })
    finishBattle()
    skipRewardAction()
    expect($save.get().rewardChoice).toBeUndefined()
  })

  it("убитый враг роняет Вкусняшки: больше за уровень, редкость и вожака", () => {
    expect(lootFor({ level: 20, rarity: 3 }, 1)).toBeGreaterThan(lootFor({ level: 5, rarity: 3 }, 1))
    expect(lootFor({ level: 5, rarity: 5 }, 1)).toBeGreaterThan(lootFor({ level: 5, rarity: 1 }, 1))
    expect(lootFor({ level: 5, rarity: 3, isBoss: true }, 1)).toBeGreaterThan(lootFor({ level: 5, rarity: 3 }, 1) * 3)
    expect(lootFor({ level: 5, rarity: 3 }, 2)).toBeGreaterThan(lootFor({ level: 5, rarity: 3 }, 1))
  })
})

describe("сейв", () => {
  it("v4 мигрирует: армия становится ростером, наём и пленник исчезают", () => {
    freshGame()
    const raw = JSON.parse(serializeSave($save.get())) as Record<string, unknown>
    raw["version"] = 4
    const profile = raw["profile"] as Record<string, unknown>
    Object.assign(profile, { rosterRerolls: 0, freeRerolls: 0, hiresSinceBattle: 2 })
    raw["shelter"] = { candidates: [], seed: 1, captive: undefined }
    raw["pendingRoster"] = { seed: 1, rerolls: 0, returnTo: "army" }
    const r = parseSave(JSON.stringify(raw))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.save.version).toBe(SAVE_VERSION)
      expect(r.save.army!.units.length).toBe(ROSTER.size)
      expect("hiresSinceBattle" in r.save.profile).toBe(false)
    }
  })

  it("сейвы v1–v3 отклоняются", () => {
    const old = JSON.parse(serializeSave(createEmptySave(1))) as Record<string, unknown>
    for (const version of [1, 2, 3]) expect(parseSave(JSON.stringify({ ...old, version })).ok).toBe(false)
  })
})
