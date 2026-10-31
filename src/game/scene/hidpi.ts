import Phaser from "phaser"
import { $save } from "@game/state/save"
import { $boardLayout } from "@game/state/boardLayout"
import { diagEnv, diagLog, setDiagSnapshotter } from "@game/platform/diag"
import { browserRenderScale, setActiveRenderScale, textRes } from "./renderScale"

/**
 * Чёткий рендер на экранах с высокой плотностью пикселей. В Phaser 3.90 нет `resolution`, поэтому:
 *
 * - игра в `Scale.NONE`: буфер канваса — CSS-размер контейнера × `scale`, а CSS-размер канваса — размер контейнера
 *   (`zoom: 1/scale` плюс подгонка стиля по ResizeObserver). Ввод Phaser пересчитывает в пиксели буфера сам;
 * - все сцены по-прежнему живут в CSS-единицах: у главной камеры базовый зум `scale`, а «покой» камеры —
 *   `centerOn(середина вида)`, так что мировая точка (0, 0) остаётся в левом верхнем углу. Зумы сцен задаются
 *   относительно базы (`setCssZoom`, `cssZoom`), размеры вида — `viewW`/`viewH` вместо `scale.width/height`;
 * - объекты в экранных координатах (бывший `setScrollFactor(0)`) закрепляет `pinToScreen`: при зуме камеры не 1
 *   Phaser рисует их относительно центра буфера, и им нужен постоянный сдвиг.
 */

const scaleOfGame = new WeakMap<Phaser.Game, number>()

/** Плотность рендера игры сцены (1 — игра смонтирована не через `createHiDpiGame`). */
export function renderScaleOf(scene: Phaser.Scene | undefined): number {
  // После уничтожения объекта/сцены ссылки могут быть уже пустыми — тогда плотность 1, без исключения
  const game = (scene as { sys?: Phaser.Scenes.Systems } | undefined)?.sys?.game
  return (game && scaleOfGame.get(game)) ?? 1
}

/** Ширина вида в CSS-пикселях (раньше — `scene.scale.width`). */
export function viewW(scene: Phaser.Scene): number {
  return scene.scale.width / renderScaleOf(scene)
}

/** Высота вида в CSS-пикселях (раньше — `scene.scale.height`). */
export function viewH(scene: Phaser.Scene): number {
  return scene.scale.height / renderScaleOf(scene)
}

/** Зум камеры в CSS-единицах: 1 — мир 1:1 с CSS-пикселями. */
export function cssZoom(scene: Phaser.Scene, cam = scene.cameras.main): number {
  return cam.zoom / renderScaleOf(scene)
}

/** Абсолютный зум камеры для зума `z` в CSS-единицах (для `zoomTo` и твинов `zoom`). */
export function camZoom(scene: Phaser.Scene, z: number): number {
  return z * renderScaleOf(scene)
}

export function setCssZoom(scene: Phaser.Scene, z: number, cam = scene.cameras.main): void {
  cam.setZoom(z * renderScaleOf(scene))
}

/** Камера в покое: без зума, мир (0, 0) — в левом верхнем углу экрана. */
export function restCamera(scene: Phaser.Scene, cam = scene.cameras.main): void {
  cam.setZoom(renderScaleOf(scene))
  cam.centerOn(viewW(scene) / 2, viewH(scene) / 2)
}

/**
 * Сдвиг для объектов без прокрутки камеры: Phaser зумит их вокруг центра буфера, а координаты у них — CSS.
 * Сдвиг не зависит от текущего зума камеры, только от плотности и размера вида.
 */
export function screenOffset(scene: Phaser.Scene): { x: number, y: number } {
  const s = renderScaleOf(scene)
  const k = (1 - 1 / s) / 2
  return { x: scene.scale.width * k, y: scene.scale.height * k }
}

type Pinnable = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth

/**
 * Закрепить объект в экранных CSS-координатах (вместо `setScrollFactor(0)`). При плотности 1 — просто
 * `setScrollFactor(0)`; иначе объект кладётся в контейнер со сдвигом `screenOffset` и глубиной объекта
 * (задайте `setDepth` до вызова). Контейнер уничтожается вместе с объектом и следит за размером канваса.
 */
