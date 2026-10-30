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
import { tr } from "@game/i18n"
import { Icon, IconText } from "../components/Icon"

/** Карточка бойца в панели сведений: аватар, имя, HP, статы, спецприём. Всегда развёрнута. */
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
  // Временные изменения статов: штраф держится до хода бойца, усиление — до начала его фазы
  // Бонус клетки, на которой стоит боец (заросли, укрытие)
  const ground = terrainInfo(state, bu.pos)
  const down = statChanges(bu.penalties)
  const up = statChanges(bu.bonuses)
  const stat = (k: Exclude<keyof Stats, "hp">, label: string) => {
    const d = (bu.bonuses[k] ?? 0) + (bu.penalties[k] ?? 0)
    return (
      <span className={d < 0 ? "bf-stat-down" : d > 0 ? "bf-stat-up" : ""}>
        <span className="bf-stat-label">{label}</span>
        <span className="bf-stat-value">
          <b>{st?.[k]}</b>
          {d !== 0 && <small>{d > 0 ? `+${d}` : `−${Math.abs(d)}`}</small>}
        </span>
      </span>
    )
  }
  const skills = enemy
    ? Object.values(unit.skills)
        // Оружие — в строке оружия, спецприём — плашкой под статами
        .filter((id): id is string => !!id && id !== unit.skills.weapon && id !== unit.skills.special)
        .map(id => skillInfo(id)?.name)
        .filter(Boolean)
    : []
  return (
    <>
      <div className={`bf-card bf-unit ${enemy ? "enemy" : ""}`}>
        <div className="bf-unit-avatar">
          <UnitAvatar unit={unit} size="sm" animated={!enemy} />
        </div>
        <div className="bf-unit-body">
          <div className="bf-unit-head">
            <b className="bf-unit-name">
              {unit.isBoss && <><Icon emoji="👑" />{" "}</>}
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
          </div>
          <div className="bf-muted bf-role"><IconText text={`${classRoleText(unit.classId)} · ${moveText(unit.classId)}`} /></div>
          {st && (
            <div className="bf-stats">
              {stat("str", STAT_LABELS.str)}
              {stat("mag", STAT_LABELS.mag)}
              {stat("spd", "Spd")}
              {stat("def", "Def")}
              {stat("res", "Res")}
            </div>
          )}
          {/* Спецприём и срок временных изменений статов — одним рядом под статами (какие статы изменены
              и на сколько, видно по цветным плашкам статов) */}
          {(special || down || up) && (
            <div className="bf-statuses">
              {special && (
                <span className={`bf-special ${bu.specialCd <= 0 ? "ready" : ""}`} title={special.desc}>
                  ✦
                  {" "}
                  {special.name}
                  {" "}
                  <b>{bu.specialCd}</b>
                </span>
              )}
              {down && (
                <span
                  className="bf-status bf-status-down"
                  title={tr(`Weakened: ${down} · until it acts`, `Ослаблен: ${down} · до его хода`)}
                >
                  {`▼ ${tr("until it acts", "до его хода")}`}
                </span>
              )}
              {up && (
                <span
                  className="bf-status bf-status-up"
                  title={tr(`Boosted: ${up} · until its next phase`, `Усилен: ${up} · до начала его фазы`)}
                >
                  {`▲ ${tr("until its phase", "до его фазы")}`}
                </span>
              )}
            </div>
          )}
          {enemy && skills.length > 0 && <div className="bf-muted bf-skills">{skills.join(" · ")}</div>}
          {extra}
        </div>
      </div>
      {/* Бонус клетки под бойцом — тонкой полоской под карточкой, в свободном месте над полем */}
      {ground.bonus && (
        <div className="bf-terrain" title={tr(`${ground.name}: bonus while standing here`, `${ground.name}: бонус, пока боец стоит здесь`)}>
          <span aria-hidden="true"><Icon emoji={ground.icon} /></span>
          <b>{ground.name}</b>
          <span>{ground.bonus}</span>
        </div>
      )}
    </>
  )
}
