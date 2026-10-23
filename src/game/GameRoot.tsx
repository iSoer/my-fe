"use client"
import { useEffect } from "react"
import { App } from "./ui/App"
import { initRouter } from "./state/router"
import { $battleUi, confirm, endTurn, tapTile } from "./state/battleUi"
import { $boardLayout } from "./state/boardLayout"
import { $save, initSave } from "./state/save"
import { $villageUi, openNpc, villageControl } from "./state/village"
import { NPCS, type NpcId } from "./content/village"
import { spotNear } from "./core/village"
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
      // Деревня: телепорт героя (к NPC или в точку), подойти и заговорить, сразу открыть разговор
      village: {
        ui: $villageUi,
        teleport: (to: NpcId | Pos) => {
          const npc = typeof to === "string" ? NPCS.find(n => n.id === to) : undefined
          villageControl()?.teleport(npc ? spotNear(npc) : (to as Pos))
        },
        walkTo: (id: NpcId) => villageControl()?.walkTo(id),
        talk: (id: NpcId) => openNpc(id)
      }
    }
  }, [])

  return (
    <div className="pawfield">
      <App />
    </div>
  )
}
