import { describe, expect, it } from "vitest"
import {
  artWeapon,
  backdropSvg,
  critterSvg,
  tileSvg,
  unitArt,
  unitSvg,
  unitPartSvg,
  unitArtKey,
  furArt,
  eyeArt,
  CRITTER_PARTS,
  type CritterArt,
  type Pose
} from "@game/art/index"
import { BIOMES } from "@game/content/biomes"
import { WEAPONS } from "@game/content/weapons"
import { zombieFur } from "@game/art/critter"
import { TALISMANS } from "@game/content/items"
import { MATERIAL, ringSvg, weaponIconSvg } from "@game/art/gear"
import { critterLook, DEFAULT_LOOK, DRAWABLE_EARS, DRAWABLE_TAILS } from "@game/art/look"
import { EYE_ART, FUR_ART } from "@game/art/palettes"
import { EYE_COLORS, FUR_PALETTES } from "@game/content/appearance"
import { BREEDS } from "@game/content/breeds"
import { WEAPON_SKILLS, type WeaponGrade, type WeaponSkill } from "@shared/character/skills"
import { gearAlerts } from "@game/ui/components/UnitPanels"
import { CLASS_IDS, classDef, classWeapons, fwClass } from "@game/content/classes"
import { generateUnit } from "@game/core/units"
import type { TerrainId } from "@game/core/types"
import { CLASS_OUTFITS } from "@game/art/outfits"
import { mountOf } from "@shared/character/classes"
import { TILE_FRAME_COUNT, TILE_VARIANTS, groundSvg, tileEdgeSvg } from "@game/art/tile"
import { backdropLayersSvg } from "@game/art/backdrop"

const CLASSES = CLASS_IDS.flatMap(id => classWeapons(id).map(w => classDef(id, w)))

/** Миниатюра кота в наряде класса: всё, кроме класса, одинаково. */
function classCat(classId: string, pose: Pose = "idle"): CritterArt {
  const fw = fwClass(classId)
  const mount = mountOf(fw)
  return {
    species: "cat",
    fur: furArt(0),
    iris: eyeArt(0),
    pattern: 0,
    eyes: 0,
    accessory: 0,
    classId,
    tier: fw.tier,
    ...(mount ? { mount } : {}),
    pose
  }
}

const TERRAINS: TerrainId[] = ["plain", "forest", "mountain", "water", "wall", "wall_breakable", "cover"]
const POSES: Pose[] = ["idle", "run", "hurt", "dead", "happy", "carried", "blink"]

function wellFormed(svg: string): void {
  expect(svg.startsWith("<svg")).toBe(true)
  expect(svg.trimEnd().endsWith("</svg>")).toBe(true)
  expect(svg).not.toMatch(/NaN|undefined|null/)
  // Повтор атрибута в теге — невалидный XML: браузер не загрузит такую картинку (боец станет «чёрным квадратом»)
  for (const tag of svg.match(/<[a-zA-Z][^<>]*>/g) ?? []) {
    const attrs = [...tag.matchAll(/\s([a-zA-Z:-]+)=/g)].map(m => m[1])
    expect(new Set(attrs).size, tag.slice(0, 120)).toBe(attrs.length)
  }
  // парные теги g
  const open = (svg.match(/<g\b/g) ?? []).length
  const close = (svg.match(/<\/g>/g) ?? []).length
  expect(open).toBe(close)
}

