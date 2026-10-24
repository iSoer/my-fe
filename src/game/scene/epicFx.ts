import Phaser from "phaser"
import { TEX } from "./textures"
import { MTEX, ensureMotionTextures, reducedMotion, shakeCam, shockRing } from "./motionFx"
import { sceneAlive, wait } from "./fx"

/**
 * Зрелищные эффекты атак: огненный шар, молния с неба, столб святого света, аура перед спецприёмом и финальный
 * взрыв спецприёма. Только презентация: размеры — в долях `size` (высота бойца в кинематике или клетка на карте),
 * длительности делятся на `speed`.
 */

interface Pt {
  x: number
  y: number
}

function later(scene: Phaser.Scene, ms: number, fn: () => void): void {
  scene.time.delayedCall(ms, () => {
    if (sceneAlive(scene)) fn()
  })
}

/** Мягкое свечение (ADD), растёт от `from` до `to` и тает. */
function bloom(scene: Phaser.Scene, x: number, y: number, from: number, to: number, color: number, ms: number, alpha = 1): void {
  const g = scene.add.image(x, y, MTEX.glow).setDepth(28).setTint(color).setBlendMode(Phaser.BlendModes.ADD).setAlpha(alpha)
  g.setDisplaySize(from, from)
  scene.tweens.add({
    targets: g,
    displayWidth: to,
    displayHeight: to,
    alpha: 0,
    duration: ms,
    ease: "Cubic.easeOut",
    onComplete: () => g.destroy()
  })
}

/** Разовый выброс частиц: после `ttl` эмиттер убирается сам. */
function spray(
  scene: Phaser.Scene,
  x: number,
  y: number,
  texture: string,
  cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig,
  count: number,
  ttl: number,
  depth = 27
): void {
  if (count <= 0) return
  const e = scene.add.particles(x, y, texture, { ...cfg, emitting: false })
  e.setDepth(depth)
  e.explode(count)
  later(scene, ttl, () => e.destroy())
}

/** Вспышка всего экрана (не при «уменьшить движение»). */
function screenFlash(scene: Phaser.Scene, ms: number, r: number, g: number, b: number): void {
  if (reducedMotion()) return
  scene.cameras.main.flash(ms, r, g, b, false)
}

/* ---------- Огонь ---------- */

/** Огненный шар по дуге с хвостом пламени; на месте — взрыв. Промис — момент попадания. */
export function fireball(scene: Phaser.Scene, from: Pt, to: Pt, size: number, speed: number): Promise<void> {
  if (!sceneAlive(scene)) return Promise.resolve()
  ensureMotionTextures(scene)
  const orb = scene.add.image(from.x, from.y, MTEX.glow).setDepth(27).setTint(0xff7a1a).setBlendMode(Phaser.BlendModes.ADD)
  orb.setDisplaySize(size * 0.55, size * 0.55)
  const core = scene.add.image(from.x, from.y, MTEX.glow).setDepth(28).setTint(0xfff0a0).setBlendMode(Phaser.BlendModes.ADD)
  core.setDisplaySize(size * 0.24, size * 0.24)
  const trail = scene.add.particles(0, 0, MTEX.glow, {
    lifespan: 380 / speed,
    speed: { min: size * 0.1, max: size * 0.5 },
    scale: { start: (size * 0.42) / 64, end: 0 },
    alpha: { start: 0.9, end: 0 },
    color: [0xfff3b0, 0xffb703, 0xff5a1f, 0x7a1a10],
    blendMode: "ADD",
    frequency: 14 / speed
  })
  trail.setDepth(26)
  trail.startFollow(orb)
  // Вспышка у руки: заклинание сорвалось
  bloom(scene, from.x, from.y, size * 0.2, size * 0.8, 0xffb703, 220 / speed)
  return new Promise((resolve) => {
    const st = { t: 0 }
    const dist = Math.hypot(to.x - from.x, to.y - from.y)
    scene.tweens.add({
      targets: st,
      t: 1,
      duration: Math.max(180, Math.min(420, dist * 1.1)) / speed,
      ease: "Quad.easeIn",
      onUpdate: () => {
        const x = from.x + (to.x - from.x) * st.t
        const y = from.y + (to.y - from.y) * st.t - Math.sin(st.t * Math.PI) * size * 0.28
        orb.setPosition(x, y).setAngle(st.t * 540)
        core.setPosition(x, y)
      },
      onComplete: () => {
        orb.destroy()
        core.destroy()
        trail.stop()
        later(scene, 420 / speed, () => trail.destroy())
        if (sceneAlive(scene)) fireBurst(scene, to.x, to.y, size, speed)
        resolve()
      }
    })
  })
}

