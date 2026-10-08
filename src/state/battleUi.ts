import { atom } from 'nanostores';
import type { BattleAction, BattleEvent, BattleState, BattleUnit, Pos } from '@core/types';
import { manhattan, posKey, samePos } from '@core/types';
import { attackOptions, dangerZone, reachableTiles, targetsFrom, threatCounts, threatTiles, wallsFrom, weaponRange, type ReachMap } from '@core/map/pathing';
import { assistTargetsFrom, planAssist, type AssistPlan } from '@core/battle/assist';
import { simulateCombat, type CombatOutcome } from '@core/combat';
import { allPlayerUnitsActed } from '@core/battle/reducer';
import { nextEnemyAction } from '@core/ai';
import { terrainAt, unitAt } from '@core/battle/query';
import { $save, dispatchBattle } from './save';
import { haptic } from '@platform/haptics';

/**
 * Режимы ввода (SPEC 10.2 + контекстное меню и перетаскивание):
 * idle → unitSelected (юнит выбран, видны зоны, меню действий для исходной клетки)
 *   → moveTargeting (выбрана опция «Передвинуться»: ждём клетку)
 *   → attackTargeting / assistTargeting (ждём цель)
 *   → movedPreview (юнит стоит на клетке назначения, меню действий для неё)
 *   → forecast / assistPreview / wallPreview → подтверждение.
 * Перетаскивание: beginDrag → dragHover* → endDrag даёт тот же movedPreview/forecast.
 */
export type UiMode =
  | 'idle'
  | 'unitSelected'
  | 'moveTargeting'
  | 'attackTargeting'
  | 'assistTargeting'
  | 'movedPreview'
  | 'forecast'
  | 'assistPreview'
  | 'wallPreview'
  | 'enemyInfo'
  | 'busy'
  | 'ended';

/** Какие кнопки показывать в контекстном меню. */
export interface ContextActions {
  move: boolean;
  attack: boolean;
  assist: boolean;
  wait: boolean;
  /** Предметов в игре пока нет — кнопка всегда неактивна. */
  items: false;
}

const NO_ACTIONS: ContextActions = { move: false, attack: false, assist: false, wait: false, items: false };

export interface BattleUiState {
  mode: UiMode;
  selectedId?: string;
  /** Исходная клетка выбранного юнита. */
  origin?: Pos;
  /** Клетка, куда юнит переместится перед действием (для предпросмотра вид стоит там). */
  movedTo?: Pos;
  path?: Pos[];
  reach?: ReachMap;
  /** Клетки врагов, которых можно атаковать (с учётом движения или только с movedTo в режиме цели). */
  attackTiles?: Set<string>;
  assistTiles?: Set<string>;
  targetId?: string;
  forecast?: CombatOutcome;
  assistPlan?: AssistPlan;
  wallPos?: Pos;
  infoId?: string;
  infoThreat?: Set<string>;
  actions: ContextActions;
  /** Юнита держат за шкирку. */
  dragging: boolean;
  dragHover?: Pos;
  dragValid: boolean;
  dangerOn: boolean;
  dangerTiles: Set<string>;
  busy: boolean;
  fastForward: boolean;
  toast?: string;
  toastAt?: number;
}

const BASE: BattleUiState = {
  mode: 'idle',
  actions: NO_ACTIONS,
  dragging: false,
  dragValid: false,
  dangerOn: false,
  dangerTiles: new Set(),
  busy: false,
  fastForward: false,
};

export const $battleUi = atom<BattleUiState>({ ...BASE });

export interface Presenter {
  play(events: BattleEvent[], before: BattleState, after: BattleState): Promise<void>;
}

let presenter: Presenter | null = null;
export function setPresenter(p: Presenter | null): void {
  presenter = p;
}

let onEnded: ((state: BattleState) => void) | null = null;
export function setOnBattleEnded(cb: ((state: BattleState) => void) | null): void {
  onEnded = cb;
}

function state(): BattleState | undefined {
  return $save.get().battle;
}

function patch(p: Partial<BattleUiState>): void {
  $battleUi.set({ ...$battleUi.get(), ...p });
}

