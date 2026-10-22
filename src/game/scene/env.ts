import Phaser from "phaser"
import type { TerrainId } from "@game/core/types"
import { TILE_FRAME_COUNT, TILE_VARIANTS, groundSvg, tileEdgeSvg, tileSvg, type TileEdgeKind } from "@game/art/tile"
import { ensureTexture, hasTexture, TERRAINS, TILE_TEX_PX } from "./svgTextures"
import { sceneAlive } from "./fx"

/**
 * Текстуры и эффекты окружения поля: варианты тайлов, накладки краёв (берег, тень, обломки),
 * мягкие канвас-текстуры для подсветки клеток, облаков-теней, лучей света, виньетки и светлячков.
 */

export const ENV = {
  glowTile: "env_glow_tile",
  targetTile: "env_target_tile",
  hatch: "env_hatch",
  paw: "env_paw",
  cloud: "env_cloud",
  beam: "env_beam",
  vignette: "env_vignette",
  light: "env_light",
  soft: "env_soft",
  chip: "env_chip",
  boardShadow: "env_board_shadow"
} as const

/* ---------- Тайлы: варианты и края ---------- */

export function tileVariantCount(terrain: TerrainId): number {
  return TILE_VARIANTS[terrain] ?? 1
}

export function envTileKey(biomeId: string, terrain: TerrainId, frame: number, variant: number): string {
  return `tilev:${biomeId}:${terrain}:${frame}:${variant}`
}

export const SHORE_FRAMES = 2

export function groundKey(biomeId: string): string {
  return `tileg:${biomeId}`
}

export function edgeKey(biomeId: string, kind: TileEdgeKind, frame = 0): string {
  return `tilee:${biomeId}:${kind}:${frame}`
}

/** Вариант оформления клетки — детерминированно от координат и seed карты. */
export function tileVariantAt(terrain: TerrainId, x: number, y: number, seed: number): number {
  const n = tileVariantCount(terrain)
  return n <= 1 ? 0 : Math.abs((x * 92821) ^ (y * 68917) ^ (seed * 31)) % n
}

/** Все кадры и варианты тайлов биома и накладки краёв (≈ 25 растеризаций на биом, один раз). */
export function ensureEnvTileTextures(scene: Phaser.Scene, biomeId: string): Promise<string[]> {
  const jobs: Promise<string>[] = []
  for (const t of TERRAINS) {
    const frames = TILE_FRAME_COUNT[t] ?? 1
    const variants = tileVariantCount(t)
    for (let v = 0; v < variants; v++) {
      for (let f = 0; f < frames; f++) {
        jobs.push(
          ensureTexture(scene, envTileKey(biomeId, t, f, v), tileSvg(biomeId, t, f, v), TILE_TEX_PX, TILE_TEX_PX)
        )
      }
    }
  }
  for (let f = 0; f < SHORE_FRAMES; f++)
    jobs.push(ensureTexture(scene, edgeKey(biomeId, "shore", f), tileEdgeSvg(biomeId, "shore", f), 128, 128))
  jobs.push(ensureTexture(scene, edgeKey(biomeId, "shade"), tileEdgeSvg(biomeId, "shade"), 64, 64))
  jobs.push(ensureTexture(scene, edgeKey(biomeId, "rubble"), tileEdgeSvg(biomeId, "rubble"), 128, 128))
  jobs.push(ensureTexture(scene, groundKey(biomeId), groundSvg(biomeId), 128, 128))
  return Promise.all(jobs)
}

/* ---------- Канвас-текстуры ---------- */

