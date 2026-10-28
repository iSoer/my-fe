import Phaser from "phaser"
import type { BuildingId, Facing, HeroSpot, Pos } from "@game/core/types"
import {
  facingOf,
  findPath,
  heroFits,
  moveHero,
  normalizeInput,
  placeInReach,
  settlementTile
} from "@game/core/settlement/walk"
import {
  HERO_SPEED,
  HERO_START,
  NPCS,
  PLOTS,
  SCREEN_W,
  SETTLEMENT_H,
  SETTLEMENT_W,
  SORTIE_GATE,
  placeFront,
  type NpcDef,
  type PlaceId,
  type PlotDef
} from "@game/content/settlement"
import type { PlaceSign } from "@game/state/settlement"
import { critterSvg, eyeArt, furArt, tileSvg } from "@game/art/index"
import { TILE_FRAME_COUNT } from "@game/art/tile"
import { HERO_ANCHOR, HERO_IDLE_FRAMES, HERO_VIEW, HERO_WALK_FRAMES, heroArtKey, heroSvg } from "@game/art/hero"
import {
  GATE_H,
  GRAVEYARD_H_OVER,
  HOUSE_ROOF_OVER,
  PLOT_H,
  TRAINING_H,
  TREE_H,
  villageFlowersSvg,
  villageGateSvg,
  villageGraveyardSvg,
  villageHouseSvg,
  villagePathSvg,
  villagePlotSvg,
  villageTrainingSvg,
  villageTreeSvg
} from "@game/art/village"
import { ensureTexture } from "../svgTextures"
import { ensureTextures } from "../textures"
import { textStyle } from "../style"
import { stepFx, reducedMotion } from "../motionFx"
import { sceneAlive } from "../fx"
import { tr } from "@game/i18n"

export const SETTLEMENT_SCENE_KEY = "settlement"

/** Клетка поселения на экране (мировые пиксели); текстуры растеризуются вдвое крупнее ради чёткости. */
const T = 48
const RES = 2
const FACINGS: readonly Facing[] = ["down", "up", "left", "right"]
const WATER_FRAMES = TILE_FRAME_COUNT.water ?? 1
/** Высота героя и жителей на экране (в клетках). */
const HERO_H = 1.2
const NPC_W = 1.25
/** Сколько рядов «за околицей» дорисовано под воротами (не проходимо): дорога уходит из поселения. */
const OUTSIDE_ROWS = 1
/** Ворота как место для тапа и вывески: арка над клетками `G`. */
const GATE_RECT = { x: SORTIE_GATE.x, y: SORTIE_GATE.y - 1.3, w: SORTIE_GATE.w, h: 2.3 }

export interface SettlementSceneOptions {
  start: HeroSpot | undefined
  /** Вывески мест (и построено ли здание) — опрашиваются раз в полсекунды. */
  signs: () => Record<PlaceId, PlaceSign>
  /** Сколько экранных пикселей сверху и снизу заняты HUD: карта по высоте вписывается между ними. */
  insets: () => { top: number, bottom: number }
  /** Сцена на паузе, пока открыта карточка места. */
  paused: () => boolean
  /** Устройство без клавиатуры: подсказку «E — открыть» не показываем, есть панель мест. */
  touch: boolean
  onNear: (id: PlaceId | undefined) => void
  onOpen: (id: PlaceId) => void
  /** Герой остановился — запомнить позицию в сейве. */
  onRest: (pos: Pos, facing: Facing) => void
}

interface NpcView {
  def: NpcDef
  img: Phaser.GameObjects.Image
  label: Phaser.GameObjects.Text
  tween?: Phaser.Tweens.Tween
}

/** Участок: спрайт здания и пустого места (виден один из них). */
interface PlotView {
  def: PlotDef
  building?: Phaser.GameObjects.Image
  lot: Phaser.GameObjects.Image
}

/** Вывеска места: плашка «название + состояние», значок «!» и стрелка следующего шага. */
interface SignView {
  id: PlaceId
  plaque: Phaser.GameObjects.Container
  frame: Phaser.GameObjects.Graphics
  w: number
  h: number
  badge: Phaser.GameObjects.Container
  arrow: Phaser.GameObjects.Text
  /** Что нарисовано сейчас: перерисовываем, только если вывеска изменилась. */
  drawn: string
}

