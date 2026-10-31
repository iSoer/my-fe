import { xpOfRank } from "@game/core/units/proficiency"
import { describe, expect, it } from "vitest"
import fc from "fast-check"
import {
  allowedSkillIds,
  COMMON_SKILLS,
  equipSkill,
  equipWeapon,
  learnSkill,
  skillUsable,
  attackOf,
  canTakeClassNow,
  combatStats,
  generateRoster,
  generateUnit,
  growthRates,
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
import { CLASS_IDS, DANCER_CLASS, classDef, classWeapons, unitClass } from "@game/content/classes"
import { classStatMods } from "@game/content/classStats"
import { isMagicWeapon } from "@game/content/weapons"
import { ROSTER } from "@game/content/balance"
import { budgetRangeOf, loadCharacterModel } from "@model/character-model/model"
import { levelOneStats, totalOfStats } from "@shared/character/leveling"

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
  it("статы 1-го уровня — масштаб модели с множителем класса; у каждого есть и Str, и Mag", () => {
    const u = generateUnit({ seed: 31337, level: 30 })
    const own = combatStats(u.baseStats)
    const mods = classStatMods(u.classId)
    const first = statsAtLevel(u, 1)
    for (const s of STATS) expect(first[s], s).toBe(Math.max(1, Math.round(own[s] * (1 + mods[s] / 100))))
    expect(own.str).toBe(Math.max(1, Math.round((u.baseStats.attack - 15) * 0.22)))
    expect(own.mag).toBe(Math.max(1, Math.round((u.baseStats.specialAttack - 15) * 0.22)))
    expect(own.hp).toBe(Math.round(u.baseStats.hp * 0.33) + 5)
    // Mt оружия идёт в стат, которым оно бьёт; второй атакующий стат остаётся своим
    const vs = visibleStats(u)
    const lv = statsAtLevel(u, u.level)
    const [hit, other] = isMagicWeapon(u.weaponSkill) ? (["mag", "str"] as const) : (["str", "mag"] as const)
    expect(vs[hit]).toBe(lv[hit] + weaponMt(u))
    expect(vs[other]).toBe(lv[other])
    expect(attackOf(u)).toBe(vs[hit])
  })
  it("рост в духе FEH: к 80-му уровню каждый стат вырастает на свой процент роста, уровни разные", () => {
    const u = generateUnit({ seed: 4242, level: 1 })
    const rates = growthRates(u)
    const first = statsAtLevel(u, 1)
    const last = statsAtLevel(u, MAX_LEVEL)
    const total = STATS.reduce((sum, s) => sum + (last[s] - first[s]), 0)
    // Гарантия «минимум два стата» может добавить прибавок, но не отнять
    expect(total).toBeGreaterThanOrEqual(STATS.reduce((sum, s) => sum + Math.round((rates[s] * (MAX_LEVEL - 1)) / 100), 0))
    // Уровни различаются: встречаются уровни и с двумя, и с тремя и более статами
    const sizes = new Set<number>()
    for (let l = 1; l < MAX_LEVEL; l++) sizes.add(Object.values(levelGains(u, l, l + 1)).filter(g => (g ?? 0) > 0).length)
    expect(sizes.has(2)).toBe(true)
    expect([...sizes].some(k => k >= 3)).toBe(true)
  })
  it("класс меняет и статы, и их рост: у латника Def выше, Res ниже, чем у того же бойца-солдата без множителей", () => {
    const u = generateUnit({ seed: 99, level: 40 })
    const knight = { ...u, classId: "armored-knight" }
    const plain = { ...u, classId: "__none__" }
    expect(growthRates(knight).def).toBeGreaterThan(growthRates(plain).def)
    expect(growthRates(knight).res).toBeLessThan(growthRates(plain).res)
    expect(statsAtLevel(knight, 40).def).toBeGreaterThan(statsAtLevel(plain, 40).def)
    expect(statsAtLevel(knight, 40).res).toBeLessThan(statsAtLevel(plain, 40).res)
  })
  it("статы не бывают 0, а каждый уровень растит хотя бы два разных стата (property)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0x7fffffff }), (seed) => {
        const u = generateUnit({ seed, level: 1 })
        for (const s of STATS) expect(statsAtLevel(u, 1)[s]).toBeGreaterThanOrEqual(1)
        for (let l = 1; l < MAX_LEVEL; l++) {
          const gains = levelGains(u, l, l + 1)
          expect(Object.values(gains).filter(g => (g ?? 0) >= 1).length, `level ${l}`).toBeGreaterThanOrEqual(2)
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
  it("ранг оружия добавляет Mt: от E до S — +3, уровень сам по себе ранг не меняет", () => {
    const base = { ...generateUnit({ seed: 4242, level: 55, classId: "gladiator", weaponSkill: "sword" }), weaponSkill: "sword" as const }
    const master = { ...base, skillXp: { ...base.skillXp, sword: xpOfRank("S") } }
    const novice = { ...base, skillXp: { ...base.skillXp, sword: 0 } }
    expect(weaponMt(master) - weaponMt(novice)).toBe(3)
    expect(weaponMt({ ...master, level: 1 })).toBe(weaponMt(master))
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
        // Только открытые звёзды и не выше ★4 (★5 — только перерождением); Слава 300 — гарантирован боец высшей из них
        const top = Math.min(maxRarity, 4)
        expect(r.every(u => STARTER_CLASSES.includes(u.classId))).toBe(true)
        expect(r.every(u => u.rarity <= top)).toBe(true)
        if (glory >= 300) expect(r.some(u => u.rarity === top)).toBe(true)
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

describe("навыки: пул, слот и смена класса/оружия", () => {
  const sword = () => ({ ...generateUnit({ seed: 11, level: 10, classId: "gladiator", weaponSkill: "sword", rarity: 3 }), sp: 5000 })

  it("learnSkill не учит навык вне пула бойца (посох-спецприём мечнику)", () => {
    const u = sword()
    expect(learnableNow(u)).not.toContain("sp_imbue")
    expect(() => learnSkill(u, "sp_imbue")).toThrow()
    const common = COMMON_SKILLS.find(id => !u.learned.includes(id))!
    expect(learnSkill(u, common).learned).toContain(common)
  })

  it("equipSkill проверяет слот и доступность навыка классу", () => {
    const u = { ...sword(), learned: [...sword().learned, "sp_glimmer", "b_iron_hide"] }
    expect(() => equipSkill(u, "sp_glimmer", "a")).toThrow()
    expect(equipSkill(u, "sp_glimmer", "special").skills.special).toBe("sp_glimmer")
    // Железная шкура — только латникам
    expect(skillUsable(u, "b_iron_hide")).toBe(false)
    expect(() => equipSkill(u, "b_iron_hide", "b")).toThrow()
  })

  it("смена оружия снимает навыки, которые стали недоступны, но оставляет их изученными", () => {
    const base = generateUnit({ seed: 12, level: 10, classId: "healer", weaponSkill: "whiteMagic", rarity: 3 })
    const healer = { ...base, learned: [...base.learned, "sp_imbue"], skills: { ...base.skills, special: "sp_imbue" } }
    const armed = equipWeapon(healer, "sword_basic")
    expect(armed.skills.special).toBeUndefined()
    expect(armed.skills.assist).toBeUndefined()
    expect(armed.learned).toContain("sp_imbue")

    const hunter = generateUnit({ seed: 13, level: 10, classId: "hunter", weaponSkill: "bow", rarity: 3 })
    const counter = { ...hunter, learned: [...hunter.learned, "a_close_counter"], skills: { ...hunter.skills, a: "a_close_counter" } }
    expect(skillUsable(counter, "a_close_counter")).toBe(true)
    const melee = equipWeapon(counter, "sword_basic")
    expect(melee.skills.a).toBeUndefined()
    expect(melee.learned).toContain("a_close_counter")
  })
})
