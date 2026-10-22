import type { Rarity, WeaponSkill } from "@game/core/types"
import { WEAPON_COLOR } from "@game/content/weapons"
import { classInfo } from "@game/content/classes"
import { SKILL_LABELS } from "@shared/character/skills"
import { COLOR_CSS, MOVE_EMOJI } from "../lib/format"
import { tr } from "@game/i18n"

/** Оружейный навык модели (`SKILL_LABELS`) с цветом треугольника. */
export function WeaponBadge({ skill, name }: { skill: WeaponSkill, name?: string }) {
  return (
    <span className="badge">
      <span className="dot" style={{ background: COLOR_CSS[WEAPON_COLOR[skill]] }} />
      {name ?? SKILL_LABELS[skill]}
    </span>
  )
}

/** Передвижение класса так, как его показывает модель (животное или тип движения), и дальность хода. */
export function MoveBadge({ classId }: { classId: string }) {
  const info = classInfo(classId)
  return (
    <span className="badge" title={info.moveNote}>
      {`${MOVE_EMOJI[info.moveType]} ${info.moveLabel} · ${tr("move", "ход")} ${info.moveRange}`}
    </span>
  )
}

export function RarityStars({ rarity }: { rarity: Rarity }) {
  return (
    <span className="stars" aria-label={tr(`Rarity ${rarity}`, `Редкость ${rarity}`)}>
      {"★".repeat(rarity)}
      <span style={{ opacity: 0.25 }}>{"★".repeat(5 - rarity)}</span>
    </span>
  )
}
