import Phaser from "phaser"
import { biomeDef } from "@game/content/biomes"
import { setVillageControl } from "@game/state/village"
import { WeatherLayer } from "../weather"
import { reducedMotion } from "../motionFx"
import { VillageScene, type VillageSceneOptions } from "./VillageScene"

export interface VillageGameHandle {
  destroy(): void
}

/** Погода деревни — отдельной сценой поверх мира: частицы живут в экранных координатах и не уезжают с камерой. */
class VillageFxScene extends Phaser.Scene {
  constructor() {
    super({ key: "village-fx", active: true })
  }

  create(): void {
    if (reducedMotion()) return
    new WeatherLayer(this, biomeDef("yard").weather, { depth: 1, maxParticles: 18, densityMul: 0.8 })
  }
}

/** Монтирует Phaser-игру лагеря в контейнер (отдельный чанк, как бой). */
export function mountVillageGame(parent: HTMLElement, opts: VillageSceneOptions): VillageGameHandle {
  const village = new VillageScene(opts)
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    transparent: false,
    backgroundColor: "#2f6d2c",
    scale: { mode: Phaser.Scale.RESIZE, parent, width: "100%", height: "100%", autoRound: true },
    render: { pixelArt: false, antialias: true, roundPixels: false },
    input: { activePointers: 2 },
    scene: [village, VillageFxScene],
    audio: { noAudio: true },
    banner: false
  } as Phaser.Types.Core.GameConfig)
  setVillageControl({
    teleport: p => village.teleport(p),
    teleportTo: id => village.teleportTo(id),
    walkTo: id => village.walkTo(id),
    build: mode => village.setBuild(mode),
    placeGhost: at => village.placeGhost(at)
  })
  return {
    destroy() {
      setVillageControl(null)
      game.destroy(true)
    }
  }
}

export { VILLAGE_SCENE_KEY } from "./VillageScene"
