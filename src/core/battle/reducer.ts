import type {
  BattleAction,
  BattleEvent,
  BattleState,
  BattleUnit,
  Effect,
  MapDef,
  Pos,
  ReduceResult,
  Side,
  Stats,
  UnitInstance,
} from '../types';
import { STATS, manhattan, posKey } from '../types';
import { livingUnits, otherSide, unitAt } from './query';
import { planAssist } from './assist';
import { pathTo, reachableTiles, targetsFrom, wallsFrom } from '../map/pathing';
import { simulateCombat } from '../combat';
import { specialMaxCd, unitKit, xpMultiplier } from '../skills/engine';
import { levelGains, visibleStats } from '../units';
import { difficultyDef, SP, XP } from '@content/balance';
import { classDef } from '@content/classes';
import { MAX_LEVEL } from '../types';

export interface CreateBattleOptions {
  map: MapDef;
  squad: UnitInstance[];
  seed: number;
  now: number;
}

function makeBattleUnit(unit: UnitInstance, side: Side, pos: Pos, stance: BattleUnit['stance'], turn: number): BattleUnit {
  const hp = visibleStats(unit).hp;
  return {
    unitId: unit.id,
    side,
    pos: { ...pos },
    hp,
    maxHp: hp,
    specialCd: specialMaxCd(unit) ?? 0,
    acted: false,
    alive: true,
    bonuses: {},
    penalties: {},
    stance,
    flags: {},
    spawnedTurn: turn,
  };
}

export function createBattle(opts: CreateBattleOptions): ReduceResult {
  const state: BattleState = {
    id: `b_${opts.seed.toString(36)}_${opts.now.toString(36)}`,
    seed: opts.seed,
    map: opts.map,
    difficulty: opts.map.difficulty,
    turn: 1,
    phase: 'player',
    units: {},
    roster: {},
    walls: {},
    decals: [],
    stats: { kills: 0, damage: 0, turns: 0, deaths: [], xpGained: {} },
    spawnedWaves: [],
    enemyQueue: null,
    startedAt: opts.now,
  };
  opts.map.tiles.forEach((row, y) =>
    row.forEach((t, x) => {
      if (t === 'wall_breakable') state.walls[posKey({ x, y })] = 2;
    }),
  );
  opts.squad.forEach((u, i) => {
    const spawn = opts.map.playerSpawns[i];
    if (!spawn) return;
    state.roster[u.id] = u;
    state.units[u.id] = makeBattleUnit(u, 'player', spawn, 'advance', 1);
  });
  for (const e of opts.map.enemies) {
    state.roster[e.unit.id] = e.unit;
    state.units[e.unit.id] = makeBattleUnit(e.unit, 'enemy', e.pos, e.stance, 1);
  }
  const events: BattleEvent[] = [];
  startPhase(state, 'player', events);
  return { state, events };
}

/* ---------- Вспомогательные ---------- */

function applyEffects(state: BattleState, effects: Effect[], events: BattleEvent[]): void {
  for (const e of effects) {
    const u = state.units[e.unitId];
    if (!u || !u.alive) continue;
    switch (e.type) {
      case 'buff':
        for (const s of STATS) {
          const v = e.stats[s];
          if (v === undefined || v === 0) continue;
          u.bonuses[s] = Math.max(u.bonuses[s] ?? 0, v);
        }
        events.push({ type: 'effect', effect: e });
        break;
      case 'debuff':
        for (const s of STATS) {
          const v = e.stats[s];
          if (v === undefined || v === 0) continue;
          u.penalties[s] = Math.min(u.penalties[s] ?? 0, v);
        }
        events.push({ type: 'effect', effect: e });
        break;
      case 'heal': {
        const before = u.hp;
        u.hp = Math.min(u.maxHp, u.hp + e.amount);
        if (u.hp !== before) events.push({ type: 'effect', effect: { ...e, amount: u.hp - before }, hpAfter: u.hp });
        break;
      }
      case 'damage': {
        const before = u.hp;
        u.hp = Math.max(1, u.hp - e.amount);
        if (u.hp !== before) events.push({ type: 'effect', effect: { ...e, amount: before - u.hp }, hpAfter: u.hp });
        break;
      }
      case 'flag':
        u.flags[e.key] = e.value;
        break;
    }
  }
}

