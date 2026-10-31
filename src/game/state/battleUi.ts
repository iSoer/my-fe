import { atom } from "nanostores"
import type { BattleAction, BattleEvent, BattleState, BattleUnit, Pos, UnitInstance } from "@game/core/types"
import { unitKit } from "@game/core/skills/engine"
import { manhattan, mapSize, posKey, samePos } from "@game/core/types"
import {
  attackOptions,
  dangerZone,
  isBreakableWall,
  moveOrigin,
  reachableTiles,
  threatCounts,
  threatTiles,
  wallOptions,
  wallsFrom,
  weaponRange,
  type ReachMap
} from "@game/core/map/pathing"
import { assistTargetsFrom, planAssist, type AssistPlan } from "@game/core/battle/assist"
import { simulateCombat, type CombatOutcome } from "@game/core/combat"
import { allPlayerUnitsActed, canExtract, chestToOpen } from "@game/core/battle/reducer"
import { nextEnemyAction } from "@game/core/ai"
import { terrainAt, unitAt } from "@game/core/battle/query"
import { $save, dispatchBattle } from "./save"
import { haptic } from "@game/platform/haptics"
import { sfx } from "@game/platform/audio"
import { tr } from "@game/i18n"

/**
 * Управление в духе Fire Emblem Heroes, без меню действий и «Ждать»:
 * idle → unitSelected (видны дальность хода и цели) → тап по клетке передвигает бойца, и он остаётся выбранным:
 *   переставлять его можно сколько угодно, дальность всегда считается от клетки начала хода;
 * тап по врагу / союзнику / хлипкой стене → forecast / assistPreview / wallPreview, повторный тап (или кнопка)
 *   подтверждает — это и завершает ход бойца. Не действовавшие бойцы просто стоят до конца хода.
 * Перетаскивание: beginDrag → dragHover* → endDrag ставит бойца на клетку или открывает прогноз по цели.
 * Тап по пустой клетке вне хода бойца — tileInfo: справка о местности (бонусы, проходимость).
 */
export type UiMode
  = | "idle"
    | "unitSelected"
    | "forecast"
    | "assistPreview"
    | "wallPreview"
    | "enemyInfo"
    | "tileInfo"
    | "busy"
    | "ended"

/**
 * Вопрос игроку в чаще: открыть сундук, на котором стоит боец с ключом, или увести отряд через выход.
 * Пока вопрос открыт, поле не принимает тапов.
 */
export type BattlePrompt
  = | { kind: "chest", unitId: string, chestId: string }
    | { kind: "exit", unitId: string }

export interface BattleUiState {
  mode: UiMode
  prompt?: BattlePrompt
  selectedId?: string
  /** Клетка, где выбранный боец стоит сейчас. */
  origin?: Pos
  /** Клетка, с которой боец выполнит действие (для предпросмотра вид стоит там). */
  movedTo?: Pos
  path?: Pos[]
  /** Достижимые клетки от клетки начала хода. */
  reach?: ReachMap
  /** Клетки врагов и хлипких стен, по которым можно ударить с учётом движения. */
  attackTiles?: Set<string>
  assistTiles?: Set<string>
  targetId?: string
  forecast?: CombatOutcome
  assistPlan?: AssistPlan
  wallPos?: Pos
  infoId?: string
  infoThreat?: Set<string>
  /** Клетка, о которой показана справка (режим tileInfo). */
  infoPos?: Pos
  /** На юните зажата кнопка/палец (ещё не перетаскивание): накладки не перехватывают курсор. */
  pressedId?: string
  /** Юнита держат за шкирку. */
  dragging: boolean
  dragHover?: Pos
  dragValid: boolean
  dangerOn: boolean
  dangerTiles: Set<string>
  busy: boolean
  fastForward: boolean
  toast?: string
  toastAt?: number
}

const BASE: BattleUiState = {
  mode: "idle",
  dragging: false,
  dragValid: false,
  dangerOn: false,
  dangerTiles: new Set(),
  busy: false,
  fastForward: false
}

/** Сбросить предпросмотр действия (цель, прогноз, клетку действия). */
const NO_PREVIEW: Partial<BattleUiState> = {
  movedTo: undefined,
  path: undefined,
  targetId: undefined,
  forecast: undefined,
  assistPlan: undefined,
  wallPos: undefined
}

