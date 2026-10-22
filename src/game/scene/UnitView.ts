import Phaser from "phaser"
import type { Side, UnitInstance } from "@game/core/types"
import type { Pose } from "@game/art/index"
import { FUR_PALETTES } from "@game/content/appearance"
import { unitClass } from "@game/content/classes"
import { weaponDef } from "@game/content/weapons"
import { TEX } from "./textures"
import { MOVE_GLYPH, WEAPON_COLOR_HEX, hexCss, hpColor, textStyle } from "./style"
import { ensureUnitTexture, ensureUnitTextures, hasTexture, unitTexKey } from "./svgTextures"
import { dustPuff, tween } from "./fx"
import { MTEX, ensureMotionTextures, reducedMotion } from "./motionFx"

/** Походка по клеткам: пехота прыгает, кавалерия скачет галопом, броня тяжело ступает, летуны парят. */
export type Gait = "infantry" | "cavalry" | "armored" | "flier"

export interface StepOptions {
  /** Мс на клетку (уже с учётом скорости анимации). */
  ms: number
  /** Первая клетка пути — разгон, последняя — торможение. */
  first: boolean
  last: boolean
  /** Вызывается в момент касания земли (следы, пыль). */
  onLand?: () => void
}

export interface UnitViewOptions {
  size: number
  showHp?: boolean
  showBadges?: boolean
}

/** Пропорция текстуры миниатюры (VIEW 120×140). */
const ART_RATIO = 120 / 140
/** Доля высоты текстуры, где у миниатюры лапы. */
const FEET_Y = 0.97
const RUN_FRAME_MS = 110

/**
 * Визуальное представление юнита на карте: SVG-миниатюра (кот/пёс/мышь) с позами,
 * тень цвета оружия, HP, значок спецприёма и глиф движения. До загрузки текстуры — плейсхолдер.
 */
export class UnitView extends Phaser.GameObjects.Container {
  readonly unitId: string
  readonly side: Side
  readonly furColor: number
  readonly weaponColor: number
  readonly hasSpecial: boolean

  private readonly unit: UnitInstance
  private readonly shadow: Phaser.GameObjects.Image
  /** Тело (спрайт или плейсхолдер): поднимается «за шкирку», сплющивается при приземлении. */
  private readonly rig: Phaser.GameObjects.Container
  private sprite: Phaser.GameObjects.Image | null = null
  private disc: Phaser.GameObjects.Image | null = null
  private emoji: Phaser.GameObjects.Text | null = null
  private readonly moveGlyph: Phaser.GameObjects.Text
  private readonly hpBar: Phaser.GameObjects.Graphics
  private readonly hpText: Phaser.GameObjects.Text
  private readonly cdBadge: Phaser.GameObjects.Container
  private readonly cdBg: Phaser.GameObjects.Image
  private readonly cdText: Phaser.GameObjects.Text
  private size = 48
  private hp = 1
  private maxHp = 1
  private showHp: boolean
  private showBadges: boolean
  private pose: Pose = "idle"
  private facing: 1 | -1
  private dead = false
  private runTimer: Phaser.Time.TimerEvent | null = null
  private runFrame = 0
  private hurtTimer: Phaser.Time.TimerEvent | null = null
  private lifted = false
  private invalidTint = false
  private liftTweens: Phaser.Tweens.Tween[] = []
  private landingTweens: Phaser.Tweens.Tween[] = []
  /* Жизнь в покое: дыхание (scaleY тела) и моргание (смена текстуры). */
  private breath: Phaser.Tweens.Tween | null = null
  private blinkTimer: Phaser.Time.TimerEvent | null = null
  private blinkBack: Phaser.Time.TimerEvent | null = null
  private lifePaused = false
  private blinkCount = 0
  private hopTween: Phaser.Tweens.Tween | null = null
  /* Покачивание, парение летуна, выделение, «уже ходил», разворот */
  private sway: Phaser.Tweens.Tween | null = null
  private bob: Phaser.Tweens.Tween | null = null
  readonly gait: Gait
  private selected = false
  private selRing: Phaser.GameObjects.Image | null = null
  private selGlow: Phaser.GameObjects.Image | null = null
  private selTweens: Phaser.Tweens.Tween[] = []
  private glowFx: Phaser.FX.Glow | null = null
  private actedFx: Phaser.FX.ColorMatrix | null = null
  private acted = false
  private flipTween: Phaser.Tweens.Tween | null = null
  private hitTweens: Phaser.Tweens.Tween[] = []
  private lowHp = false
  private hpFlash: Phaser.GameObjects.Graphics | null = null

