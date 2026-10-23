import { describe, expect, it } from "vitest"
import { terrainInfo } from "@game/content/terrain"
import { makeBattle, plainTiles } from "./helpers"

const flat = { hp: 20, str: 10, mag: 10, spd: 5, def: 5, res: 5 }

describe("справка о клетке", () => {
  const b = makeBattle(
    [{ classId: "infantry_sword", pos: { x: 2, y: 7 }, baseStats: flat }],
    [{ classId: "infantry_sword", pos: { x: 2, y: 0 }, baseStats: flat }],
    { tiles: plainTiles({ "0,0": "forest", "1,0": "cover", "3,0": "water", "4,0": "wall", "5,0": "wall_breakable" }) }
  )
  const st = b.state

  it("заросли и укрытие дают бонус стоящему, проходимы для всех", () => {
    const forest = terrainInfo(st, { x: 0, y: 0 })
    expect(forest.bonus).toContain("+1")
    expect(forest.move).toMatch(/Anyone|всех/)
    expect(terrainInfo(st, { x: 1, y: 0 }).bonus).toContain("30")
  })

  it("равнина без эффектов; вода — только летунам; стена непроходима", () => {
    const plain = terrainInfo(st, { x: 2, y: 3 })
    expect(plain.bonus).toBeUndefined()
    expect(plain.notes.length).toBe(1)
    expect(terrainInfo(st, { x: 3, y: 0 }).move).toContain("Flier")
    expect(terrainInfo(st, { x: 4, y: 0 }).move).toMatch(/Impassable|Непроходима/)
  })

  it("хлипкое препятствие показывает остаток HP, сломанное — как равнина", () => {
    expect(terrainInfo(st, { x: 5, y: 0 }).notes.join(" ")).toContain("2")
    const broken = { ...st, walls: { ...st.walls, "5,0": 0 } }
    expect(terrainInfo(broken, { x: 5, y: 0 }).terrain).toBe("plain")
  })
})
