import Phaser from "phaser"
import type { Facing, Pos, VillageState } from "@game/core/types"
import {
  facingOf,
  findVillagePath,
  heroFits,
  moveHero,
  normalizeInput,
  npcInReach,
  spotNear,
  villageTile
} from "@game/core/village"
import {
  GATE,
  HERO_SPEED,
  HOUSES,
  NPCS,
  VILLAGE_H,
  VILLAGE_W,
  type NpcDef,
  type NpcId
} from "@game/content/village"
import { critterSvg, eyeArt, furArt, tileSvg } from "@game/art/index"
import { TILE_FRAME_COUNT } from "@game/art/tile"
import { HERO_ANCHOR, HERO_IDLE_FRAMES, HERO_VIEW, HERO_WALK_FRAMES, heroArtKey, heroSvg } from "@game/art/hero"
import {
  GATE_H,
  HOUSE_ROOF_OVER,
  TREE_H,
  WELL_H,
  villageFlowersSvg,
  villageGateSvg,
  villageHouseSvg,
  villagePathSvg,
  villageTreeSvg,
  villageWellSvg
} from "@game/art/village"
import { ensureTexture } from "../svgTextures"
import { ensureTextures } from "../textures"
import { textStyle } from "../style"
import { stepFx, reducedMotion } from "../motionFx"
import { sceneAlive } from "../fx"

export const VILLAGE_SCENE_KEY = "village"

/** Клетка деревни на экране (мировые пиксели); текстуры растеризуются вдвое крупнее ради чёткости. */
const T = 48
const RES = 2
const FACINGS: readonly Facing[] = ["down", "up", "left", "right"]
const WATER_FRAMES = TILE_FRAME_COUNT.water ?? 1
/** Высота героя и NPC на экране (в клетках). */
const HERO_H = 1.2
const NPC_W = 1.25
/** Сколько рядов «за околицей» дорисовано под воротами (не проходимо): камера может показать ворота над HUD. */
const OUTSIDE_ROWS = 2

export interface VillageSceneOptions {
  start: VillageState
  /** «!» над NPC — опрашивается раз в полсекунды. */
  alerts: () => Record<NpcId, boolean>
  /** Сцена на паузе, пока открыт разговор с NPC. */
  paused: () => boolean
  /** Устройство без клавиатуры: подсказку «E — поговорить» не показываем, есть кнопка в HUD. */
  touch: boolean
  onNear: (id: NpcId | undefined) => void
  onTalk: (id: NpcId) => void
  /** Герой остановился — запомнить позицию в сейве. */
  onRest: (pos: Pos, facing: Facing) => void
}

interface NpcView {
  def: NpcDef
  img: Phaser.GameObjects.Image
  label: Phaser.GameObjects.Text
  alert: Phaser.GameObjects.Text
  prompt: Phaser.GameObjects.Text
  baseY: number
}

type Keys = Record<"W" | "A" | "S" | "D" | "UP" | "DOWN" | "LEFT" | "RIGHT" | "E" | "SPACE" | "ENTER", Phaser.Input.Keyboard.Key>

const texKey = {
  grass: (v: number) => `vg:grass:${v}`,
  path: (v: number) => `vg:path:${v}`,
  flowers: (v: number) => `vg:flowers:${v}`,
  water: (f: number) => `vg:water:${f}`,
  bush: "vg:bush",
  tree: (v: number) => `vg:tree:${v}`,
  well: "vg:well",
  gate: "vg:gate",
  house: (id: string) => `vg:house:${id}`,
  npc: (id: string, pose: string) => `vg:npc:${id}:${pose}`
}

const hash = (x: number, y: number): number => ((x * 73856093) ^ (y * 19349663)) >>> 0

