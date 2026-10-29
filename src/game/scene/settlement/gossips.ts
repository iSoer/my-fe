import Phaser from "phaser"
import type { Pos } from "@game/core/types"
import type { Blocker } from "@game/core/settlement/walk"
import { GOSSIPS, GOSSIP_GAP, GOSSIP_SPOTS, GOSSIP_TIMING, type GossipDef } from "@game/content/settlement"
import { loadQuotes, quoteLine, type Quote } from "@game/content/quotes"
import { furArt } from "@game/art/index"
import { textRes } from "../renderScale"
import { deathSfx } from "@game/platform/audio"
import { textStyle } from "../style"
import { reducedMotion } from "../motionFx"
import type { SpeechBubbles } from "./speech"

// Сплетники поселения (`GOSSIPS`): Гламурная Киса Эльман и Рыжий пёс Ваня стоят парой на лужайке и по очереди
// говорят цитаты из `content/quotes.json` — в облачках своего цвета, с подписью источника. Время от времени пара
// растворяется в дымке и появляется на другом месте (`GOSSIP_SPOTS`), подальше от героя. Тапы по одному из них:
// он подпрыгивает, на последнем перед взрывом краснеет, на `GOSSIP_TIMING.taps`-м — взрывается и пропадает до
// следующего захода в поселение; оставшийся без собеседника замолкает.

export interface GossipHost {
  scene: Phaser.Scene
  /** Клетка в мировых пикселях. */
  tile: number
  /** Размер спрайта жителя, мировые пиксели. */
  size: { w: number, h: number }
  texture: (id: string) => string
  speech: SpeechBubbles
  heroPos: () => Pos
  paused: () => boolean
}

interface Gossiper {
  def: GossipDef
  img: Phaser.GameObjects.Image
  label: Phaser.GameObjects.Text
  /** Центр в клетках и точка над именем (мировые пиксели) — под хвостик облачка. */
  pos: Pos
  head: Pos
  taps: number
  alive: boolean
  hop?: Phaser.Tweens.Tween
}

const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo)

export class Gossips {
  private readonly pair: Gossiper[]
  private quotes: readonly Quote[] = []
  /** Цитаты вразнобой без повторов, пока не прозвучат все. */
  private bag: number[] = []
  private turn = 0
  private talkT: number = GOSSIP_TIMING.first
  private moveT = rand(...GOSSIP_TIMING.move)
  private spot = -1

  constructor(private readonly host: GossipHost) {
    const { scene } = host
    this.pair = GOSSIPS.map((def, i): Gossiper => {
      const img = scene.add.image(0, 0, host.texture(def.id)).setOrigin(0.5, 1).setDisplaySize(host.size.w, host.size.h).setFlipX(i === 1)
      const label = scene.add.text(0, 0, def.name, textStyle(12, "#ffffff", true, 3)).setOrigin(0.5, 1).setResolution(textRes(2)).setDepth(9000)
      return { def, img, label, pos: { x: 0, y: 0 }, head: { x: 0, y: 0 }, taps: 0, alive: true }
    })
    this.place(this.pickSpot())
    void loadQuotes().then((q) => {
      this.quotes = q
    })
  }

  /** Кто из сплетников сейчас стоит на пути героя. */
  blockers(): Blocker[] {
    return this.pair.filter(g => g.alive).map(g => ({ pos: g.pos }))
  }

  /** Тап (клетки): попал в сплетника — он подпрыгивает или взрывается; true — тап обработан. */
  tap(p: Pos): boolean {
    const g = this.pair.find(x => x.alive && Math.abs(x.pos.x - p.x) < 0.7 && p.y > x.pos.y - 1.3 && p.y < x.pos.y + 0.5)
    if (!g) return false
    g.taps++
    if (g.taps >= GOSSIP_TIMING.taps) this.explode(g)
    else this.flinch(g)
    return true
  }

  update(dt: number): void {
    if (this.host.paused()) return
    const alive = this.pair.filter(g => g.alive)
    if (alive.length === 0) return
    this.moveT -= dt
    const quiet = !this.pair.some(g => this.host.speech.has(g.def.id))
    if (this.moveT <= 0 && quiet) {
      this.moveT = rand(...GOSSIP_TIMING.move)
      const next = this.pickSpot()
      if (next !== this.spot) this.relocate(next)
      return
    }
    // Болтают только вдвоём
    if (alive.length < 2 || this.quotes.length === 0) return
    this.talkT -= dt
    if (this.talkT > 0) return
    this.say(this.pair[this.turn] as Gossiper)
    this.turn = 1 - this.turn
  }

  private say(g: Gossiper): void {
    if (this.bag.length === 0) this.bag = Phaser.Utils.Array.Shuffle(this.quotes.map((_, i) => i))
    const q = this.quotes[this.bag.pop() as number]
    if (!q) return
    const { text, source } = quoteLine(q)
    const hold = GOSSIP_TIMING.hold + text.length * GOSSIP_TIMING.perChar
    this.talkT = hold + rand(...GOSSIP_TIMING.gap)
    this.host.speech.show(g.def.id, g.head, text, hold, { fill: g.def.bubble, caption: source })
  }

