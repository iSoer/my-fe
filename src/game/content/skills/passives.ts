import type { PassiveDef } from "@game/core/skills/types"
import { alliesWithin, foesWithin, hpPct, unitsWithinOf } from "@game/core/battle/query"
import type { Effect, WeaponSkill } from "@game/core/types"
import { bothAttacks } from "@game/core/types"
import { SKILL_LABELS, WEAPON_SKILLS } from "@shared/character/skills"
import { weaponRange } from "../weapons"
import { tr } from "@game/i18n"

// Оружейные навыки модели по дальности: ближний бой и дальний
const MELEE: WeaponSkill[] = WEAPON_SKILLS.filter(w => weaponRange(w) === 1)
const RANGED: WeaponSkill[] = WEAPON_SKILLS.filter(w => weaponRange(w) === 2)

/** «Swordbreaker» и т. п.: против оружия `skill` гарантированная двойная, у врага двойной нет. */
function breaker(skill: WeaponSkill): PassiveDef {
  const label = SKILL_LABELS[skill]
  return {
    id: `b_breaker_${skill}`,
    name: `${label}breaker`,
    get desc() {
      return tr(
        `Vs ${label} at HP ≥ 50%: guaranteed follow-up, foe can't follow up.`,
        `Против ${label} при HP ≥ 50 %: гарантированная двойная, враг без двойной.`
      )
    },
    slot: "b",
    tier: 2,
    spCost: 200,
    stage: "v1",
    hooks: {
      followUp: ctx =>
        ctx.foe.weapon.kind === skill && hpPct(ctx.self.bu) >= 0.5 ? { selfGuaranteed: true, foeDenied: true } : undefined
    }
  }
}

