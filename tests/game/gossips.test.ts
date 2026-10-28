import { describe, expect, it } from "vitest"
import { findPath, heroFits, placeInReach, walkableTile } from "@game/core/settlement/walk"
import { FISHER, GOSSIPS, GOSSIP_GAP, GOSSIP_SPOTS, GOSSIP_TIMING, HERO_START, NPCS, PLOTS, SORTIE_GATE, placeFront } from "@game/content/settlement"
import quotes from "@game/content/quotes.json"
import type { Quote } from "@game/content/quotes"

const PLACE_IDS = [...PLOTS.map(p => p.id), "gate"]

describe("сплетники: места", () => {
  it("каждая пара стоит на проходимой траве, не впритык к другим жителям и не на входах", () => {
    const others = [...NPCS.map(n => n.pos), FISHER.pos]
    const fronts = PLACE_IDS.map(id => placeFront(id)!)
    for (const s of GOSSIP_SPOTS) {
      for (const p of [s, { x: s.x + GOSSIP_GAP, y: s.y }]) {
        expect(walkableTile(Math.floor(p.x), Math.floor(p.y)), JSON.stringify(p)).toBe(true)
        for (const o of others) expect(Math.hypot(o.x - p.x, o.y - p.y), JSON.stringify(p)).toBeGreaterThan(1.5)
        // от рыбака — подальше: облачка не должны накрывать друг друга
        expect(Math.hypot(FISHER.pos.x - p.x, FISHER.pos.y - p.y), JSON.stringify(p)).toBeGreaterThan(2.5)
        for (const f of fronts) expect(Math.hypot(f.x - p.x, f.y - p.y), JSON.stringify(p)).toBeGreaterThan(1)
      }
    }
    expect(GOSSIP_SPOTS.length).toBeGreaterThanOrEqual(4)
    expect(SORTIE_GATE).toBeTruthy()
  })

  it("где бы ни стояли, со старта можно дойти до каждого места", () => {
    for (const s of GOSSIP_SPOTS) {
      const blockers = [...NPCS, FISHER, { pos: s }, { pos: { x: s.x + GOSSIP_GAP, y: s.y } }]
      expect(heroFits(HERO_START, blockers)).toBe(true)
      for (const id of PLACE_IDS) {
        const front = placeFront(id)!
        expect(placeInReach(front), id).toBe(id)
        expect(findPath(HERO_START, front, blockers).length, `${id} @ ${JSON.stringify(s)}`).toBeGreaterThan(0)
      }
    }
  })

  it("двое, у каждого свой цвет облачка; взрыв — с пятого тапа", () => {
    expect(GOSSIPS.map(g => g.id)).toEqual(["elman", "vanya"])
    expect(GOSSIPS[0].bubble).not.toBe(GOSSIPS[1].bubble)
    expect(GOSSIP_TIMING.taps).toBe(5)
  })
})

describe("цитаты", () => {
  const list = quotes as readonly Quote[]

  it("у каждой — оба языка, источник на обоих языках и ссылка; id не повторяются, текст влезает в облачко", () => {
    const ids = new Set<string>()
    for (const q of list) {
      expect(ids.has(q.id), q.id).toBe(false)
      ids.add(q.id)
      expect(q.ru.trim().length, q.id).toBeGreaterThan(0)
      expect(q.en.trim().length, q.id).toBeGreaterThan(0)
      expect(["ru", "en"]).toContain(q.original)
      expect(q.source.ru.length * q.source.en.length, q.id).toBeGreaterThan(0)
      expect(q.url, q.id).toMatch(/^https?:\/\//)
      expect(Math.max(q.ru.length, q.en.length), q.id).toBeLessThanOrEqual(160)
    }
  })

  it("одна цитата не встречается дважды", () => {
    const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")
    const seen = new Set<string>()
    for (const q of list) {
      const k = norm(q.original === "ru" ? q.ru : q.en)
      expect(seen.has(k), q.id).toBe(false)
      seen.add(k)
    }
  })
})