export class VillageScene extends Phaser.Scene {
  private readonly opts: VillageSceneOptions
  private pos: Pos
  private facing: Facing
  private hero?: Phaser.GameObjects.Image
  private npcs: NpcView[] = []
  private water: Phaser.GameObjects.Image[] = []
  private keys?: Keys
  private path: Pos[] = []
  /** NPC, с которым заговорить, когда герой дойдёт по тапу. */
  private talkOnArrive: NpcId | undefined
  private near: NpcId | undefined
  private moving = false
  private walkT = 0
  private idleT = 0
  private stepT = 0
  private stuckT = 0
  private alertT = 0
  private waterT = 0
  private ready = false
  private joy?: { start: Pos, vec: Pos, base: Phaser.GameObjects.Arc, knob: Phaser.GameObjects.Arc }
  private down?: { x: number, y: number, id: number }
  private marker?: Phaser.GameObjects.Arc

  constructor(opts: VillageSceneOptions) {
    super({ key: VILLAGE_SCENE_KEY })
    this.opts = opts
    this.pos = heroFits(opts.start.pos) ? { ...opts.start.pos } : spotNear(NPCS[2] as NpcDef)
    this.facing = opts.start.facing
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
    jobs.push(t(texKey.well, villageWellSvg(), T, T * WELL_H))
    jobs.push(t(texKey.gate, villageGateSvg(GATE.w, GATE.sign), GATE.w * T, T * GATE_H))
    for (const h of HOUSES) jobs.push(t(texKey.house(h.npc), villageHouseSvg(h), h.w * T, (h.h + HOUSE_ROOF_OVER) * T))
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
    return Promise.all(jobs)
  }

  /* ---------- Сборка мира ---------- */