function killUnit(state: BattleState, u: BattleUnit, killerId: string | undefined, events: BattleEvent[]): void {
  if (!u.alive) return;
  u.alive = false;
  u.hp = 0;
  u.acted = true;
  state.decals.push({ pos: { ...u.pos }, kind: 'pool' });
  if (u.side === 'player') state.stats.deaths.push(u.unitId);
  if (killerId && state.units[killerId]?.side === 'player') {
    state.stats.kills++;
    const killerUnit = state.roster[killerId];
    if (killerUnit) state.roster[killerId] = { ...killerUnit, history: { ...killerUnit.history, kills: killerUnit.history.kills + 1 } };
  }
  const killer = killerId ? state.units[killerId] : undefined;
  const fx: Effect[] = [];
  for (const ally of livingUnits(state, u.side)) {
    const au = state.roster[ally.unitId];
    if (!au) continue;
    for (const h of unitKit(au).hooks) fx.push(...(h.onAllyDeath?.(state, ally, u, killer) ?? []));
  }
  applyEffects(state, fx, events);
  const died: BattleEvent = { type: 'died', unitId: u.unitId, pos: { ...u.pos }, side: u.side };
  if (killerId) died.killerId = killerId;
  events.push(died);
}

function grantXp(state: BattleState, unitId: string, xp: number, sp: number, events: BattleEvent[]): void {
  const bu = state.units[unitId];
  const unit = state.roster[unitId];
  if (!bu || !unit || !bu.alive || bu.side !== 'player') return;
  const gainedXp = unit.level >= MAX_LEVEL ? 0 : Math.round(xp * xpMultiplier(unit));
  let next: UnitInstance = { ...unit, xp: unit.xp + gainedXp, sp: unit.sp + sp };
  state.stats.xpGained[unitId] = (state.stats.xpGained[unitId] ?? 0) + gainedXp;
  events.push({ type: 'xp', unitId, amount: gainedXp, sp });
  while (next.xp >= XP.perLevel && next.level < MAX_LEVEL) {
    const from = next.level;
    next = { ...next, level: from + 1, xp: next.xp - XP.perLevel };
    const gains = levelGains(next, from, from + 1);
    const hpGain = gains.hp ?? 0;
    bu.maxHp += hpGain;
    bu.hp = Math.min(bu.maxHp, bu.hp + hpGain);
    events.push({ type: 'levelUp', unitId, level: next.level, gains });
  }
  if (next.level >= MAX_LEVEL) next = { ...next, xp: 0 };
  state.roster[unitId] = next;
}

function xpForCombat(selfLevel: number, foeLevel: number, killed: boolean): number {
  const base = Math.max(XP.combatMin, Math.min(XP.combatMax, XP.combatBase + XP.combatPerLevelDiff * (foeLevel - selfLevel)));
  return killed ? base * 2 + XP.killBonus : base;
}

function finishAction(state: BattleState, bu: BattleUnit, newStance?: BattleUnit['stance']): void {
  bu.acted = true;
  bu.penalties = {};
  if (newStance) bu.stance = newStance;
}

