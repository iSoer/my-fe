import type { ReactNode } from "react"
import { back } from "@game/state/router"
import { haptic } from "@game/platform/haptics"
import { tr } from "@game/i18n"

export function TopBar({ title, right, onBack }: { title: string, right?: ReactNode, onBack?: () => void }) {
  const go = (): void => {
    haptic("select")
    ;(onBack ?? back)()
  }
  return (
    <div className="topbar">
      <button type="button" className="icon-btn back" aria-label={tr("Back", "Назад")} onClick={go}>
        ‹
      </button>
      <h2>{title}</h2>
      {right}
    </div>
  )
}