  private build(): void {
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
        else if (tile === "well")
          this.add.image(px + T / 2, py + T, texKey.well).setOrigin(0.5, 1).setDisplaySize(T, T * WELL_H).setDepth(py + T)
      }
    }
    // За околицей: луг, дорога уходит от ворот на юг, редкие деревья по краям
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
    for (const h of HOUSES) {
      const bottom = (h.y + h.h) * T
      this.add
        .image(h.x * T, bottom, texKey.house(h.npc))
        .setOrigin(0, 1)
        .setDisplaySize(h.w * T, (h.h + HOUSE_ROOF_OVER) * T)
        .setDepth(bottom)
    }
    const gateBottom = (GATE.y + 1) * T
    this.add
      .image(GATE.x * T, gateBottom, texKey.gate)
      .setOrigin(0, 1)
      .setDisplaySize(GATE.w * T, T * GATE_H)
      .setDepth(gateBottom)
    for (const def of NPCS) this.npcs.push(this.makeNpc(def))

    const heroH = T * HERO_H
    this.hero = this.add
      .image(this.pos.x * T, this.pos.y * T, heroArtKey({ facing: this.facing }))
      .setOrigin(0.5, HERO_ANCHOR.y)
      .setDisplaySize((heroH * HERO_VIEW.w) / HERO_VIEW.h, heroH)

    this.setupInput()
    this.setupCamera()
    this.scale.on(Phaser.Scale.Events.RESIZE, this.setupCamera, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.setupCamera, this)
      this.opts.onRest(this.pos, this.facing)
    })
    this.refreshAlerts()
    this.updateNear()
  }

  private makeNpc(def: NpcDef): NpcView {
    const w = T * NPC_W
    const h = (w * 140) / 120
    const x = def.pos.x * T
    const y = def.pos.y * T
    const img = this.add.image(x, y + h * 0.14, texKey.npc(def.id, "idle")).setOrigin(0.5, 1).setDisplaySize(w, h).setDepth(y)
    const label = this.add
      .text(x, y - h * 0.78, `${def.name}\n${def.title}`, { ...textStyle(11, "#ffffff", true, 3), lineSpacing: -2 })
      .setOrigin(0.5, 1)
      .setDepth(10000)
    const alert = this.add.text(x, y - h * 0.78 - 30, "!", textStyle(22, "#ffd166", true, 4)).setOrigin(0.5, 1).setDepth(10001)
    alert.setVisible(false)
    const prompt = this.add
      .text(x, y + 10, "E / Пробел — поговорить", {
        ...textStyle(11, "#15121a", true, 0),
        backgroundColor: "#ffffffdd",
        padding: { x: 6, y: 3 }
      })
      .setOrigin(0.5, 0)
      .setDepth(10002)
      .setVisible(false)
    if (!reducedMotion()) {
      const duration = 900 + (hash(def.pos.x, 3) % 300)
      this.tweens.add({ targets: img, y: img.y - 2, duration, yoyo: true, repeat: -1, ease: "Sine.easeInOut" })
      this.tweens.add({ targets: alert, y: alert.y - 6, duration: 420, yoyo: true, repeat: -1, ease: "Sine.easeInOut" })
    }
    return { def, img, label, alert, prompt, baseY: img.y }
  }

  /* ---------- Камера ---------- */

  private setupCamera(): void {
    const cam = this.cameras.main
    if (!this.hero) return
    const worldW = VILLAGE_W * T
    const worldH = (VILLAGE_H + OUTSIDE_ROWS) * T
    const fit = Math.min(this.scale.width / worldW, this.scale.height / worldH)
    const zoom = Phaser.Math.Clamp(fit, 0.9, 1.6)
    cam.setZoom(zoom)
    if (worldW * zoom <= this.scale.width + 1 && worldH * zoom <= this.scale.height + 1) {
      cam.stopFollow()
      cam.removeBounds()
      cam.centerOn(worldW / 2, worldH / 2)
    }
    else {
      cam.setBounds(0, 0, worldW, worldH)
      cam.startFollow(this.hero, true, 0.14, 0.14)
    }
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

  /** Тап по земле — идти туда; по NPC — подойти и заговорить. */
  private tapAt(p: Pos): void {
    const npc = NPCS.find(n => Math.abs(n.pos.x - p.x) < 0.7 && p.y > n.pos.y - 1.3 && p.y < n.pos.y + 0.5)
    if (npc) return this.walkTo(npc.id)
    this.talkOnArrive = undefined
    this.path = findVillagePath(this.pos, p)
    this.showMarker(this.path[this.path.length - 1])
  }

  /** Подойти к NPC и заговорить (тап по NPC, смоук-тесты). */
  walkTo(id: NpcId): void {
    const npc = NPCS.find(n => n.id === id)
    if (!npc) return
    this.talkOnArrive = id
    if (npcInReach(this.pos)?.id === id) {
      this.path = []
      return
    }
    const spot = spotNear(npc)
    this.path = [...findVillagePath(this.pos, spot), spot]
    this.showMarker(spot)
  }

  /** Переставить героя (смоук-тесты, отладка). */
  teleport(p: Pos): void {
    if (!heroFits(p)) return
    this.pos = { ...p }
    this.path = []
    this.hero?.setPosition(p.x * T, p.y * T)
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
    this.alertT += dt
    if (this.alertT > 0.5) {
      this.alertT = 0
      this.refreshAlerts()
    }
    const paused = this.opts.paused()
    if (this.input.keyboard) this.input.keyboard.enabled = !paused
    if (paused) {
      this.stopJoystick()
      this.path = []
      this.setMoving(false)
      this.animateHero(dt)
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
      this.pos = moveHero(from, dir.x * speed * dt, dir.y * speed * dt)
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
      if (npcInReach(this.pos)?.id === id) this.opts.onTalk(id)
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
    const tile = villageTile(Math.floor(this.pos.x), Math.floor(this.pos.y))
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
    const near = npcInReach(this.pos)?.id
    if (near === this.near) return
    this.near = near
    for (const n of this.npcs) {
      const on = n.def.id === near
      n.prompt.setVisible(on && !this.opts.touch)
      n.img.setTexture(texKey.npc(n.def.id, on ? "happy" : "idle"))
      // NPC поворачивается к герою
      n.img.setFlipX(on && this.pos.x < n.def.pos.x)
    }
    this.opts.onNear(near)
  }

  private refreshAlerts(): void {
    const alerts = this.opts.alerts()
    for (const n of this.npcs) n.alert.setVisible(alerts[n.def.id])
  }
}
