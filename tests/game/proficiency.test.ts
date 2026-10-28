import { describe, expect, it } from "vitest"
import fc from "fast-check"
import { applyAction } from "@game/core/battle/reducer"
import { generateUnit, rebirthUnit, canTakeClassNow, weaponRank } from "@game/core/units"
import {
  classAffinity,
  classPresetStats,
  classPresets,
  gainSkillXp,
  presetSkillXp,
  rankOfXp,
  skillRank,
  startingSkillXp,
  unitRanks,
  xpOfRank
} from "@game/core/units/proficiency"
import { generateRewardChoice, generateShop } from "@game/core/progression"
import { parseSave, serializeSave, createEmptySave } from "@game/core/save"
import { APTITUDE_RATE, SKILL_XP } from "@game/content/balance"
import { CHARACTER_CLASSES } from "@shared/character/classes"
import { RANKS, SKILLS, aptitudesOf, rankAtLevel, rankIndex } from "@shared/character/skills"
import { loadCharacterModel } from "@/server/character-model/model"
import { totalOfStats } from "@shared/character/leveling"
import { MAX_LEVEL, type UnitInstance } from "@game/core/types"
import { makeBattle } from "./helpers"

const flat = { hp: 30, str: 12, mag: 10, spd: 5, def: 5, res: 5 }

describe("владение навыками: ранги от опыта", () => {
  it("пороги рангов растут, ранг по опыту и порог ранга сходятся", () => {
    for (let i = 1; i < SKILL_XP.ranks.length; i++) expect(SKILL_XP.ranks[i]!).toBeGreaterThan(SKILL_XP.ranks[i - 1]!)
    expect(SKILL_XP.ranks.length).toBe(RANKS.length)
    for (const r of RANKS) expect(rankOfXp(xpOfRank(r))).toBe(r)
    expect(rankOfXp(xpOfRank("C") - 1)).toBe("D+")
    // Стартовые навыки — E+ (у слабости E): начальные классы открыты, как и прежде на 1-м уровне
    const start = startingSkillXp(aptitudesOf(["sword"], ["bow"]))
    expect(rankOfXp(start.axe)).toBe("E+")
    expect(rankOfXp(start.bow)).toBe("E")
  })

  it("склонность класса: единственное оружие и своё передвижение ×3, одно из нескольких ×2, прочее ×1", () => {
    expect(classAffinity("healer", "whiteMagic")).toBe(3)
    expect(classAffinity("healer", "sword")).toBe(1)
    expect(classAffinity("soldier", "axe")).toBe(2)
    expect(classAffinity("soldier", "spear")).toBe(2)
    expect(classAffinity("light-cavalry", "riding")).toBe(3)
    expect(classAffinity("light-cavalry", "flying")).toBe(1)
  })

  it("опыт навыка = база × склонность класса × личная склонность; новый ранг сообщается", () => {
    const u = generateUnit({ seed: 7, level: 1, classId: "healer" })
    const r = gainSkillXp(u, { whiteMagic: 10, sword: 10 })
    expect(r.unit.skillXp.whiteMagic - u.skillXp.whiteMagic).toBeCloseTo(10 * 3 * APTITUDE_RATE[u.aptitudes.whiteMagic])
    expect(r.unit.skillXp.sword - u.skillXp.sword).toBeCloseTo(10 * 1 * APTITUDE_RATE[u.aptitudes.sword])
    const big = gainSkillXp(u, { whiteMagic: 200 })
    expect(big.rankUps.some(x => x.skill === "whiteMagic")).toBe(true)
    // Выше S опыт не копится
    expect(gainSkillXp(u, { whiteMagic: 100_000 }).unit.skillXp.whiteMagic).toBe(SKILL_XP.ranks.at(-1))
  })

  it("уровень на ранги не влияет, перерождение сохраняет всю прокачку навыков", () => {
    const u = { ...generateUnit({ seed: 11, level: MAX_LEVEL, classId: "myrmidon", rarity: 1 }) }
    const trained: UnitInstance = { ...u, skillXp: { ...u.skillXp, sword: xpOfRank("A"), bow: xpOfRank("C") } }
    expect(weaponRank({ ...trained, level: 1 })).toBe(weaponRank(trained))
    const reborn = rebirthUnit(trained)
    expect(reborn.level).toBe(1)
    expect(reborn.rarity).toBe(2)
    expect(reborn.skillXp).toEqual(trained.skillXp)
    expect(unitRanks(reborn)).toEqual(unitRanks(trained))
  })
})

