import type { BattleState, BattleUnit, Effect, Pos, Stats, Strike, Triangle, UnitInstance } from '../types';
import { STATS, addStats, emptyStats, manhattan } from '../types';
import type { CombatCtx, CombatUnitView, StrikeInfo } from '../skills/types';
import { counterAnyRange, specialMaxCd, unitKit, wrathfulStaff } from '../skills/engine';
import { visibleStats } from '../units';
import { livingUnits, terrainAt, unitsWithinOf } from '../battle/query';
import { COMBAT } from '@content/balance';

export interface CombatSideResult {
  unitId: string;
  hpBefore: number;
  hpAfter: number;
  cdBefore: number;
  cdAfter: number;
  flags: Record<string, number>;
  stats: Stats;
  died: boolean;
  hits: number;
  damagePerHit: number;
  specialId?: string;
  specialTriggered: boolean;
}

export interface CombatOutcome {
  strikes: Strike[];
  attacker: CombatSideResult;
  defender: CombatSideResult;
  triangle: Triangle;
  attackerEffective: boolean;
  defenderEffective: boolean;
  defenderCanCounter: boolean;
  attackerFollowUp: boolean;
  defenderFollowUp: boolean;
  afterEffects: Effect[];
}

export function triangleOf(a: CombatUnitView['weapon'], d: CombatUnitView['weapon']): Triangle {
  const ca = a.color;
  const cd = d.color;
  if (ca === 'colorless' || cd === 'colorless' || ca === cd) return 'neutral';
  if ((ca === 'red' && cd === 'green') || (ca === 'green' && cd === 'blue') || (ca === 'blue' && cd === 'red')) return 'adv';
  return 'dis';
}

function cloneBu(bu: BattleUnit): BattleUnit {
  return { ...bu, pos: { ...bu.pos }, bonuses: { ...bu.bonuses }, penalties: { ...bu.penalties }, flags: { ...bu.flags } };
}

function baseCombatStats(unit: UnitInstance, bu: BattleUnit): Stats {
  let s = visibleStats(unit);
  s = addStats(s, bu.bonuses);
  s = addStats(s, bu.penalties);
  return s;
}

function makeView(state: BattleState, bu: BattleUnit, isInitiator: boolean): CombatUnitView {
  const unit = state.roster[bu.unitId];
  if (!unit) throw new Error(`no roster unit ${bu.unitId}`);
  const kit = unitKit(unit);
  return { bu, unit, stats: baseCombatStats(unit, bu), weapon: kit.weapon, cls: kit.cls, hpStart: bu.hp, isInitiator };
}

function applyCombatMods(state: BattleState, self: CombatUnitView, foe: CombatUnitView): void {
  const ctx: CombatCtx = { state, self, foe };
  let mod: Stats = emptyStats();
  for (const h of unitKit(self.unit).hooks) {
    const m = h.combatStatMod?.(ctx);
    if (m) mod = addStats(mod, m);
  }
  for (const ally of livingUnits(state, self.bu.side)) {
    if (ally.unitId === self.bu.unitId) continue;
    const allyUnit = state.roster[ally.unitId];
    if (!allyUnit) continue;
    for (const h of unitKit(allyUnit).hooks) {
      const a = h.allyCombatStatMod;
      if (a && manhattan(ally.pos, self.bu.pos) <= a.range) mod = addStats(mod, a.stats);
    }
  }
  self.stats = addStats(self.stats, mod);
  for (const s of STATS) if (self.stats[s] < 0) self.stats[s] = 0;
}

interface SeqEntry {
  side: 'a' | 'd';
  hits: number;
}

/**
 * Детерминированная симуляция боя. Не мутирует state; возвращает результат для редьюсера/прогноза.
 * attackerPos — клетка, с которой атакует инициатор (может отличаться от текущей).
 */