/** Взрыв пламени: белая вспышка, языки огня во все стороны, искры-угольки вверх, клубы дыма. */
export function fireBurst(scene: Phaser.Scene, x: number, y: number, size: number, speed: number): void {
  if (!sceneAlive(scene)) return
  ensureMotionTextures(scene)
  bloom(scene, x, y, size * 0.3, size * 0.9, 0xffffff, 160 / speed)
  bloom(scene, x, y, size * 0.4, size * 1.6, 0xff7a1a, 420 / speed, 0.9)
  spray(scene, x, y, MTEX.glow, {
    lifespan: 460 / speed,
    speed: { min: size * 0.9, max: size * 2.2 },
    angle: { min: 0, max: 360 },
    scale: { start: (size * 0.36) / 64, end: 0 },
    alpha: { start: 1, end: 0 },
    color: [0xfff3b0, 0xffb703, 0xe63946, 0x3a120a],
    blendMode: "ADD",
    gravityY: -size * 1.6
  }, 22, 600 / speed)
  spray(scene, x, y, TEX.dot, {
    lifespan: { min: 600 / speed, max: 1100 / speed },
    speed: { min: size * 0.6, max: size * 1.6 },
    angle: { min: 200, max: 340 },
    scale: { start: (size * 0.05) / 8, end: 0 },
    tint: [0xffd166, 0xff9f1c, 0xfff3b0],
    blendMode: "ADD",
    gravityY: size * 0.9
  }, 14, 1200 / speed, 28)
  for (let i = 0; i < 4; i++) {
    const puff = scene.add.image(x + (Math.random() - 0.5) * size * 0.4, y, MTEX.glow).setDepth(26).setTint(0x3a3438).setAlpha(0.55)
    puff.setDisplaySize(size * 0.3, size * 0.3)
    scene.tweens.add({
      targets: puff,
      y: y - size * (0.4 + Math.random() * 0.4),
      displayWidth: size * 0.8,
      displayHeight: size * 0.8,
      alpha: 0,
      delay: (80 + i * 50) / speed,
      duration: 700 / speed,
      ease: "Sine.easeOut",
      onComplete: () => puff.destroy()
    })
  }
  shakeCam(scene, 180 / speed, 7)
}

/* ---------- Молния ---------- */

/** Зубчатая ломаная от a к b: `n` отрезков, отклонение — до `jag`. */
function jagged(a: Pt, b: Pt, n: number, jag: number): Pt[] {
  const pts: Pt[] = [a]
  const nx = -(b.y - a.y)
  const ny = b.x - a.x
  const len = Math.hypot(nx, ny) || 1
  for (let i = 1; i < n; i++) {
    const t = i / n
    const off = (Math.random() - 0.5) * 2 * jag * Math.sin(t * Math.PI)
    pts.push({ x: a.x + (b.x - a.x) * t + (nx / len) * off, y: a.y + (b.y - a.y) * t + (ny / len) * off })
  }
  pts.push(b)
  return pts
}

function strokeBolt(g: Phaser.GameObjects.Graphics, pts: Pt[], width: number): void {
  g.lineStyle(width * 2.6, 0x4cc9f0, 0.35)
  g.strokePoints(pts, false)
  g.lineStyle(width * 1.4, 0x9be7ff, 0.8)
  g.strokePoints(pts, false)
  g.lineStyle(width * 0.6, 0xffffff, 1)
  g.strokePoints(pts, false)
}

/** Мерцание «вкл-выкл-вкл» и угасание — как настоящий разряд. */
const flickerEase = (t: number): number => (t < 0.15 ? 0 : t < 0.28 ? 0.75 : t < 0.4 ? 0.15 : t)

/**
 * Молния с неба: экран вспыхивает, зубчатый разряд с ответвлениями бьёт в цель, мерцает; на месте — искры,
 * голубое кольцо и мелкие дуги вокруг цели. Промис — момент удара.
 */
