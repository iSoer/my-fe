import type { Color, Difficulty, Gender, MoveType, Species, Stat, Stats } from "@game/core/types"
import { STATS } from "@game/core/types"
import { difficultyDef } from "@game/content/balance"
import { isMagicWeapon } from "@game/content/weapons"
import { CHARACTER_STAT_LABELS as L } from "@shared/character/leveling"
import { lang, tr } from "@game/i18n"

/** Подписи боевых статов — подписи модели. */
export const STAT_LABELS: Record<Stat, string> = {
  hp: L.hp,
  str: L.attack,
  mag: L.specialAttack,
  spd: L.speed,
  def: L.defense,
  res: L.specialDefense
}

/** Проценты напитка из бара строкой: «+8% Атака · +6% Защита». */
export function drinkEffects(pct: Partial<Record<Stat, number>>): string {
  return STATS.filter(s => pct[s]).map(s => `+${pct[s]}% ${STAT_LABELS[s]}`).join(" · ")
}

/** Подпись стата, которым бьёт оружие бойца: Mag для магии, иначе Str. */
export function atkLabel(unit: { weaponSkill: Parameters<typeof isMagicWeapon>[0] }): string {
  return isMagicWeapon(unit.weaponSkill) ? L.specialAttack : L.attack
}
export const STAT_FULL: Record<Stat, string> = {
  get hp() { return tr("HP", "Здоровье") },
  get str() { return tr("Strength", "Сила") },
  get mag() { return tr("Magic", "Магия") },
  get spd() { return tr("Speed", "Скорость") },
  get def() { return tr("Defense", "Защита") },
  get res() { return tr("Resistance", "Сопротивление") }
}

export const COLOR_NAMES: Record<Color, string> = {
  get red() { return tr("Red", "Красный") },
  get blue() { return tr("Blue", "Синий") },
  get green() { return tr("Green", "Зелёный") },
  get colorless() { return tr("Colorless", "Бесцветный") }
}
export const COLOR_CSS: Record<Color, string> = {
  red: "var(--c-red)",
  blue: "var(--c-blue)",
  green: "var(--c-green)",
  colorless: "var(--c-grey)"
}

/** Значок передвижения: пешком, латы, верхом, в небе. */
export const MOVE_EMOJI: Record<MoveType, string> = { infantry: "👣", armored: "🛡️", cavalry: "🐎", flier: "🪽" }

/** Название вида с учётом пола: Кот/Кошка, Пёс/Собака, Мышь. */
export function speciesName(unit: { species: Species, gender: Gender }): string {
  switch (unit.species) {
    case "cat":
      return unit.gender === "m" ? tr("Cat", "Кот") : tr("Cat", "Кошка")
    case "dog":
      return unit.gender === "m" ? tr("Dog", "Пёс") : tr("Dog", "Собака")
    default:
      return tr("Mouse", "Мышь")
  }
}

export const SPECIES_LABEL: Record<Species, string> = {
  get cat() { return tr("Cats", "Коты") },
  get dog() { return tr("Dogs", "Псы") },
  get mouse() { return tr("Mice", "Мыши") }
}
export const SPECIES_ORDER: Record<Species, number> = { cat: 0, dog: 1, mouse: 2 }

export function hex(n: number): string {
  return `#${n.toString(16).padStart(6, "0")}`
}

export function difficultyName(d: Difficulty): string {
  return difficultyDef(d).name
}

export function g(gender: Gender, m: string, f: string): string {
  return gender === "m" ? m : f
}

export function fmtDate(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString(lang() === "ru" ? "ru-RU" : "en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" })
  }
  catch {
    return ""
  }
}

export function statTotal(s: Stats): number {
  return STATS.reduce((sum, k) => sum + s[k], 0)
}

/**
 * Изменения статов строкой: «Str/Mag −7, Def +3». Одинаковая прибавка к Str и Mag (навыки «Str/Mag»)
 * — одной записью.
 */
export function statChanges(m: Partial<Stats>): string {
  const both = !!m.str && m.str === m.mag
  return STATS.filter(k => m[k] && !(both && k === "mag"))
    .map((k) => {
      const v = m[k] as number
      const name = both && k === "str" ? `${L.attack}/${L.specialAttack}` : STAT_LABELS[k]
      return `${name} ${v > 0 ? "+" : "−"}${Math.abs(v)}`
    })
    .join(", ")
}

/** Сколько осталось: «3 ч 12 мин», «12 мин», «45 с». */
export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return tr(`${h}h ${m}m`, `${h} ч ${m} мин`)
  if (m > 0) return tr(`${m}m`, `${m} мин`)
  return tr(`${s}s`, `${s} с`)
}
