import type { UnitInstance } from "@game/core/types"
import { displayName, unitClass, unitClassName, visibleStats } from "@game/core/units"
import { skillInfo } from "@game/content/index"
import { traitDef } from "@game/content/traits"
import { breedDef } from "@game/content/breeds"
import { personalityText } from "@game/content/personalities"
import { UnitAvatar } from "./UnitAvatar"
import { MoveBadge, RarityStars, WeaponBadge } from "./Badges"
import { StatsGrid } from "./Stats"
import { atkLabel, speciesName } from "../lib/format"
import { aptitudeLine, weaponLine } from "./CharacterPanels"

/** Полная карточка бойца для шторок (ростер, приют, выбор отряда). */
export function UnitDetails({ unit, compact = false }: { unit: UnitInstance, compact?: boolean }) {
  const cls = unitClass(unit)
  const stats = visibleStats(unit)
  const trait = unit.traitId ? traitDef(unit.traitId) : undefined
  const skillIds = Object.values(unit.skills).filter((id): id is string => !!id)
  return (
    <div className="stack">
      <div className="row">
        <UnitAvatar unit={unit} size="xl" pose="happy" />
        <div className="grow stack" style={{ gap: 4 }}>
          <h3>{displayName(unit)}</h3>
          <div className="muted small">
            {speciesName(unit)}
            {" "}
            ·
            {breedDef(unit.breedId).name}
            ,
            {unitClassName(unit)}
          </div>
          <div className="row wrap">
            <RarityStars rarity={unit.rarity} />
            <span className="muted small">
              Ур.
              {unit.level}
            </span>
          </div>
          <div className="row wrap">
            <MoveBadge classId={cls.id} />
            <WeaponBadge skill={cls.weaponSkill} />
          </div>
        </div>
      </div>
      <StatsGrid stats={stats} atkLabel={atkLabel(unit)} />
      <div className="muted small">
        {weaponLine(unit)}
        {" "}
        ·
        {aptitudeLine(unit)}
      </div>
      {trait && (
        <div className="card" style={{ padding: 10 }}>
          <b>
            Особенность:
            {trait.name}
          </b>
          <div className="muted small">{trait.desc}</div>
        </div>
      )}
      <div className="stack" style={{ gap: 6 }}>
        <b className="small muted">Навыки</b>
        {skillIds.map((id) => {
          const info = skillInfo(id)
          if (!info) return null
          return (
            <div key={id} className="skill-item">
              <div className="txt">
                <div>{info.name}</div>
                <div className="desc">{info.desc}</div>
              </div>
            </div>
          )
        })}
      </div>
      {!compact && (
        <p className="muted small">
          «
          {personalityText(unit.personalityId)}
          »
        </p>
      )}
    </div>
  )
}
