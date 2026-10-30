import Phaser from "phaser"
import type { BuildingId, Facing, HeroSpot, Pos } from "@game/core/types"
import {
  facingOf,
  findPath,
  heroFits,
  moveHero,
  normalizeInput,
  placeInReach,
  settlementTile,
  type Blocker
} from "@game/core/settlement/walk"
import { FISHER_MUTTERS } from "@game/content/dialogues"
import {
  FISHER,
  GOSSIPS,
  HERO_SPEED,
  MUTTER_TIMING,
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
import { BUILDING_MAX_LEVEL } from "@game/content/settlement"
import { TILE_FRAME_COUNT } from "@game/art/tile"
import { HERO_ANCHOR, HERO_IDLE_FRAMES, HERO_VIEW, HERO_WALK_FRAMES, heroArtKey, heroSvg } from "@game/art/hero"
import {
  GATE_H,
  GRAVEYARD_H_OVER,
  HOUSE_ROOF_OVER,
  PALISADE_H,
  PLOT_H,
  TORCH_H,
  TRAINING_H,
  TREE_H,
  TREE_VARIANTS,
  villageBuildingSvg,
  villageBushSvg,
  villageGateSvg,
  villageGrassSvg,
  villagePalisadeSideSvg,
  villagePalisadeSvg,
  villagePathSvg,
  villagePlotSvg,
  villageSpikesSvg,
  villageTorchSvg,
  villageTreeSvg,
  villageWeedsSvg
} from "@game/art/village"
import { ensureTexture } from "../svgTextures"
import { initHiDpiScene, pinToScreen, renderScaleOf, setCssZoom, viewH as cssViewH, viewW as cssViewW } from "../hidpi"
import { settlementRes, textRes } from "../renderScale"
import { ensureTextures } from "../textures"
import { textStyle } from "../style"
import { SpeechBubbles } from "./speech"
import { Gossips } from "./gossips"
import { stepFx, reducedMotion } from "../motionFx"
import { sceneAlive } from "../fx"
import { tr } from "@game/i18n"
import { SIGN_ICONS, ensureIconTextures, richText } from "../iconText"

export const SETTLEMENT_SCENE_KEY = "settlement"

/**
 * Клетка поселения в мировых (CSS) пикселях. Текстуры растеризуются крупнее ради чёткости: множитель `res` —
 * 2, а при высокой плотности рендера — до 3 (`settlementRes`).
 */
const T = 48
/** Сколько раз пробовать растеризовать текстуру уровня здания, прежде чем оставить прежнюю. */
const BUILDING_RETRIES = 3
const FACINGS: readonly Facing[] = ["down", "up", "left", "right"]
const WATER_FRAMES = TILE_FRAME_COUNT.water ?? 1
/** Высота героя и жителей на экране (в клетках). */
const HERO_H = 1.2
/** Через сколько секунд простоя герой снимает капюшон (под ним белый котёнок). */
const HOOD_OFF_AFTER = 5
/** Пошёл без капюшона — надевает его через столько секунд ходьбы (остановился раньше — отсчёт заново). */
const HOOD_ON_AFTER = 3
/** Котёнок без капюшона моргает раз в столько секунд (от и до), моргание длится `BLINK_S`. */
const BLINK_EVERY = [2.5, 5] as const
const BLINK_S = 0.14
const NPC_W = 1.25
/** Сколько рядов «за околицей» дорисовано под воротами (не проходимо): дорога уходит из поселения. */
const OUTSIDE_ROWS = 1
/** Вариантов фактур земли и частокола: клетки берут вариант по хэшу координат, чтобы поле не выглядело плиткой. */
const GROUND_VARIANTS = 4
const FENCE_VARIANTS = 5
/** Факелы на частоколе (клетка стены, к которой прибит факел): по верхней и нижней стене и по бокам. */
const TORCHES: readonly Pos[] = [
  { x: 6, y: 0 }, { x: 13, y: 0 }, { x: 21, y: 0 }, { x: 28, y: 0 },
  { x: 7, y: SETTLEMENT_H - 1 }, { x: 25, y: SETTLEMENT_H - 1 },
  { x: 0, y: 7 }, { x: SETTLEMENT_W - 1, y: 6 }
]
/** Где за оградой в темноте иногда загораются глаза (клетки ряда за околицей; x — колонка). */
const EYES_X: readonly number[] = [3, 9, 23, 29]
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
  /** Заговорить с жителем: true — разговор открыт; false — диалоги выключены, тап ведёт к месту жителя. */
  canTalk: (npcId: string) => boolean
  onTalk: (npcId: string) => void
  /** Жители с новой сюжетной сценой — «!» над головой (опрашивается вместе с вывесками). */
  npcAlerts: () => Record<string, boolean>
  /** Герой остановился — запомнить позицию в сейве. */
  onRest: (pos: Pos, facing: Facing) => void
}

/** Факел: огонь мерцает свечением поверх (аддитивно). */
interface TorchView {
  glow: Phaser.GameObjects.Image
  phase: number
}

