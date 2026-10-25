import Phaser from "phaser"
import type { Facing, Pos, Settlement, VillageState } from "@game/core/types"
import {
  campLayout,
  canPlace,
  facingOf,
  findSpot,
  findVillagePath,
  footprint,
  entranceTiles,
  freeSpotNear,
  heroFits,
  isBuilding,
  moveHero,
  normalizeInput,
  placeInReach,
  placedBuildings,
  spotNear,
  tileIndex,
  villageTile,
  type Camp,
  type PlaceSpot,
  type Placeable
} from "@game/core/village"
import {
  BUILDING_SHAPES,
  FIXED_PLACES,
  GATE,
  GRAVEYARD,
  HALL,
  HERO_SPEED,
  NPCS,
  ROOF,
  VILLAGE_H,
  VILLAGE_W,
  decorDef,
  type DecorId,
  type NpcDef,
  type PlaceId
} from "@game/content/village"
import { buildingDef, type BuildingId } from "@game/content/buildings"
import type { BuildMode, PlacementView } from "@game/state/village"
import { critterSvg, eyeArt, furArt, tileSvg } from "@game/art/index"
import { TILE_FRAME_COUNT } from "@game/art/tile"
import { HERO_ANCHOR, HERO_IDLE_FRAMES, HERO_VIEW, HERO_WALK_FRAMES, heroArtKey, heroSvg } from "@game/art/hero"
import {
  FENCE_H,
  GATE_H,
  GRAVEYARD_H_OVER,
  HOUSE_ROOF_OVER,
  TREE_H,
  villageDecorSvg,
  villageFenceSvg,
  villageFieldsSvg,
  villageFlowersSvg,
  villageGateSvg,
  villageGraveyardSvg,
  villageHouseSvg,
  villagePathSvg,
  villageTrainingSvg,
  villageTreeSvg
} from "@game/art/village"
import { ensureTexture } from "../svgTextures"
import { ensureTextures } from "../textures"
import { textStyle } from "../style"
import { stepFx, reducedMotion } from "../motionFx"
import { sceneAlive } from "../fx"
import { tr } from "@game/i18n"

export const VILLAGE_SCENE_KEY = "village"

/** Клетка лагеря на экране (мировые пиксели); текстуры растеризуются вдвое крупнее ради чёткости. */
const T = 48
const RES = 2
const FACINGS: readonly Facing[] = ["down", "up", "left", "right"]
const WATER_FRAMES = TILE_FRAME_COUNT.water ?? 1
/** Высота героя и NPC на экране (в клетках). */
const HERO_H = 1.2
const NPC_W = 1.25
/** Сколько рядов за частоколом дорисовано под воротами (не проходимо): дорога уходит из лагеря. */
const OUTSIDE_ROWS = 2
/** Сколько клеток лагеря видно по ширине и высоте на обычном зуме (остальное — прокруткой за героем). */
const VIEW_TILES_W = 10.5
const VIEW_TILES_H = 13
const ZOOM_MIN = 0.34
const ZOOM_MAX = 1.8

export interface VillageSceneOptions {
  start: VillageState
  /** Поселение из сейва: уровни зданий и раскладка лагеря (опрашивается раз в полсекунды). */
  settlement: () => Settlement
  /** Зрелость Полей 0–2 для арта (ростки, зелень, колосья). */
  fieldsStage: () => number
  /** «!» над местом — опрашивается раз в полсекунды. */
  alerts: () => Record<PlaceId, boolean>
  /** Следующий шаг игрока: над этим местом прыгает стрелка. */
  guide: () => PlaceId
  /** Сколько экранных пикселей сверху и снизу заняты HUD: камера держит героя между ними. */
  insets: () => { top: number, bottom: number }
  /** Сцена на паузе, пока открыт разговор или лист поверх. */
  paused: () => boolean
  /** Устройство без клавиатуры: подсказку «E — поговорить» не показываем, есть кнопка в HUD. */
  touch: boolean
  onNear: (id: PlaceId | undefined) => void
  onTalk: (id: PlaceId) => void
  /** Герой остановился — запомнить позицию в сейве. */
  onRest: (pos: Pos, facing: Facing) => void
  /** Призрак постройки сдвинулся (или стройка закончилась — `null`). */
  onPlacement: (p: PlacementView | null) => void
  /** Тап по клетке в режиме декора: поставить сюда (React проверит цену и место). */
  onDecorTap: (id: DecorId, at: Pos) => void
  /** Тап по клетке в режиме сноса. */
  onRemoveTap: (at: Pos) => void
}

interface NpcView {
  def: NpcDef
  img: Phaser.GameObjects.Image
  label: Phaser.GameObjects.Text
}

/** Вывеска места: плашка «иконка + название», значок «!», стрелка следующего шага и подсказка «поговорить». */
interface PlaceView {
  spot: PlaceSpot
  frame: Phaser.GameObjects.Graphics
  w: number
  h: number
  badge: Phaser.GameObjects.Container
  arrow: Phaser.GameObjects.Text
  prompt: Phaser.GameObjects.Text
  npc?: NpcView
}

interface Ghost {
  kind: Placeable
  at: Pos
  img?: Phaser.GameObjects.Image
  gfx: Phaser.GameObjects.Graphics
}

type Keys = Record<"W" | "A" | "S" | "D" | "UP" | "DOWN" | "LEFT" | "RIGHT" | "E" | "SPACE" | "ENTER", Phaser.Input.Keyboard.Key>

