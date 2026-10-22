import type { BattleState } from "@game/core/types"
import { itemTargetsFrom, packItems } from "@game/core/battle/items"
import { consumableDef } from "@game/content/items"
import { applyItem, cancel, type BattleUiState } from "@game/state/battleUi"
import { haptic } from "@game/platform/haptics"

/** Рюкзак вылазки в бою: предмет и кому его дать (себе или соседу); массовый — только себе, лечит всех вокруг. */
export function ItemMenu({ battle, ui }: { battle: BattleState, ui: BattleUiState }) {
  if (ui.mode !== "itemSelect" || !ui.selectedId) return null
  const bu = battle.units[ui.selectedId]
  if (!bu) return null
  const from = ui.movedTo ?? bu.pos
  const items = packItems(battle)
  return (
    <div className="bf-items" role="dialog" aria-label="Предметы">
      <div className="bf-items-head">
        <b>🎒 Рюкзак</b>
        <button type="button" className="bf-items-close" aria-label="Назад" onClick={cancel}>
          ✕
        </button>
      </div>
      {items.map(([id, n]) => {
        const def = consumableDef(id)
        const targets = itemTargetsFrom(battle, bu, from, id)
        return (
          <div key={id} className="bf-item">
            <div className="bf-item-txt">
              <b>{`${def.icon} ${def.name} ×${n}`}</b>
              <small>{def.desc}</small>
            </div>
            <div className="bf-item-targets">
              {targets.map((t) => {
                const name = t.unitId === bu.unitId ? "Себе" : (battle.roster[t.unitId]?.name ?? "?")
                return (
                  <button
                    key={t.unitId}
                    type="button"
                    className="bf-item-target"
                    onClick={() => {
                      haptic("light")
                      void applyItem(id, t.unitId)
                    }}
                  >
                    {name}
                    <small>{`${t.hp}/${t.maxHp}`}</small>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