export function toast(msg: string): void {
  patch({ toast: msg, toastAt: Date.now() });
}

function clearSelection(extra: Partial<BattleUiState> = {}): void {
  const cur = $battleUi.get();
  $battleUi.set({
    ...BASE,
    mode: cur.mode === 'ended' ? 'ended' : 'idle',
    dangerOn: cur.dangerOn,
    dangerTiles: cur.dangerTiles,
    busy: cur.busy,
    fastForward: cur.fastForward,
    toast: cur.toast,
    toastAt: cur.toastAt,
    ...extra,
  });
}

export function refreshDanger(): void {
  const st = state();
  const ui = $battleUi.get();
  if (!st || !ui.dangerOn) return patch({ dangerTiles: new Set() });
  patch({ dangerTiles: dangerZone(st, 'enemy') });
}

export function toggleDanger(): void {
  patch({ dangerOn: !$battleUi.get().dangerOn });
  refreshDanger();
}

export function setFastForward(on: boolean): void {
  patch({ fastForward: on });
}

export function enterBattleScreen(): void {
  const st = state();
  const settings = $save.get().settings;
  $battleUi.set({ ...BASE, mode: st?.result ? 'ended' : 'idle', dangerOn: settings.dangerZoneDefault });
  refreshDanger();
  if (st && !st.result && st.phase === 'enemy') void runEnemyPhase();
}

/* ---------- Вычисления ---------- */

function canAct(st: BattleState, ui: BattleUiState): boolean {
  return !ui.busy && !st.result && st.phase === 'player';
}

function pathFor(reach: ReachMap, to: Pos): Pos[] {
  const path: Pos[] = [];
  let key: string | undefined = posKey(to);
  while (key) {
    const n = reach.get(key);
    if (!n) break;
    path.unshift(n.pos);
    key = n.prev;
  }
  return path;
}

/** Лучшая клетка для действия по цели: предпочтительная → укрытие → меньше угроз → ближе. */
function bestTileForTarget(st: BattleState, bu: BattleUnit, reach: ReachMap, targetPos: Pos, range: number, preferred?: Pos): Pos | null {
  const threats = threatCounts(st, 'enemy');
  let best: { pos: Pos; score: number } | null = null;
  for (const node of reach.values()) {
    if (!node.canStop || manhattan(node.pos, targetPos) !== range) continue;
    let score = 0;
    if (preferred && samePos(node.pos, preferred)) score += 100;
    if (terrainAt(st, node.pos) === 'cover') score += 10;
    score -= (threats.get(posKey(node.pos)) ?? 0) * 3;
    score -= manhattan(node.pos, bu.pos) * 0.1;
    if (!best || score > best.score) best = { pos: node.pos, score };
  }
  return best?.pos ?? null;
}

/** Контекстные действия для юнита, стоящего на `at` (исходная клетка или movedTo). */
function actionsAt(st: BattleState, bu: BattleUnit, reach: ReachMap, at: Pos, atOrigin: boolean): ContextActions {
  const attack = atOrigin ? attackOptions(st, bu, reach).length > 0 : targetsFrom(st, bu, at).length > 0 || wallsFrom(st, bu, at).length > 0;
  let assist = false;
  if (atOrigin) {
    for (const node of reach.values()) {
      if (!node.canStop) continue;
      if (assistTargetsFrom(st, bu, node.pos).length > 0) {
        assist = true;
        break;
      }
    }
  } else assist = assistTargetsFrom(st, bu, at).length > 0;
  const move = [...reach.values()].some((n) => n.canStop && !samePos(n.pos, bu.pos));
  return { move, attack, assist, wait: true, items: false };
}

