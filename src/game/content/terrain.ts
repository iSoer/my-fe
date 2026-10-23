import type { BattleState, MoveType, Pos, TerrainId } from "@game/core/types"
import { posKey } from "@game/core/types"
import { terrainAt } from "@game/core/battle/query"
import { moveCost } from "@game/core/map/pathing"
import { MOVEMENT_LABELS } from "@shared/character/classes"
import { CHARACTER_STAT_LABELS as L } from "@shared/character/leveling"
import { COMBAT, TERRAIN_BONUS } from "./balance"
import { biomeDef } from "./biomes"
import { tr } from "@game/i18n"

const MOVE_TYPES: readonly MoveType[] = ["infantry", "armored", "cavalry", "flier"]

const ICON: Record<TerrainId, string> = {
  plain: "🌿",
  forest: "🌲",
  cover: "🛡️",
  mountain: "⛰️",
  water: "💧",
  wall: "🧱",
  wall_breakable: "🪵"
}

export interface TerrainInfo {
  terrain: TerrainId
  icon: string
  /** Название клетки в биоме карты («Кусты», «Картонная коробка»). */
  name: string
  /** Кто может пройти. */
  move: string
  /** Бонус бойцу, стоящему на клетке (для карточки бойца); нет — клетка ничего не даёт. */
  bonus?: string
  /** Прочие свойства клетки. */
  notes: string[]
}

/** Бонус к статам от клетки строкой: «+1 Def/Res» (одинаковые прибавки — одной записью) или «Def/Res +30 %». */
function bonusText(terrain: TerrainId): string | undefined {
  if (terrain === "cover") {
    const pct = Math.round(COMBAT.coverBonus * 100)
    return tr(`${L.defense}/${L.specialDefense} +${pct}% against hits`, `${L.defense}/${L.specialDefense} +${pct} % против ударов`)
  }
  const b = TERRAIN_BONUS[terrain]
  if (!b) return undefined
  const labels: [keyof typeof b, string][] = [["str", L.attack], ["mag", L.specialAttack], ["spd", L.speed], ["def", L.defense], ["res", L.specialDefense]]
  const byValue = new Map<number, string[]>()
  for (const [k, label] of labels) {
    const v = b[k]
    if (v) byValue.set(v, [...(byValue.get(v) ?? []), label])
  }
  const parts = [...byValue].map(([v, names]) => `${v > 0 ? "+" : "−"}${Math.abs(v)} ${names.join("/")}`)
  return parts.length ? parts.join(", ") : undefined
}

function moveText(terrain: TerrainId): string {
  const ok = MOVE_TYPES.filter(m => moveCost(terrain, m) !== null)
  if (ok.length === MOVE_TYPES.length) return tr("Anyone can walk here", "Проходима для всех")
  if (ok.length === 0) return tr("Impassable", "Непроходима")
  return tr(`Only: ${ok.map(m => MOVEMENT_LABELS[m]).join(", ")}`, `Только: ${ok.map(m => MOVEMENT_LABELS[m]).join(", ")}`)
}

/** Всё о клетке поля: название в биоме, проходимость, бонус стоящему и особенности (HP хлипкого препятствия). */
export function terrainInfo(state: BattleState, pos: Pos): TerrainInfo {
  const terrain = terrainAt(state, pos)
  const notes: string[] = []
  if (terrain === "wall_breakable") {
    const hp = state.walls[posKey(pos)] ?? 0
    notes.push(tr(`Can be broken: ${hp} HP left, 1 per hit`, `Можно сломать: осталось ${hp} HP, удар снимает 1`))
  }
  const bonus = bonusText(terrain)
  if (!bonus && terrain === "plain") notes.push(tr("No effects", "Без эффектов"))
  return {
    terrain,
    icon: ICON[terrain],
    name: biomeDef(state.map.biomeId).terrainNames[terrain],
    move: moveText(terrain),
    bonus,
    notes
  }
}
