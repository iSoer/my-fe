import type Phaser from "phaser"
import type { TerrainId, UnitInstance } from "@game/core/types"
import {
  backdropSvg,
  svgToImage,
  unitArtKey,
  unitPartSvg,
  unitSvg,
  CRITTER_PARTS,
  TILE_FRAME_COUNT,
  type CritterPart,
  type Pose
} from "@game/art/index"

import {
  BACKDROP_SCALE_CAP,
  TILE_TEX_BUCKETS,
  UNIT_TEX_BUCKETS,
  unitTexHeight,
  unitTexPx,
  tileTexPx,
  type UnitTexKind
} from "./renderScale"
import { renderScaleOf } from "./hidpi"

/**
 * Вид миниатюры: `map` — на поле, `cine` — в кинематике. Размер растра — ступень из `UNIT_TEX_BUCKETS` под экранный
 * размер × плотность рендера; ступень выбирает сцена (`setUnitTexSize`) и хранит менеджер текстур игры.
 */
export type UnitTexSize = UnitTexKind

/** Прежний (базовый) размер тайла; фактический — `tileTexSize(scene)`. */
export const TILE_TEX_PX = TILE_TEX_BUCKETS[0]
export const MAP_POSES: readonly Pose[] = ["idle", "run", "hurt", "dead", "carried", "blink"]
export const CINE_POSES: readonly Pose[] = ["idle", "run", "hurt", "dead", "happy", "blink"]
export const TERRAINS: readonly TerrainId[] = [
  "plain",
  "forest",
  "mountain",
  "water",
  "wall",
  "wall_breakable",
  "cover"
]

/**
 * Растеризации в полёте — отдельно на каждый TextureManager: пересозданная игра не должна получить промис,
 * который положит текстуру в менеджер уже уничтоженной игры.
 */
const inflightByTm = new WeakMap<Phaser.Textures.TextureManager, Map<string, Promise<string>>>()

function inflightOf(tm: Phaser.Textures.TextureManager): Map<string, Promise<string>> {
  let m = inflightByTm.get(tm)
  if (!m) {
    m = new Map()
    inflightByTm.set(tm, m)
  }
  return m
}

function texturesOf(scene: Phaser.Scene): Phaser.Textures.TextureManager | null {
  // После уничтожения сцены/игры sys и textures могут быть undefined.
  const sys = (scene as { sys?: Phaser.Scenes.Systems }).sys
  if (!sys) return null
  return (scene as { textures?: Phaser.Textures.TextureManager }).textures ?? null
}

export function hasTexture(scene: Phaser.Scene, key: string): boolean {
  return texturesOf(scene)?.exists(key) ?? false
}

