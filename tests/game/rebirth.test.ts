import { beforeEach, describe, expect, it } from "vitest"
import { $save, ensureRoster, rebirthAction } from "@game/state/save"
import { createEmptySave, parseSave, serializeSave } from "@game/core/save"
import { canRebirth, generateRoster, generateUnit, rebirthUnit, rescaleRarity, statsAtLevel } from "@game/core/units"
import { generateRewardChoice, generateShop, recruitLevel } from "@game/core/progression"
import { MAX_LEVEL, STATS, type Rarity, type UnitInstance } from "@game/core/types"
import { recruitRarityWeights } from "@game/content/balance"
import { loadCharacterModel } from "@/server/character-model/model"
import { levelOneStats } from "@shared/character/leveling"

function freshGame(): void {
  $save.set(createEmptySave(1))
  ensureRoster()
}

/** Первый боец ростера, прокачанный до 80-го уровня. */
function maxOut(): UnitInstance {
  const s = $save.get()
  const unit = { ...s.army!.units[0]!, level: MAX_LEVEL }
  $save.set({ ...s, army: { ...s.army!, units: [unit, ...s.army!.units.slice(1)] } })
  return unit
}

describe("звёзды случайных бойцов", () => {
  beforeEach(freshGame)

  it("новая игра: весь стартовый ростер и витрина — ★1", () => {
    const s = $save.get()
    expect(s.profile.maxRarity).toBe(1)
    expect(s.army!.units.every(u => u.rarity === 1)).toBe(true)
    expect(s.shelter.candidates.every(u => u.rarity === 1)).toBe(true)
  })
  it("веса — только среди открытых звёзд; победа удваивает высшую открытую", () => {
    expect(recruitRarityWeights(1)).toEqual({ 1: 40, 2: 0, 3: 0, 4: 0, 5: 0 })
    expect(recruitRarityWeights(3)).toEqual({ 1: 40, 2: 30, 3: 18, 4: 0, 5: 0 })
    expect(recruitRarityWeights(3, true)[3]).toBe(36)
  })
  it("ростер и витрина не выходят за открытую звезду, а открытые встречаются", () => {
    const seen = new Set<number>()
    for (let seed = 0; seed < 40; seed++) {
      for (const u of generateRoster({ seed, glory: 0, maxRarity: 3 })) {
        expect(u.rarity).toBeLessThanOrEqual(3)
        seen.add(u.rarity)
      }
      for (const u of generateShop(seed, undefined, { glory: 0, maxRarity: 2 }, 1).candidates) expect(u.rarity).toBeLessThanOrEqual(2)
    }
    expect([...seen].sort()).toEqual([1, 2, 3])
  })
})

