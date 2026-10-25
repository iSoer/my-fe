import type { Rng } from "../rng"
import { createRng, makeId } from "../rng"
import type { Appearance, Gender, Rarity, Species, Stats, UnitInstance, UnitSkills } from "../types"
import { MAX_LEVEL, STATS, addStats, attackStatOf, clamp, emptyStats, type Stat } from "../types"
import type { ClassDef, PassiveDef, WeaponDef } from "../skills/types"
import { permanentBonus, unitKit, invalidateKit } from "../skills/engine"
import {
  CLASS_IDS,
  DANCER_CLASS,
  classWeapons,
  className,
  fwClass,
  unitClass
} from "@game/content/classes"
import { gradeWeaponId, isMagicWeapon, isWeaponId, weaponDef } from "@game/content/weapons"
import { SPECIALS } from "@game/content/skills/specials"
import { ASSISTS } from "@game/content/skills/assists"
import { PASSIVES } from "@game/content/skills/passives"
import { BOSS_TITLES, EPITHETS, NAMES } from "@game/content/names"
import { BREEDS } from "@game/content/breeds"
import { PERSONALITIES } from "@game/content/personalities"
import { ACCESSORIES, EYES, EYE_COLORS, FUR_PALETTES, PATTERNS } from "@game/content/appearance"
import { COMBAT, HEALING, LEVEL_UP, MODEL_SCALE, ROSTER, recruitRarityWeights } from "@game/content/balance"
import { classStatMods } from "@game/content/classStats"
import { FATIGUE, dishDef } from "@game/content/buildings"
import { factionDef } from "@game/content/factions"
import { generateCharacter, validateCharacterRequest } from "@/server/character-model/generate"
import { loadCharacterModel } from "@/server/character-model/model"
import { levelOneStats, type StatValues } from "@shared/character/leveling"
import { CHARACTER_CLASSES, CLASS_TIERS, availableClasses, canTakeClass, isUniqueClass } from "@shared/character/classes"
import { rankAtLevel, rankIndex, ranksAtLevel, type Rank, type WeaponGrade, type WeaponSkill } from "@shared/character/skills"

/* ---------- Статы: модель персонажа → бой ---------- */

const RARITY_SKILL_POOL: Record<Rarity, number> = { 1: 3, 2: 3, 3: 4, 4: 4, 5: 5 }

/** Любой стат бойца — не меньше 1. */
const MIN_STAT = 1

const scaleStat = (v: number): number => Math.max(MIN_STAT, Math.round((v - MODEL_SCALE.statOffset) * MODEL_SCALE.statMul))

/** Из какого стата модели берётся боевой стат (`combatStats`). */
const MODEL_STAT_OF: Record<Stat, keyof StatValues> = {
  hp: "hp",
  str: "attack",
  mag: "specialAttack",
  spd: "speed",
  def: "defense",
  res: "specialDefense"
}

/**
 * Боевые статы из статов модели (`MODEL_SCALE`): у каждого бойца есть и Str (`attack`), и Mag (`specialAttack`).
 * В бою атака — Str для физического оружия и Mag для Black Magic и White Magic (`attackStatOf`).
 */
export function combatStats(model: StatValues): Stats {
  return {
    hp: Math.max(MIN_STAT, Math.round(model.hp * MODEL_SCALE.hpMul) + MODEL_SCALE.hpAdd),
    str: scaleStat(model.attack),
    mag: scaleStat(model.specialAttack),
    spd: scaleStat(model.speed),
    def: scaleStat(model.defense),
    res: scaleStat(model.specialDefense)
  }
}

interface StatTable {
  classId: string
  weaponSkill: WeaponSkill
  rarity: Rarity
  seed: number
  baseStats: StatValues
  maxStats: StatValues
  /** Боевые статы на уровнях 1…MAX_LEVEL (индекс — уровень − 1). */
  levels: Stats[]
}

const statTables = new WeakMap<UnitInstance, StatTable>()

/**
 * Проценты роста бойца в текущем классе, по стату: сумма — по звезде (`LEVEL_UP.growthTotal`), пропорции — собственный
 * рост его модели с 1-го по 80-й уровень в боевой шкале, стат его оружия — с весом `LEVEL_UP.attackWeight`;
 * затем множитель класса и потолок `LEVEL_UP.maxRate`.
 */
