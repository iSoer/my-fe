import type Phaser from "phaser"
import { EMOJI_RE, iconOfEmoji, iconSvg, type IconTone } from "@game/art/icons"
import { ensureTexture, hasTexture } from "./svgTextures"
import { renderScaleOf } from "./hidpi"

/**
 * Иконки-штампы (`art/icons`) на канвасе Phaser: текстуры и надписи «текст + иконки» вместо эмодзи в Text.
 * Текстуры растеризуются по требованию; пока иконка не готова, на её месте рисуется сам эмодзи.
 */

export const iconTexKey = (id: string, tone: IconTone): string => `ic:${id}:${tone}`

/** Иконки поля боя и кинематики (светлый тон — поверх клеток и затемнения). */
export const MAP_ICONS = [
  "bone", "key", "heart", "ghost", "sparkles", "paw", "anger", "cat", "dog", "mouse",
  "dagger", "swords", "ring", "tooth", "bell", "chain", "ribbon", "book", "coin", "leaf", "shield", "fire", "sneaker", "herb"
] as const

/** Иконки вывесок поселения (тёмный тон — на бежевой плашке). */
export const SIGN_ICONS = ["shield", "target", "cart", "headstone", "beer", "barrier", "lock", "hammer", "bone", "swords", "up"] as const

/** Растр иконки: 48 CSS-пикселей × плотность (не больше ×3) — хватает и вывескам, и всплывающим надписям. */
function iconPx(scene: Phaser.Scene): number {
  return Math.round(48 * Math.min(3, renderScaleOf(scene)))
}

export function ensureIconTexture(scene: Phaser.Scene, id: string, tone: IconTone): Promise<string> {
  const px = iconPx(scene)
  return ensureTexture(scene, iconTexKey(id, tone), iconSvg(id, tone), px, px)
}

export function ensureIconTextures(scene: Phaser.Scene, ids: readonly string[], tone: IconTone): Promise<unknown> {
  return Promise.all(ids.map(id => ensureIconTexture(scene, id, tone)))
}

type Part = { text: string } | { icon: string, emoji: string }

/** Разбить строку на куски текста и иконки (неизвестные эмодзи остаются текстом). */
export function splitIcons(text: string): Part[] {
  const parts: Part[] = []
  let last = 0
  for (const m of text.matchAll(EMOJI_RE)) {
    const id = iconOfEmoji(m[0])
    if (!id) continue
    const i = m.index ?? 0
    if (i > last) parts.push({ text: text.slice(last, i) })
    parts.push({ icon: id, emoji: m[0] })
    last = i + m[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts
}

/**
 * Надпись с иконками: контейнер с центром в (x, y), как Text с `setOrigin(0.5)`. Размер контейнера — по
 * содержимому (`width`/`height`). Иконка — 1.25 размера шрифта.
 */
export function richText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  style: Phaser.Types.GameObjects.Text.TextStyle,
  tone: IconTone = "light"
): Phaser.GameObjects.Container {
  const box = scene.add.container(x, y)
  const size = Number.parseFloat(String(style.fontSize ?? 16)) || 16
  const px = size * 1.25
  const items: { obj: Phaser.GameObjects.Text | Phaser.GameObjects.Image, w: number, h: number }[] = []
  for (const p of splitIcons(text)) {
    if ("text" in p) {
      const t = scene.add.text(0, 0, p.text, style).setOrigin(0, 0.5)
      items.push({ obj: t, w: t.width, h: t.height })
      continue
    }
    const key = iconTexKey(p.icon, tone)
    if (hasTexture(scene, key)) {
      const img = scene.add.image(0, 0, key).setOrigin(0, 0.5).setDisplaySize(px, px)
      items.push({ obj: img, w: px, h: px })
    }
    else {
      // Иконка ещё не растеризована — пока эмодзи, текстура догрузится к следующему разу
      void ensureIconTexture(scene, p.icon, tone)
      const t = scene.add.text(0, 0, p.emoji, style).setOrigin(0, 0.5)
      items.push({ obj: t, w: t.width, h: t.height })
    }
  }
  const total = items.reduce((s, it) => s + it.w, 0)
  let cx = -total / 2
  for (const it of items) {
    it.obj.setX(cx)
    cx += it.w
  }
  box.add(items.map(it => it.obj))
  box.setSize(total, Math.max(0, ...items.map(it => it.h)))
  return box
}

/** Одиночная иконка вместо эмодзи-Text: картинка, если текстура готова, иначе сам эмодзи. */
export function iconImage(
  scene: Phaser.Scene,
  x: number,
  y: number,
  emoji: string,
  size: number,
  style: Phaser.Types.GameObjects.Text.TextStyle,
  tone: IconTone = "light"
): Phaser.GameObjects.Image | Phaser.GameObjects.Text {
  const id = iconOfEmoji(emoji)
  const key = id ? iconTexKey(id, tone) : ""
  if (id && hasTexture(scene, key)) return scene.add.image(x, y, key).setDisplaySize(size, size)
  if (id) void ensureIconTexture(scene, id, tone)
  return scene.add.text(x, y, emoji, style).setOrigin(0.5)
}
