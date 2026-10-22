import type { UnitInstance } from "@game/core/types"
import { unitSvg, type Pose } from "@game/art/index"
import { FUR_PALETTES, PATTERNS, ACCESSORIES } from "@game/content/appearance"

export type AvatarSize = "sm" | "md" | "lg" | "xl"
export type AvatarPose = "idle" | "happy" | "dead" | "run"

export interface UnitAvatarProps {
  unit: UnitInstance
  size?: AvatarSize
  pose?: AvatarPose
  /** Серый и с крестиками в глазах. */
  dead?: boolean
  /** Без хмурых бровей (пленник в Приюте). */
  friendly?: boolean
  /** Анимация бега (ноги, уши, покачивание). */
  running?: boolean
  /** Выключить CSS-анимации (длинные списки). */
  animated?: boolean
}

/** Миниатюра бойца: живой SVG в стиле cat-chase. */
export function UnitAvatar({
  unit,
  size = "md",
  pose = "idle",
  dead = false,
  friendly = false,
  running = false,
  animated = true
}: UnitAvatarProps) {
  const effPose: Pose = dead ? "dead" : pose
  const anim = animated && !dead
  const blinkDelay = -((unit.seed % 500) / 100)
  const svg = unitSvg(unit, { pose: effPose, animated: anim, blinkDelay, friendly })
  const a = unit.appearance
  const acc = ACCESSORIES[a.accessory] ?? ""
  const accText = acc && acc !== "Без аксессуара" ? `, ${acc.toLowerCase()}` : ""
  const title = `${FUR_PALETTES[a.furPalette]?.name ?? ""}, ${(PATTERNS[a.pattern] ?? "").toLowerCase()}${accText}`
  const cls = [
    "critter-svg",
    `critter-svg--${size}`,
    `critter-svg--${unit.species}`,
    `is-${effPose}`,
    running && anim ? "is-running" : "",
    anim ? "" : "is-static"
  ]
    .filter(Boolean)
    .join(" ")
  return <div className={cls} title={title} aria-label={title} dangerouslySetInnerHTML={{ __html: svg }} />
}
