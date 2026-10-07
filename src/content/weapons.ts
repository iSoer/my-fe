import type { WeaponDef, WeaponVariant } from '@core/skills/types';
import type { Color, WeaponKind } from '@core/types';

export const KIND_COLOR: Record<WeaponKind, Color> = {
  claw: 'red',
  fang: 'blue',
  stick: 'green',
  hiss: 'red',
  howl: 'blue',
  growl: 'green',
  slingshot: 'colorless',
  burr: 'colorless',
  bandage: 'colorless',
  purr: 'colorless',
};

interface KindSpec {
  range: 1 | 2;
  mt: number;
  magical: boolean;
  isStaff: boolean;
  variants: Partial<Record<WeaponVariant, string>>;
  effectiveAgainst?: WeaponDef['effectiveAgainst'];
  debuffAfterCombat?: WeaponDef['debuffAfterCombat'];
  desc: string;
}

const KIND_SPECS: Record<WeaponKind, KindSpec> = {
  claw: {
    range: 1, mt: 6, magical: false, isStaff: false,
    variants: { basic: 'Коготь', brave: 'Двойной коготь', killer: 'Хищный коготь', armorslayer: 'Коготь-коробкорез', cavslayer: 'Коготь-антипылесос' },
    desc: 'Ближний бой, красный.',
  },
  fang: {
    range: 1, mt: 6, magical: false, isStaff: false,
    variants: { basic: 'Клык', brave: 'Двойной клык', killer: 'Хищный клык', armorslayer: 'Клык-коробкорез', cavslayer: 'Клык-антипылесос' },
    desc: 'Ближний бой, синий.',
  },
  stick: {
    range: 1, mt: 6, magical: false, isStaff: false,
    variants: { basic: 'Палка', brave: 'Двойная палка', killer: 'Хищная палка', armorslayer: 'Палка-коробкорез', cavslayer: 'Палка-антипылесос' },
    desc: 'Ближний бой, зелёный. Собачья классика.',
  },
  hiss: { range: 2, mt: 5, magical: true, isStaff: false, variants: { basic: 'Шипение', killer: 'Злое шипение' }, desc: 'Красная «магия», бьёт по Res с 2 клеток.' },
  howl: { range: 2, mt: 5, magical: true, isStaff: false, variants: { basic: 'Вой', killer: 'Тоскливый вой' }, desc: 'Синяя «магия», бьёт по Res с 2 клеток.' },
  growl: { range: 2, mt: 5, magical: true, isStaff: false, variants: { basic: 'Рык', killer: 'Утробный рык' }, desc: 'Зелёная «магия», бьёт по Res с 2 клеток.' },
  slingshot: {
    range: 2, mt: 5, magical: false, isStaff: false,
    variants: { basic: 'Рогатка', brave: 'Двойная рогатка', killer: 'Снайперская рогатка' },
    effectiveAgainst: ['flier'],
    desc: 'Дальний бой. Эффективна против летунов — лопает шарики.',
  },
  burr: {
    range: 2, mt: 4, magical: false, isStaff: false,
    variants: { basic: 'Репейник', killer: 'Колючий репейник' },
    debuffAfterCombat: { def: -5, res: -5 },
    desc: 'Дальний бой. После боя цель и враги рядом с ней получают −5 Def/Res.',
  },
  bandage: { range: 2, mt: 4, magical: true, isStaff: false, variants: { basic: 'Бинт', killer: 'Жгут' }, desc: 'Лекарское. Урон ×0.5, лечит через Поддержку.' },
  purr: { range: 1, mt: 4, magical: false, isStaff: false, variants: { basic: 'Коготок' }, desc: 'Коготок Мурлыки. Слабый, но свой.' },
};
KIND_SPECS.bandage.isStaff = true;

function build(): WeaponDef[] {
  const out: WeaponDef[] = [];
  for (const [kind, spec] of Object.entries(KIND_SPECS) as [WeaponKind, KindSpec][]) {
    for (const [variant, name] of Object.entries(spec.variants) as [WeaponVariant, string][]) {
      const w: WeaponDef = {
        id: `${kind}_${variant}`,
        name,
        kind,
        color: KIND_COLOR[kind],
        range: spec.range,
        mt: spec.mt,
        variant,
        magical: spec.magical,
        isStaff: spec.isStaff,
        spCost: variant === 'basic' ? 0 : 300,
        desc: spec.desc,
      };
      if (spec.effectiveAgainst) w.effectiveAgainst = spec.effectiveAgainst;
      if (spec.debuffAfterCombat) w.debuffAfterCombat = spec.debuffAfterCombat;
      switch (variant) {
        case 'brave':
          w.mt -= 2;
          w.spdMod = -5;
          w.desc += ' Две атаки подряд при инициативе, −5 Spd.';
          break;
        case 'killer':
          w.mt -= 1;
          w.cdMod = -1;
          w.desc += ' Кулдаун спецприёма −1.';
          if (kind === 'burr') w.debuffAfterCombat = { def: -7, res: -7 };
          break;
        case 'armorslayer':
          w.effectiveAgainst = ['armor'];
          w.desc += ' Эффективно против брони.';
          break;
        case 'cavslayer':
          w.effectiveAgainst = ['cavalry'];
          w.desc += ' Эффективно против кавалерии.';
          break;
        default:
          break;
      }
      out.push(w);
    }
  }
  return out;
}

export const WEAPONS: readonly WeaponDef[] = build();
const WEAPON_MAP = new Map(WEAPONS.map((w) => [w.id, w]));

export function weaponDef(id: string): WeaponDef {
  const w = WEAPON_MAP.get(id);
  if (!w) throw new Error(`unknown weapon ${id}`);
  return w;
}

export function basicWeaponId(kind: WeaponKind): string {
  return `${kind}_basic`;
}

export function weaponsForKind(kind: WeaponKind): WeaponDef[] {
  return WEAPONS.filter((w) => w.kind === kind);
}
