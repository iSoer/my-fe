"use client"
import { useEffect } from "react"
import { App } from "./ui/App"
import { initRouter } from "./state/router"
import { $battleUi, confirm, endTurn, tapTile } from "./state/battleUi"
import { $boardLayout } from "./state/boardLayout"
import { $save, initSave } from "./state/save"
import { $villageUi, openNpc, startBuild, stopBuild, villageControl, type BuildMode } from "./state/village"
import type { PlaceId } from "./content/village"
import type { Pos } from "./core/types"
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
    // Отладочный хук для консоли и смоук-тестов (игра одиночная, секретов нет)
    ;(window as unknown as { __pf?: unknown }).__pf = {
      save: $save,
      ui: $battleUi,
      layout: $boardLayout,
      // Действия игрока в бою — для смоук-тестов и проверки анимаций
      battle: { tapTile, confirm, endTurn },
      // Лагерь: телепорт героя (к месту или в точку), подойти и заговорить, сразу открыть разговор, стройка
      village: {
        ui: $villageUi,
        teleport: (to: PlaceId | Pos) => {
          if (typeof to === "string") villageControl()?.teleportTo(to)
          else villageControl()?.teleport(to)
        },
        walkTo: (id: PlaceId) => villageControl()?.walkTo(id),
        talk: (id: PlaceId) => openNpc(id),
        build: (mode: BuildMode | null) => (mode ? startBuild(mode) : stopBuild()),
        ghost: (at: Pos) => villageControl()?.placeGhost(at)
      }
    }
  }, [])

  return (
    <div className="pawfield">
      <App />
    </div>
  )
}