describe("арт: миниатюры", () => {
  it("все виды × позы × снаряжение дают корректный SVG", () => {
    for (const species of ["cat", "dog", "mouse"] as const) {
      for (const pose of POSES) {
        for (const [i, cls] of CLASSES.entries()) {
          const a: CritterArt = {
            species,
            fur: furArt(i),
            iris: eyeArt(1),
            pattern: i % 4,
            eyes: i % 6,
            accessory: i % 8,
            moveType: cls.moveType,
            weapon: artWeapon(cls.weaponSkill),
            weaponColor: "#e63946",
            classId: cls.id,
            tier: cls.tier,
            ...(mountOf(fwClass(cls.id)) ? { mount: mountOf(fwClass(cls.id)) } : {}),
            pose,
            boss: pose === "happy",
            angry: pose === "run"
          }
          wellFormed(critterSvg(a))
        }
      }
    }
  })
  it("у каждого класса модели свой наряд, миниатюры классов различаются", () => {
    expect(Object.keys(CLASS_OUTFITS).sort()).toEqual([...CLASS_IDS].sort())
    const svgs = CLASS_IDS.map(id => critterSvg(classCat(id)))
    expect(new Set(svgs).size).toBe(CLASS_IDS.length)
    for (const pose of POSES) for (const id of CLASS_IDS) wellFormed(critterSvg(classCat(id, pose)))
  })
  it("у каждого класса свой силуэтный признак, а не только цвет", () => {
    const signature = (id: string): string => {
      const o = CLASS_OUTFITS[id]!
      const extra = [o.back, o.hand, o.neck, o.face, o.paws, o.shoulders, o.barding, o.mask ? "mask" : "", o.cape ? "cape" : ""]
      return [o.hat, o.garb, mountOf(fwClass(id)) ?? "", ...extra].join("|")
    }
    const signatures = CLASS_IDS.map(signature)
    expect(new Set(signatures).size).toBe(CLASS_IDS.length)
    // признаки профессий доходят до SVG
    expect(critterSvg(classCat("blacksmith"))).toContain("goggles")
    expect(critterSvg(classCat("hunter"))).toContain("quiver")
    expect(critterSvg(classCat("guardian"))).toContain("hand shield")
    expect(critterSvg(classCat("pugilist"))).toContain("class=\"paws\"")
    expect(critterSvg(classCat("wiseman"))).toContain("beard")
    expect(critterSvg(classCat("cataphract"))).toContain("class=\"barding\"")
  })
  it("ярус и животное видны: Divine — нимб, кавалерия — лошадь, летуны — крылья", () => {
    expect(critterSvg(classCat("the-blade"))).toContain("class=\"halo\"")
    expect(critterSvg(classCat("soldier"))).not.toContain("class=\"halo\"")
    expect(critterSvg(classCat("light-cavalry"))).toContain("class=\"mount\"")
    expect(critterSvg(classCat("wing-soldier"))).toContain("class=\"wings\"")
    expect(critterSvg(classCat("bau-lord"))).toContain("class=\"wings\"")
    expect(critterSvg(classCat("myrmidon"))).not.toContain("class=\"mount\"")
  })
  it("ключ кэша текстуры различает классы и оружие", () => {
    const u = generateUnit({ seed: 77, level: 40 })
    const other = CLASS_IDS.find(id => id !== u.classId)!
    expect(unitArtKey({ ...u, classId: other }, "idle")).not.toBe(unitArtKey(u, "idle"))
    const otherWeapon = u.weaponSkill === "sword" ? "axe" : "sword"
    expect(unitArtKey({ ...u, weaponSkill: otherWeapon }, "idle")).not.toBe(unitArtKey(u, "idle"))
    expect(unitSvg({ ...u, classId: other })).not.toBe(unitSvg(u))
  })
  it("animated-вариант содержит CSS-хуки", () => {
    const svg = critterSvg({
      species: "cat",
      fur: furArt(0),
      iris: eyeArt(0),
      pattern: 0,
      eyes: 0,
      accessory: 0,
      animated: true,
      blinkDelay: -1.5
    })
    for (const cls of [
      "class=\"tail\"",
      "class=\"legs\"",
      "leg-front",
      "leg-back",
      "class=\"head\"",
      "ear-l",
      "class=\"eyes-open\"",
      "class=\"eyes-happy\""
    ])
      expect(svg).toContain(cls)
    expect(svg).toContain("animation-delay:-1.50s")
  })
  it("части тела для разлёта — корректный SVG для всех видов и классов", () => {
    for (let i = 0; i < 24; i++) {
      const cls = CLASSES[(i * 7) % CLASSES.length]!
      const u = { ...generateUnit({ seed: 5000 + i, level: 3 }), classId: cls.id, weaponSkill: cls.weaponSkill }
      for (const part of CRITTER_PARTS) wellFormed(unitPartSvg(u, part))
    }
  })
  it("unitSvg работает для сгенерированных бойцов, ключ стабилен", () => {
    for (let i = 0; i < 40; i++) {
      const u = generateUnit({ seed: 1000 + i, level: 5, isEnemy: i % 2 === 0, isBoss: i % 7 === 0 })
      wellFormed(unitSvg(u, { pose: POSES[i % POSES.length] }))
      expect(unitArtKey(u, "idle")).toBe(unitArtKey({ ...u }, "idle"))
    }
  })
})

