import type { PassiveDef } from '@core/skills/types';
import { alliesWithin, foesWithin, hpPct, unitsWithinOf } from '@core/battle/query';
import type { Effect, WeaponKind } from '@core/types';

const MELEE: WeaponKind[] = ['claw', 'fang', 'stick', 'purr'];
const RANGED: WeaponKind[] = ['hiss', 'howl', 'growl', 'slingshot', 'burr', 'bandage'];

export const PASSIVES: readonly PassiveDef[] = [
  /* ---------- A ---------- */
  { id: 'a_atk3', name: 'Острый коготь', desc: '+3 Atk.', slot: 'a', tier: 1, spCost: 120, stage: 'mvp', hooks: { statBonus: { atk: 3 } } },
  { id: 'a_spd3', name: 'Быстрые лапы', desc: '+3 Spd.', slot: 'a', tier: 1, spCost: 120, stage: 'mvp', hooks: { statBonus: { spd: 3 } } },
  { id: 'a_def3', name: 'Крепкая шкура', desc: '+3 Def.', slot: 'a', tier: 1, spCost: 120, stage: 'mvp', hooks: { statBonus: { def: 3 } } },
  { id: 'a_res3', name: 'Толстый мех', desc: '+3 Res.', slot: 'a', tier: 1, spCost: 120, stage: 'mvp', hooks: { statBonus: { res: 3 } } },
  { id: 'a_hp5', name: 'Жирок', desc: '+5 HP.', slot: 'a', tier: 1, spCost: 120, stage: 'mvp', hooks: { statBonus: { hp: 5 } } },
  {
    id: 'a_fury', name: 'Ярость', desc: '+3 ко всем статам. После боя −6 HP.', slot: 'a', tier: 2, spCost: 200, stage: 'v1',
    hooks: {
      statBonus: { atk: 3, spd: 3, def: 3, res: 3 },
      afterCombat: (ctx) => [{ type: 'damage', unitId: ctx.self.bu.unitId, amount: 6 }],
    },
  },
  {
    id: 'a_death_blow', name: 'Злобный бросок', desc: '+6 Atk при инициативе.', slot: 'a', tier: 2, spCost: 200, stage: 'mvp',
    hooks: { combatStatMod: (ctx) => (ctx.self.isInitiator ? { atk: 6 } : undefined) },
  },
  {
    id: 'a_life_death', name: 'Жизнь и смерть', desc: '+5 Atk/Spd, −5 Def/Res.', slot: 'a', tier: 2, spCost: 200, stage: 'v1',
    hooks: { statBonus: { atk: 5, spd: 5, def: -5, res: -5 } },
  },
  {
    id: 'a_close_counter', name: 'Ближний контрудар', desc: 'Контратакует врагов на любой дистанции.', slot: 'a', tier: 3, spCost: 300, stage: 'v1',
    hooks: { counterAnyRange: true }, allow: { weaponKinds: RANGED },
  },
  {
    id: 'a_distant_counter', name: 'Дальний контрудар', desc: 'Контратакует врагов на любой дистанции.', slot: 'a', tier: 3, spCost: 300, stage: 'v1',
    hooks: { counterAnyRange: true }, allow: { weaponKinds: MELEE },
  },

  /* ---------- B ---------- */
  {
    id: 'b_desperation', name: 'Отчаяние', desc: 'При HP ≤ 75 % и инициативе двойная атака идёт сразу за первой.', slot: 'b', tier: 2, spCost: 200, stage: 'v1',
    hooks: { desperation: (ctx) => ctx.self.isInitiator && hpPct(ctx.self.bu) <= 0.75 },
  },
  {
    id: 'b_vantage', name: 'Первым бью', desc: 'При HP ≤ 75 % контратакует до удара врага.', slot: 'b', tier: 2, spCost: 200, stage: 'v1',
    hooks: { vantage: (ctx) => !ctx.self.isInitiator && hpPct(ctx.self.bu) <= 0.75 },
  },
  {
    id: 'b_quick_riposte', name: 'Ответка', desc: 'При HP ≥ 70 % и обороне — гарантированная двойная атака.', slot: 'b', tier: 2, spCost: 200, stage: 'mvp',
    hooks: { followUp: (ctx) => (!ctx.self.isInitiator && hpPct(ctx.self.bu) >= 0.7 ? { selfGuaranteed: true } : undefined) },
  },
  { id: 'b_pass', name: 'Проскользнуть', desc: 'Проходит сквозь врагов.', slot: 'b', tier: 2, spCost: 200, stage: 'v1', hooks: { passThrough: true } },
  {
    id: 'b_breaker_claw', name: 'Стопор-коготь', desc: 'Против Когтей при HP ≥ 50 %: гарантированная двойная, враг без двойной.', slot: 'b', tier: 2, spCost: 200, stage: 'v1',
    hooks: { followUp: (ctx) => (ctx.foe.weapon.kind === 'claw' && hpPct(ctx.self.bu) >= 0.5 ? { selfGuaranteed: true, foeDenied: true } : undefined) },
  },
  {
    id: 'b_breaker_fang', name: 'Стопор-клык', desc: 'Против Клыков при HP ≥ 50 %: гарантированная двойная, враг без двойной.', slot: 'b', tier: 2, spCost: 200, stage: 'v1',
    hooks: { followUp: (ctx) => (ctx.foe.weapon.kind === 'fang' && hpPct(ctx.self.bu) >= 0.5 ? { selfGuaranteed: true, foeDenied: true } : undefined) },
  },
  {
    id: 'b_breaker_stick', name: 'Стопор-палка', desc: 'Против Палок при HP ≥ 50 %: гарантированная двойная, враг без двойной.', slot: 'b', tier: 2, spCost: 200, stage: 'v1',
    hooks: { followUp: (ctx) => (ctx.foe.weapon.kind === 'stick' && hpPct(ctx.self.bu) >= 0.5 ? { selfGuaranteed: true, foeDenied: true } : undefined) },
  },
  {
    id: 'b_seal_atk', name: 'Метка когтя', desc: 'После боя −7 Atk врагу до его следующего действия.', slot: 'b', tier: 1, spCost: 120, stage: 'mvp',
    hooks: { afterCombat: (ctx, info) => (info.foeDied ? [] : [{ type: 'debuff', unitId: ctx.foe.bu.unitId, stats: { atk: -7 } }]) },
  },
  {
    id: 'b_renewal', name: 'Передышка', desc: 'В начале каждого нечётного хода +10 HP.', slot: 'b', tier: 2, spCost: 200, stage: 'v1',
    hooks: { onTurnStart: (state, self) => (state.turn % 2 === 1 ? [{ type: 'heal', unitId: self.unitId, amount: 10 }] : []) },
  },

  /* ---------- C ---------- */
  {
    id: 'c_hone_atk', name: 'Вой атаки', desc: 'В начале хода +4 Atk соседним союзникам.', slot: 'c', tier: 1, spCost: 120, stage: 'mvp',
    hooks: { onTurnStart: (state, self) => alliesWithin(state, self, 1).map((a): Effect => ({ type: 'buff', unitId: a.unitId, stats: { atk: 4 } })) },
  },
  {
    id: 'c_hone_spd', name: 'Вой скорости', desc: 'В начале хода +4 Spd соседним союзникам.', slot: 'c', tier: 1, spCost: 120, stage: 'v1',
    hooks: { onTurnStart: (state, self) => alliesWithin(state, self, 1).map((a): Effect => ({ type: 'buff', unitId: a.unitId, stats: { spd: 4 } })) },
  },
  {
    id: 'c_hone_def', name: 'Вой защиты', desc: 'В начале хода +4 Def соседним союзникам.', slot: 'c', tier: 1, spCost: 120, stage: 'v1',
    hooks: { onTurnStart: (state, self) => alliesWithin(state, self, 1).map((a): Effect => ({ type: 'buff', unitId: a.unitId, stats: { def: 4 } })) },
  },
  {
    id: 'c_threaten_def', name: 'Угроза защите', desc: 'В начале хода −5 Def врагам в 2 клетках.', slot: 'c', tier: 2, spCost: 200, stage: 'v1',
    hooks: { onTurnStart: (state, self) => foesWithin(state, self, 2).map((f): Effect => ({ type: 'debuff', unitId: f.unitId, stats: { def: -5 } })) },
  },
  {
    id: 'c_threaten_atk', name: 'Угроза атаке', desc: 'В начале хода −5 Atk врагам в 2 клетках.', slot: 'c', tier: 2, spCost: 200, stage: 'v1',
    hooks: { onTurnStart: (state, self) => foesWithin(state, self, 2).map((f): Effect => ({ type: 'debuff', unitId: f.unitId, stats: { atk: -5 } })) },
  },
  { id: 'c_spur_atk', name: 'Шерсть к шерсти', desc: 'Соседние союзники получают +3 Atk в бою.', slot: 'c', tier: 1, spCost: 120, stage: 'mvp', hooks: { allyCombatStatMod: { range: 1, stats: { atk: 3 } } } },
  { id: 'c_drive_spd', name: 'Стая', desc: 'Союзники в 2 клетках получают +3 Spd в бою.', slot: 'c', tier: 2, spCost: 200, stage: 'v1', hooks: { allyCombatStatMod: { range: 2, stats: { spd: 3 } } } },
  {
    id: 'c_savage_blow', name: 'Запах крови', desc: 'При инициативе после боя 7 урона врагам в 2 клетках от цели.', slot: 'c', tier: 2, spCost: 200, stage: 'v1',
    hooks: {
      afterCombat: (ctx) =>
        ctx.self.isInitiator
          ? unitsWithinOf(ctx.state, ctx.foe.bu.pos, 2, ctx.foe.bu.side, ctx.foe.bu.unitId).map((f): Effect => ({ type: 'damage', unitId: f.unitId, amount: 7 }))
          : [],
    },
  },
  {
    id: 'c_breath_of_life', name: 'Дыхание стаи', desc: 'При инициативе после боя +7 HP соседним союзникам.', slot: 'c', tier: 2, spCost: 200, stage: 'v1',
    hooks: {
      afterCombat: (ctx) =>
        ctx.self.isInitiator ? alliesWithin(ctx.state, ctx.self.bu, 1).map((a): Effect => ({ type: 'heal', unitId: a.unitId, amount: 7 })) : [],
    },
  },
];

const MAP = new Map(PASSIVES.map((s) => [s.id, s]));
export function passiveDef(id: string): PassiveDef {
  const s = MAP.get(id);
  if (!s) throw new Error(`unknown passive ${id}`);
  return s;
}
