import type { BattleState, BattleUnit, Stats, UnitInstance } from "@game/core/types"
import { displayName, unitClass, unitClassName, unitWeapon } from "@game/core/units"
import { unitStatsInBattle } from "@game/core/battle/reducer"
import { skillInfo } from "@game/content/index"
import { specialDef } from "@game/content/skills/specials"
import { WEAPON_COLOR } from "@game/content/weapons"
import { UnitAvatar } from "../components/UnitAvatar"
import { classRoleText, moveText } from "../components/ClassInfo"
import { COLOR_CSS, STAT_LABELS, statChanges } from "../lib/format"
import { terrainInfo } from "@game/content/terrain"
import { FATIGUE, dishDef } from "@game/content/buildings"
import { fatigueOf } from "@game/core/settlement"
import { tr } from "@game/i18n"
import { useStore } from "@nanostores/react"
import { haptic } from "@game/platform/haptics"
import { $unitCardOpen, toggleUnitCard } from "./cardState"

/**
 * Карточка бойца в нижней полосе: аватар, имя, HP, статы, спецприём.
 * `collapsible` — карточка выбранного бойца: свёрнута до аватара, имени и класса, тап разворачивает и сворачивает.
 */
export function UnitCard({
  state,
  bu,
  unit,
  enemy = false,
  collapsible = false,
  extra
}: {
  state: BattleState
  bu: BattleUnit
  unit: UnitInstance
  enemy?: boolean
  collapsible?: boolean
  extra?: React.ReactNode
}) {
  const open = useStore($unitCardOpen) || !collapsible
  const toggle = collapsible
    ? {
        role: "button",
        tabIndex: 0,
        "aria-expanded": open,
        "aria-label": open ? tr("Hide fighter details", "Скрыть подробности о бойце") : tr("Show fighter details", "Подробнее о бойце"),
        onClick: () => {
          haptic("light")
          toggleUnitCard()
        },
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key !== "Enter" && e.key !== " ") return
          e.preventDefault()
          toggleUnitCard()
        }
      }
    : {}
  if (!open) {
    return (
      <div className={`bf-card bf-unit compact ${enemy ? "enemy" : ""}`} {...toggle}>
        <div className="bf-unit-avatar">
          <UnitAvatar unit={unit} size="sm" animated={!enemy} />
        </div>
        <div className="bf-unit-body">
          <b className="bf-unit-name">
            {unit.isBoss ? "👑 " : ""}
            {displayName(unit)}
          </b>
          <span className="bf-muted">{`${unitClassName(unit)} ${tr("· Lv.", "· Ур.")}${unit.level}`}</span>
        </div>
        <span className="bf-unit-toggle" aria-hidden="true">▲</span>
      </div>
    )
  }
  const st = unitStatsInBattle(state, bu.unitId)
  const cls = unitClass(unit)
  const special = unit.skills.special ? specialDef(unit.skills.special) : undefined
  const pct = bu.maxHp > 0 ? Math.max(0, Math.min(100, (bu.hp / bu.maxHp) * 100)) : 0
  const hpCls = pct <= 25 ? "crit" : pct <= 50 ? "low" : ""
  // Временные изменения статов: штраф держится до хода бойца, усиление — до начала его фазы
  // Бонус клетки, на которой стоит боец (заросли, укрытие)
  const ground = terrainInfo(state, bu.pos)
  const down = statChanges(bu.penalties)
  const meal = unit.meal ? dishDef(unit.meal) : undefined
  const up = statChanges(bu.bonuses)
  const stat = (k: Exclude<keyof Stats, "hp">, label: string) => {
    const d = (bu.bonuses[k] ?? 0) + (bu.penalties[k] ?? 0)
    return (
      <span className={d < 0 ? "bf-stat-down" : d > 0 ? "bf-stat-up" : ""}>
        {label}
        {" "}
        <b>{st?.[k]}</b>
        {d !== 0 && <small>{d > 0 ? `+${d}` : `−${Math.abs(d)}`}</small>}
      </span>
    )
  }
  const skills = enemy
    ? Object.values(unit.skills)
        .filter((id): id is string => !!id && id !== unit.skills.weapon)
        .map(id => skillInfo(id)?.name)
        .filter(Boolean)
    : []
  return (
    <div className={`bf-card bf-unit ${collapsible ? "expandable" : ""} ${enemy ? "enemy" : ""}`} {...toggle}>
      <div className="bf-unit-avatar">
        <UnitAvatar unit={unit} size="sm" animated={!enemy} />
      </div>
      <div className="bf-unit-body">
        <div className="bf-unit-head">
          <b className="bf-unit-name">
            {unit.isBoss ? "👑 " : ""}
            {displayName(unit)}
          </b>
          <span className={`bf-unit-hp ${hpCls}`}>
            {bu.hp}
            <small>
              /
              {bu.maxHp}
            </small>
          </span>
        </div>
        <div className={`bf-bar ${hpCls}`}>
          <div style={{ width: `${pct}%` }} />
        </div>
        <div className="bf-unit-meta">
          <span className="bf-weapon">
            <i style={{ background: COLOR_CSS[WEAPON_COLOR[cls.weaponSkill]] }} />
            {unitWeapon(unit).name}
          </span>
          <span className="bf-muted">
            {unitClassName(unit)}
            {" "}
            {tr("· Lv.", "· Ур.")}
            {unit.level}
          </span>
          {special && (
            <span className={`bf-special ${bu.specialCd <= 0 ? "ready" : ""}`} title={special.desc}>
              ✦
              {" "}
              {special.name}
              {" "}
              <b>{bu.specialCd}</b>
            </span>
          )}
          {ground.bonus && (
            <span
              className="bf-terrain"
              title={tr(`${ground.name}: bonus while standing here`, `${ground.name}: бонус, пока боец стоит здесь`)}
              aria-label={`${ground.name}: ${ground.bonus}`}
            >
              {`${ground.icon} ${ground.bonus}`}
            </span>
          )}
        </div>
        <div className="bf-muted bf-role">{`${classRoleText(unit.classId)} · ${moveText(unit.classId)}`}</div>
        {st && (
          <div className="bf-stats">
            {stat("str", STAT_LABELS.str)}
            {stat("mag", STAT_LABELS.mag)}
            {stat("spd", "Spd")}
            {stat("def", "Def")}
            {stat("res", "Res")}
          </div>
        )}
        {down && (
          <div className="bf-status bf-status-down">
            {`▼ ${tr("Weakened", "Ослаблен")}: ${down}`}
            <small>{tr(" · until it acts", " · до его хода")}</small>
          </div>
        )}
        {up && (
          <div className="bf-status bf-status-up">
            {`▲ ${tr("Boosted", "Усилен")}: ${up}`}
            <small>{tr(" · until its next phase", " · до начала его фазы")}</small>
          </div>
        )}
        {fatigueOf(unit) > 0 && (
          <div className="bf-status bf-status-down">
            {`😮‍💨 ${tr("Tired", "Устал")} ×${fatigueOf(unit)}: −${Math.round(fatigueOf(unit) * FATIGUE.perStack * 100)} %`}
            <small>{tr(" · cured at the Hospital", " · лечится в Больнице")}</small>
          </div>
        )}
        {meal && (
          <div className="bf-status bf-status-up">
            {`${meal.icon} ${meal.name}: ${meal.desc}`}
          </div>
        )}
        {enemy && skills.length > 0 && <div className="bf-muted bf-skills">{skills.join(" · ")}</div>}
        {extra}
        {collapsible && <div className="bf-unit-hide" aria-hidden="true">{`▼ ${tr("Hide", "Скрыть")}`}</div>}
      </div>
    </div>
  )
}
