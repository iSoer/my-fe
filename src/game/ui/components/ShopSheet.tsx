import { useState } from "react"
import { useStore } from "@nanostores/react"
import type { UnitInstance } from "@game/core/types"
import { BARRACKS_CAP } from "@game/core/types"
import { unitPrice } from "@game/core/progression"
import { $save, buyAction, freeSlots } from "@game/state/save"
import { haptic } from "@game/platform/haptics"
import { BottomSheet } from "./Sheet"
import { Button } from "./Button"
import { UnitRow } from "./UnitRow"
import { UnitDetails } from "./UnitDetails"

/** Набор в Казарме: витрина персонажей за Вкусняшки. Цена зависит от уровня и редкости, витрина обновляется после боя. */
export function ShopSheet({
  open,
  onClose,
  onBought,
  toast
}: {
  open: boolean
  onClose: () => void
  onBought: (unit: UnitInstance) => void
  toast: (msg: string, error?: boolean) => void
}) {
  const save = useStore($save)
  const [expanded, setExpanded] = useState<string | null>(null)
  const slots = freeSlots(save)
  const treats = save.profile.treats

  const buy = (index: number) => {
    const r = buyAction(index)
    if (!r.ok || !r.unit) return toast(r.error ?? "Ошибка", true)
    haptic("success")
    setExpanded(null)
    onBought(r.unit)
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="🐾 Набор">
      <p className="muted small hire-sub">
        У вас 🦴
        {" "}
        <b>{treats}</b>
        {" "}
        · в ростере свободно
        {" "}
        <b>{slots}</b>
        {" "}
        из
        {" "}
        {BARRACKS_CAP}
      </p>
      <div className="stack">
        {save.shelter.candidates.map((unit, i) => {
          const price = unitPrice(unit)
          const isOpen = expanded === unit.id
          return (
            <div key={unit.id} className="hire-cand stack">
              <UnitRow
                unit={unit}
                index={i}
                friendly
                onClick={() => setExpanded(isOpen ? null : unit.id)}
                right={<span className="muted small">{isOpen ? "Свернуть" : "Подробнее"}</span>}
              />
              {isOpen && (
                <div className="card hire-details pop-in">
                  <UnitDetails unit={unit} compact />
                </div>
              )}
              <Button block primary icon="🦴" disabled={slots === 0 || treats < price} onClick={() => buy(i)}>
                {slots === 0 ? "Ростер полон" : `Купить за 🦴 ${price}`}
              </Button>
            </div>
          )
        })}
        {save.shelter.candidates.length === 0 && <p className="muted">Витрина пуста — новые персонажи появятся после боя.</p>}
      </div>
      <div className="muted small" style={{ marginTop: 8 }}>
        Вкусняшки выпадают из врагов в бою и даются за победу. Витрина обновляется после каждого боя.
      </div>
    </BottomSheet>
  )
}