export const $battleUi = atom<BattleUiState>({ ...BASE })

export interface Presenter {
  play(events: BattleEvent[], before: BattleState, after: BattleState): Promise<void>
}

let presenter: Presenter | null = null
export function setPresenter(p: Presenter | null): void {
  // Старый презентер уходит вместе со своей Phaser-игрой: его недоигранные анимации не дождаться
  if (p !== presenter) releasePlays()
  presenter = p
}

/**
 * Сеанс экрана боя. Вход и уход с экрана меняют номер: циклы прошлого сеанса (ход врага, ожидание анимаций)
 * после ближайшего await видят чужой номер и молча выходят. Состояние боя от этого не страдает: редьюсер
 * уже применил и сохранил каждое действие, остановилось только проигрывание. При возврате на экран
 * `enterBattleScreen` продолжит ход врага с того места, где он прервался.
 */
let session = 0
/** Ожидающие окончания `presenter.play`: при уходе с экрана или смене презентера отпускаются сразу. */
const pendingPlays = new Set<() => void>()

function releasePlays(): void {
  const all = [...pendingPlays]
  pendingPlays.clear()
  for (const release of all) release()
}

/** Уход с экрана боя: прервать проигрывание и циклы контроллера, сбросить интерфейс. */
export function leaveBattleScreen(): void {
  session++
  releasePlays()
  $battleUi.set({ ...BASE })
}

let onEnded: ((state: BattleState) => void) | null = null
export function setOnBattleEnded(cb: ((state: BattleState) => void) | null): void {
  onEnded = cb
}

function state(): BattleState | undefined {
  return $save.get().battle
}

function patch(p: Partial<BattleUiState>): void {
  $battleUi.set({ ...$battleUi.get(), ...p })
}

export function toast(msg: string): void {
  patch({ toast: msg, toastAt: Date.now() })
}

function clearSelection(extra: Partial<BattleUiState> = {}): void {
  const cur = $battleUi.get()
  $battleUi.set({
    ...BASE,
    mode: cur.mode === "ended" ? "ended" : "idle",
    pressedId: cur.pressedId,
    dangerOn: cur.dangerOn,
    dangerTiles: cur.dangerTiles,
    busy: cur.busy,
    fastForward: cur.fastForward,
    toast: cur.toast,
    toastAt: cur.toastAt,
    ...extra
  })
}

export function refreshDanger(): void {
  const st = state()
  const ui = $battleUi.get()
  if (!st || !ui.dangerOn) return patch({ dangerTiles: new Set() })
  patch({ dangerTiles: dangerZone(st, "enemy") })
}

export function toggleDanger(): void {
  patch({ dangerOn: !$battleUi.get().dangerOn })
  refreshDanger()
}

export function setFastForward(on: boolean): void {
  patch({ fastForward: on })
}

export function enterBattleScreen(): void {
  session++
  releasePlays()
  const st = state()
  const settings = $save.get().settings
  $battleUi.set({ ...BASE, mode: st?.result ? "ended" : "idle", dangerOn: settings.dangerZoneDefault })
  refreshDanger()
  if (st && !st.result && st.phase === "enemy") void runEnemyPhase()
}

/* ---------- Вычисления ---------- */

function canAct(st: BattleState, ui: BattleUiState): boolean {
  return !ui.busy && !ui.prompt && !st.result && st.phase === "player"
}

/** Вопрос для бойцов `unitIds` (в порядке приоритета): сначала сундук, который можно открыть, затем выход. */
function promptFor(st: BattleState, unitIds: string[]): BattlePrompt | undefined {
  for (const id of unitIds) {
    const chest = chestToOpen(st, id)
    if (chest) return { kind: "chest", unitId: id, chestId: chest.id }
  }
  for (const id of unitIds) if (canExtract(st, id)) return { kind: "exit", unitId: id }
  return undefined
}

/** Задать вопрос о сундуке или выходе, если бойцы на такой клетке. Возвращает true, если вопрос задан. */
function offerPrompt(st: BattleState, unitIds: string[]): boolean {
  const prompt = promptFor(st, unitIds)
  if (!prompt) return false
  patch({ prompt })
  haptic("medium")
  return true
}

