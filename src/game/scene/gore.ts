import Phaser from "phaser"
import { $settings } from "@game/state/save"
import { reducedMotion } from "@game/ui/lib/animate"
import { blobOutline, goreRng } from "./goreShape"

/*
 * Кровь в стиле «cute & gory»: ярко-алые стилизованные брызги, капли по баллистике, кляксы и лужи на земле,
 * фонтаны и брызги «на камеру». Все текстуры процедурные (Graphics → generateTexture), уже окрашены, поэтому
 * блик и тёмная кайма видны без tint. Частицы — через общий бюджет на сцену, чтобы не задушить мобильный WebView.
 */

/* ---------- Палитра и настройки ---------- */

const RIM = 0x5e0812
const BODY = 0xc8102e
const BRIGHT = 0xe8233b
const HIGHLIGHT = 0xff9aa8
/** Оттенки для частиц (tint на белой текстуре). */
export const GORE_TINTS = [0xd9122b, 0x9e1420, 0xff2d4a, 0xb3001b, 0xe8233b]

export type GoreLevel = "sea" | "pools"

/** Уровень крови из настроек: «sea» — максимум, «pools» — сдержанно (меньше частиц, без брызг на камеру). */
export function goreEnabled(scene?: Phaser.Scene): { level: GoreLevel } {
  // Настройка общая на игру; сцена — на будущее (например, отключить кровь в превью)
  if (scene && !scene.sys) return { level: "pools" }
  let level: GoreLevel = "sea"
  try {
    level = $settings.get()?.blood === "pools" ? "pools" : "sea"
  }
  catch {
    level = "sea"
  }
  return { level }
}

function amount(): number {
  return goreEnabled().level === "sea" ? 1 : 0.5
}

function alive(scene: Phaser.Scene): boolean {
  if (!scene.sys) return false
  const status = scene.sys.settings.status
  return (
    scene.sys.isActive()
    || status === Phaser.Scenes.CREATING
    || status === Phaser.Scenes.START
    || status === Phaser.Scenes.INIT
  )
}

/* ---------- Детерминированный шум ---------- */

export { blobOutline, goreRng }

/* ---------- Текстуры ---------- */

export const GORE_TEX = {
  splat: (i: number) => `gore_splat_${i % SPLAT_VARIANTS}`,
  pool: (i: number) => `gore_pool_${i % POOL_VARIANTS}`,
  stain: (i: number) => `gore_stain_${i % STAIN_VARIANTS}`,
  screen: (i: number) => `gore_screen_${i % SCREEN_VARIANTS}`,
  drop: "gore_drop",
  vignette: "gore_vignette",
  mist: "gore_mist",
  arc: "gore_arc",
  chunk: "gore_chunk"
}
const SPLAT_VARIANTS = 6
const POOL_VARIANTS = 4
const STAIN_VARIANTS = 4
const SCREEN_VARIANTS = 3

function fillPoly(g: Phaser.GameObjects.Graphics, pts: { x: number, y: number }[], cx: number, cy: number, sx = 1, sy = 1): void {
  g.fillPoints(pts.map(p => new Phaser.Math.Vector2(cx + p.x * sx, cy + p.y * sy)), true, true)
}

