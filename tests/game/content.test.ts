import { describe, expect, it } from "vitest"
import { CLASS_IDS, MOVE_RANGE, classInfo, classWeapons } from "@game/content/classes"
import { SKILL_LABELS, WEAPON_GRADE_LABELS } from "@shared/character/skills"
import { WEAPONS } from "@game/content/weapons"
import { SPECIALS } from "@game/content/skills/specials"
import { ASSISTS } from "@game/content/skills/assists"
import { PASSIVES } from "@game/content/skills/passives"
import { TRAITS } from "@game/content/traits"
import { BIOMES } from "@game/content/biomes"
import { FACTIONS } from "@game/content/factions"
import { BREEDS } from "@game/content/breeds"
import { NAMES, EPITHETS } from "@game/content/names"
import { COMMON_SKILLS, skillCost, slotOf } from "@game/core/units"

function uniqueIds(items: readonly { id: string }[]): void {
  const ids = items.map(i => i.id)
  expect(new Set(ids).size).toBe(ids.length)
}

describe("контент", () => {
  it("id уникальны", () => {
    uniqueIds(WEAPONS)
    uniqueIds(SPECIALS)
    uniqueIds(ASSISTS)
    uniqueIds(PASSIVES)
    uniqueIds(TRAITS)
    uniqueIds(BIOMES)
    uniqueIds(FACTIONS)
    uniqueIds(BREEDS)
    const all = [...WEAPONS, ...SPECIALS, ...ASSISTS, ...PASSIVES].map(x => x.id)
    expect(new Set(all).size).toBe(all.length)
  })
  it("ссылки целостны", () => {
    for (const id of CLASS_IDS) {
      for (const skill of classWeapons(id)) {
        // Деревянное и железное оружие есть для каждого оружия класса; названия — грейд и навык модели
        const basic = WEAPONS.find(w => w.id === `${skill}_basic`)
        expect(basic?.name).toBe(`${WEAPON_GRADE_LABELS.iron} ${SKILL_LABELS[skill]}`)
        const wood = WEAPONS.find(w => w.id === `${skill}_wood`)
        expect(wood?.name).toBe(`${WEAPON_GRADE_LABELS.wood} ${SKILL_LABELS[skill]}`)
        expect(wood?.price).toBe(0)
      }
    }
    for (const b of BIOMES) expect(FACTIONS.some(f => f.id === b.factionId)).toBe(true)
    for (const id of COMMON_SKILLS) {
      expect(skillCost(id)).toBeGreaterThanOrEqual(0)
      expect(["a", "b", "c", "assist", "special", "weapon"]).toContain(slotOf(id))
    }
  })
  it("объёмы контента соответствуют ТЗ (минимум для MVP)", () => {
    expect(NAMES.cat.length).toBeGreaterThanOrEqual(60)
    expect(NAMES.dog.length).toBeGreaterThanOrEqual(60)
    expect(EPITHETS.length).toBeGreaterThanOrEqual(40)
    expect(SPECIALS.length).toBeGreaterThanOrEqual(12)
    expect(ASSISTS.length).toBeGreaterThanOrEqual(12)
    expect(PASSIVES.filter(p => p.slot === "a").length).toBeGreaterThanOrEqual(8)
    expect(PASSIVES.filter(p => p.slot === "b").length).toBeGreaterThanOrEqual(8)
    expect(PASSIVES.filter(p => p.slot === "c").length).toBeGreaterThanOrEqual(8)
    expect(TRAITS.length).toBeGreaterThanOrEqual(16)
    expect(BIOMES.length).toBeGreaterThanOrEqual(9)
    for (const b of BIOMES) expect(b.weather.density).toBeGreaterThanOrEqual(0)
  })
})

describe("пояснения классов", () => {
  it("у каждого класса есть роль, пояснение, ход и оружие; бонус — в боевой шкале", () => {
    for (const id of CLASS_IDS) {
      const info = classInfo(id)
      expect(info.role.length).toBeGreaterThan(0)
      expect(info.summary.length).toBeGreaterThan(10)
      expect(info.moveRange).toBe(MOVE_RANGE[info.moveType])
      expect(info.weapons.length).toBeGreaterThan(0)
      for (const b of info.bonus) expect(Math.abs(b.value)).toBeLessThan(20)
    }
  })
  it("роли совпадают с механикой: Dancer танцует, Priest лечит, латы — танк, базовые — универсалы", () => {
    expect(classInfo("dancer").role).toBe("Танцор")
    expect(classInfo("priest").role).toBe("Лекарь")
    expect(classInfo("armored-knight").role).toBe("Танк")
    expect(classInfo("commoner").role).toBe("Универсал")
    expect(classInfo("commoner").bonus).toEqual([])
    expect(classInfo("light-cavalry").moveRange).toBe(3)
    expect(classInfo("wing-soldier").moveLabel).toBe("Pegasus")
  })
})