function pathFor(reach: ReachMap, to: Pos): Pos[] {
  const path: Pos[] = []
  let key: string | undefined = posKey(to)
  while (key) {
    const n = reach.get(key)
    if (!n) break
    path.unshift(n.pos)
    key = n.prev
  }
  return path
}

/** Стрелка пути для предпросмотра: от клетки, где боец стоит сейчас (а не от клетки начала хода). */
function previewPath(st: BattleState, bu: BattleUnit, reach: ReachMap, to: Pos): Pos[] {
  if (samePos(bu.pos, moveOrigin(bu))) return pathFor(reach, to)
  const here = reachableTiles(st, bu, bu.pos, mapSize(st.map).w * mapSize(st.map).h)
  return here.has(posKey(to)) ? pathFor(here, to) : [bu.pos, to]
}

/** Достижимые клетки бойца; клетка, где он стоит, всегда среди них (даже если его туда сдвинула Поддержка). */
function reachOf(st: BattleState, bu: BattleUnit): ReachMap {
  const reach = reachableTiles(st, bu)
  const here = reach.get(posKey(bu.pos))
  if (!here || !here.canStop) reach.set(posKey(bu.pos), { pos: { ...bu.pos }, cost: 0, canStop: true })
  return reach
}

/** Лучшая клетка для действия по цели: предпочтительная → укрытие → заросли → меньше угроз → ближе. */
function bestTileForTarget(
  st: BattleState,
  bu: BattleUnit,
  reach: ReachMap,
  targetPos: Pos,
  range: number,
  preferred?: Pos
): Pos | null {
  const threats = threatCounts(st, "enemy")
  let best: { pos: Pos, score: number } | null = null
  for (const node of reach.values()) {
    if (!node.canStop || manhattan(node.pos, targetPos) !== range) continue
    let score = 0
    if (preferred && samePos(node.pos, preferred)) score += 100
    if (terrainAt(st, node.pos) === "cover") score += 10
    else if (terrainAt(st, node.pos) === "forest") score += 4
    score -= (threats.get(posKey(node.pos)) ?? 0) * 3
    score -= manhattan(node.pos, bu.pos) * 0.1
    if (!best || score > best.score) best = { pos: node.pos, score }
  }
  return best?.pos ?? null
}

function selectUnit(st: BattleState, bu: BattleUnit, extra: Partial<BattleUiState> = {}): void {
  const reach = reachOf(st, bu)
  const attackTiles = new Set<string>()
  for (const o of attackOptions(st, bu, reach)) {
    const t = st.units[o.targetId]
    if (t) attackTiles.add(posKey(t.pos))
  }
  for (const o of wallOptions(st, bu, reach)) attackTiles.add(posKey(o.wall))
  const assistTiles = new Set<string>()
  for (const node of reach.values()) {
    if (!node.canStop) continue
    for (const a of assistTargetsFrom(st, bu, node.pos)) assistTiles.add(posKey(a.pos))
  }
  const cur = $battleUi.get()
  $battleUi.set({
    ...BASE,
    mode: "unitSelected",
    selectedId: bu.unitId,
    origin: { ...bu.pos },
    reach,
    attackTiles,
    assistTiles,
    pressedId: cur.pressedId,
    dangerOn: cur.dangerOn,
    dangerTiles: cur.dangerTiles,
    fastForward: cur.fastForward,
    toast: cur.toast,
    toastAt: cur.toastAt,
    ...extra
  })
  haptic("select")
  sfx("select")
}

function showForecast(st: BattleState, bu: BattleUnit, from: Pos, targetId: string): void {
  const ui = $battleUi.get()
  const forecast = simulateCombat(st, bu.unitId, targetId, from)
  patch({
    ...NO_PREVIEW,
    mode: "forecast",
    movedTo: { ...from },
    path: ui.reach ? previewPath(st, bu, ui.reach, from) : [from],
    targetId,
    forecast,
    dragging: false,
    dragHover: undefined,
    dragValid: false
  })
  haptic("select")
  sfx("aim")
  if (!$save.get().settings.confirmAttack) void confirm()
}