/** Клякса: тёмная кайма, тело, светлая сердцевина, блик, капли-спутники и «лучи». */
function drawSplat(
  g: Phaser.GameObjects.Graphics,
  seed: number,
  w: number,
  h: number,
  opts: { rays: number, sats: number, sy: number }
): void {
  const rnd = goreRng(seed * 7919 + 13)
  const cx = w / 2
  const cy = h / 2
  const r = Math.min(w, h / opts.sy) * 0.3
  const outline = blobOutline(seed, 22, r, 0.32)
  // Лучи-потёки
  const rays: { a: number, len: number, wid: number }[] = []
  for (let i = 0; i < opts.rays; i++)
    rays.push({ a: rnd() * Math.PI * 2, len: r * (1.2 + rnd() * 0.5), wid: r * (0.12 + rnd() * 0.1) })
  const sats: { x: number, y: number, rr: number }[] = []
  for (let i = 0; i < opts.sats; i++) {
    const a = rnd() * Math.PI * 2
    const d = r * (1.25 + rnd() * 0.45)
    sats.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d * opts.sy, rr: r * (0.07 + rnd() * 0.13) })
  }
  const layer = (color: number, grow: number, alpha = 1): void => {
    g.fillStyle(color, alpha)
    fillPoly(g, outline, cx, cy, grow, grow * opts.sy)
    for (const ray of rays) {
      const ex = cx + Math.cos(ray.a) * ray.len * grow
      const ey = cy + Math.sin(ray.a) * ray.len * grow * opts.sy
      const px = Math.cos(ray.a + Math.PI / 2) * ray.wid * grow
      const py = Math.sin(ray.a + Math.PI / 2) * ray.wid * grow * opts.sy
      g.fillTriangle(cx + px, cy + py, cx - px, cy - py, ex, ey)
      g.fillCircle(ex, ey, ray.wid * 0.9 * grow)
    }
    for (const s of sats) g.fillCircle(s.x, s.y, s.rr * grow)
  }
  layer(RIM, 1.1)
  layer(BODY, 1)
  g.fillStyle(BRIGHT, 1)
  fillPoly(g, blobOutline(seed + 5, 16, r * 0.62, 0.25), cx - r * 0.1, cy - r * 0.08 * opts.sy, 1, opts.sy)
  g.fillStyle(HIGHLIGHT, 0.75)
  g.fillEllipse(cx - r * 0.35, cy - r * 0.32 * opts.sy, r * 0.42, r * 0.2 * opts.sy)
  g.fillStyle(0xffffff, 0.6)
  g.fillCircle(cx - r * 0.45, cy - r * 0.36 * opts.sy, r * 0.07)
}

/** Сгенерировать текстуры крови один раз на игру (менеджер текстур общий для сцен). */
export function ensureGoreTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(GORE_TEX.chunk)) return
  const g = scene.make.graphics({ x: 0, y: 0 }, false)
  for (let i = 0; i < SPLAT_VARIANTS; i++) {
    g.clear()
    drawSplat(g, 101 + i * 31, 96, 96, { rays: 3 + (i % 3), sats: 5 + (i % 4), sy: 1 })
    g.generateTexture(GORE_TEX.splat(i), 96, 96)
  }
  for (let i = 0; i < POOL_VARIANTS; i++) {
    g.clear()
    drawSplat(g, 503 + i * 17, 128, 96, { rays: 1 + (i % 2), sats: 3 + i, sy: 0.62 })
    g.generateTexture(GORE_TEX.pool(i), 128, 96)
  }
  for (let i = 0; i < STAIN_VARIANTS; i++) {
    g.clear()
    drawSplat(g, 907 + i * 11, 32, 32, { rays: i % 2, sats: 1 + (i % 3), sy: 0.8 })
    g.generateTexture(GORE_TEX.stain(i), 32, 32)
  }
  // Брызги «на камеру»: потёки вниз (под кляксой), затем сама клякса
  for (let i = 0; i < SCREEN_VARIANTS; i++) {
    g.clear()
    const rnd = goreRng(77 + i)
    for (let k = 0; k < 3 + i; k++) {
      const x = 52 + rnd() * 56
      const len = 40 + rnd() * 50
      const wid = 5 + rnd() * 5
      g.fillStyle(RIM, 1)
      g.fillRoundedRect(x - wid / 2 - 1.5, 100, wid + 3, len + 2, (wid + 3) / 2)
      g.fillCircle(x, 100 + len, wid * 0.85 + 1.5)
      g.fillStyle(BODY, 1)
      g.fillRoundedRect(x - wid / 2, 100, wid, len, wid / 2)
      g.fillCircle(x, 100 + len, wid * 0.85)
    }
    drawSplat(g, 1301 + i * 23, 160, 200, { rays: 4 + i, sats: 7, sy: 0.85 })
    g.generateTexture(GORE_TEX.screen(i), 160, 200)
  }
  // Капля: круглый низ и острый верх, кайма и блик
  g.clear()
  g.fillStyle(RIM, 1)
  g.fillCircle(8, 15, 7)
  g.fillTriangle(1.6, 13, 14.4, 13, 8, 0)
  g.fillStyle(BODY, 1)
  g.fillCircle(8, 15, 6)
  g.fillTriangle(2.6, 13.5, 13.4, 13.5, 8, 1.6)
  g.fillStyle(HIGHLIGHT, 0.85)
  g.fillEllipse(6, 14, 3.2, 4.4)
  g.generateTexture(GORE_TEX.drop, 16, 22)
  // Мягкая точка для взвеси (белая, красится tint)
  g.clear()
  for (let k = 8; k >= 1; k--) {
    g.fillStyle(0xffffff, 0.14 + (8 - k) * 0.09)
    g.fillCircle(8, 8, k)
  }
  g.generateTexture(GORE_TEX.mist, 16, 16)
  // Серп рассечения (белый, красится tint)
  g.clear()
  g.fillStyle(0xffffff, 1)
  g.beginPath()
  g.arc(32, 40, 30, Math.PI * 1.08, Math.PI * 1.92, false)
  g.arc(32, 46, 26, Math.PI * 1.9, Math.PI * 1.1, true)
  g.closePath()
  g.fillPath()
  g.generateTexture(GORE_TEX.arc, 64, 48)
  // Кусочек: неровный тёмно-алый комочек с бликом
  g.clear()
  g.fillStyle(RIM, 1)
  fillPoly(g, blobOutline(42, 9, 6.5, 0.35), 8, 8)
  g.fillStyle(0xa3122a, 1)
  fillPoly(g, blobOutline(42, 9, 5.2, 0.35), 8, 8)
  g.fillStyle(HIGHLIGHT, 0.8)
  g.fillCircle(6, 6, 1.6)
  g.generateTexture(GORE_TEX.chunk, 16, 16)
  g.destroy()
  // Виньет: прозрачный центр, алые края (тонировать весь экран нельзя — на зелёном поле выходит болотный цвет)
  const cv = scene.textures.createCanvas(GORE_TEX.vignette, 256, 256)
  const c2d = cv?.getContext()
  if (cv && c2d) {
    const grad = c2d.createRadialGradient(128, 128, 70, 128, 128, 182)
    grad.addColorStop(0, "rgba(158, 0, 22, 0)")
    grad.addColorStop(0.55, "rgba(158, 0, 22, 0.35)")
    grad.addColorStop(1, "rgba(110, 0, 14, 0.95)")
    c2d.fillStyle = grad
    c2d.fillRect(0, 0, 256, 256)
    cv.refresh()
  }
}

