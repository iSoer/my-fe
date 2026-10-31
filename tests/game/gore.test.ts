import { describe, expect, it } from "vitest"
import { blobOutline, goreRng } from "@game/scene/goreShape"
import { DEATH_VARIANTS, GORY_VARIANTS, ZOMBIE_ONLY_VARIANTS, deathSeed, deathWeights, pickDeathVariant } from "@game/scene/deathVariants"
import type { MoveType, WeaponSkill } from "@game/core/types"

describe("форма клякс крови", () => {
  it("ГПСЧ детерминирован и лежит в [0, 1)", () => {
    const a = goreRng(42)
    const b = goreRng(42)
    for (let i = 0; i < 200; i++) {
      const v = a()
      expect(v).toBe(b())
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it("контур кляксы: заданное число точек, радиус в пределах дрожания, один seed — одна форма", () => {
    for (const seed of [1, 7, 101, 9999]) {
      const pts = blobOutline(seed, 22, 30, 0.32)
      expect(pts).toHaveLength(22)
      for (const p of pts) {
        const r = Math.hypot(p.x, p.y)
        expect(r).toBeGreaterThanOrEqual(30 * (1 - 0.32) - 1e-9)
        expect(r).toBeLessThanOrEqual(30 * (1 + 0.32) + 1e-9)
      }
      expect(blobOutline(seed, 22, 30, 0.32)).toEqual(pts)
    }
    expect(blobOutline(1, 22, 30, 0.32)).not.toEqual(blobOutline(2, 22, 30, 0.32))
  })
})

describe("варианты гибели", () => {
  const weapons: (WeaponSkill | undefined)[] = ["sword", "spear", "axe", "gauntlet", "bow", "blackMagic", "whiteMagic", undefined]
  const moves: MoveType[] = ["infantry", "armored", "cavalry", "flier"]
  const NEW = ["behead", "halve", "impale", "pincushion", "ash", "freeze", "ascend", "balloon", "knockout", "zombieMelt"] as const

  it("новые варианты есть в списке, имена уникальны", () => {
    for (const v of NEW) expect(DEATH_VARIANTS).toContain(v)
    expect(new Set(DEATH_VARIANTS).size).toBe(DEATH_VARIANTS.length)
    expect(DEATH_VARIANTS.length).toBeGreaterThanOrEqual(21)
  })

  it("выбор детерминирован: один seed — один вариант", () => {
    for (let i = 0; i < 300; i++) {
      const seed = deathSeed(`u${i}`, i % 7)
      const w = weapons[i % weapons.length]
      const m = moves[i % moves.length]!
      const e = i % 2 === 0
      expect(pickDeathVariant(seed, w, m, e)).toBe(pickDeathVariant(seed, w, m, e))
    }
    expect(deathSeed("a", 1)).toBe(deathSeed("a", 1))
    expect(deathSeed("a", 1)).not.toBe(deathSeed("a", 2))
  })

  it("зомби-лужа никогда не выпадает бойцу игрока", () => {
    for (const w of weapons) {
      for (const m of moves) {
        const weights = deathWeights(w, m, false)
        for (const v of ZOMBIE_ONLY_VARIANTS) expect(weights[v]).toBe(0)
        for (let i = 0; i < 400; i++)
          expect(ZOMBIE_ONLY_VARIANTS).not.toContain(pickDeathVariant(deathSeed(`p${i}`, i), w, m, false))
      }
    }
  })

  it("зомби-лужа выпадает зомби; новые варианты выпадают, старые не исчезают", () => {
    const seen = new Set<string>()
    for (const w of weapons) {
      for (const m of moves) {
        for (let i = 0; i < 400; i++) seen.add(pickDeathVariant(deathSeed(`z${i}`, i), w, m, true))
      }
    }
    for (const v of DEATH_VARIANTS) expect(seen).toContain(v)
  })

  it("оружие тянет к своему варианту", () => {
    const share = (w: WeaponSkill, v: string): number => {
      const ws = deathWeights(w, "infantry", true)
      const total = Object.values(ws).reduce((a, b) => a + b, 0)
      return ws[v as keyof typeof ws] / total
    }
    expect(share("bow", "pincushion")).toBeGreaterThan(0.15)
    expect(share("spear", "impale")).toBeGreaterThan(0.15)
    expect(share("blackMagic", "ash")).toBeGreaterThan(0.12)
    expect(share("whiteMagic", "ascend")).toBeGreaterThan(0.12)
    expect(share("sword", "halve") + share("sword", "behead")).toBeGreaterThan(0.2)
  })
})

describe("кровь выключена", () => {
  it("кровавые варианты гибели не выпадают, остальные — да", () => {
    const weapons = ["sword", "spear", "axe", "gauntlet", "bow", "blackMagic", "whiteMagic"] as const
    const moves = ["infantry", "armored", "cavalry", "flier"] as const
    const seen = new Set<string>()
    for (const w of weapons) {
      for (const m of moves) {
        for (const enemy of [false, true]) {
          const weights = deathWeights(w, m, enemy, false)
          for (const v of GORY_VARIANTS) expect(weights[v]).toBe(0)
          for (let i = 0; i < 200; i++) {
            const v = pickDeathVariant(deathSeed(`u${i}`, i), w, m, enemy, false)
            expect(GORY_VARIANTS).not.toContain(v)
            seen.add(v)
          }
        }
      }
    }
    // Мирных вариантов достаточно, чтобы гибель не была однообразной
    expect(seen.size).toBeGreaterThanOrEqual(8)
    expect(DEATH_VARIANTS.filter(v => !GORY_VARIANTS.includes(v)).length).toBeGreaterThanOrEqual(10)
  })
})
