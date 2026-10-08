import { useStore } from '@nanostores/preact';
import type { Pos } from '@core/types';
import { $boardLayout } from '@state/boardLayout';
import { cancel, chooseAssist, chooseAttack, chooseMove, waitHere, type BattleUiState } from '@state/battleUi';
import { haptic } from '@platform/haptics';

interface MenuItem {
  key: string;
  icon: string;
  label: string;
  primary?: boolean;
  disabled?: boolean;
  caption?: string;
  onClick?: () => void;
}

const BTN = 52;
const GAP = 8;
const PAD = 8;
const MENU_H = 92;

/**
 * Контекстное меню действий на самом поле: круглые кнопки рядом с клеткой бойца.
 * Якорь — movedTo (если боец уже переставлен) или исходная клетка.
 */
export function ContextMenu({ ui, topBand }: { ui: BattleUiState; topBand: number }) {
  const layout = useStore($boardLayout);
  if (!layout) return null;
  if (ui.dragging || ui.pressedId || (ui.mode !== 'unitSelected' && ui.mode !== 'movedPreview')) return null;
  const anchor: Pos | undefined = ui.movedTo ?? ui.origin;
  if (!anchor) return null;
  const atOrigin = ui.mode === 'unitSelected';
  const a = ui.actions;

  const items: MenuItem[] = [];
  if (a.attack) items.push({ key: 'attack', icon: '⚔️', label: 'Атаковать', primary: true, onClick: chooseAttack });
  if (a.assist) items.push({ key: 'assist', icon: '🩹', label: 'Поддержать', onClick: chooseAssist });
  if (a.move) items.push({ key: 'move', icon: '🐾', label: 'Передвинуться', primary: !a.attack && atOrigin, onClick: chooseMove });
  items.push({ key: 'wait', icon: '💤', label: 'Ждать', primary: !a.attack && !atOrigin, onClick: () => void waitHere() });
  if (a.attack) items.push({ key: 'items', icon: '🎒', label: 'Предметы', disabled: true, caption: 'скоро' });
  items.push({ key: 'cancel', icon: '✕', label: 'Отмена', onClick: cancel });

  const n = items.length;
  const w = n * BTN + (n - 1) * GAP + PAD * 2;
  const x = layout.ox + (anchor.x + 0.5) * layout.tile;
  const tileTop = layout.oy + anchor.y * layout.tile;
  const tileBottom = tileTop + layout.tile;
  const above = tileTop - 12 - MENU_H >= topBand;
  const half = w / 2;
  const cx = Math.min(Math.max(x, 8 + half), Math.max(8 + half, layout.width - 8 - half));
  const notchLeft = Math.min(Math.max(x - (cx - half), 18), w - 18);
  const style = above
    ? { left: `${cx}px`, top: `${tileTop - 12}px`, transform: 'translate(-50%, -100%)' }
    : { left: `${cx}px`, top: `${tileBottom + 12}px`, transform: 'translate(-50%, 0)' };

  return (
    <div class={`bf-menu ${above ? 'above' : 'below'}`} style={style} role="group" aria-label="Действия бойца">
      <span class="bf-menu-notch" style={{ left: `${notchLeft}px` }} />
      {items.map((it, i) => (
        <button
          key={it.key}
          type="button"
          aria-label={it.label}
          title={it.caption ? `${it.label} — ${it.caption}` : it.label}
          class={`bf-menu-btn ${it.primary ? 'primary' : ''} ${it.disabled ? 'disabled' : ''}`}
          style={{ animationDelay: `${i * 35}ms` }}
          disabled={it.disabled}
          onClick={() => {
            if (it.disabled || !it.onClick) return;
            haptic('light');
            it.onClick();
          }}
        >
          <span class="bf-menu-ico" aria-hidden="true">
            {it.icon}
          </span>
          <span class="bf-menu-label" aria-hidden="true">
            {it.label}
            {it.caption && <small>{it.caption}</small>}
          </span>
        </button>
      ))}
    </div>
  );
}
