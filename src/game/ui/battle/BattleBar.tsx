import { useEffect, useState } from "react"
import { useStore } from "@nanostores/react"
import { $save } from "@game/state/save"
import { $boardZoom, canZoom, zoomBoard } from "@game/state/boardLayout"
import type { BattleState } from "@game/core/types"
import { livingUnits } from "@game/core/battle/query"
import { endTurn, toggleDanger, type BattleUiState } from "@game/state/battleUi"
import { haptic } from "@game/platform/haptics"
import { plural, tr } from "@game/i18n"
import { ConfirmModal } from "../components/Sheet"
import { $pauseOpen } from "../lib/pause"

/** Сколько ждёт второго нажатия «взведённая» кнопка «Завершить ход» (режим двойного нажатия). */
const DOUBLE_TAP_MS = 2000

/**
 * Панель кнопок под полем, как в Fire Emblem Heroes: меню слева, зона опасности врагов и «Завершить ход».
 * Видна всегда; «Завершить ход» доступна в фазе игрока и пульсирует, когда все бойцы действовали.
 * Если кто-то ещё не действовал, подтверждение — по настройке `endTurnConfirm`: окно, без подтверждения или
 * двойное нажатие (первое меняет надпись на «Ещё раз», без второго за 2 с кнопка возвращается).
 * На большом поле (вылазка в чащу) — ещё зум камеры: «−» показывает больше карты, «+» — крупнее.
 */
export function BattleBar({ battle, ui }: { battle: BattleState, ui: BattleUiState }) {
  const [ask, setAsk] = useState(false)
  const [armed, setArmed] = useState(false)
  const confirmMode = useStore($save).settings.endTurnConfirm
  const zoom = useStore($boardZoom)
  const big = battle.map.mode === "expedition"
  const players = livingUnits(battle, "player")
  const left = players.filter(u => !u.acted).length
  const canEnd = battle.phase === "player" && !battle.result && !ui.busy
  const allActed = left === 0
  const notActed = plural(left, ["fighter hasn’t", "fighters haven’t"], ["боец не действовал", "бойца не действовали", "бойцов не действовали"])
  const go = () => {
    setArmed(false)
    haptic("medium")
    void endTurn()
  }
  // «Взведённая» кнопка сама возвращается через 2 с и при смене фазы или хода
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), DOUBLE_TAP_MS)
    return () => clearTimeout(t)
  }, [armed])
  useEffect(() => {
    if (!canEnd) setArmed(false)
  }, [canEnd])
  const press = () => {
    haptic("light")
    if (allActed || confirmMode === "none") return go()
    if (confirmMode === "double") {
      if (armed) return go()
      return setArmed(true)
    }
    setAsk(true)
  }
  return (
    <nav className={`bf-bar-bottom${big ? " has-zoom" : ""}`} aria-label={tr("Battle controls", "Управление боем")}>
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
      {big && (
        <div className="bf-bar-zoom" role="group" aria-label={tr("Zoom", "Масштаб")}>
          <button
            type="button"
            className="bf-bar-btn"
            disabled={!canZoom(-1)}
            aria-label={tr("Zoom out", "Отдалить")}
            title={tr("See more of the map (mouse wheel works too)", "Показать больше карты (работает и колесо мыши)")}
            onClick={() => {
              haptic("select")
              zoomBoard(-1)
            }}
          >
            <span className="bf-bar-ico" aria-hidden="true">−</span>
            <span className="bf-bar-label">{`${Math.round(zoom * 100)}%`}</span>
          </button>
          <button
            type="button"
            className="bf-bar-btn"
            disabled={!canZoom(1)}
            aria-label={tr("Zoom in", "Приблизить")}
            onClick={() => {
              haptic("select")
              zoomBoard(1)
            }}
          >
            <span className="bf-bar-ico" aria-hidden="true">+</span>
            <span className="bf-bar-label">{tr("Zoom", "Зум")}</span>
          </button>
        </div>
      )}
      <button
        type="button"
        className={`bf-bar-btn bf-bar-end ${canEnd && allActed ? "pulse" : ""} ${armed ? "armed" : ""}`}
        disabled={!canEnd}
        aria-label={armed ? tr("Tap again to end the turn", "Нажмите ещё раз, чтобы завершить ход") : tr("End turn", "Завершить ход")}
        title={armed ? tr(`${left} ${notActed} acted yet`, `Ещё ${left} ${notActed}`) : undefined}
        onClick={press}
      >
        <span className="bf-bar-ico" aria-hidden="true">{armed ? "⚠" : "⏭"}</span>
        <span className="bf-bar-label">{armed ? tr("Tap again", "Ещё раз") : tr("End turn", "Завершить ход")}</span>
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
