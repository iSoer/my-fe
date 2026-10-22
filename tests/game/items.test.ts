import { beforeEach, describe, expect, it } from "vitest"
import {
  $save,
  buyItemAction,
  ensureRoster,
  equipTalismanAction,
  equipWeaponAction,
  gameStarted,
  newGame,
  reclassAction,
  releaseUnit,
  scoutBattle,
  setPackAction,
  startBattle,
  updateSettings
} from "@game/state/save"
import { SAVE_VERSION, createEmptySave, parseSave, serializeSave } from "@game/core/save"
import { generateStore, itemPrice } from "@game/core/items"
import { lootShare, resolveBattle } from "@game/core/progression"
import { applyAction } from "@game/core/battle/reducer"
import { simulateCombat } from "@game/core/combat"
import { openClasses, visibleStats, weaponMt, weaponShortfall } from "@game/core/units"
import { ITEMS, REWARDS } from "@game/content/balance"
import { weaponDef } from "@game/content/weapons"
import type { SaveGame, UnitInstance } from "@game/core/types"
import { makeBattle, makeUnit } from "./helpers"

function freshGame(treats = 2000): void {
  const save = createEmptySave(1)
  save.profile.treats = treats
  save.profile.startedAt = 1
  $save.set(save)
  ensureRoster()
}

const firstUnit = (): UnitInstance => $save.get().army!.units[0]!

describe("Лавка", () => {
  beforeEach(() => freshGame())

  it("ассортимент детерминирован, растёт с уровнем ростера и Славой", () => {
    const army = $save.get().army!
    expect(generateStore(7, army, 0)).toEqual(generateStore(7, army, 0))
    const low = generateStore(7, army, 0)
    expect(low.weapons.every(id => weaponDef(id).grade !== "wood")).toBe(true)
    expect(low.weapons.some(id => weaponDef(id).grade === "steel")).toBe(false)
    const veteran = { ...army, units: army.units.map(u => ({ ...u, level: 40 })) }
    const high = generateStore(7, veteran, 150)
    expect(high.weapons.some(id => weaponDef(id).grade === "steel")).toBe(true)
    expect(high.weapons.some(id => weaponDef(id).grade === "silver")).toBe(true)
    expect(high.talismans.length).toBe(ITEMS.talismanOffers + 1)
    expect(high.consumables.length).toBeGreaterThan(low.consumables.length)
  })

  it("покупка списывает цену и кладёт в инвентарь; без денег и не из ассортимента — отказ", () => {
    const store = $save.get().store
    const id = store.consumables[0]!
    const before = $save.get().profile.treats
    expect(buyItemAction(id).ok).toBe(true)
    expect($save.get().inventory[id]).toBe(1)
    expect($save.get().profile.treats).toBe(before - itemPrice(id))
    expect(buyItemAction("tal_unknown").ok).toBe(false)
    $save.set({ ...$save.get(), profile: { ...$save.get().profile, treats: 0 } })
    const r = buyItemAction(store.weapons[0]!)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/Вкусняшек/)
  })
})