describe("арт: оружие в лапах", () => {
  const GRADES: WeaponGrade[] = ["wood", "iron", "steel", "silver"]
  const armed = (weapon: WeaponSkill, weaponGrade: WeaponGrade, extra: Partial<CritterArt> = {}): CritterArt => ({
    ...classCat("myrmidon"),
    weapon,
    weaponGrade,
    ...extra
  })
  it("все виды × позы × оружие × грейды — корректный SVG, в лапах — надетое оружие", () => {
    for (const species of ["cat", "dog", "mouse"] as const) {
      for (const pose of POSES) {
        for (const kind of WEAPON_SKILLS) {
          for (const grade of GRADES) {
            const svg = critterSvg(armed(kind, grade, { species, pose }))
            wellFormed(svg)
            expect(svg).toContain(`held-${kind}`)
          }
        }
      }
    }
  })
  it("рисунок меняется от вида оружия, грейда и разновидности; деревянное — коричневое", () => {
    const kinds = WEAPON_SKILLS.map(k => critterSvg(armed(k, "iron")))
    expect(new Set(kinds).size).toBe(WEAPON_SKILLS.length)
    for (const kind of WEAPON_SKILLS) {
      const grades = GRADES.map(g => critterSvg(armed(kind, g)))
      expect(new Set(grades).size).toBe(GRADES.length)
    }
    expect(critterSvg(armed("sword", "wood"))).toContain(MATERIAL.wood.base)
    expect(critterSvg(armed("sword", "silver"))).toContain(MATERIAL.silver.base)
    expect(critterSvg(armed("sword", "iron", { weaponVariant: "killer" }))).not.toBe(critterSvg(armed("sword", "iron")))
    expect(critterSvg(armed("sword", "iron", { weaponVariant: "brave" }))).not.toBe(critterSvg(armed("sword", "iron", { weaponVariant: "killer" })))
    // выпавшее при гибели оружие
    expect(critterSvg(armed("axe", "steel", { pose: "dead" }))).toContain("dropped")
  })
  it("ключ кэша различает оружие и грейд, unitArt берёт грейд и разновидность из оружия в лапах", () => {
    const u = generateUnit({ seed: 91, level: 10 })
    const wood = { ...u, weaponSkill: "sword" as const, skills: { ...u.skills, weapon: "sword_wood" } }
    const steel = { ...wood, skills: { ...u.skills, weapon: "sword_steel" } }
    const killer = { ...wood, skills: { ...u.skills, weapon: "sword_killer" } }
    const axe = { ...wood, weaponSkill: "axe" as const, skills: { ...u.skills, weapon: "axe_wood" } }
    const keys = [wood, steel, killer, axe].map(x => unitArtKey(x, "idle"))
    expect(new Set(keys).size).toBe(4)
    expect(unitArt(steel).weaponGrade).toBe("steel")
    expect(unitArt(killer).weaponVariant).toBe("killer")
    expect(new Set([wood, steel, killer, axe].map(x => unitSvg(x))).size).toBe(4)
  })
  it("предмет класса в левой лапе не дублирует оружие; щит остаётся рядом с оружием", () => {
    expect(critterSvg(armed("whiteMagic", "iron", { classId: "ovate", tier: fwClass("ovate").tier }))).not.toContain("hand staff")
    expect(critterSvg(armed("sword", "iron", { classId: "ovate", tier: fwClass("ovate").tier }))).toContain("hand staff")
    const priest = critterSvg(armed("whiteMagic", "iron", { classId: "priest", tier: fwClass("priest").tier }))
    expect(priest).toContain("hand book")
    expect(priest).toContain("held-whiteMagic")
    expect(critterSvg(armed("sword", "iron", { classId: "guardian", tier: fwClass("guardian").tier }))).toContain("hand shield")
  })
})

