import type { BattleState, Stats } from "../types"
import { STATS } from "../types"

// Напиток из бара в бою (`BattleState.drink`): бойцам игрока — прибавка к статам в процентах от их статов.
// Без напитка и у врагов — ноль: обычный бой не меняется.

/** Прибавка от процентов к статам `base`: хоть +1, если процент есть. */
export function drinkBonusOf(pct: Partial<Stats>, base: Stats): Partial<Stats> {
  const out: Partial<Stats> = {}
  for (const s of STATS) {
    const p = pct[s]
    if (p && p > 0 && base[s] > 0) out[s] = Math.max(1, Math.round((base[s] * p) / 100))
  }
  return out
}

/** Прибавка напитка бойцу `unitId` (только отряду игрока). */
export function drinkBonus(state: BattleState, unitId: string, base: Stats): Partial<Stats> {
  const drink = state.drink
  if (!drink || state.units[unitId]?.side !== "player") return {}
  return drinkBonusOf(drink.pct, base)
}
