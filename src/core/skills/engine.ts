import type { AssistDef, ClassDef, PassiveDef, SkillHooks, SpecialDef, TraitDef, WeaponDef } from './types';
import type { Stats, UnitInstance } from '../types';
import { addStats, emptyStats } from '../types';
import { classDef } from '@content/classes';
import { weaponDef } from '@content/weapons';
import { passiveDef } from '@content/skills/passives';
import { specialDef } from '@content/skills/specials';
import { assistDef } from '@content/skills/assists';
import { traitDef } from '@content/traits';
import { MOVE_RANGE } from '@content/classes';

export interface UnitKit {
  cls: ClassDef;
  weapon: WeaponDef;
  passives: PassiveDef[];
  trait?: TraitDef;
  special?: SpecialDef;
  assist?: AssistDef;
  hooks: SkillHooks[];
}

const kitCache = new WeakMap<UnitInstance, UnitKit>();

/** Собирает все источники хуков юнита. Кэшируется по ссылке на объект. */
export function unitKit(unit: UnitInstance): UnitKit {
  const cached = kitCache.get(unit);
  if (cached) return cached;
  const cls = classDef(unit.classId);
  const weapon = weaponDef(unit.skills.weapon);
  const passives: PassiveDef[] = [];
  for (const slot of ['a', 'b', 'c'] as const) {
    const id = unit.skills[slot];
    if (id) passives.push(passiveDef(id));
  }
  const trait = unit.traitId ? traitDef(unit.traitId) : undefined;
  const special = unit.skills.special ? specialDef(unit.skills.special) : undefined;
  const assist = unit.skills.assist ? assistDef(unit.skills.assist) : undefined;
  const hooks: SkillHooks[] = passives.map((p) => p.hooks);
  if (trait) hooks.push(trait.hooks);
  const kit: UnitKit = { cls, weapon, passives, trait, special, assist, hooks };
  kitCache.set(unit, kit);
  return kit;
}

/** Постоянные бонусы к статам от навыков, черты и оружия (без Mt). */
export function permanentBonus(unit: UnitInstance): Stats {
  const kit = unitKit(unit);
  let s = emptyStats();
  for (const h of kit.hooks) if (h.statBonus) s = addStats(s, h.statBonus);
  if (kit.weapon.spdMod) s = addStats(s, { spd: kit.weapon.spdMod });
  return s;
}

export function moveRange(unit: UnitInstance): number {
  const kit = unitKit(unit);
  let r = MOVE_RANGE[kit.cls.moveType];
  for (const h of kit.hooks) if (h.moveBonus) r += h.moveBonus;
  return Math.max(1, r);
}

export function hasPassThrough(unit: UnitInstance): boolean {
  return unitKit(unit).hooks.some((h) => h.passThrough);
}

export function ignoresForest(unit: UnitInstance): boolean {
  return unitKit(unit).hooks.some((h) => h.ignoreForestSlow);
}

export function counterAnyRange(unit: UnitInstance): boolean {
  return unitKit(unit).hooks.some((h) => h.counterAnyRange);
}

export function wrathfulStaff(unit: UnitInstance): boolean {
  return unitKit(unit).hooks.some((h) => h.wrathfulStaff);
}

/** Максимальный кулдаун спецприёма с учётом оружия и навыков; null — спецприёма нет. */
export function specialMaxCd(unit: UnitInstance): number | null {
  const kit = unitKit(unit);
  if (!kit.special) return null;
  let cd = kit.special.cd + (kit.weapon.cdMod ?? 0);
  for (const h of kit.hooks) if (h.cdMod) cd += h.cdMod;
  return Math.max(1, cd);
}

export function xpMultiplier(unit: UnitInstance): number {
  let m = 1;
  for (const h of unitKit(unit).hooks) if (h.xpMultiplier) m *= h.xpMultiplier;
  return m;
}

export function treatsMultiplier(unit: UnitInstance): number {
  let m = 1;
  for (const h of unitKit(unit).hooks) if (h.treatsMultiplier) m *= h.treatsMultiplier;
  return m;
}

/** Сбросить кэш (после изменения навыков юнита объект обычно пересоздаётся, но на всякий случай). */
export function invalidateKit(unit: UnitInstance): void {
  kitCache.delete(unit);
}