/* ---------- Бюджет частиц ---------- */

const MAX_PARTICLES = 150
const budget = new WeakMap<Phaser.Scene, number>()

/** Взять до `want` частиц из бюджета сцены на `ms`; вернёт, сколько можно. */
function take(scene: Phaser.Scene, want: number, ms: number): number {
  const used = budget.get(scene) ?? 0
  const n = Math.max(0, Math.min(Math.round(want), MAX_PARTICLES - used))
  if (n === 0) return 0
  budget.set(scene, used + n)
  scene.time.delayedCall(ms, () => budget.set(scene, Math.max(0, (budget.get(scene) ?? 0) - n)))
  return n
}

/* ---------- Пятна на земле ---------- */

const MAX_STAINS = 80
const stains = new WeakMap<Phaser.Scene, Phaser.GameObjects.Image[]>()

/** Глубина земли: под юнитами, над тайлами (карта) или над фоном (кинематик). */
function groundDepth(scene: Phaser.Scene): number {
  return scene.sys.settings.key === "Cinematic" ? 5 : 1.4
}

/** Маленькое пятно, куда упала капля. Старые пятна сверх лимита растворяются. */
export function groundStain(scene: Phaser.Scene, x: number, y: number, size: number, seed: number): void {
  if (!alive(scene)) return
  ensureGoreTextures(scene)
  const img = scene.add.image(x, y, GORE_TEX.stain(seed)).setDepth(groundDepth(scene))
  const s = size * (0.1 + (seed % 5) * 0.025)
  img.setDisplaySize(s, s * 0.75).setRotation((seed * 2.39) % 6.28).setScale(img.scaleX * 0.2, img.scaleY * 0.2)
  scene.tweens.add({ targets: img, scaleX: img.scaleX * 5, scaleY: img.scaleY * 5, duration: 140, ease: "Back.easeOut" })
  const list = stains.get(scene) ?? []
  list.push(img)
  while (list.length > MAX_STAINS) {
    const old = list.shift()
    if (old?.scene) scene.tweens.add({ targets: old, alpha: 0, duration: 400, onComplete: () => old.destroy() })
  }
  stains.set(scene, list)
}

