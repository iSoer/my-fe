import { atom } from "nanostores"
import type { Pos } from "@game/core/types"

/** Раскладка поля в CSS-пикселях относительно контейнера канваса. Публикует MapScene, читает DOM-HUD. */
export interface BoardLayoutInfo {
  tile: number
  /** Левый верхний угол поля внутри канваса. */
  ox: number
  oy: number
  /** Размер канваса. */
  width: number
  height: number
}

export const $boardLayout = atom<BoardLayoutInfo | null>(null)

export function publishBoardLayout(info: BoardLayoutInfo): void {
  const cur = $boardLayout.get()
  if (
    cur
    && cur.tile === info.tile
    && cur.ox === info.ox
    && cur.oy === info.oy
    && cur.width === info.width
    && cur.height === info.height
  )
    return
  $boardLayout.set(info)
}

/** Центр клетки в координатах канваса. */
export function tileCenterPx(layout: BoardLayoutInfo, pos: Pos): { x: number, y: number } {
  return { x: layout.ox + (pos.x + 0.5) * layout.tile, y: layout.oy + (pos.y + 0.5) * layout.tile }
}

/** Отступы под DOM-накладки: поле вписывается между верхним HUD и нижней карточкой. */
export interface BoardInsets {
  top: number
  bottom: number
}

export const $boardInsets = atom<BoardInsets>({ top: 84, bottom: 150 })

export function setBoardInsets(insets: BoardInsets): void {
  const cur = $boardInsets.get()
  if (cur.top === insets.top && cur.bottom === insets.bottom) return
  $boardInsets.set(insets)
}

/* ---------- Зум большого поля (вылазка в чащу) ---------- */

/** Ступени зума камеры: меньше 1 — видно больше карты, больше 1 — крупнее. */
export const ZOOM_LEVELS = [0.25, 0.35, 0.5, 0.7, 1, 1.25, 1.5] as const

export const $boardZoom = atom<number>(1)

/** Шаг зума кнопками и колесом мыши: `dir` > 0 — крупнее. */
export function zoomBoard(dir: 1 | -1): void {
  const cur = $boardZoom.get()
  const i = ZOOM_LEVELS.findIndex(z => Math.abs(z - cur) < 1e-6)
  const base = ZOOM_LEVELS.indexOf(1)
  const next = ZOOM_LEVELS[Math.max(0, Math.min(ZOOM_LEVELS.length - 1, (i < 0 ? base : i) + dir))] ?? 1
  if (next !== cur) $boardZoom.set(next)
}

export function canZoom(dir: 1 | -1): boolean {
  const cur = $boardZoom.get()
  return dir > 0 ? cur < ZOOM_LEVELS[ZOOM_LEVELS.length - 1]! - 1e-6 : cur > ZOOM_LEVELS[0] + 1e-6
}

export function resetBoardZoom(): void {
  if ($boardZoom.get() !== 1) $boardZoom.set(1)
}
