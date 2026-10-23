import { describe, expect, it } from "vitest"
import fc from "fast-check"
import {
  allowedSkillIds,
  attackOf,
  canTakeClassNow,
  combatStats,
  generateRoster,
  generateUnit,
  learnableNow,
  levelGains,
  loadoutsAt,
  openClasses,
  reclassUnit,
  STARTER_CLASSES,
  statsAtLevel,
  visibleStats,
  weaponMt
} from "@game/core/units"
import { MAX_LEVEL, STATS, type Rarity } from "@game/core/types"
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
        for (const s of STATS) expect(vs[s]).toBeGreaterThanOrEqual(1)
        expect(u.learnable.length).toBeGreaterThan(0)
        // Каждый новый боец начинает с простым деревянным оружием своего навыка
        expect(u.skills.weapon).toBe(`${u.weaponSkill}_wood`)
        if (u.weaponSkill === "whiteMagic") expect(u.skills.assist).toBe("as_heal")
        if (u.classId === DANCER_CLASS) expect(u.skills.assist).toBe("as_dance")
      }),
      { numRuns: 300 }
    )
  })
  it("боевые статы — масштаб статов модели в классе; у каждого есть и Str, и Mag", () => {
    const u = generateUnit({ seed: 31337, level: 30 })
    const model = statsInClass(u.baseStats, u.maxStats, u.level, fwClass(u.classId))
    const natural = combatStats(model)
    // На 1-м уровне — ровно масштаб модели; дальше — не ниже него (плюс надбавки за «пустые» уровни)
    const model1 = statsInClass(u.baseStats, u.maxStats, 1, fwClass(u.classId))
    expect(statsAtLevel(u, 1)).toEqual(combatStats(model1))
    for (const s of STATS) expect(statsAtLevel(u, u.level)[s]).toBeGreaterThanOrEqual(natural[s])
    expect(natural.str).toBe(Math.max(1, Math.round((model.attack - 15) * 0.22)))
    expect(natural.mag).toBe(Math.max(1, Math.round((model.specialAttack - 15) * 0.22)))
    expect(natural.hp).toBe(Math.round(model.hp * 0.33) + 5)
    // Mt оружия идёт в стат, которым оно бьёт; второй атакующий стат остаётся своим
    const vs = visibleStats(u)
    const own = statsAtLevel(u, u.level)
    const [hit, other] = isMagicWeapon(u.weaponSkill) ? (["mag", "str"] as const) : (["str", "mag"] as const)
    expect(vs[hit]).toBe(own[hit] + weaponMt(u))
    expect(vs[other]).toBe(own[other])
    expect(attackOf(u)).toBe(vs[hit])
  })
  it("статы не бывают 0, а каждый уровень прибавляет хотя бы 1 (property)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0x7fffffff }), (seed) => {
        const u = generateUnit({ seed, level: 1 })
        for (const s of STATS) expect(statsAtLevel(u, 1)[s]).toBeGreaterThanOrEqual(1)
        for (let l = 1; l < MAX_LEVEL; l++) {
          const gains = levelGains(u, l, l + 1)
          expect(Object.values(gains).some(g => (g ?? 0) >= 1), `level ${l}`).toBe(true)
        }
      }),
      { numRuns: 100 }
    )
  })
  it("стат модели ниже порога шкалы даёт 1, а не 0", () => {
    const low = { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 }
    expect(combatStats(low)).toEqual({ hp: 5, str: 1, mag: 1, spd: 1, def: 1, res: 1 })
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
      ...generateUnit({ seed: 4242, level: 55, classId: "gladiator", weaponSkill: "sword" }),
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
      fc.property(fc.integer({ min: 0, max: 0x7fffffff }), fc.integer({ min: 0, max: 700 }), fc.constantFrom<Rarity>(1, 2, 3, 4, 5), (seed, glory, maxRarity) => {
        const r = generateRoster({ seed, glory, maxRarity })
        expect(r.length).toBe(glory >= 25 ? ROSTER.sizeWithGlory25 : ROSTER.size)
        const weapons = r.map(u => unitClass(u).weaponSkill)
        expect(weapons).toContain("whiteMagic")
        expect(weapons.filter(w => ["sword", "spear", "axe", "gauntlet"].includes(w)).length).toBeGreaterThanOrEqual(2)
        expect(weapons.some(w => ["bow", "blackMagic"].includes(w))).toBe(true)
        for (const w of ["sword", "spear", "axe"] as const) expect(weapons).toContain(w)
        expect(r.filter(u => u.classId === DANCER_CLASS).length).toBeLessThanOrEqual(1)
        expect(r.some(u => u.species === "cat")).toBe(true)
        expect(r.some(u => u.species === "dog")).toBe(true)
        // Только открытые звёзды; Слава 300 — гарантирован боец высшей открытой
        expect(r.every(u => STARTER_CLASSES.includes(u.classId))).toBe(true)
        expect(r.every(u => u.rarity <= maxRarity)).toBe(true)
        if (glory >= 300) expect(r.some(u => u.rarity === maxRarity)).toBe(true)
        expect(r.every(u => u.level === (glory >= 75 ? ROSTER.startLevelWithGlory75 : ROSTER.startLevel))).toBe(true)
        expect(new Set(r.map(u => u.id)).size).toBe(r.length)
      }),
      { numRuns: 150 }
    )
    // generateRoster собирает состав отбраковкой (~10 попыток в среднем) — на медленном CI 150 прогонов не влезают в 5 с
  }, 30_000)
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
    expect(loadoutsAt(1).every(l => l.cls.tier === "beginner")).toBe(true)
    expect(loadoutsAt(20).some(l => l.cls.moveType === "flier")).toBe(true)
  })
})
