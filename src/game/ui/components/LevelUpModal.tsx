import type { UnitInstance } from "@game/core/types"
import { STATS, attackStatOf } from "@game/core/types"
import { displayName, unitClassName, visibleStats } from "@game/core/units"
import { isMagicWeapon } from "@game/content/weapons"
import { Modal } from "./Sheet"
import { Button } from "./Button"
import { UnitAvatar } from "./UnitAvatar"
import { STAT_FULL, STAT_LABELS } from "../lib/format"
import { stagger } from "../lib/animate"
import { tr } from "@game/i18n"

/** Повышение уровня бойца: `unit` — уже после него, `from` / `to` — уровни до и после. */
export interface LevelUpView {
  unit: UnitInstance
  from: number
  to: number
}

/**
 * Экран нового уровня: все характеристики бойца «было → стало» с приростом.
 * Статы считаются как в карточке бойца (`visibleStats`: уровень, класс, оружие, навыки) на уровнях `from` и `to`.
 */
export function LevelUpModal({
  view,
  onClose,
  closeLabel
}: {
  view: LevelUpView | null
  onClose: () => void
  /** Подпись кнопки: «Дальше», если впереди ещё повышения. */
  closeLabel?: string
}) {
  if (!view) return null
  const { unit, from, to } = view
  const before = visibleStats({ ...unit, level: from })
  const after = visibleStats({ ...unit, level: to })
  const main = attackStatOf(isMagicWeapon(unit.weaponSkill))
  const total = STATS.reduce((sum, s) => sum + Math.max(0, after[s] - before[s]), 0)
  return (
    <Modal open onClose={onClose}>
      <div className="lvlup" role="dialog" aria-label={tr("Level up", "Новый уровень")}>
        <div className="lvlup-banner">{tr("Level up!", "Новый уровень!")}</div>
        <div className="lvlup-head">
          <UnitAvatar unit={unit} size="md" pose="happy" />
          <div className="lvlup-who">
            <b>{displayName(unit)}</b>
            <span className="muted small">{unitClassName(unit)}</span>
            <span className="lvlup-level">
              {`${tr("Lv.", "Ур.")} ${from}`}
              <span className="lvlup-arrow" aria-hidden="true">→</span>
              <b>{to}</b>
            </span>
          </div>
        </div>
        <div className="lvlup-stats">
          {STATS.map((s, i) => {
            const gain = after[s] - before[s]
            return (
              <div
                key={s}
                className={`lvlup-row pop-in ${gain > 0 ? "up" : ""} ${s === main ? "main" : ""}`}
                style={stagger(i, 70)}
                title={STAT_FULL[s]}
              >
                <span className="lvlup-label">{STAT_LABELS[s]}</span>
                <span className="lvlup-old">{before[s]}</span>
                <span className="lvlup-to" aria-hidden="true">→</span>
                <span className="lvlup-new">{after[s]}</span>
                <span className="lvlup-gain">{gain > 0 ? `+${gain}` : "—"}</span>
              </div>
            )
          })}
        </div>
        <div className="muted small lvlup-total">{tr(`Total +${total}`, `Всего +${total}`)}</div>
        <Button big primary block onClick={onClose}>
          {closeLabel ?? tr("Great!", "Отлично!")}
        </Button>
      </div>
    </Modal>
  )
}