/** Убрать все пятна сцены (смена раскладки поля — позиции клеток поменялись). */
export function clearGoreStains(scene: Phaser.Scene): void {
  for (const img of stains.get(scene) ?? []) if (img.scene) img.destroy()
  stains.set(scene, [])
}

/* ---------- Частицы ---------- */

interface SprayOptions {
  count: number
  angle: number
  spread: number
  speed: [number, number]
  gravity: number
  life: [number, number]
  scale: [number, number]
  tex?: string
  depth: number
  tints?: number[]
  orient?: boolean
  alphaEnd?: number
}

/** Веер частиц из точки. orient — капли поворачиваются по скорости. */
function spray(scene: Phaser.Scene, x: number, y: number, o: SprayOptions): void {
  const n = take(scene, o.count, o.life[1] + 100)
  if (n === 0) return
  const cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig = {
    speed: { min: o.speed[0], max: o.speed[1] },
    angle: { min: o.angle - o.spread, max: o.angle + o.spread },
    scale: { start: o.scale[0], end: o.scale[1] },
    alpha: { start: 1, end: o.alphaEnd ?? 0.4 },
    lifespan: { min: o.life[0], max: o.life[1] },
    gravityY: o.gravity,
    emitting: false,
    quantity: n
  }
  if (o.tints) cfg.tint = o.tints
  if (o.orient) {
    cfg.rotate = {
      onEmit: () => 0,
      onUpdate: (p: Phaser.GameObjects.Particles.Particle) =>
        Phaser.Math.RadToDeg(Math.atan2(p.velocityY, p.velocityX)) + 90
    } as unknown as Phaser.Types.GameObjects.Particles.EmitterOpOnUpdateType
  }
  const e = scene.add.particles(x, y, o.tex ?? GORE_TEX.drop, cfg)
  e.setDepth(o.depth)
  e.explode(n)
  scene.time.delayedCall(o.life[1] + 120, () => e.destroy())
}

/**
 * Крупные капли по баллистике: летят, падают на `groundY` и оставляют пятно.
 * Один tween на всю пачку (дешевле, чем по твину на каплю).
 */
function ballisticDrops(
  scene: Phaser.Scene,
  x: number,
  y: number,
  groundY: number,
  size: number,
  angleDeg: number,
  spread: number,
  count: number,
  speed: number,
  depth: number,
  seed: number
): void {
  const n = take(scene, count, 1400)
  if (n === 0) return
  const rnd = goreRng(seed)
  const g = size * 7
  const drops = Array.from({ length: n }, (_, i) => {
    const a = Phaser.Math.DegToRad(angleDeg + (rnd() * 2 - 1) * spread)
    const v = size * (1.4 + rnd() * 2.2)
    const img = scene.add.image(x, y, GORE_TEX.drop).setDepth(depth)
    const s = size * (0.07 + rnd() * 0.07)
    img.setDisplaySize(s, s * 1.35)
    return {
      img,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - size * (0.8 + rnd() * 1.2),
      land: groundY + (rnd() - 0.4) * size * 0.35,
      done: false,
      seed: seed + i
    }
  })
  const t0 = scene.time.now
  const proxy = { k: 0 }
  scene.tweens.add({
    targets: proxy,
    k: 1,
    duration: 1300 / speed,
    onUpdate: () => {
      const t = ((scene.time.now - t0) / 1000) * speed
      for (const d of drops) {
        if (d.done || !d.img.scene) continue
        const px = x + d.vx * t
        const py = y + d.vy * t + 0.5 * g * t * t
        const vy = d.vy + g * t
        if (vy > 0 && py >= d.land) {
          d.done = true
          groundStain(scene, px, d.land, size, d.seed)
          d.img.destroy()
          continue
        }
        d.img.setPosition(px, py).setRotation(Math.atan2(vy, d.vx) + Math.PI / 2)
      }
    },
    onComplete: () => drops.forEach(d => d.img.scene && d.img.destroy())
  })
}

