import type { ClassTier } from "@shared/character/classes"
import type { Rank, WeaponGrade } from "@shared/character/skills"
import type {
  BattleState,
  BattleUnit,
  Color,
  Effect,
  MoveType,
  Species,
  Stat,
  Stats,
  UnitInstance,
  WeaponSkill
} from "../types"

export type WeaponVariant = "basic" | "brave" | "killer" | "armorslayer" | "cavslayer"

export interface WeaponDef {
  id: string
  name: string
  /** Оружейный навык модели. */
  kind: WeaponSkill
  color: Color
  range: 1 | 2
  mt: number
  variant: WeaponVariant
  grade: WeaponGrade
  /** Ранг навыка, с которого оружием сражаются без штрафа к Mt. */
  requiredRank: Rank
  /** Цена в Лавке (деревянное — 0, не продаётся). */
  price: number
  /** Бьёт по Res, а не по Def. */
  magical: boolean
  isStaff: boolean
  effectiveAgainst?: MoveType[]
  spdMod?: number
  /** Изменение стартового/максимального кулдауна спецприёма. */
  cdMod?: number
  desc: string
}

/** Боевой класс: класс FW из модели и оружейный навык модели, которым боец сражается. */
export interface ClassDef {
  /** id класса FW (`CHARACTER_CLASSES`). */
  id: string
  name: string
  tier: ClassTier
  moveType: MoveType
  weaponSkill: WeaponSkill
}

/* ---------- Контекст боя для хуков ---------- */

export interface CombatUnitView {
  bu: BattleUnit
  unit: UnitInstance
  /** Итоговые боевые статы (с бонусами/штрафами/боевыми модификаторами). */
  stats: Stats
  weapon: WeaponDef
  cls: ClassDef
  hpStart: number
  isInitiator: boolean
}

export interface CombatCtx {
  state: BattleState
  self: CombatUnitView
  foe: CombatUnitView
}

export interface StrikeInfo {
  isFirstStrike: boolean
  isCounter: boolean
  range: number
}

export interface FollowUpRule {
  selfGuaranteed?: boolean
  foeDenied?: boolean
}

export interface AfterCombatInfo {
  selfHpAfter: number
  foeHpAfter: number
  selfStruck: boolean
  foeStruck: boolean
  foeDied: boolean
}

/** Хуки навыка/черты/оружия. Все необязательны. */
export interface SkillHooks {
  statBonus?: Partial<Stats>
  combatStatMod?: (ctx: CombatCtx) => Partial<Stats> | undefined
  allyCombatStatMod?: { range: number, stats: Partial<Stats> }
  onTurnStart?: (state: BattleState, self: BattleUnit) => Effect[]
  afterCombat?: (ctx: CombatCtx, info: AfterCombatInfo) => Effect[]
  counterAnyRange?: boolean
  followUp?: (ctx: CombatCtx) => FollowUpRule | undefined
  desperation?: (ctx: CombatCtx) => boolean
  vantage?: (ctx: CombatCtx) => boolean
  damageReduction?: (ctx: CombatCtx, strike: StrikeInfo) => number
  flatDamage?: (ctx: CombatCtx, strike: StrikeInfo) => number
  damageMultiplier?: (ctx: CombatCtx) => number
  passThrough?: boolean
  ignoreForestSlow?: boolean
  moveBonus?: number
  cdMod?: number
  wrathfulStaff?: boolean
  /** Пережить смертельный удар с 1 HP (возвращает true, если сработало; может менять флаги). */
  survive?: (ctx: CombatCtx) => boolean
  xpMultiplier?: number
  treatsMultiplier?: number
  /** Оружие врага не эффективно против бойца (талисман). */
  negateEffective?: boolean
  onAllyDeath?: (state: BattleState, self: BattleUnit, dead: BattleUnit, killer?: BattleUnit) => Effect[]
}

export type Stage = "mvp" | "v1" | "v1.1"

export interface SpecialDef {
  id: string
  name: string
  desc: string
  cd: number
  kind: "offense" | "defense" | "heal"
  spCost: number
  stage: Stage
  onlySpecies?: Species
  /** Только для White Magic. */
  staffOnly?: boolean
  offense?: {
    ignoreDefPct?: number
    damagePctOfStat?: { stat: Stat, pct: number, of: "self" | "foe" }
    damageBonusPct?: number
    healPctOfDamage?: number
  }
  defense?: {
    reduction: number
    vsRange: "melee" | "ranged" | "any"
    healPctOfDamage?: number
  }
  miracle?: boolean
  heal?: {
    bonusHeal?: number
    allAlliesHeal?: number
  }
}

export type AssistKind
  = | "rally"
    | "swap"
    | "reposition"
    | "drawBack"
    | "pivot"
    | "shove"
    | "smite"
    | "heal"
    | "refresh"
    | "sacrifice"
    | "reciprocal"

export interface AssistDef {
  id: string
  name: string
  desc: string
  kind: AssistKind
  spCost: number
  stage: Stage
  stats?: Partial<Stats>
  heal?: number
  staffOnly?: boolean
  /** Только для класса Dancer (танец — «освежить» союзника). */
  dancerOnly?: boolean
}

export interface PassiveDef {
  id: string
  name: string
  desc: string
  slot: "a" | "b" | "c"
  tier: 1 | 2 | 3
  spCost: number
  stage: Stage
  hooks: SkillHooks
  /** Ограничения по классам. */
  allow?: { moveTypes?: MoveType[], weaponSkills?: WeaponSkill[] }
}

export interface TraitDef {
  id: string
  name: string
  desc: string
  hooks: SkillHooks
  onlySpecies?: Species
  rare?: boolean
}

/** Расходник Лавки: используется в бою командой «Предмет» на себя или соседнего союзника. */
export interface ConsumableDef {
  id: string
  name: string
  icon: string
  desc: string
  price: number
  /** Лечение: фиксированное и/или доля maxHp (берётся большее). */
  heal?: number
  healPct?: number
  /** Снимает штрафы (`penalties`). */
  cleanse?: boolean
  /** Действует на применившего и всех союзников в радиусе (цель — сам боец). */
  area?: number
  /** В ассортименте с уровня ростера / Славы. */
  minRosterLevel?: number
  minGlory?: number
}

/** Талисман: аксессуар в единственном слоте бойца, пассивные свойства — хуки навыков (попадают в прогноз боя). */
export interface TalismanDef {
  id: string
  name: string
  icon: string
  desc: string
  price: number
  hooks: SkillHooks
  minRosterLevel?: number
  minGlory?: number
}
