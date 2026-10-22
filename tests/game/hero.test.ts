import { describe, expect, it } from "vitest"
import { HERO_IDLE_FRAMES, HERO_WALK_FRAMES, heroArtKey, heroSvg, type HeroFacing } from "@game/art/index"

const FACINGS: HeroFacing[] = ["down", "up", "left", "right"]

describe("арт: главный герой", () => {
  it("все направления и кадры дают корректный SVG", () => {
    for (const facing of FACINGS) {
      for (const [pose, n] of [["idle", HERO_IDLE_FRAMES], ["walk", HERO_WALK_FRAMES]] as const) {
        for (let frame = 0; frame < n; frame++) {
          const svg = heroSvg({ facing, pose, frame })
          expect(svg.startsWith("<svg")).toBe(true)
          expect(svg.endsWith("</svg>")).toBe(true)
          expect(svg).not.toMatch(/NaN|undefined|null|id="/)
          expect((svg.match(/<g\b/g) ?? []).length).toBe((svg.match(/<\/g>/g) ?? []).length)
        }
      }
    }
  })

  it("кадры ходьбы различаются, номер кадра берётся по модулю", () => {
    const frames = new Set(Array.from({ length: HERO_WALK_FRAMES }, (_, frame) => heroSvg({ pose: "walk", frame })))
    expect(frames.size).toBeGreaterThan(1)
    expect(heroSvg({ pose: "walk", frame: HERO_WALK_FRAMES + 1 })).toBe(heroSvg({ pose: "walk", frame: 1 }))
    expect(heroArtKey({ pose: "walk", frame: -1 })).toBe(heroArtKey({ pose: "walk", frame: HERO_WALK_FRAMES - 1 }))
  })

  it("лицо скрыто: со спины проёма капюшона и глаз нет, eyes: false убирает блики", () => {
    expect(heroSvg({ facing: "up" })).not.toContain("#cfd8ff")
    expect(heroSvg({ facing: "down", eyes: false })).not.toContain("#cfd8ff")
    expect(heroSvg({ facing: "down" })).toContain("#cfd8ff")
  })
})