export function growthRates(unit: UnitInstance): Stats {
  const mods = classStatMods(unit.classId)
  const hit = attackStatOf(isMagicWeapon(unit.weaponSkill))
  const weight = (s: Stat): number => {
    const k = MODEL_STAT_OF[s]
    const own = Math.max(0, (unit.maxStats[k] - unit.baseStats[k]) * (s === "hp" ? MODEL_SCALE.hpMul : MODEL_SCALE.statMul))
    return s === hit ? own * LEVEL_UP.attackWeight : own
  }
  const sum = STATS.reduce((acc, s) => acc + weight(s), 0)
  const total = LEVEL_UP.growthTotal.base + LEVEL_UP.growthTotal.perStar * unit.rarity
  const out = emptyStats()
  for (const s of STATS) {
    const own = sum > 0 ? (total * weight(s)) / sum : 0
    out[s] = clamp(own * (1 + mods[s] / 100), 0, LEVEL_UP.maxRate)
  }
  return out
}

/**
 * Боевые статы бойца на всех уровнях в текущем классе — в духе FEH. Статы 1-го уровня — из модели персонажа
 * с множителем класса; к 80-му уровню каждый стат вырастает на round(процент роста × 79 %), а уровни, на которых
 * он растёт, перемешаны по зерну бойца — поэтому уровни разные: где-то +1 к двум статам, где-то ко всем шести.
 * Каждый уровень растит хотя бы `LEVEL_UP.minStats` разных статов: прибавка переносится с другого уровня, где её в избытке.
 */
function statTable(unit: UnitInstance): Stats[] {
  const cached = statTables.get(unit)
  if (
    cached
    && cached.classId === unit.classId
    && cached.weaponSkill === unit.weaponSkill
    && cached.rarity === unit.rarity
    && cached.seed === unit.seed
    && cached.baseStats === unit.baseStats
    && cached.maxStats === unit.maxStats
  )
    return cached.levels
  const steps = MAX_LEVEL - 1
  const mods = classStatMods(unit.classId)
  const own = combatStats(unit.baseStats)
  const rates = growthRates(unit)
  const first = emptyStats()
  for (const s of STATS) first[s] = Math.max(MIN_STAT, Math.round(own[s] * (1 + mods[s] / 100)))

  // На каких уровнях растёт каждый стат: свои уровни на стат, перемешанные по зерну бойца (индекс i — уровень i + 2)
  const rng = createRng(unit.seed).fork("growth")
  const at: Set<Stat>[] = Array.from({ length: steps }, () => new Set<Stat>())
  const levelsIdx = Array.from({ length: steps }, (_, i) => i)
  for (const s of STATS) {
    const count = Math.round((rates[s] * steps) / 100)
    const order = rng.fork(s).shuffle(levelsIdx)
    for (let k = 0; k < count; k++) at[order[k] as number]?.add(s)
  }
  // Гарантия: на каждом уровне хотя бы minStats разных статов — переносим прибавку с наименее щедрого из уровней,
  // где есть лишнее (редкие «идеальные» уровни остаются), а если переносить неоткуда — добавляем стату с самым высоким ростом
  const byRate = [...STATS].sort((a, b) => rates[b] - rates[a])
  for (let i = 0; i < steps; i++) {
    const here = at[i] as Set<Stat>
    while (here.size < LEVEL_UP.minStats) {
      let donor = -1
      for (let j = 0; j < steps; j++) {
        const there = at[j] as Set<Stat>
        if (there.size <= LEVEL_UP.minStats || ![...there].some(s => !here.has(s))) continue
        if (donor < 0 || there.size < (at[donor] as Set<Stat>).size) donor = j
      }
      if (donor >= 0) {
        const there = at[donor] as Set<Stat>
        const s = byRate.find(x => there.has(x) && !here.has(x)) as Stat
        there.delete(s)
        here.add(s)
      }
      else here.add(byRate.find(x => !here.has(x)) as Stat)
    }
  }
  const levels: Stats[] = [first]
  for (let i = 0; i < steps; i++) {
    const next = { ...(levels[i] as Stats) }
    for (const s of at[i] as Set<Stat>) next[s] += 1
    levels.push(next)
  }
  statTables.set(unit, {
    classId: unit.classId,
    weaponSkill: unit.weaponSkill,
    rarity: unit.rarity,
    seed: unit.seed,
    baseStats: unit.baseStats,
    maxStats: unit.maxStats,
    levels
  })
  return levels
}

/** Боевые статы уровня `level` без оружия и навыков: каждый не меньше 1, каждый уровень растит хотя бы два стата. */
export function statsAtLevel(unit: UnitInstance, level: number): Stats {
  return statTable(unit)[clamp(Math.trunc(level), 1, MAX_LEVEL) - 1] as Stats
}

/** Прирост боевых статов между уровнями. */
export function levelGains(unit: UnitInstance, from: number, to: number): Partial<Stats> {
  const a = statsAtLevel(unit, from)
  const b = statsAtLevel(unit, to)
  const gains: Partial<Stats> = {}
  for (const s of STATS) if (b[s] !== a[s]) gains[s] = b[s] - a[s]
  return gains
}

