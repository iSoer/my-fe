import Phaser from "phaser"
import type { BattleState, UnitInstance } from "@game/core/types"
import type { WeaponVariant } from "@game/core/skills/types"
import type { WeaponGrade } from "@shared/character/skills"
import { artWeapon, type ArtWeapon } from "@game/art/index"
import { weaponDef } from "@game/content/weapons"
import { TEX } from "./textures"
import { debrisBurst, dustPuff, floatText, ichorSplash, sceneAlive, wait } from "./fx"
import {
  MTEX,
  afterImages,
  arrowShot,
  ensureMotionTextures,
  magicBolt,
  reducedMotion,
  shakeCam,
  shakeMul,
  shockRing,
  slashTrail,
  speedLines,
  thrustLine
} from "./motionFx"
import { finisherBurst, fireball, holyPillar, lightningStrike, specialAura } from "./epicFx"
import { tr } from "@game/i18n"

/** Цвет тёмной (Black Magic) и светлой (White Magic) магии. */
const DARK_MAGIC = 0xb15cff
const DARK_CORE = 0x2a0a3d
const LIGHT_MAGIC = 0xffe8a3
const FIRE_MAGIC = 0xff7a1a
const THUNDER_MAGIC = 0x4cc9f0

/** Стихия тёмной магии бойца: тьма, огонь или молния — закреплена за ним (по «почерку»), чтобы маги различались. */
export type MagicElement = "dark" | "fire" | "thunder"
export function magicElement(flavor: number | undefined): MagicElement {
  return (["dark", "fire", "thunder"] as const)[Math.abs(Math.trunc(flavor ?? 0)) % 3] as MagicElement
}

/** Случайный приём из `n` для разнообразия ударов (только презентация). */
function roll(n: number): number {
  return Math.floor(Math.random() * n)
}

/** Цвет ауры и финального взрыва спецприёма: по виду оружия и стихии. */
function specialColor(ctx: AttackFxCtx): number {
  switch (ctx.kind) {
    case "blackMagic": {
      const el = magicElement(ctx.flavor)
      return el === "fire" ? FIRE_MAGIC : el === "thunder" ? THUNDER_MAGIC : DARK_MAGIC
    }
    case "whiteMagic":
      return LIGHT_MAGIC
    default:
      return 0xffd166
  }
}

/**
 * Персональные анимации атак по виду оружия: замах/бросок атакующего, фирменный эффект на защищающемся,
 * «ощутимость» удара (хит-стоп, зум-удар, тряска). Материал оружия красит след и искры, разновидность даёт акцент
 * (Killer — красная вспышка, slayer — зелёная «эффективно»). Только презентация, без игровой логики.
 */

export type FxTarget = Phaser.GameObjects.Image | Phaser.GameObjects.Container

export interface AttackFxCtx {
  scene: Phaser.Scene
  kind: ArtWeapon
  attacker: FxTarget
  defender: FxTarget
  /** Центры туловищ (у кинематика origin спрайта в лапах, у карты — центр клетки). */
  atkPos: { x: number, y: number }
  defPos: { x: number, y: number }
  /** Куда вернуть атакующего после удара. */
  home: { x: number, y: number }
  /** +1 — атакующий бьёт вправо, −1 — влево. */
  dir: 1 | -1
  speed: number
  special: boolean
  effective: boolean
  damage: number
  /** Высота миниатюры на экране (кинематик) или размер клетки (карта). */
  size: number
  /** Цвет оружия (hex number). */
  color: number
  /** Материал оружия (след, искры, блик). По умолчанию — железо. */
  grade?: WeaponGrade
  /** Разновидность оружия (акцент удара). */
  variant?: WeaponVariant
  /** Цель — зомби (враг): к обычной крови добавляются зеленоватые брызги. */
  zombie?: boolean
  /** Y земли под целью (трещина от топора). */
  groundY?: number
  /** Сцена в режиме пропуска — декорации можно сократить. */
  skipped?: boolean
  /** «Почерк» атакующего (его зерно): стихия тёмной магии закреплена за бойцом. */
  flavor?: number
}

export interface AttackFxResult {
  /** Момент контакта: вызывающий код наносит урон, числа, кровь. */
  impactAt: Promise<void>
  /** Атакующий вернулся на место, декорации убраны. */
  done: Promise<void>
}

/* ---------- Оружие ---------- */

/** Анимация удара — по рисунку оружейного навыка модели, которым бьёт боец. */
export function weaponKindOfUnit(unit: UnitInstance): ArtWeapon {
  return artWeapon(weaponDef(unit.skills.weapon).kind)
}

export function weaponKindOf(state: BattleState, unitId: string): ArtWeapon {
  const unit = state.roster[unitId]
  return unit ? weaponKindOfUnit(unit) : "sword"
}

export interface WeaponLook {
  kind: ArtWeapon
  grade: WeaponGrade
  variant: WeaponVariant
}

/** Вид, материал и разновидность оружия бойца — всё, что влияет на рисунок удара. */
export function weaponLookOfUnit(unit: UnitInstance | undefined): WeaponLook {
  if (!unit) return { kind: "sword", grade: "iron", variant: "basic" }
  const w = weaponDef(unit.skills.weapon)
  return { kind: artWeapon(w.kind), grade: w.grade, variant: w.variant }
}

/** Разновидность «против кого-то»: эффективность подсвечивается зелёным. */
export function isSlayer(variant: WeaponVariant | undefined): boolean {
  return variant === "armorslayer" || variant === "cavslayer"
}

/* ---------- Материал ---------- */

interface Material {
  /** Цвет следа взмаха/укола. */
  trail: number
  /** Цвет наконечника/кромки. */
  edge: number
  /** Искры при попадании. */
  sparks: number[]
  /** Блик металла на замахе (дерево не блестит). */
  glint: number | null
  /** Дерево: вместо искр — щепки. */
  splinters: boolean
  /** Масштаб магии и бликов. */
  power: number
}

const MATERIAL: Record<WeaponGrade, Material> = {
  wood: {
    trail: 0xe9c08a,
    edge: 0x8d5a2b,
    sparks: [0xd9a066, 0x8d5a2b, 0xf1d3a1],
    glint: null,
    splinters: true,
    power: 0.85
  },
  iron: {
    trail: 0xf1f3f5,
    edge: 0xadb5bd,
    sparks: [0xffd166, 0xff9f1c, 0xfff3b0],
    glint: 0xffffff,
    splinters: false,
    power: 1
  },
  steel: {
    trail: 0xcfe8ff,
    edge: 0x8ecae6,
    sparks: [0xbfe3ff, 0xffffff, 0x8ecae6],
    glint: 0xcfe8ff,
    splinters: false,
    power: 1.12
  },
  silver: {
    trail: 0xf4fbff,
    edge: 0xe0f4ff,
    sparks: [0xffffff, 0xe0f4ff, 0xb8e0ff],
    glint: 0xffffff,
    splinters: false,
    power: 1.25
  }
}

function materialOf(ctx: AttackFxCtx): Material {
  return MATERIAL[ctx.grade ?? "iron"]
}

/** Цвета брызг на цели: зомби — зеленоватые поверх красных, остальные — красные. */
function bloodTints(ctx: AttackFxCtx): number[] {
  return ctx.zombie ? [0x9acd32, 0x6b8e23, 0xd9122b] : [0xd9122b, 0xff2e4a]
}

/* ---------- Ощутимость удара ---------- */

export interface ImpactFeel {
  special: boolean
  effective: boolean
  damage: number
  speed: number
  skipped?: boolean
  /** Хит-стоп и slow-mo (кинематик). На карте — только зум-удар и тряска. */
  heavy?: boolean
}

/** Амплитуда тряски в пикселях: 4 обычный, 8 спецприём или эффективность, 10 — и то и другое. */
export function shakePx(special: boolean, effective: boolean): number {
  if (special && effective) return 10
  if (special || effective) return 8
  return 4
}

/** Зум-удар камеры: 1 → amount → 1. Не блокирует. */
export function zoomPunch(scene: Phaser.Scene, amount: number, ms: number): void {
  if (!sceneAlive(scene)) return
  const cam = scene.cameras.main
  const base = cam.zoom
  const amt = 1 + (amount - 1) * shakeMul()
  scene.tweens.add({
    targets: cam,
    zoom: base * amt,
    duration: ms / 2,
    yoyo: true,
    ease: "Quad.easeOut",
    onComplete: () => {
      if (cam) cam.setZoom(base)
    }
  })
}

/**
 * Кратковременно замедляет твины сцены (хит-стоп / slow-mo) и возвращает прежнюю скорость.
 * Если за это время кто-то изменил timeScale (например, пропуск сцены), не трогаем.
 */
function freezeTweens(scene: Phaser.Scene, factor: number, realMs: number): void {
  if (!sceneAlive(scene)) return
  const prev = scene.tweens.timeScale
  if (prev >= 10) return // режим пропуска
  scene.tweens.timeScale = factor
  scene.time.delayedCall(realMs, () => {
    if (scene.tweens && scene.tweens.timeScale === factor) scene.tweens.timeScale = prev
  })
}

/** Полный пакет ощущений удара в момент контакта. Не блокирует. */
export function impactFeel(scene: Phaser.Scene, f: ImpactFeel): void {
  if (!sceneAlive(scene)) return
  const px = shakePx(f.special, f.effective) + Math.min(4, f.damage / 12)
  shakeCam(scene, 140 / f.speed, px)
  zoomPunch(scene, f.special ? 1.07 : 1.05, 160 / f.speed)
  if (f.heavy && !f.skipped && f.damage > 0) {
    if (f.special) {
      // Хит-стоп, затем slow-mo
      freezeTweens(scene, 0.05, 60)
      scene.time.delayedCall(60, () => freezeTweens(scene, 0.6, 180))
    }
    else freezeTweens(scene, 0.05, 60)
  }
}

