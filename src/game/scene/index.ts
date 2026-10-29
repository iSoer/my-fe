import Phaser from "phaser"
import { setPresenter } from "@game/state/battleUi"
import { MapScene } from "./MapScene"
import { CinematicScene } from "./CinematicScene"
import { GamePresenter } from "./presenter"
import { createHiDpiGame } from "./hidpi"

export interface BattleGameHandle {
  destroy(): void
}

/** Монтирует Phaser-игру боя в контейнер и регистрирует Presenter для контроллера боя. */
export function mountBattleGame(parent: HTMLElement): BattleGameHandle {
  // Буфер канваса — CSS-размер × плотность рендера (настройка «Качество графики»: авто до 2, чёткое до 3,
  // экономное 1); сцены живут в CSS-единицах, см. `createHiDpiGame`
  const game = createHiDpiGame(parent, {
    type: Phaser.AUTO,
    transparent: false,
    backgroundColor: "#0b0b10",
    render: { pixelArt: false, antialias: true, roundPixels: false },
    input: { activePointers: 1 },
    scene: [MapScene, CinematicScene],
    audio: { noAudio: true },
    banner: false
  })
  const presenter = new GamePresenter(game)
  setPresenter(presenter)
  return {
    destroy() {
      setPresenter(null)
      game.destroy(true)
    }
  }
}

export { MAP_SCENE_KEY } from "./MapScene"
export { CINEMATIC_SCENE_KEY } from "./CinematicScene"
