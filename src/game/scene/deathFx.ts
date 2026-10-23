import Phaser from "phaser"
import type { Side, UnitInstance } from "@game/core/types"
import type { ArtWeapon } from "@game/art/index"
import { CRITTER_PART_ANCHORS, VIEW, unitMounted, type CritterPart } from "@game/art/index"
import { FUR_PALETTES } from "@game/content/appearance"
import { TEX } from "./textures"
import { textStyle } from "./style"
import { bloodBurst, dustPuff, ichorSplash, sceneAlive, tween, wait } from "./fx"
import {
  GORE_TEX,
  bloodDrip,
  bloodFountain,
  bloodSquirt,
  ensureGoreTextures,
  goreEnabled,
  groundStain,
  hitGore,
  screenBloodSplat
} from "./gore"
import { reducedMotion } from "@game/ui/lib/animate"
import { UnitView } from "./UnitView"
import { ensureUnitPartTextures, hasTexture, withTimeout, type UnitTexSize } from "./svgTextures"
import { tr } from "@game/i18n"

import { deathHash as hash, type DeathVariant } from "./deathVariants"
export { DEATH_VARIANTS, deathSeed, pickDeathVariant, type DeathVariant } from "./deathVariants"

/* Варианты гибели: милые и кровавые. Выбор варианта — `deathVariants.ts`. */

/** Детерминированный ГПСЧ (LCG) для разброса частей и обломков. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** Подгрузить части тела с потолком по времени; undefined — не успели (вариант откатится к безопасному). */
export async function preloadDeathParts(
  scene: Phaser.Scene,
  unit: UnitInstance,
  size: UnitTexSize,
  ms: number
): Promise<Record<CritterPart, string> | undefined> {
  const r = await withTimeout(ensureUnitPartTextures(scene, unit, size), ms)
  return r ?? undefined
}

/* ---------- Контекст и «тело» ---------- */

export interface DeathCtx {
  scene: Phaser.Scene
  variant: DeathVariant
  /** Спрайт кинематика (Image, origin 0.5/0.97) или вид юнита на карте. */
  sprite: Phaser.GameObjects.Image | UnitView
  unit: UnitInstance
  /** Ключи текстур частей тела (если успели загрузиться). */
  parts?: Record<CritterPart, string>
  /** Мировая позиция лап. */
  x: number
  y: number
  /** Высота миниатюры (кинематик) или размер клетки (карта). */
  size: number
  /** Направление удара: куда летит тело. */
  dir: 1 | -1
  speed: number
  side: Side
  /** Вызвать, когда пора положить лужу (каждый вариант — в свой момент). */
  onPool?: () => void
  killerKind?: ArtWeapon
}

type Mode = "cine" | "map"

interface Body {
  scene: Phaser.Scene
  mode: Mode
  /** Объект для твинов положения/поворота/масштаба (Image в кинематике, контейнер тела на карте). */
  t: Phaser.GameObjects.Image | Phaser.GameObjects.Container
  img: Phaser.GameObjects.Image | null
  x0: number
  y0: number
  /** Локальный сдвиг лап относительно `t` — чтобы масштабировать «от лап». */
  feetOffset: number
  /** Мировой прямоугольник спрайта. */
  w: number
  h: number
  left: number
  top: number
  flipX: boolean
  depth: number
  furColor: number
  /** Временные объекты карты — уничтожаем после анимации. */
  temps: Phaser.GameObjects.GameObject[]
  /** Исходный масштаб `t` (у спрайта кинематика он не 1: текстура крупнее показа). */
  sx0: number
  sy0: number
  /** Всадник: части тела в SVG сдвинуты `RIDER_TRANSFORM`. */
  mounted: boolean
  /** Объекты, приклеенные к телу (`glue`). */
  glued: { obj: Glued, lx: number, ly: number, rot: number }[]
  /** Снять слушатели/таймеры варианта — вызывается всегда, даже при обрыве. */
  cleanup: (() => void)[]
}

type Glued = Phaser.GameObjects.Image | Phaser.GameObjects.Graphics

const ART_RATIO = 120 / 140

function makeBody(ctx: DeathCtx, mode: Mode): Body {
  const furColor = FUR_PALETTES[ctx.unit.appearance.furPalette]?.color ?? 0xcccccc
  if (ctx.sprite instanceof UnitView) {
    const view = ctx.sprite
    const rig = view.bodyRig()
    const img = view.bodyImage()
    let w = ctx.size * 1.05 * ART_RATIO
    let h = ctx.size * 1.05
    let left = ctx.x - w / 2
    let top = ctx.y - h * 0.97
    let flipX = false
    if (img) {
      const m = img.getWorldTransformMatrix()
      w = Math.abs(img.width * m.scaleX)
      h = Math.abs(img.height * m.scaleY)
      left = m.tx - img.originX * w
      top = m.ty - img.originY * h
      flipX = img.flipX
    }
    return {
      scene: ctx.scene,
      mode,
      t: rig,
      img,
      x0: rig.x,
      y0: rig.y,
      feetOffset: view.feetLocalY(),
      w,
      h,
      left,
      top,
      flipX,
      depth: 11,
      furColor,
      temps: [],
      sx0: rig.scaleX || 1,
      sy0: rig.scaleY || 1,
      mounted: unitMounted(ctx.unit),
      glued: [],
      cleanup: []
    }
  }
  const img = ctx.sprite
  const w = img.displayWidth
  const h = img.displayHeight
  return {
    scene: ctx.scene,
    mode,
    t: img,
    img,
    x0: img.x,
    y0: img.y,
    feetOffset: 0,
    w,
    h,
    left: img.x - img.originX * w,
    top: img.y - img.originY * h,
    flipX: img.flipX,
    depth: 10,
    furColor,
    temps: [],
    sx0: img.scaleX || 1,
    sy0: img.scaleY || 1,
    mounted: unitMounted(ctx.unit),
    glued: [],
    cleanup: []
  }
}

/* ---------- Общие помощники ---------- */

function alive(b: Body): boolean {
  return sceneAlive(b.scene) && !!(b.t as { scene?: Phaser.Scene }).scene
}

/** Белая вспышка тела (при reduced motion — без вспышек). */
function flash(b: Body, ms: number): void {
  if (!b.img || !b.img.scene || reducedMotion()) return
  b.img.setTintFill(0xffffff)
  b.scene.time.delayedCall(ms, () => {
    if (b.img?.scene) b.img.clearTint()
  })
}

/** Тряска камеры (при reduced motion — без тряски). */
function shake(b: Body, ms: number, k: number): void {
  if (!reducedMotion() && sceneAlive(b.scene)) b.scene.cameras.main.shake(ms, k)
}

function lerpColor(from: number, to: number, k: number): number {
  const a = Phaser.Display.Color.IntegerToColor(from)
  const c = Phaser.Display.Color.IntegerToColor(to)
  const o = Phaser.Display.Color.Interpolate.ColorWithColor(a, c, 100, Math.round(Math.max(0, Math.min(1, k)) * 100))
  return Phaser.Display.Color.GetColor(o.r, o.g, o.b)
}

/** Плавная подкраска спрайта (мультипликативный tint). */
function tintRamp(b: Body, to: number, ms: number, from = 0xffffff): Promise<void> {
  if (!b.img) return wait(b.scene, ms)
  const proxy = { k: 0 }
  return tween(b.scene, {
    targets: proxy,
    k: 1,
    duration: ms,
    onUpdate: () => {
      if (b.img?.scene) b.img.setTint(lerpColor(from, to, proxy.k))
    }
  })
}

/**
 * Масштаб «от лап» относительно исходного (у спрайта кинематика базовый масштаб не 1 — иначе тело раздувало
 * бы в разы). На карте компенсируем сдвиг контейнера, в кинематике origin и так у лап.
 */
function scaleFromFeet(b: Body, sx: number, sy: number, ms: number, ease = "Quad.easeIn"): Promise<void> {
  return tween(b.scene, {
    targets: b.t,
    scaleX: b.sx0 * sx,
    scaleY: b.sy0 * sy,
    y: b.y0 + b.feetOffset * (1 - sy),
    duration: ms,
    ease
  })
}

function hideBody(b: Body): void {
  if ((b.t as { scene?: Phaser.Scene }).scene) b.t.setVisible(false)
}

/** Крупный «удар» текстом (ШМЯК!, БАМ!). Не блокирует. */
function punchText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  color: string,
  size: number,
  speed: number
): void {
  if (!sceneAlive(scene)) return
  const t = scene.add
    .text(x, y, text, textStyle(size, color, true, Math.max(3, size * 0.14)))
    .setOrigin(0.5)
    .setDepth(27)
    .setScale(2.2)
    .setAlpha(0)
    .setAngle(-8)
  scene.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 140 / speed, ease: "Back.easeOut" })
  scene.tweens.add({
    targets: t,
    alpha: 0,
    y: y - size * 0.6,
    duration: 420 / speed,
    delay: 320 / speed,
    onComplete: () => t.destroy()
  })
}

/** Кровавый шлепок на земле. Не блокирует. */
function splatAt(b: Body, x: number, y: number, scale: number, seed: number): void {
  if (!sceneAlive(b.scene)) return
  ensureGoreTextures(b.scene)
  const img = b.scene.add
    .image(x, y, GORE_TEX.splat(seed))
    .setAlpha(0.92)
  img
    .setDisplaySize(scale, scale)
    .setRotation((seed * 1.7) % 6.28)
    .setDepth(b.mode === "cine" ? 5 : 1.5)
  b.temps.push(img)
}

/** Облако частиц произвольного цвета. Не блокирует. */
function puff(
  scene: Phaser.Scene,
  x: number,
  y: number,
  tex: string,
  tints: number[],
  opts: {
    count: number
    speed: [number, number]
    angle?: { min: number, max: number }
    gravity?: number
    scale?: [number, number]
    life?: [number, number]
    depth?: number
    rotate?: boolean
    area?: { w: number, h: number }
  }
): void {
  if (!sceneAlive(scene)) return
  const cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig = {
    speed: { min: opts.speed[0], max: opts.speed[1] },
    angle: opts.angle ?? { min: 0, max: 360 },
    scale: { start: opts.scale?.[0] ?? 0.8, end: opts.scale?.[1] ?? 0 },
    alpha: { start: 1, end: 0 },
    lifespan: { min: opts.life?.[0] ?? 400, max: opts.life?.[1] ?? 800 },
    gravityY: opts.gravity ?? 0,
    tint: tints,
    emitting: false,
    quantity: opts.count
  }
  if (opts.rotate) cfg.rotate = { min: 0, max: 360 }
  if (opts.area) {
    cfg.x = { min: -opts.area.w / 2, max: opts.area.w / 2 }
    cfg.y = { min: -opts.area.h / 2, max: opts.area.h / 2 }
  }
  const e = scene.add.particles(x, y, tex, cfg)
  e.setDepth(opts.depth ?? 24)
  e.explode(opts.count)
  scene.time.delayedCall((opts.life?.[1] ?? 800) + 200, () => e.destroy())
}

/** Расширяющееся кольцо. Не блокирует. */
function shockRing(scene: Phaser.Scene, x: number, y: number, size: number, color: number, ms: number): void {
  if (!sceneAlive(scene)) return
  const ring = scene.add.image(x, y, TEX.ring).setTint(color).setDepth(25).setAlpha(0.9)
  ring.setDisplaySize(size * 0.3, size * 0.3)
  scene.tweens.add({
    targets: ring,
    displayWidth: size * 2.2,
    displayHeight: size * 2.2,
    alpha: 0,
    duration: ms,
    ease: "Quad.easeOut",
    onComplete: () => ring.destroy()
  })
}

/** Якорь части; у всадника части уменьшены и подняты (`RIDER_TRANSFORM`: translate(60 8) scale(0.8)). */
function partAnchor(part: CritterPart, mounted: boolean): { x: number, y: number } {
  const a = CRITTER_PART_ANCHORS[part]
  if (!mounted) return a
  const vx = a.x * VIEW.w + VIEW.x
  const vy = a.y * VIEW.h + VIEW.y
  return { x: (60 + 0.8 * (vx - 60) - VIEW.x) / VIEW.w, y: (8 + 0.8 * (vy - 8) - VIEW.y) / VIEW.h }
}

/** Картинка части тела поверх спрайта 1:1, с pivot в её якоре. */
function partImage(b: Body, key: string, part: CritterPart): Phaser.GameObjects.Image | null {
  if (!sceneAlive(b.scene) || !hasTexture(b.scene, key)) return null
  const a = partAnchor(part, b.mounted)
  const ox = b.flipX ? 1 - a.x : a.x
  const img = b.scene.add
    .image(b.left + ox * b.w, b.top + a.y * b.h, key)
    .setOrigin(ox, a.y)
    .setDepth(b.depth)
  img.setDisplaySize(b.w, b.h)
  img.setFlipX(b.flipX)
  b.temps.push(img)
  return img
}

/**
 * Полёт объекта с гравитацией и отскоками. vx/vy в px/с, g в px/с², spin в °/с.
 * Твины идут через сцену, так что ускорение «пропустить» (timeScale) их тоже ускоряет.
 */
async function fly(
  scene: Phaser.Scene,
  obj: Phaser.GameObjects.Image,
  vx: number,
  vy: number,
  g: number,
  groundY: number,
  spin: number,
  speed: number,
  bounces: number,
  onLand?: (x: number, y: number, n: number) => void,
  onStep?: (x: number, y: number) => void
): Promise<void> {
  let x = obj.x
  let y = obj.y
  let angle = obj.angle
  let vxx = vx
  let vyy = vy
  let sp = spin
  for (let n = 0; n <= bounces; n++) {
    if (!obj.scene) return
    const a = 0.5 * g
    const c = y - groundY
    const disc = vyy * vyy - 4 * a * c
    let t = disc >= 0 && a > 0 ? (-vyy + Math.sqrt(disc)) / (2 * a) : 0.35
    if (!isFinite(t) || t <= 0.02) t = 0.35
    const start = { x, y, vx: vxx, vy: vyy, angle }
    const proxy = { k: 0 }
    await tween(scene, {
      targets: proxy,
      k: 1,
      duration: Math.max(16, (t * 1000) / speed),
      ease: "Linear",
      onUpdate: () => {
        if (!obj.scene) return
        const tt = t * proxy.k
        obj.x = start.x + start.vx * tt
        obj.y = start.y + start.vy * tt + 0.5 * g * tt * tt
        obj.angle = start.angle + sp * tt
        onStep?.(obj.x, obj.y)
      }
    })
    if (!obj.scene) return
    x = obj.x
    y = groundY
    obj.y = groundY
    angle = obj.angle
    onLand?.(x, groundY, n)
    const vLand = Math.abs(vyy + g * t)
    vyy = -vLand * 0.35
    vxx *= 0.55
    sp *= 0.5
    if (vLand * 0.35 < g * 0.06) break
  }
}

