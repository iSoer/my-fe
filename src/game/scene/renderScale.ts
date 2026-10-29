import type { GraphicsQuality } from "@game/core/types"

/**
 * Плотность рендера Phaser-сцен (без Phaser, покрыто тестами). Канвас рисуется в `CSS-размер × scale` пикселях,
 * а растровые текстуры SVG-арта подбираются под экранный размер × scale из нескольких ступеней.
 */

export interface ScaleEnv {
  /** `window.devicePixelRatio`. */
  dpr: number
  /** `navigator.deviceMemory` в ГБ, если браузер его сообщает. */
  deviceMemory?: number
}

/** Потолки плотности по режимам. */
export const RENDER_SCALE_CAP = { auto: 2, autoLowMemory: 1.5, crisp: 3 } as const

/** Сколько памяти (ГБ) считается слабым устройством для «авто». */
export const LOW_MEMORY_GB = 2

/** Плотность рендера по настройке и устройству: не меньше 1, «eco» — ровно 1. */
export function pickRenderScale(quality: GraphicsQuality, env: ScaleEnv): number {
  const dpr = Number.isFinite(env.dpr) && env.dpr > 0 ? env.dpr : 1
  if (quality === "eco") return 1
  const cap
    = quality === "crisp"
      ? RENDER_SCALE_CAP.crisp
      : env.deviceMemory !== undefined && env.deviceMemory <= LOW_MEMORY_GB
        ? RENDER_SCALE_CAP.autoLowMemory
        : RENDER_SCALE_CAP.auto
  return Math.max(1, Math.min(dpr, cap))
}

/** Плотность для текущего окна браузера. */
export function browserRenderScale(quality: GraphicsQuality): number {
  if (typeof window === "undefined") return 1
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  return pickRenderScale(quality, { dpr: window.devicePixelRatio || 1, deviceMemory: typeof mem === "number" ? mem : undefined })
}

/* ---------- Активная плотность (для текста) ---------- */

let active = 1

/** Плотность смонтированной Phaser-игры (бой и поселение не живут одновременно). */
export function setActiveRenderScale(scale: number): void {
  active = Math.max(1, scale)
}

export function activeRenderScale(): number {
  return active
}

/** Потолок разрешения текстовых канвасов Phaser: дальше — лишняя память без видимой разницы. */
export const TEXT_RES_CAP = 4

/** Разрешение Phaser-текста: `base` — запас под зум (как раньше `setResolution(2)`), умноженный на плотность. */
export function textRes(base = 1, scale = active): number {
  return Math.min(TEXT_RES_CAP, Math.max(base, base * scale))
}

/* ---------- Ступени текстур ---------- */

/** Запас под зум-удары, наезд камеры перед кинематиком и камеру поселения. */
export const TEX_HEADROOM = 1.25

/**
 * Ступени высоты растра миниатюр. Первая — прежний размер (карта 149, кинематик 350): при плотности 1 текстуры
 * те же, что раньше. Ключ текстуры содержит ступень, поэтому вариантов не больше числа ступеней.
 */
export const UNIT_TEX_BUCKETS = {
  map: [149, 192, 256, 320],
  cine: [350, 448, 512, 640]
} as const

export type UnitTexKind = keyof typeof UNIT_TEX_BUCKETS

/** Пропорция миниатюры (VIEW 120:140). */
export const UNIT_TEX_RATIO = 120 / 140

/** Ступени стороны тайла поля: 128 — прежний размер. */
export const TILE_TEX_BUCKETS = [128, 192, 256] as const

/** Наименьшая ступень не меньше `px`; если нужно больше последней — последняя (потолок памяти). */
export function texBucket(px: number, buckets: readonly number[]): number {
  for (const b of buckets) if (b >= px) return b
  return buckets[buckets.length - 1] ?? Math.ceil(px)
}

/** Ступень высоты растра миниатюры по высоте на экране в CSS-пикселях. */
export function unitTexHeight(kind: UnitTexKind, cssHeight: number, scale: number): number {
  return texBucket(cssHeight * scale * TEX_HEADROOM, UNIT_TEX_BUCKETS[kind])
}

/** Размер растра миниатюры по ступени высоты. */
export function unitTexPx(h: number): { w: number, h: number } {
  return { w: Math.round(h * UNIT_TEX_RATIO), h }
}

/** Сторона растра тайла по размеру клетки на экране. */
export function tileTexPx(cssTile: number, scale: number): number {
  return texBucket(cssTile * scale * TEX_HEADROOM, TILE_TEX_BUCKETS)
}

/** Потолок плотности фонов кинематика: фон крупный и мягкий, а растр на весь экран дорог по памяти. */
export const BACKDROP_SCALE_CAP = 1.5

/** Множитель растра SVG поселения (мир в клетках по 48 px): прежние 2, при высокой плотности — до 3. */
export function settlementRes(scale: number, zoom: number): number {
  return Math.min(3, Math.max(2, Math.round(scale * Math.min(1.6, zoom) * 2) / 2))
}
