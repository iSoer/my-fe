import type { BattleState, BattleUnit, UnitInstance } from "@game/core/types"
import { displayName, unitClass, unitClassName, unitWeapon } from "@game/core/units"
import { unitStatsInBattle } from "@game/core/battle/reducer"
import { skillInfo } from "@game/content/index"
import { specialDef } from "@game/content/skills/specials"
import { WEAPON_COLOR } from "@game/content/weapons"
import { UnitAvatar } from "../components/UnitAvatar"
import { classRoleText, moveText } from "../components/ClassInfo"
import { COLOR_CSS, atkLabel } from "../lib/format"

/** Компактная карточка бойца в нижней полосе: аватар, имя, HP, статы, спецприём. */
export function UnitCard({
  state,
  bu,
  unit,
  enemy = false,
  extra
}: {
  state: BattleState
  bu: BattleUnit
  unit: UnitInstance
  enemy?: boolean
  extra?: React.ReactNode
}) {
  const st = unitStatsInBattle(state, bu.unitId)
  const cls = unitClass(unit)
  const special = unit.skills.special ? specialDef(unit.skills.special) : undefined
  const pct = bu.maxHp > 0 ? Math.max(0, Math.min(100, (bu.hp / bu.maxHp) * 100)) : 0
  const hpCls = pct <= 25 ? "crit" : pct <= 50 ? "low" : ""
  const hasBonus = Object.values(bu.bonuses).some(v => v)
  const hasPenalty = Object.values(bu.penalties).some(v => v)
  const skills = enemy
    ? Object.values(unit.skills)
        .filter((id): id is string => !!id && id !== unit.skills.weapon)
        .map(id => skillInfo(id)?.name)
        .filter(Boolean)
    : []
  return (
    <div className={`bf-card bf-unit ${enemy ? "enemy" : ""}`}>
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
            · Ур.
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
        </div>
        <div className="bf-muted bf-role">{`${classRoleText(unit.classId)} · ${moveText(unit.classId)}`}</div>
        {st && (
          <div className="bf-stats">
            <span>
              {atkLabel(unit)}
              {" "}
              <b>{st.atk}</b>
            </span>
            <span>
              Spd
              {" "}
              <b>{st.spd}</b>
            </span>
            <span>
              Def
              {" "}
              <b>{st.def}</b>
            </span>
            <span>
              Res
              {" "}
              <b>{st.res}</b>
            </span>
            {hasBonus && <span className="bf-up">▲</span>}
            {hasPenalty && <span className="bf-down">▼</span>}
          </div>
        )}
        {enemy && skills.length > 0 && <div className="bf-muted bf-skills">{skills.join(" · ")}</div>}
        {extra}
      </div>
    </div>
  )
}
