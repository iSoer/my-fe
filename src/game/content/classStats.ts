import type { Stat, Stats } from "@game/core/types"
import { STATS, emptyStats } from "@game/core/types"

/**
 * Множители классов к статам, в процентах: +15 — стат на 15 % выше, −15 — ниже. Действуют и на статы 1-го уровня,
 * и на рост (проценты роста бойца), так что класс задаёт характер: латник крепок, но слаб против магии,
 * маг силён магией, но хрупок. Чем выше ярус класса, тем ярче выражены сильные стороны.
 * Порядок: HP, Str, Mag, Spd, Def, Res; пропущенный стат — 0.
 */
export const CLASS_STAT_MODS: Record<string, Partial<Record<Stat, number>>> = {
  // Начальные
  "soldier": { hp: 5, str: 5, mag: -10, spd: -5, def: 15, res: -15 },
  "hunter": { str: 5, mag: -10, spd: 10, def: -5 },
  "mage": { str: -15, mag: 15, def: -10, res: 10 },
  "healer": { str: -15, mag: 10, def: -10, res: 15 },
  "gladiator": { hp: 10, str: 15, mag: -15, spd: 5, def: -5, res: -10 },
  // Специализация
  "myrmidon": { hp: -5, str: 5, spd: 20, def: -10 },
  "brigand": { hp: 15, str: 20, mag: -15, spd: -5, def: -5, res: -15 },
  "pugilist": { hp: 5, str: 10, mag: -15, spd: 15, def: -10 },
  "archer": { str: 10, spd: 5, def: -10, res: -5 },
  "rogue": { str: 5, mag: -5, spd: 20, def: -10 },
  "armored-knight": { hp: 10, spd: -20, def: 30, res: -20 },
  "light-cavalry": { hp: 5, str: 10, mag: -10, spd: 5, def: 5, res: -10 },
  "wing-soldier": { spd: 15, def: -15, res: 15 },
  "priest": { str: -20, mag: 15, def: -10, res: 20 },
  "shaman": { hp: -5, str: -20, mag: 20, def: -10, res: 10 },
  // Продвинутые
  "shido": { str: 10, spd: 25, def: -10 },
  "dancer": { str: -10, spd: 25, def: -10, res: 10 },
  "warrior": { hp: 20, str: 25, mag: -20, spd: -5, def: 15, res: -20 },
  "blacksmith": { str: 15, mag: 10, spd: -10, def: 10, res: -10 },
  "sniper": { str: 20, spd: 5, def: -10, res: -5 },
  "forest-knight": { str: 15, spd: 5, def: 5, res: -10 },
  "ranger": { str: 10, spd: 15, def: -10 },
  "guardian": { hp: 5, str: 10, spd: -5, def: 20, res: -10 },
  "dreadnought": { hp: 15, str: 10, spd: -25, def: 35, res: -25 },
  "bardinger": { str: 15, mag: -10, spd: 10, def: 5, res: -10 },
  "cataphract": { hp: 15, str: 10, spd: -20, def: 30, res: -20 },
  "dragoon": { hp: 10, str: 15, mag: -10, spd: 5, def: 10, res: -15 },
  "ovate": { str: -20, mag: 25, def: -10, res: 10 },
  "bishop": { str: -20, mag: 15, def: -10, res: 25 },
  "troubadour": { str: -15, mag: 15, spd: 5, def: -10, res: 15 },
  // Мастера
  "swordmaster": { str: 15, spd: 30, def: -10 },
  "high-savant": { str: 15, mag: 15, spd: 10, def: -10, res: 5 },
  "battlemaster": { hp: 20, str: 30, mag: -20, spd: 5, res: -20 },
  "war-monk": { hp: 10, str: 15, mag: 15, spd: -5, def: -5, res: 10 },
  "bow-adept": { str: 25, spd: 10, def: -10 },
  "bow-knight": { str: 20, spd: 15, def: -5, res: -10 },
  "shadow-seeker": { str: 10, spd: 30, def: -15 },
  "sentinel": { hp: 10, str: 15, spd: -5, def: 25, res: -10 },
  "castle-knight": { hp: 20, str: 10, spd: -25, def: 40, res: -25 },
  "orichaldia": { str: 20, mag: -10, spd: 15, def: 10, res: -10 },
  "great-knight": { hp: 20, str: 20, spd: -20, def: 30, res: -20 },
  "celestial-trooper": { str: 5, spd: 25, def: -10, res: 20 },
  "bau-lord": { hp: 15, str: 20, def: 15, res: -15 },
  "druid": { str: -20, mag: 35, def: -15, res: 10 },
  "wiseman": { str: -20, mag: 20, def: -10, res: 30 },
  "valkyrium": { str: -20, mag: 25, spd: 5, def: -10, res: 20 },
  // Божественные
  "the-blade": { str: 25, spd: 40, def: -10 },
  "the-apsara": { str: 15, spd: 35, def: -10, res: 20 },
  "the-eternal": { hp: 30, str: 40, mag: -20, spd: 10, res: -20 },
  "the-godhand": { hp: 15, str: 25, mag: 25, res: 15 },
  "the-calamity": { str: 25, spd: 35, def: -15 },
  "the-trident": { hp: 15, str: 25, def: 30, res: -10 },
  "the-cavalier": { hp: 15, str: 30, mag: -15, spd: 10, def: 20, res: -15 },
  "the-avatar": { str: -20, mag: 40, def: -10, res: 30 }
}

/** Множители класса ко всем шести статам, в процентах (неизвестный класс — без множителей). */
export function classStatMods(classId: string): Stats {
  const out = emptyStats()
  const mods = CLASS_STAT_MODS[classId] ?? {}
  for (const s of STATS) out[s] = mods[s] ?? 0
  return out
}