function showAssist(st: BattleState, bu: BattleUnit, from: Pos, targetId: string): boolean {
  const plan = planAssist(st, bu.unitId, from, targetId)
  if (!plan.valid) return false
  const ui = $battleUi.get()
  patch({
    ...NO_PREVIEW,
    mode: "assistPreview",
    movedTo: { ...from },
    path: ui.reach ? previewPath(st, bu, ui.reach, from) : [from],
    targetId,
    assistPlan: plan,
    dragging: false,
    dragHover: undefined,
    dragValid: false
  })
  haptic("select")
  return true
}

function showWall(st: BattleState, bu: BattleUnit, from: Pos, wall: Pos): void {
  const ui = $battleUi.get()
  patch({
    ...NO_PREVIEW,
    mode: "wallPreview",
    movedTo: { ...from },
    path: ui.reach ? previewPath(st, bu, ui.reach, from) : [from],
    wallPos: { ...wall },
    dragging: false,
    dragHover: undefined,
    dragValid: false
  })
  haptic("select")
}

/** Прогноз удара по врагу с лучшей клетки (предпочтительно — где боец уже стоит). */
function tryAttack(st: BattleState, bu: BattleUnit, reach: ReachMap, target: BattleUnit): boolean {
  const from = bestTileForTarget(st, bu, reach, target.pos, weaponRange(st, bu), bu.pos)
  if (!from) return false
  showForecast(st, bu, from, target.unitId)
  return true
}

/** Поддержка союзника с лучшей соседней клетки. */
function tryAssist(st: BattleState, bu: BattleUnit, reach: ReachMap, target: BattleUnit): boolean {
  const from = bestTileForTarget(st, bu, reach, target.pos, 1, bu.pos)
  return !!from && showAssist(st, bu, from, target.unitId)
}

/** Удар по хлипкой стене с лучшей клетки (предпочтительно — где боец уже стоит). */
function tryWall(st: BattleState, bu: BattleUnit, reach: ReachMap, wall: Pos): boolean {
  if (!isBreakableWall(st, wall)) return false
  if (wallsFrom(st, bu, bu.pos).some(w => samePos(w, wall))) {
    showWall(st, bu, bu.pos, wall)
    return true
  }
  const tile = bestTileForTarget(st, bu, reach, wall, weaponRange(st, bu), bu.pos)
  if (!tile) return false
  showWall(st, bu, tile, wall)
  return true
}

function selected(st: BattleState): BattleUnit | undefined {
  const ui = $battleUi.get()
  return ui.selectedId ? st.units[ui.selectedId] : undefined
}

/* ---------- Тапы ---------- */

/** Тап, когда боец выбран: цель → предпросмотр действия, свободная клетка в пределах хода → встать туда. */
function tapWithSelection(st: BattleState, sel: BattleUnit, reach: ReachMap, pos: Pos): void {
  const occupant = unitAt(st, pos)
  if (occupant && occupant.unitId === sel.unitId) {
    // Повторный тап по бойцу на сундуке или выходе — снова спросить (если в первый раз ответили «нет»)
    if (offerPrompt(st, [sel.unitId])) return
    return clearSelection()
  }
  if (occupant && occupant.side !== sel.side) {
    if (tryAttack(st, sel, reach, occupant)) return
    clearSelection({ mode: "enemyInfo", infoId: occupant.unitId, infoThreat: threatTiles(st, occupant) })
    haptic("select")
    return
  }
  if (occupant) {
    // Не ходивший союзник — выбрать его, чтобы переставить: иначе Поддержка, годная для любого союзника
    // (Rally, Swap…), перехватывала бы тап, а повторный тап её применял. Такую Поддержку дают перетаскиванием
    // бойца на союзника; лечение — и тапом, раненых лечат именно так.
    const assist = st.roster[sel.unitId] ? unitKit(st.roster[sel.unitId] as UnitInstance).assist : undefined
    const healing = assist?.kind === "heal" || assist?.kind === "sacrifice"
    if (!occupant.acted && !healing) return selectUnit(st, occupant)
    if (tryAssist(st, sel, reach, occupant)) return
    if (!occupant.acted) return selectUnit(st, occupant)
    return clearSelection()
  }
  if (tryWall(st, sel, reach, pos)) return
  const node = reach.get(posKey(pos))
  if (node && node.canStop) {
    void moveTo(sel.unitId, pos, true)
    return
  }
  showTileInfo(pos)
}

