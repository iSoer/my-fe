import { describe, expect, it } from "vitest"
import { createEmptySave, parseSave, serializeSave } from "@game/core/save"
import { generateRoster } from "@game/core/units"
import { generateMap } from "@game/core/map/generate"
import { createBattle } from "@game/core/battle/reducer"

describe("save", () => {
  it("пустой сейв проходит валидацию и round-trip", () => {
    const s = createEmptySave(1)
    const r = parseSave(serializeSave(s))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.save).toEqual(s)
  })
  it("сейв с армией и боем проходит round-trip", () => {
    const s = createEmptySave(1)
    const units = generateRoster({ seed: 3, glory: 0 }).slice(0, 4)
    s.army = { id: "a", units, squadIds: units.map(u => u.id), createdAt: 1, battles: 0, wins: 0 }
    const map = generateMap({
      seed: 3,
      biomeId: "yard",
      difficulty: "hard",
      team: 0,
      squadSize: 4
    })
    s.battle = createBattle({ map, squad: units, seed: 3, now: 1 }).state
    const r = parseSave(serializeSave(s))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.save.battle?.units).toEqual(s.battle.units)
  })
  it("битый JSON и неверная схема отклоняются", () => {
    expect(parseSave("{").ok).toBe(false)
    expect(parseSave("{\"version\":1}").ok).toBe(false)
  })
  it("v6 → v7: Commoner / Noble / Diviner где угодно в сейве становятся стартовым классом по оружию", () => {
    const s = createEmptySave(1)
    const units = generateRoster({ seed: 9, glory: 0 }).slice(0, 4)
    const old = [
      { ...units[0]!, classId: "commoner", weaponSkill: "spear" as const },
      { ...units[1]!, classId: "diviner", weaponSkill: "whiteMagic" as const },
      { ...units[2]!, classId: "diviner", weaponSkill: "blackMagic" as const },
      { ...units[3]!, classId: "noble", weaponSkill: "sword" as const }
    ]
    s.army = { id: "a", units: old, squadIds: [], createdAt: 1, battles: 0, wins: 0 }
    s.shelter = { candidates: [{ ...units[0]!, classId: "commoner", weaponSkill: "bow" }], seed: 1 }
    const raw = { ...JSON.parse(serializeSave(s)), version: 6 }
    const r = parseSave(JSON.stringify(raw))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.save.version).toBe(7)
    expect(r.save.army!.units.map(u => u.classId)).toEqual(["soldier", "healer", "mage", "gladiator"])
    expect(r.save.shelter.candidates[0]!.classId).toBe("hunter")
  })
})
