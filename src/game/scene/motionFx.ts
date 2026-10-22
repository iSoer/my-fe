import Phaser from "phaser"
import type { TerrainId, UnitInstance, WeaponSkill } from "@game/core/types"
import { weaponDef } from "@game/content/weapons"
import { FONT, textStyle } from "./style"
import { sceneAlive, tween, wait } from "./fx"
import type { HitGoreOptions } from "./gore"

/**
 * Эффекты движения и действий (только презентация): следы шагов по местности, следы оружия, снаряды,
 * хит-стоп, остаточные образы, лечение, баффы, танец, левел-ап, портал подкрепления, кат-ин спецприёма.
 * Все эффекты не блокируют, если не сказано иное, и сами убирают свои объекты.
 */

/* ---------- Текстуры ---------- */

export const MTEX = {
  glow: "mtex_glow",
  plus: "mtex_plus",
  leaf: "mtex_leaf",
  streak: "mtex_streak",
  shard: "mtex_shard",
  ripple: "mtex_ripple",
  flake: "mtex_flake",
  ray: "mtex_ray"
} as const

/** Текстуры эффектов движения: рисуются один раз (свои ключи, не пересекаются с textures.ts). */
export function ensureMotionTextures(scene: Phaser.Scene): void {
  const tex = scene.textures
  if (tex.exists(MTEX.glow)) return
  // Мягкое радиальное свечение
  const glow = tex.createCanvas(MTEX.glow, 64, 64)
  if (glow) {
    const ctx = glow.getContext()
    const grd = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    grd.addColorStop(0, "rgba(255,255,255,1)")
    grd.addColorStop(0.35, "rgba(255,255,255,0.55)")
    grd.addColorStop(1, "rgba(255,255,255,0)")
    ctx.fillStyle = grd
    ctx.fillRect(0, 0, 64, 64)
    glow.refresh()
  }
  // Луч света: вертикальный градиент, прозрачный по краям
  const ray = tex.createCanvas(MTEX.ray, 32, 128)
  if (ray) {
    const ctx = ray.getContext()
    const grd = ctx.createLinearGradient(0, 0, 32, 0)
    grd.addColorStop(0, "rgba(255,255,255,0)")
    grd.addColorStop(0.5, "rgba(255,255,255,1)")
    grd.addColorStop(1, "rgba(255,255,255,0)")
    ctx.fillStyle = grd
    ctx.fillRect(0, 0, 32, 128)
    const fade = ctx.createLinearGradient(0, 0, 0, 128)
    fade.addColorStop(0, "rgba(0,0,0,1)")
    fade.addColorStop(0.25, "rgba(0,0,0,0)")
    fade.addColorStop(1, "rgba(0,0,0,0)")
    ctx.globalCompositeOperation = "destination-out"
    ctx.fillStyle = fade
    ctx.fillRect(0, 0, 32, 128)
    ray.refresh()
  }
  const g = scene.make.graphics({ x: 0, y: 0 }, false)
  // Крестик лечения
  g.clear()
  g.fillStyle(0xffffff, 1)
  g.fillRoundedRect(6, 0, 6, 18, 2)
  g.fillRoundedRect(0, 6, 18, 6, 2)
  g.generateTexture(MTEX.plus, 18, 18)
  // Листик
  g.clear()
  g.fillStyle(0xffffff, 1)
  g.fillEllipse(8, 5, 16, 8)
  g.generateTexture(MTEX.leaf, 16, 10)
  // Штрих (скоростная линия / искра-черта)
  g.clear()
  g.fillStyle(0xffffff, 1)
  g.fillRoundedRect(0, 0, 64, 4, 2)
  g.generateTexture(MTEX.streak, 64, 4)
  // Осколок
  g.clear()
  g.fillStyle(0xffffff, 1)
  g.fillTriangle(0, 10, 6, 0, 10, 12)
  g.generateTexture(MTEX.shard, 12, 12)
  // Кольцо-рябь (тонкое)
  g.clear()
  g.lineStyle(3, 0xffffff, 1)
  g.strokeEllipse(32, 16, 60, 28)
  g.generateTexture(MTEX.ripple, 64, 32)
  // Снежинка
  g.clear()
  g.fillStyle(0xffffff, 1)
  g.fillCircle(5, 5, 3)
  g.fillRect(4, 0, 2, 10)
  g.fillRect(0, 4, 10, 2)
  g.generateTexture(MTEX.flake, 10, 10)
  g.destroy()
}

/* ---------- Общие помощники ---------- */

let reducedCache: boolean | null = null

/** Пользователь просит меньше движения: тряску и вспышки ослабляем. */
export function reducedMotion(): boolean {
  if (reducedCache !== null) return reducedCache
  try {
    reducedCache = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches
  }
  catch {
    reducedCache = false
  }
  return reducedCache
}

/** Множитель тряски/вспышек: 0.3 при reduced motion. */
export function shakeMul(): number {
  return reducedMotion() ? 0.3 : 1
}

/** Тряска камеры в пикселях (с учётом reduced motion). */
export function shakeCam(scene: Phaser.Scene, ms: number, px: number): void {
  if (!sceneAlive(scene)) return
  const amp = (px * shakeMul()) / Math.max(1, scene.scale.width)
  if (amp > 0) scene.cameras.main.shake(ms, amp)
}

function burstEmitter(
  scene: Phaser.Scene,
  x: number,
  y: number,
  key: string,
  count: number,
  cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig,
  depth: number,
  lifeMs: number
): void {
  if (!sceneAlive(scene) || count <= 0) return
  const e = scene.add.particles(x, y, key, { ...cfg, emitting: false })
  e.setDepth(depth)
  e.explode(count)
  scene.time.delayedCall(lifeMs + 80, () => e.destroy())
}