describe("арт: облик бойца", () => {
  it("у каждой породы есть формы ушей и хвоста; облик детерминирован по seed", () => {
    for (const b of BREEDS) {
      expect(b.look.ears.length).toBeGreaterThan(0)
      expect(b.look.tails.length).toBeGreaterThan(0)
      const look = critterLook(b.species, b.look, 12345)
      expect(b.look.ears).toContain(look.ears)
      expect(b.look.tails).toContain(look.tail)
      expect(critterLook(b.species, b.look, 12345)).toEqual(look)
    }
    // без данных бойца — прежний облик вида
    expect(critterSvg({ ...classCat("myrmidon"), classId: undefined } as CritterArt)).toBe(critterSvg({ ...classCat("myrmidon"), classId: undefined, look: DEFAULT_LOOK.cat } as CritterArt))
  })
  it("бойцы одного вида, породы и класса заметно различаются; все детали — корректный SVG", () => {
    for (const species of ["cat", "dog", "mouse"] as const) {
      const base = generateUnit({ seed: 4242, level: 10, species })
      const svgs = new Set<string>()
      const looks = new Set<string>()
      for (let seed = 0; seed < 30; seed++) {
        const u = { ...base, seed }
        looks.add(JSON.stringify(unitArt(u).look))
        const svg = unitSvg(u)
        wellFormed(svg)
        svgs.add(svg)
      }
      expect(looks.size).toBeGreaterThan(10)
      expect(svgs.size).toBeGreaterThan(10)
    }
    for (const b of BREEDS) {
      const u = { ...generateUnit({ seed: 7, level: 5, species: b.species }), breedId: b.id }
      for (const pose of POSES) {
        wellFormed(unitSvg(u, { pose }))
        wellFormed(unitSvg({ ...u, isEnemy: true }, { pose }))
      }
      for (const part of CRITTER_PARTS) wellFormed(unitPartSvg(u, part))
    }
  })
  it("формы ушей и хвоста пород — из тех, что вид умеет рисовать", () => {
    for (const b of BREEDS) {
      for (const e of b.look.ears) expect(DRAWABLE_EARS[b.species], `${b.id}: уши ${e}`).toContain(e)
      for (const t of b.look.tails) expect(DRAWABLE_TAILS[b.species], `${b.id}: хвост ${t}`).toContain(t)
    }
    for (const s of ["cat", "dog", "mouse"] as const) {
      expect(DRAWABLE_EARS[s]).toContain(DEFAULT_LOOK[s].ears)
      expect(DRAWABLE_TAILS[s]).toContain(DEFAULT_LOOK[s].tail)
    }
  })
  it("неизвестная порода не ломает миниатюру", () => {
    const u = { ...generateUnit({ seed: 8, level: 5 }), breedId: "nope" }
    wellFormed(unitSvg(u))
  })
})

describe("арт: фоны и тайлы", () => {
  it("фоны для всех биомов, клеток и сторон", () => {
    for (const b of BIOMES)
      for (const t of TERRAINS) for (const side of ["left", "right"] as const) wellFormed(backdropSvg(b.id, t, side))
  })
  it("тайлы для всех биомов, клеток и кадров анимации", () => {
    for (const b of BIOMES) for (const t of TERRAINS) for (const f of [0, 1, 2]) wellFormed(tileSvg(b.id, t, f))
    // кадры воды действительно различаются
    expect(tileSvg("yard", "water", 0)).not.toBe(tileSvg("yard", "water", 1))
    expect(tileSvg("jungle", "forest", 0)).not.toBe(tileSvg("jungle", "forest", 1))
  })
  it("варианты тайлов, накладки краёв и земля вокруг поля", () => {
    for (const b of BIOMES) {
      for (const t of TERRAINS) {
        const variants = TILE_VARIANTS[t] ?? 1
        const frames = TILE_FRAME_COUNT[t] ?? 1
        for (let v = 0; v < variants; v++) for (let f = 0; f < frames; f++) wellFormed(tileSvg(b.id, t, f, v))
      }
      for (const k of ["shore", "shade", "rubble"] as const) for (const f of [0, 1]) wellFormed(tileEdgeSvg(b.id, k, f))
      wellFormed(groundSvg(b.id))
    }
    // варианты действительно разные: поле не выглядит плиткой
    expect(tileSvg("yard", "plain", 0, 0)).not.toBe(tileSvg("yard", "plain", 0, 1))
    expect(tileSvg("basement", "forest", 0, 0)).not.toBe(tileSvg("basement", "forest", 0, 1))
    // 4 кадра воды, все разные
    const water = [0, 1, 2, 3].map(f => tileSvg("yard", "water", f))
    expect(new Set(water).size).toBe(4)
  })
  it("слои фона кинематика: дальний, средний и ближний план", () => {
    for (const b of BIOMES) {
      for (const t of TERRAINS) {
        const layers = backdropLayersSvg(b.id, t, "left")
        wellFormed(layers.far)
        wellFormed(layers.mid)
        wellFormed(layers.near)
      }
    }
  })
})

