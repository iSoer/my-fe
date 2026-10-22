import type { WeaponDef, WeaponVariant } from "@game/core/skills/types"
import type { Color } from "@game/core/types"
import { CHARACTER_STAT_LABELS } from "@shared/character/leveling"
import {
  SKILL_LABELS,
  WEAPON_GRADE_LABELS,
  WEAPON_SKILLS,
  type Rank,
  type WeaponGrade,
  type WeaponSkill
} from "@shared/character/skills"
import { WEAPON_PRICES } from "./balance"

// Оружие игры — предметы под оружейные навыки модели (`WEAPON_SKILLS`), названия — `SKILL_LABELS` и
// `WEAPON_GRADE_LABELS`. Цвет треугольника, дальность, Mt, грейды и разновидности — боевые правила игры поверх модели.
// Навык отвечает за владение: оружием может сражаться любой боец, ранг навыка добавляет Mt, а ниже требуемого
// ранга оружие теряет Mt (`COMBAT.rankShortMt` за каждую ступень).

/** Треугольник FEH: Sword бьёт Axe, Axe бьёт Spear, Spear бьёт Sword; остальное бесцветное. */
export const WEAPON_COLOR: Record<WeaponSkill, Color> = {
  sword: "red",
  spear: "blue",
  axe: "green",
  gauntlet: "colorless",
  bow: "colorless",
  blackMagic: "colorless",
  whiteMagic: "colorless"
}

interface WeaponSpec {
  range: 1 | 2
  mt: number
  /** Бьёт по Res, атака от Mag. */
  magical: boolean
  /** Посох: урон ×0.5, лечит через Поддержку. */
  isStaff: boolean
  variants: readonly WeaponVariant[]
  effectiveAgainst?: WeaponDef["effectiveAgainst"]
  desc: string
}

const MELEE_VARIANTS: readonly WeaponVariant[] = ["basic", "brave", "killer", "armorslayer", "cavslayer"]

const SPECS: Record<WeaponSkill, WeaponSpec> = {
  sword: { range: 1, mt: 6, magical: false, isStaff: false, variants: MELEE_VARIANTS, desc: "Ближний бой, красный." },
  spear: { range: 1, mt: 6, magical: false, isStaff: false, variants: MELEE_VARIANTS, desc: "Ближний бой, синий." },
  axe: { range: 1, mt: 6, magical: false, isStaff: false, variants: MELEE_VARIANTS, desc: "Ближний бой, зелёный." },
  gauntlet: {
    range: 1,
    mt: 5,
    magical: false,
    isStaff: false,
    variants: ["basic", "brave", "killer"],
    desc: "Ближний бой, бесцветный."
  },
  bow: {
    range: 2,
    mt: 5,
    magical: false,
    isStaff: false,
    variants: ["basic", "brave", "killer"],
    effectiveAgainst: ["flier"],
    desc: "Дальний бой, бесцветный. Эффективен против flier."
  },
  blackMagic: {
    range: 2,
    mt: 5,
    magical: true,
    isStaff: false,
    variants: ["basic", "killer"],
    desc: `Магия с 2 клеток: атака от ${CHARACTER_STAT_LABELS.specialAttack}, бьёт по ${CHARACTER_STAT_LABELS.specialDefense}.`
  },
  whiteMagic: {
    range: 2,
    mt: 4,
    magical: true,
    isStaff: true,
    variants: ["basic", "killer"],
    desc: "Лечит через Поддержку. Урон ×0.5."
  }
}

/** Название разновидности: базовое оружие — грейд + навык модели, остальные — с приставкой (они железного грейда). */
const VARIANT_PREFIX: Record<WeaponVariant, string> = {
  basic: "",
  brave: "Brave ",
  killer: "Killer ",
  armorslayer: "Armorslayer ",
  cavslayer: "Horseslayer "
}

