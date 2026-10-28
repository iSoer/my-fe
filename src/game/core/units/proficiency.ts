import type { Rarity, UnitInstance } from "../types"
import { createRng } from "../rng"
import { APTITUDE_RATE, CLASS_AFFINITY, CLASS_PRESET, SKILL_XP } from "@game/content/balance"
import { fwClass } from "@game/content/classes"
import { loadCharacterModel } from "@/server/character-model/model"
import { distributeStats, normalizeShares } from "@/server/stat-model/generate"
import { levelOneStats, type StatValues } from "@shared/character/leveling"
import { STATS } from "@shared/character/stats"
import { CHARACTER_CLASSES, TIER_LEVELS, canTakeClass, requiredSkillsOf, weaponsOf, type CharacterClass } from "@shared/character/classes"
import {
  RANKS,
  SKILLS,
  WEAPON_SKILLS,
  meanSkillShift,
  rankIndex,
  type Aptitudes,
  type Rank,
  type Ranks,
  type Skill,
  type WeaponSkill
} from "@shared/character/skills"

// Владение навыками от использования: у бойца копится опыт каждого навыка (оружие и передвижение), ранг E…S —
// по порогам `SKILL_XP.ranks`. Скорость — склонность класса (`CLASS_AFFINITY`) × личная склонность модели
// (`APTITUDE_RATE`). Уровень бойца на ранги не влияет: перерождение (1-й уровень, новая звезда) их сохраняет.
// Здесь же пресеты новых бойцов: опыт навыков по классу и уровню и «идеальные» статы класса.

export type SkillXp = Record<Skill, number>

const isWeapon = (s: Skill): s is WeaponSkill => (WEAPON_SKILLS as readonly string[]).includes(s)

/* ---------- Ранги ---------- */

/** Ранг по опыту навыка. */
export function rankOfXp(xp: number): Rank {
  let i = 0
  while (i + 1 < SKILL_XP.ranks.length && xp >= (SKILL_XP.ranks[i + 1] ?? Infinity)) i++
  return RANKS[i] as Rank
}

/** Порог опыта ранга. */
export function xpOfRank(rank: Rank): number {
  return SKILL_XP.ranks[rankIndex(rank)] ?? 0
}

export function skillRank(unit: Pick<UnitInstance, "skillXp">, skill: Skill): Rank {
  return rankOfXp(unit.skillXp[skill] ?? 0)
}

export function unitRanks(unit: Pick<UnitInstance, "skillXp">): Ranks {
  return Object.fromEntries(SKILLS.map(s => [s, skillRank(unit, s)])) as Ranks
}

/** Прогресс навыка к следующему рангу: сколько набрано внутри ранга и сколько нужно; на S следующего нет. */
export function rankProgress(unit: Pick<UnitInstance, "skillXp">, skill: Skill): { rank: Rank, next?: Rank, have: number, need: number } {
  const xp = unit.skillXp[skill] ?? 0
  const rank = rankOfXp(xp)
  const i = rankIndex(rank)
  const next = RANKS[i + 1]
  if (!next) return { rank, have: 0, need: 0 }
  const from = SKILL_XP.ranks[i] ?? 0
  return { rank, next, have: xp - from, need: (SKILL_XP.ranks[i + 1] ?? from) - from }
}

/* ---------- Склонности ---------- */

/** Множитель класса для навыка: единственное оружие класса и его передвижение ×3, одно из нескольких ×2, прочее ×1. */
export function classAffinity(classId: string, skill: Skill): number {
  const c = fwClass(classId)
  if (isWeapon(skill)) {
    const weapons = weaponsOf(c)
    if (!weapons.includes(skill)) return CLASS_AFFINITY.other
    return weapons.length === 1 ? CLASS_AFFINITY.single : CLASS_AFFINITY.shared
  }
  return requiredSkillsOf(c).includes(skill) ? CLASS_AFFINITY.movement : CLASS_AFFINITY.other
}

/** Итоговая скорость роста навыка у бойца в его классе. */
export function skillRate(unit: Pick<UnitInstance, "classId" | "aptitudes">, skill: Skill): number {
  return classAffinity(unit.classId, skill) * APTITUDE_RATE[unit.aptitudes[skill]]
}