/* ---------- Кровь гибели ---------- */

/** Масштаб кровавых эффектов: клетка на карте, половина роста спрайта в кинематике. */
function fxSize(ctx: DeathCtx, b: Body): number {
  return b.mode === "cine" ? b.h * 0.45 : ctx.size
}

/** Выплеск крови из точки тела: брызги, капли с пятнами на земле под телом. */
function gush(
  ctx: DeathCtx,
  b: Body,
  x: number,
  y: number,
  power: number,
  kind: "slash" | "pierce" | "blunt" | "magic" | "arrow" = "slash",
  dirY = -0.5
): void {
  hitGore(b.scene, {
    x,
    y,
    size: fxSize(ctx, b),
    dirX: ctx.dir,
    dirY,
    damage: Math.max(1, Math.round(power * 10)),
    maxHp: 10,
    lethal: false,
    speed: ctx.speed,
    depth: b.mode === "cine" ? 24 : 24,
    ground: { x, y: ctx.y },
    kind
  })
}

/** Фонтан из точки тела вверх с каплями вокруг. */
function fountain(ctx: DeathCtx, b: Body, x: number, y: number, ms: number): void {
  bloodFountain(b.scene, x, y, ctx.y, fxSize(ctx, b), ms, ctx.speed)
}

/** Капли за летящей частью: не чаще раза в ~55 мс. */
function dripper(ctx: DeathCtx, b: Body): (x: number, y: number) => void {
  let last = 0
  return (x, y) => {
    const now = b.scene.time.now
    if (now - last < 55 / ctx.speed) return
    last = now
    bloodDrip(b.scene, x, y, ctx.y + 2, fxSize(ctx, b), ctx.speed)
  }
}

/** Кровавые кусочки разлетаются и шлёпаются на землю. */
function chunks(ctx: DeathCtx, b: Body, rng: () => number, count: number): Promise<void>[] {
  if (!sceneAlive(b.scene)) return []
  ensureGoreTextures(b.scene)
  const s = fxSize(ctx, b)
  const n = goreEnabled().level === "sea" ? count : Math.ceil(count / 2)
  const out: Promise<void>[] = []
  const cy = ctx.y - b.h * 0.45
  for (let i = 0; i < n; i++) {
    const img = b.scene.add.image(ctx.x, cy, GORE_TEX.chunk).setDepth(b.depth + 0.2)
    const w = s * (0.1 + rng() * 0.12)
    img.setDisplaySize(w, w * (0.8 + rng() * 0.4))
    b.temps.push(img)
    const vx = (rng() - 0.5) * s * 4.2 + ctx.dir * s * 0.8
    const vy = -s * (1.6 + rng() * 2.2)
    const seed = Math.round(rng() * 1000)
    out.push(
      fly(b.scene, img, vx, vy, s * 9, ctx.y + (rng() - 0.5) * s * 0.2, (rng() - 0.5) * 900, ctx.speed, 1, (x, y, k) => {
        if (k === 0) groundStain(b.scene, x, y, s * 1.4, seed)
      }, dripper(ctx, b))
    )
  }
  return out
}

/**
 * Момент добивания: hit-stop (твины почти замирают на ~100 мс), белая вспышка тела, красная вспышка камеры,
 * брызги на камеру и тряска. Общий пролог всех вариантов.
 */
async function killMoment(ctx: DeathCtx, b: Body): Promise<void> {
  const sp = ctx.speed
  const calm = reducedMotion()
  flash(b, 110 / sp)
  const tw = b.scene.tweens
  const prev = tw.timeScale
  // Возвращаемся к «устойчивой» скорости: 1, slow-mo кинокамеры (0.35) или пропуск (≥ 10). Короткий хит-стоп
  // удара (0.05/0.6 из attackFx) мог быть ещё активен — его собственный откат не сработает, раз мы сменили
  // timeScale, поэтому такой временный множитель не запоминаем, иначе твины навсегда останутся замедленными.
  const base = prev >= 10 || Math.abs(prev - 0.35) < 1e-6 ? prev : 1
  const slow = base * 0.06
  tw.timeScale = slow
  try {
    screenBloodSplat(b.scene, b.mode === "cine" ? 0.9 : 0.55, sp)
    await wait(b.scene, (calm ? 40 : 100) / sp)
  }
  finally {
    if (sceneAlive(b.scene) && tw.timeScale === slow) tw.timeScale = base
  }
  if (!alive(b)) return
  shake(b, 240 / sp, b.mode === "cine" ? 0.018 : 0.01)
  gush(ctx, b, ctx.x, ctx.y - b.h * 0.5, 1, KILL_GORE[ctx.killerKind ?? "sword"], -0.3)
  // Враги — зомби: к крови добавляется зеленоватая сукровица
  if (ctx.unit.isEnemy) ichorSplash(b.scene, ctx.x, ctx.y - b.h * 0.5, fxSize(ctx, b), ctx.dir, sp, 1.4)
}

/** Вид брызг добивающего удара по оружию убийцы. */
const KILL_GORE: Record<ArtWeapon, "slash" | "pierce" | "blunt" | "magic" | "arrow"> = {
  sword: "slash",
  spear: "pierce",
  axe: "slash",
  gauntlet: "blunt",
  bow: "arrow",
  blackMagic: "magic",
  whiteMagic: "magic"
}

/** Короткие судороги лежащего тела. */
async function twitch(b: Body, sp: number): Promise<void> {
  for (let i = 0; i < 2; i++) {
    if (!alive(b)) return
    const a = b.t.angle
    await tween(b.scene, { targets: b.t, angle: a + (i % 2 ? -6 : 6), duration: 70 / sp, yoyo: true })
  }
}

/* ---------- Варианты ---------- */

type VariantFn = (ctx: DeathCtx, b: Body, rng: () => number) => Promise<void>

const fall: VariantFn = async (ctx, b) => {
  const sp = ctx.speed
  bloodBurst(b.scene, ctx.x, ctx.y - b.h * 0.45, b.mode === "cine" ? 55 : 50, null, b.mode === "cine" ? 1.8 : 1.1, sp)
  // Шатается, из раны бьёт струя, затем валится набок с отскоком
  bloodSquirt(b.scene, ctx.x, ctx.y - b.h * 0.55, fxSize(ctx, b), ctx.dir > 0 ? -60 : -120, 420 / sp, 24, ctx.y)
  await tween(b.scene, { targets: b.t, angle: -ctx.dir * 8, duration: 120 / sp, yoyo: true, ease: "Sine.easeInOut" })
  if (!alive(b)) return
  ctx.onPool?.()
  await tween(b.scene, {
    targets: b.t,
    angle: ctx.dir > 0 ? 90 : -90,
    y: b.y0 + (b.mode === "map" ? ctx.size * 0.2 : 0),
    alpha: 0.9,
    duration: 450 / sp,
    ease: "Bounce.easeOut"
  })
  if (!alive(b)) return
  gush(ctx, b, ctx.x + ctx.dir * b.w * 0.3, ctx.y - b.h * 0.1, 0.6, "blunt", -1)
  dustPuff(b.scene, ctx.x, ctx.y, b.h * 0.5, 8)
  await twitch(b, sp)
}

const gibs: VariantFn = async (ctx, b, rng) => {
  const sp = ctx.speed
  const parts = ctx.parts
  if (!parts) return explode(ctx, b, rng)
  flash(b, 60 / sp)
  await wait(b.scene, 70 / sp)
  if (!alive(b)) return
  shake(b, 220 / sp, b.mode === "cine" ? 0.025 : 0.014)
  hideBody(b)
  const s = b.h
  const g = s * 3.2
  const dir = ctx.dir
  const spec: Record<CritterPart, { vx: [number, number], vy: [number, number], side: number }> = {
    head: { vx: [0.3, 0.7], vy: [1.1, 1.5], side: dir },
    body: { vx: [0.5, 0.9], vy: [0.6, 0.95], side: dir },
    tail: { vx: [0.3, 0.6], vy: [0.9, 1.3], side: -dir },
    legFront: { vx: [0.3, 0.7], vy: [0.7, 1.1], side: dir },
    legBack: { vx: [0.3, 0.7], vy: [0.7, 1.1], side: -dir }
  }
  bloodBurst(
    b.scene,
    ctx.x,
    ctx.y - s * 0.5,
    b.mode === "cine" ? 50 : 40,
    { min: 230, max: 310 },
    b.mode === "cine" ? 2 : 1.2,
    sp
  )
  puff(b.scene, ctx.x, ctx.y - s * 0.5, TEX.dot, [b.furColor, 0xffffff], {
    count: 10,
    speed: [s * 0.4, s * 1.2],
    gravity: s * 2,
    scale: [0.6, 0],
    life: [400, 700]
  })
  // Полувысота части (в долях высоты миниатюры): часть ложится на землю нижним краем, а не центром.
  const halfH: Record<CritterPart, number> = { head: 0.24, body: 0.13, tail: 0.09, legFront: 0.045, legBack: 0.045 }
  const flights: Promise<void>[] = []
  let seed = 0
  for (const part of Object.keys(spec) as CritterPart[]) {
    const key = parts[part]
    const img = key ? partImage(b, key, part) : null
    if (!img) continue
    const p = spec[part]
    const vx = p.side * s * (p.vx[0] + rng() * (p.vx[1] - p.vx[0]))
    const vy = -s * (p.vy[0] + rng() * (p.vy[1] - p.vy[0]))
    const spin = (rng() < 0.5 ? -1 : 1) * (360 + rng() * 360)
    const partSeed = seed++
    flights.push(
      fly(
        b.scene,
        img,
        vx,
        vy,
        g,
        ctx.y - halfH[part] * s * (b.mounted ? 0.8 : 1),
        spin,
        sp,
        2,
        (x, y, n) => {
          splatAt(b, x, ctx.y + 2, s * (n === 0 ? 0.3 : 0.18), partSeed * 3 + n)
          if (n === 0) gush(ctx, b, x, y, 0.45, "blunt", -1)
        },
        dripper(ctx, b)
      )
    )
  }
  // Фонтан из места, где стоял, и кровавые кусочки
  fountain(ctx, b, ctx.x, ctx.y - s * 0.35, 700)
  flights.push(...chunks(ctx, b, rng, 8))
  ctx.onPool?.()
  await Promise.race([Promise.all(flights), wait(b.scene, 1600 / sp)])
}

const explode: VariantFn = async (ctx, b) => {
  const sp = ctx.speed
  const s = b.h
  // Дрожь и раздувание с покраснением
  const shakeTw = b.scene.tweens.add({ targets: b.t, x: b.x0 + 3, duration: 45 / sp, yoyo: true, repeat: 5 })
  await Promise.all([scaleFromFeet(b, 1.35, 1.35, 240 / sp, "Quad.easeIn"), tintRamp(b, 0xff3b3b, 240 / sp)])
  shakeTw.stop()
  if (!alive(b)) return
  b.t.setX(b.x0)
  flash(b, 60 / sp)
  await wait(b.scene, 60 / sp)
  if (!alive(b)) return
  hideBody(b)
  const cx = ctx.x
  const cy = ctx.y - s * 0.5
  shake(b, 260 / sp, b.mode === "cine" ? 0.03 : 0.016)
  bloodBurst(b.scene, cx, cy, b.mode === "cine" ? 60 : 45, null, b.mode === "cine" ? 2.2 : 1.3, sp)
  puff(b.scene, cx, cy, TEX.dot, [b.furColor, Phaser.Display.Color.IntegerToColor(b.furColor).lighten(20).color], {
    count: 12,
    speed: [s * 0.6, s * 1.6],
    gravity: s * 2.5,
    scale: [0.9, 0.1],
    life: [500, 900]
  })
  shockRing(b.scene, cx, cy, s, 0xffffff, 380 / sp)
  shockRing(b.scene, cx, cy, s * 0.8, 0xff6b6b, 300 / sp)
  shockRing(b.scene, cx, cy, s * 1.2, 0xd9122b, 460 / sp)
  gush(ctx, b, cx, cy, 1, "blunt", 0)
  screenBloodSplat(b.scene, b.mode === "cine" ? 1 : 0.7, sp)
  const bits = chunks(ctx, b, () => Math.random(), 12)
  fountain(ctx, b, ctx.x, ctx.y - s * 0.1, 450)
  // Дым
  for (let i = 0; i < 5; i++) {
    const sm = b.scene.add
      .image(cx + (i - 2) * s * 0.12, cy + s * 0.1, TEX.disc)
      .setTint(0x6b6b6b)
      .setAlpha(0.45)
      .setDepth(23)
    sm.setDisplaySize(s * 0.25, s * 0.25)
    b.scene.tweens.add({
      targets: sm,
      y: cy - s * 0.5 - i * s * 0.05,
      displayWidth: s * 0.7,
      displayHeight: s * 0.7,
      alpha: 0,
      duration: (600 + i * 80) / sp,
      ease: "Quad.easeOut",
      onComplete: () => sm.destroy()
    })
  }
  // Подпалина
  const scorch = b.scene.add
    .image(ctx.x, ctx.y, TEX.disc)
    .setTint(0x1a1210)
    .setAlpha(0)
    .setDepth(b.mode === "cine" ? 4 : 1.2)
  scorch.setDisplaySize(s * 0.9, s * 0.35)
  b.scene.tweens.add({ targets: scorch, alpha: 0.5, duration: 200 / sp })
  b.temps.push(scorch)
  ctx.onPool?.()
  await Promise.race([Promise.all(bits), wait(b.scene, 900 / sp)])
}