function checkEnd(state: BattleState, events: BattleEvent[]): boolean {
  if (state.result) return true;
  const players = livingUnits(state, 'player');
  if (players.length === 0) {
    state.result = 'defeat';
    events.push({ type: 'battleEnded', result: 'defeat' });
    return true;
  }
  const enemies = livingUnits(state, 'enemy');
  const allWavesSpawned = state.map.reinforcements.every((w) => state.spawnedWaves.includes(w.turn));
  if (state.map.objective === 'killBoss') {
    const bossAlive = enemies.some((e) => state.roster[e.unitId]?.isBoss);
    const bossExists = Object.values(state.roster).some((u) => u.isBoss);
    if (bossExists && !bossAlive) {
      state.result = 'victory';
      events.push({ type: 'battleEnded', result: 'victory' });
      return true;
    }
  }
  if (enemies.length === 0 && allWavesSpawned) {
    state.result = 'victory';
    events.push({ type: 'battleEnded', result: 'victory' });
    return true;
  }
  return false;
}

function spawnReinforcements(state: BattleState, events: BattleEvent[]): void {
  for (const wave of state.map.reinforcements) {
    if (wave.turn !== state.turn || state.spawnedWaves.includes(wave.turn)) continue;
    state.spawnedWaves.push(wave.turn);
    const ids: string[] = [];
    for (const r of wave.units) {
      let pos = r.pos;
      if (unitAt(state, pos)) {
        const alt = [
          { x: pos.x + 1, y: pos.y },
          { x: pos.x - 1, y: pos.y },
          { x: pos.x, y: pos.y + 1 },
        ].find((p) => p.x >= 0 && p.x < 6 && p.y >= 0 && p.y < 8 && !unitAt(state, p) && state.map.tiles[p.y]?.[p.x] === 'plain');
        if (!alt) continue;
        pos = alt;
      }
      state.roster[r.unit.id] = r.unit;
      state.units[r.unit.id] = makeBattleUnit(r.unit, 'enemy', pos, 'advance', state.turn);
      ids.push(r.unit.id);
    }
    if (ids.length > 0) events.push({ type: 'reinforcements', unitIds: ids });
  }
}

function startPhase(state: BattleState, side: Side, events: BattleEvent[]): void {
  state.phase = side;
  state.enemyQueue = null;
  for (const u of livingUnits(state, side)) {
    u.acted = false;
    u.bonuses = {};
  }
  if (side === 'enemy') spawnReinforcements(state, events);
  events.push({ type: 'phaseChanged', phase: side, turn: state.turn });
  const fx: Effect[] = [];
  for (const u of livingUnits(state, side)) {
    const unit = state.roster[u.unitId];
    if (!unit) continue;
    for (const h of unitKit(unit).hooks) fx.push(...(h.onTurnStart?.(state, u) ?? []));
  }
  applyEffects(state, fx, events);
}

function endPhase(state: BattleState, events: BattleEvent[]): void {
  const side = state.phase;
  for (const u of livingUnits(state, side)) if (!u.acted) u.penalties = {};
  if (side === 'player') startPhase(state, 'enemy', events);
  else {
    state.turn++;
    state.stats.turns = state.turn;
    startPhase(state, 'player', events);
  }
}

function moveUnit(state: BattleState, bu: BattleUnit, to: Pos, events: BattleEvent[]): void {
  if (manhattan(bu.pos, to) === 0) return;
  const reach = reachableTiles(state, bu);
  const node = reach.get(posKey(to));
  if (!node || !node.canStop) throw new Error('клетка недостижима');
  const path = pathTo(reach, to);
  bu.pos = { ...to };
  events.push({ type: 'moved', unitId: bu.unitId, path });
}

function validateActor(state: BattleState, unitId: string): BattleUnit {
  const bu = state.units[unitId];
  if (!bu || !bu.alive) throw new Error('юнит недоступен');
  if (bu.side !== state.phase) throw new Error('не ваша фаза');
  if (bu.acted) throw new Error('юнит уже действовал');
  return bu;
}

/* ---------- Главная функция ---------- */