/**
 * Начислить опыт навыкам (до множителей): возвращает бойца с новым опытом и навыки, получившие новый ранг.
 * Опыт сверх порога S не копится.
 */
export function gainSkillXp(unit: UnitInstance, gains: Partial<Record<Skill, number>>): { unit: UnitInstance, rankUps: { skill: Skill, rank: Rank }[] } {
  const cap = SKILL_XP.ranks[SKILL_XP.ranks.length - 1] ?? 0
  const skillXp = { ...unit.skillXp }
  const rankUps: { skill: Skill, rank: Rank }[] = []
  for (const [skill, base] of Object.entries(gains) as [Skill, number][]) {
    if (!base) continue
    const before = skillXp[skill] ?? 0
    const after = Math.min(cap, Math.round((before + base * skillRate(unit, skill)) * 10) / 10)
    skillXp[skill] = after
    if (rankOfXp(after) !== rankOfXp(before)) rankUps.push({ skill, rank: rankOfXp(after) })
  }
  return { unit: { ...unit, skillXp }, rankUps }
}

/* ---------- Классы по рангам ---------- */

export function canTakeClassWith(unit: Pick<UnitInstance, "skillXp" | "level">, item: CharacterClass): boolean {
  return canTakeClass(item, unitRanks(unit), unit.level)
}

/** Классы, открытые бойцу: ярус по уровню + ранги навыков по опыту. */
export function classesOpenTo(unit: Pick<UnitInstance, "skillXp" | "level">): CharacterClass[] {
  const ranks = unitRanks(unit)
  return CHARACTER_CLASSES.filter(c => canTakeClass(c, ranks, unit.level))
}

/**
 * Чего не хватает для класса: уровня яруса и рангов (для «any» — ближайший по опыту вариант). Пусто — открыт.
 * `gap` — сколько ступеней рангов недостаёт, для сортировки «ближайших» классов.
 */
export function classShortfall(unit: Pick<UnitInstance, "skillXp" | "level">, item: CharacterClass): { level?: number, ranks: { skill: Skill, rank: Rank }[], gap: number } {
  const ranks = unitRanks(unit)
  const missing: { skill: Skill, rank: Rank }[] = []
  for (const [skill, rank] of Object.entries(item.all) as [Skill, Rank][])
    if (rankIndex(ranks[skill]) < rankIndex(rank)) missing.push({ skill, rank })
  const any = Object.entries(item.any) as [Skill, Rank][]
  if (any.length > 0 && !any.some(([skill, rank]) => rankIndex(ranks[skill]) >= rankIndex(rank))) {
    const closest = [...any].sort((a, b) => (xpOfRank(a[1]) - (unit.skillXp[a[0]] ?? 0)) - (xpOfRank(b[1]) - (unit.skillXp[b[0]] ?? 0)))[0]
    if (closest) missing.push({ skill: closest[0], rank: closest[1] })
  }
  const tierLevel = TIER_LEVELS[item.tier]
  const out: { level?: number, ranks: { skill: Skill, rank: Rank }[], gap: number } = {
    ranks: missing,
    gap: missing.reduce((sum, m) => sum + rankIndex(m.rank) - rankIndex(ranks[m.skill]), 0)
  }
  if (unit.level < tierLevel) out.level = tierLevel
  return out
}

/* ---------- Пресеты новых бойцов ---------- */

/** Стартовый опыт навыков: E+, у слабости — E. */
export function startingSkillXp(aptitudes: Aptitudes): SkillXp {
  return Object.fromEntries(SKILLS.map(s => [s, aptitudes[s] === "weak" ? SKILL_XP.startWeak : SKILL_XP.start])) as SkillXp
}

/**
 * Опыт навыков бойца, который приходит сразу на `level` в классе `classId`: будто всю жизнь воевал в этом классе —
 * оружие класса и его передвижение растут по склонностям, передвижение понемногу у всех. Выше A+
 * (`SKILL_XP.presetCapRank`) пресет не поднимает — высший ранг только своими руками; требований класса хватает всегда.
 */
