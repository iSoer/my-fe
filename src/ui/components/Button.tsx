import type { ComponentChildren } from 'preact';

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
    p.class,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" class={cls} onClick={p.onClick} disabled={p.disabled} title={p.title}>
      {p.children}
    </button>
  );
}