function selectUnit(st: BattleState, bu: BattleUnit, extra: Partial<BattleUiState> = {}): void {
  const reach = reachableTiles(st, bu);
  const attackTiles = new Set<string>();
  for (const o of attackOptions(st, bu, reach)) {
    const t = st.units[o.targetId];
    if (t) attackTiles.add(posKey(t.pos));
  }
  const assistTiles = new Set<string>();
  for (const node of reach.values()) {
    if (!node.canStop) continue;
    for (const a of assistTargetsFrom(st, bu, node.pos)) assistTiles.add(posKey(a.pos));
  }
  const cur = $battleUi.get();
  $battleUi.set({
    ...BASE,
    mode: 'unitSelected',
    selectedId: bu.unitId,
    origin: { ...bu.pos },
    reach,
    attackTiles,
    assistTiles,
    actions: actionsAt(st, bu, reach, bu.pos, true),
    dangerOn: cur.dangerOn,
    dangerTiles: cur.dangerTiles,
    fastForward: cur.fastForward,
    toast: cur.toast,
    toastAt: cur.toastAt,
    ...extra,
  });
  haptic('select');
}

/** Поставить юнита (предпросмотр) на клетку и показать меню действий для неё. */
function previewAt(st: BattleState, bu: BattleUnit, to: Pos): void {
  const ui = $battleUi.get();
  if (!ui.reach) return;
  const attackTiles = new Set<string>();
  for (const t of targetsFrom(st, bu, to)) attackTiles.add(posKey(t.pos));
  const assistTiles = new Set<string>();
  for (const a of assistTargetsFrom(st, bu, to)) assistTiles.add(posKey(a.pos));
  patch({
    mode: 'movedPreview',
    movedTo: { ...to },
    path: pathFor(ui.reach, to),
    attackTiles,
    assistTiles,
    actions: actionsAt(st, bu, ui.reach, to, false),
    targetId: undefined,
    forecast: undefined,
    assistPlan: undefined,
    wallPos: undefined,
    dragging: false,
    dragHover: undefined,
    dragValid: false,
  });
  haptic('select');
}

function showForecast(st: BattleState, bu: BattleUnit, from: Pos, targetId: string): void {
  const ui = $battleUi.get();
  const forecast = simulateCombat(st, bu.unitId, targetId, from);
  patch({
    mode: 'forecast',
    movedTo: { ...from },
    path: ui.reach ? pathFor(ui.reach, from) : [from],
    targetId,
    forecast,
    assistPlan: undefined,
    wallPos: undefined,
    dragging: false,
    dragHover: undefined,
    dragValid: false,
  });
  haptic('select');
  if (!$save.get().settings.confirmAttack) void confirm();
}

function showAssist(st: BattleState, bu: BattleUnit, from: Pos, targetId: string): boolean {
  const plan = planAssist(st, bu.unitId, from, targetId);
  if (!plan.valid) return false;
  const ui = $battleUi.get();
  patch({
    mode: 'assistPreview',
    movedTo: { ...from },
    path: ui.reach ? pathFor(ui.reach, from) : [from],
    targetId,
    assistPlan: plan,
    forecast: undefined,
    wallPos: undefined,
    dragging: false,
    dragHover: undefined,
    dragValid: false,
  });
  haptic('select');
  return true;
}

function selected(st: BattleState): BattleUnit | undefined {
  const ui = $battleUi.get();
  return ui.selectedId ? st.units[ui.selectedId] : undefined;
}

/** Куда вернуться из режима выбора цели/клетки: к movedTo или к исходной клетке. */
function backFromTargeting(st: BattleState, sel: BattleUnit): void {
  const ui = $battleUi.get();
  if (ui.movedTo && ui.origin && !samePos(ui.movedTo, ui.origin)) previewAt(st, sel, ui.movedTo);
  else selectUnit(st, sel);
}

/* ---------- Контекстное меню ---------- */

export function chooseMove(): void {
  const st = state();
  const ui = $battleUi.get();
  if (!st || !canAct(st, ui)) return;
  const sel = selected(st);
  if (!sel || !ui.reach) return;
  patch({ mode: 'moveTargeting', targetId: undefined, forecast: undefined, assistPlan: undefined, wallPos: undefined });
  haptic('select');
}