const flatten: VariantFn = async (ctx, b) => {
  const sp = ctx.speed
  const s = b.h
  // Предчувствие: чуть вытянуться вверх
  await scaleFromFeet(b, 0.94, 1.08, 90 / sp, "Quad.easeOut")
  if (!alive(b)) return
  await scaleFromFeet(b, 1.7, 0.08, 120 / sp, "Quad.easeIn")
  if (!alive(b)) return
  shake(b, 180 / sp, b.mode === "cine" ? 0.028 : 0.015)
  punchText(b.scene, ctx.x, ctx.y - s * 0.5, tr("SPLAT!", "ШМЯК!"), "#ffd166", b.mode === "cine" ? 40 : ctx.size * 0.42, sp)
  bloodBurst(
    b.scene,
    ctx.x,
    ctx.y - s * 0.03,
    b.mode === "cine" ? 22 : 14,
    { min: 150, max: 210 },
    b.mode === "cine" ? 1.6 : 1,
    sp
  )
  bloodBurst(
    b.scene,
    ctx.x,
    ctx.y - s * 0.03,
    b.mode === "cine" ? 22 : 14,
    { min: -30, max: 30 },
    b.mode === "cine" ? 1.6 : 1,
    sp
  )
  dustPuff(b.scene, ctx.x, ctx.y, s * 0.5, 10)
  // Сплющило — кровь бьёт струями в обе стороны и кляксой во все
  bloodSquirt(b.scene, ctx.x - s * 0.3, ctx.y - s * 0.05, fxSize(ctx, b), -160, 300 / sp, 24, ctx.y)
  bloodSquirt(b.scene, ctx.x + s * 0.3, ctx.y - s * 0.05, fxSize(ctx, b), -20, 300 / sp, 24, ctx.y)
  gush(ctx, b, ctx.x, ctx.y - s * 0.05, 1, "blunt", -0.2)
  ctx.onPool?.()
  ensureGoreTextures(b.scene)
  const pool = b.scene.add
    .image(ctx.x, ctx.y + 2, GORE_TEX.pool(3))
    .setAlpha(0)
    .setDepth(b.mode === "cine" ? 6 : 1.4)
  pool.setDisplaySize(s * 0.4, s * 0.15)
  b.temps.push(pool)
  b.scene.tweens.add({
    targets: pool,
    displayWidth: s * 1.5,
    displayHeight: s * 0.5,
    alpha: 0.9,
    duration: 500 / sp,
    ease: "Quad.easeOut"
  })
  await wait(b.scene, 250 / sp)
  await tween(b.scene, { targets: b.t, alpha: 0, duration: 400 / sp })
}

const launch: VariantFn = async (ctx, b) => {
  const sp = ctx.speed
  const s = b.h
  flash(b, 60 / sp)
  shake(b, 160 / sp, b.mode === "cine" ? 0.02 : 0.012)
  bloodBurst(
    b.scene,
    ctx.x,
    ctx.y - s * 0.45,
    b.mode === "cine" ? 30 : 20,
    ctx.dir > 0 ? { min: -60, max: 30 } : { min: 150, max: 240 },
    b.mode === "cine" ? 1.6 : 1,
    sp
  )
  gush(ctx, b, ctx.x, ctx.y - s * 0.45, 1, "blunt", -0.6)
  ctx.onPool?.()
  const dist = b.mode === "cine" ? b.scene.scale.width * 0.9 : ctx.size * 2.1
  const up = b.mode === "cine" ? s * 0.6 : ctx.size * 0.8
  const dur = 650 / sp
  const proxy = { k: 0 }
  const startX = b.t.x
  const startY = b.t.y
  // Кровавый след
  let trail = 0
  const trailTimer = b.scene.time.addEvent({
    delay: 70 / sp,
    loop: true,
    callback: () => {
      if (!alive(b) || trail++ > 9) return
      const pt = b.mode === "map" ? (b.t as Phaser.GameObjects.Container).getWorldTransformMatrix() : null
      const wx = pt ? pt.tx : b.t.x
      const wy = pt ? pt.ty - s * 0.45 : b.t.y - s * 0.45
      bloodBurst(b.scene, wx, wy, 5, { min: 60, max: 120 }, 0.5, sp)
      bloodDrip(b.scene, wx, wy, ctx.y + 2, fxSize(ctx, b), sp)
    }
  })
  await tween(b.scene, {
    targets: proxy,
    k: 1,
    duration: dur,
    ease: "Linear",
    onUpdate: () => {
      if (!alive(b)) return
      const k = proxy.k
      b.t.x = startX + ctx.dir * dist * k
      b.t.y = startY - up * 4 * k * (1 - k) + (b.mode === "cine" ? 0 : ctx.size * 0.1 * k)
      b.t.angle = ctx.dir * 560 * k
      if (b.mode === "map" && k > 0.72) b.t.setAlpha(Math.max(0, 1 - (k - 0.72) / 0.28))
    }
  })
  trailTimer.remove(false)
  if (!alive(b)) return
  const pt = b.mode === "map" ? (b.t as Phaser.GameObjects.Container).getWorldTransformMatrix() : null
  const ex = pt ? pt.tx : b.t.x
  const ey = pt ? pt.ty - s * 0.3 : b.t.y - s * 0.3
  hideBody(b)
  // Блик «✦» на выходе
  const star = b.scene.add
    .text(ex, ey, "✦", textStyle(b.mode === "cine" ? 36 : ctx.size * 0.5, "#fff6d0", true, 3))
    .setOrigin(0.5)
    .setDepth(27)
    .setScale(0.3)
  b.scene.tweens.add({
    targets: star,
    scale: 1.4,
    alpha: 0,
    duration: 420 / sp,
    ease: "Quad.easeOut",
    onComplete: () => star.destroy()
  })
  if (b.mode === "map") splatAt(b, ex, ctx.y + 2, s * 0.3, 11)
  await wait(b.scene, 200 / sp)
}

const dissolve: VariantFn = async (ctx, b) => {
  const sp = ctx.speed
  const s = b.h
  await tintRamp(b, 0xff5a5a, 220 / sp)
  if (!alive(b)) return
  const cx = b.left + b.w / 2
  const cy = b.top + b.h * 0.5
  const fur = b.furColor
  const light = Phaser.Display.Color.IntegerToColor(fur).lighten(25).color
  for (let i = 0; i < 3; i++) {
    b.scene.time.delayedCall((i * 160) / sp, () => {
      if (!alive(b)) return
      puff(b.scene, cx, cy, TEX.dot, [fur, light, 0xff6b6b], {
        count: 14,
        speed: [s * 0.15, s * 0.5],
        angle: { min: 240, max: 300 },
        gravity: -s * 0.6,
        scale: [0.7, 0],
        life: [600, 1000],
        area: { w: b.w * 0.8, h: b.h * 0.9 }
      })
    })
  }
  // Тает в кровавый туман: капли стекают на землю
  for (let i = 0; i < 6; i++) {
    b.scene.time.delayedCall((i * 90) / sp, () => {
      if (!alive(b)) return
      bloodDrip(b.scene, b.left + b.w * (0.2 + 0.6 * ((i * 37) % 10) / 10), b.top + b.h * 0.7, ctx.y + 2, fxSize(ctx, b), sp)
    })
  }
  gush(ctx, b, cx, cy, 0.7, "magic", -1)
  // Тёмный силуэт остаётся ненадолго
  const sil = b.scene.add
    .image(cx, cy, TEX.disc)
    .setTint(0x000000)
    .setAlpha(0)
    .setDepth(b.depth - 0.5)
  sil.setDisplaySize(b.w * 0.75, b.h * 0.9)
  b.temps.push(sil)
  b.scene.tweens.add({
    targets: sil,
    alpha: 0.35,
    duration: 300 / sp,
    yoyo: true,
    hold: 500 / sp,
    onComplete: () => sil.destroy()
  })
  ctx.onPool?.()
  await tween(b.scene, { targets: b.t, alpha: 0, y: b.y0 - s * 0.15, duration: 700 / sp, ease: "Quad.easeIn" })
  hideBody(b)
}

const drill: VariantFn = async (ctx, b) => {
  const sp = ctx.speed
  const s = b.h
  flash(b, 60 / sp)
  const dustTimer = b.scene.time.addEvent({
    delay: 180 / sp,
    repeat: 3,
    callback: () => dustPuff(b.scene, ctx.x, ctx.y, s * 0.4, 6)
  })
  bloodBurst(b.scene, ctx.x, ctx.y - s * 0.4, b.mode === "cine" ? 20 : 12, { min: 220, max: 320 }, 1, sp)
  // Кровь разлетается спиралью, пока ввинчивается в землю
  let turn = 0
  const spiral = b.scene.time.addEvent({
    delay: 90 / sp,
    repeat: 7,
    callback: () => {
      if (!alive(b)) return
      const a = (turn++ * 75) % 360
      bloodBurst(b.scene, ctx.x, ctx.y - s * 0.2, 6, { min: a - 15, max: a + 15 }, b.mode === "cine" ? 1.2 : 0.7, sp)
    }
  })
  await Promise.all([
    tween(b.scene, { targets: b.t, angle: 1800, duration: 820 / sp, ease: "Quad.easeIn" }),
    scaleFromFeet(b, 0.45, 0.1, 820 / sp, "Quad.easeIn")
  ])
  dustTimer.remove(false)
  spiral.remove(false)
  if (!alive(b)) return
  hideBody(b)
  gush(ctx, b, ctx.x, ctx.y, 0.8, "blunt", -1)
  const hole = b.scene.add
    .image(ctx.x, ctx.y, TEX.disc)
    .setTint(0x15100e)
    .setAlpha(0.85)
    .setDepth(b.mode === "cine" ? 5 : 1.3)
  hole.setDisplaySize(s * 0.5, s * 0.2)
  b.temps.push(hole)
  shockRing(b.scene, ctx.x, ctx.y, s * 0.6, 0xbdb7a8, 300 / sp)
  ctx.onPool?.()
  await wait(b.scene, 250 / sp)
}

const crumble: VariantFn = async (ctx, b, rng) => {
  const sp = ctx.speed
  const s = b.h
  // Добит светом (посох) — рассыпается светлым кристаллом, иначе камнем
  const frozen = ctx.killerKind === "whiteMagic"
  const stone = frozen ? 0xa8dcff : 0x9e9e9e
  await tintRamp(b, stone, 220 / sp)
  if (!alive(b)) return
  if (b.img?.scene) b.img.setTintFill(stone)
  // Трещины
  const g = b.scene.add
    .graphics()
    .setDepth(b.depth + 0.5)
    .setAlpha(0)
  g.lineStyle(Math.max(1.5, s * 0.012), frozen ? 0x3f7fb5 : 0x2b2b2b, 1)
  for (let i = 0; i < 3; i++) {
    let x = b.left + b.w * (0.3 + rng() * 0.4)
    let y = b.top + b.h * 0.1
    g.beginPath()
    g.moveTo(x, y)
    for (let k = 0; k < 6; k++) {
      x += (rng() - 0.5) * b.w * 0.25
      y += b.h * 0.14
      g.lineTo(x, y)
    }
    g.strokePath()
  }
  b.temps.push(g)
  await tween(b.scene, { targets: g, alpha: 1, duration: 260 / sp })
  if (!alive(b)) return
  shake(b, 120 / sp, 0.01)
  await wait(b.scene, 140 / sp)
  if (!alive(b)) return
  hideBody(b)
  g.destroy()
  // Осколки
  const groundY = ctx.y
  const flights: Promise<void>[] = []
  for (let i = 0; i < 10; i++) {
    const w = b.w * (0.12 + rng() * 0.1)
    const chunk = b.scene.add
      .image(b.left + b.w * (0.2 + rng() * 0.6), b.top + b.h * (0.15 + rng() * 0.7), TEX.square)
      .setTint(stone)
      .setDepth(b.depth)
    chunk.setDisplaySize(w, w * (0.7 + rng() * 0.6)).setAngle(rng() * 90)
    b.temps.push(chunk)
    const vx = (rng() - 0.5) * s * 0.9
    const vy = -s * (0.2 + rng() * 0.6)
    flights.push(
      fly(b.scene, chunk, vx, vy, s * 3.5, groundY, (rng() - 0.5) * 400, sp, 1, frozen
        ? undefined
        : (x) => {
            groundStain(b.scene, x, groundY, fxSize(ctx, b), i * 7)
          })
    )
  }
  dustPuff(b.scene, ctx.x, ctx.y, s * 0.6, 12)
  // Каменная скорлупа лопается — изнутри всё равно кровь
  if (!frozen) gush(ctx, b, ctx.x, ctx.y - s * 0.4, 0.9, "blunt", -0.6)
  puff(
    b.scene,
    ctx.x,
    ctx.y - s * 0.4,
    TEX.dot,
    frozen ? [0xdff3ff, 0xa8dcff, 0xffffff] : [0xbdbdbd, 0x8a8a8a, 0xe0e0e0],
    { count: 18, speed: [s * 0.3, s * 1], gravity: s * 2, scale: [0.6, 0], life: [400, 800] }
  )
  ctx.onPool?.()
  await Promise.race([Promise.all(flights), wait(b.scene, 1200 / sp)])
}

