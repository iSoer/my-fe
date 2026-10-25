import type { UnitInstance } from "@game/core/types"
import { FATIGUE } from "@game/content/buildings"
import { fatigueOf } from "@game/core/settlement"
import { tr } from "@game/i18n"

/** Подсказка к усталости: на сколько процентов просели статы. */
export function fatigueHint(unit: UnitInstance): string {
  const pct = Math.round(fatigueOf(unit) * FATIGUE.perStack * 100)
  return tr(`Fatigue: −${pct}% Str, Mag, Spd, Def, Res. Cured at the Hospital.`, `Усталость: −${pct} % Str, Mag, Spd, Def, Res. Лечится в Больнице.`)
}

/** Метки поселения у бойца: усталость (стаки) и «на полигоне». */
export function UnitStatusChips({ unit, training }: { unit: UnitInstance, training?: boolean }) {
  const f = fatigueOf(unit)
  return (
    <>
      {training && <span className="chip training">{tr("🎯 Training", "🎯 Полигон")}</span>}
      {f > 0 && (
        <span className={`chip fatigue${f >= 3 ? " heavy" : ""}`} title={fatigueHint(unit)}>
          {`😮‍💨 ${f}`}
        </span>
      )}
    </>
  )
}
