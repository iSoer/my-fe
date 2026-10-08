import type { BattleAction, BattleState, BattleUnit, Pos } from '../types';
import { manhattan, posKey } from '../types';
import { hashString } from '../rng';
import { weaponDef } from '@content/weapons';
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
      // Добивать раненых, бить в преимущество треугольника и тех, кто не ответит
      score += (1 - hpPct(target)) * diff.focusLowHp;
      if (out.triangle === 'adv') score += 6;
      if (!out.defenderCanCounter) score += 5;
      // Детерминированная «индивидуальность»: разные враги по-разному ранжируют равные варианты
      score += jitter(bu.unitId, state.turn, node.pos, target.unitId);
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

/** Малый детерминированный шум 0..0.9, чтобы одинаковые оценки решались по-разному у разных врагов и ходов. */
function jitter(unitId: string, turn: number, pos: Pos, extra = ''): number {
  return (hashString(`${unitId}:${turn}:${pos.x},${pos.y}:${extra}`) % 1000) / 1100;
}

/** «Шум боя»: рядом есть раненый или павший враг — стоящие просыпаются. */
function alarmNearby(state: BattleState, bu: BattleUnit, radius: number): boolean {
  return Object.values(state.units).some(
    (e) => e.side === 'enemy' && e.unitId !== bu.unitId && manhattan(e.pos, bu.pos) <= radius && (!e.alive || e.hp < e.maxHp),
  );
}

function nearestPlayerDistance(state: BattleState, pos: Pos): number {
  const players = livingUnits(state, 'player');
  return players.length === 0 ? 99 : Math.min(...players.map((p) => manhattan(p.pos, pos)));
}

/** Нужно ли стоящему/охраняющему врагу перейти в наступление. */
function shouldWake(state: BattleState, bu: BattleUnit): boolean {
  const diff = difficultyDef(state.difficulty).ai;
  if (state.turn >= diff.wakeTurn) return true;
  if (nearestPlayerDistance(state, bu.pos) <= diff.alertRadius) return true;
  if (alarmNearby(state, bu, 3)) return true;
  const zone = threatTiles(state, bu);
  return livingUnits(state, 'player').some((p) => zone.has(posKey(p.pos)));
}

/** Отступление: подальше от угроз, к лекарю, если он есть. */
function retreatMove(state: BattleState, bu: BattleUnit, reach: ReachMap, threat: Map<string, number>): Pos {
  const healer = livingUnits(state, bu.side).find((a) => {
    const u = state.roster[a.unitId];
    return a.unitId !== bu.unitId && u && classDef(u.classId).weaponKind === 'bandage';
  });
  let best: { pos: Pos; score: number } | null = null;
  for (const node of reach.values()) {
    if (!node.canStop) continue;
    const d = nearestPlayerDistance(state, node.pos);
    let score = Math.min(d, 5) * 10 - (threat.get(posKey(node.pos)) ?? 0) * 12;
    if (healer) score -= manhattan(healer.pos, node.pos) * 4;
    if (terrainAt(state, node.pos) === 'cover') score += 6;
    score += jitter(bu.unitId, state.turn, node.pos);
    if (!best || score > best.score) best = { pos: node.pos, score };
  }
  return best?.pos ?? bu.pos;
}

function advanceMove(state: BattleState, bu: BattleUnit, reach: ReachMap, threat: Map<string, number>, keepDistance: boolean): Pos {
  const diff = difficultyDef(state.difficulty).ai;
  const unit = state.roster[bu.unitId];
  const moveType = unit ? classDef(unit.classId).moveType : 'infantry';
  const players = livingUnits(state, 'player');
  if (players.length === 0) return bu.pos;
  const field = distanceField(state, players.map((p) => p.pos), moveType);
  const allies = livingUnits(state, bu.side).filter((a) => a.unitId !== bu.unitId);
  const range = unit ? weaponDef(unit.skills.weapon).range : 1;
  // Дальники подходят на дистанцию 3: на следующем ходу стреляют, не вставая вплотную.
  const preferDist = range === 2 ? 3 : 1;
  let best: { pos: Pos; score: number } | null = null;
  for (const node of reach.values()) {
    if (!node.canStop) continue;
    const d = field.get(posKey(node.pos)) ?? Math.min(...players.map((p) => manhattan(p.pos, node.pos))) + 20;
    const nearAlly = allies.length === 0 ? 0 : Math.min(...allies.map((a) => manhattan(a.pos, node.pos)));
    let score: number;
    if (keepDistance) {
      // Лекарь/Мурлыка: держаться подальше от игрока, но рядом со своими.
      score = Math.min(d, 4) * 10 - Math.max(0, nearAlly - 2) * 15 - (threat.get(posKey(node.pos)) ?? 0) * 10;
    } else {
      const approach = preferDist === 1 ? d : Math.abs(d - preferDist) + d * 0.3;
      score = -approach * 10 - (threat.get(posKey(node.pos)) ?? 0) * diff.wExposure;
      score -= Math.max(0, nearAlly - 2) * diff.cohesion;
      if (terrainAt(state, node.pos) === 'cover') score += 3;
    }
    score += jitter(bu.unitId, state.turn, node.pos);
    if (!best || score > best.score) best = { pos: node.pos, score };
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

  // Стойки: стоящие просыпаются от близости игрока, «шума боя» или по таймеру хода
  let stance = bu.stance;
  if (stance === 'hold') {
    if (shouldWake(state, bu)) stance = 'advance';
    else return { type: 'wait', unitId, to: bu.pos };
  }
  if (stance === 'guard') {
    const atk = evaluateAttacks(state, bu, reach, threat, bu.pos);
    if (atk && atk.score >= 0) return { ...atk.action, newStance: 'guard' } as BattleAction;
    // Вожак бросается в бой, когда рядом гибнут свои или игрок подошёл вплотную
    if (alarmNearby(state, bu, 3) || nearestPlayerDistance(state, bu.pos) <= 2) stance = 'advance';
    else return { type: 'wait', unitId, to: bu.pos, newStance: 'guard' };
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

  // Раненый без шанса убить — отступает подлечиться (кроме Легко)
  const diff = difficultyDef(state.difficulty).ai;
  if (diff.retreatHp > 0 && hpPct(bu) < diff.retreatHp) {
    const to = retreatMove(state, bu, reach, threat);
    return { type: 'wait', unitId, to, newStance: 'advance' };
  }

  const to = advanceMove(state, bu, reach, threat, kind === 'bandage' || kind === 'purr');
  return { type: 'wait', unitId, to, newStance: 'advance' };
}