const electro: VariantFn = async (ctx, b, rng) => {
  const sp = ctx.speed
  const s = b.h
  const cx = b.left + b.w / 2
  const topY = b.top
  // Молнии
  const bolts = b.scene.add.graphics().setDepth(b.depth + 1)
  const drawBolts = (): void => {
    bolts.clear()
    bolts.lineStyle(Math.max(2, s * 0.014), 0xfff3b0, 1)
    for (let i = 0; i < 3; i++) {
      let x = cx + (rng() - 0.5) * b.w * 0.8
      let y = topY - s * 0.35
      bolts.beginPath()
      bolts.moveTo(x, y)
      for (let k = 0; k < 5; k++) {
        x += (rng() - 0.5) * b.w * 0.35
        y += s * 0.16
        bolts.lineTo(x, y)
      }
      bolts.strokePath()
    }
  }
  b.temps.push(bolts)
  for (let i = 0; i < 6; i++) {
    if (!alive(b)) return
    const on = i % 2 === 0
    if (b.img?.scene) {
      if (on) b.img.setTintFill(0xffffff)
      else b.img.clearTint()
    }
    if (on) {
      drawBolts()
      puff(b.scene, cx, topY + b.h * 0.5, TEX.star, [0xffd166, 0xfff3b0, 0xffffff], {
        count: 6,
        speed: [s * 0.4, s * 1.1],
        gravity: s * 1.5,
        scale: [0.9, 0],
        life: [250, 450],
        rotate: true,
        area: { w: b.w * 0.7, h: b.h * 0.7 }
      })
    }
    else bolts.clear()
    b.t.setX(b.x0 + (on ? 3 : -3))
    await wait(b.scene, 60 / sp)
  }
  bolts.destroy()
  if (!alive(b)) return
  b.t.setX(b.x0)
  if (b.img?.scene) b.img.clearTint()
  // Дым и падение на спину
  puff(b.scene, cx, topY + b.h * 0.3, TEX.disc, [0x5a5a5a, 0x8a8a8a], {
    count: 5,
    speed: [s * 0.1, s * 0.3],
    angle: { min: 250, max: 290 },
    gravity: -s * 0.4,
    scale: [0.5, 1.2],
    life: [600, 900]
  })
  bloodBurst(b.scene, ctx.x, ctx.y - s * 0.45, b.mode === "cine" ? 18 : 10, null, 0.9, sp)
  gush(ctx, b, ctx.x, ctx.y - s * 0.5, 0.8, "magic", -1)
  ctx.onPool?.()
  await tween(b.scene, {
    targets: b.t,
    angle: ctx.dir > 0 ? -95 : 95,
    y: b.y0 + (b.mode === "map" ? ctx.size * 0.15 : 0),
    alpha: 0.9,
    duration: 420 / sp,
    ease: "Bounce.easeOut"
  })
  await twitch(b, sp)
}

const ragdoll: VariantFn = async (ctx, b) => {
  const sp = ctx.speed
  const s = b.h
  flash(b, 60 / sp)
  bloodBurst(b.scene, ctx.x, ctx.y - s * 0.45, b.mode === "cine" ? 25 : 15, null, 1.2, sp)
  ctx.onPool?.()
  const hops: { dx: number, up: number, rot: number }[] = [
    { dx: 0.55, up: 0.9, rot: 180 },
    { dx: 0.35, up: 0.5, rot: 150 },
    { dx: 0.2, up: 0.25, rot: 120 }
  ]
  const unit = b.mode === "cine" ? s : ctx.size
  let x = b.t.x
  let angle = b.t.angle
  let seed = 0
  for (const hop of hops) {
    if (!alive(b)) return
    const nx = x + ctx.dir * unit * hop.dx
    const na = angle + ctx.dir * hop.rot
    const tUp = 170 / sp
    const tDown = 150 / sp
    await Promise.all([
      tween(b.scene, { targets: b.t, x: (x + nx) / 2, y: b.y0 - unit * hop.up, duration: tUp, ease: "Quad.easeOut" }),
      tween(b.scene, { targets: b.t, angle: angle + ctx.dir * hop.rot * 0.5, duration: tUp, ease: "Linear" })
    ])
    if (!alive(b)) return
    await Promise.all([
      tween(b.scene, { targets: b.t, x: nx, y: b.y0, duration: tDown, ease: "Quad.easeIn" }),
      tween(b.scene, { targets: b.t, angle: na, duration: tDown, ease: "Linear" })
    ])
    if (!alive(b)) return
    x = nx
    angle = na
    const pt = b.mode === "map" ? (b.t as Phaser.GameObjects.Container).getWorldTransformMatrix() : null
    const wx = pt ? pt.tx : b.t.x
    splatAt(b, wx, ctx.y + 2, s * (0.36 - seed * 0.06), 5 + seed)
    bloodBurst(b.scene, wx, ctx.y, 8, { min: 220, max: 320 }, 0.7, sp)
    gush(ctx, b, wx, ctx.y - s * 0.15, 0.7 - seed * 0.15, "blunt", -1)
    dustPuff(b.scene, wx, ctx.y, s * 0.35, 5)
    shake(b, 80 / sp, 0.006)
    seed++
  }
  // Лечь набок
  const lying = ctx.dir > 0 ? 90 : -90
  const turns = Math.round((angle - lying) / 360)
  await tween(b.scene, {
    targets: b.t,
    angle: lying + turns * 360,
    alpha: 0.9,
    duration: 160 / sp,
    ease: "Quad.easeOut"
  })
}

const sink: VariantFn = async (ctx, b) => {
  const sp = ctx.speed
  const s = b.h
  fountain(ctx, b, ctx.x, ctx.y - s * 0.4, 380)
  ctx.onPool?.()
  ensureGoreTextures(b.scene)
  const pool = b.scene.add
    .image(ctx.x, ctx.y + 2, GORE_TEX.pool(1))
    .setAlpha(0)
    .setDepth(b.mode === "cine" ? 6 : 1.4)
  pool.setDisplaySize(s * 0.2, s * 0.08)
  b.temps.push(pool)
  await tween(b.scene, {
    targets: pool,
    displayWidth: s * 1.6,
    displayHeight: s * 0.55,
    alpha: 0.92,
    duration: 320 / sp,
    ease: "Quad.easeOut"
  })
  if (!alive(b)) return
  // Пузыри
  puff(b.scene, ctx.x, ctx.y, TEX.ring, [0xff6b6b, 0xd9122b], {
    count: 6,
    speed: [s * 0.05, s * 0.2],
    angle: { min: 260, max: 280 },
    gravity: -s * 0.3,
    scale: [0.15, 0.45],
    life: [500, 900]
  })
  const tailKey = ctx.parts?.tail
  const tailImg = tailKey ? partImage(b, tailKey, "tail") : null
  await Promise.all([
    tween(b.scene, {
      targets: b.t,
      y: b.y0 + s * 0.9,
      alpha: 0.15,
      scaleX: (b.t.scaleX || 1) * 0.8,
      duration: 620 / sp,
      ease: "Quad.easeIn"
    }),
    tailImg
      ? tween(b.scene, {
          targets: tailImg,
          y: ctx.y + s * 0.02,
          x: ctx.x + ctx.dir * s * 0.1,
          angle: -20,
          duration: 620 / sp,
          ease: "Quad.easeIn"
        })
      : wait(b.scene, 620 / sp)
  ])
  if (!alive(b)) return
  hideBody(b)
  if (tailImg?.scene) {
    tailImg.setDepth(b.mode === "cine" ? 7 : 1.6)
    await tween(b.scene, {
      targets: tailImg,
      angle: 20,
      duration: 160 / sp,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut"
    })
  }
  await wait(b.scene, 120 / sp)
}

/* ---------- Помощники новых вариантов ---------- */

/** Текстуры реквизита гибели (стрела, копьё, кости, птичка, осколок, звезда): рисуются один раз на игру. */
const DTEX = {
  arrow: "death_arrow",
  spear: "death_spear",
  bone: "death_bone",
  skull: "death_skull",
  bird: "death_bird",
  shard: "death_shard",
  star: "death_star5"
}
/** Область наконечника в текстуре копья (для «выхода» острия поверх тела). */
const SPEAR_W = 256
const SPEAR_H = 24
const SPEAR_TIP = 200

function ensureDeathTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(DTEX.star)) return
  const g = scene.make.graphics({ x: 0, y: 0 }, false)
  const V = (x: number, y: number): Phaser.Math.Vector2 => new Phaser.Math.Vector2(x, y)

  // Стрела 128×20, остриё справа
  g.clear()
  g.fillStyle(0x5c3a1e, 1)
  g.fillRect(10, 8, 100, 4)
  g.fillStyle(0x9c6b3c, 1)
  g.fillRect(10, 8.5, 100, 2)
  g.fillStyle(0xe63946, 1)
  g.fillPoints([V(0, 1), V(26, 9), V(14, 10)], true)
  g.fillPoints([V(0, 19), V(26, 11), V(14, 10)], true)
  g.fillStyle(0xffffff, 1)
  g.fillPoints([V(8, 3), V(26, 9.5), V(18, 10)], true)
  g.fillStyle(0x5a6270, 1)
  g.fillPoints([V(104, 2), V(128, 10), V(104, 18), V(110, 10)], true)
  g.fillStyle(0xdfe4ea, 1)
  g.fillPoints([V(107, 5), V(124, 10), V(110, 10)], true)
  g.generateTexture(DTEX.arrow, 128, 20)

  // Копьё 256×24: древко, кисточка, листовидный наконечник справа
  g.clear()
  g.fillStyle(0x4a2f17, 1)
  g.fillRoundedRect(0, 8, SPEAR_TIP + 6, 8, 3)
  g.fillStyle(0xa8743f, 1)
  g.fillRect(2, 9.5, SPEAR_TIP + 2, 3)
  g.fillStyle(0xd9122b, 1)
  g.fillPoints([V(SPEAR_TIP - 14, 4), V(SPEAR_TIP + 2, 12), V(SPEAR_TIP - 14, 20), V(SPEAR_TIP - 8, 12)], true)
  g.fillStyle(0x4b5563, 1)
  g.fillPoints([V(SPEAR_TIP, 1), V(SPEAR_W, 12), V(SPEAR_TIP, 23), V(SPEAR_TIP + 8, 12)], true)
  g.fillStyle(0xe5e9ef, 1)
  g.fillPoints([V(SPEAR_TIP + 4, 4), V(SPEAR_W - 6, 12), V(SPEAR_TIP + 10, 12)], true)
  g.generateTexture(DTEX.spear, SPEAR_W, SPEAR_H)

  // Косточка 48×18
  g.clear()
  g.fillStyle(0x8a8577, 1)
  g.fillRoundedRect(8, 5, 32, 8, 3)
  for (const [x, y] of [[8, 5], [8, 13], [40, 5], [40, 13]]) g.fillCircle(x!, y!, 5.5)
  g.fillStyle(0xf4efe1, 1)
  g.fillRoundedRect(9, 6, 30, 6, 2)
  for (const [x, y] of [[8, 5], [8, 13], [40, 5], [40, 13]]) g.fillCircle(x!, y!, 4.2)
  g.generateTexture(DTEX.bone, 48, 18)

  // Черепок 40×40 (мультяшный)
  g.clear()
  g.fillStyle(0x8a8577, 1)
  g.fillCircle(20, 17, 15)
  g.fillRoundedRect(10, 22, 20, 15, 4)
  g.fillStyle(0xf4efe1, 1)
  g.fillCircle(20, 17, 13.5)
  g.fillRoundedRect(11.5, 22, 17, 13.5, 3)
  g.fillStyle(0x2b2b2b, 1)
  g.fillEllipse(14, 19, 8, 9)
  g.fillEllipse(26, 19, 8, 9)
  g.fillTriangle(20, 24, 18, 28, 22, 28)
  g.fillRect(15, 31, 1.5, 4)
  g.fillRect(19.3, 31, 1.5, 4)
  g.fillRect(23.5, 31, 1.5, 4)
  g.generateTexture(DTEX.skull, 40, 40)

  // Птичка 40×30 (смотрит вправо)
  g.clear()
  g.fillStyle(0x2f5d8a, 1)
  g.fillCircle(18, 17, 11)
  g.fillCircle(29, 10, 7.5)
  g.fillStyle(0x7cc6ff, 1)
  g.fillCircle(18, 17, 9.5)
  g.fillCircle(29, 10, 6)
  g.fillStyle(0x4a9de0, 1)
  g.fillEllipse(14, 14, 12, 7)
  g.fillStyle(0xffb703, 1)
  g.fillTriangle(34, 8, 40, 11, 34, 13)
  g.fillStyle(0x1b1b1b, 1)
  g.fillCircle(31, 9, 1.6)
  g.fillStyle(0x2f5d8a, 1)
  g.fillTriangle(8, 17, 0, 12, 2, 22)
  g.generateTexture(DTEX.bird, 40, 30)

  // Осколок льда 32×32
  g.clear()
  g.fillStyle(0xffffff, 0.95)
  g.fillPoints([V(4, 26), V(14, 2), V(30, 12), V(22, 30)], true)
  g.fillStyle(0xffffff, 1)
  g.lineStyle(2, 0xbfe3ff, 1)
  g.strokePoints([V(4, 26), V(14, 2), V(30, 12), V(22, 30)], true)
  g.generateTexture(DTEX.shard, 32, 32)

  // Пятиконечная звезда 32×32
  g.clear()
  const star: Phaser.Math.Vector2[] = []
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const r = i % 2 === 0 ? 15 : 6.5
    star.push(V(16 + Math.cos(a) * r, 16.5 + Math.sin(a) * r))
  }
  g.fillStyle(0xffffff, 1)
  g.fillPoints(star, true)
  g.generateTexture(DTEX.star, 32, 32)

  g.destroy()
}

/** Точки анатомии в мировых координатах (центр головы, шея, грудь) с поправкой на всадника. */
interface Anatomy {
  x: number
  headY: number
  headR: number
  neckY: number
  chestY: number
}

function anatomy(b: Body): Anatomy {
  const k = b.mounted ? 0.8 : 1
  const wy = (y: number): number => b.top + (((b.mounted ? 8 + 0.8 * (y - 8) : y) - VIEW.y) / VIEW.h) * b.h
  return { x: b.left + b.w / 2, headY: wy(50), headR: (b.h * 26 * k) / VIEW.h, neckY: wy(72), chestY: wy(86) }
}

