import { describe, expect, it } from "vitest"
import { parentRoute, parseRoute, routePath } from "@game/state/router"

describe("маршруты вылазки", () => {
  it("сложность → вражеская армия → отряд", () => {
    expect(parseRoute("#/battle/setup")).toEqual({ name: "battleSetup" })
    expect(parseRoute("#/battle/enemy/hard")).toEqual({ name: "battleEnemy", difficulty: "hard" })
    expect(routePath({ name: "battleEnemy", difficulty: "nightmare" })).toBe("/battle/enemy/nightmare")
    expect(parentRoute({ name: "battleEnemy", difficulty: "easy" })).toEqual({ name: "battleSetup" })
    expect(parseRoute("#/battle/squad")).toEqual({ name: "battleSquad" })
  })
  it("неизвестная сложность — не экран врагов", () => {
    expect(parseRoute("#/battle/enemy/legendary").name).toBe("notFound")
    expect(parseRoute("#/battle/enemy").name).toBe("notFound")
  })
})