/* ---------- Публичные эффекты ---------- */

export interface HitGoreOptions {
  /** Точка удара (мир). */
  x: number
  y: number
  /** Размер тайла/спрайта — масштаб эффекта. */
  size: number
  /** Направление удара: от атакующего к цели (не обязательно нормированное). */
  dirX: number
  dirY: number
  /** Сила удара → количество крови. */
  damage: number
  maxHp: number
  lethal: boolean
  /** Множитель скорости анимации (1 или 2). */
  speed: number
  depth?: number
  /** Где остаются капли на земле (лапы цели). */
  ground?: { x: number, y: number }
  kind?: "slash" | "pierce" | "blunt" | "magic" | "arrow"
}

let hitSeq = 1

/** Брызги при попадании: взвесь, капли конусом, крупные капли с пятнами, у сильного удара — струйка. */
export function hitGore(scene: Phaser.Scene, o: HitGoreOptions): void {
  if (!alive(scene) || o.damage <= 0) return
  ensureGoreTextures(scene)
  const level = amount()
  const ratio = Math.max(0, Math.min(1, o.damage / Math.max(1, o.maxHp)))
  const power = (o.lethal ? 1.35 : 0.45 + ratio * 1.25) * level
  const ang = Phaser.Math.RadToDeg(Math.atan2(o.dirY, o.dirX || 0.0001))
  const kind = o.kind ?? "slash"
  const depth = o.depth ?? 24
  const s = o.size
  const sp = o.speed
  const seed = hitSeq++ * 977
  const narrow = kind === "pierce" || kind === "arrow"
  const spread = kind === "blunt" ? 180 : narrow ? 14 : kind === "slash" ? 48 : 36

  // Взвесь — мелкая алая пыль, быстро тает
  spray(scene, o.x, o.y, {
    count: 6 + power * 14,
    angle: ang,
    spread: spread + 10,
    speed: [s * 0.6, s * 2.6],
    gravity: s * 2,
    life: [220 / sp, 520 / sp],
    scale: [0.9 * (s / 64), 0.1],
    tex: GORE_TEX.mist,
    tints: GORE_TINTS,
    depth: depth + 0.5,
    alphaEnd: 0
  })
  // Капли конусом по направлению удара, падают под гравитацией
  spray(scene, o.x, o.y, {
    count: 8 + power * 20,
    angle: ang,
    spread,
    speed: [s * 1.2, s * (narrow ? 5 : 3.8)],
    gravity: s * 9,
    life: [380 / sp, 760 / sp],
    scale: [0.42 * (s / 64), 0.12 * (s / 64)],
    depth,
    orient: true
  })
  // Крупные капли оставляют пятна на земле
  if (o.ground)
    ballisticDrops(scene, o.x, o.y, o.ground.y, s, ang, spread * 0.7, 2 + power * 5, sp, depth, seed)

  switch (kind) {
    case "slash": {
      // Алый серп рассечения
      const arc = scene.add.image(o.x, o.y, GORE_TEX.arc).setTint(0xff2d4a).setDepth(depth + 1).setAlpha(0.95)
      arc.setDisplaySize(s * 0.9, s * 0.6).setRotation(Phaser.Math.DegToRad(ang + 90)).setScale(arc.scaleX * 0.4, arc.scaleY)
      scene.tweens.add({
        targets: arc,
        scaleX: arc.scaleX * 2.6,
        alpha: 0,
        duration: 220 / sp,
        ease: "Quad.easeOut",
        onComplete: () => arc.destroy()
      })
      break
    }
    case "blunt": {
      // «Шмяк»: приплюснутая клякса прямо в точке удара
      const blob = scene.add.image(o.x, o.y, GORE_TEX.splat(seed)).setDepth(depth + 0.6).setAlpha(0.95)
      blob.setDisplaySize(s * 0.25, s * 0.25)
      scene.tweens.add({
        targets: blob,
        displayWidth: s * (0.8 + power * 0.25),
        displayHeight: s * (0.45 + power * 0.15),
        alpha: 0,
        duration: 320 / sp,
        ease: "Cubic.easeOut",
        onComplete: () => blob.destroy()
      })
      break
    }
    case "magic": {
      // Кипящие брызги: розовый пар поднимается, искры шипят
      spray(scene, o.x, o.y, {
        count: 6 + power * 8,
        angle: -90,
        spread: 50,
        speed: [s * 0.3, s * 0.9],
        gravity: -s * 1.5,
        life: [500 / sp, 900 / sp],
        scale: [1.1 * (s / 64), 2.2 * (s / 64)],
        tex: GORE_TEX.mist,
        tints: [0xff9aa8, 0xffc2cb, 0xd9122b],
        depth: depth + 0.4,
        alphaEnd: 0
      })
      break
    }
    default: {
      // Узкая струя для колющих: короткая серия капель вдоль удара
      const shots = Math.round(3 + power * 3)
      for (let i = 0; i < shots; i++) {
        scene.time.delayedCall((i * 35) / sp, () => {
          if (!alive(scene)) return
          spray(scene, o.x, o.y, {
            count: 3,
            angle: ang,
            spread: 6,
            speed: [s * 3, s * 5.2],
            gravity: s * 7,
            life: [300 / sp, 520 / sp],
            scale: [0.36 * (s / 64), 0.12 * (s / 64)],
            depth,
            orient: true
          })
        })
      }
    }
  }

  // Сильный удар — пульсирующая струйка из раны
  if (o.lethal || ratio > 0.35) bloodSquirt(scene, o.x, o.y, s, ang - 35 * Math.sign(o.dirX || 1), 280 / sp, depth, o.ground?.y)
  if (o.lethal && level === 1) screenBloodSplat(scene, 0.35 + ratio * 0.4, sp)
}

