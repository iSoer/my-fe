import type { ComponentChildren } from 'preact';
import { back } from '@state/router';
import { haptic } from '@platform/haptics';

export function TopBar({ title, right, onBack }: { title: string; right?: ComponentChildren; onBack?: () => void }) {
  const go = (): void => {
    haptic('select');
    (onBack ?? back)();
  };
  return (
    <div class="topbar">
      <button type="button" class="icon-btn back" aria-label="Назад" onClick={go}>
        ‹
      </button>
      <h2>{title}</h2>
      {right}
    </div>
  );
}
