import { useState } from "react"
import type { BattleState } from "@game/core/types"
import { livingUnits } from "@game/core/battle/query"
import { endTurn, toggleDanger, type BattleUiState } from "@game/state/battleUi"
import { haptic } from "@game/platform/haptics"
import { plural, tr } from "@game/i18n"
import { ConfirmModal } from "../components/Sheet"
import { $pauseOpen } from "../lib/pause"

/**
 * Панель кнопок под полем, как в Fire Emblem Heroes: меню слева, зона опасности врагов и «Завершить ход».
 * Видна всегда; «Завершить ход» доступна в фазе игрока и пульсирует, когда все бойцы действовали.
 */
export function BattleBar({ battle, ui }: { battle: BattleState, ui: BattleUiState }) {
  const [ask, setAsk] = useState(false)
  const players = livingUnits(battle, "player")
  const left = players.filter(u => !u.acted).length
  const canEnd = battle.phase === "player" && !battle.result && !ui.busy
  const allActed = left === 0
  const notActed = plural(left, ["fighter hasn’t", "fighters haven’t"], ["боец не действовал", "бойца не действовали", "бойцов не действовали"])
  const go = () => {
    haptic("medium")
    void endTurn()
  }
  return (
    <nav className="bf-bar-bottom" aria-label={tr("Battle controls", "Управление боем")}>
      <button
        type="button"
        className="bf-bar-btn"
        aria-label={tr("Menu", "Меню")}
        onClick={() => {
          haptic("select")
          $pauseOpen.set(true)
        }}
      >
        <span className="bf-bar-ico" aria-hidden="true">≡</span>
        <span className="bf-bar-label">{tr("Menu", "Меню")}</span>
      </button>
      <button
        type="button"
        className={`bf-bar-btn ${ui.dangerOn ? "on" : ""}`}
        aria-pressed={ui.dangerOn}
        aria-label={tr("Danger zone", "Зона опасности")}
        title={tr("Show where enemies can strike", "Показать, куда могут ударить враги")}
        onClick={() => {
          haptic("select")
          toggleDanger()
        }}
      >
        <span className="bf-bar-ico" aria-hidden="true">⚠</span>
        <span className="bf-bar-label">{tr("Danger", "Опасность")}</span>
      </button>
      <button
        type="button"
        className={`bf-bar-btn bf-bar-end ${canEnd && allActed ? "pulse" : ""}`}
        disabled={!canEnd}
        aria-label={tr("End turn", "Завершить ход")}
        onClick={() => {
          haptic("light")
          if (allActed) go()
          else setAsk(true)
        }}
      >
        <span className="bf-bar-ico" aria-hidden="true">⏭</span>
        <span className="bf-bar-label">{tr("End turn", "Завершить ход")}</span>
      </button>
      <ConfirmModal
        open={ask}
        title={tr("End turn?", "Завершить ход?")}
        text={tr(`${left} ${notActed} acted yet — they stay where they stand. The enemy gets the turn.`, `Ещё ${left} ${notActed} — останутся на своих клетках. Враг получит ход.`)}
        confirmLabel={tr("End", "Завершить")}
        onConfirm={() => {
          setAsk(false)
          go()
        }}
        onClose={() => setAsk(false)}
      />
    </nav>
  )
}