/** Ранг оружейного навыка бойца на его уровне. */
export function weaponRank(unit: UnitInstance): Rank {
  return rankAtLevel(unit.aptitudes[unit.weaponSkill], unit.level)
}

export function rankMt(rank: Rank): number {
  return Math.floor(rankIndex(rank) * COMBAT.rankMt)
}

/** На сколько ступеней ранг навыка бойца ниже требуемого рангом его оружия (0 — владеет свободно). */
export function weaponShortfall(unit: UnitInstance): number {
  return Math.max(0, rankIndex(weaponDef(unit.skills.weapon).requiredRank) - rankIndex(weaponRank(unit)))
}

/** Mt оружия в лапах бойца: Mt оружия + заточка + ранг навыка − штраф за недостающий ранг. */
export function weaponMt(unit: UnitInstance): number {
  const w = weaponDef(unit.skills.weapon)
  return Math.max(
    0,
    w.mt + unit.weaponTier * COMBAT.weaponTierMt + rankMt(weaponRank(unit)) - weaponShortfall(unit) * COMBAT.rankShortMt
  )
}

/**
 * Доли к статам от поселения: штраф усталости (`FATIGUE`, за каждый стак) и бафф блюда Столовой на бой.
 * Ненулевая доля меняет стат хотя бы на 1.
 */
export function settlementMods(unit: Pick<UnitInstance, "fatigue" | "meal">): Partial<Stats> {
  const out: Partial<Stats> = {}
  const stacks = Math.min(FATIGUE.maxStacks, unit.fatigue ?? 0)
  if (stacks > 0) for (const s of FATIGUE.stats) out[s] = -FATIGUE.perStack * stacks
  const dish = unit.meal ? dishDef(unit.meal) : undefined
  if (dish) for (const [s, v] of Object.entries(dish.buff) as [Stat, number][]) out[s] = (out[s] ?? 0) + v
  return out
}

/** Видимые статы вне боя: уровень и класс + Mt оружия + постоянные бонусы + усталость и блюдо. */
export function visibleStats(unit: UnitInstance): Stats {
  const base = statsAtLevel(unit, unit.level)
  // Mt оружия прибавляется к стату, которым оно бьёт
  const withWeapon = addStats(base, { [attackStatOf(isMagicWeapon(unit.weaponSkill))]: weaponMt(unit) })
  let withBonus = addStats(withWeapon, permanentBonus(unit))
  if (unit.isBoss) {
    const b = COMBAT.bossBonus
    withBonus = addStats(withBonus, { hp: b, str: b, mag: b, spd: b, def: b, res: b })
  }
  const mods = settlementMods(unit)
  const out = emptyStats()
  for (const s of STATS) {
    const share = mods[s] ?? 0
    const delta = share === 0 ? 0 : Math.round(withBonus[s] * share) || Math.sign(share)
    out[s] = Math.max(MIN_STAT, withBonus[s] + delta)
  }
  return out
}

/**
 * Сила лечения Поддержкой сверх базы умения: Mag лекаря × `HEALING.magShare` (с бонусами навыков и талисмана)
 * плюс Mt посоха в лапах — заточка и ранг оружия лечат сильнее.
 */
export function healPower(unit: UnitInstance): number {
  const mt = weaponMt(unit)
  const ownMag = visibleStats(unit).mag - (isMagicWeapon(unit.weaponSkill) ? mt : 0)
  return Math.floor(Math.max(0, ownMag) * HEALING.magShare) + mt
}

/** Атака бойца вне боя: Str или Mag (с Mt оружия) — смотря чем бьёт его оружие. */
export function attackOf(unit: UnitInstance, stats: Stats = visibleStats(unit)): number {
  return stats[attackStatOf(isMagicWeapon(unit.weaponSkill))]
}

export function statTotal(s: Stats): number {
  return STATS.reduce((sum, k) => sum + s[k], 0)
}

/* ---------- Отображение ---------- */

export function displayName(unit: UnitInstance): string {
  return unit.epithet ? `${unit.name} ${unit.epithet}` : unit.name
}

export function unitClassName(unit: UnitInstance): string {
  return className(unitClass(unit))
}

export function unitWeapon(unit: UnitInstance): WeaponDef {
  return weaponDef(unit.skills.weapon)
}

export { unitClass }

/* ---------- Классы FW: открытые, смена класса ---------- */

/** Классы, открытые бойцу на его уровне (ярус + ранги навыков). */
export function openClasses(unit: UnitInstance): string[] {
  return availableClasses(unit.aptitudes, unit.level).map(c => c.id)
}

