import Phaser from "phaser"
import type { BattleEvent, BattleState, BattleUnit, Pos, Side, Strike, UnitInstance } from "@game/core/types"
import { terrainAt } from "@game/core/battle/query"
import { biomeDef } from "@game/content/biomes"
import { unitClass } from "@game/content/classes"
import { WEAPON_COLOR } from "@game/content/weapons"
import { specialDef } from "@game/content/skills/specials"
import { displayName, unitClassName } from "@game/core/units"
import { haptic } from "@game/platform/haptics"
import type { CritterPart, Pose } from "@game/art/index"
import { deathSeed, pickDeathVariant, playDeathCine, preloadDeathParts, type DeathCtx } from "./deathFx"
import { ensureTextures, TEX } from "./textures"
import { FONT, WEAPON_COLOR_HEX, hpColor, textStyle } from "./style"
import { floatText, ghostRise, tween, wait } from "./fx"
import { hitGore, screenBloodSplat } from "./gore"
import { bigNumber, ensureMotionTextures, goreKindOfUnit, hitStop, shakeCam, shakeMul, speedLines } from "./motionFx"
import { WeatherLayer } from "./weather"
import { impactFeel, playAttackFx, weaponKindOfUnit } from "./attackFx"
import {
  backdropTexKey,
  ensureBackdropTexture,
  ensureUnitTextures,
  hasTexture,
  unitTexKey,
  withTimeout
} from "./svgTextures"
import { FUR_PALETTES } from "@game/content/appearance"

export const CINEMATIC_SCENE_KEY = "Cinematic"

export type CombatEvent = Extract<BattleEvent, { type: "combat" }>

export interface CinematicData {
  event: CombatEvent
  before: BattleState
  after: BattleState
  speed: number
  resolve: () => void
}

/** Пропорция текстуры миниатюры и доля высоты, где лапы. */
const ART_RATIO = 120 / 140
const FEET_Y = 0.97
const ART_WAIT_MS = 2500

interface Fighter {
  id: string
  unit: UnitInstance
  side: Side
  sprite: Phaser.GameObjects.Image
  /** Есть ли текстуры поз (иначе — плейсхолдер-диск без смены поз). */
  posed: boolean
  pose: Pose
  dead: boolean
  hurtTimer: Phaser.Time.TimerEvent | null
  weaponColor: number
  /** Итоговая позиция лап. */
  x: number
  feetY: number
  /** Высота миниатюры на экране. */
  height: number
  hp: number
  /** «Утекающая» часть полоски: догоняет hp с задержкой. */
  ghostHp: number
  maxHp: number
  bar: Phaser.GameObjects.Graphics
  hpText: Phaser.GameObjects.Text
  barX: number
  barW: number
  onLeft: boolean
}

export class CinematicScene extends Phaser.Scene {
  private cine!: CinematicData
  private skipped = false
  private fighters = new Map<string, Fighter>()
  private speed = 1
  private blinkTimers: Phaser.Time.TimerEvent[] = []
  private weather: WeatherLayer | null = null
  /** Текстуры частей тела для бойцов, которые погибнут в этом бою (разлёт, хвост в луже). */
  private parts = new Map<string, Record<CritterPart, string>>()
  /** Половины фона: сдвигаются против рывка (параллакс). */
  private backdrops: Phaser.GameObjects.GameObject[] = []
  private topY = 0

  constructor() {
    super(CINEMATIC_SCENE_KEY)
  }

  init(data: CinematicData): void {
    this.cine = data
    this.skipped = false
    this.speed = Math.max(0.25, data.speed)
    this.fighters.clear()
    this.tweens.timeScale = 1
    this.time.timeScale = 1
  }

  create(): void {
    ensureTextures(this)
    ensureMotionTextures(this)
    this.backdrops = []
    // Во время create() сцена ещё в статусе CREATING и sys.isActive() === false:
    // хелперы tween/wait пропустили бы первое затемнение. Стартуем на следующем тике.
    this.time.delayedCall(0, () => void this.run())
  }

  private skip = (): void => {
    if (this.skipped) return
    this.skipped = true
    this.tweens.timeScale = 40
    this.time.timeScale = 40
  }

