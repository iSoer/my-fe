import Phaser from "phaser"
import type { BattleState, Pos, TerrainId } from "@game/core/types"
import { MAP_H, MAP_W, inBounds, posKey } from "@game/core/types"
import { terrainAt, unitAt } from "@game/core/battle/query"
import { biomeDef } from "@game/content/biomes"
import { $save } from "@game/state/save"
import {
  $battleUi,
  beginDrag,
  cancelDrag,
  dragHover,
  endDrag,
  isDisplaced,
  setPressed,
  tapTile,
  type BattleUiState
} from "@game/state/battleUi"
import { $boardInsets, publishBoardLayout } from "@game/state/boardLayout"
import { computeLayout, pixelToGrid, tileCenter, tileOrigin, type BoardLayout } from "./layout"
import { ensureTextures, TEX } from "./textures"
import { HL, TERRAIN_GLYPH, textStyle } from "./style"
import type { BattleResult } from "@game/core/types"
import { UnitView } from "./UnitView"
import { actorFlash, bloodBurst, bloodDecal, confettiRain, debrisBurst, sceneAlive, tween } from "./fx"
import { haptic } from "@game/platform/haptics"
import {
  ensureUnitTextures,
  hasTexture,
  tileFrameCount,
  withTimeout
} from "./svgTextures"
import { WeatherLayer } from "./weather"
import { AmbientLayer } from "./ambient"
import {
  ENV,
  SHORE_FRAMES,
  edgeKey,
  ensureEnvTextures,
  ensureEnvTileTextures,
  envTileKey,
  groundKey,
  tileVariantAt,
  wallImpactFx
} from "./env"
import { isTallTerrain, waterFillsTile } from "@game/art/tile"
import { clearGoreStains } from "./gore"

export const MAP_SCENE_KEY = "Map"

/** 1–2 клетки для роения мух, детерминированно от seed карты. */
function pickAnchors(points: { x: number, y: number }[], seed: number): { x: number, y: number }[] {
  if (points.length === 0) return []
  const a = points[seed % points.length]
  const b = points[(seed * 7 + 3) % points.length]
  return a && b && a !== b ? [a, b] : a ? [a] : []
}

export class MapScene extends Phaser.Scene {
  layout: BoardLayout = computeLayout(360, 480)
  readonly units = new Map<string, UnitView>()
  /** true, пока Presenter проигрывает события — автосинхронизация со стором откладывается. */
  playing = false
  readonly ready: Promise<void>
  private resolveReady: () => void = () => {}

  private tilesG!: Phaser.GameObjects.Graphics
  private tileLayer!: Phaser.GameObjects.Container
  private glyphs: Phaser.GameObjects.Text[] = []
  private wallTexts = new Map<string, Phaser.GameObjects.Text>()
  private decalLayer!: Phaser.GameObjects.Container
  /** Зона опасности (пульсирует) и зона угрозы выбранного врага. */
  private dangerG!: Phaser.GameObjects.Graphics
  private threatG!: Phaser.GameObjects.Graphics
  private pulseTweens: Phaser.Tweens.Tween[] = []
  /** Подсветка хода/атаки/поддержки: пул тонированных квадратов, появляются «волной». */
  private hlLayer!: Phaser.GameObjects.Container
  private reachPool: Phaser.GameObjects.Image[] = []
  private targetPool: Phaser.GameObjects.Image[] = []
  private reachSig = ""
  private targetSig = ""
  private pathG!: Phaser.GameObjects.Graphics
  private ghost: UnitView | null = null
  private ghostKey = ""
  /** Прицел: четыре скобки по углам клетки цели. */
  private marker: Phaser.GameObjects.Container | null = null
  private markerTweens: Phaser.Tweens.Tween[] = []
  private markerKind: "attack" | "assist" | "wall" | "" = ""
  private lastSelectedId: string | undefined
  /** Трещины на хлипких стенах и их HP по данным последней отрисовки. */
  private cracks = new Map<string, Phaser.GameObjects.Graphics>()
  private wallHp = new Map<string, number>()
  private endOverlay: Phaser.GameObjects.GameObject[] = []
  /* ---- Живые тайлы и погода ---- */
  /** Анимированные клетки: кадры воды/листвы меняются по таймеру, кусты качаются твинами. */
  private animTiles: {
    img: Phaser.GameObjects.Image
    terrain: TerrainId
    frames: number
    phase: number
    frame: number
    variant: number
  }[] = []

  private tileTimer: Phaser.Time.TimerEvent | null = null
  private tileTweens: Phaser.Tweens.Tween[] = []
  private tileBiome = ""
  private weather: WeatherLayer | null = null
  private weatherBiome = ""
  /* ---- Окружение: атмосфера, края клеток, стены, подсветка ---- */
  private ambient: AmbientLayer | null = null
  /** Земля биома вокруг поля: затемнённая фактура равнины на весь экран. */
  private groundBg: Phaser.GameObjects.TileSprite | null = null
  private wallImgs = new Map<string, Phaser.GameObjects.Image>()
  private shoreImgs: { img: Phaser.GameObjects.Image, phase: number }[] = []
  private dangerLayer!: Phaser.GameObjects.Container
  private dangerPool: Phaser.GameObjects.TileSprite[] = []
  private threatPool: Phaser.GameObjects.Image[] = []
  private pawPool: Phaser.GameObjects.Image[] = []
  private pawCount = 0
  private unsubSave: (() => void) | null = null
  private unsubUi: (() => void) | null = null
  private pendingSync = false
  private lastMapRef: BattleState["map"] | null = null
  private lastLayoutKey = ""
  private decalCount = -1

  /* ---- Перетаскивание и предпросмотр ---- */
  /** Палец лёг на своего юнита; ждём, сдвинется ли он дальше порога. */
  private armed: { unitId: string, x: number, y: number } | null = null
  private captureHandler: ((e: PointerEvent) => void) | null = null
  private unsubInsets: (() => void) | null = null
  /** Юнит в руке. */
  private drag: { unitId: string, view: UnitView, hoverKey: string | null } | null = null
  /** Юнит, который сейчас шлёпается на клетку (его положение анимируется). */
  private landingId: string | null = null
  /** Юнит, чей вид стоит на movedTo (предпросмотр), а не на клетке из состояния. */
  private displacedId: string | null = null
  private placementTween: Phaser.Tweens.Tween | null = null

  constructor() {
    super(MAP_SCENE_KEY)
    this.ready = new Promise((r) => {
      this.resolveReady = r
    })
  }