export function chooseAttack(): void {
  const st = state();
  const ui = $battleUi.get();
  if (!st || !canAct(st, ui)) return;
  const sel = selected(st);
  if (!sel || !ui.reach || !ui.actions.attack) return;
  const atOrigin = !ui.movedTo || (ui.origin && samePos(ui.movedTo, ui.origin));
  const attackTiles = new Set<string>();
  if (atOrigin) {
    for (const o of attackOptions(st, sel, ui.reach)) {
      const t = st.units[o.targetId];
      if (t) attackTiles.add(posKey(t.pos));
    }
  } else if (ui.movedTo) {
    for (const t of targetsFrom(st, sel, ui.movedTo)) attackTiles.add(posKey(t.pos));
    for (const w of wallsFrom(st, sel, ui.movedTo)) attackTiles.add(posKey(w));
  }
  // Единственная цель — сразу прогноз
  if (attackTiles.size === 1) {
    const [k] = [...attackTiles];
    const [x, y] = (k as string).split(',').map(Number);
    tapTile({ x: x as number, y: y as number });
    return;
  }
  patch({ mode: 'attackTargeting', attackTiles, targetId: undefined, forecast: undefined, assistPlan: undefined, wallPos: undefined });
  haptic('select');
}

export function chooseAssist(): void {
  const st = state();
  const ui = $battleUi.get();
  if (!st || !canAct(st, ui)) return;
  const sel = selected(st);
  if (!sel || !ui.reach || !ui.actions.assist) return;
  const atOrigin = !ui.movedTo || (ui.origin && samePos(ui.movedTo, ui.origin));
  const assistTiles = new Set<string>();
  if (atOrigin) {
    for (const node of ui.reach.values()) if (node.canStop) for (const a of assistTargetsFrom(st, sel, node.pos)) assistTiles.add(posKey(a.pos));
  } else if (ui.movedTo) for (const a of assistTargetsFrom(st, sel, ui.movedTo)) assistTiles.add(posKey(a.pos));
  if (assistTiles.size === 1) {
    const [k] = [...assistTiles];
    const [x, y] = (k as string).split(',').map(Number);
    tapTile({ x: x as number, y: y as number });
    return;
  }
  patch({ mode: 'assistTargeting', assistTiles, targetId: undefined, forecast: undefined, assistPlan: undefined, wallPos: undefined });
  haptic('select');
}

/* ---------- Тапы ---------- */