/**
 * Хит-стоп: на короткое время почти останавливает твины сцены. Время (delayedCall) идёт как обычно,
 * поэтому ожидания по таймеру не растягиваются. В режиме пропуска (timeScale ≥ 10) не трогаем.
 */
export function hitStop(scene: Phaser.Scene, ms: number, factor = 0.04): void {
  if (!sceneAlive(scene) || ms <= 0) return
  const prev = scene.tweens.timeScale
  if (prev >= 10 || prev < 0.5) return
  scene.tweens.timeScale = factor
  scene.time.delayedCall(ms, () => {
    if (scene.tweens && scene.tweens.timeScale === factor) scene.tweens.timeScale = prev
  })
}

/** Вид кровавого попадания по оружию модели. */
export function goreKindOf(skill: WeaponSkill): NonNullable<HitGoreOptions["kind"]> {
  switch (skill) {
    case "sword":
    case "axe":
      return "slash"
    case "spear":
      return "pierce"
    case "gauntlet":
      return "blunt"
    case "bow":
      return "arrow"
    default:
      return "magic"
  }
}

export function goreKindOfUnit(unit: UnitInstance | undefined): NonNullable<HitGoreOptions["kind"]> {
  if (!unit) return "slash"
  return goreKindOf(weaponDef(unit.skills.weapon).kind)
}

/* ---------- Шаги по местности ---------- */

const DUST = [0xbdb7a8, 0xd9d2c3, 0x9e978a, 0xe8e2d4]
const SNOWY = new Set(["winter_park", "glacier"])
const SANDY = new Set(["desert", "canyon"])

/** След шага: пыль, брызги воды, листья в зарослях, снег, камешки. */
export function stepFx(
  scene: Phaser.Scene,
  x: number,
  y: number,
  size: number,
  terrain: TerrainId | undefined,
  biomeId: string,
  heavy = false
): void {
  if (!sceneAlive(scene)) return
  ensureMotionTextures(scene)
  const n = heavy ? 1.6 : 1
  if (terrain === "water") {
    const ring = scene.add.image(x, y, MTEX.ripple).setDepth(9).setTint(0xe0f4ff).setAlpha(0.9)
    ring.setDisplaySize(size * 0.4, size * 0.16)
    scene.tweens.add({
      targets: ring,
      displayWidth: size * 1.1,
      displayHeight: size * 0.42,
      alpha: 0,
      duration: 520,
      ease: "Quad.easeOut",
      onComplete: () => ring.destroy()
    })
    burstEmitter(
      scene,
      x,
      y,
      "tex_dot",
      Math.round(10 * n),
      {
        speed: { min: size * 0.8, max: size * 2 },
        angle: { min: 220, max: 320 },
        scale: { start: 0.5, end: 0.1 },
        alpha: { start: 0.95, end: 0 },
        lifespan: { min: 280, max: 460 },
        gravityY: size * 7,
        tint: [0xbde0fe, 0xffffff, 0x8ecae6]
      },
      24,
      480
    )
    return
  }
  if (terrain === "forest") {
    burstEmitter(
      scene,
      x,
      y - size * 0.1,
      MTEX.leaf,
      Math.round(5 * n),
      {
        speed: { min: size * 0.4, max: size * 1.2 },
        angle: { min: 200, max: 340 },
        scale: { start: 0.9, end: 0.5 },
        alpha: { start: 1, end: 0 },
        rotate: { min: 0, max: 360 },
        lifespan: { min: 500, max: 800 },
        gravityY: size * 1.6,
        tint: [0x6a994e, 0xa7c957, 0x386641, 0xd4a373]
      },
      24,
      820
    )
  }
  const snowy = SNOWY.has(biomeId)
  const sandy = SANDY.has(biomeId)
  burstEmitter(
    scene,
    x,
    y,
    snowy ? MTEX.flake : "tex_dot",
    Math.round((snowy ? 8 : 7) * n),
    {
      speed: { min: size * 0.5, max: size * 1.5 },
      angle: { min: 195, max: 345 },
      scale: { start: snowy ? 0.8 : 0.6, end: 0 },
      alpha: { start: 0.85, end: 0 },
      lifespan: { min: 260, max: 460 },
      gravityY: size * 4,
      tint: snowy ? [0xffffff, 0xe3f2fd] : sandy ? [0xe9c46a, 0xf4a261, 0xddb892] : DUST
    },
    24,
    480
  )
  // Отпечаток лапы, который тает
  const print = scene.add
    .ellipse(x, y + size * 0.02, size * 0.16, size * 0.07, 0x000000, snowy ? 0.18 : 0.12)
    .setDepth(2)
  scene.tweens.add({ targets: print, alpha: 0, duration: 1600, delay: 300, onComplete: () => print.destroy() })
}

/* ---------- Следы оружия ---------- */