/** Пульсирующая струйка: несколько залпов капель вверх-вбок. */
export function bloodSquirt(
  scene: Phaser.Scene,
  x: number,
  y: number,
  size: number,
  angleDeg: number,
  ms: number,
  depth = 24,
  groundY?: number
): void {
  if (!alive(scene)) return
  ensureGoreTextures(scene)
  const pulses = Math.max(2, Math.round((ms / 70) * amount()))
  for (let i = 0; i < pulses; i++) {
    scene.time.delayedCall(i * 70, () => {
      if (!alive(scene)) return
      spray(scene, x, y, {
        count: 4,
        angle: angleDeg - 10 + (i % 2) * 20,
        spread: 10,
        speed: [size * 1.6, size * 3],
        gravity: size * 8,
        life: [420, 700],
        scale: [0.4 * (size / 64), 0.15 * (size / 64)],
        depth,
        orient: true
      })
      if (groundY !== undefined && i % 2 === 0)
        ballisticDrops(scene, x, y, groundY, size, angleDeg, 12, 1, 1, depth, i * 31 + Math.round(x))
    })
  }
}

/** Фонтан крови вверх из точки на `ms`: залпы капель, падающих вокруг с пятнами. Для гибели. */
export function bloodFountain(
  scene: Phaser.Scene,
  x: number,
  y: number,
  groundY: number,
  size: number,
  ms: number,
  speed: number,
  depth = 24
): void {
  if (!alive(scene)) return
  ensureGoreTextures(scene)
  const step = 60
  const pulses = Math.max(3, Math.round((ms / step) * amount()))
  for (let i = 0; i < pulses; i++) {
    scene.time.delayedCall((i * step) / speed, () => {
      if (!alive(scene)) return
      const fade = 1 - i / pulses
      spray(scene, x, y, {
        count: 3 + Math.round(5 * fade),
        angle: -90,
        spread: 22,
        speed: [size * 2 * (0.6 + fade * 0.6), size * 4.2 * (0.6 + fade * 0.6)],
        gravity: size * 9,
        life: [500 / speed, 900 / speed],
        scale: [0.45 * (size / 64), 0.15 * (size / 64)],
        depth,
        orient: true
      })
      if (i % 2 === 0) ballisticDrops(scene, x, y, groundY, size, -90, 40, 2, speed, depth, i * 53 + Math.round(y))
    })
  }
}

