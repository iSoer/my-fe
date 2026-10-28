import { describe, expect, it } from "vitest"
import {
  activeNpcs,
  findPath,
  heroFits,
  moveHero,
  normalizeInput,
  placeInReach,
  walkableTile
} from "@game/core/settlement/walk"
import {
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

const ALL_BUILT = (): SaveGame => {
  const save = createEmptySave(1)
  for (const id of ["barracks", "training", "store", "graveyard"] as const) save.settlement.buildings[id] = { level: 1, builtAt: 1 }
  return save
}

const PLACE_IDS = [...PLOTS.map(p => p.id), "gate"]

/** Пройти путь шагами героя. */
function walk(from: Pos, path: Pos[], npcs = NPCS): Pos {
  let p = { ...from }
  for (const wp of path) for (let i = 0; i < 40; i++) p = moveHero(p, (wp.x - p.x) * 0.25, (wp.y - p.y) * 0.25, npcs)
  return p
}

describe("поселение: карта", () => {
  it("три экрана шириной, прямоугольная, по краю — деревья, ворота внизу", () => {
    expect(SETTLEMENT_W).toBe(SCREEN_W * 3)
    expect(SETTLEMENT_TILES.every(row => row.length === SETTLEMENT_W)).toBe(true)
    for (let x = 0; x < SETTLEMENT_W; x++) {
      expect(walkableTile(x, 0)).toBe(false)
      expect(walkableTile(x, SETTLEMENT_H - 1)).toBe(false)
    }
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

  it("на каждом экране есть места: Казармы и Лавка, полигон и ворота, Кладбище", () => {
    const screen = (x: number) => Math.floor(x / SCREEN_W)
    expect(screen(PLOTS.find(p => p.building === "barracks")!.x)).toBe(0)
    expect(screen(PLOTS.find(p => p.building === "store")!.x)).toBe(0)
    expect(screen(PLOTS.find(p => p.building === "training")!.x)).toBe(1)
    expect(screen(SORTIE_GATE.x)).toBe(1)
    expect(screen(PLOTS.find(p => p.building === "graveyard")!.x)).toBe(2)
  })
})

describe("поселение: герой", () => {
  it("старт и точка возвращения свободны при всех жителях", () => {
    expect(heroFits(HERO_START, NPCS)).toBe(true)
    expect(heroFits(HERO_RETURN, NPCS)).toBe(true)
  })

  it("к каждому месту можно дойти со старта и открыть его, даже когда построено всё", () => {
    for (const id of PLACE_IDS) {
      const front = placeFront(id)!
      expect(heroFits(front, NPCS), id).toBe(true)
      expect(placeInReach(front), id).toBe(id)
      const path = findPath(HERO_START, front, NPCS)
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
    expect(signs["plot-reserve"]?.status).toBe("locked")
    expect(signs["gate"]?.built).toBe(true)
  })
})
