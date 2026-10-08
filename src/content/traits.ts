import type { TraitDef } from '@core/skills/types';
import { alliesWithin, foesWithin, hpPct, neighbors, terrainAt } from '@core/battle/query';
import type { Effect } from '@core/types';

export const TRAITS: readonly TraitDef[] = [
  {
    id: 't_box_lover', name: 'Коробкофил', desc: '+3 Def/Res, стоя на Укрытии.',
    hooks: { combatStatMod: (ctx) => (terrainAt(ctx.state, ctx.self.bu.pos) === 'cover' ? { def: 3, res: 3 } : undefined) },
  },
  {
    id: 't_pigeon_hunter', name: 'Охотник на голубей', desc: '×1.3 урона по летунам.',
    hooks: { damageMultiplier: (ctx) => (ctx.foe.cls.moveType === 'flier' ? 1.3 : 1) },
  },
  { id: 't_berserk', name: 'Берсерк', desc: '+4 Atk при HP < 50 %.', hooks: { combatStatMod: (ctx) => (hpPct(ctx.self.bu) < 0.5 ? { atk: 4 } : undefined) } },
  {
    id: 't_coward', name: 'Трус', desc: '−2 Atk всегда, +4 Spd при HP < 50 %.',
    hooks: { statBonus: { atk: -2 }, combatStatMod: (ctx) => (hpPct(ctx.self.bu) < 0.5 ? { spd: 4 } : undefined) },
  },
  {
    id: 't_hydrophobe', name: 'Боязнь воды', desc: '−2 ко всем статам рядом с водой.',
    hooks: {
      combatStatMod: (ctx) =>
        neighbors(ctx.self.bu.pos).some((p) => terrainAt(ctx.state, p) === 'water') ? { atk: -2, spd: -2, def: -2, res: -2 } : undefined,
    },
  },
  {
    id: 't_spare_life', name: 'Запасная жизнь', desc: 'Раз за бой переживает смертельный удар с 1 HP. Только коты.', onlySpecies: 'cat', rare: true,
    hooks: {
      survive: (ctx) => {
        if ((ctx.self.bu.flags['spare_life_used'] ?? 0) > 0) return false;
        ctx.self.bu.flags['spare_life_used'] = 1;
        return true;
      },
    },
  },
  {
    id: 't_loyal', name: 'Верный пёс', desc: '+3 ко всем статам, если соседний союзник ранен. Только псы.', onlySpecies: 'dog',
    hooks: {
      combatStatMod: (ctx) =>
        alliesWithin(ctx.state, ctx.self.bu, 1).some((a) => a.hp < a.maxHp) ? { atk: 3, spd: 3, def: 3, res: 3 } : undefined,
    },
  },
  { id: 't_nocturnal', name: 'Ночной', desc: '+2 Spd в Подвале.', hooks: { combatStatMod: (ctx) => (ctx.state.map.biomeId === 'basement' ? { spd: 2 } : undefined) } },
  { id: 't_glutton', name: 'Прожорливый', desc: '+10 % Вкусняшек с боя.', hooks: { treatsMultiplier: 1.1 } },
  { id: 't_lazy', name: 'Ленивый', desc: '−1 движение, +4 Def.', hooks: { moveBonus: -1, statBonus: { def: 4 } } },
  {
    id: 't_loud', name: 'Громкий', desc: 'В начале хода −3 Atk соседним врагам.',
    hooks: { onTurnStart: (state, self) => foesWithin(state, self, 1).map((f): Effect => ({ type: 'debuff', unitId: f.unitId, stats: { atk: -3 } })) },
  },
  { id: 't_mumbler', name: 'Мямля', desc: '+2 Res.', notWeaponKinds: ['purr'], hooks: { statBonus: { res: 2 } } },
  { id: 't_biter', name: 'Кусачий', desc: 'Первый удар в бою +3 урона.', hooks: { flatDamage: (_ctx, s) => (s.isFirstStrike ? 3 : 0) } },
  {
    id: 't_vengeful', name: 'Злопамятный', desc: '+5 Atk против убийцы союзника до конца боя.',
    hooks: {
      onAllyDeath: (_state, self, _dead, killer) => (killer ? [{ type: 'flag', unitId: self.unitId, key: `vengeance:${killer.unitId}`, value: 1 }] : []),
      combatStatMod: (ctx) => ((ctx.self.bu.flags[`vengeance:${ctx.foe.bu.unitId}`] ?? 0) > 0 ? { atk: 5 } : undefined),
    },
  },
  { id: 't_homebody', name: 'Домашний', desc: '−2 Atk, +3 HP, +20 % XP.', hooks: { statBonus: { atk: -2, hp: 3 }, xpMultiplier: 1.2 } },
  { id: 't_stray', name: 'Бродяга', desc: 'Заросли не замедляют.', hooks: { ignoreForestSlow: true } },
  { id: 't_tiny', name: 'Мелкий', desc: '+2 Spd, −1 Def. Только мыши.', onlySpecies: 'mouse', hooks: { statBonus: { spd: 2, def: -1 } } },
  { id: 't_cheese', name: 'Сырный нюх', desc: '+15 % Вкусняшек с боя. Только мыши.', onlySpecies: 'mouse', hooks: { treatsMultiplier: 1.15 } },
];

const MAP = new Map(TRAITS.map((t) => [t.id, t]));
export function traitDef(id: string): TraitDef {
  const t = MAP.get(id);
  if (!t) throw new Error(`unknown trait ${id}`);
  return t;
}