/** Сияющий полумесяц разреза (меч, топор). */
export function slashTrail(
  scene: Phaser.Scene,
  x: number,
  y: number,
  size: number,
  dir: number,
  color: number,
  speed: number,
  heavy = false
): void {
  if (!sceneAlive(scene)) return
  const r = size * (heavy ? 0.62 : 0.5)
  const g = scene.add.graphics().setDepth(27).setBlendMode(Phaser.BlendModes.ADD)
  const start = dir > 0 ? -2.2 : Math.PI + 2.2
  const sweep = (dir > 0 ? 1 : -1) * 2.4
  const state = { t: 0 }
  const draw = (): void => {
    if (!g.scene) return
    g.clear()
    const steps = 18
    const head = state.t
    for (let i = 0; i < steps; i++) {
      const k0 = (i / steps) * head
      const k1 = ((i + 1) / steps) * head
      const a0 = start + sweep * k0
      const a1 = start + sweep * k1
      const fade = (i + 1) / steps
      const width = (heavy ? 9 : 6) * fade + 1
      g.lineStyle(width * 2.2, color, 0.18 * fade)
      g.beginPath()
      g.arc(x, y, r, Math.min(a0, a1), Math.max(a0, a1))
      g.strokePath()
      g.lineStyle(width, 0xffffff, 0.9 * fade)
      g.beginPath()
      g.arc(x, y, r, Math.min(a0, a1), Math.max(a0, a1))
      g.strokePath()
    }
  }
  scene.tweens.add({
    targets: state,
    t: 1,
    duration: 110 / speed,
    ease: "Cubic.easeOut",
    onUpdate: draw,
    onComplete: () => {
      draw()
      scene.tweens.add({ targets: g, alpha: 0, duration: 200 / speed, onComplete: () => g.destroy() })
    }
  })
}

/** Укол копьём: тонкая яркая линия с вспышкой на острие. */
export function thrustLine(
  scene: Phaser.Scene,
  from: { x: number, y: number },
  to: { x: number, y: number },
  size: number,
  color: number,
  speed: number
): void {
  if (!sceneAlive(scene)) return
  ensureMotionTextures(scene)
  const ang = Math.atan2(to.y - from.y, to.x - from.x)
  const len = Math.hypot(to.x - from.x, to.y - from.y)
  const line = scene.add
    .image(from.x, from.y, MTEX.streak)
    .setOrigin(0, 0.5)
    .setRotation(ang)
    .setDepth(27)
    .setTint(color)
    .setBlendMode(Phaser.BlendModes.ADD)
  line.setDisplaySize(1, size * 0.08)
  scene.tweens.add({
    targets: line,
    displayWidth: len,
    duration: 70 / speed,
    ease: "Cubic.easeOut",
    onComplete: () =>
      scene.tweens.add({
        targets: line,
        alpha: 0,
        displayHeight: 1,
        duration: 180 / speed,
        onComplete: () => line.destroy()
      })
  })
  const tip = scene.add.image(to.x, to.y, MTEX.glow).setDepth(28).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffffff)
  tip.setDisplaySize(size * 0.2, size * 0.2)
  scene.tweens.add({
    targets: tip,
    displayWidth: size * 0.9,
    displayHeight: size * 0.9,
    alpha: 0,
    duration: 220 / speed,
    delay: 60 / speed,
    onComplete: () => tip.destroy()
  })
}