/** Y «лёжа»: на карте контейнер тела вращается вокруг центра — опускаем, чтобы тело легло на клетку. */
function lyingY(ctx: DeathCtx, b: Body): number {
  return b.y0 + (b.mode === "map" ? ctx.size * 0.2 : 0)
}

function bodyMatrix(b: Body): Phaser.GameObjects.Components.TransformMatrix {
  const TM = Phaser.GameObjects.Components.TransformMatrix
  return b.t.getWorldTransformMatrix(new TM(), new TM())
}

/** «Приклеить» объект к телу: каждый кадр он повторяет сдвиг и поворот тела (стрелы в падающем теле). */
function glue(b: Body, obj: Glued): void {
  const m = bodyMatrix(b)
  const p = m.applyInverse(obj.x, obj.y)
  b.glued.push({ obj, lx: p.x, ly: p.y, rot: obj.rotation - m.rotationNormalized })
  if (b.glued.length > 1) return
  const sync = (): void => {
    if (!(b.t as { scene?: Phaser.Scene }).scene) return
    const mm = bodyMatrix(b)
    for (const g of b.glued) {
      if (!g.obj.scene) continue
      const q = mm.transformPoint(g.lx, g.ly)
      g.obj.setPosition(q.x, q.y)
      g.obj.setRotation(g.rot + mm.rotationNormalized)
    }
  }
  b.scene.events.on("postupdate", sync)
  b.cleanup.push(() => b.scene.events.off("postupdate", sync))
}

/** Каждый кадр, пока не снят (или до конца варианта). */
function everyFrame(b: Body, fn: () => void): () => void {
  let on = true
  const off = (): void => {
    if (!on) return
    on = false
    b.scene.events.off("postupdate", fn)
  }
  b.scene.events.on("postupdate", fn)
  b.cleanup.push(off)
  return off
}

/** Копия спрайта тела на сцене с заданным origin (для масок, «души», сдутой шкурки). Тело не трогаем. */
function bodyCopy(b: Body, ox = 0.5, oy = 0.97): Phaser.GameObjects.Image | null {
  const src = b.img
  if (!src?.scene || !sceneAlive(b.scene)) return null
  const img = b.scene.add
    .image(b.left + ox * b.w, b.top + oy * b.h, src.texture.key, src.frame.name)
    .setOrigin(ox, oy)
    .setDepth(b.depth)
    .setFlipX(b.flipX)
  img.setDisplaySize(b.w, b.h)
  b.temps.push(img)
  return img
}

/** Геометрическая маска-многоугольник в локальных координатах объекта; `sync` — повторить сдвиг/поворот объекта. */
function polyMask(
  b: Body,
  img: Phaser.GameObjects.Image,
  pts: { x: number, y: number }[]
): { g: Phaser.GameObjects.Graphics, sync: () => void } {
  const g = b.scene.make.graphics({ x: img.x, y: img.y }, false)
  g.fillStyle(0xffffff, 1)
  g.fillPoints(pts.map(p => new Phaser.Math.Vector2(p.x, p.y)), true, true)
  img.setMask(g.createGeometryMask())
  b.temps.push(g)
  const sync = (): void => {
    if (!img.scene) return
    g.setPosition(img.x, img.y)
    g.setRotation(img.rotation)
  }
  return { g, sync }
}

/** Белый росчерк удара по линии (не блокирует). */
function slashLine(b: Body, x1: number, y1: number, x2: number, y2: number, width: number, speed: number): void {
  if (!sceneAlive(b.scene)) return
  const g = b.scene.add.graphics().setDepth(26)
  g.lineStyle(width * 2.2, 0xff4d6d, 0.55)
  g.lineBetween(x1, y1, x2, y2)
  g.lineStyle(width, 0xffffff, 1)
  g.lineBetween(x1, y1, x2, y2)
  b.scene.tweens.add({ targets: g, alpha: 0, duration: 260 / speed, ease: "Quad.easeIn", onComplete: () => g.destroy() })
}

/** Растущая лужа произвольного цвета (зелёная у зомби). */
function growPool(
  b: Body,
  x: number,
  y: number,
  tex: string,
  tint: number | null,
  w: number,
  h: number,
  ms: number,
  depthAdd = 0
): Phaser.GameObjects.Image {
  const pool = b.scene.add
    .image(x, y, tex)
    .setAlpha(0)
    .setDepth((b.mode === "cine" ? 6 : 1.4) + depthAdd)
  if (tint !== null) pool.setTint(tint)
  pool.setDisplaySize(w * 0.2, h * 0.2)
  b.temps.push(pool)
  b.scene.tweens.add({ targets: pool, displayWidth: w, displayHeight: h, alpha: 0.92, duration: ms, ease: "Quad.easeOut" })
  return pool
}

/* ---------- Новые варианты ---------- */

/** «Голова с плеч»: голова кувырком улетает, из шеи фонтан, безголовое тело шатается и валится. */
const behead: VariantFn = async (ctx, b, rng) => {
  const sp = ctx.speed
  const parts = ctx.parts
  if (!parts) return halve(ctx, b, rng)
  const s = b.h
  const d = ctx.dir
  const an = anatomy(b)
  const head = partImage(b, parts.head, "head")
  if (!head) return halve(ctx, b, rng)
  head.setDepth(b.depth + 0.1)
  hideBody(b)
  // Безголовое тело — контейнер с точкой опоры у лап
  const torso = b.scene.add.container(ctx.x, ctx.y).setDepth(b.depth)
  b.temps.push(torso)
  let leg: Phaser.GameObjects.Image | null = null
  for (const part of ["tail", "legBack", "body", "legFront"] as CritterPart[]) {
    const img = partImage(b, parts[part], part)
    if (!img) continue
    img.setPosition(img.x - ctx.x, img.y - ctx.y)
    torso.add(img)
    if (part === "legFront") leg = img
  }
  const neck = { x: an.x, y: an.neckY }
  slashLine(b, neck.x - d * b.w * 0.55, neck.y - s * 0.07, neck.x + d * b.w * 0.55, neck.y + s * 0.03, Math.max(2, s * 0.02), sp)
  shake(b, 200 / sp, b.mode === "cine" ? 0.022 : 0.012)
  gush(ctx, b, neck.x, neck.y, 1, "slash", -1)
  if (ctx.unit.isEnemy) ichorSplash(b.scene, neck.x, neck.y, fxSize(ctx, b), d, sp, 1)
  // Голова: высоко, кувырком, с отскоками и кровавым следом
  const headFlight = fly(
    b.scene,
    head,
    d * s * (b.mode === "cine" ? 0.22 + rng() * 0.12 : 0.45 + rng() * 0.2),
    -s * (1.9 + rng() * 0.3),
    s * 3.8,
    ctx.y - an.headR * 0.95,
    d * (620 + rng() * 200),
    sp,
    2,
    (x, y, n) => {
      splatAt(b, x, ctx.y + 2, s * (n === 0 ? 0.34 : 0.2), 21 + n)
      if (n === 0) {
        gush(ctx, b, x, y, 0.5, "blunt", -1)
        dustPuff(b.scene, x, ctx.y, s * 0.3, 5)
      }
    },
    dripper(ctx, b)
  )
  // Фонтан из шеи и пульсирующая струйка
  fountain(ctx, b, neck.x, neck.y, 900)
  bloodSquirt(b.scene, neck.x, neck.y, fxSize(ctx, b), d > 0 ? -65 : -115, 520 / sp, 24, ctx.y)
  // Тело ещё стоит, пошатываясь…
  await tween(b.scene, { targets: torso, angle: -d * 6, duration: 150 / sp, yoyo: true, repeat: 1, ease: "Sine.easeInOut" })
  if (!torso.scene) return
  ctx.onPool?.()
  // …подгибает лапы и валится вперёд
  await tween(b.scene, { targets: torso, scaleY: 0.86, duration: 110 / sp, ease: "Quad.easeOut" })
  if (!torso.scene) return
  await tween(b.scene, { targets: torso, angle: -d * 90, scaleY: 1, duration: 420 / sp, ease: "Bounce.easeOut" })
  if (!torso.scene) return
  gush(ctx, b, ctx.x - d * s * 0.55, ctx.y - s * 0.08, 0.6, "blunt", -1)
  splatAt(b, ctx.x - d * s * 0.5, ctx.y + 2, s * 0.4, 33)
  dustPuff(b.scene, ctx.x - d * s * 0.3, ctx.y, s * 0.4, 6)
  // Лапка дёргается
  if (leg?.scene) await tween(b.scene, { targets: leg, angle: d * 18, duration: 70 / sp, yoyo: true, repeat: 1 })
  await Promise.race([headFlight, wait(b.scene, 700 / sp)])
}

/** «Пополам»: диагональный разрез, верх сползает по линии и падает, низ заваливается в другую сторону. */
const halve: VariantFn = async (ctx, b, rng) => {
  const sp = ctx.speed
  const s = b.h
  const w = b.w
  const d = ctx.dir
  const an = anatomy(b)
  // Линия разреза: через грудь, сверху со стороны удара вниз
  const cx = an.x
  const cy = an.chestY - s * 0.04
  const tilt = 0.32 + rng() * 0.1
  const lineY = (x: number): number => cy + tilt * d * (x - cx)
  const top = bodyCopy(b, 0.5, (cy - b.top) / b.h)
  const low = bodyCopy(b, 0.5, 0.97)
  if (!top || !low) {
    top?.destroy()
    low?.destroy()
    return fall(ctx, b, rng)
  }
  hideBody(b)
  const L = w * 2
  const upPoly = [
    { x: cx - L, y: lineY(cx - L) },
    { x: cx + L, y: lineY(cx + L) },
    { x: cx + L, y: b.top - s },
    { x: cx - L, y: b.top - s }
  ]
  const lowPoly = [
    { x: cx - L, y: lineY(cx - L) },
    { x: cx + L, y: lineY(cx + L) },
    { x: cx + L, y: ctx.y + s },
    { x: cx - L, y: ctx.y + s }
  ]
  const local = (img: Phaser.GameObjects.Image, pts: { x: number, y: number }[]): { x: number, y: number }[] =>
    pts.map(p => ({ x: p.x - img.x, y: p.y - img.y }))
  const mTop = polyMask(b, top, local(top, upPoly))
  const mLow = polyMask(b, low, local(low, lowPoly))
  // Красный срез на каждой половинке
  const cutX = w * 0.2
  const wound = (img: Phaser.GameObjects.Image): { g: Phaser.GameObjects.Graphics, sync: () => void } => {
    const g = b.scene.add.graphics().setDepth(b.depth + 0.05).setAlpha(0)
    const x1 = cx - cutX - img.x
    const x2 = cx + cutX - img.x
    const y1 = lineY(cx - cutX) - img.y
    const y2 = lineY(cx + cutX) - img.y
    g.lineStyle(Math.max(2.5, s * 0.04), 0x9e1420, 1)
    g.lineBetween(x1, y1, x2, y2)
    g.lineStyle(Math.max(1.2, s * 0.018), 0xff4d6d, 1)
    g.lineBetween(x1, y1, x2, y2)
    b.temps.push(g)
    const sync = (): void => {
      if (!img.scene || !g.scene) return
      g.setPosition(img.x, img.y)
      g.setRotation(img.rotation)
    }
    sync()
    return { g, sync }
  }
  const wTop = wound(top)
  const wLow = wound(low)
  const syncTop = (): void => {
    mTop.sync()
    wTop.sync()
  }
  const syncLow = (): void => {
    mLow.sync()
    wLow.sync()
  }
  slashLine(b, cx - d * w * 0.75, lineY(cx - d * w * 0.75), cx + d * w * 0.75, lineY(cx + d * w * 0.75), Math.max(2, s * 0.022), sp)
  shake(b, 180 / sp, b.mode === "cine" ? 0.02 : 0.011)
  b.scene.tweens.add({ targets: [wTop.g, wLow.g], alpha: 1, duration: 120 / sp })
  bloodBurst(b.scene, cx, cy, b.mode === "cine" ? 22 : 12, d > 0 ? { min: -40, max: 20 } : { min: 160, max: 220 }, b.mode === "cine" ? 1.4 : 0.9, sp)
  await wait(b.scene, 160 / sp)
  if (!top.scene) return
  // Верх сползает по линии разреза
  const slide = w * 0.3
  const x0 = top.x
  const y0 = top.y
  bloodSquirt(b.scene, cx, cy, fxSize(ctx, b), d > 0 ? -50 : -130, 420 / sp, 24, ctx.y)
  await tween(b.scene, {
    targets: top,
    x: x0 + d * slide,
    y: y0 + tilt * slide,
    angle: d * 8,
    duration: 280 / sp,
    ease: "Quad.easeIn",
    onUpdate: syncTop
  })
  if (!top.scene) return
  // …и падает за край
  fountain(ctx, b, cx, cy, 650)
  if (ctx.unit.isEnemy) ichorSplash(b.scene, cx, cy, fxSize(ctx, b), d, sp, 1)
  ctx.onPool?.()
  const landX = x0 + d * w * (b.mode === "cine" ? 0.6 : 0.85)
  const fallTop = tween(b.scene, {
    targets: top,
    x: landX,
    y: ctx.y - s * 0.2,
    angle: d * 96,
    duration: 360 / sp,
    ease: "Quad.easeIn",
    onUpdate: syncTop
  }).then(() => {
    if (!top.scene) return
    splatAt(b, landX, ctx.y + 2, s * 0.42, 41)
    gush(ctx, b, landX, ctx.y - s * 0.15, 0.6, "blunt", -1)
    dustPuff(b.scene, landX, ctx.y, s * 0.35, 6)
  })
  await wait(b.scene, 260 / sp)
  if (!low.scene) return
  // Низ заваливается в обратную сторону
  const fallLow = tween(b.scene, {
    targets: low,
    angle: -d * 84,
    duration: 420 / sp,
    ease: "Bounce.easeOut",
    onUpdate: syncLow
  })
  await Promise.all([fallTop, fallLow])
  if (!low.scene) return
  syncLow()
  gush(ctx, b, ctx.x - d * s * 0.45, ctx.y - s * 0.1, 0.6, "blunt", -1)
  splatAt(b, ctx.x - d * s * 0.5, ctx.y + 2, s * 0.36, 43)
  await wait(b.scene, 160 / sp)
}

