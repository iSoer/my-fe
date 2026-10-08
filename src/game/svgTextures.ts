import type Phaser from 'phaser';
import type { TerrainId, UnitInstance } from '@core/types';
import { backdropSvg, svgToImage, tileSvg, unitArtKey, unitSvg, type Pose } from '@art/index';

/** Размеры растеризации миниатюр (пропорция VIEW 120:140). */
export const UNIT_TEX_SIZE = {
  map: { w: 128, h: 149 },
  cine: { w: 300, h: 350 },
} as const;
export type UnitTexSize = keyof typeof UNIT_TEX_SIZE;

export const TILE_TEX_PX = 128;
export const MAP_POSES: readonly Pose[] = ['idle', 'run', 'hurt', 'dead'];
export const CINE_POSES: readonly Pose[] = ['idle', 'run', 'hurt', 'dead', 'happy'];
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

/* ---------- Тайлы ---------- */

export function tileTexKey(biomeId: string, terrain: TerrainId): string {
  return `tile:${biomeId}:${terrain}`;
}

export function ensureTileTextures(scene: Phaser.Scene, biomeId: string): Promise<string[]> {
  return Promise.all(TERRAINS.map((t) => ensureTexture(scene, tileTexKey(biomeId, t), tileSvg(biomeId, t), TILE_TEX_PX, TILE_TEX_PX)));
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
