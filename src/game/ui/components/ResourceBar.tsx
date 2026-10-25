import { useStore } from "@nanostores/react"
import { $save } from "@game/state/save"
import { buildingLevel } from "@game/core/settlement"
import { useCountUp } from "../lib/animate"
import { tr } from "@game/i18n"

function Res({ icon, value, title }: { icon: string, value: number, title: string }) {
  const shown = useCountUp(value, 600)
  return (
    <span className={`res ${shown !== value ? "ticking" : ""}`} title={title}>
      <span className="res-ico" aria-hidden="true">
        {icon}
      </span>
      <b key={value} className="res-val">
        {shown}
      </b>
    </span>
  )
}

export function ResourceBar() {
  const save = useStore($save)
  const p = save.profile
  // Еда видна, когда она есть или растёт на Полях
  const food = p.food > 0 || buildingLevel(save, "fields") > 0
  return (
    <div className="resources">
      <Res icon="✦" value={p.glory} title={tr("Glory", "Слава")} />
      <Res icon="🦴" value={p.treats} title={tr("Treats", "Вкусняшки")} />
      {food && <Res icon="🌾" value={p.food} title={tr("Food", "Еда")} />}
    </div>
  )
}