/** «Насаживание»: копьё снизу пронзает, подбрасывает и держит на весу; тело сползает по древку. */
const impale: VariantFn = async (ctx, b) => {
  const sp = ctx.speed
  const s = b.h
  const d = ctx.dir
  ensureDeathTextures(b.scene)
  const an = anatomy(b)
  const ang = Phaser.Math.DegToRad(d > 0 ? -52 : -128)
  const ux = Math.cos(ang)
  const uy = Math.sin(ang)
  const chest = { x: an.x, y: an.chestY - s * 0.04 }
  const len = s * 1.55
  const thick = s * 0.07
  const tipEnd = { x: chest.x + ux * s * 0.42, y: chest.y + uy * s * 0.42 }
  const tipStart = { x: chest.x - ux * s * 0.35, y: chest.y - uy * s * 0.35 }
  const shaft = b.scene.add
    .image(tipStart.x, tipStart.y, DTEX.spear)
    .setOrigin(1, 0.5)
    .setRotation(ang)
    .setDepth(b.depth - 0.2)
  shaft.setDisplaySize(len, thick)
  const tip = b.scene.add
    .image(tipStart.x, tipStart.y, DTEX.spear)
    .setOrigin(1, 0.5)
    .setRotation(ang)
    .setDepth(b.depth + 0.2)
    .setAlpha(0)
  tip.setDisplaySize(len, thick)
  tip.setCrop(SPEAR_TIP - 16, 0, SPEAR_W - SPEAR_TIP + 16, SPEAR_H)
  b.temps.push(shaft, tip)
  const spear = [shaft, tip]
  // Удар снизу
  await tween(b.scene, { targets: spear, x: tipEnd.x, y: tipEnd.y, duration: 110 / sp, ease: "Quad.easeIn" })
  if (!alive(b)) return
  tip.setAlpha(1)
  shake(b, 160 / sp, b.mode === "cine" ? 0.02 : 0.011)
  const exitA = Phaser.Math.RadToDeg(ang)
  bloodBurst(b.scene, chest.x + ux * s * 0.18, chest.y + uy * s * 0.18, b.mode === "cine" ? 26 : 14, { min: exitA - 25, max: exitA + 25 }, b.mode === "cine" ? 1.5 : 0.9, sp)
  gush(ctx, b, chest.x, chest.y, 1, "pierce", -0.8)
  if (ctx.unit.isEnemy) ichorSplash(b.scene, chest.x, chest.y, fxSize(ctx, b), d, sp, 1)
  // Подброс: тело и копьё вместе вверх
  const lift = s * 0.36
  await Promise.all([
    tween(b.scene, { targets: b.t, y: b.y0 - lift, angle: d * 10, duration: 240 / sp, ease: "Back.easeOut" }),
    tween(b.scene, { targets: spear, y: tipEnd.y - lift, duration: 240 / sp, ease: "Back.easeOut" })
  ])
  if (!alive(b)) return
  // Висит: лапы болтаются, кровь стекает по древку
  bloodSquirt(b.scene, chest.x + ux * s * 0.2, chest.y - lift + uy * s * 0.2, fxSize(ctx, b), exitA, 380 / sp, 24, ctx.y)
  const base = { x: tipEnd.x - ux * len, y: tipEnd.y - lift - uy * len }
  const from = { x: chest.x, y: chest.y - lift }
  for (let i = 0; i < 5; i++) {
    const drop = b.scene.add
      .image(from.x, from.y, TEX.dot)
      .setTint(i % 2 ? 0xd9122b : 0x9e1420)
      .setDepth(b.depth - 0.1)
    drop.setDisplaySize(s * 0.045, s * 0.055)
    b.temps.push(drop)
    b.scene.tweens.add({
      targets: drop,
      x: from.x + (base.x - from.x) * 0.75,
      y: from.y + (base.y - from.y) * 0.75,
      delay: (i * 90) / sp,
      duration: 420 / sp,
      ease: "Quad.easeIn",
      onComplete: () => {
        if (!drop.scene) return
        bloodDrip(b.scene, drop.x, drop.y, ctx.y + 2, fxSize(ctx, b), sp)
        drop.destroy()
      }
    })
  }
  ctx.onPool?.()
  await tween(b.scene, { targets: b.t, angle: d * 16, duration: 140 / sp, yoyo: true, repeat: 1, ease: "Sine.easeInOut" })
  if (!alive(b)) return
  // Сползает по древку…
  const slide = s * 0.3
  await tween(b.scene, {
    targets: b.t,
    x: b.x0 - ux * slide,
    y: b.y0 - lift - uy * slide,
    angle: d * 24,
    duration: 340 / sp,
    ease: "Quad.easeIn"
  })
  if (!alive(b)) return
  // …и шлёпается на землю, копьё выдёргивают
  b.scene.tweens.add({
    targets: spear,
    x: `-=${ux * s * 0.9}`,
    y: `-=${uy * s * 0.9}`,
    alpha: 0,
    duration: 320 / sp,
    ease: "Quad.easeIn",
    onComplete: () => spear.forEach(o => o.destroy())
  })
  await tween(b.scene, { targets: b.t, y: lyingY(ctx, b), angle: d * 90, duration: 320 / sp, ease: "Bounce.easeOut" })
  if (!alive(b)) return
  const gx = ctx.x - ux * slide + d * s * 0.3
  gush(ctx, b, gx, ctx.y - s * 0.1, 0.7, "blunt", -1)
  splatAt(b, gx, ctx.y + 2, s * 0.4, 51)
  dustPuff(b.scene, gx, ctx.y, s * 0.4, 6)
  await twitch(b, sp)
}

/** «Ёж из стрел»: залп стрел втыкается в тело, оно качается и валится навзничь (стрелы торчат). */
const pincushion: VariantFn = async (ctx, b, rng) => {
  const sp = ctx.speed
  const s = b.h
  const d = ctx.dir
  ensureDeathTextures(b.scene)
  const an = anatomy(b)
  const n = 6
  for (let i = 0; i < n; i++) {
    if (!alive(b)) return
    const tx = an.x + (rng() - 0.5) * b.w * 0.36
    const ty = an.headY - an.headR * 0.4 + (an.chestY + s * 0.03 - (an.headY - an.headR * 0.4)) * rng()
    const tilt = (rng() - 0.5) * 34
    const rot = Phaser.Math.DegToRad((d > 0 ? 0 : 180) + tilt)
    const ax = tx - Math.cos(rot) * s * 1.3
    const ay = ty - Math.sin(rot) * s * 1.3
    const arrow = b.scene.add
      .image(ax, ay, DTEX.arrow)
      .setOrigin(0.82, 0.5)
      .setRotation(rot)
      .setDepth(b.depth + 0.3)
    arrow.setDisplaySize(s * 0.58, s * 0.1)
    b.temps.push(arrow)
    await tween(b.scene, { targets: arrow, x: tx, y: ty, duration: 80 / sp, ease: "Linear" })
    if (!alive(b) || !arrow.scene) return
    glue(b, arrow)
    const a = Phaser.Math.RadToDeg(rot)
    bloodBurst(b.scene, tx, ty, b.mode === "cine" ? 10 : 6, { min: a - 160, max: a - 110 }, b.mode === "cine" ? 1 : 0.6, sp)
    if (i % 2 === 0) bloodSquirt(b.scene, tx, ty, fxSize(ctx, b) * 0.7, d > 0 ? -150 : -30, 210 / sp, 24, ctx.y)
    if (ctx.unit.isEnemy && i === n - 1) ichorSplash(b.scene, tx, ty, fxSize(ctx, b), -d, sp, 0.8)
    shake(b, 60 / sp, 0.004)
    await tween(b.scene, { targets: b.t, angle: d * (3 + i * 2.5), duration: 60 / sp, ease: "Quad.easeOut" })
    await wait(b.scene, 50 / sp)
  }
  if (!alive(b)) return
  // Качается…
  await tween(b.scene, { targets: b.t, angle: -d * 6, duration: 180 / sp, yoyo: true, ease: "Sine.easeInOut" })
  if (!alive(b)) return
  ctx.onPool?.()
  // …и валится навзничь
  await tween(b.scene, { targets: b.t, angle: d * 92, y: lyingY(ctx, b), duration: 420 / sp, ease: "Bounce.easeOut" })
  if (!alive(b)) return
  gush(ctx, b, ctx.x + d * s * 0.4, ctx.y - s * 0.1, 0.7, "arrow", -1)
  splatAt(b, ctx.x + d * s * 0.45, ctx.y + 2, s * 0.42, 61)
  dustPuff(b.scene, ctx.x + d * s * 0.3, ctx.y, s * 0.45, 8)
  await twitch(b, sp)
}

/** «Пепел»: вспыхивает тёмным пламенем, обугливается (моргает белыми глазками) и рассыпается пеплом по ветру. */
const ash: VariantFn = async (ctx, b) => {
  const sp = ctx.speed
  const s = b.h
  const d = ctx.dir
  ensureDeathTextures(b.scene)
  const an = anatomy(b)
  // Языки пламени
  const flames = b.scene.time.addEvent({
    delay: 85 / sp,
    repeat: 6,
    callback: () => {
      if (!alive(b)) return
      puff(b.scene, an.x, b.top + b.h * 0.62, TEX.disc, [0xff7a1a, 0xffc94d, 0x9b4dff, 0xff4d6d], {
        count: 3,
        speed: [s * 0.25, s * 0.6],
        angle: { min: 255, max: 285 },
        gravity: -s * 0.8,
        scale: [(s * 0.09) / 64, 0],
        life: [300, 520],
        area: { w: b.w * 0.55, h: b.h * 0.5 }
      })
    }
  })
  b.cleanup.push(() => flames.remove(false))
  gush(ctx, b, an.x, an.chestY, 0.7, "magic", -1)
  await tintRamp(b, 0xff8a3d, 200 / sp)
  if (!alive(b)) return
  await tintRamp(b, 0x2a2024, 340 / sp, 0xff8a3d)
  if (!alive(b)) return
  // Белые глазки на угольке
  const eyes = [-1, 1].map((k) => {
    const e = b.scene.add
      .image(an.x + k * b.w * 0.085, an.headY + an.headR * 0.05, TEX.dot)
      .setTint(0xffffff)
      .setDepth(b.depth + 0.5)
      .setAlpha(0)
    e.setDisplaySize(s * 0.05, s * 0.06)
    b.temps.push(e)
    return e
  })
  await tween(b.scene, { targets: eyes, alpha: 1, duration: 120 / sp })
  await tween(b.scene, { targets: eyes, scaleY: eyes[0]!.scaleY * 0.1, duration: 70 / sp, yoyo: true, hold: 30 / sp })
  await wait(b.scene, 140 / sp)
  if (!alive(b)) return
  // Ветер сдувает пепел: тело стирается от наветренной стороны (сверху раньше)
  const copy = bodyCopy(b)
  if (!copy) {
    eyes.forEach(e => e.destroy())
    ctx.onPool?.()
    await tween(b.scene, { targets: b.t, alpha: 0, duration: 500 / sp })
    return
  }
  copy.setTint(0x2a2024)
  hideBody(b)
  const g = b.scene.make.graphics({ x: 0, y: 0 }, false)
  b.temps.push(g)
  copy.setMask(g.createGeometryMask())
  const slant = b.w * 0.45
  const x0 = d > 0 ? b.left - slant : b.left + b.w + slant
  const span = b.w + slant * 2
  const yTop = b.top - s * 0.1
  const yBot = ctx.y + s * 0.1
  const edgeAt = (k: number, y: number): number => x0 + d * (k * span + ((yBot - y) / (yBot - yTop)) * slant - slant * 0.5)
  const draw = (k: number): void => {
    g.clear()
    g.fillStyle(0xffffff, 1)
    const far = d > 0 ? b.left + b.w + s : b.left - s
    g.fillPoints(
      [
        new Phaser.Math.Vector2(edgeAt(k, yTop), yTop),
        new Phaser.Math.Vector2(far, yTop),
        new Phaser.Math.Vector2(far, yBot),
        new Phaser.Math.Vector2(edgeAt(k, yBot), yBot)
      ],
      true,
      true
    )
  }
  draw(0)
  const proxy = { k: 0 }
  let last = 0
  ctx.onPool?.()
  await tween(b.scene, {
    targets: proxy,
    k: 1,
    duration: 1150 / sp,
    ease: "Sine.easeInOut",
    onUpdate: () => {
      if (!copy.scene) return
      draw(proxy.k)
      for (const e of eyes) if (e.scene && e.alpha > 0 && (edgeAt(proxy.k, e.y) - e.x) * d > 0) e.setAlpha(0)
      const now = b.scene.time.now
      if (now - last < 60 / sp) return
      last = now
      const midY = b.top + b.h * 0.6
      const ex = edgeAt(proxy.k, midY)
      if ((ex - b.left) * (b.left + b.w - ex) < 0) return
      puff(b.scene, ex, midY, TEX.square, [0x2a2224, 0x4a3f42, 0x6b5f62, 0x1a1414, 0xff7a1a], {
        count: 5,
        speed: [s * 0.4, s * 1.1],
        angle: d > 0 ? { min: -40, max: 5 } : { min: 175, max: 220 },
        gravity: -s * 0.25,
        scale: [(s * 0.06) / 32, (s * 0.015) / 32],
        life: [500, 800],
        rotate: true,
        area: { w: s * 0.06, h: b.h * 0.7 }
      })
    }
  })
  eyes.forEach(e => e.destroy())
  copy.clearMask()
  copy.destroy()
  g.destroy()
  // Кучка пепла с угольками
  const pile = b.scene.add
    .image(ctx.x, ctx.y, TEX.disc)
    .setTint(0x2a2326)
    .setAlpha(0)
    .setDepth(b.mode === "cine" ? 6.5 : 1.45)
  pile.setDisplaySize(s * 0.55, s * 0.13)
  b.temps.push(pile)
  b.scene.tweens.add({ targets: pile, alpha: 0.9, duration: 200 / sp })
  puff(b.scene, ctx.x, ctx.y - s * 0.03, TEX.dot, [0xff7a1a, 0xffc94d], {
    count: 5,
    speed: [s * 0.05, s * 0.2],
    angle: { min: 250, max: 290 },
    gravity: -s * 0.3,
    scale: [(s * 0.035) / 8, 0],
    life: [400, 700],
    area: { w: s * 0.4, h: s * 0.05 }
  })
  await wait(b.scene, 200 / sp)
}

