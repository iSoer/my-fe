import { atom } from 'nanostores';
import type { Pos } from '@core/types';

/** Раскладка поля в CSS-пикселях относительно контейнера канваса. Публикует MapScene, читает DOM-HUD. */
export interface BoardLayoutInfo {
  tile: number;
  /** Левый верхний угол поля внутри канваса. */
  ox: number;
  oy: number;
  /** Размер канваса. */
  width: number;
  height: number;
}

export const $boardLayout = atom<BoardLayoutInfo | null>(null);

export function publishBoardLayout(info: BoardLayoutInfo): void {
  const cur = $boardLayout.get();
  if (cur && cur.tile === info.tile && cur.ox === info.ox && cur.oy === info.oy && cur.width === info.width && cur.height === info.height) return;
  $boardLayout.set(info);
}

/** Центр клетки в координатах канваса. */
export function tileCenterPx(layout: BoardLayoutInfo, pos: Pos): { x: number; y: number } {
  return { x: layout.ox + (pos.x + 0.5) * layout.tile, y: layout.oy + (pos.y + 0.5) * layout.tile };
}

/** Отступы под DOM-накладки: поле вписывается между верхним HUD и нижней карточкой. */
export interface BoardInsets {
  top: number;
  bottom: number;
}

export const $boardInsets = atom<BoardInsets>({ top: 84, bottom: 150 });

export function setBoardInsets(insets: BoardInsets): void {
  const cur = $boardInsets.get();
  if (cur.top === insets.top && cur.bottom === insets.bottom) return;
  $boardInsets.set(insets);
}
