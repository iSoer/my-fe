import type Phaser from "phaser"
import type { BattleEvent, BattleState, Pos } from "@game/core/types"
import { $save } from "@game/state/save"
import { $battleUi, type Presenter } from "@game/state/battleUi"
import { haptic } from "@game/platform/haptics"
import { MAP_SCENE_KEY, MapScene } from "./MapScene"
import { CINEMATIC_SCENE_KEY, type CinematicData, type CombatEvent } from "./CinematicScene"
import { banner, floatText, ghostRise, stamp, tween, wait } from "./fx"
import { specialDef } from "@game/content/skills/specials"
import { unitClass } from "@game/content/classes"
import type { CritterPart } from "@game/art/index"
import { deathSeed, pickDeathVariant, playDeathMap, preloadDeathParts, type DeathCtx } from "./deathFx"
import { playQuickAttackFx, shakePx, weaponKindOf, weaponKindOfUnit } from "./attackFx"
import { WEAPON_COLOR_HEX } from "./style"
import { weaponDef } from "@game/content/weapons"
import { hitGore, bloodTrail, screenBloodSplat } from "./gore"
import { unitTexKey } from "./svgTextures"
import {
  afterImages,
  bigNumber,
  buffRunes,
  danceFx,
  doubleStrikeMark,
  goreKindOfUnit,
  healPillar,
  hitStop,
  levelUpFx,
  portalSpawn,
  shakeCam,
  shockRing,
  slashTrail,
  sparks,
  specialCutIn,
  stepFx,
  thrustLine
} from "./motionFx"
import type { UnitView } from "./UnitView"

/** Проигрывает события боя на сцене карты (и в кинематике). Логики игры не содержит. */
export class GamePresenter implements Presenter {
  private seedCounter = 0
  /** Последний проигранный бой — чтобы в `died` знать убийцу и направление удара. */
  private lastCombat: CombatEvent | null = null
  /** Части тела (карта) для юнитов, которые погибнут в ближайшем бою. */
  private mapParts = new Map<string, Record<CritterPart, string>>()

  constructor(private readonly game: Phaser.Game) {}

  private mapScene(): MapScene | null {
    const s = this.game.scene.getScene(MAP_SCENE_KEY)
    return s instanceof MapScene ? s : null
  }

  private speed(): number {
    const settings = $save.get().settings
    return settings.animSpeed * ($battleUi.get().fastForward ? 3 : 1)
  }

  async play(events: BattleEvent[], before: BattleState, after: BattleState): Promise<void> {
    const map = this.mapScene()
    if (!map) return
    await Promise.race([map.ready, wait(map, 1500)])
    if (!map.sys.isActive()) return
    map.playing = true
    try {
      // Смещённый предпросмотр: вид уже стоит на клетке назначения — не дёргаем его назад,
      // событие moved начнёт анимацию с того места, где он стоит.
      const skip = map.beginPlayback()
      map.syncFromState(before, skip)
      const actor = this.enemyActor(events, before)
      if (actor) {
        map.flashActor(actor, this.speed())
        await wait(map, 220 / this.speed())
      }
      for (const ev of events) {
        if (!map.sys.isActive()) break
        await this.handle(ev, before, after, map)
      }
    }
    catch (e) {
      console.error("presenter", e)
    }
    finally {
      if (map.sys.isActive()) map.syncFromState(after)
      map.playing = false
    }
  }

  /** Id врага, чьё действие проигрывается (первое событие действия в фазе врага), иначе null. */
  private enemyActor(events: BattleEvent[], before: BattleState): string | null {
    if (before.phase !== "enemy") return null
    for (const ev of events) {
      let id: string | undefined
      if (ev.type === "moved" || ev.type === "assist" || ev.type === "waited") id = ev.unitId
      else if (ev.type === "combat") id = ev.attackerId
      else continue
      return before.units[id]?.side === "enemy" ? id : null
    }
    return null
  }