/* ---------- Вспомогательные ---------- */

function tweenP(scene: Phaser.Scene, cfg: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
  return new Promise((resolve) => {
    if (!sceneAlive(scene)) return resolve()
    scene.tweens.add({ ...cfg, onComplete: () => resolve() })
  })
}

function later(scene: Phaser.Scene, ms: number, fn: () => void): void {
  if (!sceneAlive(scene)) return
  scene.time.delayedCall(Math.max(1, ms), () => {
    if (sceneAlive(scene)) fn()
  })
}

function safeDestroy(o: { destroy(): void, scene?: Phaser.Scene | undefined } | null | undefined): void {
  if (o && (o as { scene?: Phaser.Scene }).scene) o.destroy()
}

function isImage(t: FxTarget): t is Phaser.GameObjects.Image {
  return (t as Phaser.GameObjects.Image).setTint !== undefined && (t as Phaser.GameObjects.Image).texture !== undefined
}

/** Временный tint на защищающемся (Image). Контейнеры (карта) — без тонирования. */
function tintFor(scene: Phaser.Scene, target: FxTarget, color: number, delayMs: number, ms: number): void {
  if (!isImage(target)) return
  later(scene, delayMs, () => {
    if (!target.scene) return
    target.setTint(color)
    later(scene, ms, () => {
      if (target.scene && target.tintTopLeft === color) target.clearTint()
    })
  })
}

/** Кратко сплющить цель по горизонтали (отдача). */
function squash(scene: Phaser.Scene, target: FxTarget, sx: number, ms: number): void {
  if (!target.scene) return
  const bx = target.scaleX
  const by = target.scaleY
  scene.tweens.add({
    targets: target,
    scaleX: bx * sx,
    scaleY: by * (2 - sx) * 0.98,
    duration: ms / 2,
    yoyo: true,
    ease: "Quad.easeOut",
    onComplete: () => {
      if (target.scene) target.setScale(bx, by)
    }
  })
}

/** Дрожь цели по X. */
function jitter(scene: Phaser.Scene, target: FxTarget, amp: number, ms: number): void {
  if (!target.scene) return
  const bx = target.x
  scene.tweens.add({
    targets: target,
    x: bx + amp,
    duration: ms / 8,
    yoyo: true,
    repeat: 3,
    ease: "Sine.easeInOut",
    onComplete: () => {
      if (target.scene) target.setX(bx)
    }
  })
}

/** Толчок цели от удара и возврат. */
function knockback(scene: Phaser.Scene, target: FxTarget, dx: number, ms: number): void {
  if (!target.scene) return
  const bx = target.x
  scene.tweens.add({
    targets: target,
    x: bx + dx,
    duration: ms * 0.4,
    yoyo: true,
    hold: ms * 0.1,
    ease: "Quad.easeOut",
    onComplete: () => {
      if (target.scene) target.setX(bx)
    }
  })
}

function burst(
  scene: Phaser.Scene,
  x: number,
  y: number,
  cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig,
  count: number,
  ttl: number,
  texture: string = TEX.dot
): void {
  if (!sceneAlive(scene) || count <= 0) return
  const e = scene.add.particles(x, y, texture, { ...cfg, emitting: false, quantity: count })
  e.setDepth(24)
  e.explode(count)
  later(scene, ttl, () => safeDestroy(e))
}

/** Мягкая вспышка (ADD) у точки: растёт и тает. */
function glow(scene: Phaser.Scene, x: number, y: number, from: number, to: number, color: number, ms: number, alpha = 1): void {
  if (!sceneAlive(scene)) return
  const g = scene.add.image(x, y, MTEX.glow).setDepth(28).setTint(color).setBlendMode(Phaser.BlendModes.ADD)
  g.setAlpha(alpha).setDisplaySize(from, from)
  scene.tweens.add({
    targets: g,
    displayWidth: to,
    displayHeight: to,
    alpha: 0,
    duration: ms,
    ease: "Cubic.easeOut",
    onComplete: () => safeDestroy(g)
  })
}

function impactStar(scene: Phaser.Scene, x: number, y: number, size: number, color: number, speed: number): void {
  if (!sceneAlive(scene)) return
  const star = scene.add.image(x, y, TEX.star).setTint(color).setDepth(25).setAlpha(0.95)
  star.setDisplaySize(size * 0.2, size * 0.2)
  const s = star.scaleX
  scene.tweens.add({
    targets: star,
    scaleX: s * 4,
    scaleY: s * 4,
    angle: 45,
    alpha: 0,
    duration: 260 / speed,
    ease: "Quad.easeOut",
    onComplete: () => safeDestroy(star)
  })
}

/** Блик металла: четырёхлучевая звёздочка на клинке/наконечнике. */
function glint(scene: Phaser.Scene, x: number, y: number, size: number, color: number, speed: number, power = 1): void {
  if (!sceneAlive(scene)) return
  const star = scene.add.image(x, y, TEX.star).setTint(color).setDepth(29).setBlendMode(Phaser.BlendModes.ADD)
  star.setDisplaySize(size * 0.05, size * 0.05).setAngle(0)
  scene.tweens.add({
    targets: star,
    displayWidth: size * 0.3 * power,
    displayHeight: size * 0.3 * power,
    angle: 90,
    duration: 120 / speed,
    yoyo: true,
    ease: "Sine.easeOut",
    onComplete: () => safeDestroy(star)
  })
  glow(scene, x, y, size * 0.05, size * 0.32 * power, color, 220 / speed, 0.8)
}

/** Осколки-треугольники разлетаются от точки (щепки дерева, камни, лёд). */
function shards(
  scene: Phaser.Scene,
  x: number,
  y: number,
  size: number,
  speed: number,
  count: number,
  fill: number,
  stroke: number,
  dir = 0
): void {
  if (!sceneAlive(scene)) return
  for (let i = 0; i < count; i++) {
    const g = scene.add.graphics().setDepth(26).setPosition(x, y)
    const t = size * 0.05
    g.fillStyle(fill, 0.95)
    g.lineStyle(1, stroke, 1)
    g.fillTriangle(-t * 0.4, t, t * 0.4, t, 0, -t * 1.8)
    g.strokeTriangle(-t * 0.4, t, t * 0.4, t, 0, -t * 1.8)
    // dir ≠ 0 — конус по направлению удара, иначе по кругу
    const a = dir !== 0
      ? (dir > 0 ? 0 : Math.PI) + (i / Math.max(1, count - 1) - 0.5) * 1.6 - 0.4
      : (i / count) * Math.PI * 2 + 0.3
    const r = size * (0.4 + (i % 3) * 0.1)
    scene.tweens.add({
      targets: g,
      x: x + Math.cos(a) * r,
      y: y + Math.sin(a) * r + size * 0.3,
      angle: 180 + i * 75,
      alpha: 0,
      duration: 420 / speed,
      ease: "Quad.easeOut",
      onComplete: () => safeDestroy(g)
    })
  }
}

