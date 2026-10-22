import { describe, expect, it } from "vitest"
import { blobOutline, goreRng } from "@game/scene/goreShape"

describe("форма клякс крови", () => {
  it("ГПСЧ детерминирован и лежит в [0, 1)", () => {
    const a = goreRng(42)
    const b = goreRng(42)
    for (let i = 0; i < 200; i++) {
      const v = a()
      expect(v).toBe(b())
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it("контур кляксы: заданное число точек, радиус в пределах дрожания, один seed — одна форма", () => {
    for (const seed of [1, 7, 101, 9999]) {
      const pts = blobOutline(seed, 22, 30, 0.32)
      expect(pts).toHaveLength(22)
      for (const p of pts) {
        const r = Math.hypot(p.x, p.y)
        expect(r).toBeGreaterThanOrEqual(30 * (1 - 0.32) - 1e-9)
        expect(r).toBeLessThanOrEqual(30 * (1 + 0.32) + 1e-9)
      }
      expect(blobOutline(seed, 22, 30, 0.32)).toEqual(pts)
    }
    expect(blobOutline(1, 22, 30, 0.32)).not.toEqual(blobOutline(2, 22, 30, 0.32))
  })
})