  private async handle(ev: BattleEvent, before: BattleState, after: BattleState, map: MapScene): Promise<void> {
    const sp = this.speed()
    switch (ev.type) {
      case "moved":
        return this.moved(ev.unitId, ev.path, before, map, sp)
      case "combat":
        // Кто-то погибнет — заранее растеризуем части тела для анимации гибели (с потолком 600 мс).
        this.lastCombat = ev
        for (const [id, hpAfter] of [
          [ev.defenderId, ev.defenderHpAfter],
          [ev.attackerId, ev.attackerHpAfter]
        ] as const) {
          const u = before.roster[id]
          if (u && hpAfter <= 0 && !this.mapParts.has(id)) {
            const parts = await preloadDeathParts(map, u, "map", 600)
            if (parts) this.mapParts.set(id, parts)
          }
        }
        return this.combat(ev, before, after, map, sp)
      case "died":
        return this.died(ev.unitId, ev.pos, ev.side, after, map, sp)
      case "loot": {
        // Выбитые Вкусняшки всплывают над местом гибели врага
        const c = map.center(ev.pos)
        floatText(map, c.x, c.y - map.tile * 0.2, `+${ev.amount} 🦴`, "#ffd166", sp, {
          size: map.tile * 0.3,
          rise: 34,
          duration: 900
        })
        return wait(map, 120 / sp)
      }
      case "effect":
        return this.effect(ev, map, sp)
      case "assist":
        return this.assist(ev, after, map, sp)
      case "item":
        return this.item(ev, after, map, sp)
      case "wallHit": {
        map.shakeTile(ev.pos)
        map.setWallHp(ev.pos, ev.hpAfter, sp)
        map.cameras.main.shake(80 / sp, 0.004)
        const c = map.center(ev.pos)
        floatText(map, c.x, c.y - map.tile * 0.3, ev.hpAfter > 0 ? "Хрясь!" : "Сломано!", "#ffd166", sp, {
          size: map.tile * 0.3
        })
        const view = map.units.get(ev.unitId)
        if (view) {
          const ox = view.x
          const oy = view.y
          await tween(map, {
            targets: view,
            x: ox + (c.x - ox) * 0.3,
            y: oy + (c.y - oy) * 0.3,
            duration: 120 / sp,
            yoyo: true
          })
        }
        haptic("light")
        return wait(map, 150 / sp)
      }
      case "phaseChanged":
        return banner(
          map,
          ev.phase === "player" ? `Ход ${ev.turn} · Ваша фаза` : `Ход ${ev.turn} · Фаза врага`,
          ev.phase === "player" ? 0xe63946 : 0xffffff,
          sp,
          450,
          {
            slash: true,
            blood: ev.phase === "enemy"
          }
        )
      case "reinforcements": {
        await banner(map, "Подкрепление!", 0xe63946, sp, 300, { slash: true, blood: true })
        // Каждый боец выходит из портала: вихрь, дым, вспышка, затем «вырастает» с пружиной
        const spawns = ev.unitIds.map(async (id, i) => {
          const bu = after.units[id]
          if (!bu) return
          await wait(map, (i * 110) / sp)
          const c = map.center(bu.pos)
          await portalSpawn(map, c.x, c.y, map.tile, sp)
          const view = map.ensureUnitView(id, after)
          if (!view) return
          view.setScale(0.2).setAlpha(0)
          this.tweenNoWait(map, { targets: view, scale: 1, alpha: 1, duration: 280 / sp, ease: "Back.easeOut" })
        })
        await Promise.all(spawns)
        return wait(map, 260 / sp)
      }
      case "levelUp": {
        const view = map.units.get(ev.unitId)
        if (view) {
          view.hop()
          haptic("success")
          await levelUpFx(map, view.x, view.y - map.tile * 0.1, map.tile, sp)
          return wait(map, 200 / sp)
        }
        return
      }
      case "xp":
        return
      case "waited":
        return wait(map, 60 / sp)
      case "battleEnded": {
        haptic(ev.result === "victory" ? "success" : ev.result === "defeat" ? "error" : "warning")
        // Победа: выжившие подпрыгивают от радости; поражение — кровь на экране
        if (ev.result === "victory") {
          for (const v of map.units.values()) if (v.side === "player") v.hop()
        }
        else if (ev.result === "defeat") screenBloodSplat(map, 1, sp)
        return map.showEnd(ev.result, sp)
      }
    }
  }

  private tweenNoWait(scene: Phaser.Scene, cfg: Phaser.Types.Tweens.TweenBuilderConfig): void {
    if (scene.sys.isActive()) scene.tweens.add(cfg)
  }