  constructor(scene: Phaser.Scene, unit: UnitInstance, side: Side, opts: UnitViewOptions) {
    super(scene, 0, 0)
    this.unit = unit
    this.unitId = unit.id
    this.side = side
    this.showHp = opts.showHp ?? true
    this.showBadges = opts.showBadges ?? true
    this.facing = side === "enemy" ? -1 : 1
    const cls = unitClass(unit)
    const weapon = weaponDef(unit.skills.weapon)
    this.gait = cls.moveType
    this.furColor = FUR_PALETTES[unit.appearance.furPalette]?.color ?? 0xcccccc
    this.weaponColor = WEAPON_COLOR_HEX[weapon.color]
    this.hasSpecial = !!unit.skills.special

    ensureMotionTextures(scene)
    this.shadow = scene.add.image(0, 0, TEX.disc).setTint(this.weaponColor).setAlpha(0.55)
    // Мягкая тень-пятно под лапами (тёмная), над ней цветной диск оружия
    this.rig = scene.add.container(0, 0)
    this.add([this.shadow, this.rig])

    const idleKey = unitTexKey(unit, "idle", "map")
    if (hasTexture(scene, idleKey)) this.attachSprite(idleKey)
    else {
      this.disc = scene.add.image(0, 0, TEX.disc).setTint(this.furColor)
      this.emoji = scene.add
        .text(
          0,
          0,
          unit.species === "cat" ? "🐱" : unit.species === "dog" ? "🐶" : "🐭",
          textStyle(24, "#fff", false, 0)
        )
        .setOrigin(0.5)
      this.rig.add([this.disc, this.emoji])
      void ensureUnitTextures(scene, unit, "map").then(() => {
        if (!this.scene || this.sprite) return
        this.attachSprite(unitTexKey(unit, this.pose, "map"))
        this.resize(this.size)
      })
    }

    this.moveGlyph = scene.add
      .text(0, 0, MOVE_GLYPH[cls.moveType], textStyle(10, hexCss(side === "player" ? 0x8ecae6 : 0xffb4a2), true, 2))
      .setOrigin(0.5)
    this.hpBar = scene.add.graphics()
    this.hpText = scene.add.text(0, 0, "", textStyle(9, "#fff", true, 2)).setOrigin(1, 0.5)
    this.cdBg = scene.add.image(0, 0, TEX.disc).setTint(0x222222)
    this.cdText = scene.add.text(0, 0, "", textStyle(9, "#ffd166", true, 2)).setOrigin(0.5)
    this.cdBadge = scene.add.container(0, 0, [this.cdBg, this.cdText])
    this.add([this.moveGlyph, this.hpBar, this.hpText, this.cdBadge])
    scene.add.existing(this)
    this.resize(opts.size)
    this.startLife()
  }

  /* ---------- Дыхание и моргание ---------- */

