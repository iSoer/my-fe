import Phaser from "phaser"
import { biomeDef } from "@game/content/biomes"
import { setSettlementControl } from "@game/state/settlement"
import { WeatherLayer } from "../weather"
import { reducedMotion } from "../motionFx"
import { SettlementScene, type SettlementSceneOptions } from "./SettlementScene"

export interface SettlementGameHandle {
  destroy(): void
}

/** Погода поселения — отдельной сценой поверх мира: частицы живут в экранных координатах и не уезжают с камерой. */
class SettlementFxScene extends Phaser.Scene {
  constructor() {
    super({ key: "settlement-fx", active: true })
  }

  create(): void {
    if (reducedMotion()) return
    new WeatherLayer(this, biomeDef("yard").weather, { depth: 1, maxParticles: 18, densityMul: 0.8 })
  }
}

/** Монтирует Phaser-игру поселения в контейнер (отдельный чанк, как бой). */
export function mountSettlementGame(parent: HTMLElement, opts: SettlementSceneOptions): SettlementGameHandle {
  const scene = new SettlementScene(opts)
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    transparent: false,
    backgroundColor: "#2f6d2c",
    scale: { mode: Phaser.Scale.RESIZE, parent, width: "100%", height: "100%", autoRound: true },
    render: { pixelArt: false, antialias: true, roundPixels: false },
    input: { activePointers: 1 },
    scene: [scene, SettlementFxScene],
    audio: { noAudio: true },
    banner: false
  } as Phaser.Types.Core.GameConfig)
  setSettlementControl({ teleport: id => scene.teleport(id), walkTo: id => scene.walkTo(id) })
  return {
    destroy() {
      setSettlementControl(null)
      game.destroy(true)
    }
  }
}

export { SETTLEMENT_SCENE_KEY } from "./SettlementScene"
