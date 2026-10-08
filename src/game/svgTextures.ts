import type Phaser from 'phaser';
import type { TerrainId, UnitInstance } from '@core/types';
import { backdropSvg, svgToImage, tileSvg, unitArtKey, unitPartSvg, unitSvg, CRITTER_PARTS, TILE_FRAME_COUNT, type CritterPart, type Pose } from '@art/index';

/** Размеры растеризации миниатюр (пропорция VIEW 120:140). */
export const UNIT_TEX_SIZE = {
  map: { w: 128, h: 149 },
  cine: { w: 300, h: 350 },
} as const;
export type UnitTexSize = keyof typeof UNIT_TEX_SIZE;

export const TILE_TEX_PX = 128;
export const MAP_POSES: readonly Pose[] = ['idle', 'run', 'hurt', 'dead', 'carried', 'blink'];
export const CINE_POSES: readonly Pose[] = ['idle', 'run', 'hurt', 'dead', 'happy', 'blink'];
export const TERRAINS: readonly TerrainId[] = ['plain', 'forest', 'mountain', 'water', 'wall', 'wall_breakable', 'cover'];

const inflight = new Map<string, Promise<string>>();

function texturesOf(scene: Phaser.Scene): Phaser.Textures.TextureManager | null {
  // После уничтожения сцены/игры sys и textures могут быть undefined.
  const sys = (scene as { sys?: Phaser.Scenes.Systems }).sys;
  if (!sys) return null;
  return (scene as { textures?: Phaser.Textures.TextureManager }).textures ?? null;
}

export function hasTexture(scene: Phaser.Scene, key: string): boolean {
  return texturesOf(scene)?.exists(key) ?? false;
}

/** Растеризовать SVG в текстуру Phaser (один раз на ключ). Всегда резолвится ключом. */
export function ensureTexture(scene: Phaser.Scene, key: string, svg: string, w: number, h: number): Promise<string> {
  const tm = texturesOf(scene);
  if (!tm) return Promise.resolve(key);
  if (tm.exists(key)) return Promise.resolve(key);
  const hit = inflight.get(key);
  if (hit) return hit;
  const p = svgToImage(key, svg, w, h)
    .then((img) => {
      const t = texturesOf(scene);
      if (t && !t.exists(key)) t.addImage(key, img);
      return key;
    })
    .catch(() => key)
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/* ---------- Юниты ---------- */

export function unitTexKey(unit: UnitInstance, pose: Pose, size: UnitTexSize): string {
  return `u:${unitArtKey(unit, pose)}:${size}`;
}

export function ensureUnitTexture(scene: Phaser.Scene, unit: UnitInstance, pose: Pose, size: UnitTexSize): Promise<string> {
  const key = unitTexKey(unit, pose, size);
  if (hasTexture(scene, key)) return Promise.resolve(key);
  const px = UNIT_TEX_SIZE[size];
  return ensureTexture(scene, key, unitSvg(unit, { pose }), px.w, px.h);
}

export function ensureUnitTextures(scene: Phaser.Scene, unit: UnitInstance, size: UnitTexSize, poses: readonly Pose[] = size === 'cine' ? CINE_POSES : MAP_POSES): Promise<string[]> {
  return Promise.all(poses.map((p) => ensureUnitTexture(scene, unit, p, size)));
}

/* ---------- Части тела (разлёт при гибели) ---------- */

export function unitPartTexKey(unit: UnitInstance, part: CritterPart, size: UnitTexSize): string {
  return `up:${unitArtKey(unit, 'dead')}:${part}:${size}`;
}

/** Текстуры частей тела в том же viewBox, что и целая миниатюра: накладываются на спрайт 1:1. */
export function ensureUnitPartTextures(scene: Phaser.Scene, unit: UnitInstance, size: UnitTexSize): Promise<Record<CritterPart, string>> {
  const px = UNIT_TEX_SIZE[size];
  const out = {} as Record<CritterPart, string>;
  return Promise.all(
    CRITTER_PARTS.map(async (part) => {
      const key = unitPartTexKey(unit, part, size);
      out[part] = hasTexture(scene, key) ? key : await ensureTexture(scene, key, unitPartSvg(unit, part), px.w, px.h);
    }),
  ).then(() => out);
}

/* ---------- Тайлы ---------- */

/** Сколько кадров анимации у местности (вода 3, листва 2, остальное 1). */
export function tileFrameCount(terrain: TerrainId): number {
  return TILE_FRAME_COUNT[terrain] ?? 1;
}

export function tileTexKey(biomeId: string, terrain: TerrainId, frame = 0): string {
  return `tile:${biomeId}:${terrain}:${frame}`;
}

/** Все кадры анимированных тайлов и нулевой кадр остальных: ≤ 10 текстур на биом. */
export function ensureTileTextures(scene: Phaser.Scene, biomeId: string): Promise<string[]> {
  const jobs: Promise<string>[] = [];
  for (const t of TERRAINS) {
    const frames = tileFrameCount(t);
    for (let f = 0; f < frames; f++) jobs.push(ensureTexture(scene, tileTexKey(biomeId, t, f), tileSvg(biomeId, t, f), TILE_TEX_PX, TILE_TEX_PX));
  }
  return Promise.all(jobs);
}

/* ---------- Фоны кинематика ---------- */

export function backdropTexKey(biomeId: string, terrain: TerrainId, side: 'left' | 'right', w: number, h: number): string {
  return `bd:${biomeId}:${terrain}:${side}:${w}x${h}`;
}

export function ensureBackdropTexture(scene: Phaser.Scene, biomeId: string, terrain: TerrainId, side: 'left' | 'right', w: number, h: number): Promise<string> {
  const pw = Math.max(1, Math.round(w));
  const ph = Math.max(1, Math.round(h));
  return ensureTexture(scene, backdropTexKey(biomeId, terrain, side, pw, ph), backdropSvg(biomeId, terrain, side), pw, ph);
}

/** Ожидание с потолком по времени — чтобы бой не завис, если растеризация тормозит. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}
