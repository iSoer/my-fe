import { beforeEach, describe, expect, it } from "vitest"
import { $save, ensureRoster, scoutBattle, startBattle } from "@game/state/save"
import { createEmptySave } from "@game/core/save"
import { neededWeapons, reinforcements, resolveBattle } from "@game/core/progression"
import { canTakeClassNow, generateUnit } from "@game/core/units"
import { SQUAD_SIZE, type Army, type BattleState, type UnitInstance } from "@game/core/types"

const NOW = Date.UTC(2026, 9, 1)

function armyOf(units: UnitInstance[]): Army {
  return { id: "a", units, squadIds: units.slice(0, SQUAD_SIZE).map(u => u.id), createdAt: 1, battles: 0, wins: 0 }
}

const unitWith = (seed: number, classId: string, weaponSkill: UnitInstance["weaponSkill"], level = 12) =>
  generateUnit({ seed, level, classId, weaponSkill, rarity: 1 })

describe("пополнение отряда: какие роли нужнее", () => {
  it("сначала ближник, потом лекарь, дальник, второй ближник и недостающие цвета треугольника", () => {
    expect(neededWeapons([])).toEqual(["sword", "spear", "axe"])
    expect(neededWeapons([{ weaponSkill: "whiteMagic" }])).toEqual(["sword", "spear", "axe"])
    expect(neededWeapons([{ weaponSkill: "sword" }])).toEqual(["whiteMagic"])
    expect(neededWeapons([{ weaponSkill: "sword" }, { weaponSkill: "whiteMagic" }])).toEqual(["bow", "blackMagic"])
    expect(neededWeapons([{ weaponSkill: "sword" }, { weaponSkill: "whiteMagic" }, { weaponSkill: "bow" }])).toEqual(["spear", "axe"])
  })

  it("выживший лекарь получает ближника, дальника и второго ближника — уровня ростера, в открытых классах", () => {
    const healer = unitWith(1, "healer", "whiteMagic", 20)
    const army = armyOf([healer])
    const recruits = reinforcements(7, army, { maxRarity: 1 }, NOW)
    expect(recruits.length).toBe(SQUAD_SIZE - 1)
    const skills = [healer, ...recruits].map(u => u.weaponSkill)
    expect(skills.filter(s => ["sword", "spear", "axe", "gauntlet"].includes(s)).length).toBeGreaterThanOrEqual(2)
    expect(skills.some(s => s === "bow" || s === "blackMagic")).toBe(true)
    for (const u of recruits) {
      expect(canTakeClassNow(u, u.classId)).toBe(true)
      expect(Math.abs(u.level - 20)).toBeLessThanOrEqual(1)
      expect(u.rarity).toBe(1)
    }
    // Полный отряд — пополнения нет
    expect(reinforcements(7, armyOf([healer, ...recruits]), { maxRarity: 1 }, NOW)).toEqual([])
  })
})

describe("пополнение после боя", () => {
  beforeEach(() => {
    $save.set(createEmptySave(1))
    ensureRoster()
    // В армии ровно отряд: запасных в Казармах нет
    const s = $save.get()
    const squad = s.army!.units.slice(0, SQUAD_SIZE)
    $save.set({ ...s, army: armyOf(squad) })
    scoutBattle("easy")
    expect(startBattle(squad.map(u => u.id)).ok).toBe(true)
  })

  function finishWith(dead: number): ReturnType<typeof resolveBattle> {
    const s = $save.get()
    const state = structuredClone(s.battle) as BattleState
    const players = Object.values(state.units).filter(u => u.side === "player")
    for (const u of players.slice(0, dead)) {
      u.alive = false
      u.hp = 0
    }
    state.result = "retreat"
    return resolveBattle(s, state, NOW)
  }

  it("пало трое из четырёх — трое новобранцев приходят сами и встают в отряд; итоги их называют", () => {
    const res = finishWith(3)
    expect(res.army!.units.length).toBe(SQUAD_SIZE)
    expect(res.army!.squadIds.length).toBe(SQUAD_SIZE)
    expect(res.summary.recruits?.length).toBe(3)
    expect(res.summary.armyFell).toBe(false)
  })

  it("все живы — пополнения нет; пали все — пополнения нет (будет новый стартовый ростер)", () => {
    expect(finishWith(0).summary.recruits).toBeUndefined()
    const wiped = finishWith(SQUAD_SIZE)
    expect(wiped.army).toBeUndefined()
    expect(wiped.summary.recruits).toBeUndefined()
  })

  it("застрявший сейв (бойцов меньше отряда, Вкусняшек нет) выручается при подготовке вылазки", () => {
    const s = $save.get()
    const lone = s.army!.units.slice(0, 1)
    const next = { ...s, army: armyOf(lone), profile: { ...s.profile, treats: 0 } }
    delete next.battle
    $save.set(next)
    ensureRoster()
    expect($save.get().army!.units.length).toBe(SQUAD_SIZE)
    expect($save.get().army!.squadIds.length).toBe(SQUAD_SIZE)
    expect($save.get().army!.units[0]!.id).toBe(lone[0]!.id)
  })
})
