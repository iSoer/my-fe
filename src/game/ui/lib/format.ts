import type { Color, Difficulty, Gender, MoveType, Species, Stat, Stats } from "@game/core/types"
import { STATS } from "@game/core/types"
import { difficultyDef } from "@game/content/balance"
import { isMagicWeapon } from "@game/content/weapons"
import { CHARACTER_STAT_LABELS as L } from "@shared/character/leveling"
import { lang, tr } from "@game/i18n"

/** Подписи боевых статов — подписи модели; атака — Str или Mag модели, без бойца — «Str/Mag». */
export const STAT_LABELS: Record<Stat, string> = {
  hp: L.hp,
  atk: `${L.attack}/${L.specialAttack}`,
  spd: L.speed,
  def: L.defense,
  res: L.specialDefense
}

/** Подпись атаки бойца: Mag для магии, иначе Str. */
export function atkLabel(unit: { weaponSkill: Parameters<typeof isMagicWeapon>[0] }): string {
  return isMagicWeapon(unit.weaponSkill) ? L.specialAttack : L.attack
}
export const STAT_FULL: Record<Stat, string> = {
  get hp() { return tr("HP", "Здоровье") },
  get atk() { return tr("Attack", "Атака") },
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

export function fmtGains(gains: Partial<Stats>): string {
  const parts: string[] = []
  for (const s of STATS) {
    const v = gains[s]
    if (v) parts.push(`${STAT_LABELS[s]} ${v > 0 ? "+" : ""}${v}`)
  }
  return parts.length ? parts.join(", ") : tr("no change", "без изменений")
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
  return s.hp + s.atk + s.spd + s.def + s.res
}
