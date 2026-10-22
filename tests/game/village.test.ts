import { describe, expect, it } from "vitest"
import {
  findVillagePath,
  heroFits,
  moveHero,
  normalizeInput,
  npcInReach,
  spotNear,
  walkableTile
} from "@game/core/village"
import { HERO_RETURN, HERO_START, HOUSES, NPCS, VILLAGE_H, VILLAGE_MAP, VILLAGE_W } from "@game/content/village"

describe("деревня: карта", () => {
  it("прямоугольная, по краю — деревья, домики стоят на стенах с дверью снизу", () => {
    expect(VILLAGE_MAP.every(row => row.length === VILLAGE_W)).toBe(true)
    for (let x = 0; x < VILLAGE_W; x++) {
      expect(walkableTile(x, 0)).toBe(false)
      expect(walkableTile(x, VILLAGE_H - 1)).toBe(false)
    }
    for (const h of HOUSES) {
      for (let y = h.y; y < h.y + h.h; y++) for (let x = h.x; x < h.x + h.w; x++) expect(walkableTile(x, y)).toBe(false)
      expect(VILLAGE_MAP[h.y + h.h - 1]?.[h.x + Math.floor(h.w / 2)]).toBe("D")
    }
  })

  it("старт и точка возвращения свободны, все NPC достижимы со старта", () => {
    expect(heroFits(HERO_START)).toBe(true)
    expect(heroFits(HERO_RETURN)).toBe(true)
    for (const npc of NPCS) {
      const spot = spotNear(npc)
      expect(heroFits(spot)).toBe(true)
      expect(npcInReach(spot)?.id).toBe(npc.id)
      const path = findVillagePath(HERO_START, spot)
      expect(path.length).toBeGreaterThan(0)
      // идём по пути шагами героя — доходим до NPC
      let p = { ...HERO_START }
      for (const wp of path) for (let i = 0; i < 40; i++) p = moveHero(p, (wp.x - p.x) * 0.25, (wp.y - p.y) * 0.25)
      expect(npcInReach(p)?.id).toBe(npc.id)
    }
  })

  it("стены и NPC не пропускают героя, вдоль стены он скользит", () => {
    // упирается в домик Казармы снизу
    const below = { x: 3.5, y: 5.5 }
    const blocked = moveHero(below, 0, -3)
    expect(blocked.y).toBeGreaterThan(4.9)
    // диагональ в стену: по y стоит, по x проезжает
    const slide = moveHero(below, 1, -1)
    expect(slide.x).toBeGreaterThan(below.x + 0.9)
    // сквозь NPC не пройти
    const npc = NPCS[0]!
    const near = { x: npc.pos.x, y: npc.pos.y + 1.2 }
    expect(Math.hypot(moveHero(near, 0, -2).y - npc.pos.y, 0)).toBeGreaterThan(0.6)
  })

  it("диагональ не быстрее прямой, тап по дереву ведёт к ближайшей проходимой клетке", () => {
    const d = normalizeInput(1, 1)
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1)
    const path = findVillagePath(HERO_START, { x: 0.5, y: 8.5 })
    const last = path[path.length - 1]!
    expect(walkableTile(Math.floor(last.x), Math.floor(last.y))).toBe(true)
  })
})
