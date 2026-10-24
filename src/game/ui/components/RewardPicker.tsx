import { useState } from "react"
import { useStore } from "@nanostores/react"
import type { UnitInstance } from "@game/core/types"
import { $save, claimRewardAction, freeSlots, skipRewardAction } from "@game/state/save"
import { haptic } from "@game/platform/haptics"
import { Button } from "./Button"
import { UnitRow } from "./UnitRow"
import { UnitDetails } from "./UnitDetails"
import { tr } from "@game/i18n"

/** Бесплатная награда за бой: три кандидата, игрок забирает одного в ростер. */
export function RewardPicker({
  onClaimed,
  toast
}: {
  onClaimed?: (unit: UnitInstance) => void
  toast: (msg: string, error?: boolean) => void
}) {
  const save = useStore($save)
  const [expanded, setExpanded] = useState<string | null>(null)
  const choice = save.rewardChoice
  if (!choice || choice.length === 0 || !save.army) return null
  const full = freeSlots(save) === 0

  const claim = (index: number) => {
    const r = claimRewardAction(index)
    if (!r.ok || !r.unit) return toast(r.error ?? tr("Error", "Ошибка"), true)
    haptic("success")
    toast(tr(`${r.unit.name} joined the Roster!`, `${r.unit.name} в ростере!`))
    onClaimed?.(r.unit)
  }

  return (
    <div className="card stack pop-in reward-card">
      <div className="section-title">{tr("🎁 Reward: one character for free", "🎁 Награда: один персонаж бесплатно")}</div>
      {full && <p className="danger-text small">{tr("Roster full — release someone in the Barracks to claim the reward.", "Ростер полон — отпустите кого-нибудь в казарме, чтобы забрать награду.")}</p>}
      {choice.map((unit, i) => {
        const isOpen = expanded === unit.id
        return (
          <div key={unit.id} className="hire-cand stack">
            <UnitRow
              unit={unit}
              index={i}
              friendly
              onClick={() => setExpanded(isOpen ? null : unit.id)}
              right={(
                // Кнопка внутри кликабельной строки: не разворачивать карточку при нажатии
                <span onClick={e => e.stopPropagation()}>
                  <Button sm primary disabled={full} onClick={() => claim(i)}>
                    {tr("Claim", "Забрать")}
                  </Button>
                </span>
              )}
            />
            {isOpen && (
              <div className="card hire-details pop-in">
                <UnitDetails unit={unit} compact />
              </div>
            )}
          </div>
        )
      })}
      <Button danger block onClick={() => skipRewardAction()}>
        {tr("Decline", "Отказаться")}
      </Button>
    </div>
  )
}
