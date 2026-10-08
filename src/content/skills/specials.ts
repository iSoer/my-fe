import type { SpecialDef } from '@core/skills/types';

export const SPECIALS: readonly SpecialDef[] = [
  { id: 'sp_glimmer', name: 'Кровавый блеск', desc: 'Урон +50 %.', cd: 2, kind: 'offense', spCost: 200, stage: 'mvp', offense: { damageBonusPct: 50 } },
  { id: 'sp_moonbow', name: 'Лунный серп', desc: 'Игнорирует 30 % Def/Res цели.', cd: 2, kind: 'offense', spCost: 200, stage: 'mvp', offense: { ignoreDefPct: 30 } },
  { id: 'sp_luna', name: 'Клыкастая луна', desc: 'Игнорирует 50 % Def/Res цели.', cd: 3, kind: 'offense', spCost: 200, stage: 'v1', offense: { ignoreDefPct: 50 } },
  { id: 'sp_bonfire', name: 'Пламя шерсти', desc: 'Урон +50 % своего Def.', cd: 3, kind: 'offense', spCost: 200, stage: 'mvp', offense: { damagePctOfStat: { stat: 'def', pct: 50, of: 'self' } } },
  { id: 'sp_iceberg', name: 'Ледяная шерсть', desc: 'Урон +50 % своего Res.', cd: 3, kind: 'offense', spCost: 200, stage: 'v1', offense: { damagePctOfStat: { stat: 'res', pct: 50, of: 'self' } } },
  { id: 'sp_draconic', name: 'Шквал когтей', desc: 'Урон +30 % своего Atk.', cd: 3, kind: 'offense', spCost: 200, stage: 'v1', offense: { damagePctOfStat: { stat: 'atk', pct: 30, of: 'self' } } },
  { id: 'sp_sol', name: 'Чистая рана', desc: 'Лечит 50 % нанесённого урона.', cd: 3, kind: 'offense', spCost: 200, stage: 'v1', offense: { healPctOfDamage: 50 } },
  { id: 'sp_escutcheon', name: 'Пушистая стена', desc: '−30 % урона от ближней атаки.', cd: 3, kind: 'defense', spCost: 200, stage: 'mvp', defense: { reduction: 0.3, vsRange: 'melee' } },
  { id: 'sp_cowl', name: 'Хвост-щит', desc: '−30 % урона от дальней атаки.', cd: 3, kind: 'defense', spCost: 200, stage: 'v1', defense: { reduction: 0.3, vsRange: 'ranged' } },
  { id: 'sp_miracle', name: 'Девять жизней', desc: 'Пережить смертельный удар с 1 HP (если HP > 1). Только коты.', cd: 5, kind: 'defense', spCost: 200, stage: 'v1', onlySpecies: 'cat', miracle: true },
  { id: 'sp_loyalty', name: 'Верность', desc: '−30 % урона от любой атаки и лечение на 30 % этого урона. Только псы.', cd: 4, kind: 'defense', spCost: 200, stage: 'v1', onlySpecies: 'dog', defense: { reduction: 0.3, vsRange: 'any', healPctOfDamage: 30 } },
  { id: 'sp_squeak', name: 'Шмыг', desc: '−40 % урона от любой атаки. Только мыши.', cd: 3, kind: 'defense', spCost: 200, stage: 'v1', onlySpecies: 'mouse', defense: { reduction: 0.4, vsRange: 'any' } },
  { id: 'sp_imbue', name: 'Мурчание исцеления', desc: '+10 к лечению.', cd: 1, kind: 'heal', spCost: 200, stage: 'mvp', staffOnly: true, heal: { bonusHeal: 10 } },
  { id: 'sp_heavenly', name: 'Общий лай', desc: 'При лечении +10 HP всем союзникам.', cd: 2, kind: 'heal', spCost: 200, stage: 'v1', staffOnly: true, heal: { allAlliesHeal: 10 } },
];

const MAP = new Map(SPECIALS.map((s) => [s.id, s]));
export function specialDef(id: string): SpecialDef {
  const s = MAP.get(id);
  if (!s) throw new Error(`unknown special ${id}`);
  return s;
}
