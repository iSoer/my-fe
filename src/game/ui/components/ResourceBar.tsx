import { useStore } from "@nanostores/react"
import { $profile } from "@game/state/save"
import { useCountUp } from "../lib/animate"

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
  const p = useStore($profile)
  return (
    <div className="resources">
      <Res icon="✦" value={p.glory} title="Слава" />
      <Res icon="🦴" value={p.treats} title="Вкусняшки" />
    </div>
  )
}
