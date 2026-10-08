import type { ClassDef } from '@core/skills/types';
import type { Gender, MoveType, Species, WeaponKind } from '@core/types';

export const MOVE_NAMES: Record<MoveType, string> = {
  infantry: 'Пехота',
  armor: 'Броня',
  cavalry: 'Кавалерия',
  flier: 'Летун',
};

export const MOVE_RANGE: Record<MoveType, number> = { infantry: 2, armor: 1, cavalry: 3, flier: 2 };

export const WEAPON_KIND_NAMES: Record<WeaponKind, string> = {
  claw: 'Коготь',
  fang: 'Клык',
  stick: 'Палка',
  hiss: 'Шипение',
  howl: 'Вой',
  growl: 'Рык',
  slingshot: 'Рогатка',
  burr: 'Репейник',
  bandage: 'Бинт',
  purr: 'Мурчание',
};

const n = (m: string, f: string): Record<Gender, string> => ({ m, f });

export const CLASSES: readonly ClassDef[] = [
  { id: 'infantry_claw', moveType: 'infantry', weaponKind: 'claw', name: n('Уличный драчун', 'Уличная драчунья'), template: 'inf_melee', weight: 10 },
  { id: 'infantry_fang', moveType: 'infantry', weaponKind: 'fang', name: n('Кусака', 'Кусака'), template: 'inf_melee', weight: 10 },
  { id: 'infantry_stick', moveType: 'infantry', weaponKind: 'stick', name: n('Палочник', 'Палочница'), template: 'inf_melee', weight: 10 },
  { id: 'infantry_hiss', moveType: 'infantry', weaponKind: 'hiss', name: n('Шипун', 'Шипунья'), template: 'inf_magic', weight: 5 },
  { id: 'infantry_howl', moveType: 'infantry', weaponKind: 'howl', name: n('Завывала', 'Завывала'), template: 'inf_magic', weight: 5 },
  { id: 'infantry_growl', moveType: 'infantry', weaponKind: 'growl', name: n('Рыкун', 'Рыкунья'), template: 'inf_magic', weight: 5 },
  { id: 'infantry_slingshot', moveType: 'infantry', weaponKind: 'slingshot', name: n('Рогаточник', 'Рогаточница'), template: 'inf_ranged', weight: 6 },
  { id: 'infantry_burr', moveType: 'infantry', weaponKind: 'burr', name: n('Колючка', 'Колючка'), template: 'inf_ranged', weight: 4 },
  { id: 'infantry_bandage', moveType: 'infantry', weaponKind: 'bandage', name: n('Санитар', 'Санитарка'), template: 'inf_staff', weight: 5 },
  { id: 'infantry_purr', moveType: 'infantry', weaponKind: 'purr', name: n('Мурлыка', 'Мурлыка'), template: 'inf_purr', weight: 1, maxPerGroup: 1 },
  { id: 'armor_claw', moveType: 'armor', weaponKind: 'claw', name: n('Коробочный рыцарь', 'Коробочная рыцарша'), template: 'armor_melee', weight: 3 },
  { id: 'armor_fang', moveType: 'armor', weaponKind: 'fang', name: n('Коробочный рыцарь', 'Коробочная рыцарша'), template: 'armor_melee', weight: 3 },
  { id: 'armor_stick', moveType: 'armor', weaponKind: 'stick', name: n('Коробочный рыцарь', 'Коробочная рыцарша'), template: 'armor_melee', weight: 3 },
  { id: 'cavalry_claw', moveType: 'cavalry', weaponKind: 'claw', name: n('Пылесосный всадник', 'Пылесосная всадница'), template: 'cav_melee', weight: 3 },
  { id: 'cavalry_fang', moveType: 'cavalry', weaponKind: 'fang', name: n('Пылесосный всадник', 'Пылесосная всадница'), template: 'cav_melee', weight: 3 },
  { id: 'cavalry_stick', moveType: 'cavalry', weaponKind: 'stick', name: n('Пылесосный всадник', 'Пылесосная всадница'), template: 'cav_melee', weight: 3 },
  { id: 'cavalry_hiss', moveType: 'cavalry', weaponKind: 'hiss', name: n('Пылесосный шаман', 'Пылесосная шаманка'), template: 'cav_magic', weight: 2 },
  { id: 'cavalry_howl', moveType: 'cavalry', weaponKind: 'howl', name: n('Пылесосный шаман', 'Пылесосная шаманка'), template: 'cav_magic', weight: 2 },
  { id: 'cavalry_growl', moveType: 'cavalry', weaponKind: 'growl', name: n('Пылесосный шаман', 'Пылесосная шаманка'), template: 'cav_magic', weight: 2 },
  { id: 'cavalry_bandage', moveType: 'cavalry', weaponKind: 'bandage', name: n('Пылесосный санитар', 'Пылесосная санитарка'), template: 'cav_staff', weight: 2 },
  { id: 'flier_claw', moveType: 'flier', weaponKind: 'claw', name: n('Шаровой налётчик', 'Шаровая налётчица'), template: 'flier_melee', weight: 3 },
  { id: 'flier_fang', moveType: 'flier', weaponKind: 'fang', name: n('Шаровой налётчик', 'Шаровая налётчица'), template: 'flier_melee', weight: 3 },
  { id: 'flier_stick', moveType: 'flier', weaponKind: 'stick', name: n('Шаровой налётчик', 'Шаровая налётчица'), template: 'flier_melee', weight: 3 },
  { id: 'flier_burr', moveType: 'flier', weaponKind: 'burr', name: n('Голубиный диверсант', 'Голубиная диверсантка'), template: 'flier_ranged', weight: 2 },
];

const CLASS_MAP = new Map(CLASSES.map((c) => [c.id, c]));

export function classDef(id: string): ClassDef {
  const c = CLASS_MAP.get(id);
  if (!c) throw new Error(`unknown class ${id}`);
  return c;
}

/** Броня у котов — коробка, у псов — кастрюля, у мышей — напёрсток. */
export function className(cls: ClassDef, species: Species, gender: Gender): string {
  if (cls.moveType === 'armor' && species === 'dog') return gender === 'm' ? 'Кастрюльный страж' : 'Кастрюльная стражница';
  if (cls.moveType === 'armor' && species === 'mouse') return gender === 'm' ? 'Напёрсточный рыцарь' : 'Напёрсточная рыцарша';
  return cls.name[gender];
}

export const MELEE_KINDS: readonly WeaponKind[] = ['claw', 'fang', 'stick', 'purr'];
export const MAGIC_KINDS: readonly WeaponKind[] = ['hiss', 'howl', 'growl'];
export const RANGED_KINDS: readonly WeaponKind[] = ['hiss', 'howl', 'growl', 'slingshot', 'burr', 'bandage'];

export function isRangedKind(k: WeaponKind): boolean {
  return RANGED_KINDS.includes(k);
}