const texKey = {
  grass: (v: number) => `vg:grass:${v}`,
  path: (v: number) => `vg:path:${v}`,
  flowers: (v: number) => `vg:flowers:${v}`,
  water: (f: number) => `vg:water:${f}`,
  bush: "vg:bush",
  tree: (v: number) => `vg:tree:${v}`,
  fence: (side: boolean, v: number) => `vg:fence:${side ? "s" : "h"}:${v}`,
  gate: "vg:gate",
  graveyard: "vg:graveyard",
  hall: "vg:hall",
  building: (id: BuildingId, level: number, stage: number) => `vg:b:${id}:${level}${id === "fields" ? `:${stage}` : ""}`,
  decor: (id: DecorId) => `vg:d:${id}`,
  npc: (id: string, pose: string) => `vg:npc:${id}:${pose}`
}

const hash = (x: number, y: number): number => ((x * 73856093) ^ (y * 19349663)) >>> 0

function buildingSvg(id: BuildingId, level: number, stage: number): string {
  const s = BUILDING_SHAPES[id]
  if (id === "training") return villageTrainingSvg(s.w, s.h, s.over, level)
  if (id === "fields") return villageFieldsSvg(s.w, s.h, s.over, level, stage)
  return villageHouseSvg({ w: s.w, h: s.h, roof: s.roof, wall: s.wall, npc: id, level })
}

/** Ключ текстуры декора на клетке: тропинка, клумба и деревце — варианты тайлов местности. */
function decorTexture(id: DecorId, x: number, y: number): string {
  const h = hash(x, y)
  if (id === "path") return texKey.path(h % 4)
  if (id === "flowers") return texKey.flowers(h % 4)
  if (id === "sapling") return texKey.tree(h % 3)
  return texKey.decor(id)
}

export class VillageScene extends Phaser.Scene {
  private readonly opts: VillageSceneOptions
  private camp: Camp
  private campKey = ""
  private syncToken = 0
  private pos: Pos
  private facing: Facing
  private hero?: Phaser.GameObjects.Image
  /** Всё, что пересобирается при смене раскладки: постройки, декор, жители, вывески. */
  private dyn: Phaser.GameObjects.GameObject[] = []
  private places: PlaceView[] = []
  /** Спрайты построенных зданий: при переносе старое место бледнеет. */
  private buildingImgs = new Map<BuildingId, Phaser.GameObjects.Image>()
  private guided: PlaceId | undefined
  private water: Phaser.GameObjects.Image[] = []
  private keys?: Keys
  private path: Pos[] = []
  /** Место, с которым заговорить, когда герой дойдёт по тапу. */
  private talkOnArrive: PlaceId | undefined
  private near: PlaceId | undefined
  private moving = false
  private walkT = 0
  private idleT = 0
  private stepT = 0
  private stuckT = 0
  private alertT = 0
  private waterT = 0
  private ready = false
  private joy?: { start: Pos, vec: Pos, base: Phaser.GameObjects.Arc, knob: Phaser.GameObjects.Arc }
  private down?: { x: number, y: number, id: number, panned: boolean }
  private pinch?: { dist: number, zoom: number }
  private marker?: Phaser.GameObjects.Arc
  private zoomMul = 1
  private buildMode: BuildMode | null = null
  private pendingBuild: BuildMode | null | undefined
  private ghost?: Ghost
  private ghostToken = 0
  private overlay?: Phaser.GameObjects.Graphics

  constructor(opts: VillageSceneOptions) {
    super({ key: VILLAGE_SCENE_KEY })
    this.opts = opts
    this.camp = campLayout(opts.settlement())
    this.pos = heroFits(this.camp, opts.start.pos) ? { ...opts.start.pos } : freeSpotNear(this.camp, opts.start.pos)
    this.facing = opts.start.facing
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#2f6d2c")
    // Общие текстуры частиц (пыль шагов и т. п.)
    ensureTextures(this)
    void this.loadTextures().then(() => {
      if (!sceneAlive(this)) return
      this.createWorld()
      this.ready = true
      if (this.pendingBuild !== undefined) this.applyBuild(this.pendingBuild)
    })
  }

  /* ---------- Текстуры ---------- */

  private tex(key: string, svg: string, w: number, h: number): Promise<string> {
    return ensureTexture(this, key, svg, w * RES, h * RES)
  }

  private loadTextures(): Promise<unknown> {
    const t = this.tex.bind(this)
    const jobs: Promise<string>[] = []
    for (let v = 0; v < 3; v++) jobs.push(t(texKey.grass(v), tileSvg("yard", "plain", 0, v), T, T))
    for (let v = 0; v < 4; v++) {
      jobs.push(t(texKey.path(v), villagePathSvg(v), T, T))
      jobs.push(t(texKey.flowers(v), villageFlowersSvg(v), T, T))
    }
    for (let v = 0; v < 2; v++) {
      jobs.push(t(texKey.fence(false, v), villageFenceSvg(false, v), T, T * FENCE_H))
      jobs.push(t(texKey.fence(true, v), villageFenceSvg(true, v), T, T * FENCE_H))
    }
    for (let f = 0; f < WATER_FRAMES; f++) jobs.push(t(texKey.water(f), tileSvg("yard", "water", f, 0), T, T))
    jobs.push(t(texKey.bush, tileSvg("yard", "forest", 0, 0), T, T))
    for (let v = 0; v < 3; v++) jobs.push(t(texKey.tree(v), villageTreeSvg(v), T, T * TREE_H))
    jobs.push(t(texKey.gate, villageGateSvg(GATE.w), GATE.w * T, T * GATE_H))
    jobs.push(t(texKey.graveyard, villageGraveyardSvg(GRAVEYARD.w, GRAVEYARD.h), GRAVEYARD.w * T, (GRAVEYARD.h + GRAVEYARD_H_OVER) * T))
    jobs.push(t(texKey.hall, villageHouseSvg({ ...HALL, npc: "settlement" }), HALL.w * T, (HALL.h + HOUSE_ROOF_OVER) * T))
    for (const n of NPCS) {
      for (const pose of ["idle", "blink", "happy"] as const) {
        const svg = critterSvg({
          species: n.species,
          fur: furArt(n.fur),
          iris: eyeArt(n.eyes),
          pattern: 0,
          eyes: n.eyes,
          accessory: n.accessory,
          pose
        })
        jobs.push(t(texKey.npc(n.id, pose), svg, T * NPC_W, (T * NPC_W * 140) / 120))
      }
    }
    const heroH = T * HERO_H
    const heroW = (heroH * HERO_VIEW.w) / HERO_VIEW.h
    for (const facing of FACINGS) {
      for (let f = 0; f < HERO_IDLE_FRAMES; f++)
        jobs.push(t(heroArtKey({ facing, pose: "idle", frame: f }), heroSvg({ facing, pose: "idle", frame: f }), heroW, heroH))
      for (let f = 0; f < HERO_WALK_FRAMES; f++)
        jobs.push(t(heroArtKey({ facing, pose: "walk", frame: f }), heroSvg({ facing, pose: "walk", frame: f }), heroW, heroH))
    }
    jobs.push(this.campTextures(this.opts.settlement()))
    return Promise.all(jobs)
  }

