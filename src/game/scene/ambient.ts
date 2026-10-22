import Phaser from "phaser"
import type { BoardLayout } from "./layout"
import { ENV, ensureEnvTextures } from "./env"
import { TEX } from "./textures"

/**
 * Атмосфера поля боя по биому: тени облаков ползут по полю, лучи света, лампы и светлячки,
 * блики на снегу, льду и воде, цветокор и виньетка. Чисто презентация: один цикл UPDATE,
 * объекты создаются при постройке поля и уничтожаются в destroy().
 */

interface AmbientDef {
  /** Число облаков-теней и их прозрачность. */
  clouds: number
  cloudAlpha: number
  /** Лучи света: число, цвет, прозрачность, наклон (град). */
  rays: number
  rayColor: number
  rayAlpha: number
  rayAngle: number
  /** Цветокор поверх поля. */
  grade?: { color: number, alpha: number, mode: "multiply" | "add" }
  /** Тёплые лампы (подвал): мягкий свет с мерцанием. */
  lamps: number
  lampColor: number
  /** Светлячки (ADD-точки, блуждают и пульсируют). */
  fireflies: number
  fireflyColor: number
  /** Блики-искры на равнине (снег, лёд, песок). */
  glints: number
  glintColor: number
  vignette: number
}

const DEFAULT: AmbientDef = {
  clouds: 2,
  cloudAlpha: 0.2,
  rays: 0,
  rayColor: 0xfff3c0,
  rayAlpha: 0.14,
  rayAngle: -24,
  lamps: 0,
  lampColor: 0xffd27a,
  fireflies: 0,
  fireflyColor: 0xd8ff7a,
  glints: 0,
  glintColor: 0xffffff,
  vignette: 0.38
}

const AMBIENT: Record<string, Partial<AmbientDef>> = {
  yard: { clouds: 3, rays: 3, rayAlpha: 0.15, vignette: 0.36 },
  roofs: {
    clouds: 2,
    rays: 2,
    rayColor: 0xffb070,
    rayAlpha: 0.11,
    rayAngle: -34,
    grade: { color: 0xff9a5a, alpha: 0.07, mode: "add" },
    vignette: 0.45
  },
  basement: {
    clouds: 0,
    rays: 2,
    rayColor: 0xfff0c8,
    rayAlpha: 0.13,
    rayAngle: -18,
    grade: { color: 0x2c2840, alpha: 0.34, mode: "multiply" },
    lamps: 2,
    fireflies: 0,
    vignette: 0.62
  },
  dump: { clouds: 2, grade: { color: 0xc8c070, alpha: 0.12, mode: "multiply" }, vignette: 0.48 },
  winter_park: {
    clouds: 2,
    cloudAlpha: 0.1,
    glints: 9,
    glintColor: 0xe6f6ff,
    grade: { color: 0xbfdcff, alpha: 0.05, mode: "add" },
    vignette: 0.3
  },
  jungle: {
    clouds: 1,
    rays: 4,
    rayColor: 0xe9ffb0,
    rayAlpha: 0.1,
    rayAngle: -16,
    fireflies: 10,
    grade: { color: 0x2f6a3a, alpha: 0.16, mode: "multiply" },
    vignette: 0.52
  },
  desert: {
    clouds: 1,
    cloudAlpha: 0.1,
    glints: 5,
    glintColor: 0xfff6d0,
    grade: { color: 0xffc070, alpha: 0.06, mode: "add" },
    vignette: 0.34
  },
  glacier: { clouds: 2, rays: 2, rayColor: 0xd8f0ff, rayAlpha: 0.1, glints: 12, glintColor: 0xd8f4ff, vignette: 0.4 },
  canyon: {
    clouds: 2,
    rays: 2,
    rayColor: 0xffa060,
    rayAlpha: 0.1,
    rayAngle: -30,
    grade: { color: 0xff8a50, alpha: 0.06, mode: "add" },
    fireflies: 4,
    fireflyColor: 0xffb060,
    vignette: 0.46
  }
}

export function ambientDef(biomeId: string): AmbientDef {
  return { ...DEFAULT, ...(AMBIENT[biomeId] ?? {}) }
}

interface Drifter {
  img: Phaser.GameObjects.Image
  vx: number
  vy: number
  phase: number
  base: number
}