describe("снаряжение", () => {
  beforeEach(() => freshGame())

  it("оружие любого навыка: навык боя меняется, прежнее купленное возвращается в инвентарь", () => {
    const u = firstUnit()
    expect(weaponDef(u.skills.weapon).grade).toBe("wood")
    const other = u.weaponSkill === "axe" ? "spear" : "axe"
    $save.set({ ...$save.get(), inventory: { [`${other}_basic`]: 1, [`${other}_steel`]: 1 } })
    expect(equipWeaponAction(u.id, `${other}_basic`).ok).toBe(true)
    expect(firstUnit().weaponSkill).toBe(other)
    expect($save.get().inventory[`${other}_basic`]).toBeUndefined()
    expect(equipWeaponAction(u.id, `${other}_steel`).ok).toBe(true)
    expect($save.get().inventory[`${other}_basic`]).toBe(1)
    // деревянное бесплатно и в инвентарь не кладётся
    expect(equipWeaponAction(u.id, `${u.weaponSkill}_wood`).ok).toBe(true)
    expect($save.get().inventory[`${other}_steel`]).toBe(1)
    expect(Object.keys($save.get().inventory).some(id => id.endsWith("_wood"))).toBe(false)
    // чего нет в инвентаре — не взять
    expect(equipWeaponAction(u.id, `${other}_silver`).ok).toBe(false)
  })

  it("смена класса оставляет оружие в лапах", () => {
    $save.set({ ...$save.get(), inventory: { bow_basic: 1 } })
    const u = firstUnit()
    equipWeaponAction(u.id, "bow_basic")
    const cls = openClasses(firstUnit()).find(id => id !== u.classId)
    if (!cls) return
    expect(reclassAction(u.id, cls).ok).toBe(true)
    expect(firstUnit().skills.weapon).toBe("bow_basic")
    expect(firstUnit().weaponSkill).toBe("bow")
  })

  it("ранг навыка решает, как боец владеет оружием: ниже требуемого — штраф к Mt", () => {
    const u = makeUnit({ classId: "infantry_sword", pos: { x: 0, y: 0 } }, false)
    const iron = { ...u, skills: { ...u.skills, weapon: "sword_basic" } }
    const silver = { ...u, skills: { ...u.skills, weapon: "sword_silver" } }
    expect(weaponShortfall(iron)).toBe(0)
    expect(weaponShortfall(silver)).toBeGreaterThan(0)
    expect(weaponMt(silver)).toBeLessThan(weaponDef("sword_silver").mt)
    const master = { ...silver, aptitudes: { ...silver.aptitudes, sword: "talent" as const }, level: 60 }
    expect(weaponShortfall(master)).toBe(0)
    expect(weaponMt(master)).toBeGreaterThan(weaponDef("sword_silver").mt)
  })

  it("талисман: бонус к статам в прогнозе, прежний возвращается, отпущенный оставляет снаряжение", () => {
    $save.set({ ...$save.get(), inventory: { tal_fang: 1, tal_bell: 1, sword_steel: 1 } })
    const u = firstUnit()
    const atk = visibleStats(u).atk
    expect(equipTalismanAction(u.id, "tal_fang").ok).toBe(true)
    expect(visibleStats(firstUnit()).atk).toBe(atk + 3)
    expect(equipTalismanAction(u.id, "tal_bell").ok).toBe(true)
    expect($save.get().inventory.tal_fang).toBe(1)
    equipWeaponAction(u.id, "sword_steel")
    releaseUnit(u.id)
    expect($save.get().inventory.tal_bell).toBe(1)
    expect($save.get().inventory.sword_steel).toBe(1)
  })

  it("талисман работает в бою: прогноз учитывает бонус, «фольга» снимает эффективность", () => {
    const flat = { hp: 40, atk: 20, spd: 5, def: 5, res: 5 }
    const b = makeBattle(
      [{ classId: "infantry_bow", pos: { x: 2, y: 5 }, baseStats: flat }],
      [{ classId: "flier_sword", pos: { x: 2, y: 3 }, baseStats: flat }]
    )
    const p = b.players[0]!.id
    const e = b.enemies[0]!.id
    const eff = simulateCombat(b.state, p, e, { x: 2, y: 5 }).strikes[0]!
    expect(eff.effective).toBe(true)
    const foil = structuredClone(b.state)
    foil.roster[e] = { ...foil.roster[e]!, accessory: "tal_foil" }
    const plain = simulateCombat(foil, p, e, { x: 2, y: 5 }).strikes[0]!
    expect(plain.effective).toBe(false)
    expect(plain.damage).toBeLessThan(eff.damage)
    const fang = structuredClone(b.state)
    fang.roster[p] = { ...fang.roster[p]!, accessory: "tal_fang" }
    expect(simulateCombat(fang, p, e, { x: 2, y: 5 }).strikes[0]!.damage).toBeGreaterThan(eff.damage)
  })
})

describe("предметы в бою", () => {
  it("лечение: на себя и соседа, тратит действие и предмет; дальше соседа — нельзя", () => {
    const b = makeBattle(
      [
        { classId: "infantry_sword", pos: { x: 2, y: 5 }, baseStats: { hp: 40 } },
        { classId: "infantry_axe", pos: { x: 3, y: 5 }, baseStats: { hp: 40 } },
        { classId: "infantry_spear", pos: { x: 5, y: 7 }, baseStats: { hp: 40 } }
      ],
      [{ classId: "infantry_sword", pos: { x: 0, y: 0 } }]
    )
    const st = structuredClone(b.state)
    st.pack = { itm_bandage: 2 }
    const [a, n, far] = b.players.map(u => u.id) as [string, string, string]
    st.units[n]!.hp = 20
    st.units[far]!.hp = 20
    expect(() => applyAction(st, { type: "item", unitId: a, to: { x: 2, y: 5 }, targetId: far, itemId: "itm_bandage" })).toThrow()
    const { state, events } = applyAction(st, { type: "item", unitId: a, to: { x: 2, y: 5 }, targetId: n, itemId: "itm_bandage" })
    expect(state.units[n]!.hp).toBe(30)
    expect(state.units[a]!.acted).toBe(true)
    expect(state.pack.itm_bandage).toBe(1)
    expect(events.some(e => e.type === "item")).toBe(true)
    const again = { type: "item", unitId: a, to: { x: 2, y: 5 }, targetId: a, itemId: "itm_bandage" } as const
    expect(() => applyAction(state, again)).toThrow()
  })

  it("котелок лечит всех вокруг, валерьянка снимает штрафы, пустой рюкзак — отказ", () => {
    const b = makeBattle(
      [
        { classId: "infantry_sword", pos: { x: 2, y: 5 }, baseStats: { hp: 40 } },
        { classId: "infantry_axe", pos: { x: 2, y: 7 }, baseStats: { hp: 40 } }
      ],
      [{ classId: "infantry_sword", pos: { x: 0, y: 0 } }]
    )
    const [a, n] = b.players.map(u => u.id) as [string, string]
    const st = structuredClone(b.state)
    st.pack = { itm_stew: 1, itm_valerian: 1 }
    st.units[a]!.hp = 10
    st.units[n]!.hp = 10
    const r = applyAction(st, { type: "item", unitId: a, to: { x: 2, y: 5 }, targetId: a, itemId: "itm_stew" })
    expect(r.state.units[a]!.hp).toBe(18)
    expect(r.state.units[n]!.hp).toBe(18)
    r.state.units[n]!.penalties = { atk: -4 }
    const v = applyAction(r.state, { type: "item", unitId: n, to: { x: 2, y: 6 }, targetId: n, itemId: "itm_valerian" })
    expect(v.state.units[n]!.penalties).toEqual({})
    expect(v.state.pack).toEqual({})
    expect(() => applyAction(b.state, { type: "item", unitId: a, to: { x: 2, y: 5 }, targetId: a, itemId: "itm_kit" })).toThrow()
  })

  it("рюкзак: не больше packSize, списывается при старте боя, остаток возвращается после", () => {
    freshGame()
    $save.set({ ...$save.get(), inventory: { itm_bandage: 10 } })
    expect(scoutBattle("easy", "yard").ok).toBe(true)
    expect(setPackAction({ itm_bandage: ITEMS.packSize + 1 }).ok).toBe(false)
    expect(setPackAction({ itm_bandage: 3 }).ok).toBe(true)
    expect(startBattle($save.get().army!.squadIds).ok).toBe(true)
    expect($save.get().inventory.itm_bandage).toBe(7)
    expect($save.get().battle!.pack).toEqual({ itm_bandage: 3 })
  })
})