/** Удар кулаком: ударная волна и кольцо пыли. */
export function shockRing(
  scene: Phaser.Scene,
  x: number,
  y: number,
  size: number,
  speed: number,
  color = 0xffffff
): void {
  if (!sceneAlive(scene)) return
  for (let i = 0; i < 2; i++) {
    const ring = scene.add.image(x, y, "tex_ring").setDepth(27).setTint(color).setAlpha(0.95)
    ring.setDisplaySize(size * 0.2, size * 0.2)
    scene.tweens.add({
      targets: ring,
      displayWidth: size * (1.3 + i * 0.5),
      displayHeight: size * (1.3 + i * 0.5),
      alpha: 0,
      duration: (260 + i * 120) / speed,
      delay: (i * 60) / speed,
      ease: "Cubic.easeOut",
      onComplete: () => ring.destroy()
    })
  }
  burstEmitter(
    scene,
    x,
    y,
    MTEX.streak,
    8,
    {
      speed: { min: size * 2, max: size * 3.5 },
      angle: { min: 0, max: 360 },
      rotate: 0,
      scale: { start: 0.35, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 220,
      tint: [0xffffff, 0xffe08a]
    },
    27,
    260
  )
}

/** Искры (удар без урона, лязг): белые и золотые штрихи. */
export function sparks(scene: Phaser.Scene, x: number, y: number, size: number, speed: number, count = 12): void {
  if (!sceneAlive(scene)) return
  ensureMotionTextures(scene)
  burstEmitter(
    scene,
    x,
    y,
    MTEX.streak,
    count,
    {
      speed: { min: size * 1.6, max: size * 3.4 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.3, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: { min: 160, max: 300 },
      gravityY: size * 3,
      tint: [0xffffff, 0xfff3b0, 0xffd166]
    },
    28,
    320 / speed
  )
  const flash = scene.add.image(x, y, MTEX.glow).setDepth(28).setBlendMode(Phaser.BlendModes.ADD).setTint(0xfff3b0)
  flash.setDisplaySize(size * 0.8, size * 0.8)
  scene.tweens.add({
    targets: flash,
    alpha: 0,
    scale: flash.scale * 1.6,
    duration: 180 / speed,
    onComplete: () => flash.destroy()
  })
}

/** Стрела: летит по дуге, за ней тянется хвост. Промис — момент попадания. */
export function arrowShot(
  scene: Phaser.Scene,
  from: { x: number, y: number },
  to: { x: number, y: number },
  size: number,
  speed: number
): Promise<void> {
  if (!sceneAlive(scene)) return Promise.resolve()
  ensureMotionTextures(scene)
  const g = scene.add.graphics().setDepth(27)
  const L = size * 0.42
  g.lineStyle(Math.max(2, size * 0.035), 0x6d4c41, 1)
  g.lineBetween(-L / 2, 0, L / 2, 0)
  g.fillStyle(0xdee2e6, 1)
  g.fillTriangle(L / 2 + size * 0.1, 0, L / 2 - 2, -size * 0.05, L / 2 - 2, size * 0.05)
  g.fillStyle(0xe63946, 1)
  g.fillTriangle(-L / 2, 0, -L / 2 - size * 0.08, -size * 0.06, -L / 2 + size * 0.06, 0)
  g.fillTriangle(-L / 2, 0, -L / 2 - size * 0.08, size * 0.06, -L / 2 + size * 0.06, 0)
  g.setPosition(from.x, from.y)
  const dist = Math.hypot(to.x - from.x, to.y - from.y)
  const arc = Math.min(size * 0.6, dist * 0.18)
  const st = { t: 0 }
  let lastTrail = 0
  return new Promise((resolve) => {
    scene.tweens.add({
      targets: st,
      t: 1,
      duration: Math.max(120, dist * 0.9) / speed,
      ease: "Sine.easeIn",
      onUpdate: () => {
        if (!g.scene) return
        const x = from.x + (to.x - from.x) * st.t
        const y = from.y + (to.y - from.y) * st.t - Math.sin(st.t * Math.PI) * arc
        const dx = to.x - from.x
        const dy = to.y - from.y - Math.cos(st.t * Math.PI) * arc * Math.PI
        g.setPosition(x, y).setRotation(Math.atan2(dy, dx))
        if (st.t - lastTrail > 0.06) {
          lastTrail = st.t
          const d = scene.add.image(x, y, MTEX.glow).setDepth(26).setTint(0xfff3b0).setAlpha(0.6)
          d.setDisplaySize(size * 0.14, size * 0.14).setBlendMode(Phaser.BlendModes.ADD)
          scene.tweens.add({ targets: d, alpha: 0, scale: d.scale * 0.3, duration: 260, onComplete: () => d.destroy() })
        }
      },
      onComplete: () => {
        g.destroy()
        resolve()
      }
    })
  })
}

/**
 * Магический снаряд: круг рун у мага, сгусток с хвостом, вспышка у цели. Промис — момент попадания.
 * color — цвет магии (тёмная — фиолетовая, светлая — золотисто-белая).
 */
export function magicBolt(
  scene: Phaser.Scene,
  from: { x: number, y: number },
  to: { x: number, y: number },
  size: number,
  speed: number,
  color: number
): Promise<void> {
  if (!sceneAlive(scene)) return Promise.resolve()
  ensureMotionTextures(scene)
  // Круг рун у заклинателя
  const runes = scene.add.graphics().setDepth(26).setBlendMode(Phaser.BlendModes.ADD)
  runes.setPosition(from.x, from.y)
  runes.lineStyle(2, color, 0.9)
  runes.strokeCircle(0, 0, size * 0.32)
  runes.lineStyle(1.5, 0xffffff, 0.7)
  runes.strokeCircle(0, 0, size * 0.24)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    runes.fillStyle(0xffffff, 0.9)
    runes.fillRect(Math.cos(a) * size * 0.28 - 2, Math.sin(a) * size * 0.28 - 2, 4, 4)
  }
  runes.setScale(0.2)
  scene.tweens.add({ targets: runes, scale: 1, angle: 120, duration: 220 / speed, ease: "Back.easeOut" })
  scene.tweens.add({
    targets: runes,
    alpha: 0,
    duration: 260 / speed,
    delay: 240 / speed,
    onComplete: () => runes.destroy()
  })
  const orb = scene.add.image(from.x, from.y, MTEX.glow).setDepth(27).setTint(color).setBlendMode(Phaser.BlendModes.ADD)
  orb.setDisplaySize(size * 0.45, size * 0.45)
  const core = scene.add
    .image(from.x, from.y, MTEX.glow)
    .setDepth(28)
    .setTint(0xffffff)
    .setBlendMode(Phaser.BlendModes.ADD)
  core.setDisplaySize(size * 0.2, size * 0.2)
  const trail = scene.add.particles(0, 0, MTEX.glow, {
    follow: orb,
    frequency: 18,
    lifespan: 260,
    scale: { start: (size * 0.3) / 64, end: 0 },
    alpha: { start: 0.7, end: 0 },
    tint: [color, 0xffffff],
    blendMode: Phaser.BlendModes.ADD
  })
  trail.setDepth(26)
  const dist = Math.hypot(to.x - from.x, to.y - from.y)
  return new Promise((resolve) => {
    scene.tweens.add({
      targets: [orb, core],
      x: to.x,
      y: to.y,
      delay: 160 / speed,
      duration: Math.max(140, dist * 0.7) / speed,
      ease: "Quad.easeIn",
      onComplete: () => {
        orb.destroy()
        core.destroy()
        trail.stop()
        scene.time.delayedCall(300, () => trail.destroy())
        // Вспышка у цели
        const flash = scene.add
          .image(to.x, to.y, MTEX.glow)
          .setDepth(28)
          .setTint(color)
          .setBlendMode(Phaser.BlendModes.ADD)
        flash.setDisplaySize(size * 0.4, size * 0.4)
        scene.tweens.add({
          targets: flash,
          displayWidth: size * 1.8,
          displayHeight: size * 1.8,
          alpha: 0,
          duration: 300 / speed,
          ease: "Cubic.easeOut",
          onComplete: () => flash.destroy()
        })
        burstEmitter(
          scene,
          to.x,
          to.y,
          MTEX.shard,
          10,
          {
            speed: { min: size * 1, max: size * 2.4 },
            angle: { min: 0, max: 360 },
            rotate: { min: 0, max: 360 },
            scale: { start: 0.9, end: 0 },
            alpha: { start: 1, end: 0 },
            lifespan: { min: 220, max: 420 },
            tint: [color, 0xffffff]
          },
          28,
          440
        )
        resolve()
      }
    })
  })
}

/* ---------- Движение: остаточные образы и скоростные линии ---------- */

interface BodyImageSource {
  bodyImage?: () => Phaser.GameObjects.Image | null
}

/**
 * Остаточные образы рывка: копии текстуры бойца, которые тают позади. Для UnitView берётся спрайт тела,
 * для картинки (кинематик) — она сама.
 */
export function afterImages(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.Image | Phaser.GameObjects.Container,
  count: number,
  intervalMs: number,
  color: number,
  speed: number
): void {
  if (!sceneAlive(scene)) return
  const src = target instanceof Phaser.GameObjects.Image ? target : ((target as BodyImageSource).bodyImage?.() ?? null)
  if (!src) return
  for (let i = 0; i < count; i++) {
    scene.time.delayedCall((i * intervalMs) / speed, () => {
      if (!sceneAlive(scene) || !src.scene) return
      const m = src.getWorldTransformMatrix()
      const ghost = scene.add
        .image(m.tx, m.ty, src.texture.key)
        .setOrigin(src.originX, src.originY)
        .setScale(m.scaleX, m.scaleY)
        .setRotation(m.rotation)
        .setFlipX(src.flipX)
        .setTintFill(color)
        .setAlpha(0.45)
        .setDepth(((target as Phaser.GameObjects.Container).depth ?? 10) - 0.5)
      scene.tweens.add({ targets: ghost, alpha: 0, duration: 260 / speed, onComplete: () => ghost.destroy() })
    })
  }
}

/** Скоростные линии вдоль направления (горизонтальные полосы, пролетающие мимо). */
export function speedLines(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  dir: number,
  speed: number,
  count = 10,
  depth = 3
): void {
  if (!sceneAlive(scene) || reducedMotion()) return
  ensureMotionTextures(scene)
  for (let i = 0; i < count; i++) {
    const ly = y - h / 2 + Math.random() * h
    const len = w * (0.25 + Math.random() * 0.35)
    const line = scene.add
      .image(dir > 0 ? x - w / 2 - len : x + w / 2 + len, ly, MTEX.streak)
      .setDepth(depth)
      .setAlpha(0.15 + Math.random() * 0.35)
      .setTint(0xffffff)
    line.setDisplaySize(len, 1 + Math.random() * 3)
    scene.tweens.add({
      targets: line,
      x: dir > 0 ? x + w / 2 + len : x - w / 2 - len,
      duration: (180 + Math.random() * 160) / speed,
      delay: (Math.random() * 120) / speed,
      onComplete: () => line.destroy()
    })
  }
}

/* ---------- Поддержка, рост, подкрепление ---------- */

/** Лечение: столб света, поднимающиеся крестики, кольцо у ног. */
export function healPillar(scene: Phaser.Scene, x: number, y: number, size: number, speed: number): void {
  if (!sceneAlive(scene)) return
  ensureMotionTextures(scene)
  const feetY = y + size * 0.36
  // Два луча: широкий зелёный и узкий белый сердечник
  const beams = [
    { tint: 0x57cc99, w: size * 0.95, a: 0.85 },
    { tint: 0xffffff, w: size * 0.35, a: 0.95 }
  ].map((b) => {
    const img = scene.add
      .image(x, feetY, MTEX.ray)
      .setOrigin(0.5, 1)
      .setDepth(23)
      .setTint(b.tint)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0)
    img.setDisplaySize(b.w * 0.2, size * 2.6)
    scene.tweens.add({
      targets: img,
      alpha: b.a,
      displayWidth: b.w,
      duration: 160 / speed,
      ease: "Quad.easeOut",
      onComplete: () =>
        scene.tweens.add({
          targets: img,
          alpha: 0,
          displayWidth: b.w * 0.15,
          duration: 480 / speed,
          delay: 320 / speed,
          onComplete: () => img.destroy()
        })
    })
    return img
  })
  void beams
  // Свечение тела
  const aura = scene.add.image(x, y, MTEX.glow).setDepth(23).setTint(0x80ed99).setBlendMode(Phaser.BlendModes.ADD)
  aura.setDisplaySize(size * 1.3, size * 1.3).setAlpha(0)
  scene.tweens.add({
    targets: aura,
    alpha: 0.8,
    duration: 160 / speed,
    yoyo: true,
    hold: 280 / speed,
    onComplete: () => aura.destroy()
  })
  for (let i = 0; i < 2; i++) {
    const ring = scene.add
      .image(x, feetY, MTEX.ripple)
      .setDepth(9)
      .setTint(0x80ed99)
      .setBlendMode(Phaser.BlendModes.ADD)
    ring.setDisplaySize(size * 0.3, size * 0.12)
    scene.tweens.add({
      targets: ring,
      displayWidth: size * 1.4,
      displayHeight: size * 0.56,
      alpha: 0,
      duration: 650 / speed,
      delay: (i * 180) / speed,
      ease: "Cubic.easeOut",
      onComplete: () => ring.destroy()
    })
  }
  const crosses = scene.add.particles(x, feetY, MTEX.plus, {
    x: { min: -size * 0.38, max: size * 0.38 },
    speedY: { min: -size * 1.9, max: -size * 0.9 },
    speedX: { min: -size * 0.15, max: size * 0.15 },
    scale: { start: 1.1, end: 0 },
    alpha: { start: 1, end: 0 },
    rotate: { min: -20, max: 20 },
    lifespan: { min: 550, max: 900 },
    tint: [0x80ed99, 0xb7f7c6, 0xffffff, 0x57cc99],
    frequency: 30 / speed,
    quantity: 1
  })
  crosses.setDepth(25)
  scene.time.delayedCall(520 / speed, () => crosses.stop())
  scene.time.delayedCall(1500 / speed, () => crosses.destroy())
}