export function pinToScreen<T extends Pinnable>(obj: T): T {
  obj.setScrollFactor(0)
  const scene = obj.scene as Phaser.Scene | undefined
  if (!scene || renderScaleOf(scene) === 1) return obj
  const off = screenOffset(scene)
  const box = scene.add.container(off.x, off.y).setScrollFactor(0).setDepth(obj.depth)
  box.add(obj)
  const relayout = (): void => {
    const o = screenOffset(scene)
    box.setPosition(o.x, o.y)
  }
  scene.scale.on(Phaser.Scale.Events.RESIZE, relayout)
  const drop = (): void => {
    scene.scale?.off(Phaser.Scale.Events.RESIZE, relayout)
    if (box.scene) box.destroy()
  }
  obj.once(Phaser.GameObjects.Events.DESTROY, drop)
  // Контейнер уничтожается первым (выключение сцены): его preDestroy уничтожает obj раньше, чем box
  // испустит DESTROY. Без отписки drop повторно вошёл бы в box.destroy() и уничтожил obj вложенно —
  // внешний obj.destroy() падал бы на `this.scene.sys` (scene уже undefined).
  const hooked = box as unknown as { preDestroy: (this: Phaser.GameObjects.Container) => void }
  const boxPreDestroy = hooked.preDestroy
  hooked.preDestroy = function (this: Phaser.GameObjects.Container): void {
    obj.off(Phaser.GameObjects.Events.DESTROY, drop)
    boxPreDestroy.call(this)
  }
  box.once(Phaser.GameObjects.Events.DESTROY, () => scene.scale?.off(Phaser.Scale.Events.RESIZE, relayout))
  return obj
}

/**
 * Подготовить сцену к плотному рендеру — вызывать первой строкой `create()`:
 * - камера встаёт в покой (базовый зум); `keepAtRest` — и после каждого изменения размера;
 * - тряска камеры: Phaser считает её от ширины буфера и умножает на зум дважды — делим силу на `scale²`,
 *   чтобы амплитуда в CSS-пикселях осталась прежней;
 * - тексты по умолчанию рисуются с разрешением `scale`.
 */
export function initHiDpiScene(scene: Phaser.Scene, opts: { keepAtRest?: boolean } = {}): void {
  const s = renderScaleOf(scene)
  const cam = scene.cameras.main
  restCamera(scene, cam)
  if (s === 1) return
  const shake = cam.shake.bind(cam)
  cam.shake = ((duration?: number, intensity?: number | Phaser.Math.Vector2, ...rest: unknown[]) => {
    const k = 1 / (s * s)
    const i = intensity === undefined
      ? 0.05 * k
      : typeof intensity === "number"
        ? intensity * k
        : new Phaser.Math.Vector2(intensity.x * k, intensity.y * k)
    return (shake as (...a: unknown[]) => Phaser.Cameras.Scene2D.Camera)(duration, i, ...rest)
  }) as typeof cam.shake
  const onAdded = (obj: Phaser.GameObjects.GameObject): void => {
    if (obj instanceof Phaser.GameObjects.Text && obj.style.resolution < textRes()) obj.setResolution(textRes())
  }
  scene.sys.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, onAdded)
  const onResize = (): void => {
    if (opts.keepAtRest) restCamera(scene, cam)
  }
  if (opts.keepAtRest) scene.scale.on(Phaser.Scale.Events.RESIZE, onResize)
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.sys.events.off(Phaser.Scenes.Events.ADDED_TO_SCENE, onAdded)
    scene.scale.off(Phaser.Scale.Events.RESIZE, onResize)
  })
}

/**
 * Phaser-игра на весь контейнер с буфером `CSS × scale`. Плотность берётся из настройки `graphics` в момент
 * монтирования; смена настройки применяется со следующего монтирования игры.
 */
export function createHiDpiGame(parent: HTMLElement, config: Phaser.Types.Core.GameConfig, diagTag = "game"): Phaser.Game {
  const s = browserRenderScale($save.get().settings.graphics ?? "auto")
  setActiveRenderScale(s)
  const css = (): { w: number, h: number } => ({
    w: Math.max(1, Math.floor(parent.clientWidth)),
    h: Math.max(1, Math.floor(parent.clientHeight))
  })
  const { w, h } = css()
  const game = new Phaser.Game({
    ...config,
    parent,
    scale: {
      mode: Phaser.Scale.NONE,
      parent,
      width: Math.round(w * s),
      height: Math.round(h * s),
      zoom: 1 / s,
      autoCenter: Phaser.Scale.NO_CENTER,
      autoRound: true
    }
  })
  scaleOfGame.set(game, s)

  /** Подогнать буфер и CSS-размер канваса под контейнер; ввод — пересчитать под новые границы канваса. */
  const fit = (): void => {
    const sm = game.scale as Phaser.Scale.ScaleManager | undefined
    const canvas = game.canvas as HTMLCanvasElement | undefined
    if (!sm || !canvas) return
    const { w: cw, h: ch } = css()
    const bw = Math.max(1, Math.round(cw * s))
    const bh = Math.max(1, Math.round(ch * s))
    if (sm.width !== bw || sm.height !== bh) sm.resize(bw, bh)
    canvas.style.width = `${cw}px`
    canvas.style.height = `${ch}px`
    sm.updateBounds()
    const b = sm.canvasBounds
    if (b.width > 0 && b.height > 0) sm.displayScale.set(sm.baseSize.width / b.width, sm.baseSize.height / b.height)
  }
  game.events.once(Phaser.Core.Events.READY, fit)
  let ro: ResizeObserver | null = null
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => fit())
    ro.observe(parent)
  }
  else window.addEventListener("resize", fit)
  const stopDiag = watchDiag(game, parent, s, diagTag)
  game.events.once(Phaser.Core.Events.DESTROY, () => {
    ro?.disconnect()
    window.removeEventListener("resize", fit)
    stopDiag()
  })
  return game
}