export function canTakeClassNow(unit: UnitInstance, classId: string): boolean {
  return canTakeClass(fwClass(classId), ranksAtLevel(unit.aptitudes, unit.level), unit.level)
}

/** Есть ли открытый класс выше текущего яруса — повод заглянуть в карточку бойца. */
export function hasClassUpgrade(unit: UnitInstance): boolean {
  const tier = CLASS_TIERS.indexOf(fwClass(unit.classId).tier)
  return availableClasses(unit.aptitudes, unit.level).some(c => CLASS_TIERS.indexOf(c.tier) > tier)
}

/** Божественный класс в армии может быть только у одного бойца, как в FW. */
export function isUniqueClassId(classId: string): boolean {
  return isUniqueClass(fwClass(classId))
}

/** Навык оружия: `prefer`, если класс им сражается, иначе лучший по рангу на уровне (при равенстве — `pick`). */
function bestWeapon(
  classId: string,
  unit: Pick<UnitInstance, "aptitudes" | "level">,
  pick: (skills: WeaponSkill[]) => WeaponSkill,
  prefer?: WeaponSkill
): WeaponSkill {
  const weapons = classWeapons(classId)
  if (prefer && weapons.includes(prefer)) return prefer
  const ranks = ranksAtLevel(unit.aptitudes, unit.level)
  const top = Math.max(...weapons.map(w => rankIndex(ranks[w])))
  return pick(weapons.filter(w => rankIndex(ranks[w]) === top))
}

/** Поддержка, которую боец получает вместе с классом и оружием: White Magic лечит, Dancer танцует. */
function withClassAssist(unit: UnitInstance, prev: UnitInstance): UnitInstance {
  const skills = { ...unit.skills }
  const learned = [...unit.learned]
  const grant = (id: string) => {
    if (!learned.includes(id)) learned.push(id)
    skills.assist = id
  }
  const assist = skills.assist ? ASSISTS.find(a => a.id === skills.assist) : undefined
  if (
    assist
    && ((assist.staffOnly && unit.weaponSkill !== "whiteMagic") || (assist.dancerOnly && unit.classId !== DANCER_CLASS))
  )
    delete skills.assist
  if (unit.classId === DANCER_CLASS) grant("as_dance")
  else if (unit.weaponSkill === "whiteMagic" && (prev.weaponSkill !== "whiteMagic" || !skills.assist)) grant("as_heal")
  return { ...unit, skills, learned }
}

/**
 * Сменить класс (как в FW — бесплатно, если класс открыт на уровне). Оружие — предмет, поэтому остаётся в лапах:
 * класс меняет статы и передвижение, а навык боя по-прежнему задаёт оружие.
 */
export function reclassUnit(unit: UnitInstance, classId: string): UnitInstance {
  if (!canTakeClassNow(unit, classId)) throw new Error(`class ${classId} is not open at level ${unit.level}`)
  const next: UnitInstance = { ...unit, classId }
  invalidateKit(unit)
  return withClassAssist(next, unit)
}

/**
 * Взять в лапы оружие (предмет инвентаря или деревянное): оружием может сражаться любой боец, навык боя становится
 * навыком оружия, а ранг этого навыка решает, насколько хорошо боец им владеет (`weaponMt`).
 */
export function equipWeapon(unit: UnitInstance, weaponId: string): UnitInstance {
  const w = weaponDef(weaponId)
  const next: UnitInstance = { ...unit, weaponSkill: w.kind, skills: { ...unit.skills, weapon: weaponId } }
  invalidateKit(unit)
  return withClassAssist(next, unit)
}

/* ---------- Перерождение ---------- */

/** Перерождение доступно на 80-м уровне, пока у бойца меньше пяти звёзд. */
export function canRebirth(unit: Pick<UnitInstance, "level" | "rarity">): boolean {
  return unit.level >= MAX_LEVEL && unit.rarity < 5
}

/**
 * Статы модели того же персонажа на другой звезде. Звезда масштабирует одну и ту же 5★-версию (`levelOneStat`):
 * из статов 80-го уровня восстанавливаем 1-й уровень 5★ и строим из него новую звезду. Максимум кратен 5, как у
 * модели, и не меньше прежнего.
 */