/** Справка о клетке: местность, бонусы стоящему, проходимость. */
function showTileInfo(pos: Pos): void {
  clearSelection({ mode: "tileInfo", infoPos: { ...pos } })
  haptic("select")
}

export function tapTile(pos: Pos): void {
  const st = state()
  const ui = $battleUi.get()
  if (!st || !canAct(st, ui) || ui.dragging) return
  const occupant = unitAt(st, pos)

  switch (ui.mode) {
    case "idle":
    case "enemyInfo":
    case "tileInfo": {
      if (!occupant) {
        if (ui.mode === "tileInfo" && ui.infoPos && samePos(ui.infoPos, pos)) return clearSelection()
        return showTileInfo(pos)
      }
      if (occupant.side === "player" && !occupant.acted) return selectUnit(st, occupant)
      // Уже действовавший боец на сундуке или выходе: открыть сундук или уйти можно и без хода
      if (occupant.side === "player" && offerPrompt(st, [occupant.unitId])) return
      if (ui.mode === "enemyInfo" && ui.infoId === occupant.unitId) return clearSelection()
      const threat = occupant.side === "enemy" ? threatTiles(st, occupant) : new Set<string>()
      clearSelection({ mode: "enemyInfo", infoId: occupant.unitId, infoThreat: threat })
      haptic("select")
      return
    }
    case "unitSelected": {
      const sel = selected(st)
      if (!sel || !ui.reach) return clearSelection()
      return tapWithSelection(st, sel, ui.reach, pos)
    }
    case "forecast":
    case "assistPreview":
    case "wallPreview": {
      const sel = selected(st)
      if (!sel || !ui.reach) return clearSelection()
      // Повторный тап по цели подтверждает действие
      if ((ui.mode === "forecast" || ui.mode === "assistPreview") && occupant && occupant.unitId === ui.targetId)
        return void confirm()
      if (ui.mode === "wallPreview" && ui.wallPos && samePos(ui.wallPos, pos)) return void confirm()
      patch({ ...NO_PREVIEW, mode: "unitSelected" })
      return tapWithSelection(st, sel, ui.reach, pos)
    }
    default:
      return
  }
}

/* ---------- Перетаскивание ---------- */

/** Палец лёг на своего бойца (до порога перетаскивания) или отпущен (null). */
export function setPressed(unitId: string | null): void {
  const cur = $battleUi.get()
  if ((cur.pressedId ?? null) === unitId) return
  patch({ pressedId: unitId ?? undefined })
}

/** Палец лёг на юнита и начал движение. */
export function beginDrag(unitId: string): boolean {
  const st = state()
  const ui = $battleUi.get()
  if (!st || !canAct(st, ui)) return false
  const bu = st.units[unitId]
  if (!bu || !bu.alive || bu.side !== "player" || bu.acted) return false
  if (ui.selectedId !== unitId || !ui.reach) selectUnit(st, bu)
  patch({ ...NO_PREVIEW, mode: "unitSelected", dragging: true, dragHover: { ...bu.pos }, dragValid: true })
  haptic("light")
  return true
}