  private seedFromId(): number {
    let h = 2166136261
    for (let i = 0; i < this.unitId.length; i++) {
      h ^= this.unitId.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    return (h >>> 0) / 4294967296
  }

  /** Запустить дыхание и моргание (с фазовым сдвигом по id, чтобы юниты не дышали синхронно). */
  private startLife(): void {
    if (!this.scene || this.dead) return
    const r = this.seedFromId()
    // Раненый (HP < 35 %) дышит тяжело и чаще, сильнее пошатывается
    const heavy = this.lowHp
    if (!this.breath) {
      const dur = heavy ? 760 + Math.round(r * 200) : 2000 + Math.round(r * 600)
      this.breath = this.scene.tweens.add({
        targets: this.rig,
        scaleY: heavy ? 1.06 : 1.035,
        scaleX: heavy ? 0.97 : 0.985,
        duration: dur,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
        delay: Math.round(r * dur)
      })
    }
    if (!this.sway && !reducedMotion()) {
      const amp = heavy ? 4.5 : 1.6
      this.rig.setAngle(-amp)
      this.sway = this.scene.tweens.add({
        targets: this.rig,
        angle: amp,
        duration: heavy ? 1300 : 2600 + Math.round(r * 900),
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
        delay: Math.round(r * 1000)
      })
    }
    if (this.gait === "flier" && !this.bob) this.startBob()
    this.scheduleBlink()
  }

  private scheduleBlink(): void {
    if (!this.scene || this.dead) return
    this.blinkTimer?.remove(false)
    // Псевдослучайный, но детерминированный по id интервал 3–6 с.
    this.blinkCount++
    const delay = 3000 + Math.round((this.seedFromId() * 7919 + this.blinkCount * 2663) % 3000)
    this.blinkTimer = this.scene.time.delayedCall(delay, () => {
      this.blinkTimer = null
      if (!this.scene || this.dead) return
      const canBlink = this.pose === "idle" && !this.lifted && !this.runTimer && !this.hurtTimer && !this.lifePaused
      if (canBlink) {
        this.setPose("blink")
        this.blinkBack = this.scene.time.delayedCall(110, () => {
          this.blinkBack = null
          if (!this.scene || this.dead) return
          if (this.pose === "blink") this.setPose("idle")
        })
      }
      this.scheduleBlink()
    })
  }

  /** Высота парения летуна над землёй (в пикселях, вверх — минус). */
  private floatY(): number {
    return this.gait === "flier" ? -this.size * 0.12 : 0
  }

  /** Летун мягко парит: тело покачивается вверх-вниз, тень на земле дышит в такт. */
  private startBob(): void {
    if (!this.scene || this.bob) return
    const base = this.floatY()
    this.bob = this.scene.tweens.add({
      targets: this.rig,
      y: { from: base, to: base - this.size * 0.06 },
      duration: 900 + Math.round(this.seedFromId() * 300),
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
      onUpdate: () => this.syncShadow()
    })
  }

  /** Тень реагирует на высоту тела: чем выше прыжок, тем меньше и прозрачнее. */
  private syncShadow(): void {
    if (!this.scene) return
    const lift = Math.max(0, -this.rig.y) / Math.max(1, this.size)
    const k = Math.max(0.45, 1 - lift * 1.2)
    const base = this.lifted ? 0.7 : 1
    this.shadow.setDisplaySize(this.size * 0.7 * base * k, this.size * 0.25 * base * k)
    this.shadow.setAlpha((this.lifted ? 0.35 : 0.55) * (0.5 + 0.5 * k))
  }

  /** Приостановить дыхание (подъём, приземление, смерть) — тело возвращается к масштабу 1. */
  private pauseLife(): void {
    this.lifePaused = true
    if (this.breath) {
      this.breath.stop()
      this.breath = null
    }
    this.sway?.stop()
    this.sway = null
    this.bob?.stop()
    this.bob = null
    if (this.scene) this.rig.setAngle(0)
    if (this.blinkBack) {
      this.blinkBack.remove(false)
      this.blinkBack = null
      if (this.pose === "blink" && !this.dead) this.setPose("idle")
    }
    if (this.scene) this.rig.setScale(1, 1)
  }

  private resumeLife(): void {
    if (this.lifted || this.dead) return
    this.lifePaused = false
    this.startLife()
  }

  /** Короткий подскок тела (выбор юнита). Не блокирует. */
  hop(): void {
    if (!this.scene || this.dead || this.lifted) return
    this.hopTween?.stop()
    const y0 = this.floatY()
    this.bob?.stop()
    this.bob = null
    this.hopTween = this.scene.tweens.add({
      targets: this.rig,
      y: y0 - this.size * 0.22,
      duration: 130,
      yoyo: true,
      ease: "Quad.easeOut",
      onUpdate: () => this.syncShadow(),
      onComplete: () => {
        this.hopTween = null
        if (!this.scene || this.lifted) return
        this.rig.setY(y0)
        this.syncShadow()
        // Приземление: короткое сплющивание
        this.scene.tweens.add({
          targets: this.rig,
          scaleX: 1.14,
          scaleY: 0.86,
          duration: 60,
          yoyo: true,
          ease: "Quad.easeOut"
        })
        if (this.gait === "flier" && !this.lifePaused) this.startBob()
      }
    })
  }

  /** Заменить плейсхолдер на миниатюру. */
  private attachSprite(key: string): void {
    if (!this.scene) return
    const img = this.scene.add.image(0, 0, key).setOrigin(0.5, 0.62)
    img.setFlipX(this.facing < 0)
    this.sprite = img
    // Спрайт в контейнере тела: над тенью, под HP/значками.
    this.rig.addAt(img, 0)
    if (this.invalidTint) img.setTint(0xffb3b3)
    if (this.disc) {
      this.disc.destroy()
      this.disc = null
    }
    if (this.emoji) {
      this.emoji.destroy()
      this.emoji = null
    }
  }

  resize(size: number): void {
    this.size = size
    const feetY = size * 0.36
    const k = this.lifted ? 0.7 : 1
    this.shadow.setDisplaySize(size * 0.7 * k, size * 0.25 * k)
    this.shadow.setAlpha(this.lifted ? 0.35 : 0.55)
    this.shadow.setPosition(0, feetY)
    if (this.gait === "flier" && !this.lifted) this.syncShadow()
    this.selRing?.setPosition(0, feetY)
    this.selGlow?.setPosition(0, feetY)
    if (this.sprite) {
      const h = size * 1.05
      const w = h * ART_RATIO
      this.sprite.setDisplaySize(w, h)
      // origin 0.62: лапы (0.97 высоты) оказываются чуть ниже центра клетки, у тени.
      this.sprite.setPosition(0, feetY - (FEET_Y - 0.62) * h)
    }
    if (this.disc && this.emoji) {
      const d = size * 0.72
      this.disc.setDisplaySize(d, d)
      this.emoji.setFontSize(Math.round(size * 0.5))
      this.emoji.setPosition(0, -size * 0.02)
    }
    this.moveGlyph.setFontSize(Math.max(8, Math.round(size * 0.2)))
    this.moveGlyph.setPosition(-size * 0.38, size * 0.32)
    this.hpText.setFontSize(Math.max(8, Math.round(size * 0.18)))
    this.hpText.setPosition(size * 0.44, size * 0.32)
    const badge = size * 0.3
    this.cdBg.setDisplaySize(badge, badge)
    this.cdText.setFontSize(Math.max(8, Math.round(size * 0.18)))
    this.cdBadge.setPosition(size * 0.36, -size * 0.36)
    this.redrawHp()
    this.hpBar.setVisible(this.showHp)
    this.hpText.setVisible(this.showHp)
    this.cdBadge.setVisible(this.showBadges && this.hasSpecial)
    this.moveGlyph.setVisible(this.showBadges)
  }

  /** Вид уничтожен (Phaser обнуляет scene в destroy). */
  get alive(): boolean {
    return !!this.scene
  }

  setHp(hp: number, maxHp: number): void {
    const prev = this.hp
    this.hp = Math.max(0, hp)
    this.maxHp = Math.max(1, maxHp)
    if (!this.scene) return
    this.redrawHp()
    if (this.hp > prev && prev > 0) this.flashHp(0x80ed99)
    // Переход через порог «тяжело ранен» — перезапустить дыхание с другим ритмом
    const low = this.hp > 0 && this.hp / this.maxHp < 0.35
    if (low !== this.lowHp) {
      this.lowHp = low
      if (!this.lifePaused && !this.dead) {
        this.breath?.stop()
        this.breath = null
        this.sway?.stop()
        this.sway = null
        this.rig.setScale(1).setAngle(0)
        this.startLife()
      }
    }
  }

  /** Доля оставшегося HP (0…1). */
  hpFrac(): number {
    return Math.max(0, Math.min(1, this.hp / this.maxHp))
  }

  /** Подсветка полоски HP (зелёная — лечение). */
  flashHp(color: number): void {
    if (!this.scene || !this.showHp) return
    this.hpFlash?.destroy()
    const w = this.size * 0.78
    const h = Math.max(3, this.size * 0.09)
    const g = this.scene.add.graphics()
    g.fillStyle(color, 1)
    g.fillRect(-w / 2 - 2, this.size * 0.38 - 2, w + 4, h + 4)
    g.setBlendMode(Phaser.BlendModes.ADD)
    this.add(g)
    this.hpFlash = g
    this.scene.tweens.add({
      targets: g,
      alpha: 0,
      duration: 700,
      ease: "Quad.easeIn",
      onComplete: () => {
        g.destroy()
        if (this.hpFlash === g) this.hpFlash = null
      }
    })
  }

  getHp(): number {
    return this.hp
  }

  setCd(cd: number): void {
    if (!this.scene) return
    this.cdText.setText(String(cd))
    this.cdText.setColor(cd <= 0 ? "#ffd166" : "#ffffff")
    this.cdBg.setTint(cd <= 0 ? 0x7a5c00 : 0x222222)
  }

  /** «Уже ходил»: фигурка обесцвечивается и чуть гаснет, без потери читаемости. */
  setActed(acted: boolean): void {
    if (!this.scene) return
    this.setAlpha(acted ? 0.82 : 1)
    if (acted === this.acted) return
    this.acted = acted
    const fx = this.sprite?.preFX
    if (fx) {
      if (acted && !this.actedFx) {
        this.actedFx = fx.addColorMatrix()
        this.actedFx.grayscale(0.85).brightness(0.82, true)
      }
      else if (!acted && this.actedFx) {
        fx.remove(this.actedFx as unknown as Phaser.FX.Controller)
        this.actedFx = null
      }
    }
    else if (this.sprite && !this.invalidTint) {
      if (acted) this.sprite.setTint(0x8a8a8a)
      else this.sprite.clearTint()
    }
  }

  /**
   * Выделение: кольцо у ног пульсирует, под ним мягкое свечение, фигурка получает светящийся контур
   * и пружинит. Цвет — по стороне (игрок — голубой, враг — красный).
   */
  setSelected(on: boolean): void {
    if (!this.scene || this.selected === on) return
    this.selected = on
    for (const t of this.selTweens) t.stop()
    this.selTweens = []
    this.selRing?.destroy()
    this.selGlow?.destroy()
    this.selRing = null
    this.selGlow = null
    if (this.glowFx && this.sprite?.preFX) this.sprite.preFX.remove(this.glowFx)
    this.glowFx = null
    if (!on || this.dead) return
    const color = this.side === "player" ? 0x8ecae6 : 0xff6b6b
    const feetY = this.size * 0.36
    const glow = this.scene.add.image(0, feetY, MTEX.glow).setTint(color).setBlendMode(Phaser.BlendModes.ADD)
    glow.setDisplaySize(this.size * 1.1, this.size * 0.5).setAlpha(0.7)
    const ring = this.scene.add.image(0, feetY, MTEX.ripple).setTint(0xffffff)
    ring.setDisplaySize(this.size * 0.95, this.size * 0.4)
    this.addAt(glow, 1)
    this.addAt(ring, 2)
    this.selGlow = glow
    this.selRing = ring
    const sx = ring.scaleX
    const sy = ring.scaleY
    this.selTweens.push(
      this.scene.tweens.add({
        targets: ring,
        scaleX: sx * 1.12,
        scaleY: sy * 1.12,
        alpha: 0.55,
        duration: 520,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut"
      }),
      this.scene.tweens.add({
        targets: glow,
        alpha: 0.35,
        duration: 700,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut"
      })
    )
    if (this.sprite?.preFX) this.glowFx = this.sprite.preFX.addGlow(0xffffff, 3, 0, false, 0.1, 12)
    this.hop()
  }

  /** Направление взгляда: 1 — вправо, −1 — влево. */
  setFacing(dir: 1 | -1): void {
    if (!this.scene) return
    const changed = this.facing !== dir
    this.facing = dir
    this.emoji?.setScale(dir < 0 ? -1 : 1, 1)
    const sprite = this.sprite
    if (!sprite) return
    if (!changed || this.dead || reducedMotion()) {
      sprite.setFlipX(dir < 0)
      return
    }
    // Плавный разворот: фигурка «схлопывается» по ширине и раскрывается уже в другую сторону
    this.flipTween?.stop()
    const base = sprite.scaleX
    this.flipTween = this.scene.tweens.add({
      targets: sprite,
      scaleX: base * 0.08,
      duration: 55,
      ease: "Quad.easeIn",
      onComplete: () => {
        if (!sprite.scene) return
        sprite.setFlipX(this.facing < 0)
        this.flipTween = this.scene.tweens.add({
          targets: sprite,
          scaleX: base,
          duration: 75,
          ease: "Back.easeOut",
          onComplete: () => {
            this.flipTween = null
          }
        })
      }
    })
  }

  /**
   * Реакция на удар: отлёт назад по направлению удара, наклон, белая и затем красная вспышка, дрожь, сплющивание.
   * strength 0…1.5 (доля HP, спецприём).
   */
  takeHit(dirX: number, dirY: number, strength: number, speed = 1): void {
    if (!this.scene || this.dead) return
    for (const t of this.hitTweens) t.stop()
    this.hitTweens = []
    const len = Math.hypot(dirX, dirY) || 1
    const k = Math.max(0.4, Math.min(1.5, strength))
    const dx = (dirX / len) * this.size * 0.16 * k
    const dy = (dirY / len) * this.size * 0.08 * k
    const target: Phaser.GameObjects.Image | null = this.sprite ?? this.disc
    target?.setTintFill(0xffffff)
    this.scene.time.delayedCall(60 / speed, () => {
      if (!this.scene || !target?.scene) return
      target.setTint(0xff5a5a)
      this.scene.time.delayedCall(140 / speed, () => {
        if (!target.scene) return
        if (this.acted && !this.actedFx) target.setTint(0x8a8a8a)
        else if (this.invalidTint) target.setTint(0xffb3b3)
        else if (this.sprite) target.clearTint()
        else this.disc?.setTint(this.furColor)
      })
    })
    const x0 = 0
    const y0 = this.rig.y
    this.hitTweens.push(
      this.scene.tweens.add({
        targets: this.rig,
        x: x0 + dx,
        y: y0 + dy,
        angle: (dirX >= 0 ? 1 : -1) * 12 * k,
        scaleX: 1.12,
        scaleY: 0.86,
        duration: 70 / speed,
        ease: "Quad.easeOut",
        onComplete: () => {
          if (!this.scene) return
          // Дрожь и возврат
          this.hitTweens.push(
            this.scene.tweens.add({
              targets: this.rig,
              x: { from: x0 + dx * 0.6, to: x0 + dx * 0.2 },
              duration: 30 / speed,
              yoyo: true,
              repeat: 2,
              onComplete: () => {
                if (!this.scene) return
                this.hitTweens.push(
                  this.scene.tweens.add({
                    targets: this.rig,
                    x: x0,
                    y: y0,
                    angle: 0,
                    scaleX: 1,
                    scaleY: 1,
                    duration: 180 / speed,
                    ease: "Back.easeOut"
                  })
                )
              }
            })
          )
        }
      })
    )
  }

  /**
   * Шаг на соседнюю клетку (контейнер едет к x, y): прыжок со сплющиванием на приземлении,
   * у кавалерии — галоп с раскачкой, у брони — тяжёлый шаг, летун скользит с наклоном.
   */
  stepTo(x: number, y: number, o: StepOptions): Promise<void> {
    if (!this.scene) return Promise.resolve()
    const scene = this.scene
    const ease = o.first && o.last ? "Sine.easeInOut" : o.first ? "Quad.easeIn" : o.last ? "Quad.easeOut" : "Linear"
    const hopH = this.gait === "flier" ? 0 : this.gait === "cavalry" ? 0.1 : this.gait === "armored" ? 0.07 : 0.18
    const base = this.floatY()
    this.bob?.stop()
    this.bob = null
    const move = new Promise<void>((resolve) => {
      scene.tweens.add({ targets: this, x, y, duration: o.ms, ease, onComplete: () => resolve() })
    })
    if (this.gait === "flier") {
      // Скольжение с наклоном вперёд
      this.rig.setY(base)
      scene.tweens.add({
        targets: this.rig,
        angle: 10 * this.facing,
        duration: o.ms * 0.5,
        yoyo: true,
        ease: "Sine.easeInOut"
      })
      return move.then(() => {
        o.onLand?.()
        if (this.scene) this.syncShadow()
      })
    }
    const arc = { t: 0 }
    const rock = this.gait === "cavalry" ? 9 : this.gait === "armored" ? 3 : 6
    const jump = new Promise<void>((resolve) => {
      scene.tweens.add({
        targets: arc,
        t: 1,
        duration: o.ms,
        ease: "Linear",
        onUpdate: () => {
          if (!this.scene) return
          const s = Math.sin(arc.t * Math.PI)
          this.rig.y = base - s * this.size * hopH
          // В воздухе тело вытягивается, у кавалерии раскачивается вперёд-назад (галоп)
          this.rig.scaleY = 1 + s * 0.08
          this.rig.scaleX = 1 - s * 0.05
          this.rig.angle = Math.sin(arc.t * Math.PI * 2) * rock * this.facing * (this.gait === "cavalry" ? 1 : 0.5)
          this.syncShadow()
        },
        onComplete: () => resolve()
      })
    })
    return Promise.all([move, jump]).then(async () => {
      if (!this.scene) return
      this.rig.setY(base).setAngle(0)
      this.syncShadow()
      o.onLand?.()
      // Приземление: сплющивание, у брони — сильнее
      const sq = this.gait === "armored" ? 0.8 : 0.86
      await tween(scene, {
        targets: this.rig,
        scaleX: 2 - sq,
        scaleY: sq,
        duration: Math.min(60, o.ms * 0.4),
        ease: "Quad.easeOut"
      })
      if (!this.scene) return
      scene.tweens.add({
        targets: this.rig,
        scaleX: 1,
        scaleY: 1,
        duration: o.last ? 160 : 60,
        ease: o.last ? "Back.easeOut" : "Quad.easeOut"
      })
    })
  }

  /** Сменить позу (текстуру). Если текстура ещё не готова — подгрузить и применить, когда поза всё ещё актуальна. */
  setPose(pose: Pose): void {
    if (!this.scene) return
    if (this.dead && pose !== "dead") return
    this.pose = pose
    if (!this.sprite) return
    const key = unitTexKey(this.unit, pose, "map")
    if (hasTexture(this.scene, key)) {
      this.sprite.setTexture(key)
      this.resize(this.size)
      return
    }
    void ensureUnitTexture(this.scene, this.unit, pose, "map").then((k) => {
      if (!this.scene || !this.sprite || this.pose !== pose) return
      this.sprite.setTexture(k)
      this.resize(this.size)
    })
  }

  /** Анимация бега: чередование idle/run. */
  setRunning(on: boolean): void {
    if (!this.scene) return
    if (on) {
      if (this.runTimer || this.dead) return
      if (this.blinkBack) {
        this.blinkBack.remove(false)
        this.blinkBack = null
      }
      this.runFrame = 0
      this.setPose("run")
      this.runTimer = this.scene.time.addEvent({
        delay: RUN_FRAME_MS,
        loop: true,
        callback: () => {
          if (!this.scene) return
          this.runFrame = (this.runFrame + 1) % 2
          this.setPose(this.runFrame === 0 ? "run" : "idle")
        }
      })
      return
    }
    if (this.runTimer) {
      this.runTimer.remove(false)
      this.runTimer = null
    }
    if (!this.dead) this.setPose("idle")
  }

  /** Поза «больно» на duration мс + короткая белая вспышка. */
  hitFlash(duration: number): void {
    if (!this.scene) return
    this.hurtTimer?.remove(false)
    this.hurtTimer = null
    if (!this.dead) this.setPose("hurt")
    const target: Phaser.GameObjects.Image | null = this.sprite ?? this.disc
    target?.setTintFill(0xffffff)
    this.emoji?.setAlpha(0.2)
    this.scene.time.delayedCall(Math.min(70, duration), () => {
      if (!this.scene) return
      if (this.sprite) this.sprite.clearTint()
      else this.disc?.setTint(this.furColor)
      this.emoji?.setAlpha(1)
    })
    this.hurtTimer = this.scene.time.delayedCall(duration, () => {
      this.hurtTimer = null
      if (!this.scene || this.dead) return
      if (this.runTimer) return
      this.setPose("idle")
    })
  }

  /** Поза смерти (вращение/падение делает презентер). */
  setDead(): void {
    if (!this.scene) return
    this.hurtTimer?.remove(false)
    this.hurtTimer = null
    if (this.runTimer) {
      this.runTimer.remove(false)
      this.runTimer = null
    }
    this.dead = false
    this.setPose("dead")
    this.dead = true
    this.pauseLife()
    this.blinkTimer?.remove(false)
    this.blinkTimer = null
    this.hopTween?.stop()
    this.hopTween = null
    this.setSelected(false)
    for (const t of this.hitTweens) t.stop()
    this.hitTweens = []
    if (this.actedFx && this.sprite?.preFX) this.sprite.preFX.remove(this.actedFx as unknown as Phaser.FX.Controller)
    this.actedFx = null
  }

  /** Подсветка «сюда нельзя» при перетаскивании. */
  setInvalidTint(on: boolean): void {
    if (!this.scene) return
    this.invalidTint = on
    if (this.sprite) {
      if (on) this.sprite.setTint(0xffb3b3)
      else this.sprite.clearTint()
    }
    else this.disc?.setTint(on ? 0xff9f9f : this.furColor)
  }

  get isLifted(): boolean {
    return this.lifted
  }

  private killLift(): void {
    for (const t of this.liftTweens) t.stop()
    this.liftTweens = []
  }

  /**
   * Взять «за шкирку» (on) или опустить (off): тело поднимается на 0.45 клетки, растёт до 1.12,
   * наклоняется на −8°, поза carried; тень остаётся на земле и уменьшается.
   */
  setLifted(on: boolean, duration = 120): void {
    if (!this.scene || this.lifted === on) return
    this.lifted = on
    this.killLift()
    const size = this.size
    if (on) {
      this.pauseLife()
      this.hopTween?.stop()
      this.hopTween = null
      if (!this.dead) this.setPose("carried")
      this.liftTweens.push(
        this.scene.tweens.add({
          targets: this.rig,
          y: -size * 0.45,
          scaleX: 1.12,
          scaleY: 1.12,
          angle: -8,
          duration,
          ease: "Back.easeOut"
        }),
        this.scene.tweens.add({
          targets: this.shadow,
          displayWidth: size * 0.7 * 0.7,
          displayHeight: size * 0.25 * 0.7,
          alpha: 0.35,
          duration,
          ease: "Quad.easeOut"
        })
      )
      return
    }
    this.setInvalidTint(false)
    if (!this.dead && !this.runTimer) this.setPose("idle")
    this.liftTweens.push(
      this.scene.tweens.add({
        targets: this.rig,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        angle: 0,
        duration,
        ease: "Quad.easeIn",
        onComplete: () => this.resumeLife()
      }),
      this.scene.tweens.add({
        targets: this.shadow,
        displayWidth: size * 0.7,
        displayHeight: size * 0.25,
        alpha: 0.55,
        duration,
        ease: "Quad.easeIn"
      })
    )
  }

  /* ---------- Доступ для анимаций гибели (deathFx) ---------- */

  /** Контейнер тела: его двигают/вращают/масштабируют варианты гибели. */
  bodyRig(): Phaser.GameObjects.Container {
    return this.rig
  }

  /** Спрайт миниатюры (null, пока показан плейсхолдер). */
  bodyImage(): Phaser.GameObjects.Image | null {
    return this.sprite
  }

  /** Локальный Y лап относительно контейнера тела. */
  feetLocalY(): number {
    return this.size * 0.36
  }

  /** Спрятать HP, значки и тень — тело остаётся для анимации гибели. */
  hideHud(): void {
    if (!this.scene) return
    this.hpBar.setVisible(false)
    this.hpText.setVisible(false)
    this.cdBadge.setVisible(false)
    this.moveGlyph.setVisible(false)
    this.shadow.setAlpha(0)
  }

  /** Мировые координаты лап (для пыли). */
  feetWorld(): { x: number, y: number } {
    const m = this.getWorldTransformMatrix()
    const p = m.transformPoint(0, this.size * 0.36)
    return { x: p.x, y: p.y }
  }

  /**
   * Шлепок на клетку: сплющивание, отскок, облачко пыли и «отряхивание» (покачивание ±9°).
   * Контейнер к этому моменту уже стоит на центре клетки.
   */
  async playLanding(): Promise<void> {
    if (!this.scene) return
    for (const t of this.landingTweens) t.stop()
    this.landingTweens = []
    this.killLift()
    this.lifted = false
    this.pauseLife()
    this.setInvalidTint(false)
    this.rig.setPosition(0, 0).setAngle(0)
    this.shadow.setAlpha(0.55)
    this.resize(this.size)
    if (!this.dead && !this.runTimer) this.setPose("idle")
    const feet = this.feetWorld()
    dustPuff(this.scene, feet.x, feet.y, this.size)
    await tween(this.scene, { targets: this.rig, scaleX: 1.22, scaleY: 0.78, duration: 70, ease: "Quad.easeOut" })
    if (!this.scene) return
    await tween(this.scene, { targets: this.rig, scaleX: 0.95, scaleY: 1.05, duration: 90, ease: "Quad.easeInOut" })
    if (!this.scene) return
    await tween(this.scene, { targets: this.rig, scaleX: 1, scaleY: 1, duration: 80, ease: "Quad.easeOut" })
    if (!this.scene) return
    // Отряхнуться
    const steps: { angle: number, sx: number, d: number }[] = [
      { angle: -9, sx: 1.04, d: 80 },
      { angle: 9, sx: 0.97, d: 90 },
      { angle: -6, sx: 1.03, d: 80 },
      { angle: 6, sx: 0.98, d: 70 },
      { angle: 0, sx: 1, d: 60 }
    ]
    for (const st of steps) {
      if (!this.scene) return
      await tween(this.scene, {
        targets: this.rig,
        angle: st.angle,
        scaleX: st.sx,
        duration: st.d,
        ease: "Sine.easeInOut"
      })
    }
    if (this.scene) {
      this.rig.setAngle(0).setScale(1)
      this.resumeLife()
    }
  }

  override destroy(fromScene?: boolean): void {
    this.runTimer?.remove(false)
    this.hurtTimer?.remove(false)
    this.runTimer = null
    this.hurtTimer = null
    this.killLift()
    for (const t of this.landingTweens) t.stop()
    this.breath?.stop()
    this.breath = null
    this.blinkTimer?.remove(false)
    this.blinkBack?.remove(false)
    this.blinkTimer = null
    this.blinkBack = null
    this.hopTween?.stop()
    this.hopTween = null
    this.sway?.stop()
    this.bob?.stop()
    this.flipTween?.stop()
    for (const t of this.selTweens) t.stop()
    for (const t of this.hitTweens) t.stop()
    this.sway = null
    this.bob = null
    super.destroy(fromScene)
  }

  private redrawHp(): void {
    if (!this.scene) return
    const g = this.hpBar
    g.clear()
    if (!this.showHp) return
    const w = this.size * 0.78
    const h = Math.max(3, this.size * 0.09)
    const x = -w / 2
    const y = this.size * 0.38
    const pct = Math.max(0, Math.min(1, this.hp / this.maxHp))
    g.fillStyle(0x000000, 0.7)
    g.fillRect(x - 1, y - 1, w + 2, h + 2)
    g.fillStyle(0x333333, 1)
    g.fillRect(x, y, w, h)
    g.fillStyle(hpColor(pct), 1)
    g.fillRect(x, y, w * pct, h)
    this.hpText.setText(String(this.hp))
  }
}
