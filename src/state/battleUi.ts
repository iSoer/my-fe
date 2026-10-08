import { atom } from 'nanostores';
import type { BattleAction, BattleEvent, BattleState, BattleUnit, Pos } from '@core/types';
import { manhattan, posKey, samePos } from '@core/types';
import { attackOptions, dangerZone, reachableTiles, threatCounts, threatTiles, wallsFrom, weaponRange, type ReachMap } from '@core/map/pathing';
import { assistTargetsFrom, planAssist, type AssistPlan } from '@core/battle/assist';
import { simulateCombat, type CombatOutcome } from '@core/combat';
import { allPlayerUnitsActed } from '@core/battle/reducer';
import { nextEnemyAction } from '@core/ai';
import { terrainAt, unitAt } from '@core/battle/query';
import { $save, dispatchBattle } from './save';
import { haptic } from '@platform/haptics';

export type UiMode = 'idle' | 'unitSelected' | 'movedPreview' | 'forecast' | 'assistPreview' | 'wallPreview' | 'enemyInfo' | 'busy' | 'ended';

export interface BattleUiState {
  mode: UiMode;
  selectedId?: string;
  /** Клетка, куда юнит переместится перед действием. */
  movedTo?: Pos;
  path?: Pos[];
  reach?: ReachMap;
  /** Клетки, с которых можно атаковать (для подсветки красным при выборе). */
  attackTiles?: Set<string>;
  assistTiles?: Set<string>;
  targetId?: string;
  forecast?: CombatOutcome;
  assistPlan?: AssistPlan;
  wallPos?: Pos;
  /** Враг, чья информация показана (и его зона угрозы). */
  infoId?: string;
  infoThreat?: Set<string>;
  dangerOn: boolean;
  dangerTiles: Set<string>;
  busy: boolean;
  /** Ускорение фазы врага. */
  fastForward: boolean;
  /** Подсказка/ошибка для HUD. */
  toast?: string;
  toastAt?: number;
}

export const $battleUi = atom<BattleUiState>({ mode: 'idle', dangerOn: false, dangerTiles: new Set(), busy: false, fastForward: false });

