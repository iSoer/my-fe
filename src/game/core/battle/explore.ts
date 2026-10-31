import type { BattleState, BattleUnit, Pos } from "../types"
import { inMap, mapSize, posKey } from "../types"
import { livingUnits } from "./query"
import { threatTiles } from "../map/pathing"
import { EXPEDITION, difficultyDef } from "@game/content/balance"

// Вылазка в чащу: разведка и зоны тревоги. Пока ни один враг не проснулся, отряд ходит свободно (без ходов и фаз);
// упёрся в зону тревоги спящего врага — начинается пошаговый бой, а когда проснувшихся не осталось — снова разведка.

/** Радиус тревоги врага: страж с постом (все враги чащи) — `EXPEDITION.alertRadius`, иначе — по сложности. */
export function alertRadiusOf(state: BattleState, bu: BattleUnit): number {
  return bu.post ? EXPEDITION.alertRadius : difficultyDef(state.difficulty).ai.alertRadius
}

/** Враг спит: стоит на посту и ещё не ввязался в бой (стойка не `advance`). */
export function isAsleep(bu: BattleUnit): boolean {
  return bu.side === "enemy" && bu.alive && bu.stance !== "advance"
}

/** Зона тревоги одного спящего врага: ромб радиуса тревоги и его зона атаки. */
export function enemyAlertZone(state: BattleState, bu: BattleUnit): Set<string> {
  const size = mapSize(state.map)
  const out = new Set<string>()
  const r = alertRadiusOf(state, bu)
  for (let dy = -r; dy <= r; dy++) {
    const span = r - Math.abs(dy)
    for (let dx = -span; dx <= span; dx++) {
      const p = { x: bu.pos.x + dx, y: bu.pos.y + dy }
      if (inMap(size, p)) out.add(posKey(p))
    }
  }
  for (const k of threatTiles(state, bu)) out.add(k)
  return out
}

/**
 * Зона тревоги — клетки, встав на которые боец игрока разбудит спящего врага. Те же условия, что у ИИ
 * (`shouldWake`): ближе радиуса тревоги или в зоне атаки врага. «Шум боя» (раненые и павшие рядом) сюда
 * не входит — он бывает только в бою.
 */
export function alertZone(state: BattleState): Set<string> {
  const out = new Set<string>()
  for (const bu of livingUnits(state, "enemy")) {
    if (!isAsleep(bu)) continue
    for (const k of enemyAlertZone(state, bu)) out.add(k)
  }
  return out
}

/* ---------- Туман войны ---------- */

/** Клетка разведана (или тумана нет вовсе). */
export function isRevealed(state: BattleState, pos: Pos): boolean {
  if (!state.revealed) return true
  const { w } = mapSize(state.map)
  return state.revealed[pos.y * w + pos.x] === "1"
}

/** Клетки круга радиуса `r` вокруг `center` в пределах поля — индексы `y * w + x`. */
function disk(state: BattleState, center: Pos, r: number): number[] {
  const size = mapSize(state.map)
  const out: number[] = []
  const r2 = r * r + r
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r2) continue
      const p = { x: center.x + dx, y: center.y + dy }
      if (inMap(size, p)) out.push(p.y * size.w + p.x)
    }
  }
  return out
}

/** Открыть клетки вокруг точек (радиус `r`). Строка `revealed` меняется, только если открылось новое. */
export function reveal(state: BattleState, centers: Pos[], r: number): void {
  if (!state.revealed) return
  let cells: string[] | null = null
  for (const c of centers) {
    for (const i of disk(state, c, r)) {
      if (state.revealed[i] === "1" || cells?.[i] === "1") continue
      cells ??= state.revealed.split("")
      cells[i] = "1"
    }
  }
  if (cells) state.revealed = cells.join("")
}

/** Туман войны в начале вылазки: всё скрыто, кроме обзора отряда (выходы тоже нужно найти). */
export function initFog(state: BattleState): void {
  const { w, h } = mapSize(state.map)
  state.revealed = "0".repeat(w * h)
  revealSquad(state)
}

/** Открыть обзор вокруг всех живых бойцов игрока (и по пройденным путям `paths`). */
export function revealSquad(state: BattleState, paths: Pos[][] = []): void {
  if (!state.revealed) return
  const at = livingUnits(state, "player").map(u => u.pos)
  reveal(state, [...at, ...paths.flat()], EXPEDITION.vision)
}

/** Тихо: проснувшихся врагов нет и никто из отряда не стоит в зоне тревоги — можно разведывать. */
export function isCalm(state: BattleState): boolean {
  if (livingUnits(state, "enemy").some(u => !isAsleep(u))) return false
  const zone = alertZone(state)
  return !livingUnits(state, "player").some(u => zone.has(posKey(u.pos)))
}