/** Капли за раненым при движении: пара капель и пятнышко на земле в (x, y). */
export function bloodTrail(scene: Phaser.Scene, x: number, y: number, size: number, speed: number, depth?: number): void {
  if (!alive(scene)) return
  ensureGoreTextures(scene)
  const seed = hitSeq++ * 131
  spray(scene, x, y - size * 0.25, {
    count: 2,
    angle: 90,
    spread: 25,
    speed: [size * 0.2, size * 0.6],
    gravity: size * 6,
    life: [180 / speed, 260 / speed],
    scale: [0.3 * (size / 64), 0.15 * (size / 64)],
    depth: depth ?? 24,
    orient: true
  })
  scene.time.delayedCall(160 / speed, () => groundStain(scene, x + ((seed % 9) - 4) * size * 0.02, y, size, seed))
}

const lastScreenSplat = new WeakMap<Phaser.Scene, number>()

/** Кровь «на камеру»: несколько клякс в углах экрана стекают вниз, плюс красный виньет. Не чаще раза в 0.4 с. */
export function screenBloodSplat(scene: Phaser.Scene, intensity: number, speed: number): void {
  if (!alive(scene)) return
  const now = scene.time.now
  if (now - (lastScreenSplat.get(scene) ?? -1e9) < 400) return
  lastScreenSplat.set(scene, now)
  ensureGoreTextures(scene)
  const k = Math.max(0, Math.min(1, intensity))
  const cam = scene.cameras.main
  const w = cam.width
  const h = cam.height
  // Красный виньет по краям — всегда, это не «тряска»
  const vig = scene.add.image(w / 2, h / 2, GORE_TEX.vignette).setScrollFactor(0).setDepth(95).setAlpha(0)
  vig.setDisplaySize(w, h)
  scene.tweens.add({
    targets: vig,
    alpha: 0.45 + k * 0.5,
    duration: 70 / speed,
    yoyo: true,
    hold: 90 / speed,
    onComplete: () => vig.destroy()
  })
  if (goreEnabled().level !== "sea" || reducedMotion()) return
  const count = Math.max(1, Math.round(k * 3))
  const rnd = goreRng(Math.round(now) + count)
  // Углы экрана в случайном порядке: брызги не закрывают центр поля
  const corners = [
    [0.08, 0.14],
    [0.92, 0.12],
    [0.1, 0.86],
    [0.9, 0.84]
  ].sort(() => rnd() - 0.5)
  for (let i = 0; i < count; i++) {
    const [cx, cy] = corners[i % corners.length] ?? [0.1, 0.1]
    const x = w * (cx + (rnd() - 0.5) * 0.08)
    const y = h * (cy + (rnd() - 0.5) * 0.06)
    const s = Math.min(w, h) * (0.22 + rnd() * 0.12) * (0.75 + k * 0.4)
    const img = scene.add
      .image(x, y, GORE_TEX.screen(i + Math.round(rnd() * 3)))
      .setScrollFactor(0)
      .setDepth(96)
      .setRotation((rnd() - 0.5) * 0.5)
    img.setDisplaySize(s, s * 1.25)
    const sx = img.scaleX
    const sy = img.scaleY
    img.setScale(sx * 0.3, sy * 0.3)
    scene.tweens.add({ targets: img, scaleX: sx, scaleY: sy, duration: 90 / speed, ease: "Back.easeOut" })
    scene.tweens.add({
      targets: img,
      y: y + s * 0.3,
      scaleY: sy * 1.15,
      alpha: 0,
      delay: 520 / speed,
      duration: 900 / speed,
      ease: "Quad.easeIn",
      onComplete: () => img.destroy()
    })
  }
}

/* ---------- Кляксы и лужи на земле (декали карты) ---------- */

/**
 * Декаль крови: клякса (splat) или лужа (pool), вид детерминирован по seed. animate — лужа растекается
 * и со временем темнеет; при перерисовке поля (смена раскладки) — сразу итоговый вид.
 */