/** Цвет стрелки баффа по стату. */
const STAT_COLOR: Record<string, number> = { hp: 0x80ed99, atk: 0xff6b6b, spd: 0x8ecae6, def: 0xffd166, res: 0xc77dff }

/**
 * Бафф/дебафф: вращающееся кольцо рун у ног и стрелки по статам (вверх цвета стата или вниз фиолетовые).
 */
export function buffRunes(
  scene: Phaser.Scene,
  x: number,
  y: number,
  size: number,
  stats: string[],
  up: boolean,
  speed: number
): void {
  if (!sceneAlive(scene)) return
  ensureMotionTextures(scene)
  const feetY = y + size * 0.3
  const color = up ? (STAT_COLOR[stats[0] ?? "atk"] ?? 0x80ed99) : 0xc77dff
  const g = scene.add.graphics().setDepth(9).setBlendMode(Phaser.BlendModes.ADD)
  g.setPosition(x, feetY)
  g.lineStyle(2.5, color, 1)
  g.strokeEllipse(0, 0, size * 0.95, size * 0.4)
  g.lineStyle(1.5, 0xffffff, 0.8)
  g.strokeEllipse(0, 0, size * 0.72, size * 0.3)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    g.fillStyle(color, 1)
    g.fillTriangle(
      Math.cos(a) * size * 0.42,
      Math.sin(a) * size * 0.17 - 3,
      Math.cos(a) * size * 0.42 - 3,
      Math.sin(a) * size * 0.17 + 2,
      Math.cos(a) * size * 0.42 + 3,
      Math.sin(a) * size * 0.17 + 2
    )
  }
  g.setScale(up ? 0.3 : 1.3).setAlpha(0)
  scene.tweens.add({ targets: g, scale: up ? 1.1 : 0.4, alpha: 1, duration: 260 / speed, ease: "Back.easeOut" })
  scene.tweens.add({ targets: g, alpha: 0, duration: 260 / speed, delay: 420 / speed, onComplete: () => g.destroy() })
  const list = stats.length > 0 ? stats.slice(0, 3) : ["atk"]
  list.forEach((s, i) => {
    const ax = x + (i - (list.length - 1) / 2) * size * 0.28
    const t = scene.add
      .text(ax, up ? y + size * 0.1 : y - size * 0.6, up ? "▲" : "▼", textStyle(size * 0.3, "#fff", true, 3))
      .setOrigin(0.5)
      .setDepth(26)
      .setTint(up ? (STAT_COLOR[s] ?? color) : 0xc77dff)
      .setAlpha(0)
    scene.tweens.add({
      targets: t,
      y: up ? y - size * 0.7 : y + size * 0.05,
      alpha: { from: 1, to: 0 },
      duration: 650 / speed,
      delay: (80 + i * 70) / speed,
      ease: "Quad.easeOut",
      onComplete: () => t.destroy()
    })
  })
}

