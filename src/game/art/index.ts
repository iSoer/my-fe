import type { UnitInstance, WeaponSkill } from "@game/core/types"
import { fwClass, unitClass } from "@game/content/classes"
import { mountOf } from "@shared/character/classes"
import { WEAPON_COLOR, weaponDef } from "@game/content/weapons"
import { BREEDS } from "@game/content/breeds"
import { critterSvg, critterPartSvg, type ArtWeapon, type CritterArt, type CritterPart, type Pose } from "./critter"
import { eyeArt, furArt } from "./palettes"
import { critterLook } from "./look"

export {
  critterSvg,
  critterPartSvg,
  CRITTER_PARTS,
  CRITTER_PART_ANCHORS,
  VIEW,
  VIEW_BOX,
  type ArtWeapon,
  type CritterArt,
  type Pose,
  type CritterPart
} from "./critter"
export { CLASS_OUTFITS, outfitOf, type Outfit } from "./outfits"
export { critterLook, DEFAULT_LOOK, type CritterLook } from "./look"
export { backdropSvg, backdropLayersSvg, BACKDROP, type BackdropLayers } from "./backdrop"
export { tileSvg, TILE_SIZE, TILE_FRAME_COUNT } from "./tile"
export { svgToImage, svgDataUri, clearRasterCache } from "./raster"
export { FUR_ART, EYE_ART, furArt, eyeArt, shade, hex } from "./palettes"
export { heroSvg, heroArtKey, HERO_VIEW, HERO_ANCHOR, HERO_WALK_FRAMES, HERO_IDLE_FRAMES, type HeroArt, type HeroFacing, type HeroPose } from "./hero"

export const WEAPON_HEX: Record<string, string> = {
  red: "#e63946",
  blue: "#3a86ff",
  green: "#2ec4b6",
  colorless: "#adb5bd"
}

/** Оружие в лапах — вид оружия бойца (навык модели); материал и разновидность берутся из оружия в лапах. */
export function artWeapon(skill: WeaponSkill): ArtWeapon {
  return skill
}

export interface UnitArtOptions {
  pose?: Pose
  animated?: boolean
  blinkDelay?: number
  /** Принудительно без хмурых бровей (например, пленник в Приюте). */
  friendly?: boolean
}

const BREED_LOOK = new Map(BREEDS.map(b => [b.id, b.look]))

/** Параметры миниатюры из данных бойца. Детали облика — из породы и seed (сейв не меняется). */
export function unitArt(unit: UnitInstance, opts: UnitArtOptions = {}): CritterArt {
  const cls = unitClass(unit)
  const art: CritterArt = {
    species: unit.species,
    fur: furArt(unit.appearance.furPalette),
    iris: eyeArt(unit.appearance.eyeColor),
    pattern: unit.appearance.pattern,
    eyes: unit.appearance.eyes,
    accessory: unit.appearance.accessory,
    look: critterLook(unit.species, BREED_LOOK.get(unit.breedId), unit.seed),
    moveType: cls.moveType,
    weapon: artWeapon(cls.weaponSkill),
    weaponGrade: weaponDef(unit.skills.weapon).grade,
    weaponVariant: weaponDef(unit.skills.weapon).variant,
    weaponColor: WEAPON_HEX[WEAPON_COLOR[cls.weaponSkill]] ?? "#adb5bd",
    classId: cls.id,
    tier: cls.tier,
    pose: opts.pose ?? "idle",
    animated: opts.animated ?? false
  }
  const mount = mountOf(fwClass(unit.classId))
  if (mount) art.mount = mount
  if (unit.isBoss) art.boss = true
  if (unit.isEnemy && !opts.friendly) art.angry = true
  // Все враги — зомби-версии тех же моделей
  if (unit.isEnemy) art.zombie = true
  if (opts.blinkDelay !== undefined) art.blinkDelay = opts.blinkDelay
  return art
}

export function unitSvg(unit: UnitInstance, opts: UnitArtOptions = {}): string {
  return critterSvg(unitArt(unit, opts))
}

/** Ключ кэша текстуры: всё, что влияет на картинку (класс — наряд и животное, оружие — предмет в лапах). */
export function unitArtKey(unit: UnitInstance, pose: Pose): string {
  const a = unit.appearance
  return `${unit.species}:${unit.breedId}:${unit.seed}:${unit.classId}:${unit.weaponSkill}:${unit.skills.weapon}:${a.furPalette}:${a.pattern}:${a.eyes}:${a.eyeColor}:${a.accessory}:${unit.isBoss ? "b" : ""}${unit.isEnemy ? "e" : ""}:${pose}`
}

export function unitPartSvg(unit: UnitInstance, part: CritterPart): string {
  return critterPartSvg(unitArt(unit, { pose: "dead" }), part)
}

/** Боец сидит верхом (части тела в SVG сдвинуты `RIDER_TRANSFORM`). */
export function unitMounted(unit: UnitInstance): boolean {
  return !!mountOf(fwClass(unit.classId))
}