/** Палец над клеткой `pos` (или вне поля — null). Обновляет стрелку и валидность. */
export function dragHover(pos: Pos | null): void {
  const st = state()
  const ui = $battleUi.get()
  if (!st || !ui.dragging) return
  const sel = selected(st)
  const reach = ui.reach
  if (!sel || !reach) return
  if (pos && ui.dragHover && samePos(pos, ui.dragHover) && ui.path) return
  if (!pos) return patch({ ...NO_PREVIEW, dragHover: undefined, dragValid: false })
  const occupant = unitAt(st, pos)
  const aim = (from: Pos | null, targetId?: string, wallPos?: Pos): void =>
    from
      ? patch({ ...NO_PREVIEW, dragHover: pos, dragValid: true, movedTo: from, path: previewPath(st, sel, reach, from), targetId, wallPos })
      : patch({ ...NO_PREVIEW, dragHover: pos, dragValid: false })
  if (occupant && occupant.side !== sel.side && ui.attackTiles?.has(posKey(pos)))
    return aim(bestTileForTarget(st, sel, reach, pos, weaponRange(st, sel), sel.pos), occupant.unitId)
  if (occupant && occupant.side === sel.side && occupant.unitId !== sel.unitId && ui.assistTiles?.has(posKey(pos))) {
    const from = bestTileForTarget(st, sel, reach, pos, 1, sel.pos)
    return aim(from && planAssist(st, sel.unitId, from, occupant.unitId).valid ? from : null, occupant.unitId)
  }
  if (!occupant && isBreakableWall(st, pos) && ui.attackTiles?.has(posKey(pos)))
    return aim(bestTileForTarget(st, sel, reach, pos, weaponRange(st, sel), sel.pos), undefined, pos)
  const node = reach.get(posKey(pos))
  aim(node && node.canStop && (!occupant || occupant.unitId === sel.unitId) ? pos : null)
}

/** Палец отпущен над `pos` (null — вне поля). Возвращает true, если юнит встал на новую клетку или целится. */
export function endDrag(pos: Pos | null): boolean {
  const st = state()
  const ui = $battleUi.get()
  if (!st || !ui.dragging) return false
  const sel = selected(st)
  if (!sel || !ui.reach) {
    clearSelection()
    return false
  }
  if (pos) dragHover(pos)
  const cur = $battleUi.get()
  if (!cur.dragValid || !cur.movedTo) {
    selectUnit(st, sel)
    return false
  }
  if (cur.targetId) {
    const target = st.units[cur.targetId]
    if (target && target.side !== sel.side) {
      showForecast(st, sel, cur.movedTo, cur.targetId)
      return true
    }
    if (target && showAssist(st, sel, cur.movedTo, cur.targetId)) return true
  }
  if (cur.wallPos) {
    showWall(st, sel, cur.movedTo, cur.wallPos)
    return true
  }
  if (samePos(cur.movedTo, sel.pos)) {
    selectUnit(st, sel)
    return false
  }
  // Боец уже в руке над клеткой: ставим без пробежки, приземление играет сцена
  void moveTo(sel.unitId, cur.movedTo, false)
  return true
}

export function cancelDrag(): void {
  const st = state()
  const ui = $battleUi.get()
  if (!st || !ui.dragging) return
  const sel = selected(st)
  if (sel) selectUnit(st, sel)
  else clearSelection()
}

/* ---------- Действия ---------- */

/**
 * Передвинуть бойца, не завершая ход: он остаётся выбранным и готовым действовать.
 * `animate` — пробежка по клеткам (после тапа); после перетаскивания вид уже над клеткой.
 */
async function moveTo(unitId: string, to: Pos, animate: boolean): Promise<void> {
  const before = state()
  if (!before) return
  let result: { state: BattleState, events: BattleEvent[] }
  try {
    result = dispatchBattle({ type: "move", unitId, to })
  }
  catch (e) {
    toast((e as Error).message)
    return
  }
  haptic("light")
  // Без анимации шага (боец уже на клетке под пальцем) всё равно показать, что дала клетка: ключ
  const extra = animate ? [] : result.events.filter(e => e.type === "keyTaken")
  if (animate || extra.length > 0) {
    patch({ ...NO_PREVIEW, mode: "busy", busy: true })
    if (!(await playEvents(animate ? result.events : extra, before, result.state))) return
    patch({ busy: false })
  }
  const bu = result.state.units[unitId]
  if (bu && !result.state.result) selectUnit(result.state, bu)
  refreshDanger()
  // Встал на сундук с ключом или на выход — спросить; боец остаётся выбранным, «нет» оставляет его как есть
  if (bu && !result.state.result) offerPrompt(result.state, [unitId])
}

/**
 * Ответ на вопрос о сундуке или выходе. «Да» — открыть сундук (ход не тратится) или увести отряд (победа);
 * «нет» — просто закрыть вопрос. Затем бой продолжается: выбранный боец, если ещё не ходил, остаётся выбранным.
 */
