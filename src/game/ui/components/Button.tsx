import type { ReactNode } from "react"
import { haptic } from "@game/platform/haptics"

export interface ButtonProps {
  children: ReactNode
  onClick?: () => void
  primary?: boolean
  danger?: boolean
  ghost?: boolean
  big?: boolean
  block?: boolean
  sm?: boolean
  disabled?: boolean
  className?: string
  title?: string
  /** Иконка слева (эмодзи или элемент). */
  icon?: ReactNode
  /** Мягкое свечение (главное действие момента). */
  glow?: boolean
  /** Лёгкая пульсация. */
  pulse?: boolean
  style?: React.CSSProperties
}

export function Button(p: ButtonProps) {
  const cls = [
    "btn",
    p.primary && "btn-primary",
    p.danger && "btn-danger",
    p.ghost && "btn-ghost",
    p.big && "btn-big",
    p.block && "btn-block",
    p.sm && "btn-sm",
    p.glow && "btn-glow",
    p.pulse && "btn-pulse",
    p.className
  ]
    .filter(Boolean)
    .join(" ")
  const onClick = (): void => {
    if (p.disabled) return
    if (p.primary || p.big) haptic("light")
    p.onClick?.()
  }
  return (
    <button type="button" className={cls} onClick={onClick} disabled={p.disabled} title={p.title} style={p.style}>
      <span className="btn-inner">
        {p.icon !== undefined && (
          <span className="ico" aria-hidden="true">
            {p.icon}
          </span>
        )}
        {p.children}
      </span>
    </button>
  )
}