export function rescaleRarity(maxStats: StatValues, from: Rarity, to: Rarity): { baseStats: StatValues, maxStats: StatValues } {
  const model = loadCharacterModel()
  const a = model.rarities[from]
  const b = model.rarities[to]
  const max = { ...maxStats }
  for (const s of Object.keys(maxStats) as (keyof StatValues)[]) {
    const g = model.growth[s]
    const base5 = maxStats[s] / (a.baseMultiplier + (g - 1) * a.growthMultiplier)
    max[s] = Math.max(maxStats[s], Math.round((base5 * (b.baseMultiplier + (g - 1) * b.growthMultiplier)) / 5) * 5)
  }
  return { baseStats: levelOneStats(max, model.growth, b), maxStats: max }
}

/**
 * Перерождение: боец 80-го уровня возвращается на 1-й и получает звезду — тот же персонаж с ростом следующей звезды.
 * Класс, оружие, навыки, SP и история сохраняются; пул изучаемых навыков растёт по звезде (`RARITY_SKILL_POOL`).
 */
export function rebirthUnit(unit: UnitInstance): UnitInstance {
  if (!canRebirth(unit)) throw new Error(`rebirth needs level ${MAX_LEVEL} and fewer than 5 stars`)
  const rarity = (unit.rarity + 1) as Rarity
  const extra = RARITY_SKILL_POOL[rarity] - RARITY_SKILL_POOL[unit.rarity]
  let learnable = unit.learnable
  if (extra > 0) {
    const known = new Set([...unit.learned, ...unit.learnable])
    const rng = createRng(unit.seed).fork(`rebirth:${rarity}`)
    const cands = rng.shuffle(allowedSkillIds(unitClass(unit), unit.species).filter(id => !known.has(id)))
    learnable = [...learnable, ...cands.slice(0, extra)]
  }
  invalidateKit(unit)
  let next: UnitInstance = { ...unit, ...rescaleRarity(unit.maxStats, unit.rarity, rarity), rarity, level: 1, xp: 0, learnable }
  // Надбавки за «пустые» уровни зависят от роста, и с новой звездой их бывает меньше: подтягиваем максимум модели
  // у отстающих статов, чтобы к 80-му уровню ни один стат не стал ниже прежнего
  const before = statsAtLevel(unit, MAX_LEVEL)
  const model = loadCharacterModel()
  for (let guard = 0; guard < 100; guard++) {
    const after = statsAtLevel(next, MAX_LEVEL)
    const short = STATS.filter(s => after[s] < before[s])
    if (short.length === 0) break
    const maxStats = { ...next.maxStats }
    for (const s of short) maxStats[MODEL_STAT_OF[s]] += 5
    next = { ...next, maxStats, baseStats: levelOneStats(maxStats, model.growth, model.rarities[rarity]) }
  }
  return next
}

/* ---------- Пулы навыков ---------- */

function passiveAllowed(p: PassiveDef, cls: ClassDef): boolean {
  if (!p.allow) return true
  if (p.allow.moveTypes && !p.allow.moveTypes.includes(cls.moveType)) return false
  if (p.allow.weaponSkills && !p.allow.weaponSkills.includes(cls.weaponSkill)) return false
  return true
}

/** Все навыки, которые класс/вид в принципе может изучить (без v1.1). */
export function allowedSkillIds(cls: ClassDef, species: Species): string[] {
  const out: string[] = []
  const isStaff = cls.weaponSkill === "whiteMagic"
  const isDancer = cls.id === DANCER_CLASS
  for (const s of SPECIALS) {
    if (s.stage === "v1.1") continue
    if (s.onlySpecies && s.onlySpecies !== species) continue
    if (s.staffOnly !== isStaff && (s.staffOnly || isStaff)) continue
    out.push(s.id)
  }
  for (const a of ASSISTS) {
    if (a.stage === "v1.1") continue
    if (a.staffOnly && !isStaff) continue
    if (a.dancerOnly && !isDancer) continue
    if (isDancer && a.kind === "refresh") continue // танец выдаётся автоматически
    out.push(a.id)
  }
  for (const p of PASSIVES) {
    if (p.stage === "v1.1") continue
    if (!passiveAllowed(p, cls)) continue
    out.push(p.id)
  }
  return out
}

/** Общие навыки, доступные всем без пула. */
export const COMMON_SKILLS = ["a_atk3", "a_spd3", "a_def3", "a_res3", "a_hp5", "as_rally_atk", "as_rally_def"]

export function slotOf(skillId: string): keyof UnitSkills {
  if (SPECIALS.some(s => s.id === skillId)) return "special"
  if (ASSISTS.some(a => a.id === skillId)) return "assist"
  const p = PASSIVES.find(x => x.id === skillId)
  if (p) return p.slot
  return "weapon"
}

/** Что боец может изучить сейчас (не изучено, в пуле или общее). */
export function learnableNow(unit: UnitInstance): string[] {
  const set = new Set<string>([...unit.learnable, ...COMMON_SKILLS])
  const allowed = new Set(allowedSkillIds(unitClass(unit), unit.species))
  return [...set].filter(id => !unit.learned.includes(id) && (allowed.has(id) || COMMON_SKILLS.includes(id)))
}

