import type { ComponentChildren } from 'preact';
import { haptic } from '@platform/haptics';

export interface ButtonProps {
  children: ComponentChildren;
  onClick?: () => void;
  primary?: boolean;
  danger?: boolean;
  ghost?: boolean;
  big?: boolean;
  block?: boolean;
  sm?: boolean;
  disabled?: boolean;
  class?: string;
  title?: string;
  /** Иконка слева (эмодзи или элемент). */
  icon?: ComponentChildren;
  /** Мягкое свечение (главное действие момента). */
  glow?: boolean;
  /** Лёгкая пульсация. */
  pulse?: boolean;
  style?: Record<string, string | number>;
}

export function Button(p: ButtonProps) {
  const cls = [
    'btn',
    p.primary && 'btn-primary',
    p.danger && 'btn-danger',
    p.ghost && 'btn-ghost',
    p.big && 'btn-big',
    p.block && 'btn-block',
    p.sm && 'btn-sm',
    p.glow && 'btn-glow',
    p.pulse && 'btn-pulse',
    p.class,
  ]
    .filter(Boolean)
    .join(' ');
  const onClick = (): void => {
    if (p.disabled) return;
    if (p.primary || p.big) haptic('light');
    p.onClick?.();
  };
  return (
    <button type="button" class={cls} onClick={onClick} disabled={p.disabled} title={p.title} style={p.style}>
      <span class="btn-inner">
        {p.icon !== undefined && (
          <span class="ico" aria-hidden="true">
            {p.icon}
          </span>
        )}
        {p.children}
      </span>
    </button>
  );
}
