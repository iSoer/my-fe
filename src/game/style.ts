import type { Color, MoveType, TerrainId } from '@core/types';

export const WEAPON_COLOR_HEX: Record<Color, number> = {
  red: 0xe63946,
  blue: 0x3a86ff,
  green: 0x2ec4b6,
  colorless: 0xadb5bd,
};

export const BLOOD_COLORS = [0xd9122b, 0x9b0f20, 0xff2e4a, 0xb3001b];

export const HL = {
  reach: 0x3a86ff,
  attack: 0xe63946,
  assist: 0x2ec4b6,
  danger: 0xff9f1c,
  threat: 0x9b5de5,
  path: 0xe8f1ff,
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const MOVE_GLYPH: Record<MoveType, string> = {
  infantry: '●',
  armor: '■',
  cavalry: '◆',
  flier: '▲',
};

export const TERRAIN_GLYPH: Partial<Record<TerrainId, string>> = {
  forest: '♣',
  mountain: '▲',
  water: '≈',
  wall: '▦',
  wall_breakable: '▧',
  cover: '⌂',
};

export function hexCss(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

export function textStyle(size: number, color = '#ffffff', bold = true, stroke = 3): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT,
    fontSize: `${Math.max(8, Math.round(size))}px`,
    color,
    fontStyle: bold ? 'bold' : 'normal',
    stroke: '#000000',
    strokeThickness: stroke,
    align: 'center',
  };
}

/** Цвет HP-полоски: зелёный → жёлтый → красный. */
export function hpColor(pct: number): number {
  if (pct > 0.5) return 0x4caf50;
  if (pct > 0.25) return 0xffc107;
  return 0xe63946;
}