/** Попадание оружием: искры цвета материала (конус по удару) или щепки у дерева. */
function weaponHit(ctx: AttackFxCtx, x: number, y: number, count: number): void {
  const { scene, size, speed, dir } = ctx
  const m = materialOf(ctx)
  if (m.splinters) {
    shards(scene, x, y, size, speed, Math.max(3, Math.round(count * 0.6)), 0xd9a066, 0x6d4c41, dir)
    return
  }
  const base = dir > 0 ? 0 : 180
  burst(
    scene,
    x,
    y,
    {
      speed: { min: size * 1.4, max: size * 3.2 },
      angle: { min: base - 70, max: base + 40 },
      scale: { start: 0.32, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: { min: 140, max: 300 },
      gravityY: size * 3,
      tint: m.sparks,
      blendMode: Phaser.BlendModes.ADD
    },
    count,
    360 / speed,
    MTEX.streak
  )
  glow(scene, x, y, size * 0.1, size * 0.55, m.sparks[0] ?? 0xffffff, 160 / speed, 0.9)
}

/* ---------- Фирменные эффекты на цели ---------- */

/** Три диагональных пореза: белая сердцевина с кромкой цвета крови, появляются по очереди. */
function slashMarks(
  scene: Phaser.Scene,
  x: number,
  y: number,
  size: number,
  dir: number,
  speed: number,
  scale = 1,
  tints: number[] = [0xd9122b, 0xff2e4a]
): void {
  if (!sceneAlive(scene)) return
  const len = size * 0.62 * scale
  const gap = size * 0.16 * scale
  const ang = (-38 * dir * Math.PI) / 180
  for (let i = 0; i < 3; i++) {
    later(scene, (i * 40) / speed, () => {
      const cx = x + (i - 1) * gap * 0.9
      const cy = y + (i - 1) * gap * 0.35
      // Рисуем относительно центра пореза: масштаб «прорезания» — от центра, а не от начала координат
      const g = scene.add.graphics().setDepth(26).setPosition(cx, cy).setRotation(ang)
      g.lineStyle(size * 0.05 * scale, tints[0] ?? 0xd9122b, 0.75)
      g.lineBetween(-len / 2, 0, len / 2, 0)
      g.lineStyle(size * 0.022 * scale, 0xffffff, 1)
      g.lineBetween(-len / 2, 0, len / 2, 0)
      const dx = Math.cos(ang) * len * 0.5
      const dy = Math.sin(ang) * len * 0.5
      g.setScale(0.2, 1)
      scene.tweens.add({ targets: g, scaleX: 1, duration: 70 / speed, ease: "Cubic.easeOut" })
      scene.tweens.add({
        targets: g,
        alpha: 0,
        duration: 300 / speed,
        delay: 180 / speed,
        onComplete: () => safeDestroy(g)
      })
      if (i !== 1) return
      burst(
        scene,
        cx + dx * 0.3,
        cy + dy * 0.3,
        {
          speed: { min: size * 0.4, max: size * 1.2 },
          angle: { min: dir > 0 ? -60 : 120, max: dir > 0 ? 60 : 240 },
          scale: { start: 0.6 * scale, end: 0.1 },
          lifespan: { min: 250, max: 500 },
          gravityY: size * 2,
          tint: tints
        },
        7,
        700
      )
    })
  }
}

/** Дуга замаха над атакующим (топор). */
function swingArc(scene: Phaser.Scene, x: number, y: number, radius: number, dir: number, speed: number, color = 0xfff3b0): void {
  if (!sceneAlive(scene)) return
  const g = scene.add.graphics().setDepth(26).setPosition(x, y)
  const start = dir > 0 ? -2.1 : Math.PI + 2.1
  const end = dir > 0 ? -0.3 : Math.PI + 0.3
  g.lineStyle(radius * 0.16, 0xffffff, 0.55)
  g.beginPath()
  g.arc(0, 0, radius, start, end, dir < 0)
  g.strokePath()
  g.lineStyle(radius * 0.06, color, 0.9)
  g.beginPath()
  g.arc(0, 0, radius * 1.05, start, end, dir < 0)
  g.strokePath()
  scene.tweens.add({
    targets: g,
    alpha: 0,
    scaleX: 1.15,
    scaleY: 1.15,
    duration: 220 / speed,
    ease: "Quad.easeOut",
    onComplete: () => safeDestroy(g)
  })
}

/** Пробой копьём: «выходные» брызги и штрихи за спиной цели. */
function pierceExit(ctx: AttackFxCtx, x: number, y: number, scale = 1): void {
  const { scene, size, speed, dir } = ctx
  const base = dir > 0 ? 0 : 180
  burst(
    scene,
    x,
    y,
    {
      speed: { min: size * 1.2, max: size * 2.8 },
      angle: { min: base - 18, max: base + 18 },
      scale: { start: 0.5 * scale, end: 0.05 },
      alpha: { start: 1, end: 0.2 },
      lifespan: { min: 200, max: 420 },
      gravityY: size * 3,
      tint: bloodTints(ctx)
    },
    Math.round(8 * scale),
    500 / speed
  )
  burst(
    scene,
    x,
    y,
    {
      speed: { min: size * 2.2, max: size * 3.6 },
      angle: { min: base - 6, max: base + 6 },
      scale: { start: 0.4 * scale, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 160,
      tint: [0xffffff, materialOf(ctx).trail],
      blendMode: Phaser.BlendModes.ADD
    },
    4,
    260 / speed,
    MTEX.streak
  )
}

/** Трещина в земле и обломки после удара топором. */
function groundCrack(ctx: AttackFxCtx, x: number, y: number, scale = 1): void {
  const { scene, size, speed } = ctx
  if (!sceneAlive(scene)) return
  const g = scene.add.graphics().setDepth(9).setPosition(x, y)
  const len = size * 0.5 * scale
  const draw = (w: number, color: number, alpha: number): void => {
    g.lineStyle(w, color, alpha)
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.4
      let px = 0
      let py = 0
      g.beginPath()
      g.moveTo(px, py)
      for (let k = 1; k <= 3; k++) {
        const r = (len * k) / 3 * (0.7 + ((i * 7 + k * 3) % 5) * 0.08)
        const jit = (((i * 13 + k * 5) % 7) - 3) * 0.08
        px = Math.cos(a + jit) * r
        py = Math.sin(a + jit) * r * 0.32
        g.lineTo(px, py)
      }
      g.strokePath()
    }
  }
  draw(Math.max(2, size * 0.03 * scale), 0x1b1209, 0.85)
  draw(Math.max(1, size * 0.01 * scale), 0x8a7a63, 0.7)
  g.setScale(0.2)
  scene.tweens.add({ targets: g, scale: 1, duration: 90 / speed, ease: "Cubic.easeOut" })
  scene.tweens.add({ targets: g, alpha: 0, duration: 500 / speed, delay: 520 / speed, onComplete: () => safeDestroy(g) })
  if (materialOf(ctx).splinters) shards(scene, x, y - size * 0.05, size * scale, speed, 5, 0xd9a066, 0x6d4c41)
  debrisBurst(scene, x, y - size * 0.03, size * scale, Math.round(8 * scale), speed)
  dustPuff(scene, x, y, size * 0.7 * scale, Math.round(8 * scale))
}

/** Стрела торчит из цели, подрагивает и тает. */
function stuckArrow(ctx: AttackFxCtx, x: number, y: number, scale = 1): void {
  const { scene, size, speed, dir } = ctx
  if (!sceneAlive(scene)) return
  const L = size * 0.3 * scale
  const g = scene.add.graphics().setDepth(27).setPosition(x, y)
  g.lineStyle(Math.max(2, size * 0.03 * scale), 0x6d4c41, 1)
  g.lineBetween(-L, 0, 0, 0)
  g.fillStyle(0xe63946, 1)
  g.fillTriangle(-L, 0, -L - size * 0.07 * scale, -size * 0.05 * scale, -L + size * 0.05 * scale, 0)
  g.fillTriangle(-L, 0, -L - size * 0.07 * scale, size * 0.05 * scale, -L + size * 0.05 * scale, 0)
  const ang = dir > 0 ? 12 : 168
  g.setAngle(ang)
  scene.tweens.add({ targets: g, angle: ang - 7 * dir, duration: 50 / speed, yoyo: true, repeat: 2 })
  scene.tweens.add({ targets: g, alpha: 0, duration: 220 / speed, delay: 520 / speed, onComplete: () => safeDestroy(g) })
}

/** Натяжение тетивы: штрихи сходятся к руке, свечение растёт. */
function drawCharge(scene: Phaser.Scene, x: number, y: number, size: number, ms: number, color: number): void {
  if (!sceneAlive(scene)) return
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    const r = size * 0.32
    const s = scene.add
      .image(x + Math.cos(a) * r, y + Math.sin(a) * r, MTEX.streak)
      .setRotation(a)
      .setTint(color)
      .setAlpha(0)
      .setDepth(27)
      .setBlendMode(Phaser.BlendModes.ADD)
    s.setDisplaySize(size * 0.18, Math.max(2, size * 0.02))
    scene.tweens.add({
      targets: s,
      x,
      y,
      alpha: { from: 0.9, to: 0 },
      displayWidth: size * 0.04,
      duration: ms,
      ease: "Quad.easeIn",
      onComplete: () => safeDestroy(s)
    })
  }
  const g = scene.add.image(x, y, MTEX.glow).setDepth(27).setTint(color).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.2)
  g.setDisplaySize(size * 0.06, size * 0.06)
  scene.tweens.add({
    targets: g,
    displayWidth: size * 0.26,
    displayHeight: size * 0.26,
    alpha: 0.85,
    duration: ms,
    ease: "Quad.easeIn",
    onComplete: () => safeDestroy(g)
  })
}

/** Круг рун на земле под кастером: сплющенное кольцо, вращается и гаснет. */
function runeCircle(scene: Phaser.Scene, x: number, y: number, size: number, speed: number, color: number, ms: number): void {
  if (!sceneAlive(scene)) return
  const c = scene.add.container(x, y).setDepth(9)
  c.setScale(0.2, 0.07)
  const g = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD)
  const r = size * 0.42
  g.lineStyle(Math.max(2, size * 0.02), color, 0.95)
  g.strokeCircle(0, 0, r)
  g.lineStyle(Math.max(1, size * 0.01), 0xffffff, 0.6)
  g.strokeCircle(0, 0, r * 0.78)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const t = size * 0.035
    g.fillStyle(i % 2 ? 0xffffff : color, 0.9)
    g.fillTriangle(
      Math.cos(a) * r * 0.9 - t * 0.5,
      Math.sin(a) * r * 0.9,
      Math.cos(a) * r * 0.9 + t * 0.5,
      Math.sin(a) * r * 0.9,
      Math.cos(a) * r * 0.9,
      Math.sin(a) * r * 0.9 - t
    )
  }
  // Пентаграмма внутри
  g.lineStyle(Math.max(1, size * 0.008), color, 0.8)
  g.beginPath()
  for (let i = 0; i <= 5; i++) {
    const a = ((i * 2) % 5) / 5 * Math.PI * 2 - Math.PI / 2
    if (i === 0) g.moveTo(Math.cos(a) * r * 0.75, Math.sin(a) * r * 0.75)
    else g.lineTo(Math.cos(a) * r * 0.75, Math.sin(a) * r * 0.75)
  }
  g.strokePath()
  c.add(g)
  scene.tweens.add({ targets: c, scaleX: 1, scaleY: 0.34, duration: 160 / speed, ease: "Back.easeOut" })
  scene.tweens.add({ targets: g, angle: 160, duration: ms, ease: "Sine.easeInOut" })
  scene.tweens.add({ targets: c, alpha: 0, duration: 220 / speed, delay: ms - 200 / speed, onComplete: () => safeDestroy(c) })
}

/** Тёмные клочья поднимаются вверх (от кастера или от цели). */
function darkWisps(scene: Phaser.Scene, x: number, y: number, size: number, count = 8): void {
  burst(
    scene,
    x,
    y + size * 0.1,
    {
      speed: { min: size * 0.3, max: size * 0.9 },
      angle: { min: 240, max: 300 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 0.9, end: 0 },
      lifespan: { min: 400, max: 800 },
      gravityY: -size * 0.8,
      tint: [DARK_MAGIC, 0x7b2cbf, 0x3c096c, 0xe0aaff]
    },
    count,
    1000
  )
}

