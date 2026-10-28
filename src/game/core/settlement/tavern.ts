import type { BattleDrink, OrderedDrink, SaveGame, Stat } from "../types"
import { STATS } from "../types"
import { TAVERN, DRINKS, drinkDef, type DrinkDef } from "@game/content/tavern"
import { atLevel } from "@game/content/settlement"
import { tr } from "@game/i18n"
import { buildingLevel, type Check, type Outcome } from "./index"

// Бар: кружка на одну вылазку. Заказ списывает цену и запоминает сорт с уровнем бара; при начале боя напиток
// выпивается (`drinkForBattle`) и превращается в проценты к статам отряда. Чистые функции над сейвом.

/** Проценты сорта на уровне бара `level`: базовые × `TAVERN.power`, округлённые до целого. */
export function drinkPct(def: Pick<DrinkDef, "pct">, level: number): Partial<Record<Stat, number>> {
  const k = atLevel(TAVERN.power, level)
  const out: Partial<Record<Stat, number>> = {}
  for (const s of STATS) {
    const v = def.pct[s]
    if (v) out[s] = Math.round(v * k)
  }
  return out
}

/** Сорта в меню бара уровня `level` (0 — бара нет, меню пустое). */
export function drinksAt(level: number): DrinkDef[] {
  return level > 0 ? DRINKS.filter(d => d.minLevel <= level) : []
}

export function canOrderDrink(save: SaveGame, id: string): Check {
  const level = buildingLevel(save, "tavern")
  const def = drinkDef(id)
  if (level === 0) return { ok: false, error: tr("Build the bar first", "Сначала постройте бар") }
  if (!def) return { ok: false, error: tr("No such drink", "Нет такого напитка") }
  if (def.minLevel > level) return { ok: false, error: tr(`Served from bar level ${def.minLevel}`, `Наливают с ${def.minLevel}-го уровня бара`) }
  if (save.settlement.drink) return { ok: false, error: tr("One mug per sortie — you already ordered", "Одна кружка на вылазку — уже заказано") }
  if (save.battle && !save.battle.result) return { ok: false, error: tr("The battle is already on", "Бой уже идёт") }
  if (save.profile.treats < def.price)
    return { ok: false, error: tr(`Not enough Treats: ${def.price - save.profile.treats} 🦴 short`, `Недостаточно Вкусняшек: не хватает ${def.price - save.profile.treats} 🦴`) }
  return { ok: true }
}

/** Заказать кружку на следующую вылазку: цена списывается сразу, сила — по нынешнему уровню бара. */
export function orderDrink(save: SaveGame, id: string): Outcome {
  const check = canOrderDrink(save, id)
  if (!check.ok) return check
  const def = drinkDef(id) as DrinkDef
  const drink: OrderedDrink = { id, level: buildingLevel(save, "tavern") }
  return {
    ok: true,
    save: {
      ...save,
      profile: { ...save.profile, treats: save.profile.treats - def.price },
      settlement: { ...save.settlement, drink }
    }
  }
}

/** Напиток на бой из заказа (сорт убрали из игры — ничего). */
export function drinkForBattle(order: OrderedDrink | undefined): BattleDrink | undefined {
  const def = order && drinkDef(order.id)
  if (!order || !def) return undefined
  return { id: order.id, pct: drinkPct(def, order.level) }
}
