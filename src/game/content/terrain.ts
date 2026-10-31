import type { BattleState, MoveType, Pos, TerrainId } from "@game/core/types"
import { posKey } from "@game/core/types"
import { terrainAt } from "@game/core/battle/query"
import { moveCost } from "@game/core/map/pathing"
import { CHARACTER_STAT_LABELS as L } from "@shared/character/leveling"
import { COMBAT, TERRAIN_BONUS } from "./balance"
import { biomeDef } from "./biomes"
import { moveTypeLabel } from "./classes"
import { tr } from "@game/i18n"
import { BUFFS, CHEST_MARK } from "./expedition"

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
  return tr(`Only: ${ok.map(m => moveTypeLabel(m)).join(", ")}`, `Только: ${ok.map(m => moveTypeLabel(m)).join(", ")}`)
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
  // Мост — та же проходимая земля, но игрок видит под ним воду
  const bridge = terrain === "plain" && state.map.decor?.[posKey(pos)] === "bridge"
  // Вылазка в чащу: сундук и выход — особые клетки
  const exp = state.map.expedition
  const chest = exp?.chests.find(c => c.pos.x === pos.x && c.pos.y === pos.y)
  const exit = !!exp && exp.exits.some(e => e.x === pos.x && e.y === pos.y)
  if (chest) {
    const opened = !!state.expedition?.opened.includes(chest.id)
    notes.unshift(opened
      ? tr("Opened — the loot is in your bag. Now head for the EXIT.", "Открыт — добыча у отряда. Теперь к ВЫХОДУ.")
      : tr(
          `Locked. The key is on one of its guards; when the fighter who takes it steps onto the chest, you’ll be asked whether to open it. What’s inside is unknown — only the brand on the lid (${CHEST_MARK[chest.kind]}) hints at it.`,
          `Заперт. Ключ — у одного из стражей; когда боец с ключом встанет на сундук, игра спросит, открыть ли его. Что внутри — не видно, намекает лишь клеймо на крышке (${CHEST_MARK[chest.kind]}).`
        ))
  }
  // Сердечко или бонус на земле
  const pickup = state.expedition?.pickups.find(p => p.pos.x === pos.x && p.pos.y === pos.y)
  if (pickup) {
    notes.unshift(pickup.kind === "heart"
      ? tr("❤️ Heart: the fighter who steps here is fully healed.", "❤️ Сердечко: встал на клетку — здоровье восстановится полностью.")
      : tr(`${BUFFS[pickup.kind].icon} ${BUFFS[pickup.kind].name}: ${BUFFS[pickup.kind].desc} until the end of the sortie. Step here to pick it up.`, `${BUFFS[pickup.kind].icon} ${BUFFS[pickup.kind].name}: ${BUFFS[pickup.kind].desc} до конца вылазки. Встаньте на клетку, чтобы подобрать.`))
  }
  if (exit)
    notes.unshift(tr("Step here to leave the thicket — you’ll be asked whether to end the sortie. The squad takes all the loot from the chests it opened.", "Встаньте сюда, чтобы уйти из чащи, — игра спросит, завершить ли вылазку. Отряд унесёт добычу из открытых сундуков."))
  return {
    terrain,
    icon: chest ? "📦" : exit ? "⇱" : bridge ? "🌉" : ICON[terrain],
    name: chest ? tr("Chest", "Сундук") : exit ? tr("Exit", "Выход") : bridge ? tr("Bridge", "Мост") : biomeDef(state.map.biomeId).terrainNames[terrain],
    move: moveText(terrain),
    bonus,
    notes
  }
}
