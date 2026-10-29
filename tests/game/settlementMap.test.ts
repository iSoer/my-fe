import { describe, expect, it } from "vitest"
import {
  activeNpcs,
  findPath,
  heroFits,
  moveHero,
  normalizeInput,
  placeInReach,
  settlementTile,
  walkableTile
} from "@game/core/settlement/walk"
import { FISHER_MUTTERS } from "@game/content/dialogues"
import { setLang } from "@game/i18n"
import {
  BUILDING_IDS,
  FISHER,
  HERO_RETURN,
  HERO_START,
  NPCS,
  PLOTS,
  SCREEN_W,
  SETTLEMENT_H,
  SETTLEMENT_TILES,
  SETTLEMENT_W,
  SORTIE_GATE,
  placeFront
} from "@game/content/settlement"
import { placeSigns } from "@game/state/settlement"
import { createEmptySave } from "@game/core/save"
import type { Pos, SaveGame } from "@game/core/types"
import { buildingWear } from "@game/art/village"
import { rainAt, rainyCycle } from "@game/core/settlement/rain"
import { SETTLEMENT_RAIN } from "@game/content/settlement"

const ALL_BUILT = (): SaveGame => {
  const save = createEmptySave(1)
  for (const id of BUILDING_IDS) save.settlement.buildings[id] = { level: 1, builtAt: 1 }
  return save
}

const PLACE_IDS = [...PLOTS.map(p => p.id), "gate"]
/** Все, кто может стоять на пути: жители всех зданий и рыбак. */
const EVERYONE = [...NPCS, FISHER]

/** Пройти путь шагами героя. */
function walk(from: Pos, path: Pos[], npcs = EVERYONE): Pos {
  let p = { ...from }
  for (const wp of path) for (let i = 0; i < 40; i++) p = moveHero(p, (wp.x - p.x) * 0.25, (wp.y - p.y) * 0.25, npcs)
  return p
}

describe("поселение: карта", () => {
  it("три экрана шириной, прямоугольная, по краю — частокол, выйти можно только через ворота внизу", () => {
    expect(SETTLEMENT_W).toBe(SCREEN_W * 3)
    expect(SETTLEMENT_TILES.every(row => row.length === SETTLEMENT_W)).toBe(true)
    for (let x = 0; x < SETTLEMENT_W; x++) {
      expect(walkableTile(x, 0)).toBe(false)
      expect(walkableTile(x, SETTLEMENT_H - 1)).toBe(false)
    }
    for (let y = 0; y < SETTLEMENT_H; y++) {
      expect(SETTLEMENT_TILES[y]?.[0]).toBe("F")
      expect(SETTLEMENT_TILES[y]?.[SETTLEMENT_W - 1]).toBe("F")
    }
    const border = SETTLEMENT_TILES[0]! + SETTLEMENT_TILES[SETTLEMENT_H - 1]!
    expect(border.replace(/[FG]/g, "")).toBe("")
    for (let x = SORTIE_GATE.x; x < SORTIE_GATE.x + SORTIE_GATE.w; x++) expect(SETTLEMENT_TILES[SORTIE_GATE.y]?.[x]).toBe("G")
  })

  it("участки непроходимы, внутри карты и не пересекаются", () => {
    for (const p of PLOTS) {
      expect(p.x + p.w).toBeLessThanOrEqual(SETTLEMENT_W)
      for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) expect(walkableTile(x, y), p.id).toBe(false)
      for (const q of PLOTS) {
        if (q === p) continue
        const apart = p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y
        expect(apart, `${p.id} / ${q.id}`).toBe(true)
      }
    }
  })

  it("на каждом экране есть места: Казармы и Лавка, полигон, бар и ворота, Кладбище", () => {
    const screen = (x: number) => Math.floor(x / SCREEN_W)
    expect(screen(PLOTS.find(p => p.building === "barracks")!.x)).toBe(0)
    expect(screen(PLOTS.find(p => p.building === "store")!.x)).toBe(0)
    expect(screen(PLOTS.find(p => p.building === "training")!.x)).toBe(1)
    expect(screen(PLOTS.find(p => p.building === "tavern")!.x)).toBe(1)
    expect(screen(SORTIE_GATE.x)).toBe(1)
    expect(screen(PLOTS.find(p => p.building === "graveyard")!.x)).toBe(2)
  })
})