/* ---------- Диагностика (`@game/platform/diag`) ---------- */

/** Снимок размеров игры: всё, что должно сходиться — буфер = CSS × s, зум камеры карты = s × зум вида. */
function diagGame(game: Phaser.Game, parent: HTMLElement, s: number, tag: string, reason: string): void {
  const sm = game.scale as Phaser.Scale.ScaleManager | undefined
  const canvas = game.canvas as HTMLCanvasElement | undefined
  const gl = (game.renderer as Partial<Phaser.Renderer.WebGL.WebGLRenderer> | undefined)?.gl
  const rect = canvas?.getBoundingClientRect()
  const cams: Record<string, number> = {}
  for (const sc of game.scene?.getScenes(true) ?? []) {
    const z = sc.cameras?.main?.zoom
    if (typeof z === "number") cams[sc.sys.settings.key] = Math.round(z * 1000) / 1000
  }
  const l = tag === "battle" ? $boardLayout.get() : null
  diagLog(`${tag}:${reason}`, {
    ...diagEnv(),
    s,
    parent: `${parent.clientWidth}x${parent.clientHeight}`,
    sm: sm ? `${sm.width}x${sm.height}` : null,
    canvas: canvas ? `${canvas.width}x${canvas.height}` : null,
    css: canvas ? `${canvas.style.width}x${canvas.style.height}` : null,
    rect: rect ? `${Math.round(rect.width)}x${Math.round(rect.height)}@${Math.round(rect.x)},${Math.round(rect.y)}` : null,
    db: gl ? `${gl.drawingBufferWidth}x${gl.drawingBufferHeight}` : `renderer:${game.renderer?.type ?? "-"}`,
    lost: gl ? gl.isContextLost() : null,
    cams,
    layout: l ? `${l.tile}@${l.ox},${l.oy} ${l.width}x${l.height}` : null
  })
}

/** Снимки игры: готовность (и через 2 с), RESIZE (не чаще раза в секунду), потеря WebGL, возврат из фона. */
function watchDiag(game: Phaser.Game, parent: HTMLElement, s: number, tag: string): () => void {
  const snap = (reason: string): void => {
    try {
      diagGame(game, parent, s, tag, reason)
    }
    catch {
      /* диагностика не должна ломать игру */
    }
  }
  const timers: ReturnType<typeof setTimeout>[] = []
  let lastResize = 0
  let pendingResize: ReturnType<typeof setTimeout> | null = null
  const onResize = (): void => {
    if (pendingResize) return
    const wait = Math.max(0, 1000 - (Date.now() - lastResize))
    pendingResize = setTimeout(() => {
      pendingResize = null
      lastResize = Date.now()
      snap("resize")
    }, wait)
  }
  const onLost = (): void => snap("contextlost")
  const onRestored = (): void => snap("contextrestored")
  const canvas = (): HTMLCanvasElement | undefined => game.canvas as HTMLCanvasElement | undefined
  // Phaser может загрузиться прямо в конструкторе (BOOT уже прошёл), поэтому подписки — по READY
  game.events.once(Phaser.Core.Events.READY, () => {
    game.scale.on(Phaser.Scale.Events.RESIZE, onResize)
    canvas()?.addEventListener("webglcontextlost", onLost)
    canvas()?.addEventListener("webglcontextrestored", onRestored)
    snap("ready")
    timers.push(setTimeout(() => snap("ready+2s"), 2000))
  })
  const onVisibility = (): void => snap(document.visibilityState === "visible" ? "visible" : "hidden")
  document.addEventListener("visibilitychange", onVisibility)
  setDiagSnapshotter(snap)
  return () => {
    for (const t of timers) clearTimeout(t)
    if (pendingResize) clearTimeout(pendingResize)
    document.removeEventListener("visibilitychange", onVisibility)
    canvas()?.removeEventListener("webglcontextlost", onLost)
    canvas()?.removeEventListener("webglcontextrestored", onRestored)
    setDiagSnapshotter(null, snap)
    snap("destroy")
  }
}