describe("перерождение", () => {
  beforeEach(freshGame)

  it("доступно только на 80-м уровне и до ★5", () => {
    const u = generateUnit({ seed: 7, level: 79, rarity: 1 })
    expect(canRebirth(u)).toBe(false)
    expect(() => rebirthUnit(u)).toThrow()
    expect(canRebirth({ ...u, level: MAX_LEVEL })).toBe(true)
    expect(canRebirth({ ...u, level: MAX_LEVEL, rarity: 5 })).toBe(false)
  })
  it("1-й уровень и +★: тот же персонаж, к 80-му статы не ниже прежних, навыки и класс на месте", () => {
    const model = loadCharacterModel()
    for (let seed = 0; seed < 30; seed++) {
      let u: UnitInstance = { ...generateUnit({ seed, level: MAX_LEVEL, rarity: 1 }), sp: 123, xp: 50 }
      for (let star = 2; star <= 5; star++) {
        const next = rebirthUnit(u)
        expect(next.rarity).toBe(star)
        expect(next.level).toBe(1)
        expect(next.xp).toBe(0)
        expect(next.sp).toBe(123)
        expect(next.classId).toBe(u.classId)
        expect(next.skills).toEqual(u.skills)
        expect(next.learned).toEqual(u.learned)
        expect(next.learnable.slice(0, u.learnable.length)).toEqual(u.learnable)
        // 1-й уровень — по формуле модели для новой звезды
        expect(next.baseStats).toEqual(levelOneStats(next.maxStats, model.growth, model.rarities[star as Rarity]))
        const before = statsAtLevel(u, MAX_LEVEL)
        const after = statsAtLevel({ ...next, level: MAX_LEVEL }, MAX_LEVEL)
        for (const s of STATS) expect(after[s]).toBeGreaterThanOrEqual(before[s])
        u = { ...next, level: MAX_LEVEL }
      }
      expect(canRebirth(u)).toBe(false)
    }
  })
  it("звезда поднимает сумму статов 80-го уровня", () => {
    const u = generateUnit({ seed: 11, level: MAX_LEVEL, rarity: 1 })
    const sum = (s: Record<string, number>) => Object.values(s).reduce((a, b) => a + b, 0)
    expect(sum(rescaleRarity(u.maxStats, 1, 5).maxStats)).toBeGreaterThan(sum(u.maxStats))
  })
  it("первое перерождение в звезду открывает её для случайных бойцов и сохраняется в сейве", () => {
    const unit = maxOut()
    expect(rebirthAction("nope").ok).toBe(false)
    const r = rebirthAction(unit.id)
    expect(r).toEqual({ ok: true, unlocked: 2 })
    const s = $save.get()
    expect(s.profile.maxRarity).toBe(2)
    expect(s.army!.units[0]!.rarity).toBe(2)
    expect(s.army!.units[0]!.level).toBe(1)
    expect(rebirthAction(unit.id).ok).toBe(false)
    const parsed = parseSave(serializeSave(s))
    expect(parsed.ok && parsed.save.profile.maxRarity).toBe(2)
    // Второй боец до той же звезды — ничего нового не открывает
    const other = { ...s.army!.units[1]!, level: MAX_LEVEL }
    $save.set({ ...s, army: { ...s.army!, units: [s.army!.units[0]!, other, ...s.army!.units.slice(2)] } })
    expect(rebirthAction(other.id)).toEqual({ ok: true })
    expect($save.get().profile.maxRarity).toBe(2)
  })
  it("сейв без maxRarity (до перерождений) открывает только ★1", () => {
    const old = JSON.parse(serializeSave(createEmptySave(1))) as { profile: Record<string, unknown> }
    delete old.profile.maxRarity
    const r = parseSave(JSON.stringify(old))
    expect(r.ok && r.save.profile.maxRarity).toBe(1)
  })
})

describe("уровень бойцов новой звезды", () => {
  /** Ростер ★1 80-го уровня, один из бойцов только что переродился в ★2 (1-й уровень). */
  function veteranArmy(): { units: UnitInstance[], id: string, squadIds: string[], createdAt: number, battles: number, wins: number } {
    const units = [1, 2, 3, 4, 5].map(seed => generateUnit({ seed, level: MAX_LEVEL, rarity: 1 }))
    units[0] = rebirthUnit(units[0]!)
    return { id: "a", units, squadIds: units.slice(0, 4).map(u => u.id), createdAt: 1, battles: 0, wins: 0 }
  }

  it("каждая звезда растёт с нуля: ★2 сразу после открытия — около 1-го уровня, ★1 — около уровня ростера", () => {
    const army = veteranArmy()
    expect(recruitLevel(army, 1)).toBeGreaterThan(70)
    expect(recruitLevel(army, 2)).toBe(1)
    // звезды без своих бойцов — тоже с 1-го уровня
    expect(recruitLevel(army, 3)).toBe(1)
    let twos = 0
    for (let seed = 0; seed < 60; seed++) {
      const offered = [
        ...generateShop(seed, army, { glory: 0, maxRarity: 2 }, 1).candidates,
        ...generateRewardChoice(seed, army, { maxRarity: 2 }, true, 1)
      ]
      for (const u of offered) {
        if (u.rarity === 2) {
          twos++
          expect(u.level).toBeLessThanOrEqual(2)
        }
        else expect(u.level).toBeGreaterThan(70)
      }
    }
    expect(twos).toBeGreaterThan(10)
  })

  it("потолок звезды растёт вместе с её бойцами: прокачанный ★2 поднимает уровень кандидатов ★2", () => {
    const army = veteranArmy()
    army.units[0] = { ...army.units[0]!, level: 30 }
    expect(recruitLevel(army, 2)).toBe(30)
    for (let seed = 0; seed < 40; seed++) {
      for (const u of generateShop(seed, army, { glory: 0, maxRarity: 2 }, 1).candidates) {
        if (u.rarity === 2) expect(u.level).toBeGreaterThanOrEqual(28)
        if (u.rarity === 2) expect(u.level).toBeLessThanOrEqual(31)
      }
    }
  })
})
