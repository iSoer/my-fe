import type { ComponentChildren } from 'preact';
import { back } from '@state/router';

export function TopBar({ title, right, onBack }: { title: string; right?: ComponentChildren; onBack?: () => void }) {
  return (
    <div class="topbar">
      <button type="button" class="icon-btn" aria-label="Назад" onClick={onBack ?? back}>
        ‹
      </button>
      <h2>{title}</h2>
      {right}
    </div>
  );
}