export function goreDecal(
  scene: Phaser.Scene,
  x: number,
  y: number,
  size: number,
  kind: "splat" | "pool",
  seed: number,
  animate = true
): Phaser.GameObjects.Image {
  ensureGoreTextures(scene)
  const rnd = goreRng(seed * 7 + (kind === "pool" ? 3 : 1))
  const key = kind === "pool" ? GORE_TEX.pool(seed) : GORE_TEX.splat(seed)
  const img = scene.add.image(x, y, key).setDepth(1)
  const scale = kind === "pool" ? size * (1.15 + rnd() * 0.3) : size * (0.45 + rnd() * 0.25)
  img.setDisplaySize(scale, kind === "pool" ? scale * 0.75 : scale)
  img.setRotation(kind === "pool" ? (rnd() - 0.5) * 0.5 : rnd() * Math.PI * 2)
  img.setAlpha(kind === "pool" ? 0.92 : 0.88)
  const dark = kind === "pool" ? 0xb48a8e : 0xc9a0a4
  if (!animate || !alive(scene)) {
    img.setTint(dark)
    return img
  }
  const sx = img.scaleX
  const sy = img.scaleY
  if (kind === "pool") {
    // Лужа растекается из-под тела, затем медленно темнеет
    img.setScale(sx * 0.15, sy * 0.15)
    scene.tweens.add({ targets: img, scaleX: sx, scaleY: sy, duration: 1400, ease: "Cubic.easeOut" })
  }
  else {
    img.setScale(sx * 0.3, sy * 0.3)
    scene.tweens.add({ targets: img, scaleX: sx, scaleY: sy, duration: 160, ease: "Back.easeOut" })
  }
  const proxy = { k: 0 }
  scene.tweens.add({
    targets: proxy,
    k: 1,
    delay: 600,
    duration: kind === "pool" ? 6000 : 4000,
    onUpdate: () => {
      if (!img.scene) return
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.IntegerToColor(0xffffff),
        Phaser.Display.Color.IntegerToColor(dark),
        100,
        Math.round(proxy.k * 100)
      )
      img.setTint(Phaser.Display.Color.GetColor(c.r, c.g, c.b))
    }
  })
  return img
}

/**
 * Общий веер брызг (прежний `bloodBurst`): взвесь + капли по скорости + кусочки при крупных выбросах.
 * angle — диапазон градусов (Phaser: 0 вправо, 90 вниз), null — во все стороны.
 */
export function goreBurst(
  scene: Phaser.Scene,
  x: number,
  y: number,
  count: number,
  angle: { min: number, max: number } | null,
  scale = 1,
  speed = 1
): void {
  if (!alive(scene)) return
  ensureGoreTextures(scene)
  const k = amount()
  const mid = angle ? (angle.min + angle.max) / 2 : 0
  const spread = angle ? Math.abs(angle.max - angle.min) / 2 : 180
  const sz = 64 * scale
  spray(scene, x, y, {
    count: count * 0.5 * k,
    angle: mid,
    spread: spread + 8,
    speed: [sz * 0.6, sz * 2.4],
    gravity: sz * 2,
    life: [240 / speed, 520 / speed],
    scale: [0.9 * scale, 0.1],
    tex: GORE_TEX.mist,
    tints: GORE_TINTS,
    depth: 24.5,
    alphaEnd: 0
  })
  spray(scene, x, y, {
    count: count * 1.1 * k,
    angle: mid,
    spread,
    speed: [sz * 1.1, sz * 3.8],
    gravity: sz * 8,
    life: [380 / speed, 800 / speed],
    scale: [0.45 * scale, 0.12 * scale],
    depth: 24,
    orient: true
  })
  if (count >= 20)
    spray(scene, x, y, {
      count: Math.round(count / 10) * k,
      angle: mid,
      spread,
      speed: [sz * 1, sz * 2.6],
      gravity: sz * 7,
      life: [500 / speed, 900 / speed],
      scale: [0.7 * scale, 0.5 * scale],
      tex: GORE_TEX.chunk,
      depth: 24,
      alphaEnd: 0.8
    })
}

/** Одна-две капли падают из (x, y) на землю `groundY` и оставляют пятно — след летящей части тела. */
export function bloodDrip(
  scene: Phaser.Scene,
  x: number,
  y: number,
  groundY: number,
  size: number,
  speed: number,
  depth = 24
): void {
  if (!alive(scene) || (amount() < 1 && hitSeq % 2 === 0)) return
  ensureGoreTextures(scene)
  ballisticDrops(scene, x, y, groundY, size * 0.6, 90, 40, 1, speed, depth, hitSeq++ * 17)
}
