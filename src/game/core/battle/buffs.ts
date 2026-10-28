import type { BattleState, BuffKind } from "../types"
import { BUFF } from "@game/content/balance"

// Бонусы вылазки в чащу (`ExpeditionState.buffs`): личные — у подобравшего бойца, общие — у всего отряда игрока.
// Без вылазки все функции нейтральны: обычный бой они не меняют.

export function hasBuff(state: BattleState, unitId: string, kind: BuffKind): boolean {
  const b = state.expedition?.buffs
  if (!b) return false
  const side = state.units[unitId]?.side
  return (side === "player" && b.team.includes(kind)) || !!b.units[unitId]?.includes(kind)
}

/** Множитель урона удара: «ярость» атакующего и «оберег» защитника. */
export function buffDamageMult(state: BattleState, attackerId: string, defenderId: string): number {
  let m = 1
  if (hasBuff(state, attackerId, "fury")) m *= 1 + BUFF.fury
  if (hasBuff(state, defenderId, "aegis")) m *= 1 - BUFF.aegis
  return m
}

/** Прибавка к ходу («попутный ветер» — всему отряду). */
export function buffMoveBonus(state: BattleState, unitId: string): number {
  return hasBuff(state, unitId, "swift") ? BUFF.swift : 0
}

/** Множитель Вкусняшек с павшего врага («удача» отряда). */
export function buffLootMult(state: BattleState): number {
  return state.expedition?.buffs.team.includes("fortune") ? BUFF.fortune : 1
}
