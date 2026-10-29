import Phaser from "phaser"
import type { Pos } from "@game/core/types"
import { textStyle } from "../style"
import { reducedMotion } from "../motionFx"

// Облачка реплик над жителями поселения (рыбак, сплетники): экранного размера — не мельчают при отдалении камеры,
// плашка прижимается внутрь экрана, хвостик остаётся над головой говорящего. Тап по облачку закрывает его.

export interface BubbleStyle {
  /** Цвет плашки. */
  fill?: number
  italic?: boolean
  /** Мелкая подпись под текстом (например, источник цитаты). */
  caption?: string
}

interface Bubble {
  owner: string
  root: Phaser.GameObjects.Container
  box: Phaser.GameObjects.Container
  /** Плашка без хвостика, w × h, и высота вместе с хвостиком. */
  w: number
  h: number
  /** Появление доиграло: дальше масштаб держит fit() (зум камеры меняется при ресайзе). */
  shown: boolean
}

const INK = 0x2a1d10
const PAPER = 0xf3e2c0
const TAIL = 9

export class SpeechBubbles {
  private list: Bubble[] = []

  constructor(private readonly scene: Phaser.Scene, private readonly zoom: () => number) {}

  /** Показать реплику над `head` (мировые пиксели) на `hold` секунд; у владельца одно облачко — новое сменяет старое. */
  show(owner: string, head: Pos, text: string, hold: number, style: BubbleStyle = {}): void {
    this.clear(owner, false)
    const s = this.scene
    const fill = style.fill ?? PAPER
    const label = s.add
      .text(0, 0, text, {
        ...textStyle(13, "#2a1d10", false, 0),
        fontStyle: style.italic ? "italic" : "normal",
        wordWrap: { width: 190, useAdvancedWrap: true },
        lineSpacing: 2
      })
      .setOrigin(0.5, 0)
      .setResolution(3)
    const caption = style.caption
      ? s.add
          .text(0, 0, `— ${style.caption}`, { ...textStyle(10, "#6d5a48", false, 0), fontStyle: "italic", wordWrap: { width: 190, useAdvancedWrap: true } })
          .setOrigin(0.5, 0)
          .setResolution(3)
      : undefined
    const padX = 10
    const padY = 7
    const gap = caption ? 3 : 0
    const w = Math.max(label.width, caption?.width ?? 0) + padX * 2
    const h = label.height + gap + (caption?.height ?? 0) + padY * 2
    const top = -TAIL - h
    label.setPosition(0, top + padY)
    caption?.setPosition(0, top + padY + label.height + gap)
    const g = s.add.graphics()
    g.fillStyle(0x000000, 0.35).fillRoundedRect(-w / 2 + 2, top + 3, w, h, 10)
    g.fillStyle(fill, 1).fillRoundedRect(-w / 2, top, w, h, 10)
    g.lineStyle(2.5, INK, 1).strokeRoundedRect(-w / 2, top, w, h, 10)
    const tip = s.add.graphics()
    tip.fillStyle(fill, 1).fillTriangle(-7, -TAIL - 1.5, 7, -TAIL - 1.5, 0, 0)
    tip.lineStyle(2.5, INK, 1).lineBetween(-7, -TAIL, 0, 0).lineBetween(7, -TAIL, 0, 0)
    const box = s.add.container(0, 0, caption ? [g, label, caption] : [g, label])
    const scale = 1 / this.zoom()
    const root = s.add.container(head.x, head.y - 2, [box, tip]).setDepth(9600).setScale(scale * 0.6).setAlpha(0)
    const bubble: Bubble = { owner, root, box, w, h: h + TAIL, shown: false }
    this.list.push(bubble)
    this.fit(bubble)
    s.tweens.add({ targets: root, alpha: 1, scale, duration: reducedMotion() ? 0 : 180, ease: "Back.easeOut", onComplete: () => { bubble.shown = true } })
    s.tweens.add({ targets: root, alpha: 0, delay: hold * 1000, duration: 350, onComplete: () => this.drop(bubble) })
  }

  /** Висит ли сейчас облачко владельца. */
  has(owner: string): boolean {
    return this.list.some(b => b.owner === owner)
  }

  /** Убрать облачко владельца (быстро гаснет или сразу). */
  clear(owner: string, fade = true): void {
    for (const b of this.list.filter(x => x.owner === owner)) this.close(b, fade)
  }

  /** Каждый кадр: держать плашки внутри экрана (камера ездит за героем). */
  update(): void {
    for (const b of this.list) this.fit(b)
  }

  /** Тап по облачку (мировые пиксели) — закрыть его; true — попали. */
  tap(x: number, y: number): boolean {
    const k = 1 / this.zoom()
    const hit = [...this.list].reverse().find((b) => {
      const cx = b.root.x + b.box.x * k
      return Math.abs(x - cx) <= (b.w / 2) * k && y <= b.root.y && y >= b.root.y - b.h * k
    })
    if (hit) this.close(hit, true)
    return !!hit
  }

  private close(b: Bubble, fade: boolean): void {
    this.list = this.list.filter(x => x !== b)
    this.scene.tweens.killTweensOf(b.root)
    if (!fade || reducedMotion()) return void b.root.destroy()
    this.scene.tweens.add({ targets: b.root, alpha: 0, scale: b.root.scale * 0.85, duration: 120, onComplete: () => b.root.destroy() })
  }

  private drop(b: Bubble): void {
    this.list = this.list.filter(x => x !== b)
    b.root.destroy()
  }

  /** Сдвинуть плашку вбок, чтобы она целиком была на экране (хвостик не двигается, пока хватает места). */
  private fit(b: Bubble): void {
    const view = this.scene.cameras.main.worldView
    const k = 1 / this.zoom()
    // Экранный размер: после ресайза зум другой — подгоняем масштаб
    if (b.shown && b.root.scale !== k) b.root.setScale(k)
    const gap = 8 * k
    const half = (b.w / 2) * k
    const x = b.root.x
    let dx = 0
    if (x - half < view.left + gap) dx = view.left + gap - (x - half)
    else if (x + half > view.right - gap) dx = view.right - gap - (x + half)
    // хвостик должен остаться под плашкой: сдвиг не больше полуширины без скругления
    const max = half - 14 * k
    b.box.setX(Phaser.Math.Clamp(dx, -max, max) / k)
  }
}