  private buildingTexture(id: BuildingId, level: number): Promise<string> {
    const s = BUILDING_SHAPES[id]
    const stage = id === "fields" ? this.opts.fieldsStage() : 0
    return this.tex(texKey.building(id, level, stage), buildingSvg(id, level, stage), s.w * T, (s.h + s.over) * T)
  }

  private decorTex(id: DecorId): Promise<string> {
    if (id === "path" || id === "flowers" || id === "sapling") return Promise.resolve(decorTexture(id, 0, 0))
    const d = decorDef(id)
    return this.tex(texKey.decor(id), villageDecorSvg(id, d.h), T, T * d.h)
  }

  /** Текстуры построек и декора этой раскладки (новые уровни растеризуются по требованию). */
  private campTextures(s: Settlement): Promise<string> {
    const jobs: Promise<string>[] = placedBuildings(s).map(({ id }) => this.buildingTexture(id, s.buildings[id]))
    for (const id of new Set(s.layout.decor.map(d => d.id))) jobs.push(this.decorTex(id))
    return Promise.all(jobs).then(() => "")
  }

  /* ---------- Сборка мира ---------- */

  private createWorld(): void {
    for (let y = 0; y < VILLAGE_H; y++) {
      for (let x = 0; x < VILLAGE_W; x++) {
        const tile = villageTile(x, y)
        const h = hash(x, y)
        const px = x * T
        const py = y * T
        this.add.image(px, py, texKey.grass(h % 3)).setOrigin(0).setDisplaySize(T, T).setDepth(-10)
        if (tile === "path" || tile === "door" || tile === "gate")
          this.add.image(px, py, texKey.path(h % 4)).setOrigin(0).setDisplaySize(T, T).setDepth(-9)
        else if (tile === "flowers")
          this.add.image(px, py, texKey.flowers(h % 4)).setOrigin(0).setDisplaySize(T, T).setDepth(-9)
        else if (tile === "water")
          this.water.push(this.add.image(px, py, texKey.water(0)).setOrigin(0).setDisplaySize(T, T).setDepth(-9))
        else if (tile === "bush") this.add.image(px, py, texKey.bush).setOrigin(0).setDisplaySize(T, T).setDepth(py + T)
        else if (tile === "tree")
          this.add.image(px + T / 2, py + T, texKey.tree(h % 3)).setOrigin(0.5, 1).setDisplaySize(T, T * TREE_H).setDepth(py + T)
        else if (tile === "fence") {
          const side = villageTile(x - 1, y) !== "fence" && villageTile(x + 1, y) !== "fence"
          this.add.image(px, py + T, texKey.fence(side, h % 2)).setOrigin(0, 1).setDisplaySize(T, T * FENCE_H).setDepth(py + T)
        }
      }
    }
    // За частоколом: луг, дорога уходит от ворот на юг, редкие деревья по краям
    const road = GATE.x + Math.floor(GATE.w / 2)
    for (let y = VILLAGE_H; y < VILLAGE_H + OUTSIDE_ROWS; y++) {
      for (let x = 0; x < VILLAGE_W; x++) {
        const h = hash(x, y)
        this.add.image(x * T, y * T, texKey.grass(h % 3)).setOrigin(0).setDisplaySize(T, T).setDepth(-10)
        if (x === road) this.add.image(x * T, y * T, texKey.path(h % 4)).setOrigin(0).setDisplaySize(T, T).setDepth(-9)
        else if (Math.abs(x - road) > 3 && h % 3 === 0) {
          this.add
            .image(x * T + T / 2, (y + 1) * T, texKey.tree(h % 3))
            .setOrigin(0.5, 1)
            .setDisplaySize(T, T * TREE_H)
            .setDepth((y + 1) * T)
        }
      }
    }
    const hallBottom = (HALL.y + HALL.h) * T
    this.add.image(HALL.x * T, hallBottom, texKey.hall).setOrigin(0, 1).setDisplaySize(HALL.w * T, (HALL.h + ROOF) * T).setDepth(hallBottom)
    const graveBottom = (GRAVEYARD.y + GRAVEYARD.h) * T
    this.add
      .image(GRAVEYARD.x * T, graveBottom, texKey.graveyard)
      .setOrigin(0, 1)
      .setDisplaySize(GRAVEYARD.w * T, (GRAVEYARD.h + GRAVEYARD_H_OVER) * T)
      .setDepth(graveBottom)
    const gateBottom = (GATE.y + 1) * T
    this.add
      .image(GATE.x * T, gateBottom, texKey.gate)
      .setOrigin(0, 1)
      .setDisplaySize(GATE.w * T, T * GATE_H)
      .setDepth(gateBottom)

    const heroH = T * HERO_H
    this.hero = this.add
      .image(this.pos.x * T, this.pos.y * T, heroArtKey({ facing: this.facing }))
      .setOrigin(0.5, HERO_ANCHOR.y)
      .setDisplaySize((heroH * HERO_VIEW.w) / HERO_VIEW.h, heroH)
      .setDepth(this.pos.y * T)

    this.rebuildCamp(this.opts.settlement())
    this.setupInput()
    this.setupCamera()
    this.cameras.main.centerOn(this.hero.x, this.hero.y)
    this.scale.on(Phaser.Scale.Events.RESIZE, this.setupCamera, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.setupCamera, this)
      this.opts.onRest(this.pos, this.facing)
    })
    this.refreshAlerts()
    this.updateNear()
  }

  private keyOf(s: Settlement): string {
    return JSON.stringify([s.buildings, s.layout, s.buildings.fields > 0 ? this.opts.fieldsStage() : 0])
  }

  /** Раскладка в сейве изменилась (постройка, перенос, декор, рост Полей) — пересобрать лагерь. */
  private syncCamp(): void {
    const s = this.opts.settlement()
    const key = this.keyOf(s)
    if (key === this.campKey) return
    this.campKey = key
    this.camp = campLayout(s)
    const token = ++this.syncToken
    void this.campTextures(s).then(() => {
      if (token !== this.syncToken || !sceneAlive(this)) return
      this.rebuildCamp(s)
    })
  }

  private rebuildCamp(s: Settlement): void {
    this.campKey = this.keyOf(s)
    this.camp = campLayout(s)
    for (const o of this.dyn) {
      this.tweens.killTweensOf(o)
      o.destroy()
    }
    this.dyn = []
    this.places = []
    this.buildingImgs.clear()
    this.guided = undefined
    const keep = <G extends Phaser.GameObjects.GameObject>(o: G): G => {
      this.dyn.push(o)
      return o
    }

    for (const { id, at } of placedBuildings(s)) {
      const sh = BUILDING_SHAPES[id]
      const stage = id === "fields" ? this.opts.fieldsStage() : 0
      const bottom = (at.y + sh.h) * T
      const img = keep(this.add
        .image(at.x * T, bottom, texKey.building(id, s.buildings[id], stage))
        .setOrigin(0, 1)
        .setDisplaySize(sh.w * T, (sh.h + sh.over) * T)
        .setDepth(bottom))
      this.buildingImgs.set(id, img)
      if (this.buildMode?.mode === "place" && this.buildMode.moving && this.buildMode.kind === id) img.setAlpha(0.35)
    }
    for (const d of s.layout.decor) {
      const def = decorDef(d.id)
      const key = decorTexture(d.id, d.x, d.y)
      if (def.walkable) {
        keep(this.add.image(d.x * T, d.y * T, key).setOrigin(0).setDisplaySize(T, T).setDepth(-8.5))
        continue
      }
      const bottom = (d.y + 1) * T
      keep(this.add.image(d.x * T + T / 2, bottom, key).setOrigin(0.5, 1).setDisplaySize(T, T * def.h).setDepth(bottom))
      if ((d.id === "campfire" || d.id === "lantern") && !reducedMotion()) {
        const glowY = d.id === "campfire" ? bottom - T * 0.45 : bottom - T * 1.1
        const glow = keep(this.add.circle(d.x * T + T / 2, glowY, T * 0.55, 0xffb703, 0.16).setDepth(bottom + 1).setBlendMode(Phaser.BlendModes.ADD))
        this.tweens.add({ targets: glow, alpha: 0.3, scale: 1.15, duration: 380 + (hash(d.x, d.y) % 200), yoyo: true, repeat: -1, ease: "Sine.easeInOut" })
      }
    }
    for (const spot of this.camp.places) this.places.push(this.makePlace(spot, s, keep))

    if (this.hero && !heroFits(this.camp, this.pos)) this.teleport(freeSpotNear(this.camp, this.pos))
    this.near = undefined
    this.updateNear()
    this.refreshAlerts()
    if (this.buildMode) {
      this.drawOverlay()
      if (this.ghost) this.setGhost(this.ghost.at, false)
    }
  }

  private makeNpc(def: NpcDef, pos: Pos, keep: <G extends Phaser.GameObjects.GameObject>(o: G) => G): NpcView {
    const w = T * NPC_W
    const h = (w * 140) / 120
    const x = pos.x * T
    const y = pos.y * T
    const img = keep(this.add.image(x, y + h * 0.14, texKey.npc(def.id, "idle")).setOrigin(0.5, 1).setDisplaySize(w, h).setDepth(y))
    const label = keep(this.add
      .text(x, y - h * 0.78, def.name, textStyle(11, "#ffffff", true, 3))
      .setOrigin(0.5, 1)
      .setResolution(2)
      .setDepth(9000))
    if (!reducedMotion()) {
      const duration = 900 + (hash(Math.round(pos.x * 10), 3) % 300)
      this.tweens.add({ targets: img, y: img.y - 2, duration, yoyo: true, repeat: -1, ease: "Sine.easeInOut" })
    }
    return { def, img, label }
  }

  /** Вывеска над местом: плашка-пункт меню (тап по ней или по зданию ведёт туда) и житель места. */
  private makePlace(spot: PlaceSpot, s: Settlement, keep: <G extends Phaser.GameObjects.GameObject>(o: G) => G): PlaceView {
    const building = spot.id in s.buildings ? (spot.id as BuildingId) : undefined
    const info = building ? buildingDef(building) : FIXED_PLACES[spot.id as keyof typeof FIXED_PLACES]
    const x = (spot.rect.x + spot.rect.w / 2) * T
    const y = (spot.rect.y + 0.4) * T
    const level = building ? ` · ${s.buildings[building]}` : ""
    const title = this.add.text(0, 0, `${info.icon} ${info.name}${level}`, textStyle(15, "#3b2614", true, 0)).setOrigin(0.5).setResolution(2)
    const w = title.width + 20
    const h = 30
    const frame = this.add.graphics()
    keep(this.add.container(x, y, [frame, title]).setDepth(9500))
    const badgeBg = this.add.circle(0, 0, 11, 0xe63946).setStrokeStyle(3, 0xffffff)
    const badgeText = this.add.text(0, 0, "!", textStyle(15, "#ffffff", true, 0)).setOrigin(0.5).setResolution(2)
    const badge = keep(this.add.container(x + w / 2 - 2, y - h / 2 + 1, [badgeBg, badgeText]).setDepth(9501).setVisible(false))
    const arrow = keep(this.add
      .text(x, y - h / 2 - 4, "▼", { ...textStyle(24, "#ffd166", true, 5), stroke: "#3b2614" })
      .setOrigin(0.5, 1)
      .setResolution(2)
      .setDepth(9502)
      .setVisible(false))
    const prompt = keep(this.add
      .text(spot.talk.x * T, spot.talk.y * T + 12, tr("E / Space — talk", "E / Пробел — поговорить"), {
        ...textStyle(11, "#15121a", true, 0),
        backgroundColor: "#ffffffdd",
        padding: { x: 6, y: 3 }
      })
      .setOrigin(0.5, 0)
      .setDepth(10002)
      .setVisible(false))
    if (!reducedMotion()) {
      this.tweens.add({ targets: arrow, y: arrow.y - 9, duration: 480, yoyo: true, repeat: -1, ease: "Sine.easeInOut" })
      this.tweens.add({ targets: badge, scale: 1.15, duration: 520, yoyo: true, repeat: -1, ease: "Sine.easeInOut" })
    }
    const view: PlaceView = { spot, frame, w, h, badge, arrow, prompt }
    if (spot.npc) view.npc = this.makeNpc(spot.npc.def, spot.npc.pos, keep)
    this.drawPlaque(view, false)
    return view
  }

  private drawPlaque(v: PlaceView, guided: boolean): void {
    const { frame, w, h } = v
    frame.clear()
    frame.fillStyle(0x000000, 0.25).fillRoundedRect(-w / 2 + 2, -h / 2 + 3, w, h, 9)
    frame.fillStyle(0xf3e2c0, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 9)
    frame.lineStyle(guided ? 4 : 2.5, guided ? 0xffb703 : 0x5a3b22, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 9)
  }

  /* ---------- Камера ---------- */

  private zoom(): number {
    const { top, bottom } = this.opts.insets()
    const availH = Math.max(1, this.scale.height - top - bottom)
    const base = Math.min(this.scale.width / (VIEW_TILES_W * T), availH / (VIEW_TILES_H * T))
    return Phaser.Math.Clamp(base * this.zoomMul, ZOOM_MIN, ZOOM_MAX)
  }

  /**
   * Камера следует за героем (в стройке — свободно двигается пальцем), не выходя за лагерь; HUD сверху и снизу
   * не закрывает края. Если лагерь меньше экрана — он по центру.
   */
  private setupCamera(): void {
    const cam = this.cameras.main
    if (!this.hero) return
    const { top, bottom } = this.opts.insets()
    const zoom = this.zoom()
    cam.setZoom(zoom)
    const viewW = this.scale.width / zoom
    const viewH = this.scale.height / zoom
    let x0 = 0
    let x1 = VILLAGE_W * T
    let y0 = -T * 0.7 - top / zoom
    let y1 = (VILLAGE_H + OUTSIDE_ROWS) * T + bottom / zoom
    if (x1 - x0 < viewW) {
      const c = (x0 + x1) / 2
      x0 = c - viewW / 2
      x1 = c + viewW / 2
    }
    if (y1 - y0 < viewH) {
      const c = (y0 + y1) / 2
      y0 = c - viewH / 2
      y1 = c + viewH / 2
    }
    cam.setBounds(x0, y0, x1 - x0, y1 - y0)
    if (this.buildMode) cam.stopFollow()
    else {
      cam.startFollow(this.hero, true, 0.14, 0.14)
      cam.setFollowOffset(0, (top - bottom) / 2 / zoom)
    }
  }

  private zoomBy(k: number): void {
    const base = this.zoom() / this.zoomMul
    this.zoomMul = Phaser.Math.Clamp(this.zoomMul * k, ZOOM_MIN / base, ZOOM_MAX / base)
    this.setupCamera()
  }

  /* ---------- Ввод ---------- */

  private setupInput(): void {
    const kb = this.input.keyboard
    if (kb) this.keys = kb.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,E,SPACE,ENTER") as Keys
    const pinchDist = () => Phaser.Math.Distance.Between(this.input.pointer1.x, this.input.pointer1.y, this.input.pointer2.x, this.input.pointer2.y)
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.opts.paused()) return
      if (this.input.pointer1.isDown && this.input.pointer2.isDown) {
        // Второй палец — щипок: зум, движение и тап отменяются
        this.stopJoystick()
        this.down = undefined
        this.pinch = { dist: Math.max(1, pinchDist()), zoom: this.zoomMul }
        return
      }
      this.down = { x: p.x, y: p.y, id: p.id, panned: false }
    })
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (this.pinch) {
        if (this.input.pointer1.isDown && this.input.pointer2.isDown) {
          this.zoomMul = this.pinch.zoom
          this.zoomBy(pinchDist() / this.pinch.dist)
        }
        return
      }
      if (!this.down || !p.isDown || p.id !== this.down.id || this.opts.paused()) return
      const dx = p.x - this.down.x
      const dy = p.y - this.down.y
      if (this.buildMode) {
        // В стройке палец двигает камеру
        if (!this.down.panned && Math.hypot(dx, dy) < 10) return
        this.down.panned = true
        const cam = this.cameras.main
        cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom
        cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom
        return
      }
      if (!this.joy && Math.hypot(dx, dy) > 16) this.startJoystick(this.down)
      if (this.joy) {
        const max = 46
        const len = Math.min(max, Math.hypot(dx, dy))
        const a = Math.atan2(dy, dx)
        this.joy.vec = { x: (Math.cos(a) * len) / max, y: (Math.sin(a) * len) / max }
        this.joy.knob.setPosition(this.joy.start.x + Math.cos(a) * len, this.joy.start.y + Math.sin(a) * len)
      }
    })
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => {
      if (this.pinch) {
        if (!this.input.pointer1.isDown && !this.input.pointer2.isDown) this.pinch = undefined
        return
      }
      const wasJoy = !!this.joy
      this.stopJoystick()
      if (!this.down || p.id !== this.down.id) return
      const panned = this.down.panned
      this.down = undefined
      if (wasJoy || panned || this.opts.paused()) return
      const at = { x: p.worldX / T, y: p.worldY / T }
      if (this.buildMode) this.buildTap({ x: Math.floor(at.x), y: Math.floor(at.y) })
      else this.tapAt(at)
    })
    this.input.on(Phaser.Input.Events.POINTER_WHEEL, (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (!this.opts.paused()) this.zoomBy(dy > 0 ? 0.9 : 1.1)
    })
  }

  private startJoystick(at: { x: number, y: number }): void {
    this.path = []
    this.talkOnArrive = undefined
    const base = this.add
      .circle(at.x, at.y, 46, 0xffffff, 0.18)
      .setStrokeStyle(2, 0xffffff, 0.5)
      .setScrollFactor(0)
      .setDepth(20000)
    const knob = this.add.circle(at.x, at.y, 20, 0xffffff, 0.55).setScrollFactor(0).setDepth(20001)
    this.joy = { start: { x: at.x, y: at.y }, vec: { x: 0, y: 0 }, base, knob }
  }

  private stopJoystick(): void {
    if (!this.joy) return
    this.joy.base.destroy()
    this.joy.knob.destroy()
    this.joy = undefined
  }

  /** Тап по земле — идти туда; по жителю, зданию или вывеске — подойти и заговорить. */
  private tapAt(p: Pos): void {
    const npc = this.camp.npcs.find(n => Math.abs(n.pos.x - p.x) < 0.7 && p.y > n.pos.y - 1.3 && p.y < n.pos.y + 0.5)
    if (npc) return this.walkTo(npc.def.id)
    const plaque = this.places.find((v) => {
      const cx = v.spot.rect.x + v.spot.rect.w / 2
      const cy = v.spot.rect.y + 0.4
      return Math.abs(p.x - cx) * T < v.w / 2 && Math.abs(p.y - cy) * T < v.h / 2
    })
    const place = plaque?.spot ?? this.camp.places.find(({ rect: r }) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h)
    if (place) return this.walkTo(place.id)
    this.talkOnArrive = undefined
    this.path = findVillagePath(this.camp, this.pos, p)
    this.showMarker(this.path[this.path.length - 1])
  }

  /** Подойти к месту и заговорить (тап по зданию, смоук-тесты). */
  walkTo(id: PlaceId): void {
    const spot = spotNear(this.camp, id)
    if (!spot) return
    this.talkOnArrive = id
    if (placeInReach(this.camp, this.pos)?.id === id) {
      this.path = []
      return
    }
    this.path = [...findVillagePath(this.camp, this.pos, spot), spot]
    this.showMarker(spot)
  }

  /** Перенести героя к месту (кнопки нижней панели). */
  teleportTo(id: PlaceId): void {
    const spot = spotNear(this.camp, id)
    if (spot) this.teleport(spot)
  }

  /** Переставить героя (смоук-тесты, отладка, постройка поверх героя). */
  teleport(p: Pos): void {
    if (!heroFits(this.camp, p)) return
    this.pos = { ...p }
    this.path = []
    this.hero?.setPosition(p.x * T, p.y * T).setDepth(p.y * T)
    this.updateNear()
    this.opts.onRest(this.pos, this.facing)
  }

  private showMarker(p: Pos | undefined): void {
    this.marker?.destroy()
    if (!p) return
    const m = this.add.circle(p.x * T, p.y * T, 10, 0xffffff, 0).setStrokeStyle(3, 0xffffff, 0.9).setDepth(-5)
    this.marker = m
    this.tweens.add({ targets: m, scale: 0.4, alpha: 0, duration: 600, onComplete: () => m.destroy() })
  }

  private keyboardVector(): Pos {
    const k = this.keys
    if (!k) return { x: 0, y: 0 }
    const x = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0)
    const y = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0)
    return normalizeInput(x, y)
  }

  /* ---------- Стройка ---------- */

  /** Войти в режим стройки (призрак постройки или снос декора) или выйти из него (`null`). */
  setBuild(mode: BuildMode | null): void {
    if (!this.ready) {
      this.pendingBuild = mode
      return
    }
    this.applyBuild(mode)
  }

  private applyBuild(mode: BuildMode | null): void {
    this.pendingBuild = undefined
    this.clearGhost()
    this.overlay?.destroy()
    this.overlay = undefined
    this.buildMode = mode
    for (const [id, img] of this.buildingImgs) img.setAlpha(mode?.mode === "place" && mode.moving && mode.kind === id ? 0.35 : 1)
    this.path = []
    this.talkOnArrive = undefined
    this.stopJoystick()
    this.setMoving(false)
    if (!mode) {
      this.opts.onPlacement(null)
      this.setupCamera()
      return
    }
    this.setupCamera()
    this.drawOverlay()
    if (mode.mode !== "place") return
    const kind = mode.kind
    const s = this.opts.settlement()
    const heroTile = { x: Math.floor(this.pos.x), y: Math.floor(this.pos.y) }
    const placed = isBuilding(kind) ? s.layout.buildings[kind] : undefined
    const r = footprint(kind, { x: 0, y: 0 })
    const near = { x: heroTile.x - Math.floor(r.w / 2), y: heroTile.y - r.h - 1 }
    const at = (mode.moving && placed) ? { ...placed } : (findSpot(s, kind, near) ?? near)
    this.ghost = { kind, at, gfx: this.add.graphics().setDepth(9250) }
    const token = ++this.ghostToken
    const tex = isBuilding(kind) ? this.buildingTexture(kind, Math.max(1, s.buildings[kind])) : this.decorTex(kind)
    void tex.then(() => {
      if (token !== this.ghostToken || !this.ghost || !sceneAlive(this)) return
      const g = this.ghost
      const key = isBuilding(kind)
        ? texKey.building(kind, Math.max(1, s.buildings[kind]), kind === "fields" ? this.opts.fieldsStage() : 0)
        : decorTexture(kind, g.at.x, g.at.y)
      g.img = this.add.image(0, 0, key).setAlpha(0.72).setDepth(9300)
      this.setGhost(g.at, true)
    })
    this.setGhost(at, true)
  }

  private clearGhost(): void {
    this.ghostToken++
    this.ghost?.img?.destroy()
    this.ghost?.gfx.destroy()
    this.ghost = undefined
  }

  /** Сетка свободных клеток (куда можно ставить) и, в режиме сноса, рамки вокруг декора. */
  private drawOverlay(): void {
    this.overlay?.destroy()
    const g = this.add.graphics().setDepth(-8)
    this.overlay = g
    for (let y = 0; y < VILLAGE_H; y++) {
      for (let x = 0; x < VILLAGE_W; x++) {
        if (this.camp.taken[tileIndex(x, y)]) continue
        g.fillStyle(0xffffff, 0.1).fillRect(x * T + 2, y * T + 2, T - 4, T - 4)
        g.lineStyle(1, 0xffffff, 0.22).strokeRect(x * T + 2, y * T + 2, T - 4, T - 4)
      }
    }
    if (this.buildMode?.mode === "remove") {
      g.setDepth(9250)
      for (const d of this.camp.decor.values()) g.lineStyle(3, 0xe63946, 0.9).strokeRect(d.x * T + 3, d.y * T + 3, T - 6, T - 6)
    }
  }

  /** Поставить призрак на клетку (левый верхний угол участка), показать, можно ли, и сообщить HUD. */
  private setGhost(at: Pos, pan: boolean): void {
    const g = this.ghost
    if (!g) return
    g.at = { ...at }
    const kind = g.kind
    const s = this.opts.settlement()
    const check = canPlace(s, kind, at)
    const r = footprint(kind, at)
    g.gfx.clear()
    const color = check.ok ? 0x52b788 : 0xe63946
    g.gfx.fillStyle(color, 0.38).fillRect(r.x * T, r.y * T, r.w * T, r.h * T)
    g.gfx.lineStyle(3, color, 0.95).strokeRect(r.x * T, r.y * T, r.w * T, r.h * T)
    if (isBuilding(kind)) {
      // Вход: клетка, которая останется свободной
      for (const e of entranceTiles(kind, at)) g.gfx.lineStyle(3, 0xffd166, 0.95).strokeRect(e.x * T + 4, e.y * T + 4, T - 8, T - 8)
      const sh = BUILDING_SHAPES[kind]
      g.img?.setOrigin(0, 1).setPosition(at.x * T, (at.y + sh.h) * T).setDisplaySize(sh.w * T, (sh.h + sh.over) * T)
    }
    else {
      const d = decorDef(kind)
      if (d.walkable) g.img?.setOrigin(0).setPosition(at.x * T, at.y * T).setDisplaySize(T, T)
      else g.img?.setOrigin(0.5, 1).setPosition(at.x * T + T / 2, (at.y + 1) * T).setDisplaySize(T, T * d.h)
    }
    if (pan) this.cameras.main.pan((r.x + r.w / 2) * T, (r.y + r.h / 2) * T, 220, "Sine.easeOut")
    this.opts.onPlacement({ kind, x: at.x, y: at.y, ok: check.ok, ...(check.ok ? {} : { error: check.error }) })
  }

  /** Тап в стройке: декор ставится сразу, здание — призрак переезжает (тапнутая клетка — середина участка). */
  private buildTap(tile: Pos): void {
    const mode = this.buildMode
    if (!mode) return
    if (mode.mode === "remove") return this.opts.onRemoveTap(tile)
    if (!this.ghost) return
    if (!isBuilding(mode.kind)) {
      this.setGhost(tile, false)
      this.opts.onDecorTap(mode.kind, tile)
      return
    }
    const r = footprint(mode.kind, tile)
    this.setGhost({ x: tile.x - Math.floor(r.w / 2), y: tile.y - Math.floor(r.h / 2) }, false)
  }

  /** Призрак — на клетку (смоук-тесты и стрелки клавиатуры). */
  placeGhost(at: Pos): void {
    if (this.ghost) this.setGhost(at, true)
  }

  /* ---------- Кадр ---------- */

  update(_time: number, deltaMs: number): void {
    if (!this.ready || !this.hero) return
    const dt = Math.min(deltaMs, 50) / 1000
    this.animateWater(dt)
    this.alertT += dt
    if (this.alertT > 0.5) {
      this.alertT = 0
      this.syncCamp()
      this.refreshAlerts()
    }
    const paused = this.opts.paused()
    if (this.input.keyboard) this.input.keyboard.enabled = !paused
    if (paused || this.buildMode) {
      this.stopJoystick()
      this.path = []
      this.setMoving(false)
      this.animateHero(dt)
      if (!paused && this.buildMode && this.ghost && this.keys) {
        const k = this.keys
        const J = Phaser.Input.Keyboard.JustDown
        const dx = (J(k.D) || J(k.RIGHT) ? 1 : 0) - (J(k.A) || J(k.LEFT) ? 1 : 0)
        const dy = (J(k.S) || J(k.DOWN) ? 1 : 0) - (J(k.W) || J(k.UP) ? 1 : 0)
        if (dx || dy) this.setGhost({ x: this.ghost.at.x + dx, y: this.ghost.at.y + dy }, true)
      }
      return
    }

    const k = this.keys
    const talkKey = !!k && [k.E, k.SPACE, k.ENTER].some(key => Phaser.Input.Keyboard.JustDown(key))
    if (this.near && talkKey) {
      this.opts.onTalk(this.near)
      return
    }

    let v = this.keyboardVector()
    if (v.x !== 0 || v.y !== 0) {
      this.path = []
      this.talkOnArrive = undefined
    }
    else if (this.joy) v = this.joy.vec
    else if (this.path.length > 0) v = this.followPath(dt)

    const speed = HERO_SPEED * Math.min(1, Math.hypot(v.x, v.y) || 0)
    const dir = normalizeInput(v.x, v.y)
    const from = this.pos
    if (speed > 0) {
      this.pos = moveHero(this.camp, from, dir.x * speed * dt, dir.y * speed * dt)
      this.facing = facingOf(dir.x, dir.y, this.facing)
    }
    const moved = Math.hypot(this.pos.x - from.x, this.pos.y - from.y) > 1e-4
    if (this.path.length > 0 && !moved) {
      this.stuckT += dt
      if (this.stuckT > 0.3) this.path = []
    }
    else this.stuckT = 0
    this.setMoving(moved)
    this.hero.setPosition(this.pos.x * T, this.pos.y * T).setDepth(this.pos.y * T)
    if (moved) this.footsteps(dt)
    this.animateHero(dt)
    this.updateNear()

    if (this.talkOnArrive && this.path.length === 0 && !moved) {
      const id = this.talkOnArrive
      this.talkOnArrive = undefined
      if (placeInReach(this.camp, this.pos)?.id === id) this.opts.onTalk(id)
    }
  }

  private followPath(dt: number): Pos {
    const wp = this.path[0] as Pos
    const dx = wp.x - this.pos.x
    const dy = wp.y - this.pos.y
    const d = Math.hypot(dx, dy)
    if (d < 0.06) {
      this.path.shift()
      return this.path.length > 0 ? this.followPath(dt) : { x: 0, y: 0 }
    }
    // У последней точки тормозим, чтобы не перескочить
    const k = this.path.length === 1 ? Math.min(1, d / (HERO_SPEED * dt)) : 1
    return { x: (dx / d) * k, y: (dy / d) * k }
  }

  private setMoving(on: boolean): void {
    if (this.moving && !on) this.opts.onRest(this.pos, this.facing)
    if (!this.moving && on) this.walkT = 0
    this.moving = on
  }

  private animateHero(dt: number): void {
    if (!this.hero) return
    if (this.moving) {
      this.walkT += dt
      const frame = Math.floor(this.walkT * 8) % HERO_WALK_FRAMES
      this.hero.setTexture(heroArtKey({ facing: this.facing, pose: "walk", frame }))
    }
    else {
      this.idleT += dt
      const frame = Math.floor(this.idleT * 1.6) % HERO_IDLE_FRAMES
      this.hero.setTexture(heroArtKey({ facing: this.facing, pose: "idle", frame }))
    }
  }

  private footsteps(dt: number): void {
    this.stepT += dt
    if (this.stepT < 0.26) return
    this.stepT = 0
    const tx = Math.floor(this.pos.x)
    const ty = Math.floor(this.pos.y)
    const paved = villageTile(tx, ty) === "path" || this.camp.decor.get(tileIndex(tx, ty))?.id === "path"
    stepFx(this, this.pos.x * T, this.pos.y * T, T * 0.8, paved ? "plain" : "forest", "yard")
  }

  private animateWater(dt: number): void {
    if (WATER_FRAMES < 2 || this.water.length === 0) return
    this.waterT += dt
    const frame = Math.floor(this.waterT * 4) % WATER_FRAMES
    const key = texKey.water(frame)
    if (this.water[0]?.texture.key !== key) for (const w of this.water) w.setTexture(key)
  }

  private updateNear(): void {
    const near = this.buildMode ? undefined : placeInReach(this.camp, this.pos)?.id
    if (near === this.near) return
    this.near = near
    for (const v of this.places) {
      const on = v.spot.id === near
      v.prompt.setVisible(on && !this.opts.touch)
      const npc = v.npc
      if (npc) {
        npc.img.setTexture(texKey.npc(npc.def.id, on ? "happy" : "idle"))
        // Житель поворачивается к герою
        npc.img.setFlipX(on && this.pos.x < (v.spot.npc?.pos.x ?? 0))
      }
    }
    this.opts.onNear(near)
  }

  private refreshAlerts(): void {
    const alerts = this.opts.alerts()
    const guide = this.opts.guide()
    for (const v of this.places) {
      v.badge.setVisible(alerts[v.spot.id])
      v.arrow.setVisible(v.spot.id === guide)
      if (this.guided !== guide) this.drawPlaque(v, v.spot.id === guide)
    }
    this.guided = guide
  }
}
