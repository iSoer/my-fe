import type { BattleState } from "@game/core/types"
import { displayName } from "@game/core/units"
import { cancel, confirm, type BattleUiState } from "@game/state/battleUi"
import { haptic } from "@game/platform/haptics"
import { UnitCard } from "./UnitCard"
import { tr } from "@game/i18n"

function Pill({
  label,
  primary,
  danger,
  big,
  onClick
}: {
  label: string
  primary?: boolean
  danger?: boolean
  big?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`bf-pill-btn ${primary ? "primary" : ""} ${danger ? "danger" : ""} ${big ? "big" : ""}`}
      onClick={() => {
        haptic("light")
        onClick()
      }}
    >
      {label}
    </button>
  )
}

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
        🩹
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

/** Нижняя полоса: карточка бойца, подсказки и кнопки подтверждения по режиму. */
export function BottomBand({ battle, ui }: { battle: BattleState, ui: BattleUiState }) {
  const isPlayer = battle.phase === "player"
  const sel = ui.selectedId ? battle.units[ui.selectedId] : undefined
  const selUnit = ui.selectedId ? battle.roster[ui.selectedId] : undefined
  const card = sel && selUnit ? <UnitCard state={battle} bu={sel} unit={selUnit} /> : null
  const hint = (text: string, cls = "") => <div className={`bf-hint ${cls}`}>{text}</div>
  const cancelRow = (
    <div className="bf-actions">
      <Pill label={tr("Cancel", "Отмена")} onClick={cancel} />
    </div>
  )

  if (ui.dragging) {
    const bad = !!ui.dragHover && !ui.dragValid
    return (
      <>
        {card}
        {hint(bad ? tr("Can’t go here", "Сюда нельзя") : tr("Drop the fighter on a tile", "Отпустите бойца на клетке"), bad ? "danger" : "accent")}
      </>
    )
  }
  switch (ui.mode) {
    case "busy":
      return hint(isPlayer ? tr("Animating…", "Анимация…") : tr("Enemy turn…", "Ход противника…"), "thin")
    case "ended":
      return hint(tr("Battle over", "Бой окончен"), "thin")
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
          <div className="bf-actions">
            <Pill label={tr("Close", "Закрыть")} onClick={cancel} />
          </div>
        </>
      )
    }
    case "unitSelected":
    case "movedPreview":
      return card
    case "moveTargeting":
      return (
        <>
          {card}
          {hint(tr("Pick a tile or drag the fighter", "Выберите клетку или перетащите бойца"))}
          {cancelRow}
        </>
      )
    case "attackTargeting":
      return (
        <>
          {card}
          {hint(tr("Pick a target", "Выберите цель"), "accent")}
          {cancelRow}
        </>
      )
    case "assistTargeting":
      return (
        <>
          {card}
          {hint(tr("Pick an ally", "Выберите союзника"), "accent")}
          {cancelRow}
        </>
      )
    case "forecast":
      return (
        <div className="bf-actions">
          <Pill label={tr("Cancel", "Отмена")} onClick={cancel} />
          <Pill label={tr("Attack", "Атаковать")} primary big onClick={() => void confirm()} />
        </div>
      )
    case "assistPreview":
      return (
        <>
          <AssistSummary state={battle} ui={ui} />
          <div className="bf-actions">
            <Pill label={tr("Cancel", "Отмена")} onClick={cancel} />
            <Pill label={tr("Apply", "Применить")} primary big onClick={() => void confirm()} />
          </div>
        </>
      )
    case "wallPreview":
      return (
        <>
          {card}
          <div className="bf-card bf-assist">
            <b>{tr("🧱 Break the flimsy wall", "🧱 Сломать хлипкую стену")}</b>
            <div className="bf-muted">{tr("The wall loses 1 HP. At 0 HP the tile opens up.", "Стена потеряет 1 HP. При 0 HP клетка станет проходимой.")}</div>
          </div>
          <div className="bf-actions">
            <Pill label={tr("Cancel", "Отмена")} onClick={cancel} />
            <Pill label={tr("Break", "Сломать")} primary big onClick={() => void confirm()} />
          </div>
        </>
      )
    default:
      return isPlayer
        ? hint(tr("Tap a fighter for actions, drag to move", "Тап по бойцу — меню действий, перетащите его — ход"), "thin")
        : hint(tr("Enemy turn…", "Ход противника…"), "thin")
  }
}