  /** Место, где оба встанут подальше от героя (и не то же, где стоят сейчас, если есть выбор). */
  private pickSpot(): number {
    const hero = this.host.heroPos()
    const far = (s: Pos) => [s, { x: s.x + GOSSIP_GAP, y: s.y }].every(p => Math.hypot(p.x - hero.x, p.y - hero.y) > 2)
    const ok = GOSSIP_SPOTS.map((s, i) => (far(s) && i !== this.spot ? i : -1)).filter(i => i >= 0)
    return ok.length > 0 ? (ok[Math.floor(Math.random() * ok.length)] as number) : Math.max(0, this.spot)
  }

  private place(spot: number): void {
    const s = GOSSIP_SPOTS[spot] as Pos
    this.spot = spot
    const { tile: T, size } = this.host
    this.pair.forEach((g, i) => {
      g.pos = { x: s.x + i * GOSSIP_GAP, y: s.y }
      const x = g.pos.x * T
      const y = g.pos.y * T
      g.img.setPosition(x, y + size.h * 0.14).setDepth(y)
      // имена длинные — у второго подпись строкой выше, чтобы не наезжали
      g.label.setPosition(x, y - size.h * 0.78 - i * 15)
      g.head = { x, y: g.label.getTopCenter().y ?? g.label.y }
    })
  }

  /** Растворились в дымке — появились на новом месте. */
  private relocate(spot: number): void {
    const alive = this.pair.filter(g => g.alive)
    for (const g of alive) this.puff(g.img.x, g.img.y - this.host.size.h * 0.4, 0x9a9488)
    this.place(spot)
    for (const g of alive) {
      this.puff(g.img.x, g.img.y - this.host.size.h * 0.4, 0x9a9488)
      if (reducedMotion()) continue
      g.img.setAlpha(0)
      g.label.setAlpha(0)
      this.host.scene.tweens.add({ targets: [g.img, g.label], alpha: 1, duration: 450, delay: 150 })
    }
    this.talkT = Math.max(this.talkT, 2)
  }

  /** Тап без взрыва: подпрыгнул; на последнем тапе перед взрывом — покраснел (предупреждение). */
  private flinch(g: Gossiper): void {
    const { scene } = this.host
    if (g.taps === GOSSIP_TIMING.taps - 1) g.img.setTint(0xff8a8a)
    if (reducedMotion() || g.hop?.isPlaying()) return
    const y = g.img.y
    g.hop = scene.tweens.add({ targets: g.img, y: y - 7, duration: 90, yoyo: true, ease: "Quad.easeOut", onComplete: () => g.img.setY(y) })
  }

  /** Взрыв: вспышка, клочья шерсти, дым и подпалина на траве; облачка обоих гаснут — второй замолкает. */
  private explode(g: Gossiper): void {
    const { scene, size } = this.host
    g.alive = false
    g.hop?.stop()
    for (const x of this.pair) this.host.speech.clear(x.def.id)
    const x = g.img.x
    const y = g.img.y - size.h * 0.4
    g.img.setVisible(false)
    g.label.setVisible(false)
    deathSfx("explosion")
    scene.cameras.main.shake(180, 0.006)
    const scorch = scene.add.ellipse(x, g.img.y - 2, size.w * 0.9, size.w * 0.32, 0x15100c, 0.55).setDepth(-4)
    scene.tweens.add({ targets: scorch, alpha: 0, delay: 20000, duration: 4000, onComplete: () => scorch.destroy() })
    const flash = scene.add.circle(x, y, size.w * 0.5, 0xfff1c2, 0.95).setDepth(9500).setBlendMode(Phaser.BlendModes.ADD)
    scene.tweens.add({ targets: flash, scale: 2.4, alpha: 0, duration: 260, onComplete: () => flash.destroy() })
    if (reducedMotion()) return
    const fur = Phaser.Display.Color.HexStringToColor(furArt(g.def.fur).fur).color
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + rand(-0.2, 0.2)
      const d = rand(size.w * 0.6, size.w * 1.4)
      const bit = scene.add.circle(x, y, rand(2, 4.5), i % 3 === 0 ? 0xffb03b : fur).setDepth(9400)
      scene.tweens.add({
        targets: bit,
        x: x + Math.cos(a) * d,
        y: y + Math.sin(a) * d * 0.7 + size.h * 0.3,
        alpha: 0,
        duration: rand(450, 750),
        ease: "Quad.easeOut",
        onComplete: () => bit.destroy()
      })
    }
    this.puff(x, y, 0x4a4540, 8)
  }

  /** Облачко дыма: несколько клубов расползаются и тают. */
  private puff(x: number, y: number, color: number, n = 5): void {
    const { scene, size } = this.host
    if (reducedMotion()) return
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const c = scene.add.circle(x + Math.cos(a) * 6, y + Math.sin(a) * 4, rand(6, 10), color, 0.7).setDepth(9300)
      scene.tweens.add({
        targets: c,
        x: x + Math.cos(a) * size.w * 0.5,
        y: y + Math.sin(a) * size.w * 0.3 - 8,
        scale: 2,
        alpha: 0,
        duration: rand(500, 800),
        onComplete: () => c.destroy()
      })
    }
  }
}
