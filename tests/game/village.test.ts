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
import { GRAVEYARD, HERO_RETURN, HERO_START, HOUSES, NPCS, PLACES, VILLAGE_H, VILLAGE_MAP, VILLAGE_W } from "@game/content/village"
import { npcAlerts, villageGuide } from "@game/state/village"
import { createEmptySave } from "@game/core/save"
import { generateRoster } from "@game/core/units"

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
    // упирается в домик Лавки снизу (стены — ряды 2–3)
    const below = { x: 6.5, y: 4.6 }
    const blocked = moveHero(below, 0, -3)
    expect(blocked.y).toBeGreaterThan(4.2)
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

describe("деревня: город как меню", () => {
  it("у каждого места — житель, иконка и вывеска; здание внутри карты, места не пересекаются", () => {
    expect(PLACES.map(p => p.id).sort()).toEqual(NPCS.map(n => n.id).sort())
    for (const p of PLACES) {
      expect(p.icon.length).toBeGreaterThan(0)
      expect(p.name.length).toBeGreaterThan(0)
      expect(p.rect.x).toBeGreaterThanOrEqual(0)
      expect(p.rect.x + p.rect.w).toBeLessThanOrEqual(VILLAGE_W)
      expect(p.rect.y + p.rect.h).toBeLessThanOrEqual(VILLAGE_H)
      for (const q of PLACES) {
        if (q === p) continue
        const apart = p.rect.x + p.rect.w <= q.rect.x || q.rect.x + q.rect.w <= p.rect.x
          || p.rect.y + p.rect.h <= q.rect.y || q.rect.y + q.rect.h <= p.rect.y
        expect(apart, `${p.id} / ${q.id}`).toBe(true)
      }
    }
  })
  it("Кладбище огорожено: его клетки непроходимы", () => {
    for (let y = GRAVEYARD.y; y < GRAVEYARD.y + GRAVEYARD.h; y++)
      for (let x = GRAVEYARD.x; x < GRAVEYARD.x + GRAVEYARD.w; x++) expect(walkableTile(x, y)).toBe(false)
  })
  it("следующий шаг: идёт бой — к воротам, нет отряда или ждёт награда — в Казарму, иначе — на вылазку", () => {
    const save = createEmptySave(1)
    expect(villageGuide(save)).toBe("barracks")
    const units = generateRoster({ seed: 1, glory: 0 })
    save.army = { id: "a", units, squadIds: units.slice(0, 4).map(u => u.id), createdAt: 1, battles: 0, wins: 0 }
    expect(villageGuide(save)).toBe("sorties")
    expect(villageGuide({ ...save, rewardChoice: [units[0]!] })).toBe("barracks")
    expect(npcAlerts(save).graveyard).toBe(false)
  })
})