  /** Центр туловища бойца (для чисел урона и крови). */
  private bodyY(f: Fighter): number {
    return f.sprite.y - f.height * 0.45
  }

  private setPose(f: Fighter, pose: Pose): void {
    if (!this.sys || !f.posed) return
    if (f.dead && pose !== "dead") return
    f.pose = pose
    const key = unitTexKey(f.unit, pose, "cine")
    if (hasTexture(this, key)) f.sprite.setTexture(key)
    const h = f.height
    f.sprite.setDisplaySize(h * ART_RATIO, h)
  }

  private hurt(f: Fighter, ms: number): void {
    f.hurtTimer?.remove(false)
    f.hurtTimer = null
    if (!f.dead) this.setPose(f, "hurt")
    f.sprite.setTintFill(0xffffff)
    this.time.delayedCall(Math.min(70, ms), () => {
      if (f.sprite.scene) f.sprite.clearTint()
    })
    f.hurtTimer = this.time.delayedCall(ms, () => {
      f.hurtTimer = null
      if (!f.dead) this.setPose(f, "idle")
    })
  }

  private async run(): Promise<void> {
    const { event, before, after } = this.cine
    const w = this.scale.width
    const h = this.scale.height
    const biome = biomeDef(before.map.biomeId)
    const feetY = h * 0.62
    const size = Math.min(w, h) * 0.6

    // Подложка с запасом (канвас может изменить размер во время сцены) и чёрное затемнение.
    const groundCol = Phaser.Display.Color.IntegerToColor(biome.colors.plain)
    const groundDark = groundCol.clone().darken(35).color
    this.add.rectangle(w / 2, h / 2, w * 3, h * 5, groundDark, 1).setDepth(-1)
    const fade = this.add.rectangle(w / 2, h / 2, w * 3, h * 5, 0x000000, 1).setDepth(50)

    const aBu = before.units[event.attackerId]
    const dBu = before.units[event.defenderId]
    const aUnit = after.roster[event.attackerId] ?? before.roster[event.attackerId]
    const dUnit = after.roster[event.defenderId] ?? before.roster[event.defenderId]
    if (!aBu || !dBu || !aUnit || !dUnit) return this.finish()

    const attackerLeft = aBu.side === "player" || aBu.side === dBu.side
    const leftPos: Pos = attackerLeft ? event.attackerPos : event.defenderPos
    const rightPos: Pos = attackerLeft ? event.defenderPos : event.attackerPos
    const leftTerrain = terrainAt(before, leftPos)
    const rightTerrain = terrainAt(before, rightPos)

    // Фон по клеткам бойцов и текстуры поз — пока экран затемнён.
    const halfW = Math.ceil(w / 2) + 1
    await withTimeout(
      Promise.all([
        ensureBackdropTexture(this, biome.id, leftTerrain, "left", halfW, h),
        ensureBackdropTexture(this, biome.id, rightTerrain, "right", halfW, h),
        ensureUnitTextures(this, aUnit, "cine"),
        ensureUnitTextures(this, dUnit, "cine"),
        // Части тела только тем, кто погибнет: нужны для разлёта и «хвоста из лужи».
        event.defenderHpAfter <= 0
          ? preloadDeathParts(this, dUnit, "cine", 1500).then(p => p && this.parts.set(dUnit.id, p))
          : Promise.resolve(),
        event.attackerHpAfter <= 0
          ? preloadDeathParts(this, aUnit, "cine", 1500).then(p => p && this.parts.set(aUnit.id, p))
          : Promise.resolve()
      ]),
      ART_WAIT_MS
    )
    if (!this.sys || !this.sys.isActive()) return

    this.drawBackdrop(biome.id, leftTerrain, rightTerrain, w, h, halfW)
    // Та же погода, что на поле, но реже: над фоном, под бойцами.
    this.weather?.destroy()
    this.weather = new WeatherLayer(this, biome.weather, {
      depth: 2,
      densityMul: 0.6,
      maxParticles: 24,
      windDir: before.map.seed % 2 === 0 ? 1 : -1
    })

    const leftX = w * 0.27
    const rightX = w * 0.73
    const mk = (id: string, unit: UnitInstance, bu: BattleUnit, hpBefore: number, onLeft: boolean): Fighter => {
      const x = onLeft ? leftX : rightX
      const idleKey = unitTexKey(unit, "idle", "cine")
      const posed = hasTexture(this, idleKey)
      const sprite = this.add.image(x + (onLeft ? -w : w), feetY, posed ? idleKey : TEX.disc).setDepth(10)
      if (posed) {
        sprite.setOrigin(0.5, FEET_Y)
        sprite.setDisplaySize(size * ART_RATIO, size)
      }
      else {
        sprite.setOrigin(0.5, 1)
        sprite.setTint(FUR_PALETTES[unit.appearance.furPalette]?.color ?? 0xcccccc)
        sprite.setDisplaySize(size * 0.5, size * 0.5)
      }
      sprite.setFlipX(!onLeft)
      const weaponColor = WEAPON_COLOR_HEX[WEAPON_COLOR[unit.weaponSkill]]
      const barW = w * 0.42
      const barX = onLeft ? w * 0.04 : w * 0.54
      const topY = h * 0.07
      this.add
        .text(
          barX + (onLeft ? 0 : barW),
          topY - 2,
          displayName(unit),
          textStyle(Math.min(16, w * 0.04), "#fff", true, 3)
        )
        .setOrigin(onLeft ? 0 : 1, 1)
        .setDepth(20)
      this.add
        .text(
          barX + (onLeft ? 0 : barW),
          topY + 26,
          `${unitClassName(unit)} · ур. ${unit.level}`,
          textStyle(Math.min(12, w * 0.03), "#d0d0d0", false, 2)
        )
        .setOrigin(onLeft ? 0 : 1, 0)
        .setDepth(20)
      const bar = this.add.graphics().setDepth(20)
      const hpText = this.add
        .text(barX + (onLeft ? barW : 0), topY + 11, "", textStyle(13, "#fff", true, 3))
        .setOrigin(onLeft ? 1 : 0, 0.5)
        .setDepth(21)
      hpText.setX(onLeft ? barX + barW - 4 : barX + 4)
      const f: Fighter = {
        id,
        unit,
        side: bu.side,
        sprite,
        posed,
        pose: "idle",
        dead: false,
        hurtTimer: null,
        weaponColor,
        x,
        feetY,
        height: size,
        hp: hpBefore,
        ghostHp: hpBefore,
        maxHp: bu.maxHp,
        bar,
        hpText,
        barX,
        barW,
        onLeft
      }
      this.drawBar(f, topY)
      return f
    }
    const topY = h * 0.07
    this.topY = topY
    const fa = mk(event.attackerId, aUnit, aBu, event.attackerHpBefore, attackerLeft)
    const fd = mk(event.defenderId, dUnit, dBu, event.defenderHpBefore, !attackerLeft)
    this.fighters.set(fa.id, fa)
    this.fighters.set(fd.id, fd)

    // Цветная полоска оружия под именем
    for (const f of [fa, fd]) {
      const g = this.add.graphics().setDepth(20)
      g.fillStyle(f.weaponColor, 1)
      g.fillRect(f.barX, topY + 22, f.barW, 3)
    }
    // Треугольник
    const tri = event.strikes[0]?.triangle ?? "neutral"
    if (tri !== "neutral") {
      const sym = tri === "adv" ? "▲" : "▼"
      this.add
        .text(w / 2, topY + 8, sym, textStyle(22, tri === "adv" ? "#2ec4b6" : "#e63946", true, 3))
        .setOrigin(0.5)
        .setDepth(21)
    }

    this.input.on("pointerdown", this.skip)
    this.startBlinking([fa, fd])

    // Въезд: камера наезжает, бойцы влетают со скоростными линиями, между ними вспыхивает «VS»
    const cam = this.cameras.main
    cam.setZoom(1.18)
    this.tweens.add({ targets: cam, zoom: 1, duration: 420 / this.speed, ease: "Cubic.easeOut" })
    await tween(this, { targets: fade, alpha: 0, duration: 220 / this.speed })
    this.setPose(fa, "run")
    this.setPose(fd, "run")
    speedLines(this, w / 2, feetY - size * 0.4, w, size * 0.9, 1, this.speed, 8, 3)
    speedLines(this, w / 2, feetY - size * 0.4, w, size * 0.9, -1, this.speed, 8, 3)
    await Promise.all([
      tween(this, { targets: fa.sprite, x: fa.x, duration: 220 / this.speed, ease: "Back.easeOut" }),
      tween(this, { targets: fd.sprite, x: fd.x, duration: 220 / this.speed, ease: "Back.easeOut" })
    ])
    this.setPose(fa, "idle")
    this.setPose(fd, "idle")
    this.vsFlash(w / 2, feetY - size * 0.55)
    await wait(this, 220 / this.speed)

    for (const strike of event.strikes) {
      const atk = this.fighters.get(strike.attackerId)
      const def = this.fighters.get(strike.defenderId)
      if (!atk || !def) continue
      await this.playStrike(strike, atk, def, topY)
      if (def.hp <= 0 || atk.hp <= 0) break
    }

    // Смерть и радость выжившего
    let someoneDied = false
    for (const f of [fa, fd]) {
      if (f.hp <= 0) {
        someoneDied = true
        await this.death(f)
      }
    }
    if (someoneDied) {
      for (const f of [fa, fd]) if (f.hp > 0) this.setPose(f, "happy")
    }
    await wait(this, 300 / this.speed)
    await tween(this, { targets: fade, alpha: 1, duration: 220 / this.speed })
    this.finish()
  }