  create(): void {
    ensureTextures(this)
    ensureEnvTextures(this)
    this.tileLayer = this.add.container(0, 0).setDepth(0)
    this.tilesG = this.add.graphics().setDepth(0.2)
    this.decalLayer = this.add.container(0, 0).setDepth(1)
    this.dangerG = this.add.graphics().setDepth(1.8)
    this.threatG = this.add.graphics().setDepth(1.85)
    this.hlLayer = this.add.container(0, 0).setDepth(2)
    this.pathG = this.add.graphics().setDepth(3)
    this.dangerLayer = this.add.container(0, 0).setDepth(1.8)
    // Пульс подсветки клеток, бегущая штриховка опасности, следы лап на пути, пена у берега
    this.events.on(Phaser.Scenes.Events.UPDATE, this.tickEnv, this)
    // Пульс зоны опасности: графика рисуется в полную силу, а её alpha качается 0.55 ↔ 1.
    this.pulseTweens.push(
      this.tweens.add({
        targets: this.dangerG,
        alpha: 0.55,
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut"
      }),
      this.tweens.add({
        targets: this.threatG,
        alpha: 0.7,
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut"
      })
    )
    this.relayout()

    this.unsubSave = $save.subscribe(() => {
      this.pendingSync = true
    })
    this.unsubUi = $battleUi.subscribe(ui => this.drawHighlights(ui))

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.onPointerDown(p))
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => this.onPointerMove(p))
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => this.onPointerUp(p))
    this.input.on("pointerupoutside", (p: Phaser.Input.Pointer) => this.onPointerUp(p, true))
    this.input.on(Phaser.Input.Events.GAME_OUT, () => {
      // Курсор ушёл с канваса (например, на DOM-накладку): перетаскивание НЕ обрываем —
      // юнит остаётся в руке, бросок произойдёт по отпусканию кнопки. Только тап отменяем.
      if (this.drag) dragHover(null)
      else this.armed = null
    })
    // Захват указателя канвасом: пока кнопка зажата, события идут в канвас, даже если курсор над DOM-накладками.
    this.captureHandler = (e: PointerEvent) => {
      try {
        this.game.canvas.setPointerCapture(e.pointerId)
      }
      catch {
        /* ignore */
      }
    }
    this.game.canvas.addEventListener("pointerdown", this.captureHandler)
    this.unsubInsets = $boardInsets.subscribe(() => {
      if (!sceneAlive(this)) return
      this.relayout()
      const cur = $save.get().battle
      if (cur && !this.playing) {
        this.lastMapRef = null
        this.syncFromState(cur)
      }
      this.drawHighlights($battleUi.get())
    })
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this)
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this)

    // Сначала растеризуем арт (тайлы биома и миниатюры всех бойцов), чтобы первый кадр уже был с графикой.
    const st = $save.get().battle
    void withTimeout(this.preloadArt(st), 2500).then(() => {
      if (!sceneAlive(this)) return
      const cur = $save.get().battle
      this.lastMapRef = null
      if (cur) this.syncFromState(cur)
      this.pendingSync = false
      this.resolveReady()
    })
  }

  /** Текстуры тайлов биома и миниатюр живых юнитов (размер карты). */
  private preloadArt(st: BattleState | undefined): Promise<unknown> {
    if (!st) return Promise.resolve()
    const jobs: Promise<unknown>[] = [ensureEnvTileTextures(this, st.map.biomeId)]
    for (const bu of Object.values(st.units)) {
      if (!bu.alive) continue
      const unit = st.roster[bu.unitId]
      if (unit) jobs.push(ensureUnitTextures(this, unit, "map"))
    }
    return Promise.all(jobs)
  }

  override update(): void {
    if (this.pendingSync && !this.playing) {
      this.pendingSync = false
      const st = $save.get().battle
      if (st) this.syncFromState(st)
    }
  }

  private cleanup(): void {
    if (this.captureHandler) {
      this.game.canvas.removeEventListener("pointerdown", this.captureHandler)
      this.captureHandler = null
    }
    this.unsubInsets?.()
    this.unsubInsets = null
    setPressed(null)
    this.unsubSave?.()
    this.unsubUi?.()
    this.unsubSave = null
    this.unsubUi = null
    if (this.drag) {
      this.drag = null
      cancelDrag()
    }
    this.armed = null
    for (const t of this.pulseTweens) t.stop()
    this.pulseTweens = []
    for (const t of this.markerTweens) t.stop()
    this.markerTweens = []
    this.stopTileAnimations()
    this.weather?.destroy()
    this.weather = null
    this.weatherBiome = ""
    this.ambient?.destroy()
    this.ambient = null
    this.groundBg?.destroy()
    this.groundBg = null
    this.events.off(Phaser.Scenes.Events.UPDATE, this.tickEnv, this)
    this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this)
  }

  private onResize(): void {
    this.relayout()
    const st = $save.get().battle
    if (!st) return
    if (this.playing) {
      // Во время проигрывания событий нельзя пересоздавать/уничтожать виды юнитов:
      // презентер держит на них ссылки. Перерисовываем поле и двигаем существующие виды.
      this.pendingSync = true
      this.lastMapRef = st.map
      this.drawTiles(st)
      this.syncDecals(st)
      for (const bu of Object.values(st.units)) {
        const v = this.units.get(bu.unitId)
        if (!v || !v.scene) continue
        const c = this.center(bu.pos)
        v.setPosition(c.x, c.y)
      }
      this.drawHighlights($battleUi.get())
      return
    }
    this.lastMapRef = null
    this.syncFromState(st)
    this.drawHighlights($battleUi.get())
  }

  /* ---------- Ввод: тап и перетаскивание ---------- */

  /** Порог смещения, после которого тап превращается в перетаскивание (px). */
  private static readonly DRAG_THRESHOLD = 8
  /** Максимальное смещение, при котором отпускание всё ещё считается тапом (px). */
  private static readonly TAP_SLOP = 14

  private canDragNow(): boolean {
    const st = $save.get().battle
    const ui = $battleUi.get()
    return !!st && !st.result && st.phase === "player" && !ui.busy && !this.playing
  }

  private onPointerDown(p: Phaser.Input.Pointer): void {
    this.armed = null
    if (this.drag || !this.canDragNow()) return
    const st = $save.get().battle
    if (!st) return
    const pos = pixelToGrid(this.layout, p.x, p.y)
    if (!pos) return
    const occ = unitAt(st, pos)
    if (!occ || occ.side !== "player" || occ.acted || !occ.alive) return
    this.armed = { unitId: occ.unitId, x: p.x, y: p.y }
    // Боец зажат: DOM скрывает меню и перестаёт перехватывать курсор.
    setPressed(occ.unitId)
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    if (!p.isDown) return
    if (!this.drag && this.armed) {
      const d = Math.hypot(p.x - this.armed.x, p.y - this.armed.y)
      if (d <= MapScene.DRAG_THRESHOLD) return
      const unitId = this.armed.unitId
      this.armed = null
      if (!this.canDragNow() || !beginDrag(unitId)) return
      const view = this.units.get(unitId)
      if (!view || !view.scene) {
        cancelDrag()
        return
      }
      this.placementTween?.stop()
      this.placementTween = null
      if (this.displacedId === unitId) this.displacedId = null
      this.drag = { unitId, view, hoverKey: null }
      view.setAlpha(1)
      view.setDepth(50)
      view.setLifted(true)
    }
    if (!this.drag) return
    this.followPointer(p)
  }

  /** Контейнер юнита следует за пальцем: на тач-экране — чуть выше пальца, чтобы его не заслонять. */
  private followPointer(p: Phaser.Input.Pointer): void {
    const drag = this.drag
    if (!drag || !drag.view.scene) return
    const lift = p.wasTouch ? this.tile * 0.55 : 0
    drag.view.setPosition(p.x, p.y - lift)
    const tile = pixelToGrid(this.layout, p.x, p.y)
    const key = tile ? posKey(tile) : ""
    if (key !== drag.hoverKey) {
      drag.hoverKey = key
      dragHover(tile)
    }
  }

  private onPointerUp(p: Phaser.Input.Pointer, outside = false): void {
    setPressed(null)
    if (this.drag) {
      const tile = outside ? null : pixelToGrid(this.layout, p.x, p.y)
      void this.finishDrag(tile)
      this.armed = null
      return
    }
    this.armed = null
    if (outside || $battleUi.get().busy) return
    const dx = p.upX - p.downX
    const dy = p.upY - p.downY
    if (Math.hypot(dx, dy) > MapScene.TAP_SLOP) return
    const pos = pixelToGrid(this.layout, p.upX, p.upY)
    if (pos) tapTile(pos)
  }

  /** Отпустили: контроллер решает, куда встал юнит; сцена играет падение и отряхивание. */
  private async finishDrag(tile: Pos | null): Promise<void> {
    const drag = this.drag
    if (!drag) return
    this.drag = null
    const { unitId, view } = drag
    this.landingId = unitId
    const ok = endDrag(tile)
    const ui = $battleUi.get()
    const st = $save.get().battle
    if (ui.busy || ui.mode === "busy") {
      // Действие уже подтверждено (например, атака без подтверждения): анимацию ведёт презентер.
      this.landingId = null
      if (view.scene) view.setLifted(false, 80)
      return
    }
    let dest: Pos | null = null
    if (ok && ui.movedTo && ui.selectedId === unitId) dest = ui.movedTo
    else {
      const bu = st?.units[unitId]
      if (bu) dest = bu.pos
    }
    if (!view.scene || !dest) {
      this.landingId = null
      return
    }
    await this.landAt(view, dest, ok ? 120 : 180)
    this.landingId = null
    if (ok && ui.selectedId === unitId && isDisplaced($battleUi.get())) this.displacedId = unitId
    this.applyPreviewPlacement($battleUi.get(), true)
    if (sceneAlive(this)) this.drawHighlights($battleUi.get())
  }

  /** Падение на центр клетки с одновременным опусканием тела, затем шлепок и отряхивание. */
  private async landAt(view: UnitView, pos: Pos, fallMs: number): Promise<void> {
    const c = this.center(pos)
    view.setDepth(50)
    view.setLifted(false, fallMs)
    await tween(this, { targets: view, x: c.x, y: c.y, duration: fallMs, ease: "Quad.easeIn" })
    if (!view.scene) return
    view.setPosition(c.x, c.y)
    haptic("light")
    await view.playLanding()
    if (view.scene) view.setDepth(10 + pos.y * 0.01)
  }

  /* ---------- Предпросмотр: вид выбранного юнита стоит на movedTo ---------- */

  /** Ids видов, положение которых сейчас контролируют палец или анимация приземления. */
  private lockedIds(): Set<string> {
    const set = new Set<string>()
    if (this.drag) set.add(this.drag.unitId)
    if (this.landingId) set.add(this.landingId)
    return set
  }

  /**
   * Перед проигрыванием событий презентером: отдать id смещённого юнита, чтобы его не «дёргало»
   * обратно на исходную клетку (презентер стартует движение с того места, где вид стоит).
   */
  beginPlayback(): Set<string> {
    const skip = new Set<string>()
    this.placementTween?.stop()
    this.placementTween = null
    if (this.displacedId) {
      skip.add(this.displacedId)
      this.displacedId = null
    }
    this.ghost?.destroy()
    this.ghost = null
    this.ghostKey = ""
    return skip
  }

  private returnView(id: string, st: BattleState, immediate: boolean): void {
    const view = this.units.get(id)
    const bu = st.units[id]
    if (!view || !view.scene || !bu) return
    const c = this.center(bu.pos)
    if (immediate || (Math.abs(view.x - c.x) < 1 && Math.abs(view.y - c.y) < 1)) {
      view.setPosition(c.x, c.y)
      view.setDepth(10 + bu.pos.y * 0.01)
      return
    }
    view.setDepth(40)
    this.placementTween = this.tweens.add({
      targets: view,
      x: c.x,
      y: c.y,
      duration: 150,
      ease: "Quad.easeOut",
      onComplete: () => {
        if (view.scene) view.setDepth(10 + bu.pos.y * 0.01)
      }
    })
  }

  private applyPreviewPlacement(ui: BattleUiState, immediate = false): void {
    const st = $save.get().battle
    if (!st) return
    if (this.drag || ui.dragging) return // палец управляет
    if (ui.mode === "busy" || this.playing) return // презентер доигрывает
    const sel = ui.selectedId
    const view = sel ? this.units.get(sel) : undefined
    if (sel && view && view.scene && ui.movedTo && isDisplaced(ui) && this.landingId !== sel) {
      const target = ui.movedTo
      const c = this.center(target)
      if (this.displacedId && this.displacedId !== sel) this.returnView(this.displacedId, st, immediate)
      this.displacedId = sel
      if (Math.abs(view.x - c.x) > 1 || Math.abs(view.y - c.y) > 1) {
        this.placementTween?.stop()
        if (immediate) {
          view.setPosition(c.x, c.y)
          view.setDepth(10 + target.y * 0.01)
        }
        else {
          view.setDepth(40)
          this.placementTween = this.tweens.add({
            targets: view,
            x: c.x,
            y: c.y,
            duration: 150,
            ease: "Quad.easeOut",
            onComplete: () => {
              if (view.scene) view.setDepth(10 + target.y * 0.01)
            }
          })
        }
      }
      else view.setDepth(10 + target.y * 0.01)
      return
    }
    if (this.displacedId) {
      const id = this.displacedId
      this.displacedId = null
      if (this.landingId !== id) this.returnView(id, st, immediate)
    }
  }

  private relayout(): void {
    this.layout = computeLayout(this.scale.width, this.scale.height, $boardInsets.get())
    const key = `${this.layout.tile}:${this.layout.ox}:${this.layout.oy}`
    if (key !== this.lastLayoutKey) {
      this.lastLayoutKey = key
      this.lastMapRef = null
      this.decalCount = -1
      this.reachSig = ""
      this.targetSig = ""
      for (const v of this.units.values()) v.resize(this.layout.tile)
    }
    publishBoardLayout({
      tile: this.layout.tile,
      ox: this.layout.ox,
      oy: this.layout.oy,
      width: this.scale.width,
      height: this.scale.height
    })
  }

  /* ---------- Публичные помощники для Presenter ---------- */

  center(pos: Pos): { x: number, y: number } {
    return tileCenter(this.layout, pos)
  }

  get tile(): number {
    return this.layout.tile
  }

  /**
   * Полная синхронизация визуала с состоянием боя.
   * skipIds — виды, положение которых не трогаем (смещённый предпросмотр, юнит в руке, приземление).
   */
  syncFromState(st: BattleState, skipIds?: Set<string>): void {
    if (st.map !== this.lastMapRef) {
      this.lastMapRef = st.map
      this.drawTiles(st)
    }
    else this.updateWalls(st)
    this.syncDecals(st)
    const locked = this.lockedIds()
    if (skipIds) for (const id of skipIds) locked.add(id)
    const alive = new Set<string>()
    for (const bu of Object.values(st.units)) {
      if (!bu.alive) continue
      alive.add(bu.unitId)
      const view = this.ensureUnitView(bu.unitId, st)
      if (!view) continue
      const keepPos = locked.has(bu.unitId)
      if (!keepPos) {
        const c = this.center(bu.pos)
        view.setPosition(c.x, c.y)
        view.setDepth(10 + bu.pos.y * 0.01)
        view.setScale(1)
        view.setAngle(0)
      }
      view.setHp(bu.hp, bu.maxHp)
      view.setCd(bu.specialCd)
      view.setActed(bu.acted && st.phase === bu.side)
    }
    for (const [id, view] of this.units) {
      if (!alive.has(id)) {
        if (this.displacedId === id) this.displacedId = null
        view.destroy()
        this.units.delete(id)
      }
    }
    // Если юнит стоит на клетке предпросмотра — вернуть его туда после снапа к состоянию.
    if (!this.playing) this.applyPreviewPlacement($battleUi.get(), true)
  }

  ensureUnitView(unitId: string, st: BattleState): UnitView | null {
    let view = this.units.get(unitId)
    if (view) return view
    const unit = st.roster[unitId]
    const bu = st.units[unitId]
    if (!unit || !bu) return null
    view = new UnitView(this, unit, bu.side, { size: this.layout.tile })
    const c = this.center(bu.pos)
    view.setPosition(c.x, c.y)
    view.setDepth(10 + bu.pos.y * 0.01)
    view.setHp(bu.hp, bu.maxHp)
    view.setCd(bu.specialCd)
    this.units.set(unitId, view)
    return view
  }

  removeUnitView(unitId: string): void {
    const v = this.units.get(unitId)
    if (v) {
      v.destroy()
      this.units.delete(unitId)
    }
  }

  addDecal(pos: Pos, kind: "splat" | "pool", seed: number): void {
    const c = this.center(pos)
    // Клякса — со случайным сдвигом внутри клетки; лужа — под телом и растекается
    const jx = kind === "splat" ? (((seed * 37) % 11) - 5) * this.tile * 0.035 : 0
    const jy = kind === "splat" ? (((seed * 53) % 9) - 4) * this.tile * 0.03 : this.tile * 0.15
    const img = bloodDecal(this, c.x + jx, c.y + jy, this.tile, kind, seed)
    this.decalLayer.add(img)
    if (kind === "pool") this.decalCount++
  }

  /** Удар по хлипкой стене: число HP, трещины и обломки; при разрушении — крупный разлёт. */
  setWallHp(pos: Pos, hp: number, speed = 1): void {
    const key = posKey(pos)
    const t = this.wallTexts.get(key)
    if (t) t.setText(hp > 0 ? String(hp) : "")
    const c = this.center(pos)
    const st = $save.get().battle
    const wallColor = st ? biomeDef(st.map.biomeId).colors.wall_breakable : 0xa1887f
    if (hp > 0) {
      this.drawCrack(pos, hp)
      debrisBurst(this, c.x, c.y, this.tile, 8, speed)
      wallImpactFx(this, c.x, c.y, this.tile, wallColor, false, speed)
    }
    else {
      this.cracks.get(key)?.destroy()
      this.cracks.delete(key)
      debrisBurst(this, c.x, c.y, this.tile, 18, speed)
      wallImpactFx(this, c.x, c.y, this.tile, wallColor, true, speed)
      this.cameras.main.shake(140 / speed, 0.006)
    }
  }

  /** Трещины на тайле стены: рваная линия с бликом по кромке; чем меньше HP, тем больше ветвей. */
  private drawCrack(pos: Pos, hp: number): void {
    const key = posKey(pos)
    let g = this.cracks.get(key)
    if (!g) {
      g = this.add.graphics().setDepth(0.55)
      this.cracks.set(key, g)
    }
    g.clear()
    const o = tileOrigin(this.layout, pos)
    const t = this.layout.tile
    let seed = (pos.x * 73 + pos.y * 151 + 7) >>> 0
    const rnd = (): number => {
      seed = (Math.imul(seed ^ (seed >>> 13), 1103515245) + 12345) >>> 0
      return (seed % 1000) / 1000
    }
    const branches = hp <= 1 ? 5 : 3
    for (let b = 0; b < branches; b++) {
      const pts: { x: number, y: number }[] = []
      let x = o.x + t * (0.3 + rnd() * 0.4)
      let y = o.y + t * (b === 0 ? 0.04 : 0.2 + rnd() * 0.5)
      pts.push({ x, y })
      const steps = b === 0 ? 6 : 3
      const dir = rnd() < 0.5 ? -1 : 1
      for (let i = 0; i < steps; i++) {
        x += (b === 0 ? (rnd() - 0.5) * 0.24 : dir * (0.08 + rnd() * 0.1)) * t
        y += (b === 0 ? 0.15 : (rnd() - 0.3) * 0.16) * t
        pts.push({ x: Phaser.Math.Clamp(x, o.x + 2, o.x + t - 2), y: Phaser.Math.Clamp(y, o.y + 2, o.y + t - 2) })
      }
      const w = Math.max(1.5, t * (b === 0 ? 0.05 : 0.032))
      // Светлая кромка, затем тёмная щель поверх со сдвигом
      g.lineStyle(w * 0.7, 0xffffff, 0.35)
      g.strokePoints(pts.map(p => ({ x: p.x + 1, y: p.y + 1 })), false)
      g.lineStyle(w, 0x140d08, 0.9)
      g.strokePoints(pts, false)
    }
  }

  /** Вспышка под юнитом + подскок: «сейчас действует этот». */
  flashActor(unitId: string, speed = 1): void {
    const view = this.units.get(unitId)
    if (!view || !view.scene) return
    actorFlash(this, view.x, view.y + this.tile * 0.36, this.tile, speed)
    view.hop()
  }

  /** Финальная заставка боя поверх поля. Остаётся на экране до ухода со сцены. */
  async showEnd(result: BattleResult, speed = 1): Promise<void> {
    if (!sceneAlive(this)) return
    const w = this.scale.width
    const h = this.scale.height
    const veil = this.add.rectangle(w / 2, h / 2, w * 3, h * 3, 0x000000, 0).setDepth(60)
    this.endOverlay.push(veil)
    this.tweens.add({ targets: veil, fillAlpha: 0.55, duration: 200 / speed })
    const text = result === "victory" ? "ПОБЕДА" : result === "defeat" ? "ПОРАЖЕНИЕ" : "ОТСТУПЛЕНИЕ"
    const color = result === "victory" ? "#ffffff" : result === "defeat" ? "#ff4d6d" : "#dddddd"
    const edge = result === "victory" ? 0xe63946 : result === "defeat" ? 0xffffff : 0x8e8a94
    const size = Math.min(result === "defeat" ? 46 : 52, w * (result === "defeat" ? 0.115 : 0.13))
    // Косая чернильная полоса в духе Persona за надписью
    const cy = h * 0.42
    const bandH = size * 1.9
    const skew = bandH * 0.4
    const band = this.add.graphics().setDepth(61.5).setAlpha(0)
    band.fillStyle(0x0d0b10, 0.96)
    band.fillPoints(
      [
        { x: -w, y: cy - bandH / 2 },
        { x: w * 2, y: cy - bandH / 2 },
        { x: w * 2 - skew, y: cy + bandH / 2 },
        { x: -w - skew, y: cy + bandH / 2 }
      ],
      true
    )
    band.fillStyle(edge, 1)
    band.fillPoints(
      [
        { x: -w, y: cy + bandH / 2 - 6 },
        { x: w * 2, y: cy + bandH / 2 - 6 },
        { x: w * 2 - skew * 0.1, y: cy + bandH / 2 },
        { x: -w - skew * 0.1, y: cy + bandH / 2 }
      ],
      true
    )
    band.setAngle(-4)
    this.endOverlay.push(band)
    this.tweens.add({ targets: band, alpha: 1, duration: 180 / speed })
    const style = { ...textStyle(size, color, true, 0), fontStyle: "bold italic" }
    const shadow = this.add
      .text(w / 2 + 4, cy + 4, text, { ...style, color: result === "defeat" ? "#7a0012" : "#e63946" })
      .setOrigin(0.5)
      .setDepth(61.8)
      .setScale(2.4)
      .setAlpha(0)
      .setAngle(-4)
    const label = this.add
      .text(w / 2, cy, text, style)
      .setOrigin(0.5)
      .setDepth(62)
      .setScale(2.4)
      .setAlpha(0)
      .setAngle(-4)
    this.endOverlay.push(shadow, label)
    if (result === "defeat") {
      const vignette = this.add.rectangle(w / 2, h / 2, w * 3, h * 3, 0x7a0012, 0).setDepth(61)
      this.endOverlay.push(vignette)
      this.tweens.add({ targets: vignette, fillAlpha: 0.28, duration: 900 / speed, ease: "Sine.easeIn" })
    }
    await tween(this, { targets: [shadow, label], scale: 1, alpha: 1, duration: 260 / speed, ease: "Back.easeOut" })
    if (!sceneAlive(this)) return
    this.cameras.main.shake(140 / speed, 0.012)
    if (result === "victory") confettiRain(this, 30, speed)
    else if (result === "defeat") {
      bloodBurst(this, w / 2, h * 0.42, 60, null, 1.6, speed)
      for (let i = 0; i < 5; i++) {
        const x = w * (0.1 + i * 0.2)
        this.endOverlay.push(
          bloodDecal(this, x, h * (0.3 + ((i * 37) % 50) / 100), this.tile * 1.4, "splat", i + 3)
            .setDepth(60.5)
            .setAlpha(0.55)
        )
      }
    }
    await new Promise<void>((resolve) => {
      if (!sceneAlive(this)) return resolve()
      this.time.delayedCall(1200 / speed, () => resolve())
    })
  }

  shakeTile(pos: Pos): void {
    const key = posKey(pos)
    const t = this.wallTexts.get(key)
    if (t) {
      const x = t.x
      this.tweens.add({ targets: t, x: x + 3, duration: 40, yoyo: true, repeat: 3, onComplete: () => t.setX(x) })
    }
    // Сам тайл стены вздрагивает от удара
    const img = this.wallImgs.get(key)
    if (img && img.scene) {
      const x = img.x
      const y = img.y
      this.tweens.add({
        targets: img,
        x: x + this.tile * 0.05,
        y: y - this.tile * 0.02,
        duration: 45,
        yoyo: true,
        repeat: 2,
        onComplete: () => img.setPosition(x, y)
      })
    }
  }

  /* ---------- Рисование ---------- */

  private drawTiles(st: BattleState): void {
    const biome = biomeDef(st.map.biomeId)
    this.cameras.main.setBackgroundColor(biome.bg)
    const g = this.tilesG
    g.clear()
    this.tileLayer.removeAll(true)
    for (const t of this.glyphs) t.destroy()
    this.glyphs = []
    for (const t of this.wallTexts.values()) t.destroy()
    this.wallTexts.clear()
    for (const g of this.cracks.values()) g.destroy()
    this.cracks.clear()
    this.wallHp.clear()
    this.wallImgs.clear()
    this.shoreImgs = []
    this.stopTileAnimations()
    this.tileBiome = st.map.biomeId
    const l = this.layout
    const seed = st.map.seed
    const flyAnchors: { x: number, y: number }[] = []
    const waterSpots: { x: number, y: number }[] = []
    const plainSpots: { x: number, y: number }[] = []
    const tallAt = (p: Pos): boolean => inBounds(p) && isTallTerrain(terrainAt(st, p))
    const waterAt = (p: Pos): boolean => !inBounds(p) || terrainAt(st, p) === "water"
    const shoreKey = edgeKey(biome.id, "shore", 0)
    const shadeKey = edgeKey(biome.id, "shade")
    const rubbleKey = edgeKey(biome.id, "rubble")
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const pos = { x, y }
        const terrain: TerrainId = terrainAt(st, pos)
        const o = tileOrigin(l, pos)
        const c = tileCenter(l, pos)
        const variant = tileVariantAt(terrain, x, y, seed)
        const texKey = envTileKey(st.map.biomeId, terrain, 0, variant)
        const hasArt = hasTexture(this, texKey)
        if (terrain === "forest" || terrain === "cover") flyAnchors.push(c)
        if (terrain === "water") waterSpots.push(c)
        if (terrain === "plain") plainSpots.push(c)
        if (hasArt) {
          // Кусты (и ели зимнего парка) качаются от основания: якорь внизу по центру.
          const sway = terrain === "forest" || (terrain === "mountain" && st.map.biomeId === "winter_park")
          const img = sway
            ? this.add
                .image(o.x + l.tile / 2, o.y + l.tile, texKey)
                .setOrigin(0.5, 1)
                .setDisplaySize(l.tile, l.tile)
            : this.add.image(o.x, o.y, texKey).setOrigin(0, 0).setDisplaySize(l.tile, l.tile)
          this.tileLayer.add(img)
          if (terrain === "wall" || terrain === "wall_breakable") this.wallImgs.set(posKey(pos), img)
          const frames = tileFrameCount(terrain)
          const phase = ((x * 73 + y * 151) % 997) * 3 // детерминированный сдвиг фазы, мс
          if (frames > 1) this.animTiles.push({ img, terrain, frames, phase, frame: 0, variant })
          if (sway) {
            this.tileTweens.push(
              this.tweens.add({
                targets: img,
                angle: { from: -1.6, to: 1.6 },
                scaleY: img.scaleY * 1.025,
                duration: 2200 + (phase % 900),
                delay: phase % 1000,
                yoyo: true,
                repeat: -1,
                ease: "Sine.easeInOut"
              })
            )
          }
          // Обломки на месте разрушенной хлипкой стены
          if (st.map.tiles[y]?.[x] === "wall_breakable" && terrain !== "wall_breakable" && hasTexture(this, rubbleKey))
            this.tileLayer.add(this.add.image(o.x, o.y, rubbleKey).setOrigin(0, 0).setDisplaySize(l.tile, l.tile))
          // Берег: пена со сторон суши у сплошной воды
          if (terrain === "water" && waterFillsTile(biome.id) && hasTexture(this, shoreKey)) {
            const sides: [Pos, number][] = [
              [{ x, y: y - 1 }, 0],
              [{ x: x + 1, y }, 90],
              [{ x, y: y + 1 }, 180],
              [{ x: x - 1, y }, -90]
            ]
            for (const [n, angle] of sides) {
              if (waterAt(n)) continue
              const sh = this.add.image(c.x, c.y, shoreKey).setDisplaySize(l.tile, l.tile).setAngle(angle)
              this.tileLayer.add(sh)
              this.shoreImgs.push({ img: sh, phase: phase + angle })
            }
          }
          // Тень от высокого соседа сверху/слева (свет падает сверху-слева)
          if (!isTallTerrain(terrain) && hasTexture(this, shadeKey)) {
            if (tallAt({ x, y: y - 1 }))
              this.tileLayer.add(this.add.image(c.x, c.y, shadeKey).setDisplaySize(l.tile, l.tile).setAlpha(0.9))
            if (tallAt({ x: x - 1, y }))
              this.tileLayer.add(
                this.add.image(c.x, c.y, shadeKey).setDisplaySize(l.tile, l.tile).setAngle(-90).setAlpha(0.75)
              )
          }
        }
        else {
          g.fillStyle(biome.colors[terrain], 1)
          g.fillRect(o.x, o.y, l.tile, l.tile)
        }
        g.lineStyle(1, 0x000000, 0.1)
        g.strokeRect(o.x + 0.5, o.y + 0.5, l.tile - 1, l.tile - 1)
        const glyph = hasArt ? undefined : TERRAIN_GLYPH[terrain]
        if (glyph) {
          const txt = this.add
            .text(c.x, c.y, glyph, textStyle(l.tile * 0.42, "#ffffff", true, 0))
            .setOrigin(0.5)
            .setAlpha(0.45)
            .setDepth(0.5)
          this.glyphs.push(txt)
        }
        if (st.map.tiles[y]?.[x] === "wall_breakable") {
          const hp = st.walls[posKey(pos)] ?? 0
          const t = this.add
            .text(
              c.x + l.tile * 0.3,
              c.y - l.tile * 0.3,
              hp > 0 ? String(hp) : "",
              textStyle(l.tile * 0.22, "#ffd166", true, 3)
            )
            .setOrigin(0.5)
            .setDepth(0.6)
          this.wallTexts.set(posKey(pos), t)
          this.wallHp.set(posKey(pos), hp)
          if (hp > 0 && hp < 2) this.drawCrack(pos, hp)
        }
      }
    }
    // Рамка поля: тёмный контур и светлый внутренний кант
    g.lineStyle(Math.max(3, l.tile * 0.06), 0x000000, 0.35)
    g.strokeRect(l.ox - 1, l.oy - 1, l.tile * MAP_W + 2, l.tile * MAP_H + 2)
    g.lineStyle(2, 0xffffff, 0.18)
    g.strokeRect(l.ox + 1, l.oy + 1, l.tile * MAP_W - 2, l.tile * MAP_H - 2)
    this.groundBg?.destroy()
    this.groundBg = null
    const groundTex = groundKey(st.map.biomeId)
    if (hasTexture(this, groundTex)) {
      const w = this.scale.width
      const h = this.scale.height
      this.groundBg = this.add
        .tileSprite(0, 0, w, h, groundTex)
        .setOrigin(0, 0)
        .setTileScale(l.tile / 128, l.tile / 128)
        .setTilePosition(-l.ox * (128 / l.tile), -l.oy * (128 / l.tile))
        // Светлые биомы (снег, лёд, песок) затемняем мягче, иначе земля вокруг поля становится серой
        .setTint(["winter_park", "glacier", "desert"].includes(st.map.biomeId) ? 0xc9d2dc : 0x9a9a9a)
        .setAlpha(0.9)
        .setDepth(-2)
    }
    this.startTileAnimations()
    this.ensureWeather(st, flyAnchors)
    this.ambient?.destroy()
    this.ambient = new AmbientLayer(this, { biomeId: biome.id, layout: l, seed, water: waterSpots, plain: plainSpots })
  }

  /* ---------- Живые тайлы ---------- */

  private stopTileAnimations(): void {
    this.tileTimer?.remove(false)
    this.tileTimer = null
    for (const t of this.tileTweens) t.stop()
    this.tileTweens = []
    this.animTiles = []
  }

  /** Один таймер на все кадровые анимации: вода 4 кадра по 220 мс, листва 900 мс (0→1), пена 2 кадра. */
  private startTileAnimations(): void {
    if (this.animTiles.length === 0 && this.shoreImgs.length === 0) return
    const WATER_SEQ = [0, 1, 2, 3]
    const FOREST_SEQ = [0, 1]
    this.tileTimer = this.time.addEvent({
      delay: 110,
      loop: true,
      callback: () => {
        if (!sceneAlive(this)) return
        const now = this.time.now
        for (const cell of this.animTiles) {
          if (!cell.img.scene) continue
          const water = cell.terrain === "water"
          const seq = water ? WATER_SEQ : FOREST_SEQ
          const period = water ? 220 : 900
          const idx = Math.floor((now + cell.phase) / period) % seq.length
          const frame = Math.min(cell.frames - 1, seq[idx] ?? 0)
          if (frame === cell.frame) continue
          const key = envTileKey(this.tileBiome, cell.terrain, frame, cell.variant)
          if (!hasTexture(this, key)) continue
          cell.frame = frame
          const dw = cell.img.displayWidth
          const dh = cell.img.displayHeight
          cell.img.setTexture(key)
          cell.img.setDisplaySize(dw, dh)
        }
        // Пена у берега: два кадра, сдвинутые по фазе
        for (const s of this.shoreImgs) {
          if (!s.img.scene) continue
          const f = Math.floor((now + s.phase) / 520) % SHORE_FRAMES
          const key = edgeKey(this.tileBiome, "shore", f)
          if (s.img.texture.key === key || !hasTexture(this, key)) continue
          const dw = s.img.displayWidth
          const dh = s.img.displayHeight
          s.img.setTexture(key)
          s.img.setDisplaySize(dw, dh)
        }
      }
    })
  }

  /** Погода биома над тайлами и под юнитами; пересоздаётся при смене биома. */
  private ensureWeather(st: BattleState, flyAnchors: { x: number, y: number }[]): void {
    const biome = biomeDef(st.map.biomeId)
    const anchors = flyAnchors.length > 0 ? pickAnchors(flyAnchors, st.map.seed) : []
    if (this.weather && this.weatherBiome === biome.id) {
      this.weather.setAnchors(anchors, this.layout.tile * 0.7)
      return
    }
    this.weather?.destroy()
    this.weather = new WeatherLayer(this, biome.weather, {
      depth: 4,
      maxParticles: 40,
      windDir: st.map.seed % 2 === 0 ? 1 : -1,
      anchors,
      anchorRadius: this.layout.tile * 0.7
    })
    this.weatherBiome = biome.id
  }

  private updateWalls(st: BattleState): void {
    let changed = false
    for (const [key, t] of this.wallTexts) {
      const hp = st.walls[key] ?? 0
      const txt = hp > 0 ? String(hp) : ""
      if (t.text !== txt) t.setText(txt)
      const drawn = this.wallHp.get(key) ?? 0
      if (drawn > 0 && hp <= 0) changed = true
      if (hp > 0 && hp < drawn && !this.cracks.has(key))
        this.drawCrack({ x: Number(key.split(",")[0]), y: Number(key.split(",")[1]) }, hp)
    }
    if (changed) {
      this.lastMapRef = st.map
      this.drawTiles(st)
    }
  }

  private syncDecals(st: BattleState): void {
    const pools = st.decals.filter(d => d.kind === "pool")
    if (pools.length === this.decalCount) return
    // Поле перерисовано (раскладка или новый бой): лужи из состояния — сразу в итоговом виде, капли-пятна сбрасываются
    this.decalLayer.removeAll(true)
    clearGoreStains(this)
    pools.forEach((d, i) => {
      const c = this.center(d.pos)
      this.decalLayer.add(
        bloodDecal(this, c.x, c.y + this.tile * 0.15, this.tile, "pool", i + d.pos.x * 3 + d.pos.y * 7, false)
      )
    })
    this.decalCount = pools.length
  }

  private fillTile(g: Phaser.GameObjects.Graphics, key: string, color: number, alpha: number): void {
    const [xs, ys] = key.split(",")
    const x = Number(xs)
    const y = Number(ys)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    const o = tileOrigin(this.layout, { x, y })
    g.fillStyle(color, alpha)
    g.fillRect(o.x + 1, o.y + 1, this.layout.tile - 2, this.layout.tile - 2)
  }

  private hatchTile(g: Phaser.GameObjects.Graphics, key: string, color: number): void {
    const [xs, ys] = key.split(",")
    const x = Number(xs)
    const y = Number(ys)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    const o = tileOrigin(this.layout, { x, y })
    const t = this.layout.tile
    g.lineStyle(2, color, 0.5)
    for (let d = -t; d < t; d += t / 3) {
      const x1 = Math.max(o.x, o.x + d)
      const y1 = o.y + Math.max(0, -d)
      const x2 = Math.min(o.x + t, o.x + d + t)
      const y2 = o.y + Math.min(t, t - d)
      if (x2 > x1) g.lineBetween(x1, y1, x2, y2)
    }
  }

  /** Стрелка движения в стиле FEH: от текущей клетки через центры клеток пути до клетки назначения. */
  private drawPathArrow(g: Phaser.GameObjects.Graphics, path: Pos[]): void {
    const t = this.tile
    const pts = path.map(p => this.center(p))
    const n = pts.length
    const last = pts[n - 1]
    const prev = pts[n - 2]
    if (!last || !prev) return
    const dx = Math.sign(last.x - prev.x)
    const dy = Math.sign(last.y - prev.y)
    const headLen = t * 0.34
    const headHalf = t * 0.2
    const tip = { x: last.x + dx * t * 0.16, y: last.y + dy * t * 0.16 }
    const base = { x: tip.x - dx * headLen, y: tip.y - dy * headLen }
    const body = [...pts.slice(0, n - 1), base]
    const nx = -dy
    const ny = dx

    const pass = (width: number, color: number, alpha: number, pad: number): void => {
      g.lineStyle(width, color, alpha)
      g.beginPath()
      const first = body[0]
      if (!first) return
      g.moveTo(first.x, first.y)
      for (let i = 1; i < body.length; i++) {
        const b = body[i]
        if (b) g.lineTo(b.x, b.y)
      }
      g.strokePath()
      g.fillStyle(color, alpha)
      // скругляем стыки и начало
      for (let i = 0; i < body.length - 1; i++) {
        const b = body[i]
        if (b) g.fillCircle(b.x, b.y, width / 2)
      }
      // наконечник
      const hl = headLen + pad
      const hh = headHalf + pad
      const tipX = tip.x + dx * pad
      const tipY = tip.y + dy * pad
      const bx = tipX - dx * hl
      const by = tipY - dy * hl
      g.fillTriangle(tipX, tipY, bx + nx * hh, by + ny * hh, bx - nx * hh, by - ny * hh)
    }
    // Стрелка полупрозрачная, чтобы не перекрывать тайлы и юнитов
    pass(Math.max(6, t * 0.3), 0x0d1b2a, 0.45, Math.max(2, t * 0.05)) // контур
    pass(Math.max(3, t * 0.17), HL.path, 0.55, 0) // заливка
    // маркер старта
    const start = pts[0]
    if (start) {
      g.lineStyle(Math.max(2, t * 0.05), 0x0d1b2a, 0.45)
      g.strokeCircle(start.x, start.y, t * 0.22)
      g.lineStyle(Math.max(1, t * 0.03), HL.path, 0.55)
      g.strokeCircle(start.x, start.y, t * 0.22)
    }
  }

  /** Следы лап по клеткам пути (кроме стартовой), повёрнуты по ходу движения; «шагают» в tickEnv. */
  private layPaws(path: Pos[] | null): void {
    const t = this.tile
    let n = 0
    if (path) {
      for (let i = 1; i < path.length - 1; i++) {
        const prev = path[i - 1]
        const cur = path[i]
        if (!prev || !cur) continue
        const c = this.center(cur)
        const ang = Math.atan2(cur.y - prev.y, cur.x - prev.x) * (180 / Math.PI) + 90
        for (const side of [-1, 1]) {
          let img = this.pawPool[n]
          if (!img) {
            img = this.add.image(0, 0, ENV.paw).setDepth(3.2)
            this.pawPool[n] = img
          }
          const rad = ((ang - 90) * Math.PI) / 180
          const off = t * 0.12 * side
          img
            .setPosition(c.x - Math.sin(rad) * off, c.y + Math.cos(rad) * off)
            .setAngle(ang)
            .setDisplaySize(t * 0.26, t * 0.26)
            .setTint(HL.path)
            .setVisible(true)
            .setData("step", i * 2 + (side > 0 ? 1 : 0))
          n++
        }
      }
    }
    for (let i = n; i < this.pawPool.length; i++) this.pawPool[i]?.setVisible(false)
    this.pawCount = n
  }

  /** Каждый кадр: волна пульса по светящимся клеткам, бег штриховки опасности, «шагающие» следы лап. */
  private tickEnv(time: number): void {
    if (!this.hlLayer) return
    const pulse = (img: Phaser.GameObjects.Image, speed: number, depth: number): void => {
      if (!img.visible || this.tweens.isTweening(img)) return
      const base = (img.getData("baseA") as number | undefined) ?? img.alpha
      const wave = (img.getData("wave") as number | undefined) ?? 0
      img.setAlpha(base * (1 - depth + depth * (0.5 + 0.5 * Math.sin(time * speed - wave * 0.7))))
    }
    for (const img of this.reachPool) pulse(img, 0.004, 0.35)
    for (const img of this.targetPool) pulse(img, 0.009, 0.45)
    for (const img of this.threatPool) pulse(img, 0.005, 0.4)
    for (const ts of this.dangerPool) if (ts.visible) ts.tilePositionX = (time * 0.02) % 64
    if (this.pawCount > 0) {
      const steps = this.pawCount + 4
      const head = Math.floor(time / 110) % steps
      for (let i = 0; i < this.pawCount; i++) {
        const img = this.pawPool[i]
        if (!img) continue
        const step = (img.getData("step") as number | undefined) ?? i
        const d = head - step
        img.setAlpha(d >= 0 && d < 4 ? 0.95 - d * 0.18 : 0.28)
      }
    }
  }

  /* ---------- Подсветки ---------- */

  private tileAt(key: string): Pos | null {
    const [xs, ys] = key.split(",")
    const x = Number(xs)
    const y = Number(ys)
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
  }

  /** Светящаяся клетка из пула: создаётся по требованию, переиспользуется между перерисовками. */
  private poolTile(pool: Phaser.GameObjects.Image[], i: number, texture: string = ENV.glowTile): Phaser.GameObjects.Image {
    let img = pool[i]
    if (!img) {
      img = this.add.image(0, 0, texture).setOrigin(0, 0)
      this.hlLayer.add(img)
      pool[i] = img
    }
    else if (img.texture.key !== texture) img.setTexture(texture)
    return img
  }

  private hidePool(pool: Phaser.GameObjects.Image[], from = 0): void {
    for (let i = from; i < pool.length; i++) {
      const img = pool[i]
      if (!img) continue
      this.tweens.killTweensOf(img)
      img.setVisible(false)
    }
  }

  /** Разложить квадраты пула по клеткам; при animate они появляются волной по delayFn. */
  private layTiles(
    pool: Phaser.GameObjects.Image[],
    tiles: { key: string, color: number, alpha: number, delay: number }[],
    animate: boolean,
    texture: string = ENV.glowTile
  ): void {
    const t = this.layout.tile
    tiles.forEach((spec, i) => {
      const pos = this.tileAt(spec.key)
      const img = this.poolTile(pool, i, texture)
      if (!pos) {
        img.setVisible(false)
        return
      }
      const o = tileOrigin(this.layout, pos)
      this.tweens.killTweensOf(img)
      img
        .setPosition(o.x + 1, o.y + 1)
        .setDisplaySize(t - 2, t - 2)
        .setTint(spec.color)
        .setVisible(true)
        .setData("baseA", spec.alpha)
        .setData("wave", pos.x + pos.y)
      if (animate) {
        img.setAlpha(0)
        this.tweens.add({ targets: img, alpha: spec.alpha, duration: 160, delay: spec.delay, ease: "Quad.easeOut" })
      }
      else img.setAlpha(spec.alpha)
    })
    this.hidePool(pool, tiles.length)
  }

  /** Зона опасности: бегущая оранжевая штриховка и контур по границе зоны; угроза врага — фиолетовые светящиеся клетки. */
  private drawDanger(ui: BattleUiState): void {
    const g = this.dangerG
    g.clear()
    const t = this.layout.tile
    const keys = ui.dangerOn ? [...ui.dangerTiles] : []
    const set = new Set(keys)
    keys.forEach((k, i) => {
      const pos = this.tileAt(k)
      if (!pos) return
      let ts = this.dangerPool[i]
      if (!ts) {
        ts = this.add.tileSprite(0, 0, 64, 64, ENV.hatch).setOrigin(0, 0).setTint(HL.danger)
        this.dangerLayer.add(ts)
        this.dangerPool[i] = ts
      }
      const o = tileOrigin(this.layout, pos)
      ts.setPosition(o.x, o.y).setSize(t, t).setTileScale(t / 64, t / 64).setAlpha(0.45).setVisible(true)
      // Контур только там, где сосед не в зоне
      g.lineStyle(Math.max(2, t * 0.05), HL.danger, 0.95)
      if (!set.has(posKey({ x: pos.x, y: pos.y - 1 }))) g.lineBetween(o.x, o.y, o.x + t, o.y)
      if (!set.has(posKey({ x: pos.x, y: pos.y + 1 }))) g.lineBetween(o.x, o.y + t, o.x + t, o.y + t)
      if (!set.has(posKey({ x: pos.x - 1, y: pos.y }))) g.lineBetween(o.x, o.y, o.x, o.y + t)
      if (!set.has(posKey({ x: pos.x + 1, y: pos.y }))) g.lineBetween(o.x + t, o.y, o.x + t, o.y + t)
    })
    for (let i = keys.length; i < this.dangerPool.length; i++) this.dangerPool[i]?.setVisible(false)
    const tg = this.threatG
    tg.clear()
    const threat = ui.infoThreat ? [...ui.infoThreat] : []
    threat.forEach((k, i) => {
      const pos = this.tileAt(k)
      const img = this.poolTile(this.threatPool, i)
      if (!pos) {
        img.setVisible(false)
        return
      }
      const o = tileOrigin(this.layout, pos)
      img
        .setPosition(o.x + 1, o.y + 1)
        .setDisplaySize(t - 2, t - 2)
        .setTint(HL.threat)
        .setAlpha(0.55)
        .setVisible(true)
        .setData("baseA", 0.55)
        .setData("wave", pos.x + pos.y)
    })
    this.hidePool(this.threatPool, threat.length)
  }

  private drawReach(ui: BattleUiState): void {
    const show
      = !!ui.reach && ui.mode !== "idle" && ui.mode !== "enemyInfo" && ui.mode !== "busy" && ui.mode !== "ended"
    if (!show || !ui.reach) {
      this.reachSig = ""
      this.targetSig = ""
      this.hidePool(this.reachPool)
      this.hidePool(this.targetPool)
      return
    }
    const reachTiles: { key: string, color: number, alpha: number, delay: number }[] = []
    let maxCost = 0
    for (const node of ui.reach.values()) {
      if (!node.canStop) continue
      maxCost = Math.max(maxCost, node.cost)
      reachTiles.push({ key: posKey(node.pos), color: HL.reach, alpha: 0.5, delay: node.cost * 45 })
    }
    const reachSig = `${ui.selectedId}:${reachTiles.map(r => r.key).join("|")}`
    if (reachSig !== this.reachSig) {
      const fresh = !this.reachSig.startsWith(`${ui.selectedId}:`)
      this.reachSig = reachSig
      this.layTiles(this.reachPool, reachTiles, fresh)
    }
    const targetTiles: { key: string, color: number, alpha: number, delay: number }[] = []
    const after = maxCost * 45 + 60
    if (ui.attackTiles)
      for (const k of ui.attackTiles) targetTiles.push({ key: k, color: HL.attack, alpha: 0.62, delay: after })
    if (ui.assistTiles)
      for (const k of ui.assistTiles) targetTiles.push({ key: k, color: HL.assist, alpha: 0.6, delay: after + 40 })
    const targetSig = `${ui.selectedId}:${ui.mode}:${targetTiles.map(r => r.key + r.color).join("|")}`
    if (targetSig !== this.targetSig) {
      const fresh = !this.targetSig.startsWith(`${ui.selectedId}:`)
      this.targetSig = targetSig
      this.layTiles(this.targetPool, targetTiles, fresh, ENV.targetTile)
    }
  }

  /** Прицел из четырёх скобок: дышит и медленно поворачивается. */
  private drawMarker(pos: Pos | null, kind: "attack" | "assist" | "wall"): void {
    if (!pos) {
      if (this.marker) {
        for (const t of this.markerTweens) t.stop()
        this.markerTweens = []
        this.marker.destroy()
        this.marker = null
        this.markerKind = ""
      }
      return
    }
    const c = this.center(pos)
    const color = kind === "attack" ? HL.attack : kind === "assist" ? HL.assist : 0xffb703
    const t = this.tile
    if (!this.marker) {
      const cont = this.add.container(c.x, c.y).setDepth(12)
      const half = t / 2 - 1
      const sz = Math.max(10, t * 0.34)
      const corners: [number, number, number][] = [
        [-half, -half, 0],
        [half, -half, 90],
        [half, half, 180],
        [-half, half, 270]
      ]
      for (const [x, y, angle] of corners) {
        const img = this.add
          .image(x, y, TEX.corner)
          .setOrigin(0, 0)
          .setDisplaySize(sz, sz)
          .setAngle(angle)
          .setTint(color)
        cont.add(img)
      }
      this.marker = cont
      this.markerTweens = [
        this.tweens.add({ targets: cont, scale: 1.12, duration: 520, yoyo: true, repeat: -1, ease: "Sine.easeInOut" }),
        this.tweens.add({ targets: cont, angle: 90, duration: 4000, repeat: -1, ease: "Linear" })
      ]
      cont.setAlpha(0)
      this.tweens.add({ targets: cont, alpha: 1, duration: 120 })
    }
    else this.marker.setPosition(c.x, c.y)
    if (this.markerKind !== kind) {
      this.markerKind = kind
      for (const child of this.marker.list) if (child instanceof Phaser.GameObjects.Image) child.setTint(color)
    }
  }

  private drawHighlights(ui: BattleUiState): void {
    if (!this.hlLayer) return
    const pg = this.pathG
    pg.clear()

    this.drawDanger(ui)
    this.drawReach(ui)
    if (ui.path && ui.path.length > 1) this.drawPathArrow(pg, ui.path)
    this.layPaws(ui.path && ui.path.length > 1 ? ui.path : null)

    // Выбрали юнита тапом — подскок
    if (ui.selectedId !== this.lastSelectedId) {
      // Выделение: кольцо, свечение и подскок (setSelected сам делает hop)
      if (this.lastSelectedId) this.units.get(this.lastSelectedId)?.setSelected(false)
      this.lastSelectedId = ui.selectedId
      if (ui.selectedId && !ui.dragging && ui.mode === "unitSelected") this.units.get(ui.selectedId)?.setSelected(true)
    }

    // Сам юнит стоит на клетке предпросмотра (или в руке), а на исходной клетке — бледный призрак
    const st = $save.get().battle
    this.applyPreviewPlacement(ui)
    const showGhost
      = !!ui.selectedId && !!ui.origin && !!st && (ui.dragging || isDisplaced(ui) || this.landingId === ui.selectedId)
    const ghostKey = showGhost && ui.selectedId && ui.origin ? `${ui.selectedId}@${posKey(ui.origin)}` : ""
    if (ghostKey !== this.ghostKey) {
      this.ghost?.destroy()
      this.ghost = null
      this.ghostKey = ghostKey
      if (ghostKey && ui.selectedId && ui.origin && st) {
        const unit = st.roster[ui.selectedId]
        const bu = st.units[ui.selectedId]
        if (unit && bu) {
          this.ghost = new UnitView(this, unit, bu.side, { size: this.tile, showHp: false, showBadges: false })
          const c = this.center(ui.origin)
          this.ghost.setPosition(c.x, c.y).setAlpha(0.35).setDepth(9)
        }
      }
    }
    // Юнит в руке: подсветка «сюда нельзя»
    if (this.drag && this.drag.view.scene) this.drag.view.setInvalidTint(ui.dragging && !ui.dragValid)

    // Прицел на цели
    let markerPos: Pos | null = null
    let kind: "attack" | "assist" | "wall" = "attack"
    if (ui.targetId && st) {
      const t = st.units[ui.targetId]
      const sel = ui.selectedId ? st.units[ui.selectedId] : undefined
      if (t) {
        markerPos = t.pos
        kind = sel && t.side === sel.side ? "assist" : "attack"
      }
    }
    else if (ui.wallPos) {
      markerPos = ui.wallPos
      kind = "wall"
    }
    this.drawMarker(markerPos, kind)
  }
}