/** Столб тьмы из земли под целью. */
function darkPillar(scene: Phaser.Scene, x: number, groundY: number, size: number, height: number, speed: number): void {
  if (!sceneAlive(scene)) return
  const ray = scene.add.image(x, groundY, MTEX.ray).setOrigin(0.5, 1).setDepth(27).setTint(DARK_MAGIC)
  ray.setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(size * 0.42, 1)
  const core = scene.add.image(x, groundY, MTEX.ray).setOrigin(0.5, 1).setDepth(26).setTint(DARK_CORE).setAlpha(0.75)
  core.setDisplaySize(size * 0.22, 1)
  scene.tweens.add({ targets: [ray, core], displayHeight: height, duration: 110 / speed, ease: "Cubic.easeOut" })
  scene.tweens.add({
    targets: [ray, core],
    alpha: 0,
    displayWidth: size * 0.05,
    duration: 260 / speed,
    delay: 160 / speed,
    onComplete: () => {
      safeDestroy(ray)
      safeDestroy(core)
    }
  })
}

/** Взрыв тьмы: тёмная сфера, фиолетовое кольцо, осколки и клочья. */
function darkBlast(scene: Phaser.Scene, x: number, y: number, size: number, speed: number): void {
  if (!sceneAlive(scene)) return
  const ball = scene.add.circle(x, y, size * 0.1, DARK_CORE, 0.8).setDepth(26)
  scene.tweens.add({
    targets: ball,
    radius: size * 0.42,
    alpha: 0,
    duration: 320 / speed,
    ease: "Cubic.easeOut",
    onComplete: () => safeDestroy(ball)
  })
  const ring = scene.add.image(x, y, TEX.ring).setTint(DARK_MAGIC).setDepth(27).setBlendMode(Phaser.BlendModes.ADD)
  ring.setDisplaySize(size * 0.2, size * 0.2)
  scene.tweens.add({
    targets: ring,
    displayWidth: size * 1.4,
    displayHeight: size * 1.4,
    alpha: 0,
    duration: 340 / speed,
    ease: "Cubic.easeOut",
    onComplete: () => safeDestroy(ring)
  })
  darkWisps(scene, x, y, size, 9)
}

/** Тычок светом: луч из навершия посоха к цели. Промис — касание. */
function lightBeam(
  scene: Phaser.Scene,
  from: { x: number, y: number },
  to: { x: number, y: number },
  size: number,
  speed: number
): Promise<void> {
  if (!sceneAlive(scene)) return Promise.resolve()
  const ang = Math.atan2(to.y - from.y, to.x - from.x)
  const len = Math.hypot(to.x - from.x, to.y - from.y)
  const mk = (h: number, color: number, alpha: number): Phaser.GameObjects.Image => {
    const img = scene.add
      .image(from.x, from.y, MTEX.streak)
      .setOrigin(0, 0.5)
      .setRotation(ang)
      .setDepth(27)
      .setTint(color)
      .setAlpha(alpha)
      .setBlendMode(Phaser.BlendModes.ADD)
    img.setDisplaySize(1, h)
    return img
  }
  const outer = mk(size * 0.14, LIGHT_MAGIC, 0.7)
  const inner = mk(size * 0.04, 0xffffff, 1)
  const ms = Math.max(70, len * 0.25) / speed
  return new Promise((resolve) => {
    scene.tweens.add({
      targets: [outer, inner],
      displayWidth: len,
      duration: ms,
      ease: "Cubic.easeOut",
      onComplete: () => {
        scene.tweens.add({
          targets: [outer, inner],
          alpha: 0,
          displayHeight: 1,
          duration: 200 / speed,
          onComplete: () => {
            safeDestroy(outer)
            safeDestroy(inner)
          }
        })
        resolve()
      }
    })
  })
}

/** Звёздочки света разлетаются от точки. */
function lightStars(scene: Phaser.Scene, x: number, y: number, size: number, speed: number, count = 6): void {
  burst(
    scene,
    x,
    y,
    {
      speed: { min: size * 0.6, max: size * 1.6 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.9, end: 0 },
      alpha: { start: 1, end: 0 },
      rotate: { min: 0, max: 360 },
      lifespan: { min: 300, max: 520 },
      tint: [LIGHT_MAGIC, 0xffffff, 0xfff3b0]
    },
    count,
    620 / speed,
    TEX.star
  )
  glow(scene, x, y, size * 0.1, size * 0.8, LIGHT_MAGIC, 260 / speed, 0.9)
}

/** Короткое ударное кольцо (один толчок кастета). */
function popRing(scene: Phaser.Scene, x: number, y: number, size: number, speed: number, color: number): void {
  if (!sceneAlive(scene)) return
  const ring = scene.add.image(x, y, TEX.ring).setDepth(27).setTint(color).setAlpha(0.95)
  ring.setDisplaySize(size * 0.1, size * 0.1)
  scene.tweens.add({
    targets: ring,
    displayWidth: size * 0.6,
    displayHeight: size * 0.6,
    alpha: 0,
    duration: 180 / speed,
    ease: "Cubic.easeOut",
    onComplete: () => safeDestroy(ring)
  })
  impactStar(scene, x, y, size * 0.6, 0xfff3b0, speed)
}