  /** Две половины фона: слева — клетка левого бойца, справа — правого. */
  private drawBackdrop(
    biomeId: string,
    leftTerrain: ReturnType<typeof terrainAt>,
    rightTerrain: ReturnType<typeof terrainAt>,
    w: number,
    h: number,
    halfW: number
  ): void {
    const biome = biomeDef(biomeId)
    const draw = (terrain: ReturnType<typeof terrainAt>, side: "left" | "right", x: number): void => {
      const key = backdropTexKey(biomeId, terrain, side, halfW, Math.round(h))
      if (hasTexture(this, key)) {
        // С запасом по ширине — под сдвиг параллакса
        const img = this.add
          .image(x - halfW * 0.03, 0, key)
          .setOrigin(0, 0)
          .setDisplaySize(halfW * 1.06, h)
          .setDepth(0)
        this.backdrops.push(img)
      }
      else {
        // Фолбэк: простой градиент биома.
        const g = this.add.graphics().setDepth(0)
        const sky = Phaser.Display.Color.IntegerToColor(biome.bg)
        const dark = sky.clone().darken(45).color
        g.fillGradientStyle(dark, dark, biome.bg, biome.bg, 1)
        g.fillRect(x, 0, halfW, h * 0.52)
        g.fillStyle(biome.colors[terrain] ?? biome.colors.plain, 1)
        g.fillRect(x, h * 0.52, halfW, h * 0.48)
      }
    }
    draw(leftTerrain, "left", 0)
    draw(rightTerrain, "right", Math.floor(w / 2) - 1)
    // Разделитель
    this.add.rectangle(w / 2, h / 2, 2, h, 0x000000, 0.35).setDepth(1)
  }