describe("владение навыками в бою", () => {
  it("удар оружием в лапах тренирует его по склонности класса, ход — передвижение; врагам не начисляется", () => {
    const b = makeBattle(
      [{ classId: "infantry_sword", pos: { x: 2, y: 4 }, baseStats: flat }],
      [{ classId: "infantry_sword", pos: { x: 2, y: 3 }, baseStats: { ...flat, hp: 60 }, stance: "hold" }]
    )
    const id = b.players[0]!.id
    const before = b.state.roster[id]!
    const enemyId = b.enemies[0]!.id
    const enemyBefore = b.state.roster[enemyId]!
    const { state } = applyAction(b.state, { type: "attack", unitId: id, to: { x: 2, y: 4 }, targetId: enemyId })
    const after = state.roster[id]!
    const swordRate = classAffinity(before.classId, "sword") * APTITUDE_RATE[before.aptitudes.sword]
    expect(after.skillXp.sword - before.skillXp.sword).toBeCloseTo(SKILL_XP.hit * swordRate)
    expect(after.skillXp.riding).toBeGreaterThan(before.skillXp.riding)
    expect(after.skillXp.bow).toBe(before.skillXp.bow)
    expect(state.roster[enemyId]!.skillXp).toEqual(enemyBefore.skillXp)
  })
})

describe("новые бойцы: владение по классу и уровню", () => {
  it("чем выше уровень, тем выше ранги оружия класса; требования класса выполнены; выше A+ не бывает (property)", () => {
    const capIndex = SKILL_XP.presetCapRank
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0x7fffffff }), fc.integer({ min: 1, max: MAX_LEVEL }), (seed, level) => {
        const army = { id: "a", units: [generateUnit({ seed, level, rarity: 1 })], squadIds: [], createdAt: 1, battles: 0, wins: 0 }
        for (const u of generateShop(seed, army, { glory: 200, maxRarity: 1 }, 1).candidates) {
          expect(canTakeClassNow(u, u.classId)).toBe(true)
          for (const s of SKILLS) expect(rankIndex(skillRank(u, s))).toBeLessThanOrEqual(capIndex)
        }
      }),
      { numRuns: 60 }
    )
    const low = presetSkillXp("myrmidon", aptitudesOf([]), 10)
    const high = presetSkillXp("swordmaster", aptitudesOf([]), 60)
    expect(high.sword).toBeGreaterThan(low.sword)
    expect(rankOfXp(high.sword)).not.toBe("S")
    // Белый маг высокого уровня приходит с прокачанной белой магией, а не с мечом
    const bishop = presetSkillXp("bishop", aptitudesOf([]), 40)
    expect(rankIndex(rankOfXp(bishop.whiteMagic))).toBeGreaterThanOrEqual(rankIndex("B"))
    expect(rankOfXp(bishop.sword)).toBe("E+")
  })

  it("награда за бой — тоже по пресету: ранги класса, статы пресета с личным разбросом", () => {
    const army = { id: "a", units: [generateUnit({ seed: 3, level: 45, rarity: 1 })], squadIds: [], createdAt: 1, battles: 0, wins: 0 }
    for (const u of generateRewardChoice(5, army, { maxRarity: 1 }, true, 1)) {
      expect(u.maxStats).toEqual(classPresetStats(u.classId, u.rarity, u.seed).maxStats)
      expect(canTakeClassNow(u, u.classId)).toBe(true)
    }
  })
})

