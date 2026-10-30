import type { BattleState } from "@game/core/types"
import { displayName } from "@game/core/units"
import { terrainInfo } from "@game/content/terrain"
import type { BattleUiState } from "@game/state/battleUi"
import { UnitCard } from "./UnitCard"
import { tr } from "@game/i18n"
import { Icon } from "../components/Icon"
import { IconText } from "../components/Icon"

function AssistSummary({ state, ui }: { state: BattleState, ui: BattleUiState }) {
  const plan = ui.assistPlan
  const target = ui.targetId ? state.roster[ui.targetId] : undefined
  if (!plan || !plan.assist || !target) return null
  const parts: string[] = []
  if (plan.heal > 0) parts.push(tr(`heal +${plan.heal}`, `лечение +${plan.heal}`))
  if (plan.allHeal > 0) parts.push(tr(`all allies +${plan.allHeal}`, `все союзники +${plan.allHeal}`))
  if (plan.buffs.length)
    parts.push(
      plan.buffs
        .map(b =>
          Object.entries(b.stats)
            .map(([k, v]) => `${k.toUpperCase()} +${v}`)
            .join(", ")
        )
        .join("; ")
    )
  if (plan.moves.length) parts.push(tr("reposition", "перемещение"))
  if (plan.refresh) parts.push(tr("ally acts again", "союзник действует ещё раз"))
  if (plan.selfHpDelta) parts.push(tr(`self ${plan.selfHpDelta}`, `себе ${plan.selfHpDelta}`))
  if (plan.specialTriggered) parts.push(tr("special triggers", "сработает спецприём"))
  return (
    <div className="bf-card bf-assist">
      <b>
        <Icon emoji="🩹" />
        {" "}
        {plan.assist.name}
        {" "}
        →
        {" "}
        {displayName(target)}
      </b>
      <div className="bf-muted">{plan.assist.desc}</div>
      {parts.length > 0 && <div className="bf-assist-parts">{parts.join(" · ")}</div>}
    </div>
  )
}

/**
 * Панель сведений над полем: карточка бойца, предпросмотр Поддержки и удара по стене, справка о клетке. Ни кнопок
 * подтверждения, ни подсказок, как в FEH: действие подтверждает повторный тап по цели, отменяет — тап мимо.
 */
export function BottomBand({ battle, ui }: { battle: BattleState, ui: BattleUiState }) {
  const sel = ui.selectedId ? battle.units[ui.selectedId] : undefined
  const selUnit = ui.selectedId ? battle.roster[ui.selectedId] : undefined
  const card = sel && selUnit ? <UnitCard state={battle} bu={sel} unit={selUnit} /> : null
  if (ui.dragging) return card
  switch (ui.mode) {
    case "enemyInfo": {
      const bu = ui.infoId ? battle.units[ui.infoId] : undefined
      const unit = ui.infoId ? battle.roster[ui.infoId] : undefined
      if (!bu || !unit) return null
      return (
        <>
          <UnitCard
            state={battle}
            bu={bu}
            unit={unit}
            enemy={bu.side === "enemy"}
            extra={
              bu.side === "enemy"
                ? (
                    <div className="bf-muted bf-caption">{tr("Threat zone shown in purple", "Зона угрозы показана фиолетовым")}</div>
                  )
                : undefined
            }
          />
        </>
      )
    }
    case "tileInfo": {
      if (!ui.infoPos) return null
      const info = terrainInfo(battle, ui.infoPos)
      return (
        <>
          <div className="bf-card bf-assist" role="status">
            <div className="bf-tile-head">
              <span className="bf-tile-ico" aria-hidden="true"><Icon emoji={info.icon} /></span>
              <b className="grow">{info.name}</b>
              <span className="bf-muted bf-tile-kind">{tr("Tile", "Клетка")}</span>
            </div>
            {info.bonus && <div className="bf-status bf-status-terrain">{`${tr("Standing here", "Стоящему здесь")}: ${info.bonus}`}</div>}
            <div className="bf-muted"><IconText text={`🐾 ${info.move}`} /></div>
            {info.notes.map(n => <div key={n} className="bf-muted">{n}</div>)}
          </div>
        </>
      )
    }
    case "unitSelected":
      return (
        <>
          {card}
        </>
      )
    case "assistPreview":
      return (
        <>
          <AssistSummary state={battle} ui={ui} />
        </>
      )
    case "wallPreview":
      return (
        <>
          {card}
          <div className="bf-card bf-assist">
            <b><IconText text={tr("🧱 Break the flimsy wall", "🧱 Сломать хлипкую стену")} /></b>
            <div className="bf-muted">{tr("The wall loses 1 HP. At 0 HP the tile opens up.", "Стена потеряет 1 HP. При 0 HP клетка станет проходимой.")}</div>
          </div>
        </>
      )
    default:
      return null
  }
}
