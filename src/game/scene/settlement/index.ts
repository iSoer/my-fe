import Phaser from "phaser"
import { rainAt } from "@game/core/settlement/rain"
import { setSettlementControl } from "@game/state/settlement"
import { WeatherLayer } from "../weather"
import { reducedMotion } from "../motionFx"
import { SettlementScene, type SettlementSceneOptions } from "./SettlementScene"
import { RainLayer } from "./rain"

/** Палые листья в сухую погоду: бурые и пожухлые — деревня выживших, а не сад. */
const DRY_WEATHER = { kind: "leaves", colors: [0x6b5a3a, 0x8a6a3a, 0x4f4a2c], density: 6 } as const

export interface SettlementGameHandle {
  destroy(): void
}

/**
 * Погода поселения — отдельной сценой поверх мира: частицы живут в экранных координатах и не уезжают с камерой.
 * Сумрак (виньетка) — всегда, дождь — по часам (`rainAt`): иногда начинается, идёт несколько минут и стихает.
 */
class SettlementFxScene extends Phaser.Scene {
  private rain?: RainLayer
  private rainCheckT = 0

  constructor() {
    super({ key: "settlement-fx", active: true })
  }

  create(): void {
    const still = reducedMotion()
    if (!still) new WeatherLayer(this, { ...DRY_WEATHER, colors: [...DRY_WEATHER.colors] }, { depth: 1, maxParticles: 12, densityMul: 0.7 })
    this.rain = new RainLayer(this, { depth: 2, still })
    this.rain.setLevel(rainAt(Date.now()))
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs, 50) / 1000
    this.rainCheckT -= dt
    if (this.rainCheckT <= 0) {
      this.rainCheckT = 1
      this.rain?.setLevel(rainAt(Date.now()))
    }
    this.rain?.update(dt)
  }
}

/** Монтирует Phaser-игру поселения в контейнер (отдельный чанк, как бой). */
export function mountSettlementGame(parent: HTMLElement, opts: SettlementSceneOptions): SettlementGameHandle {
  const scene = new SettlementScene(opts)
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    transparent: false,
    backgroundColor: "#141a12",
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