describe("награды за исход", () => {
  function resolved(result: "victory" | "defeat" | "retreat") {
    const b = makeBattle(
      [{ classId: "infantry_sword", pos: { x: 2, y: 5 } }],
      [{ classId: "infantry_sword", pos: { x: 0, y: 0 } }]
    )
    const st = structuredClone(b.state)
    st.result = result
    st.stats.loot = 100
    st.pack = { itm_bandage: 2 }
    const save: SaveGame = {
      ...createEmptySave(1),
      army: { id: "a", units: b.players, squadIds: b.players.map(u => u.id), createdAt: 1, battles: 0, wins: 0 }
    }
    return resolveBattle(save, st, 5000)
  }

  it("победа — всё выбитое и бонус; поражение и отступление — только часть выбитого", () => {
    const win = resolved("victory")
    const lose = resolved("defeat")
    const flee = resolved("retreat")
    expect(win.summary.rewards.lost).toBe(0)
    expect(win.summary.rewards.treats).toBeGreaterThan(100)
    expect(lose.summary.rewards.treats).toBe(Math.round(100 * REWARDS.defeatLootShare))
    expect(lose.summary.rewards.lost).toBe(100 - lose.summary.rewards.treats)
    expect(flee.summary.rewards.treats).toBe(Math.round(100 * REWARDS.retreatLootShare))
    expect(lootShare("defeat")).toBeLessThan(lootShare("retreat"))
    // остаток рюкзака возвращается, Лавка обновлена
    expect(lose.inventory.itm_bandage).toBe(2)
    expect(lose.store.fresh).toBe(true)
  })
})

describe("главный экран и сейв v6", () => {
  it("«Новая игра» сбрасывает прогресс, но сохраняет настройки", () => {
    freshGame()
    updateSettings({ animSpeed: 2, blood: "pools" })
    $save.set({ ...$save.get(), inventory: { itm_kit: 3 }, profile: { ...$save.get().profile, glory: 500 } })
    newGame()
    const s = $save.get()
    expect(gameStarted(s)).toBe(true)
    expect(s.profile.glory).toBe(0)
    expect(s.profile.treats).toBe(0)
    expect(s.inventory).toEqual({})
    expect(s.army!.units.length).toBeGreaterThan(0)
    expect(s.store.weapons.length).toBeGreaterThan(0)
    expect(s.settings.animSpeed).toBe(2)
    expect(s.settings.blood).toBe("pools")
    expect(gameStarted(createEmptySave(1))).toBe(false)
  })

  it("v5 → v6: изученные разновидности оружия — в инвентарь, пулы навыков без оружия, игра начата", () => {
    freshGame()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- сырой JSON сейва v5
    const raw = JSON.parse(serializeSave($save.get())) as Record<string, any>
    raw.version = 5
    delete raw.inventory
    delete raw.store
    delete raw.village
    delete raw.profile.startedAt
    const unit = raw.army.units[0]
    unit.skills.weapon = "sword_killer"
    unit.weaponSkill = "sword"
    unit.learned = [...unit.learned, "sword_killer", "sword_brave"]
    unit.learnable = [...unit.learnable, "sword_armorslayer"]
    const r = parseSave(JSON.stringify(raw))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.save.version).toBe(SAVE_VERSION)
    expect(r.save.inventory).toEqual({ sword_brave: 1 })
    const u = r.save.army!.units[0]!
    expect(u.skills.weapon).toBe("sword_killer")
    expect(u.learned.some(id => id.startsWith("sword_"))).toBe(false)
    expect(u.learnable).not.toContain("sword_armorslayer")
    expect(r.save.profile.startedAt).toBeDefined()
    expect(r.save.store.weapons).toEqual([])
  })
})