function canvasTexture(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D) => void
): void {
  if (scene.textures.exists(key)) return
  const tex = scene.textures.createCanvas(key, w, h)
  if (!tex) return
  const ctx = tex.getContext()
  draw(ctx)
  tex.refresh()
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Белые (под тинт) мягкие текстуры окружения. Рисуются один раз на игру. */
export function ensureEnvTextures(scene: Phaser.Scene): void {
  // Светящаяся клетка: мягкая заливка, яркая внутренняя кромка и свечение у краёв
  canvasTexture(scene, ENV.glowTile, 64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 6, 32, 32, 44)
    g.addColorStop(0, "rgba(255,255,255,0.35)")
    g.addColorStop(1, "rgba(255,255,255,0.85)")
    ctx.fillStyle = g
    roundRect(ctx, 3, 3, 58, 58, 9)
    ctx.fill()
    ctx.lineWidth = 3
    ctx.strokeStyle = "rgba(255,255,255,1)"
    roundRect(ctx, 4.5, 4.5, 55, 55, 8)
    ctx.stroke()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = "rgba(255,255,255,0.7)"
    roundRect(ctx, 9, 9, 46, 46, 6)
    ctx.stroke()
  })
  // Клетка-цель: то же свечение плюс уголки прицела внутри
  canvasTexture(scene, ENV.targetTile, 64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 44)
    g.addColorStop(0, "rgba(255,255,255,0.2)")
    g.addColorStop(1, "rgba(255,255,255,0.9)")
    ctx.fillStyle = g
    roundRect(ctx, 3, 3, 58, 58, 9)
    ctx.fill()
    ctx.strokeStyle = "rgba(255,255,255,1)"
    ctx.lineWidth = 4
    ctx.lineCap = "round"
    const c = 14
    const p = 10
    ctx.beginPath()
    ctx.moveTo(p, p + c)
    ctx.lineTo(p, p)
    ctx.lineTo(p + c, p)
    ctx.moveTo(64 - p - c, p)
    ctx.lineTo(64 - p, p)
    ctx.lineTo(64 - p, p + c)
    ctx.moveTo(64 - p, 64 - p - c)
    ctx.lineTo(64 - p, 64 - p)
    ctx.lineTo(64 - p - c, 64 - p)
    ctx.moveTo(p + c, 64 - p)
    ctx.lineTo(p, 64 - p)
    ctx.lineTo(p, 64 - p - c)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(32, 32, 4, 0, Math.PI * 2)
    ctx.fillStyle = "rgba(255,255,255,0.9)"
    ctx.fill()
  })
  // Диагональная штриховка зоны опасности (бесшовная плитка 32×32 для TileSprite)
  canvasTexture(scene, ENV.hatch, 32, 32, (ctx) => {
    ctx.fillStyle = "rgba(255,255,255,0.28)"
    ctx.fillRect(0, 0, 32, 32)
    ctx.strokeStyle = "rgba(255,255,255,0.9)"
    ctx.lineWidth = 5
    for (let d = -32; d <= 64; d += 16) {
      ctx.beginPath()
      ctx.moveTo(d, 32)
      ctx.lineTo(d + 32, 0)
      ctx.stroke()
    }
  })
  // След лапы
  canvasTexture(scene, ENV.paw, 32, 32, (ctx) => {
    ctx.fillStyle = "#ffffff"
    ctx.beginPath()
    ctx.ellipse(16, 21, 7, 6, 0, 0, Math.PI * 2)
    ctx.fill()
    for (const [x, y] of [
      [8, 12],
      [13.5, 8],
      [18.5, 8],
      [24, 12]
    ] as const) {
      ctx.beginPath()
      ctx.ellipse(x, y, 2.8, 3.4, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  })
  // Тень облака: мягкое пятно из нескольких радиальных градиентов
  canvasTexture(scene, ENV.cloud, 256, 160, (ctx) => {
    const blobs: [number, number, number][] = [
      [90, 80, 70],
      [150, 70, 64],
      [190, 95, 50],
      [60, 100, 46],
      [130, 105, 56]
    ]
    for (const [x, y, r] of blobs) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r)
      g.addColorStop(0, "rgba(255,255,255,0.55)")
      g.addColorStop(1, "rgba(255,255,255,0)")
      ctx.fillStyle = g
      ctx.fillRect(0, 0, 256, 160)
    }
  })
  // Луч света: вертикальная полоса, мягкая по краям и затухающая книзу
  canvasTexture(scene, ENV.beam, 64, 256, (ctx) => {
    const h = ctx.createLinearGradient(0, 0, 64, 0)
    h.addColorStop(0, "rgba(255,255,255,0)")
    h.addColorStop(0.5, "rgba(255,255,255,1)")
    h.addColorStop(1, "rgba(255,255,255,0)")
    ctx.fillStyle = h
    ctx.fillRect(0, 0, 64, 256)
    ctx.globalCompositeOperation = "destination-in"
    const v = ctx.createLinearGradient(0, 0, 0, 256)
    v.addColorStop(0, "rgba(0,0,0,1)")
    v.addColorStop(1, "rgba(0,0,0,0)")
    ctx.fillStyle = v
    ctx.fillRect(0, 0, 64, 256)
  })
  // Виньетка: прозрачный центр, тёмные края
  canvasTexture(scene, ENV.vignette, 256, 256, (ctx) => {
    const g = ctx.createRadialGradient(128, 128, 70, 128, 128, 182)
    g.addColorStop(0, "rgba(0,0,0,0)")
    g.addColorStop(1, "rgba(0,0,0,1)")
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 256, 256)
  })
  // Мягкий свет (лампа, светлячок, свечение)
  canvasTexture(scene, ENV.light, 128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
    g.addColorStop(0, "rgba(255,255,255,1)")
    g.addColorStop(0.35, "rgba(255,255,255,0.45)")
    g.addColorStop(1, "rgba(255,255,255,0)")
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 128, 128)
  })
  // Пыль: мягкое пятно
  canvasTexture(scene, ENV.soft, 64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    g.addColorStop(0, "rgba(255,255,255,0.9)")
    g.addColorStop(1, "rgba(255,255,255,0)")
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 64, 64)
  })
  // Осколок: неровный многоугольник с бликом
  canvasTexture(scene, ENV.chip, 16, 16, (ctx) => {
    ctx.fillStyle = "#ffffff"
    ctx.beginPath()
    ctx.moveTo(2, 5)
    ctx.lineTo(9, 1)
    ctx.lineTo(15, 6)
    ctx.lineTo(12, 14)
    ctx.lineTo(4, 13)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = "rgba(0,0,0,0.25)"
    ctx.beginPath()
    ctx.moveTo(12, 14)
    ctx.lineTo(15, 6)
    ctx.lineTo(10, 9)
    ctx.closePath()
    ctx.fill()
  })
  // Тень под полем: размытый прямоугольник
  canvasTexture(scene, ENV.boardShadow, 128, 160, (ctx) => {
    // Размытие через тень (ctx.filter есть не во всех WebView): сам прямоугольник рисуется за кадром
    ctx.shadowColor = "rgba(0,0,0,0.9)"
    ctx.shadowBlur = 14
    ctx.shadowOffsetX = 1000
    ctx.fillStyle = "#000"
    ctx.fillRect(18 - 1000, 18, 92, 124)
  })
}