type Keys = Record<"W" | "A" | "S" | "D" | "UP" | "DOWN" | "LEFT" | "RIGHT" | "E" | "SPACE" | "ENTER", Phaser.Input.Keyboard.Key>

const texKey = {
  grass: (v: number) => `st:grass:${v}`,
  path: (v: number) => `st:path:${v}`,
  flowers: (v: number) => `st:flowers:${v}`,
  water: (f: number) => `st:water:${f}`,
  bush: "st:bush",
  tree: (v: number) => `st:tree:${v}`,
  gate: "st:gate",
  building: (id: string) => `st:building:${id}`,
  lot: (id: string) => `st:lot:${id}`,
  npc: (id: string, pose: string) => `st:npc:${id}:${pose}`
}

const hash = (x: number, y: number): number => ((x * 73856093) ^ (y * 19349663)) >>> 0

/** Спрайт здания: svg и сколько клеток он поднимается над участком (крыша, мишень, надгробия). */
function buildingArt(id: BuildingId, p: PlotDef): { svg: string, over: number } {
  switch (id) {
    case "barracks":
      return { svg: villageHouseSvg({ w: p.w, h: p.h, roof: "#8c3b2e", wall: "#d9b48a", npc: "barracks" }), over: HOUSE_ROOF_OVER }
    case "store":
      return { svg: villageHouseSvg({ w: p.w, h: p.h, roof: "#2f6b4f", wall: "#e3c89b", npc: "store" }), over: HOUSE_ROOF_OVER }
    case "training":
      return { svg: villageTrainingSvg(p.w), over: TRAINING_H - p.h }
    case "graveyard":
      return { svg: villageGraveyardSvg(p.w, p.h), over: GRAVEYARD_H_OVER }
  }
}

const SUB_COLOR: Record<PlaceSign["status"], string> = {
  occupied: "#6d4c2f",
  available: "#2f7a1f",
  free: "#8a5f0a",
  locked: "#6b6672",
  gate: "#6d4c2f"
}

export class SettlementScene extends Phaser.Scene {
  private readonly opts: SettlementSceneOptions
  private pos: Pos
  private facing: Facing
  private hero?: Phaser.GameObjects.Image
  private npcs: NpcView[] = []
  /** Жители, которые сейчас стоят на карте (у построенных зданий): с ними сталкивается герой. */
  private active: NpcDef[] = []
  private plots: PlotView[] = []
  private signs: SignView[] = []
  private water: Phaser.GameObjects.Image[] = []
  private keys?: Keys
  private path: Pos[] = []
  /** Место, карточку которого открыть, когда герой дойдёт по тапу. */
  private openOnArrive: PlaceId | undefined
  private near: PlaceId | undefined
  private prompt?: Phaser.GameObjects.Text
  private moving = false
  private walkT = 0
  private idleT = 0
  private stepT = 0
  private stuckT = 0
  private signT = 0
  private waterT = 0
  private ready = false
  private joy?: { start: Pos, vec: Pos, base: Phaser.GameObjects.Arc, knob: Phaser.GameObjects.Arc }
  private down?: { x: number, y: number, id: number }
  private marker?: Phaser.GameObjects.Arc
  /** Камера: масштаб, вписана ли карта по высоте и куда она сейчас смотрит (мировые пиксели). */
  private view = { zoom: 1, fitsH: true, x: 0, y: 0, snap: true }

  constructor(opts: SettlementSceneOptions) {
    super({ key: SETTLEMENT_SCENE_KEY })
    this.opts = opts
    this.pos = opts.start ? { ...opts.start.pos } : { ...HERO_START }
    this.facing = opts.start?.facing ?? "up"
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#2f6d2c")
    // Общие текстуры частиц (пыль шагов и т. п.)
    ensureTextures(this)
    void this.loadTextures().then(() => {
      if (!sceneAlive(this)) return
      this.build()
      this.ready = true
    })
  }

  /* ---------- Текстуры ---------- */