export function lightningStrike(scene: Phaser.Scene, x: number, y: number, size: number, speed: number): Promise<void> {
  if (!sceneAlive(scene)) return Promise.resolve()
  ensureMotionTextures(scene)
  const top = { x: x + (Math.random() - 0.5) * size * 0.6, y: y - size * 2.8 }
  const g = scene.add.graphics().setDepth(29).setBlendMode(Phaser.BlendModes.ADD)
  const main = jagged(top, { x, y }, 10, size * 0.22)
  strokeBolt(g, main, Math.max(2, size * 0.035))
  for (let k = 0; k < 2; k++) {
    const from = main[3 + k * 3] as Pt
    const end = { x: from.x + (Math.random() - 0.5) * size * 1.2, y: from.y + size * (0.4 + Math.random() * 0.4) }
    strokeBolt(g, jagged(from, end, 5, size * 0.12), Math.max(1, size * 0.018))
  }
  screenFlash(scene, 90 / speed, 210, 235, 255)
  scene.tweens.add({ targets: g, alpha: { from: 1, to: 0 }, duration: 360 / speed, ease: flickerEase, onComplete: () => g.destroy() })
  bloom(scene, x, y, size * 0.3, size * 1.4, 0x9be7ff, 320 / speed)
  bloom(scene, x, y, size * 0.2, size * 0.7, 0xffffff, 140 / speed)
  shockRing(scene, x, y + size * 0.3, size * 0.9, speed, 0x4cc9f0)
  spray(scene, x, y, TEX.dot, {
    lifespan: 380 / speed,
    speed: { min: size * 1.2, max: size * 3 },
    angle: { min: 0, max: 360 },
    scale: { start: (size * 0.05) / 8, end: 0 },
    tint: [0xffffff, 0x9be7ff, 0x4cc9f0],
    blendMode: "ADD"
  }, 18, 500 / speed, 29)
  // Остаточные дуги вокруг цели
  for (let i = 0; i < 3; i++) {
    later(scene, (90 + i * 70) / speed, () => {
      const a = Math.random() * Math.PI * 2
      const r = size * 0.35
      const arc = scene.add.graphics().setDepth(29).setBlendMode(Phaser.BlendModes.ADD)
      const p0 = { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.8 }
      const p1 = { x: x + Math.cos(a + 1.2) * r, y: y + Math.sin(a + 1.2) * r * 0.8 }
      strokeBolt(arc, jagged(p0, p1, 4, size * 0.1), Math.max(1, size * 0.014))
      scene.tweens.add({ targets: arc, alpha: { from: 1, to: 0 }, duration: 200 / speed, ease: flickerEase, onComplete: () => arc.destroy() })
    })
  }
  shakeCam(scene, 200 / speed, 8)
  return wait(scene, 50 / speed)
}

/* ---------- Святой свет ---------- */

/**
 * Столб святого света с неба: широкий золотой луч и белая сердцевина, нимб-эллипс у ног, перья и искорки.
 * Промис — момент, когда свет достиг цели.
 */
export function holyPillar(scene: Phaser.Scene, x: number, groundY: number, size: number, speed: number): Promise<void> {
  if (!sceneAlive(scene)) return Promise.resolve()
  ensureMotionTextures(scene)
  const h = size * 2.8
  const beam = scene.add.image(x, groundY, MTEX.ray).setOrigin(0.5, 1).setDepth(26).setTint(0xffe8a3).setBlendMode(Phaser.BlendModes.ADD)
  beam.setDisplaySize(size * 0.1, h).setAlpha(0)
  const core = scene.add.image(x, groundY, MTEX.ray).setOrigin(0.5, 1).setDepth(27).setTint(0xffffff).setBlendMode(Phaser.BlendModes.ADD)
  core.setDisplaySize(size * 0.04, h).setAlpha(0)
  scene.tweens.add({ targets: beam, alpha: 1, displayWidth: size * 0.6, duration: 140 / speed, ease: "Cubic.easeOut" })
  scene.tweens.add({ targets: core, alpha: 1, displayWidth: size * 0.18, duration: 140 / speed, ease: "Cubic.easeOut" })
  scene.tweens.add({
    targets: [beam, core],
    alpha: 0,
    displayWidth: size * 0.05,
    delay: 360 / speed,
    duration: 320 / speed,
    ease: "Sine.easeIn",
    onComplete: () => {
      beam.destroy()
      core.destroy()
    }
  })
  const halo = scene.add.image(x, groundY, TEX.ring).setDepth(25).setTint(0xffd166).setBlendMode(Phaser.BlendModes.ADD)
  halo.setDisplaySize(size * 0.3, size * 0.1)
  scene.tweens.add({
    targets: halo,
    displayWidth: size * 1.4,
    displayHeight: size * 0.42,
    alpha: { from: 1, to: 0 },
    duration: 620 / speed,
    ease: "Cubic.easeOut",
    onComplete: () => halo.destroy()
  })
  spray(scene, x, groundY - h * 0.8, MTEX.leaf, {
    lifespan: 900 / speed,
    speedX: { min: -size * 0.4, max: size * 0.4 },
    speedY: { min: size * 0.2, max: size * 0.6 },
    rotate: { min: 0, max: 360 },
    scale: { start: (size * 0.12) / 16, end: (size * 0.06) / 16 },
    alpha: { start: 1, end: 0 },
    tint: 0xffffff,
    gravityY: size * 0.5
  }, 8, 1000 / speed)
  spray(scene, x, groundY - size * 0.4, TEX.star, {
    lifespan: 700 / speed,
    speed: { min: size * 0.2, max: size * 0.9 },
    angle: { min: 200, max: 340 },
    scale: { start: (size * 0.08) / 16, end: 0 },
    tint: [0xffffff, 0xffe8a3],
    blendMode: "ADD"
  }, 10, 800 / speed, 28)
  return wait(scene, 150 / speed)
}

