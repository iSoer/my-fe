import type { ClassDef } from "@game/core/skills/types"
import type { MoveType, WeaponSkill } from "@game/core/types"
import {
  CHARACTER_CLASSES,
  MOUNT_LABELS,
  MOVEMENT_LABELS,
  TIER_LABELS,
  TIER_LEVELS,
  classBonusOf,
  classById,
  isUniqueClass,
  mountOf,
  movementOf,
  weaponsOf,
  type CharacterClass
} from "@shared/character/classes"
import { CHARACTER_STAT_LABELS } from "@shared/character/leveling"
import { SKILL_LABELS, type Rank, type Skill } from "@shared/character/skills"
import type { Stat as ModelStat } from "@shared/api/schema/pokemon/generated"
import { isMagicWeapon, weaponRange } from "./weapons"
import { MODEL_SCALE } from "./balance"
import { tr } from "@game/i18n"

// Классы, их тип движения и оружие — модель персонажа (`src/shared/character/classes.ts`); здесь только поиск
// и боевой класс для ядра. Названия — `CharacterClass.name`, ярусы — `TIER_LABELS`, навыки — `SKILL_LABELS`.

/** Клеток хода по типу движения модели (правило игры, как в FEH). */
export const MOVE_RANGE: Record<MoveType, number> = { infantry: 3, armored: 2, cavalry: 4, flier: 3 }

/** Класс Dancer: танцует (Поддержка «освежить» союзника) вместо обычной Поддержки. */
export const DANCER_CLASS = "dancer"

export function fwClass(classId: string): CharacterClass {
  const c = classById(classId)
  if (!c) throw new Error(`unknown class ${classId}`)
  return c
}

/** Оружейные навыки, которыми сражается класс (`weaponsOf`; базовые классы — любым). */
export function classWeapons(classId: string): readonly WeaponSkill[] {
  return weaponsOf(fwClass(classId))
}

export function classMoveType(classId: string): MoveType {
  return movementOf(fwClass(classId))
}

/** Как модель показывает передвижение класса: животное (`MOUNT_LABELS`), иначе тип движения (`MOVEMENT_LABELS`). */
export function movementLabel(classId: string): string {
  const fw = fwClass(classId)
  const mount = mountOf(fw)
  return mount ? MOUNT_LABELS[mount] : MOVEMENT_LABELS[movementOf(fw)]
}

const CLASS_CACHE = new Map<string, ClassDef>()

/** Боевой класс: класс модели + оружейный навык, которым боец сражается. */
export function classDef(classId: string, weaponSkill: WeaponSkill): ClassDef {
  const key = `${classId}:${weaponSkill}`
  let c = CLASS_CACHE.get(key)
  if (!c) {
    const fw = fwClass(classId)
    c = { id: classId, name: fw.name, tier: fw.tier, moveType: movementOf(fw), weaponSkill }
    CLASS_CACHE.set(key, c)
  }
  return c
}

export function unitClass(unit: { classId: string, weaponSkill: WeaponSkill }): ClassDef {
  return classDef(unit.classId, unit.weaponSkill)
}

export function className(cls: ClassDef): string {
  return cls.name
}

export function tierLevel(classId: string): number {
  return TIER_LEVELS[fwClass(classId).tier]
}

export const CLASS_IDS: readonly string[] = CHARACTER_CLASSES.map(c => c.id)

export function isRangedWeapon(skill: WeaponSkill): boolean {
  return weaponRange(skill) === 2
}

export { isMagicWeapon }

/* ---------- Что делает класс: пояснение для интерфейса ---------- */

/** Правила передвижения (как в `moveCost` и `content/weapons.ts`): дальность, местность, чем уязвим. */
const MOVE_NOTES: Record<MoveType, string> = {
  get infantry() {
    return tr("forest costs 2 move points; water and mountains are impassable", "лес отнимает 2 очка хода, вода и горы непроходимы")
  },
  get armored() {
    return tr("slow, but forest doesn't slow it down; Armorslayer hits ×1.5", "медленный, зато лес не замедляет; Armorslayer бьёт ×1.5")
  },
  get cavalry() {
    return tr("fast, but can't enter forest; Horseslayer hits ×1.5", "быстрый, но в лес не заходит; Horseslayer бьёт ×1.5")
  },
  get flier() {
    return tr("flies over water, mountains and forest; Bow hits ×1.5", "перелетает воду, горы и лес; Bow бьёт ×1.5")
  }
}

export interface ClassRole {
  icon: string
  /** Роль в бою на текущем языке — пояснение, не название класса. */
  role: string
  /** Чем класс полезен в бою, 1–2 фразы. */
  summary: string
}

export interface ClassInfo extends ClassRole {
  tierLabel: string
  tierLevel: number
  moveType: MoveType
  moveLabel: string
  moveRange: number
  moveNote: string
  /** Бонус класса к статам в боевой шкале (подписи модели: HP, Str, Mag, Spd, Def, Res), без нулей. */
  bonus: { label: string, value: number }[]
  weapons: readonly WeaponSkill[]
  /** Требования к рангам: «Sword C», «Axe C или Sword C». */
  requires: string[]
  unique: boolean
}

const MODEL_STAT_ORDER: readonly ModelStat[] = ["hp", "attack", "specialAttack", "speed", "defense", "specialDefense"]