export function tapTile(pos: Pos): void {
  const st = state();
  const ui = $battleUi.get();
  if (!st || !canAct(st, ui) || ui.dragging) return;
  const occupant = unitAt(st, pos);

  switch (ui.mode) {
    case 'idle':
    case 'enemyInfo': {
      if (!occupant) return clearSelection();
      if (occupant.side === 'player' && !occupant.acted) return selectUnit(st, occupant);
      if (ui.mode === 'enemyInfo' && ui.infoId === occupant.unitId) return clearSelection();
      const threat = occupant.side === 'enemy' ? threatTiles(st, occupant) : new Set<string>();
      clearSelection({ mode: 'enemyInfo', infoId: occupant.unitId, infoThreat: threat });
      haptic('select');
      return;
    }
    case 'unitSelected':
    case 'moveTargeting': {
      const sel = selected(st);
      if (!sel || !ui.reach) return clearSelection();
      if (occupant && occupant.unitId === sel.unitId) {
        // Повторный тап по себе: меню действий на месте
        previewAt(st, sel, sel.pos);
        return;
      }
      if (occupant && occupant.side !== sel.side) {
        const range = weaponRange(st, sel);
        const from = bestTileForTarget(st, sel, ui.reach, occupant.pos, range);
        if (from) return showForecast(st, sel, from, occupant.unitId);
        clearSelection({ mode: 'enemyInfo', infoId: occupant.unitId, infoThreat: threatTiles(st, occupant) });
        return;
      }
      if (occupant && occupant.side === sel.side) {
        const from = bestTileForTarget(st, sel, ui.reach, occupant.pos, 1, sel.pos);
        if (from && showAssist(st, sel, from, occupant.unitId)) return;
        if (!occupant.acted) return selectUnit(st, occupant);
        return clearSelection();
      }
      const node = ui.reach.get(posKey(pos));
      if (node && node.canStop) return previewAt(st, sel, pos);
      if (ui.mode === 'moveTargeting') return selectUnit(st, sel);
      return clearSelection();
    }
    case 'attackTargeting': {
      const sel = selected(st);
      if (!sel || !ui.reach) return clearSelection();
      const from = ui.movedTo && ui.origin && !samePos(ui.movedTo, ui.origin) ? ui.movedTo : undefined;
      if (occupant && occupant.side !== sel.side && ui.attackTiles?.has(posKey(pos))) {
        const range = weaponRange(st, sel);
        if (from && manhattan(from, occupant.pos) === range) return showForecast(st, sel, from, occupant.unitId);
        const tile = bestTileForTarget(st, sel, ui.reach, occupant.pos, range, from);
        if (tile) return showForecast(st, sel, tile, occupant.unitId);
      }
      if (!occupant && from && ui.attackTiles?.has(posKey(pos)) && wallsFrom(st, sel, from).some((w) => samePos(w, pos))) {
        patch({ mode: 'wallPreview', wallPos: pos });
        return;
      }
      return backFromTargeting(st, sel);
    }
    case 'assistTargeting': {
      const sel = selected(st);
      if (!sel || !ui.reach) return clearSelection();
      const from = ui.movedTo && ui.origin && !samePos(ui.movedTo, ui.origin) ? ui.movedTo : undefined;
      if (occupant && occupant.side === sel.side && occupant.unitId !== sel.unitId && ui.assistTiles?.has(posKey(pos))) {
        if (from && manhattan(from, occupant.pos) === 1 && showAssist(st, sel, from, occupant.unitId)) return;
        const tile = bestTileForTarget(st, sel, ui.reach, occupant.pos, 1, from ?? sel.pos);
        if (tile && showAssist(st, sel, tile, occupant.unitId)) return;
      }
      return backFromTargeting(st, sel);
    }
    case 'movedPreview':
    case 'forecast':
    case 'assistPreview':
    case 'wallPreview': {
      const sel = selected(st);
      if (!sel || !ui.reach || !ui.movedTo) return clearSelection();
      if (ui.mode === 'forecast' && occupant && occupant.unitId === ui.targetId) return void confirm();
      if (ui.mode === 'assistPreview' && occupant && occupant.unitId === ui.targetId) return void confirm();
      if (ui.mode === 'wallPreview' && ui.wallPos && samePos(ui.wallPos, pos)) return void confirm();
      if (occupant && occupant.side !== sel.side) {
        const range = weaponRange(st, sel);
        if (manhattan(ui.movedTo, occupant.pos) === range) return showForecast(st, sel, ui.movedTo, occupant.unitId);
        const from = bestTileForTarget(st, sel, ui.reach, occupant.pos, range, ui.movedTo);
        if (from) return showForecast(st, sel, from, occupant.unitId);
        return;
      }
      if (occupant && occupant.side === sel.side && occupant.unitId !== sel.unitId) {
        if (manhattan(ui.movedTo, occupant.pos) === 1 && showAssist(st, sel, ui.movedTo, occupant.unitId)) return;
        const from = bestTileForTarget(st, sel, ui.reach, occupant.pos, 1, ui.movedTo);
        if (from && showAssist(st, sel, from, occupant.unitId)) return;
        return;
      }
      if (wallsFrom(st, sel, ui.movedTo).some((w) => samePos(w, pos))) {
        patch({ mode: 'wallPreview', wallPos: pos, targetId: undefined, forecast: undefined, assistPlan: undefined });
        return;
      }
      // Тап по исходной клетке — вернуть юнита
      if (ui.origin && samePos(pos, ui.origin)) return selectUnit(st, sel);
      const node = ui.reach.get(posKey(pos));
      if (node && node.canStop) return previewAt(st, sel, pos);
      selectUnit(st, sel);
      return;
    }
    default:
      return;
  }
}

/* ---------- Перетаскивание ---------- */

