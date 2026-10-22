import type { BattleState, BattleUnit, Pos } from "../types"
import { manhattan } from "../types"
import { livingUnits } from "./query"
import { consumableDef, isConsumableId } from "@game/content/items"

/** Расходники в рюкзаке вылазки (id → количество > 0). */
export function packItems(state: BattleState): [string, number][] {
  return Object.entries(state.pack ?? {}).filter(([id, n]) => n > 0 && isConsumableId(id))
}

/**
 * Кому можно дать предмет, стоя на `from`: самому бойцу и союзникам на соседних клетках.
 * Массовый предмет («котелок») применяется только на себя — он лечит всех вокруг.
 */
export function itemTargetsFrom(state: BattleState, bu: BattleUnit, from: Pos, itemId: string): BattleUnit[] {
  if (consumableDef(itemId).area) return [bu]
  return livingUnits(state, bu.side).filter(u => u.unitId === bu.unitId || manhattan(u.pos, from) === 1)
}

export interface ItemPlan {
  heals: { unitId: string, amount: number, hpAfter: number }[]
  cleansed: string[]
}

/** Что сделает предмет (без мутаций): лечение по `heal`/`healPct` (берётся большее), снятие штрафов. */
export function planItem(state: BattleState, bu: BattleUnit, from: Pos, targetId: string, itemId: string): ItemPlan {
  const def = consumableDef(itemId)
  const target = state.units[targetId]
  if (!target || !target.alive || target.side !== bu.side) throw new Error("цель недоступна")
  const affected = def.area
    ? livingUnits(state, bu.side).filter(u => u.unitId === bu.unitId || manhattan(u.pos, from) <= (def.area ?? 0))
    : [target]
  const plan: ItemPlan = { heals: [], cleansed: [] }
  for (const u of affected) {
    const want = Math.max(def.heal ?? 0, Math.round(u.maxHp * (def.healPct ?? 0)))
    const amount = Math.min(want, u.maxHp - u.hp)
    if (amount > 0) plan.heals.push({ unitId: u.unitId, amount, hpAfter: u.hp + amount })
    if (def.cleanse && Object.values(u.penalties).some(v => v)) plan.cleansed.push(u.unitId)
  }
  return plan
}