  private async moved(unitId: string, path: Pos[], state: BattleState, map: MapScene, sp: number): Promise<void> {
    const view = map.units.get(unitId)
    if (!view || path.length < 2) return
    view.setAlpha(1)
    const last = path[path.length - 1]
    const prevLast = path[path.length - 2]
    if (last) {
      const c = map.center(last)
      if (Math.abs(view.x - c.x) < 2 && Math.abs(view.y - c.y) < 2) {
        // Юнит уже стоит на месте (перетащили или выбрали клетку заранее) — без повторного пробега.
        if (prevLast && last.x !== prevLast.x) view.setFacing(last.x > prevLast.x ? 1 : -1)
        view.setDepth(10 + last.y * 0.01)
        return wait(map, 40 / sp)
      }
    }
    // Время на клетку по походке: кавалерия быстрее, броня тяжелее
    const perTile = view.gait === "cavalry" ? 105 : view.gait === "armored" ? 170 : view.gait === "flier" ? 120 : 135
    const heavyStep = view.gait === "armored" || view.gait === "cavalry"
    view.setRunning(true)
    for (let i = 1; i < path.length; i++) {
      const p = path[i]
      const prev = path[i - 1]
      if (!p) continue
      if (prev && p.x !== prev.x) view.setFacing(p.x > prev.x ? 1 : -1)
      const c = map.center(p)
      view.setDepth(10 + p.y * 0.01)
      const terrain = state.map.tiles[p.y]?.[p.x]
      await view.stepTo(c.x, c.y, {
        ms: perTile / sp,
        first: i === 1,
        last: i === path.length - 1,
        onLand: () => {
          if (!map.sys.isActive()) return
          const feet = view.feetWorld()
          if (view.gait !== "flier") stepFx(map, feet.x, feet.y, map.tile, terrain, state.map.biomeId, heavyStep)
          if (view.gait === "armored") shakeCam(map, 50 / sp, 1.5)
          // Раненый оставляет кровавый след
          if (view.hpFrac() < 0.5) bloodTrail(map, feet.x, feet.y, map.tile, sp, 2)
        }
      })
    }
    view.setRunning(false)
  }

  /** Повернуть двух бойцов лицом друг к другу (по горизонтали). */
  private faceEachOther(
    a: { x: number, setFacing(d: 1 | -1): void },
    b: { x: number, setFacing(d: 1 | -1): void }
  ): void {
    if (a.x === b.x) return
    a.setFacing(b.x > a.x ? 1 : -1)
    b.setFacing(a.x > b.x ? 1 : -1)
  }

  private useCinematic(ev: CombatEvent, before: BattleState): boolean {
    const mode = $save.get().settings.cinematic
    if (mode === "never") return false
    if (mode === "always") return true
    return before.units[ev.attackerId]?.side === "player"
  }

  private async combat(
    ev: CombatEvent,
    before: BattleState,
    after: BattleState,
    map: MapScene,
    sp: number
  ): Promise<void> {
    const aView = map.units.get(ev.attackerId)
    const dView = map.units.get(ev.defenderId)
    if (!aView || !dView) return
    this.faceEachOther(aView, dView)
    if (this.useCinematic(ev, before)) {
      await this.runCinematic(ev, before, after, map, sp)
      if (!map.sys.isActive() || !aView.scene || !dView.scene) return
      aView.setPose("idle")
      dView.setPose("idle")
      // Дублируем итог на карте
      const dealtToD = ev.defenderHpBefore - ev.defenderHpAfter
      const dealtToA = ev.attackerHpBefore - ev.attackerHpAfter
      if (dealtToD > 0) {
        floatText(map, dView.x, dView.y - map.tile * 0.5, String(dealtToD), "#fff", sp, { size: map.tile * 0.36 })
        map.addDecal(ev.defenderPos, "splat", this.seedCounter++)
      }
      if (dealtToA > 0) {
        floatText(map, aView.x, aView.y - map.tile * 0.5, String(dealtToA), "#fff", sp, { size: map.tile * 0.36 })
        map.addDecal(ev.attackerPos, "splat", this.seedCounter++)
      }
      aView.setHp(ev.attackerHpAfter, before.units[ev.attackerId]?.maxHp ?? 1)
      dView.setHp(ev.defenderHpAfter, before.units[ev.defenderId]?.maxHp ?? 1)
      return wait(map, 120 / sp)
    }
    // Быстрый режим на карте
    const aMax = before.units[ev.attackerId]?.maxHp ?? 1
    const dMax = before.units[ev.defenderId]?.maxHp ?? 1
    let prevAttacker = ""
    for (const strike of ev.strikes) {
      const atk = strike.attackerId === ev.attackerId ? aView : dView
      const def = strike.attackerId === ev.attackerId ? dView : aView
      const defMax = strike.attackerId === ev.attackerId ? dMax : aMax
      const atkUnit = before.roster[strike.attackerId]
      if (!map.sys.isActive() || !atk.scene || !def.scene) return
      await this.quickStrike(strike, atk, def, defMax, atkUnit, before, map, sp, prevAttacker === strike.attackerId)
      prevAttacker = strike.attackerId
      if (strike.defenderId === ev.defenderId) map.addDecal(ev.defenderPos, "splat", this.seedCounter++)
      else if (strike.damage > 0) map.addDecal(ev.attackerPos, "splat", this.seedCounter++)
      def.setHp(strike.defenderHpAfter, defMax)
      atk.setHp(strike.attackerHpAfter, strike.attackerId === ev.attackerId ? aMax : dMax)
      await wait(map, 90 / sp)
    }
  }

