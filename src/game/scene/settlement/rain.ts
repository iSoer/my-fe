import Phaser from "phaser"

/**
 * Дождь и сумрак поселения поверх мира, в экранных координатах (сцена погоды не двигается с камерой): косые струи,
 * брызги на земле, холодная пелена и редкая зарница; плюс виньетка — края экрана всегда темнее, середина, где герой,
 * — нет. Сила дождя задаётся снаружи (`setLevel`, 0…1) и меняется плавно. Чистая презентация, без аллокаций в кадре.
 */

const TEX = {
  drop: "st_rain_drop",
  splash: "st_rain_splash",
  vignette: "st_vignette"
} as const

/** Потолок струй и брызг на экране (на ливне 1.0). */
const DROPS = 110
const SPLASHES = 26
/** Наклон дождя: смещение по x на единицу падения. */
const WIND = -0.22

function ensureRainTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX.drop)) return
  const g = scene.make.graphics({ x: 0, y: 0 }, false)
  // Струя: тонкая полоса, к хвосту прозрачнее
  for (let i = 0; i < 6; i++) {
    g.fillStyle(0xffffff, 0.25 + i * 0.13)
    g.fillRect(0, i * 5, 2, 5)
  }
  g.generateTexture(TEX.drop, 2, 30)
  // Брызги: плоское кольцо
  g.clear()
  g.lineStyle(2, 0xffffff, 1)
  g.strokeEllipse(12, 5, 20, 7)
  g.generateTexture(TEX.splash, 24, 10)
  g.destroy()
  // Виньетка: радиальный градиент от прозрачного центра к тёмным краям
  const size = 256
  const tex = scene.textures.createCanvas(TEX.vignette, size, size)
  const ctx = tex?.getContext()
  if (tex && ctx) {
    const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.22, size / 2, size / 2, size * 0.72)
    grad.addColorStop(0, "rgba(8,10,16,0)")
    grad.addColorStop(0.55, "rgba(8,10,16,0.32)")
    grad.addColorStop(1, "rgba(6,8,12,0.78)")
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, size, size)
    tex.refresh()
  }
}

interface Drop {
  img: Phaser.GameObjects.Image
  vy: number
}

interface Splash {
  img: Phaser.GameObjects.Image
  t: number
}

export class RainLayer {
  private readonly scene: Phaser.Scene
  private readonly drops: Drop[] = []
  private readonly splashes: Splash[] = []
  private readonly wash: Phaser.GameObjects.Rectangle
  private readonly flash: Phaser.GameObjects.Rectangle
  private readonly vignette: Phaser.GameObjects.Image
  private readonly still: boolean
  private level = 0
  private target = 0
  private splashT = 0
  private flashT = 0
  private nextFlash = 25

  /** `still` — без движения (prefers-reduced-motion): только пелена и виньетка. */
  constructor(scene: Phaser.Scene, opts: { depth: number, still: boolean }) {
    this.scene = scene
    this.still = opts.still
    ensureRainTextures(scene)
    const { width, height } = scene.scale
    this.wash = scene.add.rectangle(0, 0, width, height, 0x141c2a, 0).setOrigin(0).setDepth(opts.depth)
    if (!this.still) {
      for (let i = 0; i < DROPS; i++) {
        const img = scene.add.image(0, 0, TEX.drop).setDepth(opts.depth + 1).setTint(0xb8c6da).setVisible(false)
        img.setRotation(Math.atan2(-WIND, 1))
        this.drops.push({ img, vy: 0 })
        this.respawn(this.drops[i] as Drop, true)
      }
      for (let i = 0; i < SPLASHES; i++)
        this.splashes.push({ img: scene.add.image(0, 0, TEX.splash).setDepth(opts.depth + 1).setTint(0xc8d4e4).setVisible(false), t: 1 })
    }
    this.flash = scene.add.rectangle(0, 0, width, height, 0xdfe8ff, 0).setOrigin(0).setDepth(opts.depth + 2)
    this.vignette = scene.add.image(0, 0, TEX.vignette).setOrigin(0).setDepth(opts.depth + 3)
    this.layout()
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this)
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this))
  }

  /** Целевая сила дождя 0…1: текущая догоняет её за пару секунд. */
  setLevel(level: number): void {
    this.target = Phaser.Math.Clamp(level, 0, 1)
  }

  update(dt: number): void {
    this.level += (this.target - this.level) * Math.min(1, dt * 0.8)
    if (Math.abs(this.level - this.target) < 0.002) this.level = this.target
    const lv = this.level
    this.wash.setFillStyle(0x141c2a, 0.26 * lv)
    if (this.still) return
    const { width, height } = this.scene.scale
    const active = Math.round(DROPS * lv)
    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i] as Drop
      if (i >= active) {
        d.img.setVisible(false)
        continue
      }
      if (!d.img.visible) this.respawn(d, true)
      d.img.y += d.vy * dt
      d.img.x += d.vy * WIND * dt
      if (d.img.y > height + 30 || d.img.x < -30) this.respawn(d, false)
    }
    // Брызги: чаще в сильный дождь
    this.splashT -= dt
    if (lv > 0.05 && this.splashT <= 0) {
      this.splashT = 0.05 / lv
      const s = this.splashes.find(x => x.t >= 1)
      if (s) {
        s.t = 0
        s.img.setPosition(Math.random() * width, height * 0.15 + Math.random() * height * 0.85).setVisible(true)
      }
    }
    for (const s of this.splashes) {
      if (s.t >= 1) continue
      s.t = Math.min(1, s.t + dt * 3.2)
      s.img.setScale(0.4 + s.t * 0.9).setAlpha((1 - s.t) * 0.55 * lv)
      if (s.t >= 1) s.img.setVisible(false)
    }
    // Зарница: изредка в сильный дождь — двойная вспышка
    this.nextFlash -= dt
    if (lv > 0.85 && this.nextFlash <= 0) {
      this.nextFlash = 30 + Math.random() * 40
      this.flashT = 0.6
    }
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt)
      const t = 0.6 - this.flashT
      const a = t < 0.08 ? 0.28 : t < 0.16 ? 0.05 : t < 0.24 ? 0.18 : Math.max(0, 0.18 - (t - 0.24) * 0.5)
      this.flash.setFillStyle(0xdfe8ff, a)
    }
  }

  /** Струя заново: сверху экрана (или в случайном месте — при первом появлении, чтобы дождь не шёл стеной). */
  private respawn(d: Drop, anywhere: boolean): void {
    const { width, height } = this.scene.scale
    d.vy = 900 + Math.random() * 450
    const y = anywhere ? Math.random() * height : -30 - Math.random() * 60
    d.img.setPosition(Math.random() * (width + height * -WIND), y)
    d.img.setScale(1, 0.7 + Math.random() * 0.6).setAlpha(0.28 + Math.random() * 0.3).setVisible(true)
  }

  private layout(): void {
    const { width, height } = this.scene.scale
    this.wash.setSize(width, height)
    this.flash.setSize(width, height)
    this.vignette.setDisplaySize(width, height)
  }
}
