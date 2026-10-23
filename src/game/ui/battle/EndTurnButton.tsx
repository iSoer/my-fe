import { useState } from "react"
import type { BattleState } from "@game/core/types"
import { livingUnits } from "@game/core/battle/query"
import { endTurn, type BattleUiState } from "@game/state/battleUi"
import { haptic } from "@game/platform/haptics"
import { plural, tr } from "@game/i18n"
import { ConfirmModal } from "../components/Sheet"
import { useStore } from "@nanostores/react"
import { $settings } from "@game/state/save"
import { $endPromptDismissed } from "./endPrompt"
import { shouldOfferEndTurn } from "./EndTurnPrompt"

/** Плавающая кнопка «Завершить ход» над нижней полосой; пульсирует, когда все походили. */
export function EndTurnButton({ battle, ui }: { battle: BattleState, ui: BattleUiState }) {
  const [ask, setAsk] = useState(false)
  const settings = useStore($settings)
  const dismissed = useStore($endPromptDismissed)
  const isPlayer = battle.phase === "player"
  const players = livingUnits(battle, "player")
  const left = players.filter(u => !u.acted).length
  const notActed = plural(left, ["fighter hasn’t", "fighters haven’t"], ["боец не действовал", "бойца не действовали", "бойцов не действовали"])
  const show = isPlayer && !ui.busy && ui.mode === "idle"
  // Пока всплыло предложение завершить ход — плавающую кнопку не дублируем.
  if (!show || shouldOfferEndTurn(battle, ui, settings.autoEndTurn, dismissed)) return null
  const allActed = left === 0
  const go = () => {
    haptic("medium")
    void endTurn()
  }
  return (
    <>
      <button
        type="button"
        aria-label={tr("End turn", "Завершить ход")}
        className={`bf-endturn ${allActed ? "pulse" : ""}`}
        onClick={() => {
          haptic("light")
          if (allActed) go()
          else setAsk(true)
        }}
      >
        <span className="bf-endturn-ico" aria-hidden="true">
          ⏭
        </span>
        {tr("End turn", "Завершить ход")}
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
    </>
  )
}