  private drawBar(f: Fighter, topY: number): void {
    const g = f.bar
    g.clear()
    const hgt = 12
    g.fillStyle(0x000000, 0.75)
    g.fillRect(f.barX - 2, topY - 2, f.barW + 4, hgt + 4)
    g.fillStyle(0x333333, 1)
    g.fillRect(f.barX, topY, f.barW, hgt)
    const pct = Math.max(0, Math.min(1, f.hp / f.maxHp))
    const ghost = Math.max(pct, Math.min(1, f.ghostHp / f.maxHp))
    // Потерянная часть сначала белая, затем «утекает» к текущему HP
    g.fillStyle(0xfff3b0, 1)
    if (f.onLeft) g.fillRect(f.barX, topY, f.barW * ghost, hgt)
    else g.fillRect(f.barX + f.barW * (1 - ghost), topY, f.barW * ghost, hgt)
    g.fillStyle(hpColor(pct), 1)
    if (f.onLeft) g.fillRect(f.barX, topY, f.barW * pct, hgt)
    else g.fillRect(f.barX + f.barW * (1 - pct), topY, f.barW * pct, hgt)
    // Блик сверху
    g.fillStyle(0xffffff, 0.25)
    g.fillRect(f.barX, topY, f.barW, Math.round(hgt * 0.35))
    f.hpText.setText(`${Math.max(0, Math.round(f.hp))}/${f.maxHp}`)
  }