  /**
   * Один удар на карте: замах назад, рывок с остаточными образами, след оружия и эффект по виду оружия,
   * хит-стоп и отдача, кровь (API gore), крупная цифра урона, возврат с пружиной.
   */
  private async quickStrike(
    strike: CombatEvent["strikes"][number],
    atk: UnitView,
    def: UnitView,
    defMax: number,
    atkUnit: BattleState["roster"][string] | undefined,
    before: BattleState,
    map: MapScene,
    sp: number,
    second: boolean
  ): Promise<void> {
    const tile = map.tile
    const ox = atk.x
    const oy = atk.y
    const dx = def.x - ox
    const dy = def.y - oy
    const len = Math.hypot(dx, dy) || 1
    const ux = dx / len
    const uy = dy / len
    const skill = atkUnit ? weaponDef(atkUnit.skills.weapon).kind : "sword"
    const color = atkUnit ? WEAPON_COLOR_HEX[weaponDef(atkUnit.skills.weapon).color] : 0xffffff
    const trailColor = color === WEAPON_COLOR_HEX.colorless ? 0xfff3b0 : color
    if (second) doubleStrikeMark(map, atk.x, atk.y - tile * 0.75, tile, sp)
    if (strike.special) {
      haptic("heavy")
      const portrait = atkUnit ? unitTexKey(atkUnit, "happy", "map") : undefined
      await specialCutIn(map, specialDef(strike.special).name, trailColor, atk.side === "player", sp, portrait)
      if (!atk.scene || !def.scene) return
    }
    else haptic("medium")
    // Замах (anticipation): назад и присесть
    atk.setPose("run")
    const rig = atk.bodyRig()
    await Promise.all([
      tween(map, {
        targets: atk,
        x: ox - ux * tile * 0.12,
        y: oy - uy * tile * 0.12,
        duration: 110 / sp,
        ease: "Quad.easeOut"
      }),
      tween(map, { targets: rig, scaleX: 1.12, scaleY: 0.88, duration: 110 / sp, ease: "Quad.easeOut" })
    ])
    if (!atk.scene) return
    // Рывок с остаточными образами
    const reach = def.side === atk.side ? 0.2 : 0.38
    afterImages(map, atk, 3, 28, trailColor, sp)
    map.tweens.add({ targets: rig, scaleX: 0.92, scaleY: 1.1, duration: 90 / sp, ease: "Quad.easeIn" })
    await tween(map, {
      targets: atk,
      x: ox + ux * tile * reach,
      y: oy + uy * tile * reach,
      duration: 90 / sp,
      ease: "Quad.easeIn"
    })
    if (!atk.scene || !def.scene) return
    const hitPos = { x: def.x, y: def.y - tile * 0.1 }
    // След оружия поверх фирменного эффекта
    if (skill === "sword" || skill === "axe")
      slashTrail(map, hitPos.x, hitPos.y, tile, ux >= 0 ? 1 : -1, trailColor, sp, !!strike.special)
    else if (skill === "spear") thrustLine(map, { x: atk.x, y: atk.y - tile * 0.1 }, hitPos, tile, trailColor, sp)
    const quickFx = playQuickAttackFx({
      scene: map,
      kind: weaponKindOf(before, strike.attackerId),
      attacker: atk,
      defender: def,
      atkPos: { x: atk.x, y: atk.y - tile * 0.1 },
      defPos: hitPos,
      home: { x: ox, y: oy },
      dir: dx >= 0 ? 1 : -1,
      speed: sp,
      special: !!strike.special,
      effective: strike.effective,
      damage: strike.damage,
      size: tile,
      color
    })
    await quickFx.impactAt
    if (!def.scene || !atk.scene) return
    if (skill === "gauntlet") shockRing(map, hitPos.x, hitPos.y, tile, sp)
    // Контакт: хит-стоп, отдача, тряска
    const frac = strike.damage / Math.max(1, defMax)
    const lethal = strike.defenderHpAfter <= 0
    hitStop(map, strike.damage > 0 ? (strike.special || lethal ? 110 : 75) : 45)
    def.takeHit(ux, uy, frac * 2.2 + (strike.special ? 0.5 : 0), sp)
    shakeCam(map, 110 / sp, shakePx(!!strike.special, strike.effective) * (lethal ? 1.6 : 0.9))
    if (strike.damage > 0) {
      hitGore(map, {
        x: hitPos.x,
        y: hitPos.y,
        size: tile,
        dirX: ux,
        dirY: uy,
        damage: strike.damage,
        maxHp: defMax,
        lethal,
        speed: sp,
        depth: 24,
        ground: { x: def.x, y: def.y + tile * 0.3 },
        kind: goreKindOfUnit(atkUnit)
      })
      if (frac >= 0.4 || lethal) screenBloodSplat(map, Math.min(1, frac + (lethal ? 0.3 : 0)), sp)
    }
    else sparks(map, hitPos.x, hitPos.y, tile, sp)
    const numColor
      = strike.damage === 0 ? "#bbbbbb" : strike.special ? "#ffd166" : strike.effective ? "#ff6b6b" : "#ffffff"
    bigNumber(
      map,
      def.x,
      def.y - tile * 0.55,
      strike.damage === 0 ? "Хлоп!" : String(strike.damage),
      numColor,
      tile * (strike.special || lethal ? 0.5 : 0.4),
      sp,
      { crit: !!strike.special || frac >= 0.5 }
    )
    if (strike.effective)
      floatText(map, def.x + tile * 0.3, def.y - tile * 0.85, "×1.5", "#ff6b6b", sp, { size: tile * 0.22 })
    if (strike.healed > 0) {
      floatText(map, atk.x, atk.y - tile * 0.5, `+${strike.healed}`, "#80ed99", sp, { size: tile * 0.3 })
      healPillar(map, ox, oy, tile, sp)
    }
    if (strike.miracle) floatText(map, def.x, def.y - tile * 0.8, "1 HP!", "#ffd700", sp, { size: tile * 0.3 })
    // Отдача и возврат с пружиной
    map.tweens.add({ targets: rig, scaleX: 1, scaleY: 1, duration: 160 / sp, ease: "Back.easeOut" })
    await tween(map, { targets: atk, x: ox, y: oy, duration: 150 / sp, ease: "Back.easeOut" })
    if (atk.scene) atk.setPose("idle")
    await quickFx.done
  }

