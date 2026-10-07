import type {
  BattleState,
  BattleUnit,
  Color,
  Effect,
  Gender,
  MoveType,
  Species,
  Stat,
  Stats,
  UnitInstance,
  WeaponKind,
} from '../types';

export type WeaponVariant = 'basic' | 'brave' | 'killer' | 'armorslayer' | 'cavslayer';

export interface WeaponDef {
  id: string;
  name: string;
  kind: WeaponKind;
  color: Color;
  range: 1 | 2;
  mt: number;
  variant: WeaponVariant;
  /** Бьёт по Res, а не по Def. */
  magical: boolean;
  isStaff: boolean;
  effectiveAgainst?: MoveType[];
  spdMod?: number;
  /** Изменение стартового/максимального кулдауна спецприёма. */
  cdMod?: number;
  /** Штрафы цели (и врагам рядом) после боя — Репейник. */
  debuffAfterCombat?: Partial<Stats>;
  spCost: number;
  desc: string;
}

export type StatTemplateId =
  | 'inf_melee'
  | 'inf_magic'
  | 'inf_ranged'
  | 'inf_staff'
  | 'inf_purr'
  | 'armor_melee'
  | 'cav_melee'
  | 'cav_magic'
  | 'cav_staff'
  | 'flier_melee'
  | 'flier_ranged';

export interface ClassDef {
  id: string;
  moveType: MoveType;
  weaponKind: WeaponKind;
  name: Record<Gender, string>;
  template: StatTemplateId;
  /** Относительный вес при генерации. */
  weight: number;
  /** Максимум таких классов в ростере/отряде врагов. */
  maxPerGroup?: number;
}

/* ---------- Контекст боя для хуков ---------- */

export interface CombatUnitView {
  bu: BattleUnit;
  unit: UnitInstance;
  /** Итоговые боевые статы (с бонусами/штрафами/боевыми модификаторами). */
  stats: Stats;
  weapon: WeaponDef;
  cls: ClassDef;
  hpStart: number;
  isInitiator: boolean;
}

export interface CombatCtx {
  state: BattleState;
  self: CombatUnitView;
  foe: CombatUnitView;
}

export interface StrikeInfo {
  isFirstStrike: boolean;
  isCounter: boolean;
  range: number;
}

export interface FollowUpRule {
  selfGuaranteed?: boolean;
  foeDenied?: boolean;
}

export interface AfterCombatInfo {
  selfHpAfter: number;
  foeHpAfter: number;
  selfStruck: boolean;
  foeStruck: boolean;
  foeDied: boolean;
}

/** Хуки навыка/черты/оружия. Все необязательны. */
export interface SkillHooks {
  statBonus?: Partial<Stats>;
  combatStatMod?: (ctx: CombatCtx) => Partial<Stats> | undefined;
  allyCombatStatMod?: { range: number; stats: Partial<Stats> };
  onTurnStart?: (state: BattleState, self: BattleUnit) => Effect[];
  afterCombat?: (ctx: CombatCtx, info: AfterCombatInfo) => Effect[];
  counterAnyRange?: boolean;
  followUp?: (ctx: CombatCtx) => FollowUpRule | undefined;
  desperation?: (ctx: CombatCtx) => boolean;
  vantage?: (ctx: CombatCtx) => boolean;
  damageReduction?: (ctx: CombatCtx, strike: StrikeInfo) => number;
  flatDamage?: (ctx: CombatCtx, strike: StrikeInfo) => number;
  damageMultiplier?: (ctx: CombatCtx) => number;
  passThrough?: boolean;
  ignoreForestSlow?: boolean;
  moveBonus?: number;
  cdMod?: number;
  wrathfulStaff?: boolean;
  /** Пережить смертельный удар с 1 HP (возвращает true, если сработало; может менять флаги). */
  survive?: (ctx: CombatCtx) => boolean;
  xpMultiplier?: number;
  treatsMultiplier?: number;
  onAllyDeath?: (state: BattleState, self: BattleUnit, dead: BattleUnit, killer?: BattleUnit) => Effect[];
}

export type Stage = 'mvp' | 'v1' | 'v1.1';

export interface SpecialDef {
  id: string;
  name: string;
  desc: string;
  cd: number;
  kind: 'offense' | 'defense' | 'heal';
  spCost: number;
  stage: Stage;
  onlySpecies?: Species;
  /** Только для Бинта. */
  staffOnly?: boolean;
  offense?: {
    ignoreDefPct?: number;
    damagePctOfStat?: { stat: Stat; pct: number; of: 'self' | 'foe' };
    damageBonusPct?: number;
    healPctOfDamage?: number;
  };
  defense?: {
    reduction: number;
    vsRange: 'melee' | 'ranged' | 'any';
    healPctOfDamage?: number;
  };
  miracle?: boolean;
  heal?: {
    bonusHeal?: number;
    allAlliesHeal?: number;
  };
}

export type AssistKind =
  | 'rally'
  | 'swap'
  | 'reposition'
  | 'drawBack'
  | 'pivot'
  | 'shove'
  | 'smite'
  | 'heal'
  | 'refresh'
  | 'sacrifice'
  | 'reciprocal';

export interface AssistDef {
  id: string;
  name: string;
  desc: string;
  kind: AssistKind;
  spCost: number;
  stage: Stage;
  stats?: Partial<Stats>;
  heal?: number;
  staffOnly?: boolean;
  purrOnly?: boolean;
}

export interface PassiveDef {
  id: string;
  name: string;
  desc: string;
  slot: 'a' | 'b' | 'c';
  tier: 1 | 2 | 3;
  spCost: number;
  stage: Stage;
  hooks: SkillHooks;
  /** Ограничения по классам. */
  allow?: { moveTypes?: MoveType[]; weaponKinds?: WeaponKind[]; notWeaponKinds?: WeaponKind[] };
}

export interface TraitDef {
  id: string;
  name: string;
  desc: string;
  hooks: SkillHooks;
  onlySpecies?: Species;
  rare?: boolean;
  /** Не выдавать Мурлыкам / только не Мурлыкам и т. п. */
  notWeaponKinds?: WeaponKind[];
}
