import type { BattleAction, BattleState, BattleUnit, Pos } from '../types';
import { manhattan, posKey } from '../types';
import { hpPct, livingUnits, terrainAt } from '../battle/query';
import { planAssist } from '../battle/assist';
import { distanceField, reachableTiles, targetsFrom, threatCounts, threatTiles, type ReachMap } from '../map/pathing';
import { simulateCombat } from '../combat';
import { difficultyDef } from '@content/balance';
import { classDef } from '@content/classes';

/** Порядок хода врагов: ближе к игроку — раньше; затем выше Spd; затем id. */
export function enemyOrder(state: BattleState): string[] {
  const players = livingUnits(state, 'player');
  const dist = (u: BattleUnit): number => (players.length === 0 ? 0 : Math.min(...players.map((p) => manhattan(p.pos, u.pos))));
  return livingUnits(state, 'enemy')
    .filter((u) => !u.acted)
    .map((u) => ({ u, d: dist(u), spd: state.roster[u.unitId]?.baseStats.spd ?? 0 }))
    .sort((a, b) => a.d - b.d || b.spd - a.spd || (a.u.unitId < b.u.unitId ? -1 : 1))
    .map((x) => x.u.unitId);
}

/** Следующее действие фазы врага; endPhase — когда все отходили. */
export function nextEnemyAction(state: BattleState): BattleAction {
  if (state.phase !== 'enemy' || state.result) return { type: 'endPhase' };
  const order = enemyOrder(state);
  const id = order[0];
  if (!id) return { type: 'endPhase' };
  return decideAction(state, id);
}

interface AttackEval {
  action: BattleAction;
  score: number;
  taken: number;
}

function evaluateAttacks(state: BattleState, bu: BattleUnit, reach: ReachMap, threat: Map<string, number>, onlyFrom?: Pos): AttackEval | null {
  const diff = difficultyDef(state.difficulty).ai;
  let best: AttackEval | null = null;
  const tiles = onlyFrom ? [reach.get(posKey(onlyFrom))].filter(Boolean) : [...reach.values()];
  for (const node of tiles) {
    if (!node || !node.canStop) continue;
    for (const target of targetsFrom(state, bu, node.pos)) {
      const out = simulateCombat(state, bu.unitId, target.unitId, node.pos);
      const dealt = out.defender.hpBefore - out.defender.hpAfter;
      const taken = out.attacker.hpBefore - out.attacker.hpAfter;
      const tUnit = state.roster[target.unitId];
      const tKind = tUnit ? classDef(tUnit.classId).weaponKind : 'claw';
      let score = dealt;
      if (out.defender.died) score += 100;
      if (tKind === 'bandage' || tKind === 'purr') score += 15;
      if (out.attacker.specialTriggered) score += 10;
      score -= taken * diff.wTaken;
      if (out.attacker.died) score -= 200;
      if (terrainAt(state, node.pos) === 'cover') score += 8;
      score -= (threat.get(posKey(node.pos)) ?? 0) * diff.wExposure;
      if (diff.focusLowHp) score += (1 - hpPct(target)) * 20;
      const ev: AttackEval = {
        action: { type: 'attack', unitId: bu.unitId, to: node.pos, targetId: target.unitId, newStance: 'advance' },
        score,
        taken,
      };
      if (!best || ev.score > best.score || (ev.score === best.score && ev.taken < best.taken)) best = ev;
    }
  }
  return best;
}

function evaluateHeal(state: BattleState, bu: BattleUnit, reach: ReachMap): BattleAction | null {
  let best: { action: BattleAction; score: number } | null = null;
  for (const node of reach.values()) {
    if (!node.canStop) continue;
    for (const ally of livingUnits(state, bu.side)) {
      if (ally.unitId === bu.unitId || manhattan(ally.pos, node.pos) !== 1) continue;
      if (hpPct(ally) > 0.8) continue;
      const plan = planAssist(state, bu.unitId, node.pos, ally.unitId);
      if (!plan.valid || plan.heal <= 0) continue;
      const score = (1 - hpPct(ally)) * 100 + plan.heal;
      if (!best || score > best.score) best = { action: { type: 'assist', unitId: bu.unitId, to: node.pos, targetId: ally.unitId }, score };
    }
  }
  return best?.action ?? null;
}