/** Танец (Мурлыканье): ноты и сердечки по кругу, цель кружится. */
export function danceFx(
  scene: Phaser.Scene,
  x: number,
  y: number,
  size: number,
  speed: number,
  spin?: Phaser.GameObjects.Container | null
): void {
  if (!sceneAlive(scene)) return
  const symbols = ["♪", "♥", "♫", "♥", "♪", "✦"]
  const colors = ["#ffd166", "#ff6f9c", "#8ecae6", "#ff6f9c", "#ffd166", "#ffffff"]
  symbols.forEach((s, i) => {
    const t = scene.add
      .text(x, y, s, textStyle(size * 0.3, colors[i] ?? "#fff", true, 3))
      .setOrigin(0.5)
      .setDepth(26)
    const st = { a: (i / symbols.length) * Math.PI * 2, r: size * 0.15 }
    scene.tweens.add({
      targets: st,
      a: st.a + Math.PI * 2.5,
      r: size * 0.65,
      duration: 900 / speed,
      ease: "Sine.easeOut",
      onUpdate: () => {
        if (!t.scene) return
        t.setPosition(x + Math.cos(st.a) * st.r, y - size * 0.1 + Math.sin(st.a) * st.r * 0.6 - st.r * 0.4)
      },
      onComplete: () => t.destroy()
    })
    scene.tweens.add({ targets: t, alpha: 0, duration: 300 / speed, delay: 600 / speed })
  })
  if (spin?.scene) {
    scene.tweens.add({
      targets: spin,
      angle: 360,
      duration: 520 / speed,
      ease: "Cubic.easeInOut",
      onComplete: () => spin.scene && spin.setAngle(0)
    })
  }
}

