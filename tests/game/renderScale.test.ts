import { describe, expect, it } from "vitest"
import {
  TILE_TEX_BUCKETS,
  UNIT_TEX_BUCKETS,
  pickRenderScale,
  settlementRes,
  texBucket,
  textRes,
  tileTexPx,
  unitTexHeight,
  unitTexPx
} from "@game/scene/renderScale"

describe("плотность рендера Phaser", () => {
  it("«авто» — плотность экрана, но не больше 2; на слабом устройстве — не больше 1.5", () => {
    expect(pickRenderScale("auto", { dpr: 1 })).toBe(1)
    expect(pickRenderScale("auto", { dpr: 1.5 })).toBe(1.5)
    expect(pickRenderScale("auto", { dpr: 3 })).toBe(2)
    expect(pickRenderScale("auto", { dpr: 3, deviceMemory: 2 })).toBe(1.5)
    expect(pickRenderScale("auto", { dpr: 3, deviceMemory: 4 })).toBe(2)
    expect(pickRenderScale("auto", { dpr: 1.25, deviceMemory: 1 })).toBe(1.25)
  })
  it("«чёткое» — до 3, «экономное» — всегда 1", () => {
    expect(pickRenderScale("crisp", { dpr: 3 })).toBe(3)
    expect(pickRenderScale("crisp", { dpr: 4 })).toBe(3)
    expect(pickRenderScale("crisp", { dpr: 2.625, deviceMemory: 1 })).toBe(2.625)
    expect(pickRenderScale("eco", { dpr: 3 })).toBe(1)
  })
  it("плотность не меньше 1, мусор вместо DPR — 1", () => {
    expect(pickRenderScale("auto", { dpr: 0.5 })).toBe(1)
    expect(pickRenderScale("crisp", { dpr: Number.NaN })).toBe(1)
    expect(pickRenderScale("auto", { dpr: 0 })).toBe(1)
  })
  it("разрешение текста: база × плотность, с потолком", () => {
    expect(textRes(1, 1)).toBe(1)
    expect(textRes(2, 1)).toBe(2)
    expect(textRes(1, 2)).toBe(2)
    expect(textRes(2, 3)).toBe(4)
    expect(textRes(3, 1)).toBe(3)
  })
})

describe("ступени растра текстур", () => {
  it("наименьшая ступень не меньше нужного размера, сверх последней — последняя", () => {
    expect(texBucket(10, [128, 192, 256])).toBe(128)
    expect(texBucket(128, [128, 192, 256])).toBe(128)
    expect(texBucket(129, [128, 192, 256])).toBe(192)
    expect(texBucket(9999, [128, 192, 256])).toBe(256)
  })
  it("при плотности 1 размеры прежние: карта 128×149, кинематик 300×350, тайл 128", () => {
    // Телефон 390×844: клетка 62 px, боец на карте — 1.05 клетки, в кинематике — 0.42 ширины
    expect(unitTexPx(unitTexHeight("map", 62 * 1.05, 1))).toEqual({ w: 128, h: 149 })
    expect(unitTexPx(unitTexHeight("cine", 390 * 0.42, 1))).toEqual({ w: 300, h: 350 })
    expect(tileTexPx(62, 1)).toBe(128)
  })
  it("при плотности 2 и 3 растр крупнее экранного размера, но в пределах ступеней", () => {
    const map2 = unitTexHeight("map", 62 * 1.05, 2)
    const map3 = unitTexHeight("map", 62 * 1.05, 3)
    expect(map2).toBe(192)
    expect(map3).toBe(256)
    expect(map2).toBeGreaterThanOrEqual(62 * 1.05 * 2)
    expect(map3).toBeGreaterThanOrEqual(62 * 1.05 * 3)
    expect(unitTexHeight("cine", 164, 2)).toBe(448)
    expect(unitTexHeight("cine", 164, 3)).toBe(640)
    expect(tileTexPx(62, 2)).toBe(192)
    expect(tileTexPx(62, 3)).toBe(256)
  })
  it("потолок: огромный экран не раздувает текстуры сверх последней ступени", () => {
    expect(unitTexHeight("map", 400, 3)).toBe(UNIT_TEX_BUCKETS.map.at(-1))
    expect(unitTexHeight("cine", 900, 3)).toBe(UNIT_TEX_BUCKETS.cine.at(-1))
    expect(tileTexPx(300, 3)).toBe(TILE_TEX_BUCKETS.at(-1))
  })
  it("ступени растут, ширина миниатюры — по пропорции 120:140", () => {
    for (const list of [...Object.values(UNIT_TEX_BUCKETS), TILE_TEX_BUCKETS])
      for (let i = 1; i < list.length; i++) expect(list[i]!).toBeGreaterThan(list[i - 1]!)
    expect(unitTexPx(448)).toEqual({ w: 384, h: 448 })
  })
  it("растр поселения: прежние 2 при плотности 1, до 3 при высокой", () => {
    expect(settlementRes(1, 1)).toBe(2)
    expect(settlementRes(2, 1)).toBe(2)
    expect(settlementRes(2, 1.4)).toBe(3)
    expect(settlementRes(3, 1)).toBe(3)
    expect(settlementRes(3, 1.6)).toBe(3)
  })
})
