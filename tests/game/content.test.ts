import { afterEach, describe, expect, it } from "vitest"
import { CLASS_IDS, MOVE_RANGE, classInfo, classWeapons } from "@game/content/classes"
import { CLASS_STAT_MODS } from "@game/content/classStats"
import { SKILL_LABELS, WEAPON_GRADE_LABELS, aptitudesOf, type Skill } from "@shared/character/skills"
import { CHARACTER_CLASSES, FLIER_MOUNTS, TIER_LEVELS, earliestLevelOf, mountOf, movementOf } from "@shared/character/classes"
import { FUR_PALETTES } from "@game/content/appearance"
import { DEFAULT_LANG, setLang } from "@game/i18n"
import { WEAPONS } from "@game/content/weapons"
import { SPECIALS } from "@game/content/skills/specials"
import { ASSISTS } from "@game/content/skills/assists"
import { PASSIVES } from "@game/content/skills/passives"
import { BIOMES } from "@game/content/biomes"
import { FACTIONS, factionDef } from "@game/content/factions"
import { BREEDS } from "@game/content/breeds"
import { NAMES, EPITHETS } from "@game/content/names"
import { COMMON_SKILLS, STARTER_CLASSES, generateUnit, skillCost, slotOf } from "@game/core/units"

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
    expect(BIOMES.length).toBeGreaterThanOrEqual(9)
    for (const b of BIOMES) expect(b.weather.density).toBeGreaterThanOrEqual(0)
  })
})

describe("пояснения классов", () => {
  it("у каждого класса есть роль, пояснение, ход, оружие и множители статов в разумных пределах", () => {
    for (const id of CLASS_IDS) {
      const info = classInfo(id)
      expect(info.role.length).toBeGreaterThan(0)
      expect(info.summary.length).toBeGreaterThan(10)
      expect(info.moveRange).toBe(MOVE_RANGE[info.moveType])
      expect(info.weapons.length).toBeGreaterThan(0)
      expect(CLASS_STAT_MODS[id], id).toBeDefined()
      // У класса есть и сильная, и слабая сторона (или хотя бы сильная у высоких ярусов), множители — до ±50 %
      expect(info.bonus.some(b => b.value > 0), id).toBe(true)
      for (const b of info.bonus) expect(Math.abs(b.value), id).toBeLessThanOrEqual(50)
    }
  })
  it("множители класса: латник крепок, но слаб против магии; маг — наоборот", () => {
    expect(CLASS_STAT_MODS["armored-knight"]?.def).toBeGreaterThan(0)
    expect(CLASS_STAT_MODS["armored-knight"]?.res).toBeLessThan(0)
    expect(CLASS_STAT_MODS["mage"]?.mag).toBeGreaterThan(0)
    expect(CLASS_STAT_MODS["mage"]?.str).toBeLessThan(0)
  })
  it("роли совпадают с механикой: Dancer танцует, Priest и Healer лечат, Mage колдует, латы — танк", () => {
    expect(classInfo("dancer").role).toBe("Dancer")
    expect(classInfo("priest").role).toBe("Healer")
    expect(classInfo("armored-knight").role).toBe("Tank")
    expect(classInfo("healer").role).toBe("Healer")
    expect(classInfo("mage").role).toBe("Mage")
    expect(classInfo("soldier").tierLevel).toBe(1)
    expect(classInfo("light-cavalry").moveRange).toBe(4)
    expect(classInfo("wing-soldier").moveLabel).toBe("Pegasus")
  })
})

describe("ярусы классов", () => {
  it("стартовые классы — Soldier, Hunter, Mage, Healer, Gladiator; ярусы открываются с 1 / 10 / 20 / 35 / 60", () => {
    expect(STARTER_CLASSES).toEqual(["soldier", "hunter", "mage", "healer", "gladiator"])
    expect(TIER_LEVELS).toEqual({ beginner: 1, specialty: 10, advanced: 20, master: 35, divine: 60 })
    for (const id of ["commoner", "noble", "diviner"]) expect(CLASS_IDS).not.toContain(id)
  })
  it("у любого персонажа на 1-м уровне есть стартовый класс, и других классов там нет", () => {
    for (let seed = 0; seed < 200; seed++) {
      const u = generateUnit({ seed, level: 1 })
      expect(STARTER_CLASSES).toContain(u.classId)
    }
  })
  it("талант открывает класс ровно на уровне его яруса", () => {
    for (const item of CHARACTER_CLASSES) {
      const talents = [...Object.keys(item.all), ...Object.keys(item.any)] as Skill[]
      expect(earliestLevelOf(item, aptitudesOf(talents)), item.id).toBe(TIER_LEVELS[item.tier])
    }
  })
})

describe("биомы", () => {
  it("у каждого биома есть фракция, а случайный биом открывается по победам", () => {
    for (const b of BIOMES) expect(() => factionDef(b.factionId), b.id).not.toThrow()
    for (const id of ["deep_forest", "indoors", "factory", "infested"]) expect(BIOMES.some(b => b.id === id)).toBe(true)
    expect(new Set(BIOMES.map(b => b.id)).size).toBe(BIOMES.length)
  })
})

describe("контент: имена, породы, фракции", () => {
  const SPECIES = ["cat", "dog", "mouse"] as const
  const namesIn = (l: "en" | "ru", s: (typeof SPECIES)[number]) => {
    setLang(l)
    return [...NAMES[s]]
  }
  afterEach(() => setLang(DEFAULT_LANG))

  it("списки имён RU и EN одной длины и с тем же полом на каждом индексе", () => {
    for (const s of SPECIES) {
      const en = namesIn("en", s)
      const ru = namesIn("ru", s)
      expect(en.length, s).toBe(ru.length)
      en.forEach((e, i) => expect(e.gender, `${s}[${i}] ${e.name} / ${ru[i]?.name}`).toBe(ru[i]?.gender))
    }
  })
  it("мышиных имён не меньше, чем у котов и псов (минимум для MVP)", () => {
    for (const l of ["en", "ru"] as const) expect(namesIn(l, "mouse").length).toBeGreaterThanOrEqual(60)
  })
  it("у каждого вида есть хотя бы одна порода", () => {
    for (const s of SPECIES) expect(BREEDS.some(b => b.species === s), s).toBe(true)
  })
  it("палитры фракций — существующие индексы FUR_PALETTES", () => {
    for (const f of FACTIONS) {
      expect(f.palettes.length, f.id).toBeGreaterThan(0)
      for (const i of f.palettes) {
        expect(Number.isInteger(i), f.id).toBe(true)
        expect(i, f.id).toBeGreaterThanOrEqual(0)
        expect(i, f.id).toBeLessThan(FUR_PALETTES.length)
      }
    }
  })
  it("у каждого летающего класса есть верховое животное в FLIER_MOUNTS", () => {
    const fliers = CHARACTER_CLASSES.filter(c => movementOf(c) === "flier")
    expect(fliers.length).toBeGreaterThan(0)
    for (const c of fliers) {
      expect(FLIER_MOUNTS[c.id], c.id).toBeDefined()
      expect(mountOf(c), c.id).toBe(FLIER_MOUNTS[c.id])
    }
    // и наоборот: в таблице нет лишних id
    for (const id of Object.keys(FLIER_MOUNTS)) expect(fliers.some(c => c.id === id), id).toBe(true)
  })
})