/** «Ледышка»: вмерзает в глыбу льда, по ней бегут трещины, глыба разлетается осколками с мороженой кровью. */
const freeze: VariantFn = async (ctx, b, rng) => {
  const sp = ctx.speed
  const s = b.h
  const d = ctx.dir
  ensureDeathTextures(b.scene)
  const an = anatomy(b)
  const bw = b.w * 0.98
  const bh = ctx.y - (an.headY - an.headR * 1.55)
  const block = b.scene.add
    .graphics()
    .setDepth(b.depth + 0.4)
    .setPosition(an.x, ctx.y + s * 0.02)
  const r = s * 0.06
  block.fillStyle(0xbfeaff, 0.45)
  block.fillRoundedRect(-bw / 2, -bh, bw, bh, r)
  block.lineStyle(Math.max(1.5, s * 0.014), 0xffffff, 0.9)
  block.strokeRoundedRect(-bw / 2, -bh, bw, bh, r)
  block.fillStyle(0xffffff, 0.55)
  block.fillRoundedRect(-bw * 0.38, -bh * 0.9, bw * 0.07, bh * 0.55, bw * 0.03)
  block.fillRoundedRect(-bw * 0.26, -bh * 0.9, bw * 0.035, bh * 0.25, bw * 0.015)
  block.lineStyle(Math.max(1, s * 0.008), 0xe6f7ff, 0.7)
  block.lineBetween(bw * 0.15, -bh, bw * 0.48, -bh * 0.62)
  block.lineBetween(-bw * 0.48, -bh * 0.3, -bw * 0.2, 0)
  block.setScale(1, 0)
  b.temps.push(block)
  puff(b.scene, an.x, ctx.y - s * 0.05, TEX.dot, [0xffffff, 0xdff3ff, 0xa8dcff], {
    count: 10,
    speed: [s * 0.2, s * 0.6],
    angle: { min: 200, max: 340 },
    gravity: -s * 0.2,
    scale: [(s * 0.035) / 8, 0],
    life: [400, 700],
    area: { w: bw, h: s * 0.1 }
  })
  await Promise.all([
    tween(b.scene, { targets: block, scaleY: 1, duration: 380 / sp, ease: "Back.easeOut" }),
    tintRamp(b, 0x9fd8ff, 380 / sp)
  ])
  if (!alive(b)) return
  // Блеск
  const glint = b.scene.add
    .image(an.x + bw * 0.32, ctx.y - bh * 0.85, TEX.star)
    .setTint(0xffffff)
    .setDepth(b.depth + 0.6)
    .setScale(0)
  b.temps.push(glint)
  b.scene.tweens.add({ targets: glint, scale: (s * 0.16) / 16, angle: 90, duration: 200 / sp, yoyo: true, onComplete: () => glint.destroy() })
  await wait(b.scene, 300 / sp)
  if (!alive(b)) return
  // Трещины от точки удара
  const cracks = b.scene.add.graphics().setDepth(b.depth + 0.5)
  b.temps.push(cracks)
  const ox = an.x - d * bw * 0.28
  const oy = ctx.y - bh * 0.55
  for (let step = 0; step < 2; step++) {
    cracks.lineStyle(Math.max(1.5, s * 0.012), 0x3f7fb5, 1)
    for (let i = 0; i < 3; i++) {
      let x = ox
      let y = oy
      const a = (rng() * 2 - 1) * Math.PI * 0.45 + (d > 0 ? 0 : Math.PI)
      cracks.beginPath()
      cracks.moveTo(x, y)
      for (let k = 0; k < 4; k++) {
        const aa = a + (rng() - 0.5) * 0.9
        x += Math.cos(aa) * bw * (0.12 + step * 0.06)
        y += Math.sin(aa) * bw * 0.12
        cracks.lineTo(x, y)
      }
      cracks.strokePath()
    }
    shake(b, 70 / sp, 0.005)
    await wait(b.scene, 170 / sp)
    if (!alive(b)) return
  }
  // Разлетается
  hideBody(b)
  block.destroy()
  cracks.destroy()
  shake(b, 200 / sp, b.mode === "cine" ? 0.022 : 0.012)
  shockRing(b.scene, an.x, ctx.y - bh * 0.5, s, 0xdff3ff, 360 / sp)
  const flights: Promise<void>[] = []
  const colors = [0xdff3ff, 0xa8dcff, 0xffffff, 0xff8fa3, b.furColor]
  for (let i = 0; i < 13; i++) {
    const meat = i >= 11
    const img = b.scene.add
      .image(an.x + (rng() - 0.5) * bw * 0.8, ctx.y - bh * (0.1 + rng() * 0.8), meat ? GORE_TEX.chunk : DTEX.shard)
      .setDepth(b.depth + (rng() < 0.5 ? 0.3 : -0.1))
      .setAngle(rng() * 360)
    if (!meat) img.setTint(colors[i % colors.length]!)
    else ensureGoreTextures(b.scene)
    const sz = s * (meat ? 0.1 : 0.1 + rng() * 0.1)
    img.setDisplaySize(sz, sz)
    b.temps.push(img)
    flights.push(
      fly(
        b.scene,
        img,
        d * s * (0.2 + rng() * 0.9) + (rng() - 0.5) * s * 0.7,
        -s * (0.4 + rng() * 0.8),
        s * 3.6,
        ctx.y + (rng() - 0.5) * s * 0.1,
        (rng() - 0.5) * 720,
        sp,
        1,
        meat ? (x, y, k) => k === 0 && splatAt(b, x, ctx.y + 2, s * 0.22, 70 + i) : undefined
      )
    )
  }
  puff(b.scene, an.x, ctx.y - bh * 0.5, TEX.dot, [0xffffff, 0xdff3ff], {
    count: 12,
    speed: [s * 0.3, s * 1],
    gravity: s * 1.2,
    scale: [(s * 0.04) / 8, 0],
    life: [400, 700]
  })
  bloodBurst(b.scene, an.x, an.chestY, b.mode === "cine" ? 16 : 8, null, b.mode === "cine" ? 1.2 : 0.7, sp)
  gush(ctx, b, an.x, an.chestY, 0.6, "blunt", -0.6)
  ctx.onPool?.()
  await Promise.race([Promise.all(flights), wait(b.scene, 1100 / sp)])
}

/** «Душа вознеслась»: тело сереет и ложится, призрак с нимбом и крылышками машет лапкой и улетает вверх. */
const ascend: VariantFn = async (ctx, b) => {
  const sp = ctx.speed
  const s = b.h
  const w = b.w
  const d = ctx.dir
  ensureDeathTextures(b.scene)
  const an = anatomy(b)
  gush(ctx, b, an.x, an.chestY, 0.6, "magic", -1)
  ctx.onPool?.()
  await Promise.all([
    tintRamp(b, 0x8f8f96, 460 / sp),
    tween(b.scene, { targets: b.t, angle: d * 90, y: lyingY(ctx, b), duration: 560 / sp, ease: "Sine.easeInOut" })
  ])
  if (!alive(b)) return
  dustPuff(b.scene, ctx.x + d * s * 0.3, ctx.y, s * 0.3, 5)
  bloodDrip(b.scene, ctx.x + d * s * 0.4, ctx.y - s * 0.1, ctx.y + 2, fxSize(ctx, b), sp)
  const soul = bodyCopy(b)
  if (!soul) {
    await wait(b.scene, 300 / sp)
    return
  }
  soul.setTint(0xcfe9ff).setAlpha(0).setDepth(b.depth + 1)
  // Сияние вокруг души: та же фигура белым силуэтом, чуть крупнее
  const glow = bodyCopy(b)
  glow?.setTintFill(0xffffff).setAlpha(0).setDepth(b.depth + 0.95).setScale(glow.scaleX * 1.08, glow.scaleY * 1.04)
  const sx = soul.x
  const sy = soul.y
  const headDy = an.headY - sy
  const halo = b.scene.add.image(sx, sy, TEX.ring).setTint(0xffd166).setDepth(b.depth + 1.1).setAlpha(0)
  halo.setDisplaySize(w * 0.36, w * 0.1)
  const wings = [-1, 1].map(k =>
    b.scene.add
      .image(sx, sy, TEX.disc)
      .setTint(0xffffff)
      .setDepth(b.depth + 0.9)
      .setAlpha(0)
      .setAngle(k * -28)
      .setDisplaySize(w * 0.36, s * 0.17)
  )
  const paw = b.scene.add.image(sx, sy, TEX.disc).setTint(0xeaf6ff).setDepth(b.depth + 1.05).setAlpha(0)
  paw.setDisplaySize(w * 0.14, w * 0.14)
  const bits = [halo, ...wings, paw]
  b.temps.push(...bits)
  puff(b.scene, sx, an.chestY, TEX.star, [0xffd166, 0xfff3b0, 0xffffff], {
    count: 7,
    speed: [s * 0.2, s * 0.6],
    gravity: -s * 0.3,
    scale: [(s * 0.1) / 16, 0],
    life: [500, 800],
    rotate: true,
    area: { w: w * 0.5, h: s * 0.4 }
  })
  const wingW = wings[0]!.scaleY
  const proxy = { k: 0 }
  await tween(b.scene, {
    targets: proxy,
    k: 1,
    duration: 1400 / sp,
    ease: "Sine.easeInOut",
    onUpdate: () => {
      if (!soul.scene) return
      const k = proxy.k
      const x = sx + Math.sin(k * Math.PI * 2) * w * 0.08
      const y = sy - k * s * 1.0
      const a = k < 0.15 ? k / 0.15 : k > 0.72 ? Math.max(0, 1 - (k - 0.72) / 0.28) : 1
      soul.setPosition(x, y).setAlpha(0.6 * a)
      glow?.setPosition(x, y).setAlpha(0.3 * a)
      const hy = y + headDy
      halo.setPosition(x, hy - an.headR * 1.15 + Math.sin(k * 20) * s * 0.008).setAlpha(0.95 * a)
      const flap = 0.55 + 0.45 * Math.abs(Math.sin(k * Math.PI * 9))
      wings.forEach((wg, i) => {
        const side = i === 0 ? -1 : 1
        wg.setPosition(x + side * w * 0.3, hy + an.headR * 1.2).setAlpha(0.85 * a)
        wg.scaleY = wingW * flap
      })
      // Лапка машет: дуга вокруг «плеча»
      const wave = Phaser.Math.DegToRad(-90 + 35 * Math.sin(k * Math.PI * 10))
      const shx = x + d * -1 * w * 0.24
      const shy = hy + an.headR * 0.9
      paw.setPosition(shx + Math.cos(wave) * w * 0.05 - d * w * 0.06, shy + Math.sin(wave) * s * 0.12).setAlpha(0.85 * a)
    }
  })
  soul.destroy()
  glow?.destroy()
  bits.forEach(o => o.destroy())
  await wait(b.scene, 100 / sp)
}

/** «Воздушный шарик»: раздувается рывками, всплывает, лопается конфетти и кровью; шкурка со свистом носится и падает. */
const balloon: VariantFn = async (ctx, b, rng) => {
  const sp = ctx.speed
  const s = b.h
  const d = ctx.dir
  const tint = tintRamp(b, 0xffb8cf, 520 / sp)
  const steps: [number, number][] = [[1.14, 1.1], [1.3, 1.24], [1.5, 1.44]]
  for (const [sx, sy] of steps) {
    if (!alive(b)) return
    await scaleFromFeet(b, sx, sy, 110 / sp, "Back.easeOut")
    await wait(b.scene, 70 / sp)
  }
  await tint
  if (!alive(b)) return
  // Всплывает и покачивается
  const lastSy = steps[2]![1]
  const floatY = b.y0 + b.feetOffset * (1 - lastSy) - s * 0.22
  await Promise.all([
    tween(b.scene, { targets: b.t, y: floatY, duration: 300 / sp, ease: "Sine.easeOut" }),
    tween(b.scene, { targets: b.t, angle: -d * 7, duration: 150 / sp, yoyo: true, ease: "Sine.easeInOut" })
  ])
  if (!alive(b)) return
  await tween(b.scene, { targets: b.t, angle: d * 6, scaleX: b.sx0 * 1.58, duration: 130 / sp, yoyo: true, ease: "Sine.easeInOut" })
  if (!alive(b)) return
  const m = bodyMatrix(b)
  const c = m.transformPoint(0, 0)
  const cy = b.mode === "cine" ? floatY - s * 0.6 : c.y
  const cx = b.mode === "cine" ? b.t.x : c.x
  flash(b, 40 / sp)
  await wait(b.scene, 40 / sp)
  if (!alive(b)) return
  hideBody(b)
  shake(b, 200 / sp, b.mode === "cine" ? 0.024 : 0.012)
  punchText(b.scene, cx, cy - s * 0.2, tr("POP!", "ПУФ!"), "#ff8fc7", b.mode === "cine" ? 40 : ctx.size * 0.42, sp)
  puff(b.scene, cx, cy, TEX.square, [0xff6b9d, 0xffd166, 0x6ee7b7, 0x60a5fa, 0xc084fc], {
    count: 14,
    speed: [s * 0.8, s * 2],
    gravity: s * 2.4,
    scale: [(s * 0.055) / 32, (s * 0.03) / 32],
    life: [600, 1000],
    rotate: true
  })
  shockRing(b.scene, cx, cy, s, 0xff8fc7, 340 / sp)
  bloodBurst(b.scene, cx, cy, b.mode === "cine" ? 40 : 26, null, b.mode === "cine" ? 1.8 : 1.1, sp)
  gush(ctx, b, cx, cy, 1, "blunt", 0)
  if (ctx.unit.isEnemy) ichorSplash(b.scene, cx, cy, fxSize(ctx, b), d, sp, 1.2)
  const bits = chunks(ctx, b, rng, 6)
  ctx.onPool?.()
  // Сдутая шкурка носится зигзагом и падает
  const skin = bodyCopy(b, 0.5, 0.5)
  if (skin) {
    skin.setPosition(cx, cy).setTint(0xffb8cf).setDepth(b.depth + 0.2)
    skin.setDisplaySize(b.w * 0.5, b.h * 0.42)
    let x = cx
    let y = cy
    for (let i = 0; i < 4; i++) {
      if (!skin.scene) break
      x = cx + (rng() - 0.5) * s * 1.1
      y = cy - s * (0.1 + rng() * 0.4)
      await tween(b.scene, {
        targets: skin,
        x,
        y,
        angle: skin.angle + (rng() < 0.5 ? -1 : 1) * (160 + rng() * 120),
        scaleX: skin.scaleX * 0.88,
        scaleY: skin.scaleY * 0.88,
        duration: 95 / sp,
        ease: "Sine.easeInOut"
      })
      bloodDrip(b.scene, x, y, ctx.y + 2, fxSize(ctx, b), sp)
    }
    if (skin.scene) {
      bits.push(
        fly(b.scene, skin, d * s * 0.2, 0, s * 4, ctx.y - s * 0.04, d * 300, sp, 1, (lx, _y, k) => {
          if (k === 0) splatAt(b, lx, ctx.y + 2, s * 0.3, 81)
        })
      )
    }
  }
  await Promise.race([Promise.all(bits), wait(b.scene, 1000 / sp)])
}