/** Пара глаз в темноте за оградой: загорается, моргает и гаснет. */
interface EyesView {
  img: Phaser.GameObjects.Container
  /** Исходная x: каждый раз глаза смещаются от неё, а не от прошлого места (иначе уползают). */
  baseX: number
  /** Когда загорятся в следующий раз (секунды сцены). */
  next: number
}

interface NpcView {
  def: NpcDef
  img: Phaser.GameObjects.Image
  label: Phaser.GameObjects.Text
  /** Пузырь «!»: у жителя новая сюжетная сцена. */
  story: Phaser.GameObjects.Container
  tween?: Phaser.Tweens.Tween
}

/** Рыбак у пруда: спрайт, удочка с поплавком и облачко бубнежа. */
interface FisherView {
  img: Phaser.GameObjects.Image
  float: Phaser.GameObjects.Arc
  /** Точка над именем — под хвостик облачка (мировые пиксели). */
  head: Pos
  /** Через сколько секунд следующая реплика. */
  nextT: number
  /** Реплики вразнобой без повторов подряд: очередь перемешанных номеров и последняя показанная. */
  queue: number[]
  lastLine?: number
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
  weeds: (v: number) => `st:weeds:${v}`,
  water: (f: number) => `st:water:${f}`,
  bush: (v: number) => `st:bush:${v}`,
  tree: (v: number) => `st:tree:${v}`,
  fence: (v: number) => `st:fence:${v}`,
  fenceSide: (side: "left" | "right", v: number) => `st:fence:${side}:${v}`,
  torch: "st:torch",
  spikes: (v: number) => `st:spikes:${v}`,
  glow: "st:glow",
  gate: "st:gate",
  building: (id: string, level: number) => `st:building:${id}:${level}`,
  lot: (id: string) => `st:lot:${id}`,
  npc: (id: string, pose: string) => `st:npc:${id}:${pose}`
}

const hash = (x: number, y: number): number => ((x * 73856093) ^ (y * 19349663)) >>> 0