export function applyAction(prev: BattleState, action: BattleAction): ReduceResult {
  if (prev.result) return { state: prev, events: [] };
  const state = structuredClone(prev);
  const events: BattleEvent[] = [];

  switch (action.type) {
    case 'endPhase':
      endPhase(state, events);
      break;
    case 'retreat':
      state.result = 'retreat';
      events.push({ type: 'battleEnded', result: 'retreat' });
      break;
    case 'wait': {
      const bu = validateActor(state, action.unitId);
      moveUnit(state, bu, action.to, events);
      finishAction(state, bu, action.newStance);
      events.push({ type: 'waited', unitId: bu.unitId });
      break;
    }
    case 'attackWall': {
      const bu = validateActor(state, action.unitId);
      moveUnit(state, bu, action.to, events);
      const key = posKey(action.wall);
      if (!wallsFrom(state, bu, bu.pos).some((p) => posKey(p) === key)) throw new Error('стена недоступна');
      state.walls[key] = Math.max(0, (state.walls[key] ?? 0) - 1);
      events.push({ type: 'wallHit', unitId: bu.unitId, pos: action.wall, hpAfter: state.walls[key] ?? 0 });
      finishAction(state, bu, action.newStance);
      break;
    }
    case 'assist': {
      const bu = validateActor(state, action.unitId);
      moveUnit(state, bu, action.to, events);
      const plan = planAssist(state, bu.unitId, bu.pos, action.targetId);
      if (!plan.valid || !plan.assist) throw new Error(plan.reason ?? 'Поддержка невозможна');
      const target = state.units[action.targetId] as BattleUnit;
      for (const m of plan.moves) {
        const mu = state.units[m.unitId];
        if (mu) mu.pos = { ...m.to };
      }
      for (const b of plan.buffs) applyEffects(state, [{ type: 'buff', unitId: b.unitId, stats: b.stats }], []);
      if (plan.targetHpDelta !== 0) target.hp = Math.max(1, Math.min(target.maxHp, target.hp + plan.targetHpDelta));
      if (plan.selfHpDelta !== 0) bu.hp = Math.max(1, Math.min(bu.maxHp, bu.hp + plan.selfHpDelta));
      if (plan.allHeal > 0) {
        for (const ally of livingUnits(state, bu.side)) {
          if (ally.unitId === bu.unitId || ally.unitId === target.unitId) continue;
          ally.hp = Math.min(ally.maxHp, ally.hp + plan.allHeal);
        }
      }
      if (plan.assist.kind === 'heal') {
        if (plan.specialTriggered) bu.specialCd = specialMaxCd(state.roster[bu.unitId] as UnitInstance) ?? 0;
        else if (state.roster[bu.unitId]?.skills.special) bu.specialCd = Math.max(0, bu.specialCd - 1);
      }
      if (plan.refresh) {
        target.acted = false;
      }
      events.push({
        type: 'assist',
        unitId: bu.unitId,
        targetId: target.unitId,
        assistId: plan.assist.id,
        moves: plan.moves,
        heal: plan.heal,
        targetHpAfter: target.hp,
        unitHpAfter: bu.hp,
      });
      finishAction(state, bu, action.newStance);
      grantXp(state, bu.unitId, plan.assist.kind === 'rally' ? XP.rally : XP.assist, SP.assist, events);
      break;
    }
    case 'attack': {
      const bu = validateActor(state, action.unitId);
      moveUnit(state, bu, action.to, events);
      const target = state.units[action.targetId];
      if (!target || !target.alive || target.side === bu.side) throw new Error('цель недоступна');
      if (!targetsFrom(state, bu, bu.pos).some((t) => t.unitId === target.unitId)) throw new Error('цель вне дальности');
      resolveCombat(state, bu, target, events);
      finishAction(state, bu, action.newStance ?? (bu.side === 'enemy' ? 'advance' : undefined));
      break;
    }
  }

  checkEnd(state, events);
  return { state, events };
}