  private loadTextures(): Promise<unknown> {
    const t = (key: string, svg: string, w: number, h: number) => ensureTexture(this, key, svg, w * RES, h * RES)
    const jobs: Promise<string>[] = []
    for (let v = 0; v < 3; v++) jobs.push(t(texKey.grass(v), tileSvg("yard", "plain", 0, v), T, T))
    for (let v = 0; v < 4; v++) {
      jobs.push(t(texKey.path(v), villagePathSvg(v), T, T))
      jobs.push(t(texKey.flowers(v), villageFlowersSvg(v), T, T))
    }
    for (let f = 0; f < WATER_FRAMES; f++) jobs.push(t(texKey.water(f), tileSvg("yard", "water", f, 0), T, T))
    jobs.push(t(texKey.bush, tileSvg("yard", "forest", 0, 0), T, T))
    for (let v = 0; v < 3; v++) jobs.push(t(texKey.tree(v), villageTreeSvg(v), T, T * TREE_H))
    jobs.push(t(texKey.gate, villageGateSvg(SORTIE_GATE.w), SORTIE_GATE.w * T, T * GATE_H))
    for (const p of PLOTS) {
      jobs.push(t(texKey.lot(p.id), villagePlotSvg(p.w, !p.building), p.w * T, PLOT_H * T))
      if (!p.building) continue
      const art = buildingArt(p.building, p)
      jobs.push(t(texKey.building(p.id), art.svg, p.w * T, (p.h + art.over) * T))
    }
    for (const n of NPCS) {
      for (const pose of ["idle", "happy"] as const) {
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
    return Promise.all(jobs)
  }

  /* ---------- Сборка мира ---------- */

  private build(): void {
    for (let y = 0; y < SETTLEMENT_H; y++) {
      for (let x = 0; x < SETTLEMENT_W; x++) {
        const tile = settlementTile(x, y)
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
      }
    }
    // За околицей: луг, дорога уходит от ворот на юг, редкие деревья по краям
    const road = SORTIE_GATE.x + Math.floor(SORTIE_GATE.w / 2)
    for (let y = SETTLEMENT_H; y < SETTLEMENT_H + OUTSIDE_ROWS; y++) {
      for (let x = 0; x < SETTLEMENT_W; x++) {
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
    for (const def of PLOTS) {
      const bottom = (def.y + def.h) * T
      const lot = this.add
        .image(def.x * T, bottom, texKey.lot(def.id))
        .setOrigin(0, 1)
        .setDisplaySize(def.w * T, def.h * T)
        .setDepth(bottom)
      const view: PlotView = { def, lot }
      if (def.building) {
        const { over } = buildingArt(def.building, def)
        view.building = this.add
          .image(def.x * T, bottom, texKey.building(def.id))
          .setOrigin(0, 1)
          .setDisplaySize(def.w * T, (def.h + over) * T)
          .setDepth(bottom)
          .setVisible(false)
      }
      this.plots.push(view)
    }
    const gateBottom = (SORTIE_GATE.y + 1) * T
    this.add
      .image(SORTIE_GATE.x * T, gateBottom, texKey.gate)
      .setOrigin(0, 1)
      .setDisplaySize(SORTIE_GATE.w * T, T * GATE_H)
      .setDepth(gateBottom)
    for (const def of NPCS) this.npcs.push(this.makeNpc(def))
    for (const p of PLOTS) this.signs.push(this.makeSign(p.id))
    this.signs.push(this.makeSign("gate"))

    const heroH = T * HERO_H
    this.hero = this.add
      .image(this.pos.x * T, this.pos.y * T, heroArtKey({ facing: this.facing }))
      .setOrigin(0.5, HERO_ANCHOR.y)
      .setDisplaySize((heroH * HERO_VIEW.w) / HERO_VIEW.h, heroH)
    this.prompt = this.add
      .text(0, 0, tr("E / Space — open", "E / Пробел — открыть"), {
        ...textStyle(11, "#15121a", true, 0),
        backgroundColor: "#ffffffdd",
        padding: { x: 6, y: 3 }
      })
      .setOrigin(0.5, 0)
      .setResolution(2)
      .setDepth(10002)
      .setVisible(false)

    this.refreshSigns()
    // Сохранённая позиция могла оказаться на месте жителя или в стене (сменилась карта) — тогда на старт
    if (!heroFits(this.pos, this.active)) this.pos = { ...HERO_START }
    this.hero.setPosition(this.pos.x * T, this.pos.y * T).setDepth(this.pos.y * T)

    this.setupInput()
    this.setupCamera()
    this.scale.on(Phaser.Scale.Events.RESIZE, this.setupCamera, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.setupCamera, this)
      this.opts.onRest(this.pos, this.facing)
    })
    this.updateNear()
    this.updateCamera(0)
  }

  private makeNpc(def: NpcDef): NpcView {
    const w = T * NPC_W
    const h = (w * 140) / 120
    const x = def.pos.x * T
    const y = def.pos.y * T
    const img = this.add.image(x, y + h * 0.14, texKey.npc(def.id, "idle")).setOrigin(0.5, 1).setDisplaySize(w, h).setDepth(y)
    // Назначение места — на вывеске здания; над жителем только имя
    const label = this.add
      .text(x, y - h * 0.78, def.name, textStyle(12, "#ffffff", true, 3))
      .setOrigin(0.5, 1)
      .setResolution(2)
      .setDepth(9000)
    const view: NpcView = { def, img, label }
    if (!reducedMotion()) {
      const duration = 900 + (hash(Math.round(def.pos.x * 10), 3) % 300)
      view.tween = this.tweens.add({ targets: img, y: img.y - 2, duration, yoyo: true, repeat: -1, ease: "Sine.easeInOut" })
    }
    return view
  }

  /** Прямоугольник места в клетках (здание с крышей или пустой участок; у ворот — арка): тап и вывеска. */
  private placeRect(id: PlaceId): { x: number, y: number, w: number, h: number } {
    if (id === "gate") return GATE_RECT
    const v = this.plots.find(p => p.def.id === id) as PlotView
    const { def } = v
    const over = def.building && v.building?.visible ? buildingArt(def.building, def).over : 0
    return { x: def.x, y: def.y - over, w: def.w, h: def.h + over }
  }

  private makeSign(id: PlaceId): SignView {
    const frame = this.add.graphics()
    const plaque = this.add.container(0, 0, [frame]).setDepth(9500)
    const badgeBg = this.add.circle(0, 0, 13, 0xe63946).setStrokeStyle(3, 0xffffff)
    const badgeText = this.add.text(0, 0, "!", textStyle(17, "#ffffff", true, 0)).setOrigin(0.5).setResolution(2)
    const badge = this.add.container(0, 0, [badgeBg, badgeText]).setDepth(9501).setVisible(false)
    const arrow = this.add
      .text(0, 0, "▼", { ...textStyle(26, "#ffd166", true, 5), stroke: "#3b2614" })
      .setOrigin(0.5, 1)
      .setResolution(2)
      .setDepth(9502)
      .setVisible(false)
    if (!reducedMotion()) {
      this.tweens.add({ targets: badge, scale: 1.15, duration: 520, yoyo: true, repeat: -1, ease: "Sine.easeInOut" })
      this.tweens.add({ targets: arrow, alpha: 0.55, duration: 480, yoyo: true, repeat: -1, ease: "Sine.easeInOut" })
    }
    return { id, plaque, frame, w: 0, h: 0, badge, arrow, drawn: "" }
  }

  /** Перерисовать вывеску: плашка над зданием — это и есть пункт меню поселения (тап ведёт туда героя). */
  private drawSign(v: SignView, s: PlaceSign): void {
    const key = `${s.title}|${s.sub}|${s.status}|${s.guide}|${s.built}`
    if (key === v.drawn) return
    v.drawn = key
    v.plaque.each((o: Phaser.GameObjects.GameObject) => {
      if (o !== v.frame) o.destroy()
    })
    const title = this.add.text(0, -8, s.title, textStyle(17, "#3b2614", true, 0)).setOrigin(0.5).setResolution(2)
    const sub = this.add.text(0, 12, s.sub, textStyle(13, SUB_COLOR[s.status], true, 0)).setOrigin(0.5).setResolution(2)
    v.plaque.add([title, sub])
    v.w = Math.max(title.width, sub.width) + 24
    v.h = 50
    const r = this.placeRect(v.id)
    const x = (r.x + r.w / 2) * T
    const y = (r.y + 0.55) * T
    v.plaque.setPosition(x, y)
    v.badge.setPosition(x + v.w / 2 - 4, y - v.h / 2 + 2)
    v.arrow.setPosition(x, y - v.h / 2 - 4)
    const { frame, w, h } = v
    frame.clear()
    frame.fillStyle(0x000000, 0.25).fillRoundedRect(-w / 2 + 2, -h / 2 + 4, w, h, 10)
    frame.fillStyle(s.built ? 0xf3e2c0 : 0xe2d6bf, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 10)
    frame.lineStyle(s.guide ? 4 : 3, s.guide ? 0xffb703 : 0x5a3b22, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 10)
  }

  /** Здания, жители и вывески по текущему сейву: построили или улучшили — карта меняется сразу. */
  private refreshSigns(): void {
    const signs = this.opts.signs()
    for (const p of this.plots) {
      const built = !!signs[p.def.id]?.built
      p.building?.setVisible(built)
      p.lot.setVisible(!built)
      // Место, где можно строить, мягко подсвечено
      if (signs[p.def.id]?.status === "available") p.lot.setTint(0xfff1b8)
      else if (signs[p.def.id]?.status === "locked") p.lot.setTint(0xb8b4ae)
      else p.lot.clearTint()
    }
    const active: NpcDef[] = []
    for (const n of this.npcs) {
      const on = !!signs[n.def.place]?.built
      n.img.setVisible(on)
      n.label.setVisible(on)
      if (on) active.push(n.def)
    }
    // Житель появился там, где стоит герой (здание построили) — герой отходит к входу, чтобы не застрять
    const fresh = active.filter(n => !this.active.includes(n))
    this.active = active
    if (this.hero && fresh.length > 0 && !heroFits(this.pos, active)) this.teleport(fresh[0]?.place as PlaceId)
    for (const v of this.signs) {
      const s = signs[v.id]
      if (!s) continue
      this.drawSign(v, s)
      v.badge.setVisible(s.alert)
      v.arrow.setVisible(s.guide)
    }
  }

  /* ---------- Камера ---------- */

  /**
   * Масштаб: по ширине на экране помещается `SCREEN_W` клеток (карта — три экрана), по высоте — вся карта между
   * верхней панелью и нижней. На очень низком экране, где карта не влезла бы мельче 0.55, камера идёт за героем
   * и по вертикали.
   */
  private setupCamera(): void {
    const { top, bottom } = this.opts.insets()
    const worldH = (SETTLEMENT_H + OUTSIDE_ROWS) * T + T * 0.5
    const availH = Math.max(1, this.scale.height - top - bottom)
    const fit = Math.min(this.scale.width / (SCREEN_W * T), availH / worldH)
    this.view.zoom = Phaser.Math.Clamp(fit, 0.55, 1.6)
    this.view.fitsH = availH / worldH >= 0.55
    this.view.snap = true
    this.cameras.main.setZoom(this.view.zoom)
  }

  private updateCamera(dt: number): void {
    const cam = this.cameras.main
    const { zoom } = this.view
    const { top, bottom } = this.opts.insets()
    const worldW = SETTLEMENT_W * T
    // Сверху — полклетки на крону деревьев первого ряда
    const worldTop = -T * 0.5
    const worldH = (SETTLEMENT_H + OUTSIDE_ROWS) * T - worldTop
    const viewW = this.scale.width / zoom
    const viewH = this.scale.height / zoom
    const hx = this.pos.x * T
    const hy = this.pos.y * T
    const x = viewW >= worldW ? worldW / 2 : Phaser.Math.Clamp(hx, viewW / 2, worldW - viewW / 2)
    // Центр видимой области смещён вниз на top и вверх на bottom
    const y = this.view.fitsH
      ? worldTop + worldH / 2 - (top - bottom) / 2 / zoom
      : Phaser.Math.Clamp(hy, worldTop + viewH / 2 - top / zoom, worldTop + worldH - viewH / 2 + bottom / zoom)
    if (this.view.snap || reducedMotion()) {
      this.view.x = x
      this.view.y = y
      this.view.snap = false
    }
    else {
      const k = Math.min(1, dt * 6)
      this.view.x += (x - this.view.x) * k
      this.view.y += (y - this.view.y) * k
    }
    cam.centerOn(this.view.x, this.view.y)
  }

  /* ---------- Ввод ---------- */

  private setupInput(): void {
    const kb = this.input.keyboard
    if (kb) this.keys = kb.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,E,SPACE,ENTER") as Keys
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.opts.paused()) return
      this.down = { x: p.x, y: p.y, id: p.id }
    })
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (!this.down || !p.isDown || p.id !== this.down.id || this.opts.paused()) return
      const dx = p.x - this.down.x
      const dy = p.y - this.down.y
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
      const wasJoy = !!this.joy
      this.stopJoystick()
      if (!this.down || p.id !== this.down.id) return
      this.down = undefined
      if (wasJoy || this.opts.paused()) return
      this.tapAt({ x: p.worldX / T, y: p.worldY / T })
    })
  }

  private startJoystick(at: { x: number, y: number }): void {
    this.path = []
    this.openOnArrive = undefined
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

  /** Тап по земле — идти туда; по жителю, зданию или его вывеске — подойти и открыть карточку места. */
  private tapAt(p: Pos): void {
    const npc = this.active.find(n => Math.abs(n.pos.x - p.x) < 0.7 && p.y > n.pos.y - 1.3 && p.y < n.pos.y + 0.5)
    if (npc) return this.walkTo(npc.place)
    const place = [...PLOTS.map(pl => pl.id), "gate"].find((id) => {
      const r = this.placeRect(id)
      return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
    })
    if (place) return this.walkTo(place)
    this.openOnArrive = undefined
    this.path = findPath(this.pos, p, this.active)
    this.showMarker(this.path[this.path.length - 1])
  }

  /** Подойти к месту и открыть его карточку (тап по зданию, смоук-тесты). */
  walkTo(id: PlaceId): void {
    const front = placeFront(id)
    if (!front) return
    this.openOnArrive = id
    if (placeInReach(this.pos) === id) {
      this.path = []
      return
    }
    this.path = [...findPath(this.pos, front, this.active), front]
    this.showMarker(front)
  }

  /** Переставить героя к входу в место (панель мест, смоук-тесты); камера переезжает сразу. */
  teleport(id: PlaceId): void {
    const front = placeFront(id)
    if (!front || !heroFits(front, this.active)) return
    this.pos = { ...front }
    this.path = []
    this.openOnArrive = undefined
    this.hero?.setPosition(front.x * T, front.y * T).setDepth(front.y * T)
    this.view.snap = true
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

  /* ---------- Кадр ---------- */

  update(_time: number, deltaMs: number): void {
    if (!this.ready || !this.hero) return
    const dt = Math.min(deltaMs, 50) / 1000
    this.animateWater(dt)
    this.signT += dt
    if (this.signT > 0.5) {
      this.signT = 0
      this.refreshSigns()
    }
    const paused = this.opts.paused()
    if (this.input.keyboard) this.input.keyboard.enabled = !paused
    if (paused) {
      this.stopJoystick()
      this.path = []
      this.openOnArrive = undefined
      this.setMoving(false)
      this.animateHero(dt)
      this.updateCamera(dt)
      return
    }

    const k = this.keys
    const openKey = !!k && [k.E, k.SPACE, k.ENTER].some(key => Phaser.Input.Keyboard.JustDown(key))
    if (this.near && openKey) {
      this.opts.onOpen(this.near)
      return
    }

    let v = this.keyboardVector()
    if (v.x !== 0 || v.y !== 0) {
      this.path = []
      this.openOnArrive = undefined
    }
    else if (this.joy) v = this.joy.vec
    else if (this.path.length > 0) v = this.followPath(dt)

    const speed = HERO_SPEED * Math.min(1, Math.hypot(v.x, v.y) || 0)
    const dir = normalizeInput(v.x, v.y)
    const from = this.pos
    if (speed > 0) {
      this.pos = moveHero(from, dir.x * speed * dt, dir.y * speed * dt, this.active)
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
    this.updateCamera(dt)

    if (this.openOnArrive && this.path.length === 0 && !moved) {
      const id = this.openOnArrive
      this.openOnArrive = undefined
      if (placeInReach(this.pos) === id) this.opts.onOpen(id)
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
    const tile = settlementTile(Math.floor(this.pos.x), Math.floor(this.pos.y))
    stepFx(this, this.pos.x * T, this.pos.y * T, T * 0.8, tile === "path" ? "plain" : "forest", "yard")
  }

  private animateWater(dt: number): void {
    if (WATER_FRAMES < 2 || this.water.length === 0) return
    this.waterT += dt
    const frame = Math.floor(this.waterT * 4) % WATER_FRAMES
    const key = texKey.water(frame)
    if (this.water[0]?.texture.key !== key) for (const w of this.water) w.setTexture(key)
  }

  private updateNear(): void {
    const near = placeInReach(this.pos)
    if (this.prompt) {
      this.prompt.setVisible(!!near && !this.opts.touch)
      this.prompt.setPosition(this.pos.x * T, this.pos.y * T + 10)
    }
    if (near === this.near) return
    this.near = near
    for (const n of this.npcs) {
      const on = n.def.place === near
      n.img.setTexture(texKey.npc(n.def.id, on ? "happy" : "idle"))
      // Житель поворачивается к герою
      n.img.setFlipX(on && this.pos.x < n.def.pos.x)
    }
    this.opts.onNear(near)
  }
}
