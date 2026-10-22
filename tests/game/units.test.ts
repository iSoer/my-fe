import { describe, expect, it } from "vitest"
import fc from "fast-check"
import {
  allowedSkillIds,
  canTakeClassNow,
  combatStats,
  generateRoster,
  generateUnit,
  learnableNow,
  levelGains,
  loadoutsAt,
  openClasses,
  reclassUnit,
  statsAtLevel,
  visibleStats,
  weaponMt
} from "@game/core/units"
import { MAX_LEVEL, STATS } from "@game/core/types"
import { CLASS_IDS, DANCER_CLASS, classDef, classWeapons, fwClass, unitClass } from "@game/content/classes"
import { isMagicWeapon } from "@game/content/weapons"
import { ROSTER } from "@game/content/balance"
import { budgetRangeOf, loadCharacterModel } from "@/server/character-model/model"
import { levelOneStats, totalOfStats } from "@shared/character/leveling"
import { statsInClass } from "@shared/character/classes"
import { aptitudesOf } from "@shared/character/skills"

describe("generateUnit", () => {
  it("детерминирован по seed", () => {
    const a = generateUnit({ seed: 777, level: 10 })
    const b = generateUnit({ seed: 777, level: 10 })
    expect(a).toEqual(b)
  })
  it("боец — валидный персонаж модели в открытом классе (property)", () => {
    const model = loadCharacterModel()
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0x7fffffff }), fc.integer({ min: 1, max: MAX_LEVEL }), (seed, level) => {
        const u = generateUnit({ seed, level })
        expect(u.level).toBe(level)
        // Инварианты модели: бюджет 80-го уровня в ярусе редкости, кратность 5, статы 1-го уровня по формуле
        const { min, max } = budgetRangeOf(model, u.rarity)
        expect(totalOfStats(u.maxStats)).toBeGreaterThanOrEqual(min)
        expect(totalOfStats(u.maxStats)).toBeLessThanOrEqual(max)
        expect(Object.values(u.maxStats).every(v => v % 5 === 0)).toBe(true)
        expect(u.baseStats).toEqual(levelOneStats(u.maxStats, model.growth, model.rarities[u.rarity]))
        expect(canTakeClassNow(u, u.classId)).toBe(true)
        expect(classWeapons(u.classId)).toContain(u.weaponSkill)
        const vs = visibleStats(u)
        expect(vs.hp).toBeGreaterThan(0)
        for (const s of STATS) expect(vs[s]).toBeGreaterThanOrEqual(0)
        expect(u.learnable.length).toBeGreaterThan(0)
        // Каждый новый боец начинает с простым деревянным оружием своего навыка
        expect(u.skills.weapon).toBe(`${u.weaponSkill}_wood`)
        if (u.weaponSkill === "whiteMagic") expect(u.skills.assist).toBe("as_heal")
        if (u.classId === DANCER_CLASS) expect(u.skills.assist).toBe("as_dance")
      }),
      { numRuns: 300 }
    )
  })
  it("боевые статы — масштаб статов модели в классе; Atk от Str или Mag по оружию", () => {
    const u = generateUnit({ seed: 31337, level: 30 })
    const model = statsInClass(u.baseStats, u.maxStats, u.level, fwClass(u.classId))
    const physical = combatStats(model, false)
    const magical = combatStats(model, true)
    expect(statsAtLevel(u, u.level)).toEqual(
      isMagicWeapon(u.weaponSkill) ? magical : physical
    )
    expect(physical.def).toBe(magical.def)
    expect(physical.hp).toBe(Math.round(model.hp * 0.33) + 5)
  })
  it("рост детерминирован и не убывает до 80 уровня", () => {
    const u = generateUnit({ seed: 31337, level: 1 })
    const s1 = statsAtLevel(u, 1)
    const s80 = statsAtLevel(u, MAX_LEVEL)
    for (const s of STATS) expect(s80[s]).toBeGreaterThanOrEqual(s1[s])
    for (let l = 1; l < MAX_LEVEL; l++) {
      const a = statsAtLevel(u, l)
      const b = statsAtLevel(u, l + 1)
      for (const s of STATS) expect(b[s]).toBeGreaterThanOrEqual(a[s])
    }
    const gains = levelGains(u, 1, MAX_LEVEL)
    expect(Object.values(gains).reduce((a, b) => a + (b ?? 0), 0)).toBe(STATS.reduce((a, s) => a + (s80[s] - s1[s]), 0))
  })
  it("ранг оружия добавляет Mt: талант к 55-му уровню — S, +3", () => {
    const u = {
      ...generateUnit({ seed: 4242, level: 55, classId: "commoner", weaponSkill: "sword" }),
      weaponSkill: "sword" as const,
      aptitudes: aptitudesOf(["sword"])
    }
    const lowRank = { ...u, level: 1 }
    expect(weaponMt(u) - weaponMt(lowRank)).toBe(3)
  })
  it("у каждого класса есть изучаемые навыки", () => {
    for (const id of CLASS_IDS) {
      for (const w of classWeapons(id)) {
        expect(allowedSkillIds(classDef(id, w), "cat").length).toBeGreaterThan(3)
        expect(allowedSkillIds(classDef(id, w), "dog").length).toBeGreaterThan(3)
      }
    }
    const u = generateUnit({ seed: 1, level: 1 })
    expect(learnableNow(u).length).toBeGreaterThan(0)
  })
})

