import { describe, expect, it } from "vitest"
import {
  artWeapon,
  backdropSvg,
  critterSvg,
  tileSvg,
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
  it("ярус и животное видны: Divine — нимб, кавалерия — лошадь, летуны — крылья", () => {
    expect(critterSvg(classCat("the-blade"))).toContain("class=\"halo\"")
    expect(critterSvg(classCat("commoner"))).not.toContain("class=\"halo\"")
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