export async function answerPrompt(yes: boolean): Promise<void> {
  const ui = $battleUi.get()
  const p = ui.prompt
  const before = state()
  if (!p || ui.busy || !before) return
  patch({ prompt: undefined })
  let after = before
  if (yes) {
    let r: Reduced
    try {
      r = dispatchBattle(p.kind === "chest" ? { type: "openChest", unitId: p.unitId } : { type: "extract", unitId: p.unitId })
    }
    catch (e) {
      toast((e as Error).message)
      return
    }
    haptic("medium")
    patch({ ...NO_PREVIEW, mode: "busy", busy: true })
    if (!(await playEvents(r.events, before, r.state))) return
    patch({ busy: false })
    after = r.state
  }
  const sel = ui.selectedId ? after.units[ui.selectedId] : undefined
  if (!after.result && after.phase === "player" && sel && sel.alive && !sel.acted && sel.side === "player") {
    // Боец ещё не ходил: оставить его выбранным (после анимации сундука — выбрать заново)
    if (yes) selectUnit(after, sel)
    return
  }
  afterAction(after)
}

export function cancel(): void {
  const st = state()
  const ui = $battleUi.get()
  if (!st || ui.busy) return
  const sel = selected(st)
  if (!sel) return clearSelection()
  switch (ui.mode) {
    case "forecast":
    case "assistPreview":
    case "wallPreview":
      return selectUnit(st, sel)
    default:
      return clearSelection()
  }
}

export async function confirm(): Promise<void> {
  const ui = $battleUi.get()
  if (!ui.selectedId || !ui.movedTo || ui.busy) return
  if (ui.mode === "forecast" && ui.targetId)
    await commit({ type: "attack", unitId: ui.selectedId, to: ui.movedTo, targetId: ui.targetId })
  else if (ui.mode === "assistPreview" && ui.targetId)
    await commit({ type: "assist", unitId: ui.selectedId, to: ui.movedTo, targetId: ui.targetId })
  else if (ui.mode === "wallPreview" && ui.wallPos)
    await commit({ type: "attackWall", unitId: ui.selectedId, to: ui.movedTo, wall: ui.wallPos })
}

/**
 * Проиграть события. Возвращает false, если за время проигрывания экран боя закрыли (сменился сеанс):
 * тогда вызывающий выходит, ничего не трогая. Ожидание отпускается и без ответа презентера —
 * если Phaser-игру уничтожили посреди анимации.
 */
async function playEvents(events: BattleEvent[], before: BattleState, after: BattleState): Promise<boolean> {
  const id = session
  const p = presenter
  if (p) {
    await new Promise<void>((resolve) => {
      let done = false
      const release = (): void => {
        if (done) return
        done = true
        pendingPlays.delete(release)
        resolve()
      }
      pendingPlays.add(release)
      new Promise<void>(r => r(p.play(events, before, after)))
        .catch((e: unknown) => console.error("presenter error", e))
        .finally(release)
    })
  }
  return id === session
}

async function commit(action: BattleAction): Promise<void> {
  const before = state()
  if (!before) return
  let result: { state: BattleState, events: BattleEvent[] }
  try {
    result = dispatchBattle(action)
  }
  catch (e) {
    toast((e as Error).message)
    return
  }
  clearSelection({ mode: "busy", busy: true })
  if (!(await playEvents(result.events, before, result.state))) return
  // Кто встал на новую клетку (сам боец и сдвинутые Поддержкой союзники) — может оказаться на сундуке или выходе
  const actor = "unitId" in action ? action.unitId : undefined
  const moved = Object.values(result.state.units)
    .filter(u => u.side === "player" && u.unitId !== actor && !samePos(u.pos, before.units[u.unitId]?.pos ?? u.pos))
    .map(u => u.unitId)
  afterAction(result.state, actor ? [actor, ...moved] : moved)
}

/** После действия: итог боя, иначе вопрос о сундуке или выходе для `stepped`, иначе автозавершение хода. */
function afterAction(st: BattleState, stepped: string[] = []): void {
  if (st.result) {
    clearSelection({ mode: "ended", busy: false })
    onEnded?.(st)
    return
  }
  clearSelection({ mode: "idle", busy: false })
  refreshDanger()
  // Пока открыт вопрос, ход сам не завершается — его завершит ответ (`answerPrompt`)
  if (offerPrompt(st, stepped)) return
  if (st.phase === "player" && allPlayerUnitsActed(st) && $save.get().settings.autoEndTurn) void endTurn()
}