export function simulateCombat(state: BattleState, attackerId: string, defenderId: string, attackerPos: Pos): CombatOutcome {
  const aSrc = state.units[attackerId];
  const dSrc = state.units[defenderId];
  if (!aSrc || !dSrc) throw new Error('combat: unit missing');
  const a = cloneBu(aSrc);
  a.pos = { ...attackerPos };
  const d = cloneBu(dSrc);

  const A = makeView(state, a, true);
  const D = makeView(state, d, false);
  applyCombatMods(state, A, D);
  applyCombatMods(state, D, A);

  const ctxA: CombatCtx = { state, self: A, foe: D };
  const ctxD: CombatCtx = { state, self: D, foe: A };
  const hooksA = unitKit(A.unit).hooks;
  const hooksD = unitKit(D.unit).hooks;

  const triangle = triangleOf(A.weapon, D.weapon);
  const aEff = (A.weapon.effectiveAgainst ?? []).includes(D.cls.moveType);
  const dEff = (D.weapon.effectiveAgainst ?? []).includes(A.cls.moveType);
  const dist = manhattan(a.pos, d.pos);
  const canCounter = D.weapon.range === dist || counterAnyRange(D.unit);

  // Двойные атаки
  let aFU = A.stats.spd >= D.stats.spd + COMBAT.followUpSpd;
  let dFU = D.stats.spd >= A.stats.spd + COMBAT.followUpSpd;
  let aGuar = 0;
  let aDeny = 0;
  let dGuar = 0;
  let dDeny = 0;
  for (const h of hooksA) {
    const r = h.followUp?.(ctxA);
    if (r?.selfGuaranteed) aGuar++;
    if (r?.foeDenied) dDeny++;
  }
  for (const h of hooksD) {
    const r = h.followUp?.(ctxD);
    if (r?.selfGuaranteed) dGuar++;
    if (r?.foeDenied) aDeny++;
  }
  if (aGuar > 0 && aDeny === 0) aFU = true;
  else if (aDeny > 0 && aGuar === 0) aFU = false;
  if (dGuar > 0 && dDeny === 0) dFU = true;
  else if (dDeny > 0 && dGuar === 0) dFU = false;
  if (!canCounter) dFU = false;

  const vantage = canCounter && hooksD.some((h) => h.vantage?.(ctxD));
  const desperation = aFU && hooksA.some((h) => h.desperation?.(ctxA));
  const braveA = A.weapon.variant === 'brave' ? 2 : 1;

  const seq: SeqEntry[] = [];
  if (vantage) seq.push({ side: 'd', hits: 1 });
  seq.push({ side: 'a', hits: braveA });
  if (desperation) seq.push({ side: 'a', hits: braveA });
  if (!vantage && canCounter) seq.push({ side: 'd', hits: 1 });
  if (aFU && !desperation) seq.push({ side: 'a', hits: braveA });
  if (dFU) seq.push({ side: 'd', hits: 1 });

  const maxCdA = specialMaxCd(A.unit) ?? 0;
  const maxCdD = specialMaxCd(D.unit) ?? 0;
  const spA = unitKit(A.unit).special;
  const spD = unitKit(D.unit).special;
  const strikes: Strike[] = [];
  let aStruck = false;
  let dStruck = false;
  let aSpecialTriggered = false;
  let dSpecialTriggered = false;

  const doStrike = (atk: CombatUnitView, def: CombatUnitView, isCounter: boolean): void => {
    const ctxAtk = atk === A ? ctxA : ctxD;
    const ctxDef = def === A ? ctxA : ctxD;
    const hooksAtk = atk === A ? hooksA : hooksD;
    const hooksDef = def === A ? hooksA : hooksD;
    const spAtk = atk === A ? spA : spD;
    const spDef = def === A ? spA : spD;
    const maxCdAtk = atk === A ? maxCdA : maxCdD;
    const maxCdDef = def === A ? maxCdA : maxCdD;
    const firstStrike = atk === A ? !aStruck : !dStruck;
    const info: StrikeInfo = { isFirstStrike: firstStrike, isCounter, range: atk.weapon.range };
    const tri: Triangle = atk === A ? triangle : triangle === 'adv' ? 'dis' : triangle === 'dis' ? 'adv' : 'neutral';
    const effective = atk === A ? aEff : dEff;

    // Атака
    let atkVal = atk.stats.atk;
    if (effective) atkVal = Math.floor(atkVal * COMBAT.effective);
    if (tri === 'adv') atkVal += Math.floor(atkVal * COMBAT.triangle);
    else if (tri === 'dis') atkVal -= Math.floor(atkVal * COMBAT.triangle);

    // Защита
    let defVal = atk.weapon.magical ? def.stats.res : def.stats.def;
    if (terrainAt(state, def.bu.pos) === 'cover') defVal += Math.floor(defVal * COMBAT.coverBonus);

    // Атакующий спецприём
    let usedSpecial: string | undefined;
    let specialBonus = 0;
    let healPct = 0;
    const offensive = spAtk && spAtk.kind === 'offense' && spAtk.offense;
    if (offensive && atk.bu.specialCd <= 0) {
      usedSpecial = spAtk.id;
      const o = spAtk.offense as NonNullable<typeof spAtk.offense>;
      if (o.ignoreDefPct) defVal -= Math.floor((defVal * o.ignoreDefPct) / 100);
      if (o.damagePctOfStat) {
        const src = o.damagePctOfStat.of === 'self' ? atk.stats : def.stats;
        specialBonus += Math.floor((src[o.damagePctOfStat.stat] * o.damagePctOfStat.pct) / 100);
      }
      if (o.healPctOfDamage) healPct = o.healPctOfDamage;
    }

    let dmg = Math.max(0, atkVal - defVal);
    if (usedSpecial && offensive && offensive.damageBonusPct) dmg += Math.floor((dmg * offensive.damageBonusPct) / 100);
    dmg += specialBonus;
    for (const h of hooksAtk) dmg += h.flatDamage?.(ctxAtk, info) ?? 0;
    for (const h of hooksAtk) {
      const m = h.damageMultiplier?.(ctxAtk);
      if (m && m !== 1) dmg = Math.floor(dmg * m);
    }
    if (atk.weapon.isStaff && !wrathfulStaff(atk.unit)) dmg = Math.floor(dmg * COMBAT.staffMult);

    // Защитный спецприём
    let defenseSpecial: string | undefined;
    const defensive = spDef && spDef.kind === 'defense' && spDef.defense;
    if (defensive && def.bu.specialCd <= 0) {
      const dd = spDef.defense as NonNullable<typeof spDef.defense>;
      const rangeOk = dd.vsRange === 'any' || (dd.vsRange === 'melee' && atk.weapon.range === 1) || (dd.vsRange === 'ranged' && atk.weapon.range === 2);
      if (rangeOk) {
        defenseSpecial = spDef.id;
        const before = dmg;
        dmg = Math.floor(dmg * (1 - dd.reduction));
        if (dd.healPctOfDamage) {
          const heal = Math.floor(((before - dmg) * dd.healPctOfDamage) / 100);
          def.bu.hp = Math.min(def.bu.maxHp, def.bu.hp + heal);
        }
      }
    }
    for (const h of hooksDef) {
      const r = h.damageReduction?.(ctxDef, info) ?? 0;
      if (r > 0) dmg = Math.floor(dmg * (1 - r));
    }
    dmg = Math.max(0, dmg);

    // Применение
    let miracle = false;
    let newHp = def.bu.hp - dmg;
    if (newHp <= 0) {
      if (spDef && spDef.miracle && def.bu.specialCd <= 0 && def.bu.hp > 1) {
        newHp = 1;
        miracle = true;
        defenseSpecial = spDef.id;
      } else if (def.bu.hp > 1 && hooksDef.some((h) => h.survive?.(ctxDef))) {
        newHp = 1;
        miracle = true;
      } else newHp = 0;
    }
    def.bu.hp = newHp;
    let healed = 0;
    if (healPct > 0 && dmg > 0) {
      healed = Math.min(atk.bu.maxHp - atk.bu.hp, Math.floor((dmg * healPct) / 100));
      atk.bu.hp += healed;
    }

    // Кулдауны
    if (usedSpecial) {
      atk.bu.specialCd = maxCdAtk;
      if (atk === A) aSpecialTriggered = true;
      else dSpecialTriggered = true;
    } else if (spAtk) atk.bu.specialCd = Math.max(0, atk.bu.specialCd - 1);
    if (defenseSpecial) {
      def.bu.specialCd = maxCdDef;
      if (def === A) aSpecialTriggered = true;
      else dSpecialTriggered = true;
    } else if (spDef) def.bu.specialCd = Math.max(0, def.bu.specialCd - 1);

    if (atk === A) aStruck = true;
    else dStruck = true;

    const strike: Strike = {
      attackerId: atk.bu.unitId,
      defenderId: def.bu.unitId,
      damage: dmg,
      effective,
      triangle: tri,
      healed,
      isCounter,
      range: atk.weapon.range,
      attackerHpAfter: atk.bu.hp,
      defenderHpAfter: def.bu.hp,
    };
    if (usedSpecial) strike.special = usedSpecial;
    if (defenseSpecial) strike.defenseSpecial = defenseSpecial;
    if (miracle) strike.miracle = true;
    strikes.push(strike);
  };

  outer: for (const entry of seq) {
    for (let i = 0; i < entry.hits; i++) {
      if (a.hp <= 0 || d.hp <= 0) break outer;
      if (entry.side === 'a') doStrike(A, D, false);
      else doStrike(D, A, true);
    }
  }

  // После боя
  const afterEffects: Effect[] = [];
  const aAlive = a.hp > 0;
  const dAlive = d.hp > 0;
  if (aAlive) {
    for (const h of hooksA)
      afterEffects.push(...(h.afterCombat?.(ctxA, { selfHpAfter: a.hp, foeHpAfter: d.hp, selfStruck: aStruck, foeStruck: dStruck, foeDied: !dAlive }) ?? []));
    if (A.weapon.debuffAfterCombat && aStruck) {
      const targets = unitsWithinOf(state, d.pos, 2, d.side);
      for (const t of targets) if (t.unitId === d.unitId ? dAlive : true) afterEffects.push({ type: 'debuff', unitId: t.unitId, stats: A.weapon.debuffAfterCombat });
    }
  }
  if (dAlive) {
    for (const h of hooksD)
      afterEffects.push(...(h.afterCombat?.(ctxD, { selfHpAfter: d.hp, foeHpAfter: a.hp, selfStruck: dStruck, foeStruck: aStruck, foeDied: !aAlive }) ?? []));
    if (D.weapon.debuffAfterCombat && dStruck) {
      const targets = unitsWithinOf(state, a.pos, 2, a.side);
      for (const t of targets) if (t.unitId === a.unitId ? aAlive : true) afterEffects.push({ type: 'debuff', unitId: t.unitId, stats: D.weapon.debuffAfterCombat });
    }
  }

  const aStrikes = strikes.filter((s) => s.attackerId === a.unitId);
  const dStrikes = strikes.filter((s) => s.attackerId === d.unitId);
  const side = (bu: BattleUnit, src: BattleUnit, view: CombatUnitView, own: Strike[], trig: boolean): CombatSideResult => {
    const r: CombatSideResult = {
      unitId: bu.unitId,
      hpBefore: src.hp,
      hpAfter: bu.hp,
      cdBefore: src.specialCd,
      cdAfter: bu.specialCd,
      flags: bu.flags,
      stats: view.stats,
      died: bu.hp <= 0,
      hits: own.length,
      damagePerHit: own[0]?.damage ?? 0,
      specialTriggered: trig,
    };
    const sp = unitKit(view.unit).special;
    if (sp) r.specialId = sp.id;
    return r;
  };

  return {
    strikes,
    attacker: side(a, aSrc, A, aStrikes, aSpecialTriggered),
    defender: side(d, dSrc, D, dStrikes, dSpecialTriggered),
    triangle,
    attackerEffective: aEff,
    defenderEffective: dEff,
    defenderCanCounter: canCounter,
    attackerFollowUp: aFU,
    defenderFollowUp: dFU,
    afterEffects,
  };
}
