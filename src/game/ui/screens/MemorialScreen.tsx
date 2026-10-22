import { useStore } from "@nanostores/react"
import { displayName, unitClassName } from "@game/core/units"
import { biomeDef } from "@game/content/biomes"
import { $memorial } from "@game/state/save"
import { navigate } from "@game/state/router"
import { TopBar } from "../components/TopBar"
import { UnitAvatar } from "../components/UnitAvatar"
import { fmtDate, g } from "../lib/format"
import { stagger } from "../lib/animate"

export function MemorialScreen() {
  const memorial = useStore($memorial)
  const list = [...memorial].reverse()
  return (
    <div className="screen">
      <TopBar title="Кладбище" onBack={() => navigate("/", true)} />
      <div className="screen-body">
        <p className="muted small">
          Всего павших:
          {" "}
          <b>{memorial.length}</b>
          . Они были хорошими мальчиками и девочками.
        </p>
        {list.length === 0 && (
          <div className="empty">
            <div className="big">🪦</div>
            <p>Пока пусто. Это ненадолго.</p>
          </div>
        )}
        {list.map((m, i) => (
          <div key={m.id} className="card grave pop-in" style={stagger(i, 50)}>
            <UnitAvatar unit={m.unit} size="md" dead animated={i < 12} />
            <div className="grow">
              <b>{displayName(m.unit)}</b>
              <div className="muted small">
                {unitClassName(m.unit)}
                , ур.
                {m.unit.level}
                {" "}
                ·
                {fmtDate(m.unit.createdAt)}
                {" "}
                —
                {fmtDate(m.diedAt)}
              </div>
              <div className="muted small">
                {m.reason === "released"
                  ? g(m.unit.gender, "Ушёл сам", "Ушла сама")
                  : [
                      g(m.unit.gender, "Пал", "Пала"),
                      m.biomeId ? ` (${biomeDef(m.biomeId).name})` : "",
                      m.killerName ? ` от лап ${m.killerName}` : "",
                      m.battleTurn ? `, ход ${m.battleTurn}` : ""
                    ].join("")}
                {" · "}
                боёв:
                {m.unit.history.battles}
                , убийств:
                {m.unit.history.kills}
              </div>
              <div className="epitaph">
                «
                {m.epitaph}
                »
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
