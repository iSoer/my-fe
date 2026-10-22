import type { TraitDef } from "@game/core/skills/types"
import { alliesWithin, foesWithin, hpPct, neighbors, terrainAt } from "@game/core/battle/query"
import type { Effect } from "@game/core/types"
import { tr } from "@game/i18n"

export const TRAITS: readonly TraitDef[] = [
  {
    id: "t_box_lover",
    get name() { return tr("Box Lover", "Коробкофил") },
    get desc() { return tr("+3 Def/Res while standing on Cover.", "+3 Def/Res, стоя на Укрытии.") },
    hooks: {
      combatStatMod: ctx => (terrainAt(ctx.state, ctx.self.bu.pos) === "cover" ? { def: 3, res: 3 } : undefined)
    }
  },
  {
    id: "t_pigeon_hunter",
    get name() { return tr("Pigeon Hunter", "Охотник на голубей") },
    get desc() { return tr("×1.3 damage vs flier.", "×1.3 урона по flier.") },
    hooks: { damageMultiplier: ctx => (ctx.foe.cls.moveType === "flier" ? 1.3 : 1) }
  },
  {
    id: "t_berserk",
    get name() { return tr("Berserker", "Берсерк") },
    get desc() { return tr("+4 Str/Mag when HP < 50%.", "+4 Str/Mag при HP < 50 %.") },
    hooks: { combatStatMod: ctx => (hpPct(ctx.self.bu) < 0.5 ? { atk: 4 } : undefined) }
  },
  {
    id: "t_coward",
    get name() { return tr("Coward", "Трус") },
    get desc() { return tr("−2 Str/Mag always, +4 Spd when HP < 50%.", "−2 Str/Mag всегда, +4 Spd при HP < 50 %.") },
    get pros() { return [tr("+4 Spd when HP < 50%", "+4 Spd при HP < 50 %")] },
    get cons() { return [tr("−2 Str/Mag always", "−2 Str/Mag всегда")] },
    hooks: { statBonus: { atk: -2 }, combatStatMod: ctx => (hpPct(ctx.self.bu) < 0.5 ? { spd: 4 } : undefined) }
  },
  {
    id: "t_hydrophobe",
    get name() { return tr("Hydrophobe", "Боязнь воды") },
    get desc() { return tr("−2 to all stats next to water.", "−2 ко всем статам рядом с водой.") },
    pros: [],
    get cons() { return [tr("−2 to all stats next to water", "−2 ко всем статам рядом с водой")] },
    hooks: {
      combatStatMod: ctx =>
        neighbors(ctx.self.bu.pos).some(p => terrainAt(ctx.state, p) === "water")
          ? { atk: -2, spd: -2, def: -2, res: -2 }
          : undefined
    }
  },
  {
    id: "t_spare_life",
    get name() { return tr("Spare Life", "Запасная жизнь") },
    get desc() { return tr("Once per battle, survives a lethal hit with 1 HP. Cats only.", "Раз за бой переживает смертельный удар с 1 HP. Только коты.") },
    onlySpecies: "cat",
    rare: true,
    hooks: {
      survive: (ctx) => {
        if ((ctx.self.bu.flags["spare_life_used"] ?? 0) > 0) return false
        ctx.self.bu.flags["spare_life_used"] = 1
        return true
      }
    }
  },
  {
    id: "t_loyal",
    get name() { return tr("Loyal Hound", "Верный пёс") },
    get desc() { return tr("+3 to all stats if an adjacent ally is wounded. Dogs only.", "+3 ко всем статам, если соседний союзник ранен. Только псы.") },
    onlySpecies: "dog",
    hooks: {
      combatStatMod: ctx =>
        alliesWithin(ctx.state, ctx.self.bu, 1).some(a => a.hp < a.maxHp)
          ? { atk: 3, spd: 3, def: 3, res: 3 }
          : undefined
    }
  },
  {
    id: "t_nocturnal",
    get name() { return tr("Night Owl", "Ночной") },
    get desc() { return tr("+2 Spd in the Basement.", "+2 Spd в Подвале.") },
    hooks: { combatStatMod: ctx => (ctx.state.map.biomeId === "basement" ? { spd: 2 } : undefined) }
  },
  { id: "t_glutton", get name() { return tr("Glutton", "Прожорливый") }, get desc() { return tr("+10% Treats from battles.", "+10 % Вкусняшек с боя.") }, hooks: { treatsMultiplier: 1.1 } },
  {
    id: "t_lazy",
    get name() { return tr("Lazy", "Ленивый") },
    get desc() { return tr("−1 move, +4 Def.", "−1 движение, +4 Def.") },
    pros: ["+4 Def"],
    get cons() { return [tr("−1 move (tile per turn)", "−1 к ходу (клетка за ход)")] },
    hooks: { moveBonus: -1, statBonus: { def: 4 } }
  },
  {
    id: "t_loud",
    get name() { return tr("Loud", "Громкий") },
    get desc() { return tr("At turn start, −3 Str/Mag to adjacent foes.", "В начале хода −3 Str/Mag соседним врагам.") },
    hooks: {
      onTurnStart: (state, self) =>
        foesWithin(state, self, 1).map((f): Effect => ({ type: "debuff", unitId: f.unitId, stats: { atk: -3 } }))
    }
  },
  { id: "t_mumbler", get name() { return tr("Mumbler", "Мямля") }, desc: "+2 Res.", hooks: { statBonus: { res: 2 } } },
  {
    id: "t_biter",
    get name() { return tr("Bitey", "Кусачий") },
    get desc() { return tr("+3 damage on the first strike in combat.", "Первый удар в бою +3 урона.") },
    hooks: { flatDamage: (_ctx, s) => (s.isFirstStrike ? 3 : 0) }
  },
  {
    id: "t_vengeful",
    get name() { return tr("Vengeful", "Злопамятный") },
    get desc() { return tr("+5 Str/Mag vs an ally's killer for the rest of the battle.", "+5 Str/Mag против убийцы союзника до конца боя.") },
    hooks: {
      onAllyDeath: (_state, self, _dead, killer) =>
        killer ? [{ type: "flag", unitId: self.unitId, key: `vengeance:${killer.unitId}`, value: 1 }] : [],
      combatStatMod: ctx => ((ctx.self.bu.flags[`vengeance:${ctx.foe.bu.unitId}`] ?? 0) > 0 ? { atk: 5 } : undefined)
    }
  },
  {
    id: "t_homebody",
    get name() { return tr("Homebody", "Домашний") },
    get desc() { return tr("−2 Str/Mag, +3 HP, +20% XP.", "−2 Str/Mag, +3 HP, +20 % XP.") },
    pros: ["+3 HP", "+20% XP"],
    cons: ["−2 Str/Mag"],
    hooks: { statBonus: { atk: -2, hp: 3 }, xpMultiplier: 1.2 }
  },
  { id: "t_stray", get name() { return tr("Stray", "Бродяга") }, get desc() { return tr("Not slowed by Thicket.", "Заросли не замедляют.") }, hooks: { ignoreForestSlow: true } },
  {
    id: "t_tiny",
    get name() { return tr("Tiny", "Мелкий") },
    get desc() { return tr("+2 Spd, −1 Def. Mice only.", "+2 Spd, −1 Def. Только мыши.") },
    pros: ["+2 Spd"],
    cons: ["−1 Def"],
    onlySpecies: "mouse",
    hooks: { statBonus: { spd: 2, def: -1 } }
  },
  {
    id: "t_cheese",
    get name() { return tr("Cheese Nose", "Сырный нюх") },
    get desc() { return tr("+15% Treats from battles. Mice only.", "+15 % Вкусняшек с боя. Только мыши.") },
    onlySpecies: "mouse",
    hooks: { treatsMultiplier: 1.15 }
  }
]

const MAP = new Map(TRAITS.map(t => [t.id, t]))
export function traitDef(id: string): TraitDef {
  const t = MAP.get(id)
  if (!t) throw new Error(`unknown trait ${id}`)
  return t
}

/** Плюсы и минусы особенности для интерфейса: без явных списков вся особенность — один плюс (`desc`). */
export function traitEffects(t: TraitDef): { pros: string[], cons: string[] } {
  return { pros: t.pros ?? [t.desc], cons: t.cons ?? [] }
}