export function presetSkillXp(classId: string, aptitudes: Aptitudes, level: number): SkillXp {
  const c = fwClass(classId)
  const weapons = weaponsOf(c)
  const levels = Math.max(0, Math.round(level) - 1)
  const rate = (s: Skill) => classAffinity(classId, s) * APTITUDE_RATE[aptitudes[s]]
  const xp = startingSkillXp(aptitudes)
  for (const s of SKILLS) {
    if (isWeapon(s)) {
      if (weapons.includes(s)) xp[s] += levels * SKILL_XP.presetPerLevel.weapon * rate(s)
    }
    else xp[s] += levels * SKILL_XP.presetPerLevel.movement * rate(s)
  }
  // Выше A+ пресет не поднимает — высший ранг только своими руками
  const cap = xpOfRank(RANKS[SKILL_XP.presetCapRank] as Rank)
  for (const s of SKILLS) xp[s] = Math.round(Math.min(xp[s], cap))
  // Требования класса — всегда: все «all» и хотя бы один «any» (самый прокачанный). Выше потолка это поднимает
  // только божественный класс (ранг S), а новобранцам игрока он не выпадает
  const floor = (s: Skill, rank: Rank) => {
    xp[s] = Math.max(xp[s], xpOfRank(rank))
  }
  for (const [s, rank] of Object.entries(c.all) as [Skill, Rank][]) floor(s, rank)
  const any = Object.entries(c.any) as [Skill, Rank][]
  if (any.length > 0 && !any.some(([s, rank]) => xp[s] >= xpOfRank(rank))) {
    const [s, rank] = [...any].sort((a, b) => xp[b[0]] - xp[a[0]])[0] as [Skill, Rank]
    floor(s, rank)
  }
  return xp
}

/**
 * Пресет статов класса для звезды: средний бюджет звезды, профиль — ровный плюс сдвиг навыков класса (`CLASS_PRESET`).
 * На 80-м уровне — полный профиль класса, на 1-м — наполовину ровный: кривая роста ведёт к тому, в чём класс силён.
 * Один пресет на класс (сколько классов — столько пресетов). С `seed` — личный разброс бойца: доли статов сдвинуты
 * на ±`CLASS_PRESET.jitter`, сумма статов та же; без `seed` — сам пресет, «идеальный» образец класса.
 */
export function classPresetStats(classId: string, rarity: Rarity, seed?: number): { baseStats: StatValues, maxStats: StatValues } {
  const model = loadCharacterModel()
  const info = model.rarities[rarity]
  const shift = meanSkillShift(requiredSkillsOf(fwClass(classId)))
  const neutral = 1 / STATS.length
  const rng = seed === undefined ? undefined : createRng(seed).fork("preset")
  // Один множитель на стат — и для 80-го уровня, и для 1-го: у бойца своя сильная сторона на всём росте
  const jitter = STATS.map(() => (rng ? 1 + (rng.next() * 2 - 1) * CLASS_PRESET.jitter : 1))
  const ideal = normalizeShares(STATS.map((s, i) => (neutral + CLASS_PRESET.shift * shift[s]) * (jitter[i] ?? 1)))
  const flat = normalizeShares(ideal.map(v => v + (neutral - v) * CLASS_PRESET.baseFlatten))
  const budget = info.budget.mean
  const range = { min: info.budget.min, max: info.budget.max }
  const maxStats = distributeStats(budget, ideal, info.stat, range)
  const flatMax = distributeStats(budget, flat, info.stat, range)
  const flatBase = levelOneStats(flatMax, model.growth, info)
  const baseStats = Object.fromEntries(STATS.map(s => [s, Math.max(1, Math.min(flatBase[s], maxStats[s]))])) as StatValues
  return { baseStats, maxStats }
}

/** Все пресеты: по одному на каждый класс FW. */
export function classPresets(rarity: Rarity): Record<string, { baseStats: StatValues, maxStats: StatValues }> {
  return Object.fromEntries(CHARACTER_CLASSES.map(c => [c.id, classPresetStats(c.id, rarity)]))
}
