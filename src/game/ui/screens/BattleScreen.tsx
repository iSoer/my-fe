import { useEffect, useRef } from "react"
import { useStore } from "@nanostores/react"
import { $battle, finishBattle } from "@game/state/save"
import { $battleUi, enterBattleScreen, setOnBattleEnded } from "@game/state/battleUi"
import { navigate } from "@game/state/router"
import type { BattleGameHandle } from "@game/scene/index"
import { Toast } from "../components/Toast"
import { $pauseOpen } from "../lib/pause"
import { TopHud } from "../battle/TopHud"
import { ContextMenu } from "../battle/ContextMenu"
import { ItemMenu } from "../battle/ItemMenu"
import { BottomBand } from "../battle/BottomBand"
import { ForecastCard } from "../battle/ForecastCard"
import { EndTurnButton } from "../battle/EndTurnButton"
import { EndTurnPrompt } from "../battle/EndTurnPrompt"
import { PauseModal } from "../battle/PauseModal"
import "../battle.css"
import "../village.css"
import { setBoardInsets } from "@game/state/boardLayout"

/** Высота верхней полосы HUD (для размещения меню над клеткой) и отступы поля под накладки. */
const TOP_BAND = 76
const BOARD_TOP_INSET = 84
const BOARD_BOTTOM_INSET = 150

function safeInset(name: "--tg-safe-top" | "--tg-safe-bottom"): number {
  if (typeof window === "undefined") return 0
  return (
    parseFloat(
      getComputedStyle(document.querySelector(".pawfield") ?? document.documentElement).getPropertyValue(name)
    ) || 0
  )
}

/**
 * Экран боя: Phaser-канвас на весь экран, поверх него контекстные DOM-накладки
 * (HUD, меню действий у клетки бойца, карточка бойца, прогноз, «Завершить ход»).
 */
export function BattleScreen() {
  const battle = useStore($battle)
  const ui = useStore($battleUi)
  const canvasRef = useRef<HTMLDivElement>(null)

  // Поле должно помещаться между HUD и нижней карточкой: публикуем отступы (с учётом safe-area).
  useEffect(() => {
    const publish = () =>
      setBoardInsets({
        top: BOARD_TOP_INSET + safeInset("--tg-safe-top"),
        bottom: BOARD_BOTTOM_INSET + safeInset("--tg-safe-bottom")
      })
    publish()
    window.addEventListener("resize", publish)
    return () => window.removeEventListener("resize", publish)
  }, [])

  useEffect(() => {
    const b = $battle.get()
    if (!b) {
      navigate("/", true)
      return
    }
    if (b.result) {
      finishBattle()
      navigate("/battle/result", true)
      return
    }
    const el = canvasRef.current
    let handle: BattleGameHandle | null = null
    let cancelled = false
    setOnBattleEnded(() => {
      finishBattle()
      navigate("/battle/result", true)
    })
    // Phaser грузится лениво — только на экране боя (SPEC 15).
    import("@game/scene/index")
      .then((m) => {
        if (cancelled) return
        if (el) handle = m.mountBattleGame(el)
        enterBattleScreen()
      })
      .catch((e: unknown) => {
        console.error("game load failed", e)
        if (!cancelled) enterBattleScreen()
      })
    return () => {
      cancelled = true
      setOnBattleEnded(null)
      handle?.destroy()
      $pauseOpen.set(false)
    }
  }, [])

  if (!battle) return <div className="bf-root" />

  const safeTop = safeInset("--tg-safe-top")
  const pressing = !!ui.pressedId || ui.dragging

  return (
    <div className="bf-root">
      <div id="battle-canvas" className="bf-canvas" ref={canvasRef} />
      <div className={`bf-overlay${pressing ? " is-pressing" : ""}`}>
        <div className="bf-top">
          <TopHud battle={battle} ui={ui} />
          {ui.mode === "forecast" && ui.forecast && <ForecastCard state={battle} forecast={ui.forecast} />}
        </div>
        <ContextMenu ui={ui} topBand={TOP_BAND + safeTop} />
        <ItemMenu battle={battle} ui={ui} />
        <EndTurnButton battle={battle} ui={ui} />
        <EndTurnPrompt battle={battle} ui={ui} />
        <div className="bf-bottom">
          <BottomBand battle={battle} ui={ui} />
        </div>
      </div>
      <Toast message={ui.toast} at={ui.toastAt} error />
      <PauseModal battle={battle} />
    </div>
  )
}