export interface Presenter {
  /** Проиграть события боя. before/after — состояния до и после действия. */
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

/** Инициализация при входе на экран боя (в т. ч. восстановление). */
export function enterBattleScreen(): void {
  const st = state();
  const settings = $save.get().settings;
  $battleUi.set({ mode: st?.result ? 'ended' : 'idle', dangerOn: settings.dangerZoneDefault, dangerTiles: new Set(), busy: false, fastForward: false });
  refreshDanger();
  if (st && !st.result && st.phase === 'enemy') void runEnemyPhase();
}

function selectUnit(st: BattleState, bu: BattleUnit): void {
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
  patch({ mode: 'unitSelected', selectedId: bu.unitId, reach, attackTiles, assistTiles, movedTo: undefined, path: undefined, targetId: undefined, forecast: undefined, assistPlan: undefined, infoId: undefined, infoThreat: undefined });
  haptic('select');
}

/** Лучшая клетка для атаки цели: укрытие → меньше угроз → ближе к текущей позиции. */
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

function showForecast(st: BattleState, bu: BattleUnit, from: Pos, targetId: string): void {
  const ui = $battleUi.get();
  const forecast = simulateCombat(st, bu.unitId, targetId, from);
  patch({ mode: 'forecast', movedTo: from, path: ui.reach ? pathFor(ui.reach, from) : [from], targetId, forecast, assistPlan: undefined, wallPos: undefined });
  haptic('select');
  if (!$save.get().settings.confirmAttack) void confirm();
}

function showAssist(st: BattleState, bu: BattleUnit, from: Pos, targetId: string): boolean {
  const plan = planAssist(st, bu.unitId, from, targetId);
  if (!plan.valid) return false;
  const ui = $battleUi.get();
  patch({ mode: 'assistPreview', movedTo: from, path: ui.reach ? pathFor(ui.reach, from) : [from], targetId, assistPlan: plan, forecast: undefined, wallPos: undefined });
  haptic('select');
  return true;
}

export function tapTile(pos: Pos): void {
  const st = state();
  const ui = $battleUi.get();
  if (!st || ui.busy || st.result || st.phase !== 'player') return;
  const occupant = unitAt(st, pos);

  switch (ui.mode) {
    case 'idle':
    case 'enemyInfo': {
      if (!occupant) return clearSelection();
      if (occupant.side === 'player' && !occupant.acted) return selectUnit(st, occupant);
      // Информация о юните и зона угрозы врага
      const threat = occupant.side === 'enemy' ? threatTiles(st, occupant) : new Set<string>();
      if (ui.mode === 'enemyInfo' && ui.infoId === occupant.unitId) return clearSelection();
      patch({ mode: 'enemyInfo', infoId: occupant.unitId, infoThreat: threat, selectedId: undefined });
      haptic('select');
      return;
    }
    case 'unitSelected': {
      const sel = st.units[ui.selectedId ?? ''];
      if (!sel || !ui.reach) return clearSelection();
      if (occupant && occupant.unitId === sel.unitId) {
        patch({ mode: 'movedPreview', movedTo: sel.pos, path: [sel.pos] });
        return;
      }
      if (occupant && occupant.side !== sel.side) {
        const range = targetsRange(st, sel);
        const from = bestTileForTarget(st, sel, ui.reach, occupant.pos, range);
        if (from) return showForecast(st, sel, from, occupant.unitId);
        // Враг вне досягаемости — показать его инфо
        patch({ mode: 'enemyInfo', infoId: occupant.unitId, infoThreat: threatTiles(st, occupant), selectedId: undefined, reach: undefined, attackTiles: undefined, assistTiles: undefined });
        return;
      }
      if (occupant && occupant.side === sel.side) {
        const from = bestTileForTarget(st, sel, ui.reach, occupant.pos, 1, sel.pos);
        if (from && showAssist(st, sel, from, occupant.unitId)) return;
        // Другой свой юнит — переключить выбор
        if (!occupant.acted) return selectUnit(st, occupant);
        return clearSelection();
      }
      const node = ui.reach.get(posKey(pos));
      if (node && node.canStop) {
        patch({ mode: 'movedPreview', movedTo: pos, path: pathFor(ui.reach, pos) });
        haptic('select');
        return;
      }
      return clearSelection();
    }
    case 'movedPreview':
    case 'forecast':
    case 'assistPreview':
    case 'wallPreview': {
      const sel = st.units[ui.selectedId ?? ''];
      if (!sel || !ui.reach || !ui.movedTo) return clearSelection();
      // Повторный тап по той же цели — подтверждение
      if (ui.mode === 'forecast' && occupant && occupant.unitId === ui.targetId) return void confirm();
      if (ui.mode === 'assistPreview' && occupant && occupant.unitId === ui.targetId) return void confirm();
      if (ui.mode === 'wallPreview' && ui.wallPos && samePos(ui.wallPos, pos)) return void confirm();
      if (occupant && occupant.side !== sel.side) {
        const range = targetsRange(st, sel);
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
      const node = ui.reach.get(posKey(pos));
      if (node && node.canStop) {
        patch({ mode: 'movedPreview', movedTo: pos, path: pathFor(ui.reach, pos), targetId: undefined, forecast: undefined, assistPlan: undefined, wallPos: undefined });
        haptic('select');
        return;
      }
      // Тап по исходной клетке или вне зоны — назад к выбору
      selectUnit(st, sel);
      return;
    }
    default:
      return;
  }
}

function targetsRange(st: BattleState, bu: BattleUnit): number {
  return weaponRange(st, bu);
}

export function cancel(): void {
  const st = state();
  const ui = $battleUi.get();
  if (!st || ui.busy) return;
  if (ui.mode === 'movedPreview' || ui.mode === 'forecast' || ui.mode === 'assistPreview' || ui.mode === 'wallPreview') {
    const sel = st.units[ui.selectedId ?? ''];
    if (sel) return selectUnit(st, sel);
  }
  clearSelection();
}

/** «Ждать» на выбранной клетке. */
export async function waitHere(): Promise<void> {
  const ui = $battleUi.get();
  if (!ui.selectedId || !ui.movedTo || ui.busy) return;
  await commit({ type: 'wait', unitId: ui.selectedId, to: ui.movedTo });
}

/** Подтвердить атаку / Поддержку / удар по стене. */
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
  if (st.phase === 'player' && allPlayerUnitsActed(st) && $save.get().settings.autoEndTurn) {
    void endTurn();
  }
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

/** Для HUD: выбранный юнит/цель с позицией предпросмотра. */
export function selectedUnit(): BattleUnit | undefined {
  const st = state();
  const ui = $battleUi.get();
  if (!st || !ui.selectedId) return undefined;
  return st.units[ui.selectedId];
}
