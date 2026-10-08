import type { Color, Difficulty, Gender, MoveType, Species, Stat, Stats } from '@core/types';
import { STATS } from '@core/types';
import { difficultyDef } from '@content/balance';

export const STAT_LABELS: Record<Stat, string> = { hp: 'HP', atk: 'Atk', spd: 'Spd', def: 'Def', res: 'Res' };
export const STAT_FULL: Record<Stat, string> = { hp: 'Здоровье', atk: 'Атака', spd: 'Скорость', def: 'Защита', res: 'Сопротивление' };

export const COLOR_NAMES: Record<Color, string> = { red: 'Красный', blue: 'Синий', green: 'Зелёный', colorless: 'Бесцветный' };
export const COLOR_CSS: Record<Color, string> = {
  red: 'var(--c-red)',
  blue: 'var(--c-blue)',
  green: 'var(--c-green)',
  colorless: 'var(--c-grey)',
};

export const MOVE_EMOJI: Record<MoveType, string> = { infantry: '🐾', armor: '📦', cavalry: '🤖', flier: '🎈' };

/** Название вида с учётом пола: Кот/Кошка, Пёс/Собака, Мышь. */
export function speciesName(unit: { species: Species; gender: Gender }): string {
  switch (unit.species) {
    case 'cat':
      return unit.gender === 'm' ? 'Кот' : 'Кошка';
    case 'dog':
      return unit.gender === 'm' ? 'Пёс' : 'Собака';
    default:
      return 'Мышь';
  }
}

export const SPECIES_LABEL: Record<Species, string> = { cat: 'Коты', dog: 'Псы', mouse: 'Мыши' };
export const SPECIES_ORDER: Record<Species, number> = { cat: 0, dog: 1, mouse: 2 };

export function hex(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

export function difficultyName(d: Difficulty): string {
  return difficultyDef(d).name;
}

export function fmtGains(gains: Partial<Stats>): string {
  const parts: string[] = [];
  for (const s of STATS) {
    const v = gains[s];
    if (v) parts.push(`${STAT_LABELS[s]} ${v > 0 ? '+' : ''}${v}`);
  }
  return parts.length ? parts.join(', ') : 'без изменений';
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

export function g(gender: Gender, m: string, f: string): string {
  return gender === 'm' ? m : f;
}

export function fmtDate(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch {
    return '';
  }
}

export function statTotal(s: Stats): number {
  return s.hp + s.atk + s.spd + s.def + s.res;
}