export const PASSIVES: readonly PassiveDef[] = [
  /* ---------- A ---------- */
  {
    id: "a_atk3",
    get name() { return tr("Sharp Claw", "Острый коготь") },
    desc: "+3 Str/Mag.",
    slot: "a",
    tier: 1,
    spCost: 120,
    stage: "mvp",
    hooks: { statBonus: { ...bothAttacks(3) } }
  },
  {
    id: "a_spd3",
    get name() { return tr("Quick Paws", "Быстрые лапы") },
    desc: "+3 Spd.",
    slot: "a",
    tier: 1,
    spCost: 120,
    stage: "mvp",
    hooks: { statBonus: { spd: 3 } }
  },
  {
    id: "a_def3",
    get name() { return tr("Tough Hide", "Крепкая шкура") },
    desc: "+3 Def.",
    slot: "a",
    tier: 1,
    spCost: 120,
    stage: "mvp",
    hooks: { statBonus: { def: 3 } }
  },
  {
    id: "a_res3",
    get name() { return tr("Thick Fur", "Толстый мех") },
    desc: "+3 Res.",
    slot: "a",
    tier: 1,
    spCost: 120,
    stage: "mvp",
    hooks: { statBonus: { res: 3 } }
  },
  {
    id: "a_hp5",
    get name() { return tr("Chonk", "Жирок") },
    desc: "+5 HP.",
    slot: "a",
    tier: 1,
    spCost: 120,
    stage: "mvp",
    hooks: { statBonus: { hp: 5 } }
  },
  {
    id: "a_fury",
    get name() { return tr("Fury", "Ярость") },
    get desc() { return tr("+3 to all stats. −6 HP after combat.", "+3 ко всем статам. После боя −6 HP.") },
    slot: "a",
    tier: 2,
    spCost: 200,
    stage: "v1",
    hooks: {
      statBonus: { ...bothAttacks(3), spd: 3, def: 3, res: 3 },
      afterCombat: ctx => [{ type: "damage", unitId: ctx.self.bu.unitId, amount: 6 }]
    }
  },
  {
    id: "a_death_blow",
    get name() { return tr("Vicious Pounce", "Злобный бросок") },
    get desc() { return tr("+6 Str/Mag when initiating.", "+6 Str/Mag при инициативе.") },
    slot: "a",
    tier: 2,
    spCost: 200,
    stage: "mvp",
    hooks: { combatStatMod: ctx => (ctx.self.isInitiator ? { ...bothAttacks(6) } : undefined) }
  },
  {
    id: "a_life_death",
    get name() { return tr("Life and Death", "Жизнь и смерть") },
    desc: "+5 Str/Mag/Spd, −5 Def/Res.",
    slot: "a",
    tier: 2,
    spCost: 200,
    stage: "v1",
    hooks: { statBonus: { ...bothAttacks(5), spd: 5, def: -5, res: -5 } }
  },
  {
    id: "a_close_counter",
    get name() { return tr("Close Counter", "Ближний контрудар") },
    get desc() { return tr("Counterattacks foes at any range.", "Контратакует врагов на любой дистанции.") },
    slot: "a",
    tier: 3,
    spCost: 300,
    stage: "v1",
    hooks: { counterAnyRange: true },
    allow: { weaponSkills: RANGED }
  },
  {
    id: "a_distant_counter",
    get name() { return tr("Distant Counter", "Дальний контрудар") },
    get desc() { return tr("Counterattacks foes at any range.", "Контратакует врагов на любой дистанции.") },
    slot: "a",
    tier: 3,
    spCost: 300,
    stage: "v1",
    hooks: { counterAnyRange: true },
    allow: { weaponSkills: MELEE }
  },

  /* ---------- B ---------- */
  {
    id: "b_desperation",
    get name() { return tr("Desperation", "Отчаяние") },
    get desc() { return tr("When initiating at HP ≤ 75%, the follow-up attack lands right after the first.", "При HP ≤ 75 % и инициативе двойная атака идёт сразу за первой.") },
    slot: "b",
    tier: 2,
    spCost: 200,
    stage: "v1",
    hooks: { desperation: ctx => ctx.self.isInitiator && hpPct(ctx.self.bu) <= 0.75 }
  },
  {
    id: "b_vantage",
    get name() { return tr("Strike First", "Первым бью") },
    get desc() { return tr("At HP ≤ 75%, counterattacks before the foe strikes.", "При HP ≤ 75 % контратакует до удара врага.") },
    slot: "b",
    tier: 2,
    spCost: 200,
    stage: "v1",
    hooks: { vantage: ctx => !ctx.self.isInitiator && hpPct(ctx.self.bu) <= 0.75 }
  },
  {
    id: "b_quick_riposte",
    get name() { return tr("Payback", "Ответка") },
    get desc() { return tr("When defending at HP ≥ 70%: guaranteed follow-up attack.", "При HP ≥ 70 % и обороне — гарантированная двойная атака.") },
    slot: "b",
    tier: 2,
    spCost: 200,
    stage: "mvp",
    hooks: {
      followUp: ctx => (!ctx.self.isInitiator && hpPct(ctx.self.bu) >= 0.7 ? { selfGuaranteed: true } : undefined)
    }
  },
  {
    id: "b_pass",
    get name() { return tr("Slip Through", "Проскользнуть") },
    get desc() { return tr("Moves through foes.", "Проходит сквозь врагов.") },
    slot: "b",
    tier: 2,
    spCost: 200,
    stage: "v1",
    hooks: { passThrough: true }
  },
  breaker("sword"),
  breaker("spear"),
  breaker("axe"),
  {
    id: "b_seal_atk",
    get name() { return tr("Claw Mark", "Метка когтя") },
    get desc() { return tr("After combat, the foe gets −7 Str/Mag until its next action.", "После боя −7 Str/Mag врагу до его следующего действия.") },
    slot: "b",
    tier: 1,
    spCost: 120,
    stage: "mvp",
    hooks: {
      afterCombat: (ctx, info) =>
        info.foeDied ? [] : [{ type: "debuff", unitId: ctx.foe.bu.unitId, stats: { ...bothAttacks(-7) } }]
    }
  },
  {
    id: "b_renewal",
    get name() { return tr("Breather", "Передышка") },
    get desc() { return tr("+10 HP at the start of every odd turn.", "В начале каждого нечётного хода +10 HP.") },
    slot: "b",
    tier: 2,
    spCost: 200,
    stage: "v1",
    hooks: {
      onTurnStart: (state, self) => (state.turn % 2 === 1 ? [{ type: "heal", unitId: self.unitId, amount: 10 }] : [])
    }
  },
  // Неуязвимость на время: пару ходов, раз за бой или по расписанию — переживают удар, но бой не затягивают навсегда
  {
    id: "b_iron_hide",
    get name() { return tr("Iron Hide", "Железная шкура") },
    get desc() { return tr("Takes no damage on turns 1–2 of the battle. Armored only.", "В 1-й и 2-й ход боя не получает урона. Только латники.") },
    slot: "b",
    tier: 2,
    spCost: 200,
    stage: "v1",
    allow: { moveTypes: ["armored"] },
    hooks: { damageImmune: ctx => ctx.state.turn <= 2 }
  },
  {
    id: "b_barrier",
    get name() { return tr("Barrier", "Барьер") },
    get desc() { return tr("Once per battle, fully blocks a hit that would deal damage.", "Раз за бой полностью гасит удар, который ранил бы.") },
    slot: "b",
    tier: 2,
    spCost: 200,
    stage: "v1",
    hooks: {
      damageImmune: (ctx, _strike, damage) => {
        if (damage <= 0 || (ctx.self.bu.flags["barrier_used"] ?? 0) > 0) return false
        ctx.self.bu.flags["barrier_used"] = 1
        return true
      }
    }
  },
  {
    id: "b_evasion",
    get name() { return tr("Evasion", "Неуловимость") },
    get desc() { return tr("Takes no damage on every third turn (3, 6, 9…). Infantry and fliers.", "Каждый третий ход (3-й, 6-й, 9-й…) не получает урона. Пехота и летуны.") },
    slot: "b",
    tier: 3,
    spCost: 300,
    stage: "v1",
    allow: { moveTypes: ["infantry", "flier"] },
    hooks: { damageImmune: ctx => ctx.state.turn % 3 === 0 }
  },
  {
    id: "b_stand_firm",
    get name() { return tr("Stand Firm", "Стойкость") },
    get desc() { return tr("When attacked, the foe's first hit deals no damage. Cavalry only.", "Когда атакуют его, первый удар врага не ранит. Только всадники.") },
    slot: "b",
    tier: 3,
    spCost: 300,
    stage: "v1",
    allow: { moveTypes: ["cavalry"] },
    hooks: { damageImmune: (ctx, strike) => !ctx.self.isInitiator && !strike.isCounter && strike.isFirstStrike }
  },
  {
    id: "b_spell_ward",
    get name() { return tr("Spell Ward", "Чародейский щит") },
    get desc() { return tr("On turns 1–3, takes half damage from magic. Magic users only.", "В 1–3-й ход вдвое меньше урона от магии. Только маги и лекари.") },
    slot: "b",
    tier: 1,
    spCost: 120,
    stage: "v1",
    allow: { weaponSkills: ["blackMagic", "whiteMagic"] },
    hooks: { damageReduction: ctx => (ctx.state.turn <= 3 && ctx.foe.weapon.magical ? 0.5 : 0) }
  },

  /* ---------- C ---------- */
  {
    id: "c_hone_atk",
    get name() { return tr("Attack Howl", "Вой атаки") },
    get desc() { return tr("At turn start, adjacent allies get +4 Str/Mag.", "В начале хода +4 Str/Mag соседним союзникам.") },
    slot: "c",
    tier: 1,
    spCost: 120,
    stage: "mvp",
    hooks: {
      onTurnStart: (state, self) =>
        alliesWithin(state, self, 1).map((a): Effect => ({ type: "buff", unitId: a.unitId, stats: { ...bothAttacks(4) } }))
    }
  },
  {
    id: "c_hone_spd",
    get name() { return tr("Speed Howl", "Вой скорости") },
    get desc() { return tr("At turn start, adjacent allies get +4 Spd.", "В начале хода +4 Spd соседним союзникам.") },
    slot: "c",
    tier: 1,
    spCost: 120,
    stage: "v1",
    hooks: {
      onTurnStart: (state, self) =>
        alliesWithin(state, self, 1).map((a): Effect => ({ type: "buff", unitId: a.unitId, stats: { spd: 4 } }))
    }
  },
  {
    id: "c_hone_def",
    get name() { return tr("Defense Howl", "Вой защиты") },
    get desc() { return tr("At turn start, adjacent allies get +4 Def.", "В начале хода +4 Def соседним союзникам.") },
    slot: "c",
    tier: 1,
    spCost: 120,
    stage: "v1",
    hooks: {
      onTurnStart: (state, self) =>
        alliesWithin(state, self, 1).map((a): Effect => ({ type: "buff", unitId: a.unitId, stats: { def: 4 } }))
    }
  },
  {
    id: "c_threaten_def",
    get name() { return tr("Threaten Defense", "Угроза защите") },
    get desc() { return tr("At turn start, foes within 2 tiles get −5 Def.", "В начале хода −5 Def врагам в 2 клетках.") },
    slot: "c",
    tier: 2,
    spCost: 200,
    stage: "v1",
    hooks: {
      onTurnStart: (state, self) =>
        foesWithin(state, self, 2).map((f): Effect => ({ type: "debuff", unitId: f.unitId, stats: { def: -5 } }))
    }
  },
  {
    id: "c_threaten_atk",
    get name() { return tr("Threaten Attack", "Угроза атаке") },
    get desc() { return tr("At turn start, foes within 2 tiles get −5 Str/Mag.", "В начале хода −5 Str/Mag врагам в 2 клетках.") },
    slot: "c",
    tier: 2,
    spCost: 200,
    stage: "v1",
    hooks: {
      onTurnStart: (state, self) =>
        foesWithin(state, self, 2).map((f): Effect => ({ type: "debuff", unitId: f.unitId, stats: { ...bothAttacks(-5) } }))
    }
  },
  {
    id: "c_spur_atk",
    get name() { return tr("Fur to Fur", "Шерсть к шерсти") },
    get desc() { return tr("Adjacent allies get +3 Str/Mag in combat.", "Соседние союзники получают +3 Str/Mag в бою.") },
    slot: "c",
    tier: 1,
    spCost: 120,
    stage: "mvp",
    hooks: { allyCombatStatMod: { range: 1, stats: { ...bothAttacks(3) } } }
  },
  {
    id: "c_drive_spd",
    get name() { return tr("Pack", "Стая") },
    get desc() { return tr("Allies within 2 tiles get +3 Spd in combat.", "Союзники в 2 клетках получают +3 Spd в бою.") },
    slot: "c",
    tier: 2,
    spCost: 200,
    stage: "v1",
    hooks: { allyCombatStatMod: { range: 2, stats: { spd: 3 } } }
  },
  {
    id: "c_savage_blow",
    get name() { return tr("Scent of Blood", "Запах крови") },
    get desc() { return tr("When initiating, after combat deals 7 damage to foes within 2 tiles of the target.", "При инициативе после боя 7 урона врагам в 2 клетках от цели.") },
    slot: "c",
    tier: 2,
    spCost: 200,
    stage: "v1",
    hooks: {
      afterCombat: ctx =>
        ctx.self.isInitiator
          ? unitsWithinOf(ctx.state, ctx.foe.bu.pos, 2, ctx.foe.bu.side, ctx.foe.bu.unitId).map(
              (f): Effect => ({ type: "damage", unitId: f.unitId, amount: 7 })
            )
          : []
    }
  },
  {
    id: "c_breath_of_life",
    get name() { return tr("Breath of the Pack", "Дыхание стаи") },
    get desc() { return tr("When initiating, after combat adjacent allies recover 7 HP.", "При инициативе после боя +7 HP соседним союзникам.") },
    slot: "c",
    tier: 2,
    spCost: 200,
    stage: "v1",
    hooks: {
      afterCombat: ctx =>
        ctx.self.isInitiator
          ? alliesWithin(ctx.state, ctx.self.bu, 1).map((a): Effect => ({ type: "heal", unitId: a.unitId, amount: 7 }))
          : []
    }
  }
]

const MAP = new Map(PASSIVES.map(s => [s.id, s]))
export function passiveDef(id: string): PassiveDef {
  const s = MAP.get(id)
  if (!s) throw new Error(`unknown passive ${id}`)
  return s
}
