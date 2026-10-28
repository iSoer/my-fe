import { beforeEach, describe, expect, it } from "vitest"
import { $save, ensureRoster, scoutBattle, startBattle } from "@game/state/save"
import { orderDrinkAction } from "@game/state/settlement"
import { createEmptySave, parseSave, serializeSave } from "@game/core/save"
import { canOrderDrink, drinkForBattle, drinkPct, drinksAt } from "@game/core/settlement/tavern"
import { BUILDINGS, TAVERN_MENU } from "@game/content/settlement"
import { DRINKS, TAVERN, drinkDef } from "@game/content/tavern"
import { createBattle, unitStatsInBattle } from "@game/core/battle/reducer"
import { generateMap } from "@game/core/map/generate"
import { generateUnit, visibleStats } from "@game/core/units"
import { STATS, type SaveGame } from "@game/core/types"

const s = (): SaveGame => $save.get()

function withTavern(level: number, treats = 10_000): void {
  const save = s()
  $save.set({
    ...save,
    profile: { ...save.profile, treats },
    settlement: { ...save.settlement, buildings: { ...save.settlement.buildings, tavern: { level, builtAt: 1 } } }
  })
}

describe("бар: меню и сила напитков", () => {
  it("около десяти сортов, у каждого свои статы в процентах; меню растёт с уровнем до всех сортов", () => {
    expect(DRINKS.length).toBe(10)
    expect(new Set(DRINKS.map(d => d.id)).size).toBe(DRINKS.length)
    for (const d of DRINKS) {
      expect(Object.values(d.pct).some(v => (v ?? 0) > 0)).toBe(true)
      expect(d.price).toBeGreaterThan(0)
    }
    for (let lv = 1; lv <= 5; lv++) expect(drinksAt(lv).length).toBe(TAVERN_MENU[lv - 1])
    expect(drinksAt(5).length).toBe(DRINKS.length)
    expect(drinksAt(0)).toEqual([])
    expect(BUILDINGS.tavern.cost.length).toBe(5)
  })

  it("на 1-м уровне бара слабее всего, на 5-м — сильнее всего, по каждому стату", () => {
    for (let i = 1; i < TAVERN.power.length; i++) expect(TAVERN.power[i]).toBeGreaterThan(TAVERN.power[i - 1]!)
    for (const d of DRINKS) {
      const weak = drinkPct(d, 1)
      const strong = drinkPct(d, 5)
      for (const st of STATS) {
        if (!d.pct[st]) continue
        expect(weak[st]).toBe(d.pct[st])
        expect(strong[st]!).toBeGreaterThan(weak[st]!)
      }
    }
  })
})

describe("бар: заказ на одну вылазку", () => {
  beforeEach(() => {
    $save.set(createEmptySave(1))
    ensureRoster()
  })

  it("без бара и сорт выше уровня — нельзя; заказ списывает цену; вторая кружка — нельзя", () => {
    expect(canOrderDrink(s(), "pale_ale").ok).toBe(false)
    withTavern(1, 100)
    expect(canOrderDrink(s(), "last_stand").ok).toBe(false)
    expect(orderDrinkAction("pale_ale").ok).toBe(true)
    expect(s().profile.treats).toBe(100 - drinkDef("pale_ale")!.price)
    expect(s().settlement.drink).toEqual({ id: "pale_ale", level: 1 })
    expect(orderDrinkAction("stoker_porter").ok).toBe(false)
    withTavern(1, 0)
    $save.set({ ...s(), settlement: { ...s().settlement, drink: undefined } })
    expect(orderDrinkAction("pale_ale").ok).toBe(false)
  })

  it("кружка выпивается в начале боя: в бою прибавка, после — заказа нет; сейв это переживает", () => {
    withTavern(5)
    expect(orderDrinkAction("last_stand").ok).toBe(true)
    scoutBattle("easy")
    const squad = s().army!.squadIds
    expect(startBattle(squad).ok).toBe(true)
    expect(s().settlement.drink).toBeUndefined()
    const battle = s().battle!
    expect(battle.drink?.id).toBe("last_stand")
    const id = squad[0]!
    const base = visibleStats(battle.roster[id]!)
    const live = unitStatsInBattle(battle, id)!
    for (const st of ["str", "def", "spd"] as const) expect(live[st]).toBeGreaterThan(base[st])
    expect(battle.units[id]!.maxHp).toBeGreaterThan(base.hp)
    expect(battle.units[id]!.hp).toBe(battle.units[id]!.maxHp)
    const back = parseSave(serializeSave(s()))
    expect(back.ok && back.save.battle?.drink).toEqual(battle.drink)
  })
})

describe("бар: напиток в бою", () => {
  it("прибавка — процент от стата (не меньше +1), только бойцам игрока; без напитка бой прежний", () => {
    const map = generateMap({ seed: 5, biomeId: "yard", difficulty: "normal", team: 1, squadSize: 1 })
    const hero = generateUnit({ seed: 3, level: 10, rarity: 1, classId: "soldier", weaponSkill: "spear" })
    const drink = drinkForBattle({ id: "oak_stout", level: 5 })!
    const plain = createBattle({ map, squad: [hero], seed: 1, now: 1 }).state
    const drunk = createBattle({ map, squad: [hero], seed: 1, now: 1, drink }).state
    const base = visibleStats(hero)
    expect(unitStatsInBattle(plain, hero.id)!.def).toBe(base.def)
    expect(unitStatsInBattle(drunk, hero.id)!.def).toBe(base.def + Math.max(1, Math.round((base.def * drink.pct.def!) / 100)))
    expect(unitStatsInBattle(drunk, hero.id)!.str).toBe(base.str)
    const foe = map.enemies[0]!.unit.id
    expect(unitStatsInBattle(drunk, foe)).toEqual(unitStatsInBattle(plain, foe))
  })
})