/** Повышение уровня: вращающийся сноп лучей, звёзды и крупное «LV UP!». Промис — когда надпись встала. */
export async function levelUpFx(scene: Phaser.Scene, x: number, y: number, size: number, speed: number): Promise<void> {
  if (!sceneAlive(scene)) return
  ensureMotionTextures(scene)
  const rays = scene.add.container(x, y).setDepth(22)
  for (let i = 0; i < 10; i++) {
    const r = scene.add
      .image(0, 0, MTEX.ray)
      .setOrigin(0.5, 1)
      .setRotation((i / 10) * Math.PI * 2)
      .setTint(i % 2 ? 0xffd166 : 0xfff3b0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.8)
    r.setDisplaySize(size * 0.22, size * 1.2)
    rays.add(r)
  }
  rays.setScale(0.2)
  scene.tweens.add({ targets: rays, scale: 1, angle: 50, duration: 420 / speed, ease: "Cubic.easeOut" })
  scene.tweens.add({
    targets: rays,
    alpha: 0,
    duration: 320 / speed,
    delay: 420 / speed,
    onComplete: () => rays.destroy()
  })
  burstEmitter(
    scene,
    x,
    y,
    "tex_star",
    16,
    {
      speed: { min: size * 1.4, max: size * 2.8 },
      angle: { min: 0, max: 360 },
      scale: { start: 1.3, end: 0 },
      alpha: { start: 1, end: 0 },
      rotate: { min: 0, max: 360 },
      lifespan: { min: 500, max: 900 },
      gravityY: size * 1.5,
      tint: [0xffd166, 0xfff3b0, 0xffb703, 0xffffff]
    },
    26,
    950
  )
  const label = scene.add
    .text(x, y - size * 0.75, "LV UP!", {
      ...textStyle(size * 0.48, "#ffd166", true, 7),
      fontStyle: "bold italic",
      fontFamily: FONT
    })
    .setOrigin(0.5)
    .setDepth(30)
    .setScale(2.4)
    .setAlpha(0)
    .setAngle(-8)
  await tween(scene, { targets: label, scale: 1, alpha: 1, duration: 200 / speed, ease: "Back.easeOut" })
  scene.tweens.add({
    targets: label,
    y: label.y - size * 0.35,
    alpha: 0,
    duration: 520 / speed,
    delay: 380 / speed,
    onComplete: () => label.destroy()
  })
}

/** Портал подкрепления: тёмный вихрь, дым и вспышка. Промис — момент появления бойца. */
export async function portalSpawn(
  scene: Phaser.Scene,
  x: number,
  y: number,
  size: number,
  speed: number
): Promise<void> {
  if (!sceneAlive(scene)) return
  ensureMotionTextures(scene)
  const feetY = y + size * 0.3
  const portal = scene.add.graphics().setDepth(9)
  portal.setPosition(x, feetY)
  const draw = (k: number): void => {
    portal.clear()
    portal.fillStyle(0x1a0b2e, 0.9)
    portal.fillEllipse(0, 0, size * 0.9 * k, size * 0.36 * k)
    portal.lineStyle(3, 0xc77dff, 0.9)
    portal.strokeEllipse(0, 0, size * 0.9 * k, size * 0.36 * k)
    portal.lineStyle(1.5, 0xe63946, 0.8)
    portal.strokeEllipse(0, 0, size * 0.6 * k, size * 0.24 * k)
  }
  const st = { k: 0.1 }
  draw(st.k)
  await tween(scene, { targets: st, k: 1, duration: 260 / speed, ease: "Back.easeOut", onUpdate: () => draw(st.k) })
  burstEmitter(
    scene,
    x,
    feetY,
    "tex_dot",
    14,
    {
      speed: { min: size * 0.3, max: size * 0.9 },
      angle: { min: 200, max: 340 },
      scale: { start: 1.6, end: 2.6 },
      alpha: { start: 0.55, end: 0 },
      lifespan: { min: 500, max: 900 },
      tint: [0x3c2a4d, 0x6c567b, 0x1a0b2e]
    },
    24,
    950
  )
  const flash = scene.add.image(x, y, MTEX.glow).setDepth(26).setTint(0xc77dff).setBlendMode(Phaser.BlendModes.ADD)
  flash.setDisplaySize(size * 0.5, size * 0.5)
  scene.tweens.add({
    targets: flash,
    displayWidth: size * 1.6,
    displayHeight: size * 1.6,
    alpha: 0,
    duration: 380 / speed,
    onComplete: () => flash.destroy()
  })
  scene.tweens.add({
    targets: st,
    k: 0,
    duration: 360 / speed,
    delay: 360 / speed,
    ease: "Quad.easeIn",
    onUpdate: () => portal.scene && draw(st.k),
    onComplete: () => portal.destroy()
  })
}

/**
 * Кат-ин спецприёма на карте: тёмная подложка, косая полоса цвета оружия, имя спецприёма, вспышка.
 * Промис — когда кат-ин ушёл.
 */
