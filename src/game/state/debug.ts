import { atom } from "nanostores"
import type { BattleResult, BattleState, Rarity, SaveGame } from "@game/core/types"
import { SQUAD_SIZE } from "@game/core/types"
import { randomSeed } from "@game/core/rng"
import { tickSettlement } from "@game/core/settlement"
import {
  addRecruit,
  addResources,
  addSp,
  clearFatigue,
  debugBattleMap,
  forceResult,
  grantAllItems,
  refreshSquad,
  setBuildings,
  setLevels,
  skipTime,
  topUp,
  unlockAll,
  weakenEnemies,
  type DebugBattleOptions
} from "@game/core/debug"
import { $save, finishBattle, startBattle, updateSave } from "./save"
import { navigate, remountRoute } from "./router"
import { DEBUG } from "./debugFlag"

export { DEBUG }

const INFINITE_KEY = "pawfield:debug:infinite"
/** «Бесконечная валюта»: Вкусняшки и Еда не опускаются ниже этого. */
const INFINITE_MIN = 500_000

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1"
  }
  catch {
    return false
  }
}

export const $infinite = atom(DEBUG && readFlag(INFINITE_KEY))

let watching = false

/** Включить debug: подписка «бесконечной валюты» на сейв (один раз). */
export function initDebug(): void {
  if (!DEBUG || watching) return
  watching = true
  const refill = () => {
    if (!$infinite.get()) return
    const next = topUp($save.get(), INFINITE_MIN)
    if (next) updateSave(() => next)
  }
  $save.listen(refill)
  $infinite.listen(refill)
  refill()
}

export function setInfinite(on: boolean): void {
  $infinite.set(on)
  try {
    localStorage.setItem(INFINITE_KEY, on ? "1" : "0")
  }
  catch {
    // приватный режим — флаг живёт до перезагрузки
  }
}

const edit = (fn: (s: SaveGame) => SaveGame) => () => {
  updateSave(fn)
}

export const debugActions = {
  treats: (n: number) => edit(s => addResources(s, { treats: n }))(),
  food: (n: number) => edit(s => addResources(s, { food: n }))(),
  glory: (n: number) => edit(s => addResources(s, { glory: n }))(),
  unlockAll: edit(unlockAll),
  levels: (level: number, onlySquad: boolean) => edit(s => setLevels(s, level, onlySquad))(),
  sp: (n: number) => edit(s => addSp(s, n))(),
  clearFatigue: edit(clearFatigue),
  allItems: edit(s => grantAllItems(s, 1)),
  recruit: (level: number, rarity: Rarity) => edit(s => addRecruit(s, { seed: randomSeed(), level, rarity, now: Date.now() }))(),
  buildings: (level: number) => edit(s => setBuildings(s, level))(),
  skipHours: (h: number) => edit(s => tickSettlement(skipTime(s, h * 3600_000), Date.now()))(),
  /** Новая витрина Лавки прямо сейчас (новое зерно площадки). */
  restock: edit(s => tickSettlement({ ...s, store: { ...s.store, hour: -1 }, settlement: { ...s.settlement, marketSeed: randomSeed() } }, Date.now()))
}

/**
 * Любой бой: карта по параметрам становится разведанным боем. `quick` — сразу в бой отрядом из Казармы
 * (первые бойцы ростера, если отряд пуст), иначе — на экран выбора отряда.
 */
export function startDebugBattle(o: Omit<DebugBattleOptions, "squadSize">, quick: boolean): { ok: boolean, error?: string } {
  const s = $save.get()
  if (!s.army || s.army.units.length === 0) return { ok: false, error: "Нет бойцов — добавьте в разделе «Ростер»" }
  if (s.battle && !s.battle.result) return { ok: false, error: "Уже идёт бой — закончите его" }
  const map = debugBattleMap({ ...o, squadSize: SQUAD_SIZE })
  updateSave(st => ({ ...st, pendingBattle: { seed: o.seed, difficulty: o.difficulty, biomeId: map.biomeId, team: o.team, map } }))
  if (!quick) {
    navigate("/battle/squad")
    return { ok: true }
  }
  const army = $save.get().army
  const squad = army?.squadIds.length ? army.squadIds : (army?.units ?? []).slice(0, SQUAD_SIZE).map(u => u.id)
  const r = startBattle(squad)
  if (!r.ok) return { ok: false, ...(r.error ? { error: r.error } : {}) }
  navigate("/battle")
  return { ok: true }
}

function editBattle(fn: (b: BattleState) => BattleState): boolean {
  const b = $save.get().battle
  if (!b || b.result) return false
  updateSave(st => ({ ...st, battle: fn(b) }))
  return true
}

/** Закончить идущий бой исходом и показать итоги. */
export function endBattleAs(result: BattleResult): boolean {
  if (!editBattle(b => forceResult(b, result))) return false
  finishBattle()
  navigate("/battle/result", true)
  return true
}

/** Правка идущего боя (враги на 1 HP, свои — полное HP и новый ход): сцена пересобирается из состояния. */
export function tweakBattle(kind: "weaken" | "refresh"): boolean {
  if (!editBattle(kind === "weaken" ? weakenEnemies : refreshSquad)) return false
  remountRoute()
  return true
}
