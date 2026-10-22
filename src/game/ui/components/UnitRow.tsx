import type { ReactNode } from "react"
import type { UnitInstance } from "@game/core/types"
import { displayName, unitClass, unitClassName, visibleStats } from "@game/core/units"
import { UnitAvatar } from "./UnitAvatar"
import { WeaponBadge, RarityStars } from "./Badges"
import { MOVE_EMOJI, atkLabel } from "../lib/format"
import { classRoleText } from "./ClassInfo"
import { stagger } from "../lib/animate"

export function UnitRow({
  unit,
  onClick,
  selected,
  dim,
  right,
  tags,
  animated = true,
  friendly = false,
  index
}: {
  unit: UnitInstance
  onClick?: () => void
  selected?: boolean
  dim?: boolean
  right?: ReactNode
  tags?: ReactNode
  animated?: boolean
  friendly?: boolean
  /** Индекс в списке для поочерёдного появления. */
  index?: number
}) {
  const cls = unitClass(unit)
  const st = visibleStats(unit)
  return (
    <div
      className={[
        "card unit-row",
        onClick ? "clickable" : "",
        selected ? "selected" : "",
        dim ? "dim" : "",
        index !== undefined ? "pop-in" : ""
      ].join(" ")}
      style={index !== undefined ? stagger(index) : undefined}
      onClick={onClick}
    >
      <UnitAvatar unit={unit} size="md" animated={animated} friendly={friendly} />
      <div className="info">
        <div className="name">{displayName(unit)}</div>
        <div className="sub">
          <span>{`${MOVE_EMOJI[cls.moveType]} ${unitClassName(unit)} · ${classRoleText(unit.classId)}`}</span>
          <WeaponBadge skill={cls.weaponSkill} />
          {tags}
        </div>
        <div className="mini-stats">
          <span>
            HP
            {" "}
            <b>{st.hp}</b>
          </span>
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
        </div>
      </div>
      <div className="side">
        <span className="lvl">
          Ур.
          {unit.level}
        </span>
        <RarityStars rarity={unit.rarity} />
        {right}
      </div>
    </div>
  )
}