export async function endTurn(): Promise<void> {
  const before = state()
  const ui = $battleUi.get()
  if (!before || ui.busy || ui.prompt || before.result || before.phase !== "player") return
  let r: { state: BattleState, events: BattleEvent[] }
  try {
    r = dispatchBattle({ type: "endPhase" })
  }
  catch (e) {
    toast((e as Error).message)
    return
  }
  clearSelection({ mode: "busy", busy: true })
  if (!(await playEvents(r.events, before, r.state))) return
  if (r.state.result || r.state.phase !== "enemy") return afterAction(r.state)
  await runEnemyPhase()
}

type Reduced = { state: BattleState, events: BattleEvent[] }

/** Действие, которое не бросает: ошибка — в консоль, результат null. */
function tryDispatch(action: BattleAction, what: string): Reduced | null {
  try {
    return dispatchBattle(action)
  }
  catch (e) {
    console.error(what, action, e)
    return null
  }
}

/**
 * Один шаг ИИ с запасными вариантами: действие ИИ → «ждать» на месте тем же врагом → конец фазы.
 * `force` — сразу конец фазы (сработал предохранитель от зацикливания). null — не сработало ничего.
 */
function enemyStep(before: BattleState, force: boolean): Reduced | null {
  if (!force) {
    let action: BattleAction | null = null
    try {
      action = nextEnemyAction(before)
    }
    catch (e) {
      console.error("enemy AI failed", e)
    }
    if (action) {
      const r = tryDispatch(action, "enemy action failed")
      if (r) return r
      const uid = "unitId" in action ? action.unitId : undefined
      const bu = uid ? before.units[uid] : undefined
      if (bu && bu.alive && !bu.acted && bu.side === "enemy") {
        const w = tryDispatch({ type: "wait", unitId: bu.unitId, to: bu.pos }, "enemy wait fallback failed")
        if (w) return w
      }
    }
  }
  return tryDispatch({ type: "endPhase" }, "enemy endPhase fallback failed")
}

async function runEnemyPhase(): Promise<void> {
  const id = session
  clearSelection({ mode: "busy", busy: true })
  let guard = 0
  for (;;) {
    if (id !== session) return
    const before = state()
    if (!before || before.result || before.phase !== "enemy") break
    // Предохранитель от зацикливания: по нескольку действий на каждого врага (в чаще их десятки).
    // Сработал — фаза врага завершается принудительно, иначе ни ход врага, ни ход игрока не продолжить.
    const force = guard++ > 100 + Object.keys(before.units).length * 3
    if (force) console.error("enemy phase guard tripped: forcing endPhase")
    const r = enemyStep(before, force)
    if (!r) {
      // Не удалось даже завершить фазу — состояние боя испорчено; не падаем, а сообщаем
      toast(tr("The enemy turn got stuck", "Ход врага застрял"))
      break
    }
    if (!(await playEvents(r.events, before, r.state))) return
    if (r.state.result || r.state.phase === "player") {
      afterAction(r.state)
      return
    }
  }
  if (id !== session) return
  const st = state()
  if (st) afterAction(st)
}

export async function retreat(): Promise<void> {
  const before = state()
  // Во время хода врага и анимаций отступать нельзя: действие ляжет посреди проигрывания
  if (!before || before.result || $battleUi.get().busy) return
  let r: Reduced
  try {
    r = dispatchBattle({ type: "retreat" })
  }
  catch (e) {
    toast((e as Error).message)
    return
  }
  clearSelection({ mode: "busy", busy: true })
  if (!(await playEvents(r.events, before, r.state))) return
  afterAction(r.state)
}

export function selectedUnit(): BattleUnit | undefined {
  const st = state()
  return st ? selected(st) : undefined
}

/** Вид выбранного юнита должен стоять на movedTo (предпросмотр), а не на клетке, где он стоит. */
export function isDisplaced(ui: BattleUiState): boolean {
  return !!ui.movedTo && !!ui.origin && !samePos(ui.movedTo, ui.origin) && !ui.dragging
}