  private async playStrike(strike: Strike, atk: Fighter, def: Fighter, topY: number): Promise<void> {
    const sp = this.speed
    const dir = def.onLeft ? -1 : 1 // сторона защищающегося
    const w = this.scale.width
    const defBodyY = this.bodyY(def)
    const atkBodyY = this.bodyY(atk)

    if (strike.special) {
      await this.cutIn(strike.special, atk)
    }
    if (strike.defenseSpecial && !strike.miracle) {
      floatText(this, def.sprite.x, defBodyY - 70, specialDef(strike.defenseSpecial).name, "#8ecae6", sp, {
        size: 14,
        rise: 20
      })
    }

    // Хореография по оружию: замах/бросок атакующего и фирменный эффект на цели.
    this.setPose(atk, "run")
    // Камера чуть подаётся к атакующему, фон уезжает против рывка (параллакс), летят скоростные линии
    const cam = this.cameras.main
    const lethal = strike.defenderHpAfter <= 0
    if (!this.skipped) {
      speedLines(this, w / 2, atkBodyY, w, atk.height * 0.8, dir, sp, 7, 3)
      for (const bg of this.backdrops)
        this.tweens.add({
          targets: bg,
          x: `-=${dir * w * 0.012}`,
          duration: 160 / sp,
          yoyo: true,
          ease: "Sine.easeInOut"
        })
      this.tweens.add({ targets: cam, zoom: 1.06, duration: 160 / sp, yoyo: true, ease: "Sine.easeInOut" })
    }
    const fx = playAttackFx({
      scene: this,
      kind: weaponKindOfUnit(atk.unit),
      attacker: atk.sprite,
      defender: def.sprite,
      atkPos: { x: atk.x, y: atkBodyY },
      defPos: { x: def.sprite.x, y: defBodyY },
      home: { x: atk.x, y: atk.feetY },
      dir,
      speed: sp,
      special: !!strike.special,
      effective: strike.effective,
      damage: strike.damage,
      size: atk.height,
      color: atk.weaponColor,
      skipped: this.skipped
    })
    await fx.impactAt
    // Контакт: хит-стоп, зум-удар, тряска по силе удара
    impactFeel(this, {
      special: !!strike.special,
      effective: strike.effective,
      damage: strike.damage,
      speed: sp,
      skipped: this.skipped,
      heavy: true
    })
    const frac = strike.damage / Math.max(1, def.maxHp)
    if (!this.skipped && strike.damage > 0) {
      hitStop(this, lethal || strike.special ? 120 : 70)
      shakeCam(this, 160 / sp, 6 + frac * 18)
      // Белая вспышка экрана на сильных ударах
      if (strike.special || frac >= 0.35 || lethal) {
        const flash = this.add
          .rectangle(w / 2, this.scale.height / 2, w * 3, this.scale.height * 3, 0xffffff, 0.5 * shakeMul())
          .setDepth(44)
        this.tweens.add({ targets: flash, fillAlpha: 0, duration: 180 / sp, onComplete: () => flash.destroy() })
      }
    }
    // Отлёт защищающегося от удара
    if (!this.skipped && !def.dead) {
      const kx = dir * def.height * (0.06 + Math.min(0.12, frac * 0.2))
      this.tweens.add({
        targets: def.sprite,
        x: def.x + kx,
        angle: dir * (6 + frac * 18),
        duration: 80 / sp,
        yoyo: true,
        hold: 60 / sp,
        ease: "Quad.easeOut",
        onComplete: () => def.sprite.scene && def.sprite.setAngle(0)
      })
    }
    this.hurt(def, 200 / sp)
    haptic(strike.special ? "heavy" : "medium")
    const dmgColor
      = strike.damage === 0 ? "#bbbbbb" : strike.special ? "#ffd166" : strike.effective ? "#ff6b6b" : "#ffffff"
    const dmgText = strike.damage === 0 ? "Хлоп!" : String(strike.damage)
    const big = strike.damage >= def.maxHp * 0.5
    bigNumber(this, def.sprite.x, defBodyY - 30, dmgText, dmgColor, big || lethal ? 58 : strike.special ? 50 : 42, sp, {
      crit: big || !!strike.special,
      depth: 46
    })
    if (strike.effective)
      floatText(this, def.sprite.x + 40, defBodyY - 90, "×1.5 ЭФФЕКТИВНО", "#ff6b6b", sp, { size: 14, rise: 22 })
    if (strike.damage > 0) {
      hitGore(this, {
        x: def.sprite.x,
        y: defBodyY,
        size: def.height,
        dirX: dir,
        dirY: -0.15,
        damage: strike.damage,
        maxHp: def.maxHp,
        lethal,
        speed: sp,
        depth: 24,
        ground: { x: def.x, y: def.feetY },
        kind: goreKindOfUnit(atk.unit)
      })
      if (frac >= 0.4 || lethal) screenBloodSplat(this, Math.min(1, frac + (lethal ? 0.4 : 0)), sp)
    }
    if (strike.healed > 0)
      floatText(this, atk.sprite.x, atkBodyY - 50, `+${strike.healed}`, "#80ed99", sp, { size: 22, rise: 28 })
    if (strike.miracle) {
      floatText(this, def.sprite.x, defBodyY - 90, "1 HP!", "#ffd700", sp, { size: 28, rise: 30 })
      this.cameras.main.flash(200 / sp, 255, 215, 0)
    }
    // HP: полоска сразу падает, белая «утечка» догоняет после паузы
    def.hp = strike.defenderHpAfter
    atk.hp = strike.attackerHpAfter
    this.drawBar(def, topY)
    this.drawBar(atk, topY)
    this.leakBar(def, topY, sp)
    this.leakBar(atk, topY, sp)
    // Добивающий удар: slow-mo и наезд камеры на жертву
    if (lethal && !this.skipped) await this.killCam(def, sp)
    // Отход (возврат на место — часть хореографии оружия)
    await fx.done
    if (!atk.dead) this.setPose(atk, "idle")
  }