/** Сколько клеток спрайт здания поднимается над участком (крыша, мишень, крест). */
function buildingOver(id: BuildingId, p: PlotDef): number {
  switch (id) {
    case "barracks":
    case "store":
    case "tavern":
      return HOUSE_ROOF_OVER
    case "training":
      return TRAINING_H - p.h
    case "graveyard":
      return GRAVEYARD_H_OVER
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
  private fisher?: FisherView
  /** Облачки реплик рыбака и сплетников. */
  private speech = new SpeechBubbles(this, () => this.view.zoom)
  /** Киса Эльман и пёс Ваня: болтают цитатами, переходят с места на место, взрываются от тапов. */
  private gossips?: Gossips
  /** Жители, которые сейчас стоят на карте (у построенных зданий): с ними сталкивается герой. */
  private active: NpcDef[] = []
  private plots: PlotView[] = []
  private signs: SignView[] = []
  private water: Phaser.GameObjects.Image[] = []
  private torches: TorchView[] = []
  private eyes: EyesView[] = []
  /** Попытки догрузить текстуру здания по ключу: −1 — грузится сейчас. */
  private buildingTries = new Map<string, number>()
  /** Время сцены для мерцания факелов и глаз, с. */
  private fxT = 0
  private keys?: Keys
  private path: Pos[] = []
  /** Место, карточку которого открыть, когда герой дойдёт по тапу. */
  private openOnArrive: PlaceId | undefined
  /** Житель, с которым заговорить, когда герой подойдёт. */
  private talkOnArrive: NpcDef | undefined
  private near: PlaceId | undefined
  private prompt?: Phaser.GameObjects.Text
  private moving = false
  private walkT = 0
  private idleT = 0
  /** Сколько секунд герой стоит на месте; капюшон снят и когда котёнок моргнёт в следующий раз. */
  private restT = 0
  private hoodOff = false
  /** Сколько ещё идти без капюшона, прежде чем надеть его. */
  private hoodOnT = 0
  private blinkAt = 0
  private stepT = 0
  private stuckT = 0
  private signT = 0
  private waterT = 0
  private ready = false
  private joy?: { start: Pos, vec: Pos, base: Phaser.GameObjects.Arc, knob: Phaser.GameObjects.Arc }
  private down?: { x: number, y: number, id: number }
  private marker?: Phaser.GameObjects.Arc
  /** Камера: масштаб, вписана ли карта по высоте и куда она сейчас смотрит (мировые пиксели). */
  /** `zoom` — в CSS-единицах; у камеры он умножен на плотность рендера (`setCssZoom`). */
  private view = { zoom: 1, fitsH: true, x: 0, y: 0, snap: true }
  /** Множитель растра SVG относительно мировых пикселей. */
  private res = 2

  constructor(opts: SettlementSceneOptions) {
    super({ key: SETTLEMENT_SCENE_KEY })
    this.opts = opts
    this.pos = opts.start ? { ...opts.start.pos } : { ...HERO_START }
    this.facing = opts.start?.facing ?? "up"
  }

  create(): void {
    initHiDpiScene(this)
    this.cameras.main.setBackgroundColor("#141a12")
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
    this.res = settlementRes(renderScaleOf(this), this.fitZoom().zoom)
    const res = this.res
    const t = (key: string, svg: string, w: number, h: number) => ensureTexture(this, key, svg, w * res, h * res)
    const jobs: Promise<string>[] = []
    for (let v = 0; v < GROUND_VARIANTS; v++) {
      jobs.push(t(texKey.grass(v), villageGrassSvg(v), T, T))
      jobs.push(t(texKey.path(v), villagePathSvg(v), T, T))
      jobs.push(t(texKey.weeds(v), villageWeedsSvg(v), T, T))
      jobs.push(t(texKey.fenceSide("left", v), villagePalisadeSideSvg(v, "left"), T, T * PALISADE_H))
      jobs.push(t(texKey.fenceSide("right", v), villagePalisadeSideSvg(v, "right"), T, T * PALISADE_H))
    }
    for (let v = 0; v < 3; v++) {
      jobs.push(t(texKey.bush(v), villageBushSvg(v), T, T))
      jobs.push(t(texKey.spikes(v), villageSpikesSvg(v), T, T))
    }
    for (let v = 0; v < FENCE_VARIANTS; v++) jobs.push(t(texKey.fence(v), villagePalisadeSvg(v), T, T * PALISADE_H))
    jobs.push(t(texKey.torch, villageTorchSvg(), T, T * TORCH_H))
    for (let f = 0; f < WATER_FRAMES; f++) jobs.push(t(texKey.water(f), tileSvg("yard", "water", f, 0), T, T))
    for (let v = 0; v < TREE_VARIANTS; v++) jobs.push(t(texKey.tree(v), villageTreeSvg(v), T, T * TREE_H))
    jobs.push(t(texKey.gate, villageGateSvg(SORTIE_GATE.w), SORTIE_GATE.w * T, T * GATE_H))
    // Здания — сразу в нынешнем уровне; другие уровни догружаются, когда здание улучшат
    const signs = this.opts.signs()
    for (const p of PLOTS) {
      jobs.push(t(texKey.lot(p.id), villagePlotSvg(p.w, !p.building), p.w * T, PLOT_H * T))
      if (p.building) jobs.push(this.loadBuilding(p, Math.max(1, signs[p.id]?.level ?? 1)))
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
    const f = FISHER
    const fisherSvg = critterSvg({ species: f.species, fur: furArt(f.fur), iris: eyeArt(f.eyes), pattern: 0, eyes: f.eyes, accessory: f.accessory, pose: "idle" })
    jobs.push(t(texKey.npc(f.id, "idle"), fisherSvg, T * NPC_W, (T * NPC_W * 140) / 120))
    for (const g of GOSSIPS) {
      const svg = critterSvg({ species: g.species, fur: furArt(g.fur), iris: eyeArt(g.eyes), pattern: 0, eyes: g.eyes, accessory: g.accessory, pose: "happy" })
      jobs.push(t(texKey.npc(g.id, "idle"), svg, T * NPC_W, (T * NPC_W * 140) / 120))
    }
    const heroH = T * HERO_H
    const heroW = (heroH * HERO_VIEW.w) / HERO_VIEW.h
    for (const facing of FACINGS) {
      for (let f = 0; f < HERO_IDLE_FRAMES; f++) {
        jobs.push(t(heroArtKey({ facing, pose: "idle", frame: f }), heroSvg({ facing, pose: "idle", frame: f }), heroW, heroH))
        // без капюшона — только в покое: открытый и моргающий котёнок
        for (const blink of [false, true]) {
          const a = { facing, pose: "idle", frame: f, hood: false, blink } as const
          jobs.push(t(heroArtKey(a), heroSvg(a), heroW, heroH))
        }
      }
      for (let f = 0; f < HERO_WALK_FRAMES; f++)
        for (const hood of [true, false]) {
          const a = { facing, pose: "walk", frame: f, hood } as const
          jobs.push(t(heroArtKey(a), heroSvg(a), heroW, heroH))
        }
    }
    return Promise.all([...jobs, ensureIconTextures(this, SIGN_ICONS, "dark")])
  }

  /** Текстура здания на уровне `level` (растеризуется один раз). */
  private loadBuilding(p: PlotDef, level: number): Promise<string> {
    const id = p.building as BuildingId
    return ensureTexture(this, texKey.building(p.id, level), villageBuildingSvg(id, p.w, p.h, level), p.w * T * this.res, (p.h + buildingOver(id, p)) * T * this.res)
  }

  /** Догрузка текстуры уровня: не чаще одной попытки за раз и не больше BUILDING_RETRIES — если SVG не растеризуется, не долбим каждые 0,5 с. */
  private retryBuilding(p: PlotDef, level: number, key: string): void {
    const tries = this.buildingTries.get(key) ?? 0
    if (tries < 0 || tries >= BUILDING_RETRIES) return
    this.buildingTries.set(key, -1)
    void this.loadBuilding(p, level).then(() => {
      this.buildingTries.set(key, this.textures?.exists(key) ? 0 : tries + 1)
    })
  }

  /** Свечение огня: мягкое пятно (канвас с радиальным градиентом), его тонируют и мерцают. */
  private makeGlowTexture(): void {
    if (this.textures.exists(texKey.glow)) return
    const size = 128
    const tex = this.textures.createCanvas(texKey.glow, size, size)
    const ctx = tex?.getContext()
    if (!tex || !ctx) return
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    g.addColorStop(0, "rgba(255,255,255,0.9)")
    g.addColorStop(0.35, "rgba(255,255,255,0.35)")
    g.addColorStop(1, "rgba(255,255,255,0)")
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
    tex.refresh()
  }

  /* ---------- Сборка мира ---------- */

  private build(): void {
    for (let y = 0; y < SETTLEMENT_H; y++) {
      for (let x = 0; x < SETTLEMENT_W; x++) {
        const tile = settlementTile(x, y)
        const h = hash(x, y)
        const px = x * T
        const py = y * T
        this.add.image(px, py, texKey.grass(h % GROUND_VARIANTS)).setOrigin(0).setDisplaySize(T, T).setDepth(-10)
        if (tile === "path" || tile === "door" || tile === "gate")
          this.add.image(px, py, texKey.path(h % GROUND_VARIANTS)).setOrigin(0).setDisplaySize(T, T).setDepth(-9)
        else if (tile === "flowers")
          this.add.image(px, py, texKey.weeds(h % GROUND_VARIANTS)).setOrigin(0).setDisplaySize(T, T).setDepth(-9)
        else if (tile === "water") {
          // Пруд в сумерках — тёмный, холодный
          this.water.push(this.add.image(px, py, texKey.water(0)).setOrigin(0).setDisplaySize(T, T).setDepth(-9).setTint(0x55607a))
        }
        else if (tile === "bush") this.add.image(px, py, texKey.bush(h % 3)).setOrigin(0).setDisplaySize(T, T).setDepth(py + T)
        else if (tile === "tree")
          this.add.image(px + T / 2, py + T, texKey.tree(h % TREE_VARIANTS)).setOrigin(0.5, 1).setDisplaySize(T, T * TREE_H).setDepth(py + T)
        else if (tile === "fence") this.addFence(x, y, h)
      }
    }
    // За околицей — темнее: мёртвый лес, рогатки против толпы, дорога от ворот на юг; в темноте иногда горят глаза
    const road = SORTIE_GATE.x + Math.floor(SORTIE_GATE.w / 2)
    const outside = 0x6a7080
    for (let y = SETTLEMENT_H; y < SETTLEMENT_H + OUTSIDE_ROWS; y++) {
      for (let x = 0; x < SETTLEMENT_W; x++) {
        const h = hash(x, y)
        this.add.image(x * T, y * T, texKey.grass(h % GROUND_VARIANTS)).setOrigin(0).setDisplaySize(T, T).setDepth(-10).setTint(outside)
        if (x === road) this.add.image(x * T, y * T, texKey.path(h % GROUND_VARIANTS)).setOrigin(0).setDisplaySize(T, T).setDepth(-9).setTint(outside)
        else if (Math.abs(x - road) === 2 || (Math.abs(x - road) > 3 && h % 4 === 1)) {
          this.add.image(x * T, y * T, texKey.spikes(h % 3)).setOrigin(0).setDisplaySize(T, T).setDepth(y * T + T * 0.6).setTint(0x9098a6)
        }
        else if (Math.abs(x - road) > 3 && h % 3 === 0) {
          // за оградой — чаще сухие деревья
          this.add
            .image(x * T + T / 2, (y + 1) * T, texKey.tree(h % 2 ? TREE_VARIANTS - 1 : h % TREE_VARIANTS))
            .setOrigin(0.5, 1)
            .setDisplaySize(T, T * TREE_H)
            .setDepth((y + 1) * T)
            .setTint(outside)
        }
      }
    }
    for (const x of EYES_X) this.eyes.push(this.makeEyes(x, SETTLEMENT_H))
    this.makeGlowTexture()
    for (const p of TORCHES) this.torches.push(this.makeTorch(p))
    for (const def of PLOTS) {
      const bottom = (def.y + def.h) * T
      const lot = this.add
        .image(def.x * T, bottom, texKey.lot(def.id))
        .setOrigin(0, 1)
        .setDisplaySize(def.w * T, def.h * T)
        .setDepth(bottom)
      const view: PlotView = { def, lot }
      if (def.building) {
        const over = buildingOver(def.building, def)
        const level = Math.max(1, this.opts.signs()[def.id]?.level ?? 1)
        view.building = this.add
          .image(def.x * T, bottom, texKey.building(def.id, level))
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
    this.fisher = this.makeFisher()
    const npcW = T * NPC_W
    this.gossips = new Gossips({
      scene: this,
      tile: T,
      size: { w: npcW, h: (npcW * 140) / 120 },
      texture: id => texKey.npc(id, "idle"),
      speech: this.speech,
      heroPos: () => this.pos,
      paused: () => this.opts.paused()
    })
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
      .setResolution(textRes(2))
      .setDepth(10002)
      .setVisible(false)

    this.refreshSigns()
    // Сохранённая позиция могла оказаться на месте жителя или в стене (сменилась карта) — тогда на старт
    if (!heroFits(this.pos, this.blockers)) this.pos = { ...HERO_START }
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

  /** Клетка частокола: по верхней и нижней стене — колья анфас, по бокам — ряд кольев вглубь. */
  private addFence(x: number, y: number, h: number): void {
    const bottom = (y + 1) * T
    const side = y > 0 && y < SETTLEMENT_H - 1 ? (x === 0 ? "left" : x === SETTLEMENT_W - 1 ? "right" : undefined) : undefined
    const key = side ? texKey.fenceSide(side, h % GROUND_VARIANTS) : texKey.fence(h % FENCE_VARIANTS)
    this.add
      .image(x * T + T / 2, bottom, key)
      .setOrigin(0.5, 1)
      .setDisplaySize(T, T * PALISADE_H)
      .setDepth(bottom)
  }

  private makeTorch(p: Pos): TorchView {
    const bottom = (p.y + 1) * T
    const side = p.x === 0 ? 0.35 : p.x === SETTLEMENT_W - 1 ? -0.35 : 0
    const x = (p.x + 0.5 + side) * T
    // Факел чуть впереди своей стены; нижний — над ней, чтобы его не закрыли колья
    this.add.image(x, bottom + 2, texKey.torch).setOrigin(0.5, 1).setDisplaySize(T, T * TORCH_H).setDepth(bottom + 2)
    const glow = this.add
      .image(x, bottom + 2 - T * TORCH_H * 0.86, texKey.glow)
      .setDisplaySize(T * 3.2, T * 3.2)
      .setTint(0xff9a3a)
      .setAlpha(0.5)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(bottom + 3)
    return { glow, phase: hash(p.x, p.y) % 100 }
  }

  /** Глаза в темноте за оградой: два тусклых зелёно-жёлтых огонька с ореолом. */
  private makeEyes(x: number, y: number): EyesView {
    const cx = x * T + T / 2
    const cy = y * T + T * 0.45
    const parts: Phaser.GameObjects.GameObject[] = []
    for (const dx of [-5, 5]) {
      parts.push(this.add.circle(dx, 0, 5, 0xb8ff6a, 0.25))
      parts.push(this.add.ellipse(dx, 0, 4.5, 3, 0xd8ff9a, 1))
    }
    const img = this.add.container(cx, cy, parts).setDepth((y + 1) * T + 1).setAlpha(0)
    return { img, baseX: cx, next: 4 + (hash(x, y) % 20) }
  }

  private animateFx(dt: number): void {
    this.fxT += dt
    const t = this.fxT
    for (const f of this.torches) {
      const k = 0.5 + Math.sin(t * 9 + f.phase) * 0.06 + Math.sin(t * 23 + f.phase * 2) * 0.04
      f.glow.setAlpha(k).setScale(((T * 3.2) / 128) * (0.96 + Math.sin(t * 6 + f.phase) * 0.04))
    }
    if (reducedMotion()) return
    for (const e of this.eyes) {
      if (t < e.next) continue
      // загораются, моргают и гаснут; следующий раз — через 8–30 с
      e.next = t + 8 + Math.random() * 22
      e.img.setX(e.baseX + (Math.random() - 0.5) * T * 0.6)
      this.tweens.chain({
        targets: e.img,
        tweens: [
          { alpha: 0.9, duration: 700 },
          { scaleY: 0.1, duration: 90, yoyo: true, delay: 1200 },
          { alpha: 0, duration: 900, delay: 900 }
        ]
      })
    }
  }

  /** Рыбак у пруда с удочкой: поплавок покачивается на воде, иногда ныряет — клюёт. */
  private makeFisher(): FisherView {
    const def = FISHER
    const w = T * NPC_W
    const h = (w * 140) / 120
    const x = def.pos.x * T
    const y = def.pos.y * T
    const img = this.add.image(x, y + h * 0.14, texKey.npc(def.id, "idle")).setOrigin(0.5, 1).setDisplaySize(w, h).setDepth(y).setFlipX(def.faceLeft)
    const dir = def.faceLeft ? -1 : 1
    // Удилище из лап вверх-вбок над водой, леска провисает к поплавку
    const grip = { x: x + dir * w * 0.2, y: y - h * 0.18 }
    const tip = { x: x + dir * T * 1.15, y: y - h * 0.95 }
    const floatAt = { x: x + dir * T * 1.45, y: y - T * 0.25 }
    const rod = this.add.graphics().setDepth(y + 1)
    rod.lineStyle(3, 0x5a3b22, 1).lineBetween(grip.x, grip.y, tip.x, tip.y)
    rod.lineStyle(1, 0xd8d2c0, 0.7).lineBetween(tip.x, tip.y, floatAt.x, floatAt.y)
    const float = this.add.circle(floatAt.x, floatAt.y, 3.5, 0xd64545).setStrokeStyle(1.5, 0xf3e2c0).setDepth(y + 1)
    if (!reducedMotion()) this.tweens.add({ targets: float, y: floatAt.y + 2, duration: 1100, yoyo: true, repeat: -1, ease: "Sine.easeInOut" })
    const label = this.add
      .text(x, y - h * 0.78, def.name, textStyle(12, "#ffffff", true, 3))
      .setOrigin(0.5, 1)
      .setResolution(textRes(2))
      .setDepth(9000)
    const queue: number[] = []
    return { img, float, head: { x, y: label.getTopCenter().y ?? label.y }, nextT: MUTTER_TIMING.first, queue }
  }

  /** Рыбак бубнит: тихо по таймеру, а по тапу — сразу (поплавок при этом дёргается). */
  private tickFisher(dt: number): void {
    const f = this.fisher
    if (!f) return
    f.nextT -= dt
    if (f.nextT > 0) return
    if (this.opts.paused()) {
      f.nextT = 1
      return
    }
    this.mutter()
  }

  private mutter(): void {
    const f = this.fisher
    if (!f) return
    const lines = FISHER_MUTTERS()
    if (f.queue.length === 0) {
      const order = Phaser.Utils.Array.Shuffle(lines.map((_, i) => i))
      // Новый круг не начинается с той же реплики, что закончил прошлый
      if (order[0] === f.lastLine && order.length > 1) order.push(order.shift() as number)
      f.queue.push(...order)
    }
    const i = f.queue.shift() as number
    f.lastLine = i
    const text = lines[i] ?? ""
    const hold = MUTTER_TIMING.hold + text.length * MUTTER_TIMING.perChar
    const [lo, hi] = MUTTER_TIMING.gap
    f.nextT = hold + lo + Math.random() * (hi - lo)
    this.speech.show(FISHER.id, f.head, text, hold, { italic: true })
    if (!reducedMotion()) this.tweens.add({ targets: f.float, scaleX: 0.7, scaleY: 0.4, duration: 120, yoyo: true, repeat: 1 })
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
      .setResolution(textRes(2))
      .setDepth(9000)
    // Пузырь «!» над именем: есть что рассказать
    const bubble = this.add.graphics()
    bubble.fillStyle(0x000000, 0.3).fillCircle(1, 3, 15)
    bubble.fillStyle(0xffd166, 1).fillTriangle(-6, 11, 6, 11, 0, 21)
    bubble.fillStyle(0xffd166, 1).fillCircle(0, 0, 15)
    bubble.lineStyle(3, 0x2a1d10, 1).strokeCircle(0, 0, 15)
    const mark = this.add.text(0, 1, "!", textStyle(21, "#2a1d10", true, 0)).setOrigin(0.5).setResolution(textRes(2))
    // над подписью с именем (её высота ≈ 16 px), с зазором под хвостик
    const story = this.add.container(x, y - h * 0.78 - 44, [bubble, mark]).setDepth(9001).setVisible(false)
    if (!reducedMotion()) this.tweens.add({ targets: story, y: story.y - 4, duration: 600, yoyo: true, repeat: -1, ease: "Sine.easeInOut" })
    const view: NpcView = { def, img, label, story }
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
    const over = def.building && v.building?.visible ? buildingOver(def.building, def) : 0
    return { x: def.x, y: def.y - over, w: def.w, h: def.h + over }
  }

  private makeSign(id: PlaceId): SignView {
    const frame = this.add.graphics()
    const plaque = this.add.container(0, 0, [frame]).setDepth(9500)
    const badgeBg = this.add.circle(0, 0, 13, 0xe63946).setStrokeStyle(3, 0xffffff)
    const badgeText = this.add.text(0, 0, "!", textStyle(17, "#ffffff", true, 0)).setOrigin(0.5).setResolution(textRes(2))
    const badge = this.add.container(0, 0, [badgeBg, badgeText]).setDepth(9501).setVisible(false)
    const arrow = this.add
      .text(0, 0, "▼", { ...textStyle(26, "#ffd166", true, 5), stroke: "#3b2614" })
      .setOrigin(0.5, 1)
      .setResolution(textRes(2))
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
    // Эмодзи на вывеске — иконками-штампами тёмного тона (плашка светлая)
    const title = richText(this, 0, -8, s.title, { ...textStyle(17, "#3b2614", true, 0), resolution: textRes(2) }, "dark")
    const sub = richText(this, 0, 12, s.sub, { ...textStyle(13, SUB_COLOR[s.status], true, 0), resolution: textRes(2) }, "dark")
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
      // Улучшили — здание меняет вид (текстура уровня догружается, пока висит прежняя)
      const level = Math.min(BUILDING_MAX_LEVEL, Math.max(1, signs[p.def.id]?.level ?? 1))
      const key = texKey.building(p.def.id, level)
      if (p.building && p.building.texture.key !== key) {
        if (this.textures.exists(key)) p.building.setTexture(key)
        else this.retryBuilding(p.def, level, key)
      }
      p.building?.setVisible(built)
      p.lot.setVisible(!built)
      // Место, где можно строить, мягко подсвечено
      if (signs[p.def.id]?.status === "available") p.lot.setTint(0xfff1b8)
      else if (signs[p.def.id]?.status === "locked") p.lot.setTint(0xb8b4ae)
      else p.lot.clearTint()
    }
    const active: NpcDef[] = []
    const stories = this.opts.npcAlerts()
    for (const n of this.npcs) {
      const on = !!signs[n.def.place]?.built
      n.img.setVisible(on)
      n.label.setVisible(on)
      n.story.setVisible(on && !!stories[n.def.id])
      if (on) active.push(n.def)
    }
    // Житель появился там, где стоит герой (здание построили) — герой отходит к входу, чтобы не застрять
    const fresh = active.filter(n => !this.active.includes(n))
    this.active = active
    if (this.hero && fresh.length > 0 && !heroFits(this.pos, [...active, FISHER])) this.teleport(fresh[0]?.place as PlaceId)
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
    const f = this.fitZoom()
    this.view.zoom = f.zoom
    this.view.fitsH = f.fitsH
    this.view.snap = true
    setCssZoom(this, this.view.zoom)
  }

  /** Зум вида (CSS-единицы) под нынешний размер экрана и отступы. */
  private fitZoom(): { zoom: number, fitsH: boolean } {
    const { top, bottom } = this.opts.insets()
    const worldH = (SETTLEMENT_H + OUTSIDE_ROWS) * T + T * 0.5
    const availH = Math.max(1, cssViewH(this) - top - bottom)
    const fit = Math.min(cssViewW(this) / (SCREEN_W * T), availH / worldH)
    return { zoom: Phaser.Math.Clamp(fit, 0.55, 1.6), fitsH: availH / worldH >= 0.55 }
  }

  private updateCamera(dt: number): void {
    const cam = this.cameras.main
    const { zoom } = this.view
    const { top, bottom } = this.opts.insets()
    const worldW = SETTLEMENT_W * T
    // Сверху — полклетки на крону деревьев первого ряда
    const worldTop = -T * 0.5
    const worldH = (SETTLEMENT_H + OUTSIDE_ROWS) * T - worldTop
    const viewW = cssViewW(this) / zoom
    const viewH = cssViewH(this) / zoom
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
    // Джойстик — в экранных CSS-пикселях: `p.x`/`p.y` указателя в пикселях буфера канваса делим на плотность
    const k = 1 / renderScaleOf(this)
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.opts.paused()) return
      this.down = { x: p.x * k, y: p.y * k, id: p.id }
    })
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (!this.down || !p.isDown || p.id !== this.down.id || this.opts.paused()) return
      const dx = p.x * k - this.down.x
      const dy = p.y * k - this.down.y
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
    this.talkOnArrive = undefined
    const base = pinToScreen(this.add
      .circle(at.x, at.y, 46, 0xffffff, 0.18)
      .setStrokeStyle(2, 0xffffff, 0.5)
      .setDepth(20000))
    const knob = pinToScreen(this.add.circle(at.x, at.y, 20, 0xffffff, 0.55).setDepth(20001))
    this.joy = { start: { x: at.x, y: at.y }, vec: { x: 0, y: 0 }, base, knob }
  }

  private stopJoystick(): void {
    if (!this.joy) return
    this.joy.base.destroy()
    this.joy.knob.destroy()
    this.joy = undefined
  }

  /** Кто стоит на пути героя: жители у построенных зданий, рыбак и сплетники. */
  private get blockers(): Blocker[] {
    return [...this.active, FISHER, ...(this.gossips?.blockers() ?? [])]
  }

  /** Тап по земле — идти туда; по жителю, зданию или его вывеске — подойти и открыть карточку места; по рыбаку — он бубнит. */
  private tapAt(p: Pos): void {
    if (this.speech.tap(p.x * T, p.y * T)) return
    if (this.gossips?.tap(p)) return
    if (Math.abs(FISHER.pos.x - p.x) < 0.7 && p.y > FISHER.pos.y - 1.3 && p.y < FISHER.pos.y + 0.5) return this.mutter()
    const npc = this.active.find(n => Math.abs(n.pos.x - p.x) < 0.7 && p.y > n.pos.y - 1.3 && p.y < n.pos.y + 0.5)
    if (npc && this.opts.canTalk(npc.id)) return this.talkTo(npc)
    if (npc) return this.walkTo(npc.place)
    const place = [...PLOTS.map(pl => pl.id), "gate"].find((id) => {
      const r = this.placeRect(id)
      return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
    })
    if (place) return this.walkTo(place)
    this.openOnArrive = undefined
    this.talkOnArrive = undefined
    this.path = findPath(this.pos, p, this.blockers)
    this.showMarker(this.path[this.path.length - 1])
  }

  /** Подойти к жителю (ко входу в его место) и заговорить; рядом — сразу. */
  private talkTo(npc: NpcDef): void {
    this.openOnArrive = undefined
    this.talkOnArrive = npc
    if (this.closeTo(npc)) {
      this.path = []
      return
    }
    const front = placeFront(npc.place)
    if (!front) return
    this.path = [...findPath(this.pos, front, this.blockers), front]
    this.showMarker(front)
  }

  /** Достаточно ли близко, чтобы говорить. */
  private closeTo(npc: NpcDef): boolean {
    return Math.hypot(npc.pos.x - this.pos.x, npc.pos.y - this.pos.y) < 2.4
  }

  /** Подойти к месту и открыть его карточку (тап по зданию, смоук-тесты). */
  walkTo(id: PlaceId): void {
    const front = placeFront(id)
    if (!front) return
    this.talkOnArrive = undefined
    this.openOnArrive = id
    if (placeInReach(this.pos) === id) {
      this.path = []
      return
    }
    this.path = [...findPath(this.pos, front, this.blockers), front]
    this.showMarker(front)
  }

  /** Переставить героя к входу в место (панель мест, смоук-тесты); камера переезжает сразу. */
  teleport(id: PlaceId): void {
    const front = placeFront(id)
    if (!front || !heroFits(front, this.blockers)) return
    this.pos = { ...front }
    this.path = []
    this.openOnArrive = undefined
    this.talkOnArrive = undefined
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
    this.animateFx(dt)
    this.tickFisher(dt)
    this.gossips?.update(dt)
    this.speech.update()
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
      this.talkOnArrive = undefined
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
      this.talkOnArrive = undefined
    }
    else if (this.joy) v = this.joy.vec
    else if (this.path.length > 0) v = this.followPath(dt)

    const speed = HERO_SPEED * Math.min(1, Math.hypot(v.x, v.y) || 0)
    const dir = normalizeInput(v.x, v.y)
    const from = this.pos
    if (speed > 0) {
      this.pos = moveHero(from, dir.x * speed * dt, dir.y * speed * dt, this.blockers)
      this.facing = facingOf(dir.x, dir.y, this.facing)
    }
    const moved = Math.hypot(this.pos.x - from.x, this.pos.y - from.y) > 1e-4
    if (this.path.length > 0 && !moved) {
      this.stuckT += dt
      if (this.stuckT > 0.3) this.path = []
    }
    else this.stuckT = 0
    this.setMoving(moved)
    this.hero.setPosition(this.pos.x * T, this.pos.y * T)
    // setDepth всегда ставит в очередь сортировку всего списка отображения (~1000 тайлов) — только при изменении
    const depth = this.pos.y * T
    if (this.hero.depth !== depth) this.hero.setDepth(depth)
    if (moved) this.footsteps(dt)
    this.animateHero(dt)
    this.updateNear()
    this.updateCamera(dt)

    if (this.talkOnArrive && this.path.length === 0 && !moved) {
      const npc = this.talkOnArrive
      this.talkOnArrive = undefined
      if (this.closeTo(npc)) {
        // Герой поворачивается к собеседнику
        this.facing = facingOf(npc.pos.x - this.pos.x, npc.pos.y - this.pos.y, this.facing)
        this.animateHero(0)
        this.opts.onTalk(npc.id)
        return
      }
    }
    if (this.openOnArrive && this.path.length === 0 && !moved) {
      const id = this.openOnArrive
      this.openOnArrive = undefined
      this.talkOnArrive = undefined
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
    if (!this.moving && on) {
      this.walkT = 0
      this.restT = 0
      this.hoodOnT = HOOD_ON_AFTER
    }
    this.moving = on
  }

  /**
   * Снять (true) или надеть капюшон: короткое «присел — выпрямился», вид меняется в нижней точке (надевая на ходу,
   * приседает глубже — натягивает капюшон). Сняв капюшон, котёнок поворачивается к игроку — показать мордочку.
   */
  private setHood(off: boolean): void {
    const hero = this.hero
    if (!hero) return
    this.blinkAt = this.idleT + BLINK_EVERY[0]
    this.tweens.killTweensOf(hero)
    const sy = (T * HERO_H) / hero.height
    hero.setScale(hero.scaleX, sy)
    const reveal = () => {
      this.hoodOff = off
      if (off && this.facing !== "down") {
        this.facing = "down"
        this.opts.onRest(this.pos, this.facing)
      }
    }
    if (reducedMotion()) return reveal()
    this.tweens.add({
      targets: hero,
      scaleY: sy * (off ? 0.9 : 0.86),
      duration: 110,
      yoyo: true,
      ease: "Quad.easeOut",
      onYoyo: reveal
    })
  }

  private animateHero(dt: number): void {
    if (!this.hero) return
    if (this.moving) {
      this.walkT += dt
      const frame = Math.floor(this.walkT * 8) % HERO_WALK_FRAMES
      if (this.hoodOff && !this.tweens.isTweening(this.hero)) {
        this.hoodOnT -= dt
        if (this.hoodOnT <= 0) this.setHood(false)
      }
      this.hero.setTexture(heroArtKey({ facing: this.facing, pose: "walk", frame, hood: !this.hoodOff }))
    }
    else {
      this.idleT += dt
      this.restT += dt
      if (!this.hoodOff && this.restT >= HOOD_OFF_AFTER && !this.tweens.isTweening(this.hero)) this.setHood(true)
      const frame = Math.floor(this.idleT * 1.6) % HERO_IDLE_FRAMES
      let blink = false
      if (this.hoodOff && this.idleT >= this.blinkAt) {
        blink = this.idleT < this.blinkAt + BLINK_S
        if (!blink) this.blinkAt = this.idleT + BLINK_EVERY[0] + Math.random() * (BLINK_EVERY[1] - BLINK_EVERY[0])
      }
      this.hero.setTexture(heroArtKey({ facing: this.facing, pose: "idle", frame, hood: !this.hoodOff, blink }))
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