describe("generateRoster", () => {
  it("гарантии состава выполняются для многих seed", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0x7fffffff }), fc.integer({ min: 0, max: 700 }), (seed, glory) => {
        const r = generateRoster({ seed, glory })
        expect(r.length).toBe(glory >= 25 ? ROSTER.sizeWithGlory25 : ROSTER.size)
        const weapons = r.map(u => unitClass(u).weaponSkill)
        expect(weapons).toContain("whiteMagic")
        expect(weapons.filter(w => ["sword", "spear", "axe", "gauntlet"].includes(w)).length).toBeGreaterThanOrEqual(2)
        expect(weapons.some(w => ["bow", "blackMagic"].includes(w))).toBe(true)
        for (const w of ["sword", "spear", "axe"] as const) expect(weapons).toContain(w)
        expect(r.filter(u => u.classId === DANCER_CLASS).length).toBeLessThanOrEqual(1)
        expect(r.some(u => u.species === "cat")).toBe(true)
        expect(r.some(u => u.species === "dog")).toBe(true)
        if (glory >= 300) expect(r.some(u => u.rarity === 5)).toBe(true)
        expect(r.every(u => u.level === (glory >= 75 ? ROSTER.startLevelWithGlory75 : ROSTER.startLevel))).toBe(true)
        expect(new Set(r.map(u => u.id)).size).toBe(r.length)
      }),
      { numRuns: 150 }
    )
  })
  it("детерминирован", () => {
    expect(generateRoster({ seed: 5, glory: 0 })).toEqual(generateRoster({ seed: 5, glory: 0 }))
  })
})

describe("классы FW", () => {
  it("смена класса: только открытый, оружие остаётся в лапах, Dancer получает танец", () => {
    const u = generateUnit({ seed: 99, level: 40 })
    for (const id of openClasses(u)) {
      const next = reclassUnit(u, id)
      expect(next.classId).toBe(id)
      expect(next.weaponSkill).toBe(u.weaponSkill)
      expect(next.skills.weapon).toBe(u.skills.weapon)
      if (next.weaponSkill === "whiteMagic") expect(next.skills.assist).toBe("as_heal")
      if (next.classId === DANCER_CLASS) expect(next.skills.assist).toBe("as_dance")
      else expect(next.skills.assist).not.toBe("as_dance")
    }
    const closed = CLASS_IDS.find(id => !openClasses(u).includes(id))
    if (closed) expect(() => reclassUnit(u, closed)).toThrow()
  })
  it("комплекты врагов на уровне генерируются моделью", () => {
    for (const level of [1, 5, 20, 35, 45, 60, 80]) {
      const loadouts = loadoutsAt(level)
      expect(loadouts.length).toBeGreaterThan(0)
      for (const [i, l] of loadouts.entries()) {
        if (i % 7 !== 0) continue
        const u = generateUnit({
          seed: level * 1000 + i,
          level,
          classId: l.classId,
          weaponSkill: l.weaponSkill,
          isEnemy: true
        })
        expect(u.classId).toBe(l.classId)
        expect(u.weaponSkill).toBe(l.weaponSkill)
      }
    }
    expect(loadoutsAt(1).every(l => l.cls.tier === "base")).toBe(true)
    expect(loadoutsAt(20).some(l => l.cls.moveType === "flier")).toBe(true)
  })
})