  private runCinematic(
    ev: CombatEvent,
    before: BattleState,
    after: BattleState,
    map: MapScene,
    sp: number
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      const data: CinematicData = { event: ev, before, after, speed: sp, resolve }
      // Зум камеры карты к цели перед переходом
      const c = map.center(ev.defenderPos)
      map.cameras.main.pan(c.x, c.y, 150 / sp, "Sine.easeInOut")
      map.cameras.main.zoomTo(
        1.15,
        150 / sp,
        "Sine.easeInOut",
        false,
        (_cam: Phaser.Cameras.Scene2D.Camera, progress: number) => {
          if (progress >= 1) {
            map.scene.launch(CINEMATIC_SCENE_KEY, data)
            map.scene.bringToTop(CINEMATIC_SCENE_KEY)
          }
        }
      )
    }).then(() => {
      if (!map.sys.isActive()) return
      map.cameras.main.zoomTo(1, 120 / sp)
      map.cameras.main.pan(map.scale.width / 2, map.scale.height / 2, 120 / sp)
      return wait(map, 130 / sp)
    })
  }

  private async died(
    unitId: string,
    pos: Pos,
    side: "player" | "enemy",
    after: BattleState,
    map: MapScene,
    sp: number
  ): Promise<void> {
    const view = map.units.get(unitId)
    const unit = after.roster[unitId]
    const c = map.center(pos)
    if (side === "player") haptic("error")
    // Убийца и направление удара — из последнего боя; вариант гибели совпадает с кинематиком (тот же seed).
    const lc = this.lastCombat
    const killerId = lc
      ? lc.defenderId === unitId
        ? lc.attackerId
        : lc.attackerId === unitId
          ? lc.defenderId
          : undefined
      : undefined
    const killerUnit = killerId ? after.roster[killerId] : undefined
    const killerKind = killerUnit ? weaponKindOfUnit(killerUnit) : undefined
    let dir: 1 | -1 = side === "player" ? -1 : 1
    const kb = killerId ? after.units[killerId] : undefined
    if (kb && kb.pos.x !== pos.x) dir = pos.x > kb.pos.x ? 1 : -1
    let pooled = false
    const onPool = (): void => {
      if (pooled) return
      pooled = true
      map.addDecal(pos, "pool", pos.x * 3 + pos.y * 7 + this.seedCounter++)
    }
    if (view && unit) {
      view.setDead()
      view.hideHud()
      const feet = view.feetWorld()
      const variant = pickDeathVariant(deathSeed(unitId, after.turn), killerKind, unitClass(unit).moveType)
      const ctx: DeathCtx = {
        scene: map,
        variant,
        sprite: view,
        unit,
        x: feet.x,
        y: feet.y,
        size: map.tile,
        dir,
        speed: sp,
        side,
        onPool
      }
      const parts = this.mapParts.get(unitId)
      if (parts) ctx.parts = parts
      if (killerKind) ctx.killerKind = killerKind
      this.mapParts.delete(unitId)
      await playDeathMap(ctx)
      if (!map.sys.isActive()) return
    }
    onPool()
    const word = side === "player" ? (unit?.gender === "f" ? "ПАЛА" : "ПАЛ") : unit?.gender === "f" ? "ГОТОВА" : "ГОТОВ"
    const ghost = ghostRise(map, c.x, c.y - map.tile * 0.2, map.tile, sp)
    if (view?.scene) this.tweenNoWait(map, { targets: view, alpha: 0, duration: 300 / sp, delay: 150 / sp })
    await stamp(
      map,
      c.x,
      c.y - map.tile * 0.9,
      word,
      side === "player" ? "#ff4d6d" : "#f1f1f1",
      Math.max(14, map.tile * 0.42),
      sp,
      side === "player" ? 500 : 250
    )
    await ghost
    map.removeUnitView(unitId)
  }

  private async effect(ev: Extract<BattleEvent, { type: "effect" }>, map: MapScene, sp: number): Promise<void> {
    const view = map.units.get(ev.effect.unitId)
    if (!view) return
    switch (ev.effect.type) {
      case "heal":
        healPillar(map, view.x, view.y, map.tile, sp)
        floatText(map, view.x, view.y - map.tile * 0.5, `+${ev.effect.amount}`, "#80ed99", sp, {
          size: map.tile * 0.34
        })
        if (ev.hpAfter !== undefined)
          view.setHp(ev.hpAfter, view.getHp() > ev.hpAfter ? view.getHp() : Math.max(ev.hpAfter, view.getHp()))
        break
      case "damage":
        bigNumber(map, view.x, view.y - map.tile * 0.5, `−${ev.effect.amount}`, "#ffffff", map.tile * 0.34, sp)
        view.takeHit(0, -1, 0.6, sp)
        hitGore(map, {
          x: view.x,
          y: view.y - map.tile * 0.1,
          size: map.tile,
          dirX: 0,
          dirY: -1,
          damage: ev.effect.amount,
          maxHp: Math.max(ev.effect.amount, view.getHp() + ev.effect.amount),
          lethal: (ev.hpAfter ?? 1) <= 0,
          speed: sp,
          depth: 24,
          ground: { x: view.x, y: view.y + map.tile * 0.3 },
          kind: "blunt"
        })
        break
      case "buff":
        buffRunes(map, view.x, view.y, map.tile, Object.keys(ev.effect.stats), true, sp)
        break
      case "debuff":
        buffRunes(map, view.x, view.y, map.tile, Object.keys(ev.effect.stats), false, sp)
        break
      case "flag":
        return
    }
    return wait(map, 90 / sp)
  }

  /** Предмет из рюкзака: столб света и цифры лечения на каждом, кого он задел; снятые штрафы — руны. */
  private async item(ev: Extract<BattleEvent, { type: "item" }>, after: BattleState, map: MapScene, sp: number): Promise<void> {
    map.units.get(ev.unitId)?.hop()
    for (const h of ev.heals) {
      const view = map.units.get(h.unitId)
      const bu = after.units[h.unitId]
      if (!view) continue
      healPillar(map, view.x, view.y, map.tile, sp)
      bigNumber(map, view.x, view.y - map.tile * 0.55, `+${h.amount}`, "#80ed99", map.tile * 0.4, sp)
      if (bu) view.setHp(h.hpAfter, bu.maxHp)
    }
    for (const id of ev.cleansed) {
      const view = map.units.get(id)
      if (view) floatText(map, view.x, view.y - map.tile * 0.75, "штрафы сняты", "#8fc9ff", sp, { size: map.tile * 0.26 })
    }
    if (ev.heals.length > 0) haptic("light")
    return wait(map, 260 / sp)
  }

  private async assist(
    ev: Extract<BattleEvent, { type: "assist" }>,
    after: BattleState,
    map: MapScene,
    sp: number
  ): Promise<void> {
    // Перемещения (swap, shove, pivot…): по дуге с подскоком, с пылью на приземлении
    const moves = ev.moves.map((m, i) => {
      const view = map.units.get(m.unitId)
      if (!view) return Promise.resolve()
      const c = map.center(m.to)
      view.setDepth(10 + m.to.y * 0.01)
      const sx = view.x
      const sy = view.y
      const lift = map.tile * (0.35 + i * 0.12)
      const st = { t: 0 }
      return tween(map, {
        targets: st,
        t: 1,
        duration: 260 / sp,
        ease: "Sine.easeInOut",
        onUpdate: () => {
          if (!view.scene) return
          view.setPosition(sx + (c.x - sx) * st.t, sy + (c.y - sy) * st.t - Math.sin(st.t * Math.PI) * lift)
        }
      }).then(() => {
        if (!view.scene) return
        view.setPosition(c.x, c.y)
        const feet = view.feetWorld()
        stepFx(map, feet.x, feet.y, map.tile, after.map.tiles[m.to.y]?.[m.to.x], after.map.biomeId, true)
      })
    })
    await Promise.all(moves)
    const target = map.units.get(ev.targetId)
    const actor = map.units.get(ev.unitId)
    if (target && ev.heal > 0) {
      healPillar(map, target.x, target.y, map.tile, sp)
      bigNumber(map, target.x, target.y - map.tile * 0.55, `+${ev.heal}`, "#80ed99", map.tile * 0.4, sp)
      const tb = after.units[ev.targetId]
      if (ev.targetHpAfter !== undefined && tb) target.setHp(ev.targetHpAfter, tb.maxHp)
      haptic("light")
    }
    if (actor && ev.unitHpAfter !== undefined) {
      const ab = after.units[ev.unitId]
      if (ab) actor.setHp(ev.unitHpAfter, ab.maxHp)
    }
    if (target && ev.assistId === "as_dance") {
      if (actor) danceFx(map, actor.x, actor.y, map.tile, sp, actor.bodyRig())
      danceFx(map, target.x, target.y, map.tile, sp, target.bodyRig())
      floatText(map, target.x, target.y - map.tile * 0.7, "↻ ещё раз!", "#ffd166", sp, { size: map.tile * 0.3 })
      target.setActed(false)
      target.hop()
    }
    if (target && ev.assistId.startsWith("as_rally")) {
      const stat = ev.assistId.replace("as_rally_", "")
      buffRunes(map, target.x, target.y, map.tile, [stat], true, sp)
      actor?.hop()
    }
    return wait(map, 200 / sp)
  }
}