/** «Нокаут»: выбитый зуб, звёздочки и птички над головой, падает плашмя «K.O.», из-под тела растекается лужа. */
const knockout: VariantFn = async (ctx, b) => {
  const sp = ctx.speed
  const s = b.h
  const d = ctx.dir
  ensureDeathTextures(b.scene)
  const an = anatomy(b)
  // Зуб с кровью
  const tooth = b.scene.add
    .image(an.x + d * b.w * 0.04, an.headY + an.headR * 0.45, TEX.square)
    .setTint(0xfffdf4)
    .setDepth(b.depth + 0.4)
  tooth.setDisplaySize(s * 0.045, s * 0.06)
  b.temps.push(tooth)
  bloodBurst(b.scene, tooth.x, tooth.y, b.mode === "cine" ? 12 : 6, d > 0 ? { min: -60, max: 0 } : { min: 180, max: 240 }, 0.8, sp)
  const toothFlight = fly(b.scene, tooth, d * s * 0.75, -s * 1.3, s * 4, ctx.y - s * 0.02, d * 900, sp, 1, (x, _y, k) => {
    if (k === 0) splatAt(b, x, ctx.y + 2, s * 0.14, 91)
  }, dripper(ctx, b))
  // Орбита из звёзд и птичек над головой — следует за головой и когда тело лежит
  const m0 = bodyMatrix(b)
  const ctr = m0.applyInverse(an.x, an.headY - an.headR * 1.2)
  const orbiters: Phaser.GameObjects.Image[] = []
  for (let i = 0; i < 5; i++) {
    const bird = i % 2 === 1
    const o = b.scene.add.image(an.x, an.headY, bird ? DTEX.bird : DTEX.star).setDepth(b.depth + 0.6)
    if (bird) o.setDisplaySize(s * 0.2, s * 0.15)
    else o.setTint(0xffd166).setDisplaySize(s * 0.15, s * 0.15)
    b.temps.push(o)
    orbiters.push(o)
  }
  const base = orbiters.map(o => o.scaleX)
  const t0 = b.scene.time.now
  const rx = b.w * 0.4
  const ry = s * 0.08
  const stopOrbit = everyFrame(b, () => {
    if (!alive(b)) return
    const c = bodyMatrix(b).transformPoint(ctr.x, ctr.y)
    const ph = (b.scene.time.now - t0) * 0.007 * sp
    orbiters.forEach((o, i) => {
      if (!o.scene) return
      const a = ph + (i * Math.PI * 2) / orbiters.length
      o.setPosition(c.x + Math.cos(a) * rx, c.y + Math.sin(a) * ry)
      o.setDepth(b.depth + (Math.sin(a) > 0 ? 0.6 : -0.1))
      const isBird = i % 2 === 1
      if (isBird) o.setFlipX(Math.sin(a) < 0)
      else o.setAngle(ph * 60).setScale(base[i]! * (0.85 + 0.25 * Math.sin(a * 2)))
    })
  })
  // Шатается…
  await tween(b.scene, { targets: b.t, angle: -d * 9, duration: 150 / sp, ease: "Sine.easeInOut" })
  if (!alive(b)) return
  await tween(b.scene, { targets: b.t, angle: d * 9, duration: 300 / sp, yoyo: true, repeat: 0, ease: "Sine.easeInOut" })
  if (!alive(b)) return
  // …и падает плашмя, как доска
  await tween(b.scene, { targets: b.t, angle: d * 90, y: lyingY(ctx, b), duration: 300 / sp, ease: "Quad.easeIn" })
  if (!alive(b)) return
  shake(b, 200 / sp, b.mode === "cine" ? 0.022 : 0.012)
  punchText(b.scene, ctx.x + d * s * 0.3, ctx.y - s * 0.55, "K.O.!", "#ffd166", b.mode === "cine" ? 42 : ctx.size * 0.42, sp)
  dustPuff(b.scene, ctx.x + d * s * 0.3, ctx.y, s * 0.5, 10)
  const px = b.mode === "cine" ? ctx.x + d * s * 0.42 : ctx.x
  gush(ctx, b, px, ctx.y - s * 0.08, 0.8, "blunt", -1)
  await tween(b.scene, { targets: b.t, angle: d * 84, duration: 70 / sp, yoyo: true })
  ctx.onPool?.()
  ensureGoreTextures(b.scene)
  growPool(b, px, ctx.y + 2, GORE_TEX.pool(2), null, s * 1.4, s * 0.42, 700 / sp)
  if (ctx.unit.isEnemy) growPool(b, px + d * s * 0.12, ctx.y + 3, TEX.pool, 0x7cb518, s * 0.6, s * 0.18, 600 / sp, 0.05)
  await wait(b.scene, 650 / sp)
  stopOrbit()
  await Promise.all([
    tween(b.scene, { targets: orbiters, alpha: 0, duration: 260 / sp }),
    Promise.race([toothFlight, wait(b.scene, 200 / sp)])
  ])
  orbiters.forEach(o => o.destroy())
}

/** «Зомби-лужа» (только зомби): дёргается, будто снова встаёт, и стекает в зелёную лужу с пузырями и костями. */
const zombieMelt: VariantFn = async (ctx, b, rng) => {
  if (!ctx.unit.isEnemy) return sink(ctx, b, rng)
  const sp = ctx.speed
  const s = b.h
  const d = ctx.dir
  ensureDeathTextures(b.scene)
  ensureGoreTextures(b.scene)
  // Оседает…
  await scaleFromFeet(b, 1.1, 0.8, 150 / sp, "Quad.easeOut")
  if (!alive(b)) return
  // …и рывками пытается встать снова
  for (let i = 0; i < 3; i++) {
    if (!alive(b)) return
    await Promise.all([
      tween(b.scene, { targets: b.t, angle: (i % 2 ? -1 : 1) * d * 11, duration: 70 / sp, ease: "Quad.easeOut" }),
      scaleFromFeet(b, 1.06 - i * 0.05, 0.84 + i * 0.09, 90 / sp, "Back.easeOut")
    ])
    if (i === 1) ichorSplash(b.scene, ctx.x, ctx.y - s * 0.5, fxSize(ctx, b), -d, sp, 0.7)
  }
  if (!alive(b)) return
  await Promise.all([
    tween(b.scene, { targets: b.t, angle: 0, duration: 110 / sp }),
    scaleFromFeet(b, 0.92, 1.12, 140 / sp, "Back.easeOut")
  ])
  if (!alive(b)) return
  punchText(b.scene, ctx.x, ctx.y - s * 1.05, tr("Grr…?", "Ррр…?"), "#b5e655", b.mode === "cine" ? 28 : ctx.size * 0.3, sp)
  await wait(b.scene, 200 / sp)
  if (!alive(b)) return
  // Не вышло: стекает в лужу
  // Зелёная лужа поверх обычной кровавой (её кладёт onPool), внутри — немного красного
  growPool(b, ctx.x, ctx.y + 2, TEX.pool, 0x6fa12a, s * 1.6, s * 0.48, 820 / sp, 0.1)
  growPool(b, ctx.x + d * s * 0.15, ctx.y + 3, GORE_TEX.pool(1), null, s * 0.6, s * 0.18, 700 / sp, 0.15)
  const drips = b.scene.time.addEvent({
    delay: 160 / sp,
    repeat: 3,
    callback: () => {
      if (!alive(b)) return
      ichorSplash(b.scene, ctx.x + (rng() - 0.5) * s * 0.4, ctx.y - s * 0.15, fxSize(ctx, b) * 0.6, rng() < 0.5 ? -1 : 1, sp, 0.6)
    }
  })
  b.cleanup.push(() => drips.remove(false))
  await Promise.all([
    scaleFromFeet(b, 1.75, 0.05, 820 / sp, "Quad.easeIn"),
    tintRamp(b, 0x7cb518, 500 / sp)
  ])
  if (!alive(b)) return
  hideBody(b)
  // Кости и черепок всплывают в луже
  const depth = b.mode === "cine" ? 6.3 : 1.6
  const relics: [string, number, number, number, number][] = [
    [DTEX.bone, -0.32, 0.01, s * 0.24, s * 0.09],
    [DTEX.bone, 0.3, 0.04, s * 0.2, s * 0.075],
    [DTEX.skull, 0.02, -0.03, s * 0.22, s * 0.22]
  ]
  relics.forEach(([tex, dx, dy, w, h], i) => {
    const img = b.scene.add
      .image(ctx.x + dx * s, ctx.y + dy * s + s * 0.05, tex)
      .setDepth(depth + 0.05 * i)
      .setAlpha(0)
      .setAngle((rng() - 0.5) * 60)
    img.setDisplaySize(w, h)
    b.temps.push(img)
    b.scene.tweens.add({ targets: img, alpha: 1, y: img.y - s * 0.05, delay: (i * 140) / sp, duration: 260 / sp, ease: "Back.easeOut" })
  })
  // Пузыри
  for (let i = 0; i < 6; i++) {
    b.scene.time.delayedCall((i * 120) / sp, () => {
      if (!sceneAlive(b.scene)) return
      const bub = b.scene.add
        .image(ctx.x + (rng() - 0.5) * s * 1.1, ctx.y + (rng() - 0.5) * s * 0.12, TEX.ring)
        .setTint(0xb5e655)
        .setDepth(depth + 0.2)
      const sz = s * (0.05 + rng() * 0.05)
      bub.setDisplaySize(sz * 0.3, sz * 0.3)
      b.scene.tweens.add({
        targets: bub,
        displayWidth: sz,
        displayHeight: sz,
        y: bub.y - s * 0.06,
        duration: 260 / sp,
        ease: "Quad.easeOut",
        onComplete: () => {
          if (!bub.scene) return
          puff(b.scene, bub.x, bub.y, TEX.dot, [0xb5e655, 0x7cb518], {
            count: 3,
            speed: [s * 0.1, s * 0.3],
            gravity: s * 1.5,
            scale: [(s * 0.02) / 8, 0],
            life: [200, 350]
          })
          bub.destroy()
        }
      })
    })
  }
  await wait(b.scene, 900 / sp)
}

const VARIANTS: Record<DeathVariant, VariantFn> = {
  fall,
  gibs,
  explode,
  flatten,
  launch,
  dissolve,
  drill,
  crumble,
  electro,
  ragdoll,
  sink,
  behead,
  halve,
  impale,
  pincushion,
  ash,
  freeze,
  ascend,
  balloon,
  knockout,
  zombieMelt
}

/* ---------- Входные точки ---------- */

async function playDeath(ctx: DeathCtx, mode: Mode): Promise<void> {
  if (!sceneAlive(ctx.scene)) return
  const b = makeBody(ctx, mode)
  let variant = ctx.variant
  if (variant === "gibs" && !ctx.parts) variant = "explode"
  if (variant === "zombieMelt" && !ctx.unit.isEnemy) variant = "sink"
  const rng = makeRng(hash(`${ctx.unit.id}:${variant}:${ctx.unit.seed}`))
  try {
    await killMoment(ctx, b)
    if (alive(b)) await VARIANTS[variant](ctx, b, rng)
  }
  catch (e) {
    console.error("deathFx", variant, e)
  }
  finally {
    for (const f of b.cleanup.splice(0)) f()
  }
  if (mode === "map" && sceneAlive(ctx.scene)) {
    // Карта: части и обломки растворяются, чтобы не захламлять поле.
    const temps = b.temps.filter(o => (o as { scene?: Phaser.Scene }).scene)
    if (temps.length > 0) {
      ctx.scene.time.delayedCall(700 / ctx.speed, () => {
        if (!sceneAlive(ctx.scene)) return
        ctx.scene.tweens.add({
          targets: temps,
          alpha: 0,
          duration: 350 / ctx.speed,
          onComplete: () => temps.forEach(o => o.destroy())
        })
      })
    }
  }
}

/** Гибель в кинематике: спрайт-Image, крупные эффекты, части остаются лежать. */
export function playDeathCine(ctx: DeathCtx): Promise<void> {
  return playDeath(ctx, "cine")
}

/** Гибель на карте: вид юнита, компактные эффекты, временные объекты растворяются. */
export function playDeathMap(ctx: DeathCtx): Promise<void> {
  return playDeath(ctx, "map")
}
