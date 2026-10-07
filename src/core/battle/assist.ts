import type { BattleState, BattleUnit, Pos, Stats } from '../types';
import { inBounds, manhattan } from '../types';
import { terrainAt, unitAt } from './query';
import { isPassable } from '../map/pathing';
import { assistDef } from '@content/skills/assists';
import { specialDef } from '@content/skills/specials';
import { classDef } from '@content/classes';
import type { AssistDef } from '../skills/types';

export interface AssistPlan {
  valid: boolean;
  reason?: string;
  assist?: AssistDef;
  moves: { unitId: string; to: Pos }[];
  heal: number;
  allHeal: number;
  buffs: { unitId: string; stats: Partial<Stats> }[];
  refresh: boolean;
  selfHpDelta: number;
  targetHpDelta: number;
  specialTriggered: boolean;
}

const invalid = (reason: string): AssistPlan => ({
  valid: false,
  reason,
  moves: [],
  heal: 0,
  allHeal: 0,
  buffs: [],
  refresh: false,
  selfHpDelta: 0,
  targetHpDelta: 0,
  specialTriggered: false,
});

function canStand(state: BattleState, bu: BattleUnit, pos: Pos, ignoreIds: string[]): boolean {
  if (!inBounds(pos)) return false;
  const unit = state.roster[bu.unitId];
  if (!unit) return false;
  if (!isPassable(terrainAt(state, pos), classDef(unit.classId).moveType)) return false;
  const occ = unitAt(state, pos);
  return !occ || ignoreIds.includes(occ.unitId);
}

/** Рассчитать результат Поддержки юнита `unitId` с клетки `from` на `targetId`. */
export function planAssist(state: BattleState, unitId: string, from: Pos, targetId: string): AssistPlan {
  const bu = state.units[unitId];
  const target = state.units[targetId];
  if (!bu || !target || !bu.alive || !target.alive) return invalid('нет юнита');
  if (bu.side !== target.side || bu.unitId === target.unitId) return invalid('не союзник');
  const unit = state.roster[unitId];
  const tUnit = state.roster[targetId];
  if (!unit || !tUnit) return invalid('нет данных');
  if (!unit.skills.assist) return invalid('нет Поддержки');
  const assist = assistDef(unit.skills.assist);
  if (manhattan(from, target.pos) !== 1) return invalid('цель не рядом');

  const base: AssistPlan = { ...invalid(''), valid: true, assist };
  delete base.reason;
  const self = { ...bu, pos: from };
  const dx = target.pos.x - from.x;
  const dy = target.pos.y - from.y;

  switch (assist.kind) {
    case 'rally':
      base.buffs.push({ unitId: targetId, stats: assist.stats ?? {} });
      return base;
    case 'swap': {
      if (!canStand(state, self, target.pos, [unitId, targetId]) || !canStand(state, target, from, [unitId, targetId])) return invalid('нельзя поменяться');
      base.moves.push({ unitId, to: target.pos }, { unitId: targetId, to: from });
      return base;
    }
    case 'reposition': {
      const dest = { x: from.x - dx, y: from.y - dy };
      if (!canStand(state, target, dest, [unitId, targetId])) return invalid('нет места позади');
      base.moves.push({ unitId: targetId, to: dest });
      return base;
    }
    case 'drawBack': {
      const dest = { x: from.x - dx, y: from.y - dy };
      if (!canStand(state, self, dest, [unitId, targetId])) return invalid('некуда отступать');
      if (!canStand(state, target, from, [unitId, targetId])) return invalid('цель не пройдёт');
      base.moves.push({ unitId, to: dest }, { unitId: targetId, to: from });
      return base;
    }
    case 'pivot': {
      const dest = { x: target.pos.x + dx, y: target.pos.y + dy };
      if (!canStand(state, self, dest, [unitId, targetId])) return invalid('нет места за союзником');
      base.moves.push({ unitId, to: dest });
      return base;
    }
    case 'shove':
    case 'smite': {
      const steps = assist.kind === 'shove' ? 1 : 2;
      let dest = target.pos;
      for (let i = 0; i < steps; i++) {
        dest = { x: dest.x + dx, y: dest.y + dy };
        if (!canStand(state, target, dest, [unitId, targetId])) return invalid('путь перекрыт');
      }
      base.moves.push({ unitId: targetId, to: dest });
      return base;
    }
    case 'heal': {
      if (target.hp >= target.maxHp) return invalid('союзник здоров');
      let amount = assist.heal ?? 5;
      const spId = unit.skills.special;
      if (spId) {
        const sp = specialDef(spId);
        if (sp.kind === 'heal' && bu.specialCd <= 0 && sp.heal) {
          base.specialTriggered = true;
          amount += sp.heal.bonusHeal ?? 0;
          base.allHeal = sp.heal.allAlliesHeal ?? 0;
        }
      }
      base.heal = Math.min(amount, target.maxHp - target.hp);
      base.targetHpDelta = base.heal;
      return base;
    }
    case 'refresh': {
      if (!target.acted) return invalid('союзник ещё не действовал');
      if (classDef(tUnit.classId).weaponKind === 'purr') return invalid('нельзя освежить Мурлыку');
      base.refresh = true;
      return base;
    }
    case 'sacrifice': {
      if (target.hp >= target.maxHp) return invalid('союзник здоров');
      if (bu.hp <= 10) return invalid('слишком мало HP');
      const give = Math.min(10, target.maxHp - target.hp);
      base.selfHpDelta = -10;
      base.targetHpDelta = give;
      base.heal = give;
      return base;
    }
    case 'reciprocal': {
      const newSelf = Math.min(bu.maxHp, target.hp);
      const newTarget = Math.min(target.maxHp, bu.hp);
      if (newSelf === bu.hp && newTarget === target.hp) return invalid('бессмысленно');
      base.selfHpDelta = newSelf - bu.hp;
      base.targetHpDelta = newTarget - target.hp;
      return base;
    }
  }
}

/** Союзники, на которых можно применить Поддержку с клетки from. */
export function assistTargetsFrom(state: BattleState, bu: BattleUnit, from: Pos): BattleUnit[] {
  const unit = state.roster[bu.unitId];
  if (!unit?.skills.assist) return [];
  return Object.values(state.units).filter(
    (u) => u.alive && u.side === bu.side && u.unitId !== bu.unitId && manhattan(u.pos, from) === 1 && planAssist(state, bu.unitId, from, u.unitId).valid,
  );
}