/** Бонус класса, переведённый из шкалы модели в боевые статы (`MODEL_SCALE`), — то, что видно в бою. */
export function classCombatBonus(classId: string): { stat: ModelStat, label: string, value: number }[] {
  const bonus = classBonusOf(fwClass(classId))
  return MODEL_STAT_ORDER.map((stat) => {
    const mul = stat === "hp" ? MODEL_SCALE.hpMul : MODEL_SCALE.statMul
    return { stat, label: CHARACTER_STAT_LABELS[stat], value: Math.round(bonus[stat] * mul) }
  }).filter(b => b.value !== 0)
}

/** Роль класса по оружию, передвижению и бонусу: лекарь, маг, танк, летун, всадник, стрелок, дуэлянт… */
export function classRole(classId: string): ClassRole {
  const fw = fwClass(classId)
  const weapons = weaponsOf(fw)
  const move = movementOf(fw)
  const has = (w: WeaponSkill) => weapons.includes(w)
  const top = [...classCombatBonus(classId)].filter(b => b.stat !== "hp").sort((a, b) => b.value - a.value)[0]?.stat
  if (classId === DANCER_CLASS)
    return { icon: "💃", role: tr("Dancer", "Танцор"), summary: tr("Dances to give an ally who has already acted one more turn.", "Танцем даёт союзнику, который уже ходил, ещё один ход.") }
  if (weapons.every(w => w === "whiteMagic"))
    return { icon: "🩹", role: tr("Healer", "Лекарь"), summary: tr("Heals allies with Assist from 2 tiles; hits weakly itself (damage ×0.5).", "Лечит союзников Поддержкой с 2 клеток, сам бьёт слабо (урон ×0.5).") }
  if (weapons.every(w => isMagicWeapon(w)))
    return has("whiteMagic")
      ? { icon: "🔮", role: tr("Mage-Healer", "Маг-целитель"), summary: tr("Magic from 2 tiles against Res; with White Magic it heals too.", "Магия с 2 клеток по Res; с White Magic ещё и лечит.") }
      : { icon: "✨", role: tr("Mage", "Маг"), summary: tr("Hits with magic from 2 tiles against Res — great vs armored foes.", "Бьёт магией с 2 клеток по Res — хорош против латников.") }
  if (move === "armored")
    return { icon: "🛡️", role: tr("Tank", "Танк"), summary: tr("Soaks hits and blocks passages, but moves only 1 tile.", "Держит удар и закрывает проходы, но ходит всего на 1 клетку.") }
  if (move === "flier")
    return { icon: "🪽", role: tr("Flier", "Летун"), summary: tr("Flies over obstacles and hits the flanks; keep away from archers.", "Перелетает препятствия и заходит с фланга; берегите от стрелков.") }
  if (move === "cavalry")
    return { icon: "🐎", role: tr("Rider", "Всадник"), summary: tr("Moves farthest of all — finishes foes fast and pulls the wounded out.", "Ходит дальше всех — быстро добивает и уводит раненых.") }
  if (weapons.every(w => weaponRange(w) === 2))
    return { icon: "🏹", role: tr("Archer", "Стрелок"), summary: tr("Hits from 2 tiles, melee foes can't strike back; Bow downs fliers.", "Бьёт с 2 клеток, ближние не могут ответить; Bow сбивает летунов.") }
  if (top === "speed")
    return { icon: "⚡", role: tr("Duelist", "Дуэлянт"), summary: tr("Fast melee fighter: strikes twice more often and gets hit twice less.", "Быстрый боец ближнего боя: чаще бьёт дважды и реже получает второй удар.") }
  if (top === "defense" || top === "specialDefense")
    return { icon: "🧱", role: tr("Guardian", "Страж"), summary: tr("Sturdy melee fighter who holds the front line.", "Крепкий боец ближнего боя, стоит на передовой.") }
  return { icon: "⚔️", role: tr("Fighter", "Боец"), summary: tr("Hard-hitting melee fighter — the backbone of the squad.", "Сильный удар в ближнем бою — основа отряда.") }
}

function requirementText(req: Partial<Record<Skill, Rank>>, joiner: string): string {
  return (Object.entries(req) as [Skill, Rank][]).map(([s, r]) => `${SKILL_LABELS[s]} ${r}`).join(joiner)
}

/** Всё, что нужно знать о классе в интерфейсе: роль, ярус, передвижение, бонус, оружие и требования. */
export function classInfo(classId: string): ClassInfo {
  const fw = fwClass(classId)
  const moveType = movementOf(fw)
  const requires: string[] = []
  if (Object.keys(fw.all).length > 0) requires.push(requirementText(fw.all, tr(" and ", " и ")))
  if (Object.keys(fw.any).length > 0) requires.push(requirementText(fw.any, tr(" or ", " или ")))
  return {
    ...classRole(classId),
    tierLabel: TIER_LABELS[fw.tier],
    tierLevel: TIER_LEVELS[fw.tier],
    moveType,
    moveLabel: movementLabel(classId),
    moveRange: MOVE_RANGE[moveType],
    moveNote: MOVE_NOTES[moveType],
    bonus: classCombatBonus(classId).map(({ label, value }) => ({ label, value })),
    weapons: weaponsOf(fw),
    requires,
    unique: isUniqueClass(fw)
  }
}