/** Растеризовать SVG в текстуру Phaser (один раз на ключ). Всегда резолвится ключом. */
export function ensureTexture(scene: Phaser.Scene, key: string, svg: string, w: number, h: number): Promise<string> {
  const tm = texturesOf(scene)
  if (!tm) return Promise.resolve(key)
  if (tm.exists(key)) return Promise.resolve(key)
  const inflight = inflightOf(tm)
  const hit = inflight.get(key)
  if (hit) return hit
  const p = svgToImage(key, svg, w, h)
    .then((img) => {
      // Кладём только в тот же менеджер и только пока сцена жива
      const t = texturesOf(scene)
      if (t === tm && !t.exists(key)) t.addImage(key, img)
      return key
    })
    .catch(() => key)
    .finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

/* ---------- Размеры растра на игру ---------- */

interface TexSizes {
  map: number
  cine: number
  tile: number
}

const sizesByTm = new WeakMap<Phaser.Textures.TextureManager, TexSizes>()

function sizesOf(scene: Phaser.Scene): TexSizes {
  const tm = texturesOf(scene)
  const def: TexSizes = { map: UNIT_TEX_BUCKETS.map[0], cine: UNIT_TEX_BUCKETS.cine[0], tile: TILE_TEX_BUCKETS[0] }
  if (!tm) return def
  let s = sizesByTm.get(tm)
  if (!s) {
    s = def
    sizesByTm.set(tm, s)
  }
  return s
}

/**
 * Выбрать ступень растра миниатюр по высоте фигуры на экране (CSS px). Возвращает true, если ступень сменилась:
 * новые позы растеризуются в новом размере, уже показанные спрайты сцена может перепривязать сама.
 */
export function setUnitTexSize(scene: Phaser.Scene, size: UnitTexSize, cssHeight: number): boolean {
  const h = unitTexHeight(size, cssHeight, renderScaleOf(scene))
  const s = sizesOf(scene)
  if (s[size] === h) return false
  s[size] = h
  return true
}

/** Текущая ступень высоты растра миниатюры. */
export function unitTexHeightOf(scene: Phaser.Scene, size: UnitTexSize): number {
  return sizesOf(scene)[size]
}

/** Выбрать сторону растра тайлов по размеру клетки (CSS px). Текстуры тайлов растеризуются один раз на игру. */
export function setTileTexSize(scene: Phaser.Scene, cssTile: number): void {
  sizesOf(scene).tile = tileTexPx(cssTile, renderScaleOf(scene))
}

export function tileTexSize(scene: Phaser.Scene): number {
  return sizesOf(scene).tile
}

/* ---------- Юниты ---------- */

/** Ключ текстуры позы: в нём вид (`map`/`cine`) и ступень высоты, например `u:…:map192`. */
export function unitTexKey(scene: Phaser.Scene, unit: UnitInstance, pose: Pose, size: UnitTexSize): string {
  return `u:${unitArtKey(unit, pose)}:${size}${unitTexHeightOf(scene, size)}`
}

export function ensureUnitTexture(
  scene: Phaser.Scene,
  unit: UnitInstance,
  pose: Pose,
  size: UnitTexSize
): Promise<string> {
  const key = unitTexKey(scene, unit, pose, size)
  if (hasTexture(scene, key)) return Promise.resolve(key)
  const px = unitTexPx(unitTexHeightOf(scene, size))
  return ensureTexture(scene, key, unitSvg(unit, { pose }), px.w, px.h)
}

export function ensureUnitTextures(
  scene: Phaser.Scene,
  unit: UnitInstance,
  size: UnitTexSize,
  poses: readonly Pose[] = size === "cine" ? CINE_POSES : MAP_POSES
): Promise<string[]> {
  return Promise.all(poses.map(p => ensureUnitTexture(scene, unit, p, size)))
}

/* ---------- Части тела (разлёт при гибели) ---------- */

export function unitPartTexKey(scene: Phaser.Scene, unit: UnitInstance, part: CritterPart, size: UnitTexSize): string {
  return `up:${unitArtKey(unit, "dead")}:${part}:${size}${unitTexHeightOf(scene, size)}`
}

/** Текстуры частей тела в том же viewBox, что и целая миниатюра: накладываются на спрайт 1:1. */
export function ensureUnitPartTextures(
  scene: Phaser.Scene,
  unit: UnitInstance,
  size: UnitTexSize
): Promise<Record<CritterPart, string>> {
  const px = unitTexPx(unitTexHeightOf(scene, size))
  const out = {} as Record<CritterPart, string>
  return Promise.all(
    CRITTER_PARTS.map(async (part) => {
      const key = unitPartTexKey(scene, unit, part, size)
      out[part] = hasTexture(scene, key) ? key : await ensureTexture(scene, key, unitPartSvg(unit, part), px.w, px.h)
    })
  ).then(() => out)
}

/* ---------- Тайлы ---------- */

/** Сколько кадров анимации у местности (вода 4, листва 2, остальное 1). */
export function tileFrameCount(terrain: TerrainId): number {
  return TILE_FRAME_COUNT[terrain] ?? 1
}

/* ---------- Фоны кинематика ---------- */

export function backdropTexKey(
  biomeId: string,
  terrain: TerrainId,
  side: "left" | "right",
  w: number,
  h: number
): string {
  return `bd:${biomeId}:${terrain}:${side}:${w}x${h}`
}

/** Размер растра фона кинематика для вида `w × h` CSS px (плотность — не выше `BACKDROP_SCALE_CAP`). */
export function backdropPx(scene: Phaser.Scene, w: number, h: number): { w: number, h: number } {
  const k = Math.min(BACKDROP_SCALE_CAP, renderScaleOf(scene))
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }
}

/** Фон кинематика; `w × h` — размер на экране в CSS px, ключ — по размеру растра (`backdropPx`). */
export function ensureBackdropTexture(
  scene: Phaser.Scene,
  biomeId: string,
  terrain: TerrainId,
  side: "left" | "right",
  w: number,
  h: number
): Promise<string> {
  const { w: pw, h: ph } = backdropPx(scene, w, h)
  return ensureTexture(
    scene,
    backdropTexKey(biomeId, terrain, side, pw, ph),
    backdropSvg(biomeId, terrain, side),
    pw,
    ph
  )
}

/** Ожидание с потолком по времени — чтобы бой не завис, если растеризация тормозит. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>(resolve => setTimeout(() => resolve(null), ms))])
}