export async function specialCutIn(
  scene: Phaser.Scene,
  name: string,
  color: number,
  fromLeft: boolean,
  speed: number,
  portraitKey?: string
): Promise<void> {
  if (!sceneAlive(scene)) return
  ensureMotionTextures(scene)
  const w = scene.scale.width
  const h = scene.scale.height
  // Экранные координаты: объекты не двигаются вместе с камерой карты
  const dim = scene.add
    .rectangle(w / 2, h / 2, w * 3, h * 3, 0x000000, 0)
    .setDepth(40)
    .setScrollFactor(0)
  const bandH = Math.min(h * 0.2, 150)
  const band = scene.add
    .container(fromLeft ? -w : w * 2, h * 0.42)
    .setDepth(41)
    .setScrollFactor(0)
  const g = scene.add.graphics()
  const skew = bandH * 0.4
  g.fillStyle(0x0d0b10, 0.95)
  g.fillPoints(
    [
      { x: -w * 0.7 + skew, y: -bandH / 2 },
      { x: w * 0.7 + skew, y: -bandH / 2 },
      { x: w * 0.7 - skew, y: bandH / 2 },
      { x: -w * 0.7 - skew, y: bandH / 2 }
    ],
    true
  )
  g.fillStyle(color, 1)
  g.fillPoints(
    [
      { x: -w * 0.7 + skew, y: -bandH / 2 },
      { x: w * 0.7 + skew, y: -bandH / 2 },
      { x: w * 0.7 + skew - 8, y: -bandH / 2 + 8 },
      { x: -w * 0.7 + skew - 8, y: -bandH / 2 + 8 }
    ],
    true
  )
  g.fillStyle(0xe63946, 1)
  g.fillPoints(
    [
      { x: -w * 0.7 - skew + 8, y: bandH / 2 - 8 },
      { x: w * 0.7 - skew + 8, y: bandH / 2 - 8 },
      { x: w * 0.7 - skew, y: bandH / 2 },
      { x: -w * 0.7 - skew, y: bandH / 2 }
    ],
    true
  )
  band.add(g)
  if (portraitKey && scene.textures.exists(portraitKey)) {
    const p = scene.add.image(fromLeft ? -w * 0.28 : w * 0.28, bandH * 0.05, portraitKey).setFlipX(!fromLeft)
    p.setDisplaySize(bandH * 1.25 * (120 / 140), bandH * 1.25)
    band.add(p)
  }
  const label = scene.add
    .text(fromLeft ? w * 0.1 : -w * 0.1, 0, name.toUpperCase(), {
      fontFamily: FONT,
      fontSize: `${Math.round(Math.min(30, w * 0.075))}px`,
      color: "#ffffff",
      fontStyle: "bold italic",
      stroke: "#000000",
      strokeThickness: 6
    })
    .setOrigin(0.5)
  band.add(label)
  const flash = scene.add
    .rectangle(w / 2, h / 2, w, h, 0xffffff, 0)
    .setDepth(43)
    .setScrollFactor(0)
  speedLines(scene, w / 2, h * 0.42, w, bandH * 1.6, fromLeft ? 1 : -1, speed, 14, 42)
  scene.tweens.add({ targets: dim, fillAlpha: 0.55, duration: 120 / speed })
  await tween(scene, { targets: band, x: w / 2, duration: 170 / speed, ease: "Cubic.easeOut" })
  flash.setFillStyle(0xffffff, 0.5 * shakeMul())
  scene.tweens.add({ targets: flash, fillAlpha: 0, duration: 200 / speed })
  scene.tweens.add({ targets: label, scale: { from: 1.25, to: 1 }, duration: 160 / speed, ease: "Back.easeOut" })
  await wait(scene, 380 / speed)
  scene.tweens.add({ targets: dim, fillAlpha: 0, duration: 140 / speed })
  await tween(scene, { targets: band, x: fromLeft ? w * 2 : -w, duration: 150 / speed, ease: "Cubic.easeIn" })
  band.destroy()
  dim.destroy()
  flash.destroy()
}

/** «×2» над атакующим: двойная атака. */
export function doubleStrikeMark(scene: Phaser.Scene, x: number, y: number, size: number, speed: number): void {
  if (!sceneAlive(scene)) return
  const t = scene.add
    .text(x, y, "×2", { ...textStyle(size * 0.36, "#ffd166", true, 6), fontStyle: "bold italic", fontFamily: FONT })
    .setOrigin(0.5)
    .setDepth(30)
    .setScale(2)
    .setAngle(-10)
  scene.tweens.add({ targets: t, scale: 1, duration: 140 / speed, ease: "Back.easeOut" })
  scene.tweens.add({
    targets: t,
    y: y - size * 0.4,
    alpha: 0,
    duration: 420 / speed,
    delay: 300 / speed,
    onComplete: () => t.destroy()
  })
}

/**
 * Крупная цифра урона: «прыгает» с перебором масштаба, наклоном и толстой обводкой, затем падает и тает.
 */
export function bigNumber(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  color: string,
  px: number,
  speed: number,
  opts: { crit?: boolean, depth?: number } = {}
): void {
  if (!sceneAlive(scene)) return
  const style = {
    ...textStyle(px, color, true, Math.max(5, Math.round(px * 0.18))),
    fontStyle: "bold italic",
    fontFamily: FONT
  }
  const back = scene.add
    .text(x + 3, y + 4, text, { ...style, color: "#000000", stroke: "#000000" })
    .setOrigin(0.5)
    .setAlpha(0.5)
  const t = scene.add.text(x, y, text, style).setOrigin(0.5)
  const depth = opts.depth ?? 30
  back.setDepth(depth)
  t.setDepth(depth + 0.1)
  const angle = (Math.random() - 0.5) * 16
  for (const o of [t, back]) o.setScale(0.2).setAngle(angle)
  scene.tweens.add({ targets: [t, back], scale: opts.crit ? 1.35 : 1.15, duration: 110 / speed, ease: "Back.easeOut" })
  scene.tweens.add({ targets: [t, back], scale: 1, duration: 120 / speed, delay: 110 / speed })
  scene.tweens.add({ targets: [t, back], y: `-=${px * 0.9}`, duration: 260 / speed, ease: "Quad.easeOut" })
  scene.tweens.add({
    targets: [t, back],
    y: `+=${px * 0.35}`,
    duration: 220 / speed,
    delay: 260 / speed,
    ease: "Bounce.easeOut"
  })
  if (opts.crit)
    scene.tweens.add({ targets: t, x: x + 4, duration: 35 / speed, yoyo: true, repeat: 5, delay: 120 / speed })
  scene.tweens.add({
    targets: [t, back],
    alpha: 0,
    duration: 260 / speed,
    delay: 720 / speed,
    onComplete: () => {
      t.destroy()
      back.destroy()
    }
  })
}