/* ---------- Спецприём ---------- */

/**
 * Аура перед спецприёмом: кольцо под ногами схлопывается, вверх рвутся языки энергии цвета оружия, вспышка.
 * Промис — готов к удару.
 */
export function specialAura(scene: Phaser.Scene, x: number, groundY: number, size: number, color: number, speed: number): Promise<void> {
  if (!sceneAlive(scene)) return Promise.resolve()
  ensureMotionTextures(scene)
  const ring = scene.add.image(x, groundY, TEX.ring).setDepth(25).setTint(color).setBlendMode(Phaser.BlendModes.ADD)
  ring.setDisplaySize(size * 1.6, size * 0.5)
  scene.tweens.add({
    targets: ring,
    displayWidth: size * 0.5,
    displayHeight: size * 0.15,
    alpha: { from: 0.2, to: 1 },
    duration: 300 / speed,
    ease: "Cubic.easeIn",
    onComplete: () => ring.destroy()
  })
  const flames = scene.add.particles(x, groundY, MTEX.glow, {
    lifespan: 420 / speed,
    speedY: { min: -size * 1.8, max: -size * 0.8 },
    speedX: { min: -size * 0.2, max: size * 0.2 },
    x: { min: -size * 0.3, max: size * 0.3 },
    scale: { start: (size * 0.22) / 64, end: 0 },
    alpha: { start: 0.9, end: 0 },
    color: [0xffffff, color, color],
    blendMode: "ADD",
    frequency: 18 / speed
  })
  flames.setDepth(26)
  later(scene, 320 / speed, () => {
    flames.stop()
    bloom(scene, x, groundY - size * 0.45, size * 0.3, size * 1.3, color, 260 / speed)
    later(scene, 450 / speed, () => flames.destroy())
  })
  return wait(scene, 340 / speed)
}

/**
 * Финальный взрыв спецприёма на цели: вспышка экрана, лучи во все стороны, двойная ударная волна, тряска.
 */
export function finisherBurst(scene: Phaser.Scene, x: number, y: number, size: number, color: number, speed: number): void {
  if (!sceneAlive(scene)) return
  ensureMotionTextures(scene)
  screenFlash(scene, 110 / speed, 255, 245, 220)
  bloom(scene, x, y, size * 0.4, size * 2, color, 420 / speed, 0.9)
  bloom(scene, x, y, size * 0.2, size * 0.9, 0xffffff, 180 / speed)
  const rays = 12
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2 + Math.random() * 0.2
    const ray = scene.add.image(x, y, MTEX.streak).setDepth(28).setTint(i % 2 ? 0xffffff : color).setBlendMode(Phaser.BlendModes.ADD)
    ray.setRotation(a).setOrigin(0, 0.5).setDisplaySize(size * 0.2, Math.max(2, size * 0.05))
    scene.tweens.add({
      targets: ray,
      displayWidth: size * (1.1 + Math.random() * 0.6),
      alpha: { from: 1, to: 0 },
      duration: 360 / speed,
      ease: "Cubic.easeOut",
      onComplete: () => ray.destroy()
    })
  }
  shockRing(scene, x, y, size * 1.3, speed, color)
  later(scene, 90 / speed, () => shockRing(scene, x, y, size * 0.9, speed, 0xffffff))
  shakeCam(scene, 260 / speed, 12)
}