  /** «Утечка» полоски HP: белая часть догоняет текущий HP после паузы. */
  private leakBar(f: Fighter, topY: number, sp: number): void {
    if (f.ghostHp <= f.hp) {
      f.ghostHp = f.hp
      return
    }
    const st = { v: f.ghostHp }
    this.tweens.add({
      targets: st,
      v: f.hp,
      delay: 320 / sp,
      duration: 380 / sp,
      ease: "Quad.easeIn",
      onUpdate: () => {
        f.ghostHp = st.v
        if (f.bar.scene) this.drawBar(f, topY)
      },
      onComplete: () => {
        f.ghostHp = f.hp
        if (f.bar.scene) this.drawBar(f, topY)
      }
    })
  }

  /** Slow-mo добивающего удара: время замедляется, камера наезжает на жертву и возвращается. */
  private async killCam(f: Fighter, sp: number): Promise<void> {
    const cam = this.cameras.main
    const w = this.scale.width
    const h = this.scale.height
    const prevT = this.tweens.timeScale
    if (prevT >= 10) return
    this.tweens.timeScale = 0.35
    const zoom = { z: cam.zoom }
    const tx = (f.sprite.x - w / 2) * 0.35
    const ty = (this.bodyY(f) - h / 2) * 0.35
    this.tweens.add({ targets: zoom, z: 1.22, duration: 90 / sp, onUpdate: () => cam.setZoom(zoom.z) })
    cam.pan(w / 2 + tx, h / 2 + ty, 220 / sp, "Sine.easeOut")
    await wait(this, 520 / sp)
    if (!this.sys || !this.sys.isActive()) return
    if (this.tweens.timeScale === 0.35) this.tweens.timeScale = prevT
    cam.pan(w / 2, h / 2, 260 / sp, "Sine.easeInOut")
    this.tweens.add({ targets: zoom, z: 1, duration: 260 / sp, onUpdate: () => cam.setZoom(zoom.z) })
  }