describe("арт: снаряжение", () => {
  it("иконка есть у каждого оружия и талисмана; деревянное — коричневое, разные материалы — разные цвета", () => {
    for (const w of WEAPONS) wellFormed(weaponIconSvg(w.kind, w.grade, w.variant))
    for (const t of TALISMANS) wellFormed(ringSvg(t.id))
    wellFormed(ringSvg())
    expect(weaponIconSvg("sword", "wood")).toContain("#a0673a")
    const grades = new Set(["wood", "iron", "steel", "silver"].map(g => weaponIconSvg("sword", g as "wood")))
    expect(grades.size).toBe(4)
    expect(new Set(TALISMANS.map(t => ringSvg(t.id))).size).toBe(TALISMANS.length)
  })
  it("«!» на снаряжении: деревянное оружие при лучшем в инвентаре, пустой талисман при свободном", () => {
    const u = generateUnit({ seed: 3, level: 5 })
    expect(gearAlerts(u, {})).toEqual({ weapon: false, talisman: false })
    expect(gearAlerts(u, { sword_steel: 1, tal_bell: 1 })).toEqual({ weapon: true, talisman: true })
    expect(gearAlerts({ ...u, accessory: "tal_fang", skills: { ...u.skills, weapon: "sword_steel" } }, { axe_silver: 1, tal_bell: 1 }))
      .toEqual({ weapon: false, talisman: false })
  })
})

describe("арт: враги-зомби", () => {
  it("враг — зомби-вариант той же модели, боец игрока — нет; все позы и части тела корректны", () => {
    const u = generateUnit({ seed: 77, level: 20 })
    const enemy = { ...u, isEnemy: true }
    expect(unitArt(u).zombie).toBeUndefined()
    expect(unitArt(enemy).zombie).toBe(true)
    expect(unitSvg(enemy)).not.toBe(unitSvg(u))
    // окрас угадывается, но шерсть другая
    const f = unitArt(u).fur
    expect(zombieFur(f).fur).not.toBe(f.fur)
    for (const pose of POSES) wellFormed(unitSvg(enemy, { pose }))
    for (const part of CRITTER_PARTS) wellFormed(unitPartSvg(enemy, part))
    // издалека враг отличим: красные светящиеся зрачки, оскал и рваная одежда — у своего бойца ничего этого нет
    const boss = unitSvg({ ...enemy, isBoss: true })
    for (const mark of ["#e01b24", "#3a1a22", "class=\"rags\""]) {
      expect(boss).toContain(mark)
      expect(unitSvg(u)).not.toContain(mark)
    }
  })
})

describe("арт: палитры", () => {
  it("FUR_PALETTES и FUR_ART совпадают по длине и основному цвету; глаза — так же", () => {
    expect(FUR_PALETTES.length).toBe(FUR_ART.length)
    FUR_PALETTES.forEach((p, i) => expect(p.color, `шерсть ${i}`).toBe(parseInt((FUR_ART[i]?.fur ?? "").slice(1), 16)))
    expect(EYE_COLORS.length).toBe(EYE_ART.length)
    EYE_COLORS.forEach((p, i) => expect(p.color, `глаза ${i}`).toBe(parseInt((EYE_ART[i] ?? "").slice(1), 16)))
  })
})