export interface AmbientOptions {
  biomeId: string
  layout: BoardLayout
  seed: number
  /** Центры клеток воды — для искр на воде. */
  water: { x: number, y: number }[]
  /** Центры клеток равнины — для бликов (снег, лёд, песок). */
  plain: { x: number, y: number }[]
}

export class AmbientLayer {
  private readonly scene: Phaser.Scene
  private readonly objs: Phaser.GameObjects.GameObject[] = []
  private readonly clouds: Drifter[] = []
  private readonly rays: Drifter[] = []
  private readonly lamps: Drifter[] = []
  private readonly flies: Drifter[] = []
  private readonly glints: { img: Phaser.GameObjects.Image, t: number, life: number, spots: { x: number, y: number }[] }[] = []
  private readonly layout: BoardLayout
  private destroyed = false
  private elapsed = 0

  constructor(scene: Phaser.Scene, opts: AmbientOptions) {
    this.scene = scene
    this.layout = opts.layout
    ensureEnvTextures(scene)
    const def = ambientDef(opts.biomeId)
    const l = opts.layout
    const bw = l.tile * 6
    const bh = l.tile * 8
    const w = scene.scale.width
    const h = scene.scale.height
    let s = opts.seed >>> 0
    const rnd = (): number => {
      s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0
      return (s % 10000) / 10000
    }

    // Тень под полем: доска «лежит» над фоном
    const shadow = scene.add
      .image(l.ox + bw / 2 + l.tile * 0.12, l.oy + bh / 2 + l.tile * 0.22, ENV.boardShadow)
      .setDisplaySize(bw * 1.35, bh * 1.3)
      .setAlpha(0.6)
      .setDepth(-1)
    this.objs.push(shadow)

    // Облака-тени: крупные мягкие пятна, ползут по полю и за его пределами
    for (let i = 0; i < def.clouds; i++) {
      const img = scene.add
        .image(l.ox + rnd() * bw, l.oy + rnd() * bh, ENV.cloud)
        .setTint(0x000000)
        .setAlpha(def.cloudAlpha)
        .setDepth(15)
        .setDisplaySize(l.tile * (3.2 + rnd() * 1.6), l.tile * (2 + rnd()))
      this.objs.push(img)
      this.clouds.push({ img, vx: l.tile * (0.12 + rnd() * 0.08), vy: l.tile * 0.03, phase: rnd() * 6, base: def.cloudAlpha })
    }

    // Лучи света: наклонные полосы ADD с медленной пульсацией
    for (let i = 0; i < def.rays; i++) {
      const img = scene.add
        .image(l.ox + bw * (0.12 + (i + rnd() * 0.5) / Math.max(1, def.rays)), l.oy - l.tile * 0.8, ENV.beam)
        .setOrigin(0.5, 0)
        .setTint(def.rayColor)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAngle(def.rayAngle)
        .setDepth(16)
        .setDisplaySize(l.tile * (0.8 + rnd() * 0.9), bh * 1.2)
        .setAlpha(def.rayAlpha)
      this.objs.push(img)
      this.rays.push({ img, vx: 0, vy: 0, phase: rnd() * 6, base: def.rayAlpha * (0.7 + rnd() * 0.6) })
    }

    // Цветокор и лампы
    if (def.grade) {
      const g = scene.add
        .image(w / 2, h / 2, TEX.square)
        .setDisplaySize(w * 1.2, h * 1.2)
        .setTint(def.grade.color)
        .setAlpha(def.grade.alpha)
        .setBlendMode(def.grade.mode === "add" ? Phaser.BlendModes.ADD : Phaser.BlendModes.MULTIPLY)
        .setDepth(18)
      this.objs.push(g)
    }
    for (let i = 0; i < def.lamps; i++) {
      const img = scene.add
        .image(l.ox + bw * (0.25 + i * 0.5), l.oy + bh * (0.3 + 0.35 * (i % 2)), ENV.light)
        .setTint(def.lampColor)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(18.5)
        .setDisplaySize(l.tile * 5, l.tile * 5)
        .setAlpha(0.32)
      this.objs.push(img)
      this.lamps.push({ img, vx: 0, vy: 0, phase: rnd() * 6, base: 0.32 })
    }

    // Светлячки
    for (let i = 0; i < def.fireflies; i++) {
      const img = scene.add
        .image(l.ox + rnd() * bw, l.oy + rnd() * bh, ENV.light)
        .setTint(def.fireflyColor)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(17)
        .setDisplaySize(l.tile * 0.32, l.tile * 0.32)
      this.objs.push(img)
      this.flies.push({ img, vx: (rnd() - 0.5) * l.tile * 0.4, vy: (rnd() - 0.5) * l.tile * 0.4, phase: rnd() * 6, base: 0.9 })
    }

    // Блики на снегу/льду/песке и искры на воде: короткие вспышки звёздочек в случайных клетках
    const glintSpots = opts.plain
    const add = (count: number, spots: { x: number, y: number }[], color: number): void => {
      if (spots.length === 0) return
      for (let i = 0; i < count; i++) {
        const img = scene.add
          .image(0, 0, TEX.star)
          .setTint(color)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(17)
          .setAlpha(0)
        this.objs.push(img)
        this.glints.push({ img, t: rnd() * 2, life: 0.9 + rnd() * 0.8, spots })
      }
    }
    add(def.glints, glintSpots, def.glintColor)
    add(Math.min(10, Math.ceil(opts.water.length * 0.8)), opts.water, 0xffffff)

    // Виньетка поверх всего поля
    if (def.vignette > 0) {
      const v = scene.add
        .image(w / 2, h / 2, ENV.vignette)
        .setDisplaySize(Math.max(w, h) * 1.25, Math.max(w, h) * 1.25)
        .setAlpha(def.vignette)
        .setDepth(19)
      this.objs.push(v)
    }

    scene.events.on(Phaser.Scenes.Events.UPDATE, this.update, this)
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this)
  }

  private update(_t: number, deltaMs: number): void {
    if (this.destroyed) return
    const dt = Math.min(0.05, deltaMs / 1000)
    this.elapsed += dt
    const l = this.layout
    const minX = l.ox - l.tile * 3
    const maxX = l.ox + l.tile * 9
    for (const c of this.clouds) {
      c.img.x += c.vx * dt
      c.img.y += Math.sin(this.elapsed * 0.2 + c.phase) * c.vy * dt
      if (c.img.x > maxX) c.img.x = minX
    }
    for (const r of this.rays) r.img.setAlpha(r.base * (0.6 + 0.4 * Math.sin(this.elapsed * 0.6 + r.phase)))
    for (const m of this.lamps) {
      // Мерцание лампы: медленная волна и редкий «моргок»
      const flick = Math.sin(this.elapsed * 13 + m.phase) > 0.985 ? 0.55 : 1
      m.img.setAlpha(m.base * (0.85 + 0.15 * Math.sin(this.elapsed * 2.1 + m.phase)) * flick)
    }
    const bx0 = l.ox
    const by0 = l.oy
    const bx1 = l.ox + l.tile * 6
    const by1 = l.oy + l.tile * 8
    for (const f of this.flies) {
      f.vx += (Math.random() - 0.5) * l.tile * 1.2 * dt
      f.vy += (Math.random() - 0.5) * l.tile * 1.2 * dt
      const cap = l.tile * 0.5
      f.vx = Phaser.Math.Clamp(f.vx, -cap, cap)
      f.vy = Phaser.Math.Clamp(f.vy, -cap, cap)
      f.img.x += f.vx * dt
      f.img.y += f.vy * dt
      if (f.img.x < bx0 || f.img.x > bx1) f.vx = -f.vx
      if (f.img.y < by0 || f.img.y > by1) f.vy = -f.vy
      f.img.setAlpha(0.25 + 0.75 * Math.max(0, Math.sin(this.elapsed * 2.4 + f.phase)))
    }
    for (const g of this.glints) {
      g.t -= dt
      if (g.t <= 0) {
        const spot = g.spots[Math.floor(Math.random() * g.spots.length)]
        if (spot) {
          g.img.setPosition(
            spot.x + (Math.random() - 0.5) * l.tile * 0.8,
            spot.y + (Math.random() - 0.5) * l.tile * 0.8
          )
        }
        g.life = 0.7 + Math.random() * 0.7
        g.t = g.life + Math.random() * 2.5
        g.img.setData("born", this.elapsed)
      }
      const born = (g.img.getData("born") as number | undefined) ?? -10
      const age = this.elapsed - born
      const k = age < g.life ? Math.sin((age / g.life) * Math.PI) : 0
      g.img.setAlpha(k)
      g.img.setScale((l.tile / 64) * (0.6 + k * 0.7))
      g.img.setAngle(age * 120)
    }
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this)
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this)
    for (const o of this.objs) o.destroy()
    this.objs.length = 0
  }
}
