import type { Pos } from '@core/types';
import { MAP_H, MAP_W, inBounds } from '@core/types';

export interface BoardLayout {
  tile: number;
  ox: number;
  oy: number;
  width: number;
  height: number;
}

/** Размер клетки = floor(min(w/6, h/8)); доска центрируется. */
export function computeLayout(width: number, height: number): BoardLayout {
  const tile = Math.max(12, Math.floor(Math.min(width / MAP_W, height / MAP_H)));
  return {
    tile,
    ox: Math.floor((width - tile * MAP_W) / 2),
    oy: Math.floor((height - tile * MAP_H) / 2),
    width,
    height,
  };
}

export function tileCenter(l: BoardLayout, pos: Pos): { x: number; y: number } {
  return { x: l.ox + pos.x * l.tile + l.tile / 2, y: l.oy + pos.y * l.tile + l.tile / 2 };
}

export function tileOrigin(l: BoardLayout, pos: Pos): { x: number; y: number } {
  return { x: l.ox + pos.x * l.tile, y: l.oy + pos.y * l.tile };
}

export function pixelToGrid(l: BoardLayout, x: number, y: number): Pos | null {
  const gx = Math.floor((x - l.ox) / l.tile);
  const gy = Math.floor((y - l.oy) / l.tile);
  const p = { x: gx, y: gy };
  return inBounds(p) ? p : null;
}