  /** Вспышка «VS» между бойцами на входе. */
  private vsFlash(x: number, y: number): void {
    if (this.skipped) return
    const t = this.add
      .text(x, y, "VS", {
        ...textStyle(Math.min(56, this.scale.width * 0.12), "#ffffff", true, 8),
        fontStyle: "bold italic"
      })
      .setOrigin(0.5)
      .setDepth(30)
      .setScale(3)
      .setAlpha(0)
      .setAngle(-12)
    this.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 140 / this.speed, ease: "Back.easeOut" })
    this.tweens.add({
      targets: t,
      scale: 1.4,
      alpha: 0,
      duration: 260 / this.speed,
      delay: 260 / this.speed,
      onComplete: () => t.destroy()
    })
    shakeCam(this, 90 / this.speed, 5)
  }

  private async cutIn(specialId: string, atk: Fighter): Promise<void> {
    const sp = this.speed
    const w = this.scale.width
    const h = this.scale.height
    const overlay = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0).setDepth(40)
    const band = this.add.rectangle(atk.onLeft ? -w : w * 2, h * 0.42, w, h * 0.16, atk.weaponColor, 0.95).setDepth(41)
    const name = specialDef(specialId).name
    const label = this.add
      .text(band.x, band.y, name, {
        fontFamily: FONT,
        fontSize: `${Math.round(Math.min(28, w * 0.07))}px`,
        color: "#fff",
        fontStyle: "bold",
        stroke: "#000",
        strokeThickness: 5
      })
      .setOrigin(0.5)
      .setDepth(42)
    const portrait = this.add
      .text(band.x, band.y, atk.side === "player" ? "🐾" : "💢", textStyle(40, "#fff", false, 0))
      .setOrigin(0.5)
      .setDepth(42)
      .setAlpha(0.6)
    portrait.setX(band.x + (atk.onLeft ? -w * 0.36 : w * 0.36))
    haptic("heavy")
    speedLines(this, w / 2, h * 0.42, w, h * 0.3, atk.onLeft ? 1 : -1, sp, 14, 41)
    this.tweens.add({ targets: overlay, fillAlpha: 0.55, duration: 120 / sp })
    await tween(this, { targets: [band, label], x: w / 2, duration: 160 / sp, ease: "Cubic.easeOut" })
    this.tweens.add({ targets: portrait, x: w / 2 + (atk.onLeft ? -w * 0.36 : w * 0.36), duration: 160 / sp })
    // Портрет бойца на полосе (если есть текстура позы) и вспышка
    const key = unitTexKey(atk.unit, "happy", "cine")
    let face: Phaser.GameObjects.Image | null = null
    if (hasTexture(this, key)) {
      face = this.add
        .image(atk.onLeft ? -w * 0.3 : w * 1.3, h * 0.42, key)
        .setDepth(42)
        .setFlipX(!atk.onLeft)
      face.setDisplaySize(h * 0.24 * ART_RATIO, h * 0.24)
      this.tweens.add({ targets: face, x: atk.onLeft ? w * 0.16 : w * 0.84, duration: 180 / sp, ease: "Back.easeOut" })
    }
    const flash = this.add.rectangle(w / 2, h / 2, w, h, 0xffffff, 0.55 * shakeMul()).setDepth(43)
    this.tweens.add({ targets: flash, fillAlpha: 0, duration: 220 / sp, onComplete: () => flash.destroy() })
    this.tweens.add({ targets: label, scale: { from: 1.3, to: 1 }, duration: 160 / sp, ease: "Back.easeOut" })
    await wait(this, 320 / sp)
    await tween(this, {
      targets: [band, label, portrait, overlay, ...(face ? [face] : [])],
      alpha: 0,
      duration: 120 / sp
    })
    face?.destroy()
    overlay.destroy()
    band.destroy()
    label.destroy()
    portrait.destroy()
  }

  private async death(f: Fighter): Promise<void> {
    const sp = this.speed
    const unit = this.cine.after.roster[f.id] ?? this.cine.before.roster[f.id]
    const isPlayer = f.side === "player"
    const size = f.height
    const bodyY = this.bodyY(f)
    f.hurtTimer?.remove(false)
    f.hurtTimer = null
    f.dead = false
    this.setPose(f, "dead")
    f.dead = true
    if (isPlayer) haptic("error")
    // Вариант гибели: тот же seed, что и на карте (юнит + ход), с уклоном под оружие убийцы.
    const killer = [...this.fighters.values()].find(o => o.id !== f.id)
    const killerKind = killer ? weaponKindOfUnit(killer.unit) : undefined
    const variant = pickDeathVariant(deathSeed(f.id, this.cine.before.turn), killerKind, unitClass(f.unit).moveType)
    let pooled = false
    const ctx: DeathCtx = {
      scene: this,
      variant,
      sprite: f.sprite,
      unit: f.unit,
      x: f.sprite.x,
      y: f.feetY,
      size,
      dir: f.onLeft ? -1 : 1,
      speed: sp,
      side: f.side,
      onPool: () => {
        if (pooled || !this.sys) return
        pooled = true
        const pool = this.add
          .image(f.x, f.feetY + 4, TEX.pool)
          .setTint(0xd9122b)
          .setAlpha(0)
          .setDepth(6)
          .setDisplaySize(size * 0.9, size * 0.4)
        this.tweens.add({ targets: pool, alpha: 0.9, duration: 400 / sp })
      }
    }
    const parts = this.parts.get(f.id)
    if (parts) ctx.parts = parts
    if (killerKind) ctx.killerKind = killerKind
    await playDeathCine(ctx)
    if (!this.sys || !this.sys.isActive()) return
    ctx.onPool?.()
    const word = isPlayer ? (unit?.gender === "f" ? "ПАЛА" : "ПАЛ") : unit?.gender === "f" ? "ГОТОВА" : "ГОТОВ"
    const w = this.scale.width
    const stampText = this.add
      .text(
        w / 2,
        this.scale.height * 0.35,
        word,
        textStyle(Math.min(48, w * 0.14), isPlayer ? "#ff4d6d" : "#f1f1f1", true, 7)
      )
      .setOrigin(0.5)
      .setDepth(45)
      .setScale(2.5)
      .setAlpha(0)
    const ghost = ghostRise(this, f.x, bodyY, size * 0.4, sp)
    await tween(this, { targets: stampText, scale: 1, alpha: 1, duration: 180 / sp, ease: "Back.easeIn" })
    await ghost
    await wait(this, (isPlayer ? 500 : 250) / sp)
  }

  /** Бойцы изредка моргают, пока стоят в позе idle. */
  private startBlinking(fs: Fighter[]): void {
    fs.forEach((f, i) => {
      const tick = (): void => {
        if (!this.sys || !this.sys.isActive()) return
        if (f.pose === "idle" && !f.dead && !f.hurtTimer) {
          this.setPose(f, "blink")
          this.blinkTimers.push(
            this.time.delayedCall(110, () => {
              if (f.pose === "blink" && !f.dead) this.setPose(f, "idle")
            })
          )
        }
        count++
        this.blinkTimers.push(this.time.delayedCall(2600 + ((count * 1237 + i * 911) % 1800), tick))
      }
      let count = 0
      this.blinkTimers.push(this.time.delayedCall(900 + i * 700, tick))
    })
  }

  private finish(): void {
    this.input.off("pointerdown", this.skip)
    this.weather?.destroy()
    this.weather = null
    for (const t of this.blinkTimers) t.remove(false)
    this.blinkTimers = []
    for (const f of this.fighters.values()) f.hurtTimer?.remove(false)
    const resolve = this.cine.resolve
    this.scene.stop()
    resolve()
  }
}