/* ---------- Удары по стене ---------- */

/** Пыль, крошка и осколки от удара по хлипкой стене; `destroyed` — крупный обвал. */
export function wallImpactFx(
  scene: Phaser.Scene,
  x: number,
  y: number,
  size: number,
  color: number,
  destroyed: boolean,
  speed = 1
): void {
  if (!sceneAlive(scene) || !hasTexture(scene, ENV.chip)) return
  const dust = destroyed ? 7 : 3
  for (let i = 0; i < dust; i++) {
    const d = scene.add
      .image(x + (Math.random() - 0.5) * size * 0.5, y + (Math.random() - 0.2) * size * 0.4, ENV.soft)
      .setTint(Phaser.Display.Color.ValueToColor(color).lighten(25).color)
      .setAlpha(0.75)
      .setDepth(8)
      .setScale((size / 64) * (0.6 + Math.random() * 0.5))
    scene.tweens.add({
      targets: d,
      x: d.x + (Math.random() - 0.5) * size * 0.8,
      y: d.y - size * (0.2 + Math.random() * 0.3),
      scale: d.scale * (destroyed ? 3.2 : 2.2),
      alpha: 0,
      duration: (destroyed ? 1100 : 700) / speed,
      ease: "Quad.easeOut",
      onComplete: () => d.destroy()
    })
  }
  const chips = destroyed ? 16 : 7
  for (let i = 0; i < chips; i++) {
    const s = (size / 64) * (destroyed ? 0.9 + Math.random() * 0.9 : 0.5 + Math.random() * 0.5)
    const c = scene.add
      .image(x + (Math.random() - 0.5) * size * 0.3, y - size * 0.1, ENV.chip)
      .setTint(Phaser.Display.Color.ValueToColor(color).darken(Math.random() * 30).color)
      .setScale(s)
      .setAngle(Math.random() * 360)
      .setDepth(8.5)
    const dx = (Math.random() - 0.5) * size * (destroyed ? 2 : 1.2)
    const up = size * (0.25 + Math.random() * 0.5)
    const fall = size * (0.25 + Math.random() * 0.35)
    const dur = (450 + Math.random() * 300) / speed
    scene.tweens.add({ targets: c, x: c.x + dx, angle: c.angle + (Math.random() - 0.5) * 540, duration: dur })
    scene.tweens.add({
      targets: c,
      y: c.y - up,
      duration: dur * 0.4,
      ease: "Quad.easeOut",
      onComplete: () => {
        scene.tweens.add({
          targets: c,
          y: c.y + up + fall,
          duration: dur * 0.6,
          ease: "Quad.easeIn",
          onComplete: () => {
            scene.tweens.add({ targets: c, alpha: 0, duration: 500 / speed, delay: 300, onComplete: () => c.destroy() })
          }
        })
      }
    })
  }
}
