import { useEffect, useState } from "react"
import { useStore } from "@nanostores/react"
import type { BattleState } from "@game/core/types"
import { allPlayerUnitsActed } from "@game/core/battle/reducer"
import { endTurn, type BattleUiState } from "@game/state/battleUi"
import { $settings } from "@game/state/save"
import { haptic } from "@game/platform/haptics"
import { $endPromptDismissed, endPromptKey } from "./endPrompt"

/** Нужно ли предлагать завершить ход: все походили, фаза игрока, ничего не выбрано, автозавершение выключено. */
export function shouldOfferEndTurn(
  battle: BattleState,
  ui: BattleUiState,
  autoEndTurn: boolean,
  dismissed: string
): boolean {
  if (autoEndTurn) return false
  if (battle.phase !== "player" || battle.result || ui.busy || ui.mode !== "idle") return false
  if (!allPlayerUnitsActed(battle)) return false
  return dismissed !== endPromptKey(battle.id, battle.turn)
}

/**
 * Автоматическое предложение завершить ход: всплывает над нижней полосой,
 * когда у всех бойцов закончились действия. Один раз за ход.
 */
export function EndTurnPrompt({ battle, ui }: { battle: BattleState, ui: BattleUiState }) {
  const settings = useStore($settings)
  const dismissed = useStore($endPromptDismissed)
  const offer = shouldOfferEndTurn(battle, ui, settings.autoEndTurn, dismissed)
  const turnKey = endPromptKey(battle.id, battle.turn)
  // Ход, для которого пауза уже прошла: предложение видно, только пока оно актуально для этого хода
  const [shownFor, setShownFor] = useState<string | null>(null)

  // Небольшая пауза, чтобы отыграли анимации последнего действия.
  useEffect(() => {
    if (!offer) return
    const t = window.setTimeout(() => {
      setShownFor(turnKey)
      haptic("light")
    }, 450)
    return () => window.clearTimeout(t)
  }, [offer, turnKey])

  if (!offer || shownFor !== turnKey) return null
  const go = () => {
    haptic("medium")
    void endTurn()
  }
  const later = () => {
    haptic("light")
    $endPromptDismissed.set(endPromptKey(battle.id, battle.turn))
  }
  return (
    <div className="bf-endprompt bf-card" role="dialog" aria-label="Все бойцы походили">
      <div className="bf-endprompt-head">
        <span className="bf-endprompt-ico" aria-hidden="true">
          ✅
        </span>
        <div>
          <div className="bf-endprompt-title">Все бойцы походили</div>
          <div className="bf-endprompt-sub">Передать ход противнику?</div>
        </div>
      </div>
      <div className="bf-endprompt-actions">
        <button type="button" className="bf-pill-btn" onClick={later}>
          Ещё осмотреться
        </button>
        <button type="button" className="bf-pill-btn primary" aria-label="Завершить ход" onClick={go}>
          ⏭ Завершить ход
        </button>
      </div>
    </div>
  )
}