/** Палец лёг на юнита и начал движение. */
export function beginDrag(unitId: string): boolean {
  const st = state();
  const ui = $battleUi.get();
  if (!st || !canAct(st, ui)) return false;
  const bu = st.units[unitId];
  if (!bu || !bu.alive || bu.side !== 'player' || bu.acted) return false;
  if (ui.selectedId !== unitId || !ui.reach) selectUnit(st, bu);
  patch({ mode: 'moveTargeting', dragging: true, dragHover: { ...bu.pos }, dragValid: true, movedTo: undefined, path: undefined, targetId: undefined, forecast: undefined, assistPlan: undefined, wallPos: undefined });
  haptic('light');
  return true;
}

/** Палец над клеткой `pos` (или вне поля — null). Обновляет стрелку и валидность. */
export function dragHover(pos: Pos | null): void {
  const st = state();
  const ui = $battleUi.get();
  if (!st || !ui.dragging) return;
  const sel = selected(st);
  if (!sel || !ui.reach) return;
  if (pos && ui.dragHover && samePos(pos, ui.dragHover) && ui.path) return;
  if (!pos) return patch({ dragHover: undefined, dragValid: false, movedTo: undefined, path: undefined, targetId: undefined });
  const occupant = unitAt(st, pos);
  const range = weaponRange(st, sel);
  if (occupant && occupant.side !== sel.side && ui.attackTiles?.has(posKey(pos))) {
    const from = bestTileForTarget(st, sel, ui.reach, pos, range);
    if (from) return patch({ dragHover: pos, dragValid: true, movedTo: from, path: pathFor(ui.reach, from), targetId: occupant.unitId });
  }
  if (occupant && occupant.side === sel.side && occupant.unitId !== sel.unitId && ui.assistTiles?.has(posKey(pos))) {
    const from = bestTileForTarget(st, sel, ui.reach, pos, 1, sel.pos);
    if (from && planAssist(st, sel.unitId, from, occupant.unitId).valid) return patch({ dragHover: pos, dragValid: true, movedTo: from, path: pathFor(ui.reach, from), targetId: occupant.unitId });
  }
  const node = ui.reach.get(posKey(pos));
  if (node && node.canStop) return patch({ dragHover: pos, dragValid: true, movedTo: pos, path: pathFor(ui.reach, pos), targetId: undefined });
  patch({ dragHover: pos, dragValid: false, movedTo: undefined, path: undefined, targetId: undefined });
}

/** Палец отпущен над `pos` (null — вне поля). Возвращает true, если юнит остался на новой клетке. */
export function endDrag(pos: Pos | null): boolean {
  const st = state();
  const ui = $battleUi.get();
  if (!st || !ui.dragging) return false;
  const sel = selected(st);
  if (!sel || !ui.reach) {
    clearSelection();
    return false;
  }
  if (pos) dragHover(pos);
  const cur = $battleUi.get();
  if (!cur.dragValid || !cur.movedTo) {
    selectUnit(st, sel);
    return false;
  }
  if (cur.targetId) {
    const target = st.units[cur.targetId];
    if (target && target.side !== sel.side) {
      showForecast(st, sel, cur.movedTo, cur.targetId);
      return true;
    }
    if (target && showAssist(st, sel, cur.movedTo, cur.targetId)) return true;
  }
  previewAt(st, sel, cur.movedTo);
  return true;
}

export function cancelDrag(): void {
  const st = state();
  const ui = $battleUi.get();
  if (!st || !ui.dragging) return;
  const sel = selected(st);
  if (sel) selectUnit(st, sel);
  else clearSelection();
}

/* ---------- Действия ---------- */

export function cancel(): void {
  const st = state();
  const ui = $battleUi.get();
  if (!st || ui.busy) return;
  const sel = selected(st);
  if (!sel) return clearSelection();
  switch (ui.mode) {
    case 'forecast':
    case 'assistPreview':
    case 'wallPreview':
    case 'attackTargeting':
    case 'assistTargeting':
      return backFromTargeting(st, sel);
    case 'movedPreview':
    case 'moveTargeting':
      return selectUnit(st, sel);
    default:
      return clearSelection();
  }
}

