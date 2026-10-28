import type { BoardSize, Pos } from "@game/core/types"
import { MAP_H, MAP_W, inMap } from "@game/core/types"

export interface BoardLayout {
  tile: number
  ox: number
  oy: number
  width: number
  height: number
  /** Размер поля в клетках (обычный бой — 6×8, вылазка в чащу — больше). */
  cols: number
  rows: number
}

/**
 * Поле вписывается между верхними накладками (insets.top: шапка и панель сведений) и панелью кнопок (insets.bottom),
 * чтобы накладки не закрывали клетки. Внутри доступной области доска прижата к панели кнопок (ratio = 1):
 * лишняя высота уходит панели сведений над полем.
 * Если область слишком мала, отступы пропорционально ужимаются, но доска никогда не выходит за канвас.
 */
export const LAYOUT_BIAS = { ratio: 1, minTile: 36 } as const

export interface LayoutInsets {
  top: number
  bottom: number
}

export function computeLayout(
  width: number,
  height: number,
  insets: LayoutInsets = { top: 84, bottom: 150 }
): BoardLayout {
  let top = Math.max(0, insets.top)
  let bottom = Math.max(0, insets.bottom)
  let avail = height - top - bottom
  // На очень низких экранах отступы ужимаем, чтобы клетка не стала микроскопической.
  if (avail / MAP_H < LAYOUT_BIAS.minTile) {
    const need = LAYOUT_BIAS.minTile * MAP_H
    const scale = Math.max(0, (height - need) / Math.max(1, top + bottom))
    top = Math.floor(top * Math.min(1, scale))
    bottom = Math.floor(bottom * Math.min(1, scale))
    avail = height - top - bottom
  }
  const tile = Math.max(12, Math.floor(Math.min(width / MAP_W, avail / MAP_H)))
  const boardH = tile * MAP_H
  const slack = Math.max(0, avail - boardH)
  const oy = top + Math.round(slack * LAYOUT_BIAS.ratio)
  return {
    tile,
    ox: Math.floor((width - tile * MAP_W) / 2),
    oy,
    width,
    height,
    cols: MAP_W,
    rows: MAP_H
  }
}

/**
 * Большое поле (вылазка в чащу): клетка того же размера, что в обычном бою (6 колонок на экран), поле — в мировых
 * координатах от (0, 0), а камера сцены двигается и масштабируется по нему. `screen` — раскладка обычного поля
 * для DOM-накладок (высота панели сведений не меняется).
 */
export function computeWorldLayout(
  width: number,
  height: number,
  insets: LayoutInsets,
  board: BoardSize
): { world: BoardLayout, screen: BoardLayout } {
  const screen = computeLayout(width, height, insets)
  return { world: { ...screen, ox: 0, oy: 0, cols: board.w, rows: board.h }, screen }
}

export function tileCenter(l: BoardLayout, pos: Pos): { x: number, y: number } {
  return { x: l.ox + pos.x * l.tile + l.tile / 2, y: l.oy + pos.y * l.tile + l.tile / 2 }
}

export function tileOrigin(l: BoardLayout, pos: Pos): { x: number, y: number } {
  return { x: l.ox + pos.x * l.tile, y: l.oy + pos.y * l.tile }
}

export function pixelToGrid(l: BoardLayout, x: number, y: number): Pos | null {
  const gx = Math.floor((x - l.ox) / l.tile)
  const gy = Math.floor((y - l.oy) / l.tile)
  const p = { x: gx, y: gy }
  return inMap({ w: l.cols, h: l.rows }, p) ? p : null
}
