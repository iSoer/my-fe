import { useState } from "react"
import { useStore } from "@nanostores/react"
import type { MemorialEntry } from "@game/core/types"
import { displayName, unitClassName } from "@game/core/units"
import { biomeDef } from "@game/content/biomes"
import { GRAVEYARD } from "@game/content/settlement"
import { buildingLevel, freeRosterSlots, reviveStatus, revivable, rosterCapacity } from "@game/core/settlement"
import { $save } from "@game/state/save"
import { reviveAction } from "@game/state/settlement"
import { haptic } from "@game/platform/haptics"
import { TopBar } from "../components/TopBar"
import { Button } from "../components/Button"
import { ConfirmModal } from "../components/Sheet"
import { UnitAvatar } from "../components/UnitAvatar"
import { useToast } from "../components/Toast"
import { useNow } from "../settlement/BuildingPanel"
import { fmtDate, fmtDuration, g } from "../lib/format"
import { stagger } from "../lib/animate"
import { tr } from "@game/i18n"

/** Кладбище: история павших; на 5-м уровне здания — воскрешение одного бойца в игровой день. */
export function MemorialScreen() {
  const save = useStore($save)
  const memorial = save.memorial
  const list = [...memorial].reverse()
  const now = useNow(1000)
  const [toastEl, toast] = useToast()
  const [confirm, setConfirm] = useState<MemorialEntry | null>(null)
  const [busy, setBusy] = useState(false)
  const level = buildingLevel(save, "graveyard")
  const status = reviveStatus(save, now)
  const canPick = new Set(revivable(save).map(m => m.id))
  const full = freeRosterSlots(save) === 0

  const doRevive = () => {
    if (!confirm || busy) return
    setBusy(true)
    const r = reviveAction(confirm.id)
    setBusy(false)
    setConfirm(null)
    if (!r.ok) return toast(r.error, true)
    haptic("success")
    toast(tr(`${displayName(r.unit)} is back in the Barracks!`, `${displayName(r.unit)} снова в Казармах!`))
  }

  return (
    <div className="screen">
      <TopBar title={tr("Graveyard", "Кладбище")} />
      <div className="screen-body">
        <p className="muted small">
          {tr("Total fallen:", "Всего павших:")}
          {" "}
          <b>{memorial.length}</b>
          {tr(". They were good boys and girls.", ". Они были хорошими мальчиками и девочками.")}
        </p>
        {level > 0 && (
          <div className={`st-revive ${status.unlocked && status.readyToday ? "is-ready" : ""}`}>
            {level < GRAVEYARD.reviveLevel
              ? tr(`🔒 Graveyard level ${level}: resurrection opens at level ${GRAVEYARD.reviveLevel}.`, `🔒 Кладбище ${level}-го уровня: воскрешение откроется на ${GRAVEYARD.reviveLevel}-м.`)
              : status.readyToday
                ? full
                  ? tr(`✨ A resurrection is ready, but the Barracks are full (${rosterCapacity(save)}).`, `✨ Воскрешение готово, но в Казармах нет мест (${rosterCapacity(save)}).`)
                  : tr("✨ You can bring back one fallen fighter today. They return without gear.", "✨ Сегодня можно вернуть одного павшего. Он вернётся без снаряжения.")
                : tr(`⏳ Next resurrection in ${fmtDuration((status.nextAt ?? now) - now)}.`, `⏳ Следующее воскрешение через ${fmtDuration((status.nextAt ?? now) - now)}.`)}
          </div>
        )}
        {list.length === 0 && (
          <div className="empty">
            <div className="big">🪦</div>
            <p>{tr("Empty for now. Not for long.", "Пока пусто. Это ненадолго.")}</p>
          </div>
        )}
        {list.map((m, i) => (
          <div key={m.id} className="card grave pop-in" style={stagger(i, 50)}>
            <UnitAvatar unit={m.unit} size="md" dead animated={i < 12} />
            <div className="grow">
              <b>{displayName(m.unit)}</b>
              {m.revivedAt !== undefined && <span className="chip gold" style={{ marginLeft: 6 }}>{tr("Revived", g(m.unit.gender, "Воскрешён", "Воскрешена"))}</span>}
              <div className="muted small">
                {unitClassName(m.unit)}
                {tr(", lv.", ", ур.")}
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
                  ? tr("Left on their own", g(m.unit.gender, "Ушёл сам", "Ушла сама"))
                  : [
                      tr("Fell", g(m.unit.gender, "Пал", "Пала")),
                      m.biomeId ? ` (${biomeDef(m.biomeId).name})` : "",
                      m.killerName ? tr(` at the paws of ${m.killerName}`, ` от лап ${m.killerName}`) : "",
                      m.battleTurn ? `, ${tr("turn", "ход")} ${m.battleTurn}` : ""
                    ].join("")}
                {" · "}
                {tr("battles:", "боёв:")}
                {m.unit.history.battles}
                {tr(", kills:", ", убийств:")}
                {m.unit.history.kills}
              </div>
              <div className="epitaph">
                «
                {m.epitaph}
                »
              </div>
              {status.unlocked && canPick.has(m.id) && (
                <Button sm primary={status.readyToday && !full} disabled={!status.readyToday || full || busy} icon="✨" onClick={() => setConfirm(m)}>
                  {tr("Revive", "Воскресить")}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
      <ConfirmModal
        open={!!confirm}
        title={tr("Revive this fighter?", "Воскресить бойца?")}
        confirmLabel={tr("Revive", "Воскресить")}
        onClose={() => setConfirm(null)}
        onConfirm={doRevive}
        text={confirm && (
          <div className="row" style={{ gap: 10, alignItems: "center" }}>
            <UnitAvatar unit={confirm.unit} size="md" animated={false} />
            <div className="stack" style={{ gap: 2 }}>
              <b>{displayName(confirm.unit)}</b>
              <span>{`${unitClassName(confirm.unit)}, ${tr("lv.", "ур.")} ${confirm.unit.level}`}</span>
              <span>{tr("Returns to the Barracks without gear: a wooden weapon, no talisman. Lost items stay lost. Only one resurrection per day.", "Вернётся в Казармы без снаряжения: деревянное оружие, без талисмана. Потерянные вещи не вернутся. Воскрешение — одно в день.")}</span>
            </div>
          </div>
        )}
      />
      {toastEl}
    </div>
  )
}