/** «Ждать» на movedTo (или на месте). */
export async function waitHere(): Promise<void> {
  const st = state();
  const ui = $battleUi.get();
  if (!st || !ui.selectedId || ui.busy) return;
  const sel = st.units[ui.selectedId];
  if (!sel) return;
  const to = ui.movedTo ?? sel.pos;
  await commit({ type: 'wait', unitId: ui.selectedId, to });
}

export async function confirm(): Promise<void> {
  const ui = $battleUi.get();
  if (!ui.selectedId || !ui.movedTo || ui.busy) return;
  if (ui.mode === 'forecast' && ui.targetId) await commit({ type: 'attack', unitId: ui.selectedId, to: ui.movedTo, targetId: ui.targetId });
  else if (ui.mode === 'assistPreview' && ui.targetId) await commit({ type: 'assist', unitId: ui.selectedId, to: ui.movedTo, targetId: ui.targetId });
  else if (ui.mode === 'wallPreview' && ui.wallPos) await commit({ type: 'attackWall', unitId: ui.selectedId, to: ui.movedTo, wall: ui.wallPos });
}

async function playEvents(events: BattleEvent[], before: BattleState, after: BattleState): Promise<void> {
  if (presenter) {
    try {
      await presenter.play(events, before, after);
    } catch (e) {
      console.error('presenter error', e);
    }
  }
}

async function commit(action: BattleAction): Promise<void> {
  const before = state();
  if (!before) return;
  let result: { state: BattleState; events: BattleEvent[] };
  try {
    result = dispatchBattle(action);
  } catch (e) {
    toast((e as Error).message);
    return;
  }
  clearSelection({ mode: 'busy', busy: true });
  await playEvents(result.events, before, result.state);
  afterAction(result.state);
}

function afterAction(st: BattleState): void {
  if (st.result) {
    clearSelection({ mode: 'ended', busy: false });
    onEnded?.(st);
    return;
  }
  clearSelection({ mode: 'idle', busy: false });
  refreshDanger();
  if (st.phase === 'player' && allPlayerUnitsActed(st) && $save.get().settings.autoEndTurn) void endTurn();
}

export async function endTurn(): Promise<void> {
  const before = state();
  const ui = $battleUi.get();
  if (!before || ui.busy || before.result || before.phase !== 'player') return;
  clearSelection({ mode: 'busy', busy: true });
  const r = dispatchBattle({ type: 'endPhase' });
  await playEvents(r.events, before, r.state);
  if (r.state.result) return afterAction(r.state);
  await runEnemyPhase();
}

async function runEnemyPhase(): Promise<void> {
  clearSelection({ mode: 'busy', busy: true });
  let guard = 0;
  for (;;) {
    const before = state();
    if (!before || before.result || before.phase !== 'enemy' || guard++ > 100) break;
    const action = nextEnemyAction(before);
    let r: { state: BattleState; events: BattleEvent[] };
    try {
      r = dispatchBattle(action);
    } catch (e) {
      console.error('enemy action failed', action, e);
      const uid = 'unitId' in action ? action.unitId : undefined;
      const bu = uid ? before.units[uid] : undefined;
      r = bu ? dispatchBattle({ type: 'wait', unitId: bu.unitId, to: bu.pos }) : dispatchBattle({ type: 'endPhase' });
    }
    await playEvents(r.events, before, r.state);
    if (r.state.result || r.state.phase === 'player') {
      afterAction(r.state);
      return;
    }
  }
  const st = state();
  if (st) afterAction(st);
}

export async function retreat(): Promise<void> {
  const before = state();
  if (!before || before.result) return;
  const r = dispatchBattle({ type: 'retreat' });
  clearSelection({ mode: 'busy', busy: true });
  await playEvents(r.events, before, r.state);
  afterAction(r.state);
}

export function selectedUnit(): BattleUnit | undefined {
  const st = state();
  return st ? selected(st) : undefined;
}

/** Вид выбранного юнита должен стоять на movedTo (предпросмотр), а не на исходной клетке. */
export function isDisplaced(ui: BattleUiState): boolean {
  return !!ui.movedTo && !!ui.origin && !samePos(ui.movedTo, ui.origin) && !ui.dragging;
}
