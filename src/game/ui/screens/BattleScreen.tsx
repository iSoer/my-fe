import { useEffect, useRef } from "react"
import { useStore } from "@nanostores/react"
import { $battle, finishBattle } from "@game/state/save"
import { $battleUi, enterBattleScreen, setOnBattleEnded } from "@game/state/battleUi"
import { navigate } from "@game/state/router"
import type { BattleGameHandle } from "@game/scene/index"
import { Toast } from "../components/Toast"
import { $pauseOpen } from "../lib/pause"
import { TopHud } from "../battle/TopHud"
import { BottomBand } from "../battle/BottomBand"
import { ForecastCard } from "../battle/ForecastCard"
import { BattleBar } from "../battle/BattleBar"
import { PauseModal } from "../battle/PauseModal"
import "../battle.css"
import "../village.css"
import { $boardLayout, setBoardInsets } from "@game/state/boardLayout"

/**
 * Раскладка как в Fire Emblem Heroes: сверху шапка (HUD_H) и информационная панель (не меньше INFO_MIN),
 * под полем — панель кнопок (BAR_H). Поле прижато к панели кнопок, всё свободное место по высоте уходит панели
 * сведений, и она заканчивается ровно над полем — ничего не закрывает клетки.
 */
const HUD_H = 60
const INFO_MIN = 130
/** Ниже этой высоты панель сведений компактная: прогноз в две строки, кнопки ниже. */
const INFO_COMPACT = 200
const BAR_H = 66

/**
 * Отступ безопасной зоны в пикселях. Значение переменной не читаем строкой: env() внутри пользовательской
 * CSS-переменной вычисляется не везде (Safari отдаёт текст), поэтому меряем невидимый элемент такой высоты.
 */
function safeInset(name: "--tg-safe-top" | "--tg-safe-bottom"): number {
  if (typeof document === "undefined") return 0
  const probe = document.createElement("div")
  probe.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;height:var(${name})`
  ;(document.querySelector(".pawfield") ?? document.body).appendChild(probe)
  const h = probe.getBoundingClientRect().height
  probe.remove()
  return h
}

/**
 * Экран боя: Phaser-канвас на весь экран и DOM-накладки вокруг поля: шапка, панель сведений над полем
 * (боец, прогноз, клетка, подсказки) и панель кнопок под ним (меню, зона опасности, «Завершить ход»).
 */
export function BattleScreen() {
  const battle = useStore($battle)
  const ui = useStore($battleUi)
  const layout = useStore($boardLayout)
  const canvasRef = useRef<HTMLDivElement>(null)

  // Поле должно помещаться между HUD и нижней карточкой: публикуем отступы (с учётом safe-area).
  useEffect(() => {
    const publish = () =>
      setBoardInsets({
        top: HUD_H + INFO_MIN + safeInset("--tg-safe-top"),
        // +4: красная кромка панели кнопок не ложится на нижний ряд клеток
        bottom: BAR_H + 4 + safeInset("--tg-safe-bottom")
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

  const pressing = !!ui.pressedId || ui.dragging
  // Панель сведений — от шапки до верхнего края поля (поле публикует MapScene)
  const infoTop = HUD_H + safeInset("--tg-safe-top")
  const infoHeight = layout ? Math.max(INFO_MIN * 0.6, layout.oy - infoTop - 6) : INFO_MIN

  return (
    <div className="bf-root">
      <div id="battle-canvas" className="bf-canvas" ref={canvasRef} />
      <div className={`bf-overlay${pressing ? " is-pressing" : ""}`}>
        <div className="bf-top">
          <TopHud battle={battle} ui={ui} />
        </div>
        <div className={`bf-info${infoHeight < INFO_COMPACT ? " compact" : ""}`} style={{ top: `${infoTop}px`, height: `${infoHeight}px` }}>
          {ui.mode === "forecast" && ui.forecast && <ForecastCard state={battle} forecast={ui.forecast} />}
          <BottomBand battle={battle} ui={ui} />
        </div>
        <BattleBar battle={battle} ui={ui} />
      </div>
      <Toast message={ui.toast} at={ui.toastAt} error />
      <PauseModal battle={battle} />
    </div>
  )
}
