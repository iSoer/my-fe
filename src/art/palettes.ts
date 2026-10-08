/** Палитры шерсти в формате cat-chase: fur / belly / line / dark + внутреннее ухо. Индексы совпадают с FUR_PALETTES. */

export interface FurArt {
  name: string;
  fur: string;
  belly: string;
  line: string;
  dark: string;
  earInner: string;
  /** Полосы по умолчанию (табби). */
  tabby?: boolean;
}

export const FUR_ART: readonly FurArt[] = [
  { name: 'Рыжий', fur: '#ffbe6f', belly: '#ffeedb', line: '#c7843f', dark: '#e0953f', earInner: '#ffb0bd', tabby: true },
  { name: 'Серый', fur: '#cdd3e6', belly: '#f1f3fb', line: '#8f98b8', dark: '#a7afc9', earInner: '#ffc4d2' },
  { name: 'Белый', fur: '#fbf7f2', belly: '#ffffff', line: '#cbbfb5', dark: '#e6ddd4', earInner: '#ffc2cf' },
  { name: 'Чёрный', fur: '#4a4452', belly: '#8d8597', line: '#241f2a', dark: '#332d3a', earInner: '#c97f92' },
  { name: 'Бежевый', fur: '#e1b382', belly: '#f7e6d0', line: '#a9794c', dark: '#c99a66', earInner: '#ffb7c5' },
  { name: 'Шоколадный', fur: '#8d6248', belly: '#d9bba3', line: '#5a3a2a', dark: '#74503a', earInner: '#e0a0ad' },
  { name: 'Песочный', fur: '#f7d794', belly: '#fff3d6', line: '#c7a85a', dark: '#e2c179', earInner: '#ffb7c5' },
  { name: 'Дымчатый', fur: '#8b93a3', belly: '#c9cfd9', line: '#596273', dark: '#737b8c', earInner: '#d9a2b0' },
  { name: 'Голубой', fur: '#a4b0be', belly: '#e3e8ee', line: '#6e7a8a', dark: '#8894a3', earInner: '#ffc4d2' },
  { name: 'Кремовый', fur: '#fff0d6', belly: '#fffaf1', line: '#cfa784', dark: '#f0d9b4', earInner: '#ffc2cf' },
  { name: 'Табби', fur: '#cc8e35', belly: '#f2dcbb', line: '#8a5a1c', dark: '#a66f27', earInner: '#ffb0bd', tabby: true },
  { name: 'Угольный', fur: '#2f2f36', belly: '#5a5a66', line: '#121216', dark: '#1f1f25', earInner: '#b0788a' },
];

export const EYE_ART: readonly string[] = ['#2ecc71', '#f1c40f', '#3498db', '#8e5a2a', '#e74c3c'];

export const INK = '#2e1f33';
export const BLUSH = '#ff9fb8';
export const NOSE = '#ff8fa8';

export function furArt(index: number): FurArt {
  return FUR_ART[((index % FUR_ART.length) + FUR_ART.length) % FUR_ART.length] as FurArt;
}

export function eyeArt(index: number): string {
  return EYE_ART[((index % EYE_ART.length) + EYE_ART.length) % EYE_ART.length] as string;
}

export function hex(n: number): string {
  return `#${(n >>> 0).toString(16).padStart(6, '0')}`;
}

/** Затемнить/осветлить hex-цвет (k < 0 — темнее, k > 0 — светлее). */
export function shade(color: string, k: number): string {
  const c = color.replace('#', '');
  const num = parseInt(c.length === 3 ? c.split('').map((x) => x + x).join('') : c, 16);
  const ch = (v: number): number => {
    const t = k < 0 ? 0 : 255;
    const p = Math.abs(k);
    return Math.round((t - v) * p + v);
  };
  const r = ch((num >> 16) & 255);
  const g = ch((num >> 8) & 255);
  const b = ch(num & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