export function skillCost(skillId: string): number {
  const s = SPECIALS.find(x => x.id === skillId)
  if (s) return s.spCost
  const a = ASSISTS.find(x => x.id === skillId)
  if (a) return a.spCost
  const p = PASSIVES.find(x => x.id === skillId)
  if (p) return p.spCost
  throw new Error(`unknown skill ${skillId}`)
}

/* ---------- Генерация ---------- */

/** Веса видов для бойцов игрока: мыши редки, но бывают. */
export const DEFAULT_SPECIES_WEIGHTS: Record<Species, number> = { cat: 45, dog: 45, mouse: 10 }

export interface GenerateUnitOptions {
  seed: number
  level: number
  rarity?: Rarity
  rarityWeights?: Record<Rarity, number>
  species?: Species
  speciesWeights?: Record<Species, number>
  /** Класс FW; должен быть открыт на уровне (иначе модель отклонит запрос). Без него класс выбирает модель. */
  classId?: string
  /** Желаемый навык оружия, если класс им сражается. */
  weaponSkill?: WeaponSkill
  /** Грейд оружия в лапах: новые бойцы игрока — деревянное, враги — по уровню (`enemyWeaponGrade`). */
  weaponGrade?: WeaponGrade
  isEnemy?: boolean
  factionId?: string
  isBoss?: boolean
  now?: number
}

function pickRarity(rng: Rng, weights: Record<Rarity, number>): Rarity {
  return rng.weighted(([1, 2, 3, 4, 5] as Rarity[]).map(r => ({ item: r, w: weights[r] })))
}

function pickAppearance(rng: Rng, build: 0 | 1 | 2, palettes?: number[]): Appearance {
  return {
    build,
    furPalette: palettes && palettes.length > 0 ? rng.pick(palettes) : rng.int(0, FUR_PALETTES.length - 1),
    pattern: rng.int(0, PATTERNS.length - 1),
    eyes: rng.int(0, EYES.length - 1),
    eyeColor: rng.int(0, EYE_COLORS.length - 1),
    accessory: rng.int(0, ACCESSORIES.length - 1)
  }
}

/**
 * Боец = персонаж модели (редкость, статы 1-го и 80-го уровня, склонности, уровень, класс FW)
 * + звериное оформление (вид, порода, имя, характер, внешность) и навыки боя.
 */
