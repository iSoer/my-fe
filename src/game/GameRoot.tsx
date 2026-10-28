"use client"
import { useEffect } from "react"
import { App } from "./ui/App"
import { initRouter } from "./state/router"
import { $battleUi, confirm, endTurn, tapTile } from "./state/battleUi"
import { $boardLayout } from "./state/boardLayout"
import { $save, initSave } from "./state/save"
import { initSound } from "./state/sound"
import {
  $settlementNear,
  $settlementPanel,
  buildAction,
  collectAction,
  openPanel,
  reviveAction,
  settlementControl,
  tickSettlement,
  trainAction,
  upgradeAction
} from "./state/settlement"
import "./ui/styles.css"
import "./ui/mobile.css"

/**
 * Корень игры «Cat Emblem» на маршруте /game. Только клиент: сейв в localStorage, хеш-роутер и Phaser
 * читают window при импорте, поэтому страница грузит этот модуль через next/dynamic с ssr: false.
 */
export default function GameRoot() {
  useEffect(() => {
    initRouter()
    initSave()
    initSound()
    // Отладочный хук для консоли и смоук-тестов (игра одиночная, секретов нет)
    ;(window as unknown as { __pf?: unknown }).__pf = {
      save: $save,
      ui: $battleUi,
      layout: $boardLayout,
      // Действия игрока в бою — для смоук-тестов и проверки анимаций
      battle: { tapTile, confirm, endTurn },
      // Поселение: перенести героя к месту (`plot-store`, `gate`…) или подвести и открыть, сразу открыть карточку,
      // строить, улучшать, тренировать, воскрешать
      settlement: {
        panel: $settlementPanel,
        near: $settlementNear,
        teleport: (id: string) => settlementControl()?.teleport(id),
        walkTo: (id: string) => settlementControl()?.walkTo(id),
        open: openPanel,
        build: buildAction,
        upgrade: upgradeAction,
        train: trainAction,
        collect: collectAction,
        revive: reviveAction,
        tick: tickSettlement
      }
    }
  }, [])

  return (
    <div className="pawfield">
      <App />
    </div>
  )
}