function evaluateRefresh(state: BattleState, bu: BattleUnit, reach: ReachMap): BattleAction | null {
  let best: { action: BattleAction; score: number } | null = null;
  for (const node of reach.values()) {
    if (!node.canStop) continue;
    for (const ally of livingUnits(state, bu.side)) {
      if (ally.unitId === bu.unitId || !ally.acted || manhattan(ally.pos, node.pos) !== 1) continue;
      const plan = planAssist(state, bu.unitId, node.pos, ally.unitId);
      if (!plan.valid || !plan.refresh) continue;
      const score = (state.roster[ally.unitId]?.baseStats.atk ?? 0) + ally.hp / 10;
      if (!best || score > best.score) best = { action: { type: 'assist', unitId: bu.unitId, to: node.pos, targetId: ally.unitId }, score };
    }
  }
  return best?.action ?? null;
}

function advanceMove(state: BattleState, bu: BattleUnit, reach: ReachMap, threat: Map<string, number>, keepDistance: boolean): Pos {
  const diff = difficultyDef(state.difficulty).ai;
  const unit = state.roster[bu.unitId];
  const moveType = unit ? classDef(unit.classId).moveType : 'infantry';
  const players = livingUnits(state, 'player');
  if (players.length === 0) return bu.pos;
  const field = distanceField(state, players.map((p) => p.pos), moveType);
  const allies = livingUnits(state, bu.side).filter((a) => a.unitId !== bu.unitId);
  let best: { pos: Pos; score: number } | null = null;
  for (const node of reach.values()) {
    if (!node.canStop) continue;
    const d = field.get(posKey(node.pos)) ?? Math.min(...players.map((p) => manhattan(p.pos, node.pos))) + 20;
    let score: number;
    if (keepDistance) {
      // Лекарь: держаться подальше от игрока, но рядом со своими.
      const nearAlly = allies.length === 0 ? 0 : Math.min(...allies.map((a) => manhattan(a.pos, node.pos)));
      score = Math.min(d, 4) * 10 - Math.max(0, nearAlly - 2) * 15 - (threat.get(posKey(node.pos)) ?? 0) * 10;
    } else {
      score = -d * 10 - (threat.get(posKey(node.pos)) ?? 0) * diff.wExposure;
      if (terrainAt(state, node.pos) === 'cover') score += 3;
    }
    if (!best || score > best.score || (score === best.score && posKey(node.pos) < posKey(best.pos))) best = { pos: node.pos, score };
  }
  return best?.pos ?? bu.pos;
}

/** Решение для одного врага. Чистая детерминированная функция. */
export function decideAction(state: BattleState, unitId: string): BattleAction {
  const bu = state.units[unitId];
  const unit = state.roster[unitId];
  if (!bu || !unit || !bu.alive) return { type: 'endPhase' };
  const kind = classDef(unit.classId).weaponKind;
  const reach = reachableTiles(state, bu);
  const threat = threatCounts(state, 'player');
  const players = livingUnits(state, 'player');

  // Стойки
  let stance = bu.stance;
  if (stance === 'hold') {
    const zone = threatTiles(state, bu);
    if (players.some((p) => zone.has(posKey(p.pos)))) stance = 'advance';
    else return { type: 'wait', unitId, to: bu.pos };
  }
  if (stance === 'guard') {
    const atk = evaluateAttacks(state, bu, reach, threat, bu.pos);
    if (atk && atk.score >= 0) return { ...atk.action, newStance: 'guard' } as BattleAction;
    return { type: 'wait', unitId, to: bu.pos, newStance: 'guard' };
  }

  // Лекарь: лечение приоритетнее
  if (kind === 'bandage') {
    const heal = evaluateHeal(state, bu, reach);
    if (heal) return { ...heal, newStance: 'advance' } as BattleAction;
  }
  if (kind === 'purr') {
    const refresh = evaluateRefresh(state, bu, reach);
    if (refresh) return { ...refresh, newStance: 'advance' } as BattleAction;
  }

  const atk = evaluateAttacks(state, bu, reach, threat);
  if (atk && atk.score >= 0) return atk.action;

  const to = advanceMove(state, bu, reach, threat, kind === 'bandage' || kind === 'purr');
  return { type: 'wait', unitId, to, newStance: 'advance' };
}