export function generateUnit(opts: GenerateUnitOptions): UnitInstance {
  const root = createRng(opts.seed)
  const r = {
    species: root.fork("species"),
    name: root.fork("name"),
    character: root.fork("character"),
    rarity: root.fork("rarity"),
    weapon: root.fork("weapon"),
    skills: root.fork("skills"),
    look: root.fork("look")
  }

  const species: Species
    = opts.species
      ?? r.species.weighted(
        (Object.entries(opts.speciesWeights ?? DEFAULT_SPECIES_WEIGHTS) as [Species, number][]).map(([item, w]) => ({
          item,
          w
        }))
      )
  const breed = r.species.pick(BREEDS.filter(b => b.species === species))
  const nameEntry = r.name.pick(NAMES[species])
  const gender: Gender = nameEntry.gender
  let epithet: string | undefined
  if (opts.isBoss) {
    const t = r.name.pick(BOSS_TITLES)
    epithet = gender === "m" ? t[0] : t[1]
  }
  else if (r.name.chance(0.6)) {
    const e = r.name.pick(EPITHETS)
    epithet = gender === "m" ? e[0] : e[1]
  }

  // Персонаж модели: редкость — по весам игры, уровень и класс — из опций
  const rarity: Rarity = opts.rarity ?? pickRarity(r.rarity, opts.rarityWeights ?? recruitRarityWeights(1))
  const level = clamp(Math.round(opts.level), 1, MAX_LEVEL)
  const request = opts.classId ? { rarity, level, class: opts.classId } : { rarity, level }
  const character = generateCharacter(loadCharacterModel(), request, r.character.int(0, 0x7fffffff))
  const classId = character.class
  const weaponSkill = bestWeapon(classId, character, best => r.weapon.pick(best), opts.weaponSkill)
  const cls = unitClass({ classId, weaponSkill })

  // Навыки
  const skills: UnitSkills = { weapon: gradeWeaponId(weaponSkill, opts.weaponGrade ?? "wood") }
  const learned: string[] = []
  const allowed = allowedSkillIds(cls, species)
  const specials = allowed.filter(id => SPECIALS.some(s => s.id === id))
  const assists = allowed.filter(id => ASSISTS.some(a => a.id === id && !a.staffOnly))
  const passives = allowed.filter(id => PASSIVES.some(p => p.id === id))

  if (weaponSkill === "whiteMagic") {
    skills.assist = "as_heal"
    learned.push("as_heal")
  }
  if (classId === DANCER_CLASS) {
    skills.assist = "as_dance"
    learned.push("as_dance")
  }
  if (specials.length > 0) {
    const sp = r.skills.pick(specials)
    skills.special = sp
    learned.push(sp)
  }
  const extraCount = rarity <= 2 ? 0 : rarity <= 4 ? 1 : 2
  for (let i = 0; i < extraCount; i++) {
    const wantAssist = !skills.assist && assists.length > 0 && r.skills.chance(0.4)
    if (wantAssist) {
      const a = r.skills.pick(assists)
      skills.assist = a
      learned.push(a)
    }
    else {
      const freeSlots = (["a", "b", "c"] as const).filter(sl => !skills[sl])
      const cands = passives.filter(
        id => !learned.includes(id) && freeSlots.includes((PASSIVES.find(p => p.id === id) as PassiveDef).slot)
      )
      if (cands.length === 0) continue
      const p = r.skills.pick(cands)
      skills[(PASSIVES.find(x => x.id === p) as PassiveDef).slot] = p
      learned.push(p)
    }
  }
  const poolCands = r.skills.shuffle(allowed.filter(id => !learned.includes(id)))
  const learnable = poolCands.slice(0, RARITY_SKILL_POOL[rarity])

  const palettes = opts.factionId ? factionDef(opts.factionId).palettes : undefined
  const appearance = pickAppearance(r.look, breed.build, palettes)
  const personality = r.look.pick(PERSONALITIES)

  const unit: UnitInstance = {
    id: makeId(opts.isEnemy ? "e" : "u", opts.seed),
    seed: opts.seed,
    name: nameEntry.name,
    gender,
    species,
    breedId: breed.id,
    personalityId: personality.id,
    classId,
    weaponSkill,
    rarity,
    level,
    xp: 0,
    sp: 0,
    aptitudes: character.aptitudes,
    baseStats: character.baseStats,
    maxStats: character.maxStats,
    archetype: character.archetype,
    weaponTier: 0,
    skills,
    learned,
    learnable,
    appearance,
    history: { battles: 0, kills: 0, damageDealt: 0, damageTaken: 0, closestCall: 999 },
    createdAt: opts.now ?? 0
  }
  if (epithet) unit.epithet = epithet
  if (opts.isEnemy) unit.isEnemy = true
  if (opts.isBoss) unit.isBoss = true
  if (opts.factionId) unit.factionId = opts.factionId
  return unit
}

/* ---------- Комплекты: класс FW + оружие ---------- */

/** Класс модели и оружейный навык — всё, что нужно, чтобы заказать бойца нужной роли. */
export interface Loadout {
  classId: string
  weaponSkill: WeaponSkill
  cls: ClassDef
  /** Вес при случайном выборе: (ярус + 1)², поделённый между комплектами класса. */
  weight: number
}

const loadoutCache = new Map<number, Loadout[]>()

/** Комплекты, которые модель может выдать на уровне: класс открыт и требует не больше трёх талантов. */
export function loadoutsAt(level: number): Loadout[] {
  const lvl = clamp(Math.round(level), 1, MAX_LEVEL)
  let out = loadoutCache.get(lvl)
  if (out) return out
  const model = loadCharacterModel()
  out = []
  for (const classId of CLASS_IDS) {
    if (isUniqueClassId(classId)) continue
    if (validateCharacterRequest(model, { class: classId, level: lvl }).length > 0) continue
    const weapons = classWeapons(classId)
    const tier = CLASS_TIERS.indexOf(fwClass(classId).tier)
    for (const weaponSkill of weapons)
      out.push({
        classId,
        weaponSkill,
        cls: unitClass({ classId, weaponSkill }),
        weight: (tier + 1) ** 2 / weapons.length
      })
  }
  loadoutCache.set(lvl, out)
  return out
}

/* ---------- Ростер ---------- */

export interface RosterOptions {
  seed: number
  glory: number
  /** Высшая открытая перерождением звезда (`profile.maxRarity`); по умолчанию ★1. */
  maxRarity?: Rarity
  size?: number
  now?: number
}

const MELEE: readonly WeaponSkill[] = ["sword", "spear", "axe", "gauntlet"]

/** Стартовые классы (ярус beginner): Soldier, Hunter, Mage, Healer, Gladiator. */
export const STARTER_CLASSES: readonly string[] = CHARACTER_CLASSES.filter(c => c.tier === "beginner").map(c => c.id)

