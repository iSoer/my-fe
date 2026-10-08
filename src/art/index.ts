import type { UnitInstance } from '@core/types';
import { classDef } from '@content/classes';
import { KIND_COLOR } from '@content/weapons';
import { critterSvg, critterPartSvg, type CritterArt, type CritterPart, type Pose } from './critter';
import { eyeArt, furArt } from './palettes';

export { critterSvg, critterPartSvg, CRITTER_PARTS, CRITTER_PART_ANCHORS, VIEW, VIEW_BOX, type CritterArt, type Pose, type CritterPart } from './critter';
export { backdropSvg, BACKDROP } from './backdrop';
export { tileSvg, TILE_SIZE, TILE_FRAME_COUNT } from './tile';
export { svgToImage, svgDataUri, clearRasterCache } from './raster';
export { FUR_ART, EYE_ART, furArt, eyeArt, shade, hex } from './palettes';

export const WEAPON_HEX: Record<string, string> = {
  red: '#e63946',
  blue: '#3a86ff',
  green: '#2ec4b6',
  colorless: '#adb5bd',
};

export interface UnitArtOptions {
  pose?: Pose;
  animated?: boolean;
  blinkDelay?: number;
  /** Принудительно без хмурых бровей (например, пленник в Приюте). */
  friendly?: boolean;
}

/** Параметры миниатюры из данных бойца. */
export function unitArt(unit: UnitInstance, opts: UnitArtOptions = {}): CritterArt {
  const cls = classDef(unit.classId);
  const art: CritterArt = {
    species: unit.species,
    fur: furArt(unit.appearance.furPalette),
    iris: eyeArt(unit.appearance.eyeColor),
    pattern: unit.appearance.pattern,
    eyes: unit.appearance.eyes,
    accessory: unit.appearance.accessory,
    moveType: cls.moveType,
    weapon: cls.weaponKind,
    weaponColor: WEAPON_HEX[KIND_COLOR[cls.weaponKind]] ?? '#adb5bd',
    pose: opts.pose ?? 'idle',
    animated: opts.animated ?? false,
  };
  if (unit.isBoss) art.boss = true;
  if (unit.isEnemy && !opts.friendly) art.angry = true;
  if (opts.blinkDelay !== undefined) art.blinkDelay = opts.blinkDelay;
  return art;
}

export function unitSvg(unit: UnitInstance, opts: UnitArtOptions = {}): string {
  return critterSvg(unitArt(unit, opts));
}

/** Ключ кэша текстуры: всё, что влияет на картинку. */
export function unitArtKey(unit: UnitInstance, pose: Pose): string {
  const a = unit.appearance;
  return `${unit.species}:${unit.classId}:${a.furPalette}:${a.pattern}:${a.eyes}:${a.eyeColor}:${a.accessory}:${unit.isBoss ? 'b' : ''}${unit.isEnemy ? 'e' : ''}:${pose}`;
}

export function unitPartSvg(unit: UnitInstance, part: CritterPart): string {
  return critterPartSvg(unitArt(unit, { pose: 'dead' }), part);
}