function resolveCombat(state: BattleState, bu: BattleUnit, target: BattleUnit, events: BattleEvent[]): void {
  const outcome = simulateCombat(state, bu.unitId, target.unitId, bu.pos);
  const aUnit = state.roster[bu.unitId] as UnitInstance;
  const dUnit = state.roster[target.unitId] as UnitInstance;

  bu.hp = outcome.attacker.hpAfter;
  bu.specialCd = outcome.attacker.cdAfter;
  bu.flags = outcome.attacker.flags;
  target.hp = outcome.defender.hpAfter;
  target.specialCd = outcome.defender.cdAfter;
  target.flags = outcome.defender.flags;

  const dealtByA = outcome.strikes.filter((s) => s.attackerId === bu.unitId).reduce((a, s) => a + s.damage, 0);
  const dealtByD = outcome.strikes.filter((s) => s.attackerId === target.unitId).reduce((a, s) => a + s.damage, 0);
  if (bu.side === 'player') state.stats.damage += dealtByA;
  else state.stats.damage += 0;
  if (target.side === 'player') state.stats.damage += dealtByD;

  const updHistory = (u: UnitInstance, dealt: number, taken: number, hpAfter: number): UnitInstance => ({
    ...u,
    history: {
      ...u.history,
      damageDealt: u.history.damageDealt + dealt,
      damageTaken: u.history.damageTaken + taken,
      closestCall: hpAfter > 0 ? Math.min(u.history.closestCall, hpAfter) : u.history.closestCall,
    },
  });
  state.roster[bu.unitId] = updHistory(aUnit, dealtByA, dealtByD, bu.hp);
  state.roster[target.unitId] = updHistory(dUnit, dealtByD, dealtByA, target.hp);

  if (target.side === 'enemy' && state.roster[target.unitId]?.isBoss && target.hp < target.maxHp) target.stance = 'advance';
  if (bu.side === 'enemy' && target.hp > 0) bu.stance = 'advance';

  events.push({
    type: 'combat',
    attackerId: bu.unitId,
    defenderId: target.unitId,
    attackerPos: { ...bu.pos },
    defenderPos: { ...target.pos },
    strikes: outcome.strikes,
    attackerHpBefore: outcome.attacker.hpBefore,
    defenderHpBefore: outcome.defender.hpBefore,
    attackerHpAfter: bu.hp,
    defenderHpAfter: target.hp,
  });

  const aDied = bu.hp <= 0;
  const dDied = target.hp <= 0;
  if (dDied) killUnit(state, target, bu.unitId, events);
  if (aDied) killUnit(state, bu, target.unitId, events);

  applyEffects(state, outcome.afterEffects, events);
  // Эффекты «после боя» (Ярость) могут не убивать — applyEffects оставляет минимум 1 HP.

  const aStruck = outcome.strikes.some((s) => s.attackerId === bu.unitId);
  const dStruck = outcome.strikes.some((s) => s.attackerId === target.unitId);
  if (!aDied && aStruck) grantXp(state, bu.unitId, xpForCombat(aUnit.level, dUnit.level, dDied), dDied ? SP.kill : SP.combat, events);
  if (!dDied && dStruck) grantXp(state, target.unitId, xpForCombat(dUnit.level, aUnit.level, aDied), aDied ? SP.kill : SP.combat, events);
}

/** Удобный прогноз для UI: статы и исход без мутаций. */
export function forecast(state: BattleState, attackerId: string, defenderId: string, from: Pos) {
  return simulateCombat(state, attackerId, defenderId, from);
}

export function allPlayerUnitsActed(state: BattleState): boolean {
  return livingUnits(state, 'player').every((u) => u.acted);
}

export function unitStatsInBattle(state: BattleState, unitId: string): Stats | undefined {
  const unit = state.roster[unitId];
  const bu = state.units[unitId];
  if (!unit || !bu) return undefined;
  const base = visibleStats(unit);
  const out: Stats = { ...base };
  for (const s of STATS) out[s] = Math.max(0, base[s] + (bu.bonuses[s] ?? 0) + (bu.penalties[s] ?? 0));
  return out;
}

export { otherSide, classDef, difficultyDef };