describe("пресеты статов классов", () => {
  it("пресетов столько же, сколько классов; бюджет — средний для звезды", () => {
    const model = loadCharacterModel()
    for (const rarity of [1, 3, 5] as const) {
      const presets = classPresets(rarity)
      expect(Object.keys(presets).length).toBe(CHARACTER_CLASSES.length)
      for (const p of Object.values(presets)) {
        expect(Math.abs(totalOfStats(p.maxStats) - model.rarities[rarity].budget.mean)).toBeLessThanOrEqual(10)
        for (const k of Object.keys(p.maxStats) as (keyof typeof p.maxStats)[]) expect(p.baseStats[k]).toBeLessThanOrEqual(p.maxStats[k])
      }
    }
  })

  it("кривая идеальна под класс: маг — магия, рыцарь в латах — защита, мечник — скорость; к 80-му уровню класс выражен сильнее", () => {
    const mage = classPresetStats("mage", 3).maxStats
    expect(mage.specialAttack).toBeGreaterThan(mage.attack)
    const knight = classPresetStats("armored-knight", 3).maxStats
    expect(knight.defense).toBeGreaterThan(knight.speed)
    const myrmidon = classPresetStats("myrmidon", 3).maxStats
    expect(myrmidon.speed).toBeGreaterThan(myrmidon.defense)
    // Доля главного стата на 80-м уровне больше, чем на 1-м
    const p = classPresetStats("mage", 3)
    expect(p.maxStats.specialAttack / totalOfStats(p.maxStats)).toBeGreaterThan(p.baseStats.specialAttack / totalOfStats(p.baseStats))
  })

  it("новобранцы одного класса и звезды: та же сумма статов, но у каждого свой небольшой разброс вокруг пресета", () => {
    const preset = classPresetStats("hunter", 2)
    const units = [1, 99, 512, 4096, 77777].map(seed => generateUnit({ seed, level: 5, classId: "hunter", rarity: 2, preset: true }))
    for (const u of units) {
      // разброс детерминирован по seed бойца
      expect(generateUnit({ seed: u.seed, level: 5, classId: "hunter", rarity: 2, preset: true }).maxStats).toEqual(u.maxStats)
      expect(Math.abs(totalOfStats(u.maxStats) - totalOfStats(preset.maxStats))).toBeLessThanOrEqual(5)
      // каждый стат — рядом с пресетом: не дальше ~12 % (доли ±8 % плюс округление до 5)
      for (const k of Object.keys(preset.maxStats) as (keyof typeof preset.maxStats)[])
        expect(Math.abs(u.maxStats[k] - preset.maxStats[k])).toBeLessThanOrEqual(Math.max(10, preset.maxStats[k] * 0.12))
      for (const k of Object.keys(u.maxStats) as (keyof typeof u.maxStats)[]) expect(u.baseStats[k]).toBeLessThanOrEqual(u.maxStats[k])
    }
    expect(new Set(units.map(u => JSON.stringify(u.maxStats))).size).toBeGreaterThan(3)
    // характер класса сохраняется у всех: охотник с луком и мечом остаётся быстрее, чем крепче
    for (const u of units) expect(u.maxStats.speed).toBeGreaterThan(u.maxStats.defense)
    const e = generateUnit({ seed: 1, level: 5, classId: "hunter", rarity: 2, isEnemy: true })
    expect(e.maxStats).not.toEqual(units[0]!.maxStats)
  })
})

describe("старые сейвы", () => {
  it("бойцы без опыта навыков получают опыт по прежним рангам: ранги и классы не меняются", () => {
    const save = createEmptySave(1)
    const u = generateUnit({ seed: 21, level: 37, classId: "myrmidon" })
    const legacy = { ...u } as Partial<UnitInstance>
    delete legacy.skillXp
    save.army = { id: "a", units: [legacy as UnitInstance], squadIds: [], createdAt: 1, battles: 0, wins: 0 }
    const parsed = parseSave(serializeSave(save))
    if (!parsed.ok) throw new Error(parsed.error)
    const back = parsed.save.army!.units[0]!
    for (const s of SKILLS) expect(skillRank(back, s)).toBe(rankAtLevel(u.aptitudes[s], 37))
  })
})