/** Грейды базового оружия: id, прибавка к Mt и ранг навыка, с которого им сражаются без штрафа. */
const GRADES: Record<WeaponGrade, { id: string, mt: number, rank: Rank }> = {
  wood: { id: "wood", mt: -2, rank: "E" },
  iron: { id: "basic", mt: 0, rank: "E" },
  steel: { id: "steel", mt: 2, rank: "D" },
  silver: { id: "silver", mt: 4, rank: "B" }
}

/** Требуемый ранг разновидностей (все — железного грейда). */
const VARIANT_RANK: Record<Exclude<WeaponVariant, "basic">, Rank> = {
  brave: "C",
  killer: "D",
  armorslayer: "D",
  cavslayer: "D"
}

const SPD = CHARACTER_STAT_LABELS.speed

function build(): WeaponDef[] {
  const out: WeaponDef[] = []
  for (const skill of WEAPON_SKILLS) {
    const spec = SPECS[skill]
    const base = (variant: WeaponVariant, grade: WeaponGrade, id: string, name: string, rank: Rank): WeaponDef => {
      const w: WeaponDef = {
        id,
        name,
        kind: skill,
        color: WEAPON_COLOR[skill],
        range: spec.range,
        mt: spec.mt,
        variant,
        grade,
        requiredRank: rank,
        price: variant === "basic" ? WEAPON_PRICES.grade[grade] : WEAPON_PRICES.variant[variant],
        magical: spec.magical,
        isStaff: spec.isStaff,
        desc: spec.desc
      }
      if (spec.effectiveAgainst) w.effectiveAgainst = spec.effectiveAgainst
      return w
    }
    for (const grade of Object.keys(GRADES) as WeaponGrade[]) {
      const g = GRADES[grade]
      const w = base("basic", grade, `${skill}_${g.id}`, `${WEAPON_GRADE_LABELS[grade]} ${SKILL_LABELS[skill]}`, g.rank)
      w.mt += g.mt
      if (grade === "wood") w.desc += " Простое оружие новичка."
      out.push(w)
    }
    for (const variant of spec.variants) {
      if (variant === "basic") continue
      const name = `${VARIANT_PREFIX[variant]}${SKILL_LABELS[skill]}`
      const w = base(variant, "iron", `${skill}_${variant}`, name, VARIANT_RANK[variant])
      switch (variant) {
        case "brave":
          w.mt -= 2
          w.spdMod = -5
          w.desc += ` Две атаки подряд при инициативе, −5 ${SPD}.`
          break
        case "killer":
          w.mt -= 1
          w.cdMod = -1
          w.desc += " Кулдаун спецприёма −1."
          break
        case "armorslayer":
          w.effectiveAgainst = ["armored"]
          w.desc += " Эффективно против armored."
          break
        case "cavslayer":
          w.effectiveAgainst = ["cavalry"]
          w.desc += " Эффективно против cavalry."
          break
      }
      out.push(w)
    }
  }
  return out
}

export const WEAPONS: readonly WeaponDef[] = build()
const WEAPON_MAP = new Map(WEAPONS.map(w => [w.id, w]))

export function weaponDef(id: string): WeaponDef {
  const w = WEAPON_MAP.get(id)
  if (!w) throw new Error(`unknown weapon ${id}`)
  return w
}

/** Железное оружие навыка (бывший «базовый» id: сейвы v5 и враги). */
export function basicWeaponId(skill: WeaponSkill): string {
  return `${skill}_basic`
}

/** Простое деревянное оружие: с ним начинает каждый новый боец, оно бесплатно и не хранится в инвентаре. */
export function woodWeaponId(skill: WeaponSkill): string {
  return `${skill}_wood`
}

export function gradeWeaponId(skill: WeaponSkill, grade: WeaponGrade): string {
  return `${skill}_${GRADES[grade].id}`
}

export function isWeaponId(id: string): boolean {
  return WEAPON_MAP.has(id)
}

export function weaponsForSkill(skill: WeaponSkill): WeaponDef[] {
  return WEAPONS.filter(w => w.kind === skill)
}

export function isMagicWeapon(skill: WeaponSkill): boolean {
  return SPECS[skill].magical
}

export function weaponRange(skill: WeaponSkill): 1 | 2 {
  return SPECS[skill].range
}
