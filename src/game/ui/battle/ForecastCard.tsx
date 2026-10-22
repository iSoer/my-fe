import { useEffect, useState } from "react"
import type { BattleState, UnitInstance } from "@game/core/types"
import type { CombatOutcome, CombatSideResult } from "@game/core/combat"
import { specialDef } from "@game/content/skills/specials"
import { WEAPON_COLOR } from "@game/content/weapons"
import { UnitAvatar } from "../components/UnitAvatar"
import { COLOR_CSS } from "../lib/format"

/** Полоска HP, которая за кадр проезжает от «до» к «после»; новый прогноз монтирует её заново (key). */
function HpBar(props: { before: number, after: number, max: number }) {
  return <HpBarFill key={`${props.before}:${props.after}:${props.max}`} {...props} />
}

function HpBarFill({ before, after, max }: { before: number, after: number, max: number }) {
  const pctBefore = max > 0 ? Math.max(0, Math.min(100, (before / max) * 100)) : 0
  const pctAfter = max > 0 ? Math.max(0, Math.min(100, (after / max) * 100)) : 0
  const [w, setW] = useState(pctBefore)
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setW(pctAfter)))
    return () => cancelAnimationFrame(id)
  }, [pctAfter])
  const cls = pctAfter <= 25 ? "crit" : pctAfter <= 50 ? "low" : ""
  return (
    <div className={`bf-bar bf-bar-fc ${cls}`}>
      <div className="bf-bar-lost" style={{ width: `${pctBefore}%` }} />
      <div style={{ width: `${w}%` }} />
    </div>
  )
}

function Side({
  unit,
  res,
  max,
  hits,
  effective,
  enemy,
  dies,
  canCounter
}: {
  unit: UnitInstance
  res: CombatSideResult
  max: number
  hits: number
  effective: boolean
  enemy: boolean
  dies: boolean
  canCounter: boolean
}) {
  const skill = unit.weaponSkill
  return (
    <div
      className={`bf-fc-side ${enemy ? "enemy" : "player"} ${dies ? "dies" : ""} ${res.hpAfter < res.hpBefore ? "loss" : ""}`}
    >
      <div className="bf-fc-top">
        <UnitAvatar unit={unit} size="sm" animated={false} />
        <div className="bf-fc-names">
          <b>{unit.name}</b>
          <i className="bf-fc-weapon" style={{ background: COLOR_CSS[WEAPON_COLOR[skill]] }} />
        </div>
      </div>
      <div className="bf-fc-hp">
        <span className="before">{res.hpBefore}</span>
        <span className="arrow">→</span>
        <span className={`after ${dies ? "dead" : ""}`}>{Math.max(0, res.hpAfter)}</span>
      </div>
      <HpBar before={res.hpBefore} after={Math.max(0, res.hpAfter)} max={max} />
      <div className="bf-fc-dmg">
        {hits > 0
          ? (
              <>
                {res.damagePerHit}
                {" "}
                <small>
                  ×
                  {hits}
                </small>
              </>
            )
          : (
              <small className="bf-muted">{canCounter ? "—" : "не контратакует"}</small>
            )}
      </div>
      <div className="bf-fc-tags">
        {res.specialTriggered && res.specialId && (
          <span className="bf-tag gold">
            ✦
            {specialDef(res.specialId).name}
          </span>
        )}
        {effective && hits > 0 && <span className="bf-tag red">×1.5</span>}
        {dies && !enemy && <span className="bf-tag death">☠ ПОГИБНЕТ</span>}
        {dies && enemy && <span className="bf-tag kill">☠ погибнет</span>}
      </div>
    </div>
  )
}

/** Прогноз боя в стиле FEH: две колонки, игрок слева. */
export function ForecastCard({ state, forecast }: { state: BattleState, forecast: CombatOutcome }) {
  const f = forecast
  const a = state.roster[f.attacker.unitId]
  const d = state.roster[f.defender.unitId]
  const aBu = state.units[f.attacker.unitId]
  const dBu = state.units[f.defender.unitId]
  if (!a || !d || !aBu || !dBu) return null
  const playerIsAttacker = aBu.side === "player"
  const left = playerIsAttacker
    ? { unit: a, res: f.attacker, bu: aBu, eff: f.attackerEffective, can: true }
    : { unit: d, res: f.defender, bu: dBu, eff: f.defenderEffective, can: f.defenderCanCounter }
  const right = playerIsAttacker
    ? { unit: d, res: f.defender, bu: dBu, eff: f.defenderEffective, can: f.defenderCanCounter }
    : { unit: a, res: f.attacker, bu: aBu, eff: f.attackerEffective, can: true }
  const tri = f.triangle
  const triLeft = playerIsAttacker ? tri : tri === "adv" ? "dis" : tri === "dis" ? "adv" : "neutral"
  return (
    <div className="bf-card bf-forecast" role="status" aria-label="Прогноз боя">
      <Side
        unit={left.unit}
        res={left.res}
        max={left.bu.maxHp}
        hits={left.res.hits}
        effective={left.eff}
        enemy={false}
        dies={left.res.hpAfter <= 0}
        canCounter={left.can}
      />
      <div className="bf-fc-mid">
        <span className={`bf-tri ${triLeft}`}>{triLeft === "adv" ? "▲" : triLeft === "dis" ? "▼" : "•"}</span>
        <span className="bf-fc-vs">VS</span>
        {(playerIsAttacker ? f.attackerFollowUp : f.defenderFollowUp) && <span className="bf-tag tiny">×2</span>}
      </div>
      <Side
        unit={right.unit}
        res={right.res}
        max={right.bu.maxHp}
        hits={right.res.hits}
        effective={right.eff}
        enemy
        dies={right.res.hpAfter <= 0}
        canCounter={right.can}
      />
    </div>
  )
}