describe("поселение: герой", () => {
  it("старт и точка возвращения свободны при всех жителях", () => {
    expect(heroFits(HERO_START, EVERYONE)).toBe(true)
    expect(heroFits(HERO_RETURN, EVERYONE)).toBe(true)
  })

  it("рыбак стоит на траве у самой воды, лицом к ней, и не мешает дойти до мест", () => {
    const tx = Math.floor(FISHER.pos.x)
    const ty = Math.floor(FISHER.pos.y)
    expect(walkableTile(tx, ty)).toBe(true)
    expect(settlementTile(tx - 1, ty)).toBe("water")
    expect(FISHER.faceLeft).toBe(true)
    expect(NPCS.every(n => Math.hypot(n.pos.x - FISHER.pos.x, n.pos.y - FISHER.pos.y) > 2)).toBe(true)
    // в него не войти
    expect(heroFits(FISHER.pos, [FISHER])).toBe(false)
  })

  it("рыбак бубнит про рыбу: реплик хватает, все разные, на обоих языках", () => {
    for (const lang of ["ru", "en"] as const) {
      setLang(lang)
      const lines = FISHER_MUTTERS()
      expect(lines.length).toBeGreaterThanOrEqual(8)
      expect(new Set(lines).size).toBe(lines.length)
      for (const l of lines) expect(l.length, l).toBeLessThanOrEqual(70)
    }
    setLang("en")
  })

  it("к каждому месту можно дойти со старта и открыть его, даже когда построено всё", () => {
    for (const id of PLACE_IDS) {
      const front = placeFront(id)!
      expect(heroFits(front, EVERYONE), id).toBe(true)
      expect(placeInReach(front), id).toBe(id)
      const path = findPath(HERO_START, front, EVERYONE)
      expect(path.length, id).toBeGreaterThan(0)
      expect(placeInReach(walk(HERO_START, [...path, front])), id).toBe(id)
    }
  })

  it("жители стоят только у построенных зданий, Разведчик у ворот — всегда", () => {
    const save = createEmptySave(1)
    expect(activeNpcs(save).map(n => n.place).sort()).toEqual(["gate", "plot-barracks"])
    expect(activeNpcs(ALL_BUILT()).length).toBe(NPCS.length)
    // житель стоит рядом со входом в своё место, но не загораживает его
    for (const n of NPCS) {
      const front = placeFront(n.place)!
      expect(Math.hypot(front.x - n.pos.x, front.y - n.pos.y), n.id).toBeLessThan(2.2)
    }
  })

  it("стены и жители не пропускают героя, вдоль стены он скользит", () => {
    // упирается в Лавку снизу (участок — ряды 2–3)
    const below = { x: 6.5, y: 4.6 }
    expect(moveHero(below, 0, -3, NPCS).y).toBeGreaterThan(4.2)
    const slide = moveHero(below, 1, -1, NPCS)
    expect(slide.x).toBeGreaterThan(below.x + 0.9)
    // сквозь жителя не пройти, а если здания нет — жителя тоже нет
    const scout = NPCS.find(n => n.id === "scout")!
    const left = { x: scout.pos.x - 1.2, y: scout.pos.y }
    expect(moveHero(left, 2, 0, NPCS).x).toBeLessThan(scout.pos.x - 0.6)
    const coach = NPCS.find(n => n.id === "coach")!
    const nearCoach = { x: coach.pos.x - 1.2, y: coach.pos.y }
    expect(moveHero(nearCoach, 2, 0, activeNpcs(createEmptySave(1))).x).toBeGreaterThan(coach.pos.x)
  })

  it("диагональ не быстрее прямой, тап по дереву ведёт к ближайшей проходимой клетке", () => {
    const d = normalizeInput(1, 1)
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1)
    const path = findPath(HERO_START, { x: 0.5, y: 8.5 }, NPCS)
    const last = path[path.length - 1]!
    expect(walkableTile(Math.floor(last.x), Math.floor(last.y))).toBe(true)
  })
})

describe("поселение: вывески", () => {
  it("у каждого места есть вывеска; непостроенное — с ценой, построенное — с уровнем", () => {
    const save = createEmptySave(1)
    save.profile.treats = 0
    const signs = placeSigns(save, 1)
    expect(Object.keys(signs).sort()).toEqual([...PLACE_IDS].sort())
    expect(signs["plot-barracks"]?.built).toBe(true)
    expect(signs["plot-barracks"]?.sub).toContain("◆")
    expect(signs["plot-training"]?.built).toBe(false)
    expect(signs["plot-training"]?.sub).toContain("🦴")
    expect(signs["plot-training"]?.status).toBe("free")
    expect(signs["plot-tavern"]?.status).toBe("free")
    expect(signs["plot-tavern"]?.level).toBe(0)
    expect(signs["gate"]?.built).toBe(true)
  })
})

describe("поселение: вид", () => {
  it("каждый уровень здания чинит часть поломок, но целым оно не становится", () => {
    const wear = [1, 2, 3, 4, 5].map(buildingWear)
    for (let i = 1; i < wear.length; i++) expect(wear[i]).toBeLessThan(wear[i - 1]!)
    expect(wear[0]).toBe(1)
    expect(Math.min(...wear)).toBeGreaterThan(0.15)
  })

  it("дождь идёт иногда: доля дождливых окон около заданной, сила 0…1 и плавно нарастает", () => {
    const n = 4000
    let wet = 0
    for (let c = 0; c < n; c++) if (rainyCycle(c)) wet++
    expect(wet / n).toBeGreaterThan(SETTLEMENT_RAIN.share - 0.05)
    expect(wet / n).toBeLessThan(SETTLEMENT_RAIN.share + 0.05)
    // начало дождливого окна после сухого — дождь набирает силу, а не обрушивается
    const c = Array.from({ length: 200 }, (_, i) => i + 1).find(i => rainyCycle(i) && !rainyCycle(i - 1))!
    const start = c * SETTLEMENT_RAIN.cycleMs
    expect(rainAt(start)).toBe(0)
    expect(rainAt(start + 4_000)).toBeGreaterThan(0)
    expect(rainAt(start + 4_000)).toBeLessThan(1)
    expect(rainAt(start + 60_000)).toBe(1)
    for (let t = 0; t < 50; t++) {
      const v = rainAt(start + t * 9_000)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
})