/** Красная крит-вспышка (Killer). */
function critFlash(scene: Phaser.Scene, x: number, y: number, size: number, speed: number): void {
  if (!sceneAlive(scene)) return
  const k = shakeMul()
  glow(scene, x, y, size * 0.2, size * 1.6, 0xff2e4a, 280 / speed, 0.9 * k)
  const star = scene.add.image(x, y, TEX.star).setTint(0xff2e4a).setDepth(29).setBlendMode(Phaser.BlendModes.ADD)
  star.setDisplaySize(size * 0.15, size * 0.15)
  scene.tweens.add({
    targets: star,
    displayWidth: size * 1.1,
    displayHeight: size * 1.1,
    angle: 30,
    alpha: 0,
    duration: 260 / speed,
    ease: "Quad.easeOut",
    onComplete: () => safeDestroy(star)
  })
  burst(
    scene,
    x,
    y,
    {
      speed: { min: size * 2, max: size * 3.2 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.4, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 220,
      rotate: 0,
      tint: [0xff2e4a, 0xffffff],
      blendMode: Phaser.BlendModes.ADD
    },
    8,
    300 / speed,
    MTEX.streak
  )
}

/** «Эффективно»: двойное кольцо (зелёное у slayer-оружия, иначе оранжево-красное). */
function effectiveFlash(scene: Phaser.Scene, x: number, y: number, size: number, speed: number, green: boolean): void {
  if (!sceneAlive(scene)) return
  const color = green ? 0x57e389 : 0xff8c42
  glow(scene, x, y, size * 0.2, size * 1.1, color, 260 / speed, 0.7 * shakeMul())
  for (let i = 0; i < 2; i++) {
    const ring = scene.add.image(x, y, TEX.ring).setDepth(27).setTint(color).setAlpha(0.95)
    ring.setDisplaySize(size * 0.3, size * 0.3)
    scene.tweens.add({
      targets: ring,
      displayWidth: size * (1.2 + i * 0.4),
      displayHeight: size * (1.2 + i * 0.4),
      alpha: 0,
      delay: (i * 70) / speed,
      duration: 300 / speed,
      ease: "Cubic.easeOut",
      onComplete: () => safeDestroy(ring)
    })
  }
}

/** Общие акценты в момент контакта: разновидность, эффективность, зомби, удар без урона. */
function impactAccents(ctx: AttackFxCtx, quick: boolean): void {
  const { scene, size, speed, dir, defPos, kind } = ctx
  if (!sceneAlive(scene)) return
  const magic = kind === "blackMagic" || kind === "whiteMagic"
  if (ctx.damage <= 0) {
    // Удар не прошёл: лязг металла или магия рассеялась (на карте искры даёт презентер)
    if (quick) return
    if (magic) dustPuff(scene, defPos.x, defPos.y, size * 0.6, 8)
    else weaponHit(ctx, defPos.x - dir * size * 0.12, defPos.y, 12)
    return
  }
  const s = quick ? 0.75 : 1
  if (ctx.variant === "killer") critFlash(scene, defPos.x, defPos.y, size * s, speed)
  if (ctx.effective) effectiveFlash(scene, defPos.x, defPos.y, size * s, speed, isSlayer(ctx.variant))
  if (ctx.zombie) ichorSplash(scene, defPos.x, defPos.y, size, dir, speed, quick ? 0.9 : 1.6)
}

/* ---------- Движение атакующего (кинематик) ---------- */

interface Motion {
  /** Промис момента контакта. */
  impact: Promise<void>
  /** Промис возврата на место. */
  settle: Promise<void>
}

/** Дистанция рывка: frac — доля расстояния до цели. */
function reach(ctx: AttackFxCtx, frac: number): number {
  return Math.max(ctx.size * 0.3, (Math.abs(ctx.defPos.x - ctx.atkPos.x) - ctx.size * 0.35) * frac)
}

/**
 * Обёртка хореографии: body получает hit() — вызвать в момент контакта (если не вызван — контакт в конце).
 * После body атакующий гарантированно возвращается на место (позиция, поворот, масштаб).
 */
function choreo(ctx: AttackFxCtx, body: (hit: () => void) => Promise<void>): Motion {
  const { attacker, home } = ctx
  const bx = attacker.scaleX
  const by = attacker.scaleY
  let resolveImpact: () => void = () => undefined
  const impact = new Promise<void>(r => (resolveImpact = r))
  const settle = (async () => {
    try {
      // Спецприём: аура под ногами и вспышка перед ударом
      if (ctx.special && !ctx.skipped && ctx.scene.tweens.timeScale < 10)
        await specialAura(ctx.scene, home.x, ctx.atkPos.y + ctx.size * 0.45, ctx.size, specialColor(ctx), ctx.speed)
      await body(resolveImpact)
    }
    finally {
      resolveImpact()
      if (attacker.scene) {
        attacker.setPosition(home.x, home.y)
        attacker.setAngle(0)
        attacker.setScale(bx, by)
      }
    }
  })()
  return { impact, settle }
}

/** Возврат на место после удара. */
function recover(ctx: AttackFxCtx, ms: number, bx: number, by: number): Promise<void> {
  return tweenP(ctx.scene, {
    targets: ctx.attacker,
    x: ctx.home.x,
    y: ctx.home.y,
    angle: 0,
    scaleX: bx,
    scaleY: by,
    duration: ms / ctx.speed,
    ease: "Quad.easeOut"
  })
}

/* ---------- Кинематик: хореография по оружию ---------- */

export function playAttackFx(ctx: AttackFxCtx): AttackFxResult {
  const { scene, kind, attacker, defender, defPos, atkPos, home, dir, speed, size } = ctx
  if (!sceneAlive(scene)) return { impactAt: Promise.resolve(), done: Promise.resolve() }
  ensureMotionTextures(scene)
  const skipped = ctx.skipped || scene.tweens.timeScale >= 10
  const deco = !skipped
  const m = materialOf(ctx)
  const brave = ctx.variant === "brave"
  const calm = reducedMotion()
  const groundY = ctx.groundY ?? defPos.y + size * 0.45
  const bx = attacker.scaleX
  const by = attacker.scaleY
  let motion: Motion

  // Разнообразие: у каждого оружия несколько приёмов, выбор — на каждый удар (при пропуске — базовый)
  const move = deco ? roll(3) : 0

  switch (kind) {
    case "sword": {
      if (move === 1) {
        // Иай: присед → рывок насквозь за спину цели → пауза → разрез крест-накрест догоняет
        motion = choreo(ctx, async (hit) => {
          await tweenP(scene, { targets: attacker, x: home.x - dir * size * 0.04, scaleY: by * 0.94, angle: -6 * dir, duration: 120 / speed, ease: "Quad.easeOut" })
          if (m.glint !== null) glint(scene, attacker.x + dir * size * 0.2, atkPos.y - size * 0.1, size, m.glint, speed, m.power)
          speedLines(scene, (atkPos.x + defPos.x) / 2, atkPos.y, Math.abs(defPos.x - atkPos.x) + size, size * 0.7, dir, speed, 14, 26)
          afterImages(scene, attacker, 4, 18, m.trail, speed)
          await tweenP(scene, { targets: attacker, x: defPos.x + dir * size * 0.6, scaleY: by, angle: 0, duration: 90 / speed, ease: "Expo.easeIn" })
          await wait(scene, 170 / speed)
          slashTrail(scene, defPos.x, defPos.y, size * 1.05, dir, m.trail, speed, true)
          slashTrail(scene, defPos.x, defPos.y, size * 0.95, dir, m.trail, speed, false, true)
          if (ctx.damage > 0) slashMarks(scene, defPos.x, defPos.y, size, dir, speed, 1.2, bloodTints(ctx))
          weaponHit(ctx, defPos.x, defPos.y, 12)
          squash(scene, defender, 0.82, 200 / speed)
          hit()
          await wait(scene, 140 / speed)
          await recover(ctx, 260, bx, by)
        })
        break
      }
      if (move === 2) {
        // Вихрь клинка: рывок и три быстрых взмаха с разных сторон, порезы — на последнем
        motion = choreo(ctx, async (hit) => {
          afterImages(scene, attacker, 3, 22, m.trail, speed)
          await tweenP(scene, { targets: attacker, x: home.x + dir * reach(ctx, 0.6), angle: 8 * dir, duration: 110 / speed, ease: "Cubic.easeIn" })
          for (let i = 0; i < 3; i++) {
            await tweenP(scene, { targets: attacker, angle: (i % 2 ? -14 : 16) * dir, duration: 55 / speed, ease: "Quad.easeIn" })
            const dy = (i - 1) * size * 0.12
            slashTrail(scene, defPos.x + dir * size * 0.04 * i, defPos.y + dy, size * 0.72, dir, m.trail, speed, i === 2, i % 2 === 1)
            weaponHit(ctx, defPos.x - dir * size * 0.08, defPos.y + dy, 4)
            jitter(scene, defender, 2.5, 80 / speed)
            if (i === 2) {
              if (ctx.damage > 0) slashMarks(scene, defPos.x, defPos.y, size, dir, speed, 1, bloodTints(ctx))
              hit()
            }
          }
          await wait(scene, 60 / speed)
          await recover(ctx, 200, bx, by)
        })
        break
      }
      // Замах с бликом клинка → рывок → рубящая дуга, порезы, искры. Brave — второй взмах крест-накрест.
      motion = choreo(ctx, async (hit) => {
        await tweenP(scene, {
          targets: attacker,
          x: home.x - dir * size * 0.05,
          angle: -12 * dir,
          duration: 130 / speed,
          ease: "Quad.easeOut"
        })
        if (deco && m.glint !== null) glint(scene, attacker.x + dir * size * 0.18, atkPos.y - size * 0.3, size, m.glint, speed, m.power)
        if (deco) {
          await wait(scene, 60 / speed)
          afterImages(scene, attacker, 3, 25, m.trail, speed)
        }
        await tweenP(scene, {
          targets: attacker,
          x: home.x + dir * reach(ctx, 0.6),
          angle: 14 * dir,
          duration: 100 / speed,
          ease: "Cubic.easeIn"
        })
        if (deco) {
          slashTrail(scene, defPos.x, defPos.y, size * 0.95, dir, m.trail, speed, ctx.special)
          if (ctx.damage > 0) slashMarks(scene, defPos.x, defPos.y, size, dir, speed, 1, bloodTints(ctx))
          weaponHit(ctx, defPos.x - dir * size * 0.1, defPos.y - size * 0.05, 10)
          squash(scene, defender, 0.85, 180 / speed)
        }
        hit()
        if (brave && deco) {
          await wait(scene, 70 / speed)
          await tweenP(scene, { targets: attacker, angle: -8 * dir, duration: 60 / speed, ease: "Quad.easeOut" })
          slashTrail(scene, defPos.x, defPos.y, size * 0.9, dir, m.trail, speed, false, true)
          weaponHit(ctx, defPos.x - dir * size * 0.08, defPos.y + size * 0.05, 6)
          jitter(scene, defender, 3, 160 / speed)
        }
        await wait(scene, 60 / speed)
        await recover(ctx, 200, bx, by)
      })
      break
    }
    case "spear": {
      if (move === 1) {
        // Град уколов: выпад и три стремительных укола на разной высоте, последний — насквозь
        motion = choreo(ctx, async (hit) => {
          afterImages(scene, attacker, 3, 22, m.trail, speed)
          await tweenP(scene, { targets: attacker, x: home.x + dir * reach(ctx, 0.7), angle: 4 * dir, duration: 100 / speed, ease: "Expo.easeIn" })
          const base = attacker.x
          for (let i = 0; i < 3; i++) {
            const dy = [-0.12, 0.1, 0][i]! * size
            await tweenP(scene, { targets: attacker, x: base + dir * size * 0.08, duration: 40 / speed, ease: "Quad.easeIn" })
            thrustLine(scene, { x: attacker.x + dir * size * 0.1, y: defPos.y + dy }, { x: defPos.x + dir * size * (i === 2 ? 0.6 : 0.3), y: defPos.y + dy }, size * (i === 2 ? 1.1 : 0.8), m.trail, speed)
            weaponHit(ctx, defPos.x - dir * size * 0.12, defPos.y + dy, 4)
            jitter(scene, defender, 2.5, 70 / speed)
            if (i === 2) {
              if (ctx.damage > 0) pierceExit(ctx, defPos.x + dir * size * 0.22, defPos.y + dy, 1.2)
              squash(scene, defender, 0.8, 200 / speed)
              hit()
            }
            await tweenP(scene, { targets: attacker, x: base, duration: 40 / speed, ease: "Quad.easeOut" })
          }
          await wait(scene, 90 / speed)
          await recover(ctx, 200, bx, by)
        })
        break
      }
      // Отвод назад → рывок-выпад → прямой след укола насквозь, брызги за спиной цели.
      motion = choreo(ctx, async (hit) => {
        await tweenP(scene, {
          targets: attacker,
          x: home.x - dir * size * 0.12,
          scaleX: bx * 0.92,
          angle: -5 * dir,
          duration: 150 / speed,
          ease: "Quad.easeOut"
        })
        if (deco && m.glint !== null) glint(scene, attacker.x + dir * size * 0.32, atkPos.y, size, m.glint, speed, m.power * 0.8)
        if (deco) {
          await wait(scene, 40 / speed)
          afterImages(scene, attacker, 3, 22, m.trail, speed)
        }
        await tweenP(scene, {
          targets: attacker,
          x: home.x + dir * reach(ctx, 0.8),
          scaleX: bx * 1.08,
          angle: 4 * dir,
          duration: 80 / speed,
          ease: "Expo.easeIn"
        })
        const thrust = (dy: number, scale: number): void => {
          thrustLine(
            scene,
            { x: attacker.x + dir * size * 0.1, y: defPos.y + dy },
            { x: defPos.x + dir * size * 0.5, y: defPos.y + dy },
            size * scale,
            m.trail,
            speed
          )
          if (ctx.damage > 0) pierceExit(ctx, defPos.x + dir * size * 0.22, defPos.y + dy, scale)
          weaponHit(ctx, defPos.x - dir * size * 0.12, defPos.y + dy, 5)
        }
        if (deco) {
          thrust(0, 1)
          later(scene, 60 / speed, () => squash(scene, defender, 0.8, 200 / speed))
        }
        hit()
        if (brave && deco) {
          await tweenP(scene, { targets: attacker, x: attacker.x - dir * size * 0.08, duration: 60 / speed, yoyo: true })
          thrust(-size * 0.1, 0.8)
        }
        await wait(scene, 110 / speed)
        await recover(ctx, 200, bx, by)
      })
      break
    }
    case "axe": {
      if (move === 1) {
        // Смерч: боец раскручивается, врываясь в цель, — два кольцевых взмаха, ударная волна по земле, отброс
        motion = choreo(ctx, async (hit) => {
          afterImages(scene, attacker, 4, 30, m.trail, speed)
          await tweenP(scene, { targets: attacker, x: home.x + dir * reach(ctx, 0.5), angle: 360 * dir, duration: 280 / speed, ease: "Quad.easeIn" })
          attacker.setAngle(0)
          swingArc(scene, attacker.x, atkPos.y, size * 0.7, dir, speed, m.trail)
          swingArc(scene, attacker.x, atkPos.y + size * 0.1, size * 0.6, -dir, speed, m.trail)
          slashTrail(scene, defPos.x, defPos.y, size * 0.9, dir, m.trail, speed, true)
          shockRing(scene, attacker.x, groundY, size * 1.2, speed, m.sparks[0] ?? 0xffd166)
          debrisBurst(scene, defPos.x, groundY, size, 10, speed)
          weaponHit(ctx, defPos.x, defPos.y, 10)
          knockback(scene, defender, dir * size * 0.3, 280 / speed)
          shakeCam(scene, 180 / speed, 9)
          hit()
          await wait(scene, 110 / speed)
          await recover(ctx, 240, bx, by)
        })
        break
      }
      // Подъём над головой → пауза-«вес» с бликом → рубящий удар вниз, трещина в земле, обломки, тряска.
      motion = choreo(ctx, async (hit) => {
        await tweenP(scene, {
          targets: attacker,
          angle: -38 * dir,
          x: home.x - dir * size * 0.06,
          y: home.y - size * 0.05,
          scaleY: by * 1.05,
          duration: 200 / speed,
          ease: "Quad.easeOut"
        })
        if (deco) {
          if (m.glint !== null) glint(scene, attacker.x - dir * size * 0.02, atkPos.y - size * 0.48, size, m.glint, speed, m.power)
          if (!calm) jitter(scene, attacker, 1.5, 150 / speed)
          await wait(scene, 150 / speed)
        }
        await tweenP(scene, {
          targets: attacker,
          angle: 34 * dir,
          x: home.x + dir * reach(ctx, 0.45),
          y: home.y,
          scaleY: by * 0.94,
          duration: 90 / speed,
          ease: "Cubic.easeIn"
        })
        if (deco) {
          slashTrail(scene, defPos.x - dir * size * 0.05, defPos.y, size * 0.85, dir, m.trail, speed, true)
          swingArc(scene, attacker.x + dir * size * 0.1, atkPos.y, size * 0.55, dir, speed, m.trail)
          impactStar(scene, defPos.x - dir * size * 0.1, defPos.y - size * 0.05, size, 0xffd166, speed)
          groundCrack(ctx, defPos.x - dir * size * 0.05, groundY)
          shakeCam(scene, 200 / speed, 9)
          floatText(scene, defPos.x, defPos.y - size * 0.55, tr("CRACK", "ХРЯСЬ"), "#ffd166", speed, {
            size: size * 0.16,
            rise: size * 0.3,
            stroke: 5,
            shake: true
          })
          knockback(scene, defender, dir * size * 0.25, 260 / speed)
        }
        hit()
        if (brave && deco) {
          await wait(scene, 90 / speed)
          swingArc(scene, attacker.x + dir * size * 0.1, atkPos.y + size * 0.1, size * 0.45, dir, speed, m.trail)
          impactStar(scene, defPos.x, defPos.y + size * 0.1, size * 0.8, 0xffd166, speed)
          weaponHit(ctx, defPos.x - dir * size * 0.1, defPos.y + size * 0.1, 6)
        }
        await wait(scene, 110 / speed)
        await recover(ctx, 240, bx, by)
      })
      break
    }
    case "bow": {
      const hand = { x: atkPos.x + dir * size * 0.22, y: atkPos.y - size * 0.02 }
      if (move === 1) {
        // Заряженный выстрел: долгое натяжение, стрела горит светом и прошивает цель насквозь
        motion = choreo(ctx, async (hit) => {
          drawCharge(scene, hand.x, hand.y, size, 380 / speed, 0xfff3b0)
          glow(scene, hand.x, hand.y, size * 0.05, size * 0.6, 0xffe8a3, 420 / speed, 0.9)
          await tweenP(scene, { targets: attacker, x: home.x - dir * size * 0.07, scaleX: bx * 0.9, angle: -5 * dir, duration: 380 / speed, ease: "Sine.easeOut" })
          scene.tweens.add({ targets: attacker, x: home.x - dir * size * 0.14, scaleX: bx * 1.05, duration: 80 / speed, ease: "Back.easeOut" })
          popRing(scene, hand.x, hand.y, size * 0.9, speed, 0xffe8a3)
          thrustLine(scene, hand, { x: defPos.x + dir * size * 0.8, y: defPos.y }, size * 1.3, 0xfff3b0, speed)
          await arrowShot(scene, hand, { x: defPos.x - dir * size * 0.05, y: defPos.y }, size * 0.8, speed, { tip: 0xffffff, trail: 0xfff3b0 })
          if (ctx.damage > 0) pierceExit(ctx, defPos.x + dir * size * 0.2, defPos.y, 1.3)
          shockRing(scene, defPos.x, defPos.y, size * 0.9, speed, 0xffe8a3)
          squash(scene, defender, 0.82, 200 / speed)
          hit()
          await wait(scene, 80 / speed)
          await recover(ctx, 200, bx, by)
        })
        break
      }
      if (move === 2) {
        // Ливень стрел: выстрел в небо — и град стрел обрушивается на цель
        motion = choreo(ctx, async (hit) => {
          await tweenP(scene, { targets: attacker, angle: -28 * dir, scaleX: bx * 0.94, duration: 200 / speed, ease: "Sine.easeOut" })
          popRing(scene, hand.x, hand.y - size * 0.1, size * 0.6, speed, 0xffffff)
          thrustLine(scene, hand, { x: hand.x + dir * size * 0.3, y: hand.y - size * 2 }, size * 0.6, m.trail, speed)
          await wait(scene, 160 / speed)
          const n = 5
          const shots: Promise<void>[] = []
          for (let k = 0; k < n; k++) {
            const to = { x: defPos.x + (k - 2) * size * 0.13, y: defPos.y + (Math.random() - 0.3) * size * 0.25 }
            const from = { x: to.x - dir * size * 0.5, y: defPos.y - size * 2.4 }
            shots.push(wait(scene, (k * 55) / speed).then(() =>
              arrowShot(scene, from, to, size * 0.7, speed * 1.3, { tip: m.edge, trail: m.trail }).then(() => {
                stuckArrow(ctx, to.x, to.y, 0.7)
                jitter(scene, defender, 2, 70 / speed)
              })
            ))
          }
          await shots[2]
          if (ctx.damage > 0) pierceExit(ctx, defPos.x, defPos.y, 0.8)
          hit()
          await Promise.all(shots)
          await recover(ctx, 200, bx, by)
        })
        break
      }
      // Натяжение (штрихи сходятся к руке) → выстрел с отдачей → стрела по дуге → втыкается и дрожит.
      motion = choreo(ctx, async (hit) => {
        if (deco) drawCharge(scene, hand.x, hand.y, size, 220 / speed, m.trail)
        await tweenP(scene, {
          targets: attacker,
          x: home.x - dir * size * 0.05,
          scaleX: bx * 0.93,
          angle: -4 * dir,
          duration: 220 / speed,
          ease: "Sine.easeOut"
        })
        if (!deco) {
          await wait(scene, 100 / speed)
          hit()
          await recover(ctx, 160, bx, by)
          return
        }
        if (m.glint !== null) glint(scene, hand.x + dir * size * 0.08, hand.y, size, m.glint, speed, m.power * 0.7)
        // Отдача и щелчок тетивы
        scene.tweens.add({
          targets: attacker,
          x: home.x - dir * size * 0.1,
          scaleX: bx * 1.04,
          angle: 2 * dir,
          duration: 70 / speed,
          ease: "Back.easeOut"
        })
        popRing(scene, hand.x, hand.y, size * 0.6, speed, 0xffffff)
        const look = { tip: m.edge, trail: m.trail }
        const shot = (dy: number): Promise<void> =>
          arrowShot(scene, hand, { x: defPos.x - dir * size * 0.05, y: defPos.y + dy }, size * 0.8, speed, look).then(() => {
            stuckArrow(ctx, defPos.x - dir * size * 0.05, defPos.y + dy)
            if (ctx.damage > 0) pierceExit(ctx, defPos.x + dir * size * 0.05, defPos.y + dy, 0.6)
            impactStar(scene, defPos.x - dir * size * 0.08, defPos.y + dy, size * 0.8, 0xffd166, speed)
            jitter(scene, defender, 3, 160 / speed)
          })
        const second = brave ? wait(scene, 100 / speed).then(() => shot(size * 0.1)) : Promise.resolve()
        await shot(-size * 0.04)
        hit()
        await second
        await wait(scene, 60 / speed)
        await recover(ctx, 180, bx, by)
      })
      break
    }
    case "blackMagic": {
      const element = magicElement(ctx.flavor)
      if (deco && element === "fire") {
        // Огонь: круг рун цвета пламени, заклинатель вскидывает лапы — огненный шар по дуге и взрыв
        motion = choreo(ctx, async (hit) => {
          const hand = { x: atkPos.x + dir * size * 0.2, y: atkPos.y - size * 0.1 }
          runeCircle(scene, home.x, home.y, size * m.power, speed, FIRE_MAGIC, 720 / speed)
          glow(scene, hand.x, hand.y, size * 0.05, size * 0.5, FIRE_MAGIC, 300 / speed)
          await tweenP(scene, { targets: attacker, y: home.y - size * 0.05, scaleX: bx * 1.05, scaleY: by * 1.05, angle: -6 * dir, duration: 220 / speed, ease: "Sine.easeOut" })
          scene.tweens.add({ targets: attacker, x: home.x + dir * size * 0.06, angle: 6 * dir, duration: 90 / speed, ease: "Back.easeOut" })
          await fireball(scene, hand, defPos, size * m.power, speed)
          tintFor(scene, defender, 0xff9f1c, 30 / speed, 320 / speed)
          jitter(scene, defender, 4, 240 / speed)
          hit()
          await wait(scene, 100 / speed)
          await recover(ctx, 220, bx, by)
        })
        break
      }
      if (deco && element === "thunder") {
        // Молния: заклинатель поднимает лапу к небу, искры в ладони — разряд бьёт в цель с неба
        motion = choreo(ctx, async (hit) => {
          const hand = { x: atkPos.x + dir * size * 0.15, y: atkPos.y - size * 0.35 }
          runeCircle(scene, home.x, home.y, size * m.power, speed, THUNDER_MAGIC, 700 / speed)
          await tweenP(scene, { targets: attacker, y: home.y - size * 0.06, angle: -10 * dir, scaleY: by * 1.06, duration: 220 / speed, ease: "Sine.easeOut" })
          glow(scene, hand.x, hand.y, size * 0.05, size * 0.45, THUNDER_MAGIC, 260 / speed)
          popRing(scene, hand.x, hand.y, size * 0.5, speed, 0x9be7ff)
          await wait(scene, 120 / speed)
          await lightningStrike(scene, defPos.x, defPos.y, size * m.power, speed)
          tintFor(scene, defender, 0x9be7ff, 20 / speed, 260 / speed)
          jitter(scene, defender, 5, 260 / speed)
          hit()
          await wait(scene, 120 / speed)
          await recover(ctx, 220, bx, by)
        })
        break
      }
      // Круг рун под кастером, клочья тьмы → тёмный снаряд → столб тьмы из-под цели и взрыв.
      motion = choreo(ctx, async (hit) => {
        const hand = { x: atkPos.x + dir * size * 0.2, y: atkPos.y - size * 0.06 }
        if (deco) {
          runeCircle(scene, home.x, home.y, size * m.power, speed, DARK_MAGIC, 720 / speed)
          darkWisps(scene, home.x, home.y - size * 0.2, size * 0.7, 6)
        }
        await tweenP(scene, {
          targets: attacker,
          y: home.y - size * 0.04,
          scaleX: bx * 1.04,
          scaleY: by * 1.04,
          angle: -4 * dir,
          duration: 200 / speed,
          ease: "Sine.easeOut"
        })
        scene.tweens.add({ targets: attacker, x: home.x + dir * size * 0.05, angle: 5 * dir, duration: 90 / speed, ease: "Back.easeOut" })
        if (!deco) {
          await wait(scene, 120 / speed)
          hit()
          await recover(ctx, 180, bx, by)
          return
        }
        await magicBolt(scene, hand, defPos, size * 0.8 * m.power, speed, DARK_MAGIC, DARK_CORE)
        darkPillar(scene, defPos.x, groundY, size * m.power, size * 1.25, speed)
        darkBlast(scene, defPos.x, defPos.y, size * m.power, speed)
        tintFor(scene, defender, 0xc77dff, 40 / speed, 300 / speed)
        jitter(scene, defender, 4, 220 / speed)
        hit()
        await wait(scene, 80 / speed)
        await recover(ctx, 220, bx, by)
      })
      break
    }
    case "whiteMagic": {
      if (move === 1) {
        // Святой свет: посох к небу — на цель обрушивается столб света с нимбом и перьями
        motion = choreo(ctx, async (hit) => {
          const tip = { x: atkPos.x + dir * size * 0.2, y: atkPos.y - size * 0.4 }
          glow(scene, tip.x, tip.y, size * 0.05, size * 0.5 * m.power, LIGHT_MAGIC, 320 / speed, 0.95)
          lightStars(scene, tip.x, tip.y, size * 0.5, speed, 5)
          await tweenP(scene, { targets: attacker, y: home.y - size * 0.05, angle: -12 * dir, duration: 220 / speed, ease: "Sine.easeOut" })
          await holyPillar(scene, defPos.x, groundY, size * m.power, speed)
          lightStars(scene, defPos.x, defPos.y, size * m.power, speed, 8)
          tintFor(scene, defender, 0xfff3b0, 20 / speed, 260 / speed)
          squash(scene, defender, 0.9, 200 / speed)
          hit()
          await wait(scene, 160 / speed)
          await recover(ctx, 200, bx, by)
        })
        break
      }
      // Посох вверх, свет собирается в навершии → короткий тычок светом, звёздочки на цели.
      motion = choreo(ctx, async (hit) => {
        const tip = { x: atkPos.x + dir * size * 0.24, y: atkPos.y - size * 0.3 }
        if (deco) {
          glow(scene, tip.x, tip.y, size * 0.05, size * 0.4 * m.power, LIGHT_MAGIC, 260 / speed, 0.9)
          later(scene, 80 / speed, () => lightStars(scene, tip.x, tip.y, size * 0.4, speed, 4))
        }
        await tweenP(scene, {
          targets: attacker,
          y: home.y - size * 0.02,
          angle: -6 * dir,
          duration: 160 / speed,
          ease: "Sine.easeOut"
        })
        scene.tweens.add({
          targets: attacker,
          x: home.x + dir * size * 0.08,
          angle: 8 * dir,
          duration: 80 / speed,
          ease: "Back.easeOut"
        })
        if (!deco) {
          await wait(scene, 100 / speed)
          hit()
          await recover(ctx, 160, bx, by)
          return
        }
        await lightBeam(scene, tip, defPos, size * m.power, speed)
        lightStars(scene, defPos.x, defPos.y, size * m.power, speed, 6)
        tintFor(scene, defender, 0xfff3b0, 20 / speed, 160 / speed)
        squash(scene, defender, 0.93, 160 / speed)
        hit()
        await wait(scene, 60 / speed)
        await recover(ctx, 180, bx, by)
      })
      break
    }
    case "gauntlet":
    default: {
      if (move === 1) {
        // Апперкот: рывок, присед — и удар снизу, цель подлетает; звезда удара и вертикальная волна
        motion = choreo(ctx, async (hit) => {
          afterImages(scene, attacker, 3, 22, m.trail, speed)
          await tweenP(scene, { targets: attacker, x: home.x + dir * reach(ctx, 0.8), scaleY: by * 0.88, angle: 4 * dir, duration: 110 / speed, ease: "Quad.easeIn" })
          await tweenP(scene, { targets: attacker, y: home.y - size * 0.12, scaleY: by * 1.1, angle: -14 * dir, duration: 70 / speed, ease: "Back.easeOut" })
          impactStar(scene, defPos.x - dir * size * 0.08, defPos.y + size * 0.05, size * 1.2, 0xffd166, speed)
          shockRing(scene, defPos.x, defPos.y, size * 0.9, speed, m.sparks[0] ?? 0xffd166)
          const dy = defender.y
          scene.tweens.add({ targets: defender, y: dy - size * 0.22, duration: 140 / speed, ease: "Quad.easeOut", yoyo: true, onComplete: () => defender.setY(dy) })
          floatText(scene, defPos.x, defPos.y - size * 0.55, tr("POW", "БАЦ"), "#ffd166", speed, { size: size * 0.16, rise: size * 0.3, stroke: 5, shake: true })
          hit()
          await wait(scene, 200 / speed)
          await recover(ctx, 220, bx, by)
        })
        break
      }
      // Рывок вплотную → серия толчков (3, Brave — 4) с ударными кольцами → последний — с ударной волной.
      motion = choreo(ctx, async (hit) => {
        if (deco) afterImages(scene, attacker, 2, 25, m.trail, speed)
        await tweenP(scene, {
          targets: attacker,
          x: home.x + dir * reach(ctx, 0.78),
          angle: 6 * dir,
          duration: 110 / speed,
          ease: "Quad.easeIn"
        })
        const n = brave ? 4 : 3
        const base = attacker.x
        const ringColor = m.sparks[0] ?? 0xffd166
        for (let i = 0; i < n; i++) {
          const last = i === n - 1
          await tweenP(scene, {
            targets: attacker,
            x: base + dir * size * (last ? 0.1 : 0.06),
            angle: (last ? 10 : i % 2 ? 2 : 8) * dir,
            duration: 45 / speed,
            ease: "Quad.easeIn"
          })
          if (deco) {
            const py = defPos.y + (i % 2 ? size * 0.08 : -size * 0.06)
            if (last) {
              shockRing(scene, defPos.x - dir * size * 0.1, py, size * 0.8, speed, ringColor)
              knockback(scene, defender, dir * size * 0.15, 220 / speed)
              squash(scene, defender, 0.85, 180 / speed)
            }
            else {
              popRing(scene, defPos.x - dir * size * 0.12, py, size, speed, ringColor)
              jitter(scene, defender, 2.5, 90 / speed)
            }
            if (m.splinters && last) weaponHit(ctx, defPos.x - dir * size * 0.1, py, 5)
          }
          if (last) hit()
          await tweenP(scene, { targets: attacker, x: base, angle: 4 * dir, duration: 45 / speed, ease: "Quad.easeOut" })
        }
        await wait(scene, 50 / speed)
        await recover(ctx, 200, bx, by)
      })
      break
    }
  }
  const impactAt = motion.impact.then(() => {
    if (deco) impactAccents(ctx, false)
    // Спецприём: финальный взрыв на цели
    if (deco && ctx.special) finisherBurst(scene, defPos.x, defPos.y, size, specialColor(ctx), speed)
  })
  return { impactAt, done: motion.settle }
}

/* ---------- Карта: облегчённые версии у клетки цели ---------- */

/**
 * Быстрый вариант для карты: замах и рывок делает презентер, здесь — след оружия, снаряд и эффект на цели.
 * impactAt — момент контакта (у снарядов — после полёта).
 */
export function playQuickAttackFx(ctx: AttackFxCtx): AttackFxResult {
  const { scene, kind, defPos, atkPos, dir, speed, size, defender } = ctx
  if (!sceneAlive(scene)) return { impactAt: Promise.resolve(), done: Promise.resolve() }
  ensureMotionTextures(scene)
  const s = 0.9
  const m = materialOf(ctx)
  const brave = ctx.variant === "brave"
  const groundY = ctx.groundY ?? defPos.y + size * 0.4
  const move = roll(3)
  let impactAt: Promise<void>
  switch (kind) {
    case "sword":
      if (move === 1) {
        // Крест-накрест: два разреза, второй догоняет
        slashTrail(scene, defPos.x, defPos.y, size * 1.05, dir, m.trail, speed, true)
        later(scene, 70 / speed, () => slashTrail(scene, defPos.x, defPos.y, size, dir, m.trail, speed, false, true))
        if (ctx.damage > 0) slashMarks(scene, defPos.x, defPos.y, size, dir, speed, s, bloodTints(ctx))
        weaponHit(ctx, defPos.x, defPos.y, 8)
        impactAt = wait(scene, 70 / speed)
        break
      }
      if (move === 2) {
        // Вихрь клинка: три быстрых разреза на разной высоте
        for (let i = 0; i < 3; i++) {
          later(scene, (i * 60) / speed, () => {
            slashTrail(scene, defPos.x, defPos.y + (i - 1) * size * 0.12, size * 0.75, dir, m.trail, speed, i === 2, i % 2 === 1)
            jitter(scene, defender, 2, 70 / speed)
          })
        }
        if (ctx.damage > 0) later(scene, 120 / speed, () => slashMarks(scene, defPos.x, defPos.y, size, dir, speed, s * 0.85, bloodTints(ctx)))
        impactAt = wait(scene, 120 / speed)
        break
      }
      slashTrail(scene, defPos.x, defPos.y, size, dir, m.trail, speed, ctx.special)
      if (ctx.damage > 0) slashMarks(scene, defPos.x, defPos.y, size, dir, speed, s * 0.85, bloodTints(ctx))
      weaponHit(ctx, defPos.x - dir * size * 0.1, defPos.y, 6)
      if (brave) later(scene, 80 / speed, () => slashTrail(scene, defPos.x, defPos.y, size * 0.9, dir, m.trail, speed, false, true))
      impactAt = Promise.resolve()
      break
    case "spear": {
      if (move === 1) {
        // Град уколов: три укола на разной высоте, последний — насквозь
        for (let i = 0; i < 3; i++) {
          const dy = [-0.12, 0.1, 0][i]! * size
          later(scene, (i * 55) / speed, () => {
            thrustLine(scene, { x: atkPos.x, y: atkPos.y + dy }, { x: defPos.x + dir * size * (i === 2 ? 0.45 : 0.25), y: defPos.y + dy }, size * 0.85, m.trail, speed)
            jitter(scene, defender, 2, 60 / speed)
          })
        }
        impactAt = wait(scene, 110 / speed).then(() => {
          if (ctx.damage > 0) pierceExit(ctx, defPos.x + dir * size * 0.2, defPos.y, 0.8)
        })
        break
      }
      const thrust = (dy: number): void => {
        thrustLine(scene, { x: atkPos.x, y: atkPos.y + dy }, { x: defPos.x + dir * size * 0.45, y: defPos.y + dy }, size, m.trail, speed)
        if (ctx.damage > 0) pierceExit(ctx, defPos.x + dir * size * 0.2, defPos.y + dy, 0.6)
      }
      thrust(0)
      weaponHit(ctx, defPos.x - dir * size * 0.1, defPos.y, 4)
      if (brave) later(scene, 80 / speed, () => thrust(-size * 0.1))
      impactAt = Promise.resolve()
      break
    }
    case "axe":
      if (move === 1) {
        // Смерч: два кольцевых взмаха и ударная волна по земле
        swingArc(scene, atkPos.x + dir * size * 0.2, atkPos.y, size * 0.6, dir, speed, m.trail)
        swingArc(scene, atkPos.x + dir * size * 0.2, atkPos.y + size * 0.1, size * 0.5, -dir, speed, m.trail)
        shockRing(scene, defPos.x, groundY, size * 1.1, speed, m.sparks[0] ?? 0xffd166)
        debrisBurst(scene, defPos.x, groundY, size, 8, speed)
        knockback(scene, defender, dir * size * 0.16, 220 / speed)
        impactAt = Promise.resolve()
        break
      }
      slashTrail(scene, defPos.x, defPos.y, size, dir, m.trail, speed, true)
      swingArc(scene, atkPos.x + dir * size * 0.2, atkPos.y, size * 0.5, dir, speed, m.trail)
      impactStar(scene, defPos.x, defPos.y, size, 0xffd166, speed)
      groundCrack(ctx, defPos.x, groundY, 0.65)
      knockback(scene, defender, dir * size * 0.14, 200 / speed)
      if (brave) later(scene, 90 / speed, () => impactStar(scene, defPos.x, defPos.y + size * 0.1, size * 0.8, 0xffd166, speed))
      impactAt = Promise.resolve()
      break
    case "blackMagic": {
      const element = magicElement(ctx.flavor)
      if (element === "fire") {
        runeCircle(scene, atkPos.x, atkPos.y + size * 0.38, size * 0.8 * m.power, speed, FIRE_MAGIC, 520 / speed)
        impactAt = fireball(scene, { x: atkPos.x + dir * size * 0.25, y: atkPos.y }, defPos, size * 0.75 * m.power, speed)
        break
      }
      if (element === "thunder") {
        runeCircle(scene, atkPos.x, atkPos.y + size * 0.38, size * 0.8 * m.power, speed, THUNDER_MAGIC, 520 / speed)
        impactAt = wait(scene, 140 / speed).then(() => lightningStrike(scene, defPos.x, defPos.y, size * 0.8 * m.power, speed))
        break
      }
      runeCircle(scene, atkPos.x, atkPos.y + size * 0.38, size * 0.8 * m.power, speed, DARK_MAGIC, 520 / speed)
      impactAt = magicBolt(
        scene,
        { x: atkPos.x + dir * size * 0.25, y: atkPos.y },
        defPos,
        size * 0.7 * m.power,
        speed,
        DARK_MAGIC,
        DARK_CORE
      ).then(() => {
        darkPillar(scene, defPos.x, groundY, size * 0.8, size * 0.9, speed)
        darkBlast(scene, defPos.x, defPos.y, size * 0.7, speed)
      })
      break
    }
    case "bow": {
      const look = { tip: m.edge, trail: m.trail }
      const from = { x: atkPos.x + dir * size * 0.25, y: atkPos.y }
      const shot = (dy: number): Promise<void> =>
        arrowShot(scene, from, { x: defPos.x, y: defPos.y + dy }, size, speed, look).then(() => {
          stuckArrow(ctx, defPos.x - dir * size * 0.05, defPos.y + dy, 0.8)
          impactStar(scene, defPos.x, defPos.y + dy, size * 0.8, 0xffd166, speed)
        })
      if (move === 2) {
        // Ливень стрел: стрелы падают на цель сверху одна за другой
        const rain: Promise<void>[] = []
        for (let k = 0; k < 4; k++) {
          const to = { x: defPos.x + (k - 1.5) * size * 0.14, y: defPos.y + (Math.random() - 0.3) * size * 0.2 }
          rain.push(wait(scene, (k * 50) / speed).then(() =>
            arrowShot(scene, { x: to.x - dir * size * 0.4, y: defPos.y - size * 2 }, to, size * 0.8, speed * 1.3, look).then(() =>
              stuckArrow(ctx, to.x, to.y, 0.6)
            )
          ))
        }
        impactAt = rain[1] ?? Promise.resolve()
        break
      }
      impactAt = shot(0)
      if (brave) later(scene, 90 / speed, () => void shot(size * 0.12))
      break
    }
    case "whiteMagic":
      if (move === 1) {
        impactAt = holyPillar(scene, defPos.x, groundY, size * 0.85, speed).then(() => lightStars(scene, defPos.x, defPos.y, size * 0.7, speed, 6))
        break
      }
      impactAt = lightBeam(scene, { x: atkPos.x + dir * size * 0.2, y: atkPos.y - size * 0.2 }, defPos, size * 0.8, speed).then(() =>
        lightStars(scene, defPos.x, defPos.y, size * 0.7, speed, 5)
      )
      break
    case "gauntlet":
    default: {
      // Серия толчков: кольца у цели одно за другим, контакт — на последнем
      const n = brave ? 4 : 3
      for (let i = 0; i < n - 1; i++) {
        later(scene, (i * 55) / speed, () => {
          popRing(scene, defPos.x - dir * size * 0.1, defPos.y + (i % 2 ? size * 0.08 : -size * 0.06), size, speed, m.sparks[0] ?? 0xffd166)
          jitter(scene, defender, 2, 80 / speed)
        })
      }
      impactAt = wait(scene, ((n - 1) * 55) / speed).then(() => shockRing(scene, defPos.x, defPos.y, size, speed, m.sparks[0] ?? 0xffd166))
      break
    }
  }
  impactAt = impactAt.then(() => {
    impactAccents(ctx, true)
    // Спецприём: финальный взрыв на цели
    if (ctx.special) finisherBurst(scene, defPos.x, defPos.y, size * 0.85, specialColor(ctx), speed)
  })
  const done = impactAt.then(() => {
    zoomPunch(scene, 1.04, 140 / speed)
  })
  return { impactAt, done }
}