/** Запасной состав ростера из стартовых классов, если случайный не прошёл проверку ролей. */
const FALLBACK_ROSTER: readonly [string, WeaponSkill][] = [
  ["healer", "whiteMagic"],
  ["gladiator", "sword"],
  ["soldier", "spear"],
  ["soldier", "axe"],
  ["hunter", "bow"],
  ["mage", "blackMagic"],
  ["gladiator", "gauntlet"],
  ["hunter", "sword"]
]

/**
 * Стартовый ростер новой армии с гарантиями ролей. Детерминирован по seed. Все бойцы — в стартовых классах: сначала
 * по одному каждого (`STARTER_CLASSES`), остальные — случайный стартовый; оружие класса и статы выбирает модель.
 */
export function generateRoster(opts: RosterOptions): UnitInstance[] {
  const maxRarity = opts.maxRarity ?? 1
  const rarityWeights = recruitRarityWeights(maxRarity)
  const size = opts.size ?? (opts.glory >= 25 ? ROSTER.sizeWithGlory25 : ROSTER.size)
  const startLevel = opts.glory >= 75 ? ROSTER.startLevelWithGlory75 : ROSTER.startLevel
  const root = createRng(opts.seed)
  // Слава 300: в ростере есть боец высшей открытой звезды
  const guaranteeTop = opts.glory >= 300 && maxRarity > 1

  for (let attempt = 0; attempt < 200; attempt++) {
    const rng = root.fork(`attempt:${attempt}`)
    const units: UnitInstance[] = []
    for (let i = 0; i < size; i++) {
      const seed = rng.int(0, 0x7fffffff)
      const classId = STARTER_CLASSES[i] ?? rng.pick(STARTER_CLASSES)
      units.push(generateUnit({ seed, level: startLevel, rarityWeights, classId, now: opts.now }))
    }
    if (guaranteeTop && !units.some(u => u.rarity === maxRarity)) {
      const idx = rng.int(0, units.length - 1)
      const old = units[idx] as UnitInstance
      units[idx] = generateUnit({
        seed: old.seed,
        level: startLevel,
        rarity: maxRarity,
        classId: old.classId,
        weaponSkill: old.weaponSkill,
        now: opts.now
      })
    }
    const has = (skills: WeaponSkill[]) => units.some(u => skills.includes(u.weaponSkill))
    // Лекарь, двое ближников, дальник и все три цвета треугольника
    const ok
      = has(["whiteMagic"])
        && units.filter(u => MELEE.includes(u.weaponSkill)).length >= 2
        && has(["bow", "blackMagic"])
        && has(["sword"])
        && has(["spear"])
        && has(["axe"])
        && units.some(u => u.species === "cat")
        && units.some(u => u.species === "dog")
    if (ok) return units
  }
  // Фолбэк: собрать вручную
  const rng = root.fork("fallback")
  return FALLBACK_ROSTER.slice(0, size).map(([classId, weaponSkill], i) =>
    generateUnit({
      seed: rng.int(0, 0x7fffffff),
      level: startLevel,
      classId,
      weaponSkill,
      rarityWeights,
      species: i % 2 === 0 ? "cat" : "dog",
      now: opts.now
    })
  )
}

/* ---------- Изменения бойца (чистые) ---------- */

export function withSkills(unit: UnitInstance, patch: Partial<UnitSkills>): UnitInstance {
  const next: UnitInstance = { ...unit, skills: { ...unit.skills, ...patch } }
  invalidateKit(unit)
  return next
}

export function learnSkill(unit: UnitInstance, skillId: string): UnitInstance {
  if (isWeaponId(skillId)) throw new Error("weapon is an item, not a skill")
  if (unit.learned.includes(skillId)) return unit
  const cost = skillCost(skillId)
  if (unit.sp < cost) throw new Error("not enough SP")
  const slot = slotOf(skillId)
  const next: UnitInstance = {
    ...unit,
    sp: unit.sp - cost,
    learned: [...unit.learned, skillId],
    skills: { ...unit.skills, [slot]: skillId }
  }
  return next
}

export function equipSkill(unit: UnitInstance, skillId: string | undefined, slot: keyof UnitSkills): UnitInstance {
  if (slot === "weapon") throw new Error("weapon is an item: use equipWeapon")
  if (skillId && !unit.learned.includes(skillId)) throw new Error("skill not learned")
  const skills = { ...unit.skills }
  if (skillId) skills[slot] = skillId as string
  else delete skills[slot]
  return { ...unit, skills }
}

export { unitKit, DANCER_CLASS }
