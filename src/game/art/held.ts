/**
 * Оружие в лапах миниатюры (viewBox 0 -28 120 140): вид — форма, грейд — материал (палитра `MATERIAL` иконок),
 * разновидность — цвет гарды/оковки и камень. Предмет рисуется в своей системе координат: хват в (0, 0),
 * остриё вверх (−y); поза задаёт положение лапы и наклон. Лапа рисуется поверх рукояти (хват).
 */
import type { WeaponGrade, WeaponSkill } from "@shared/character/skills"
import type { WeaponVariant } from "@game/core/skills/types"
import { HANDLE, MATERIAL, VARIANT_GEM, type Material } from "./gear"

const INK = "#3b2614"
const GOLD = "#ffd166"
const GOLD_DARK = "#b8860b"
const PAGE = "#f6efdc"
const RUNE = "#9d4edd"
const HOLY = "#8fd3f4"

/** Цвет гарды/оковки разновидности: Killer — красный, Brave — золото, «-slayer» — зелёный. */
const VARIANT_TRIM: Partial<Record<WeaponVariant, { fill: string, line: string }>> = {
  killer: { fill: "#d62839", line: "#7a0f1a" },
  brave: { fill: GOLD, line: GOLD_DARK },
  armorslayer: { fill: "#52b788", line: "#1f5f43" },
  cavslayer: { fill: "#52b788", line: "#1f5f43" }
}

interface Kit {
  m: Material
  /** Гарда, оковка, кольца: цвет разновидности или темнее материала. */
  trim: { fill: string, line: string }
  /** Рукоять/древко: у деревянного — темнее, чтобы отличаться от клинка. */
  handle: string
  gem?: string
  grade: WeaponGrade
  variant: WeaponVariant
}

const f1 = (n: number): string => (Math.round(n * 10) / 10).toString()

function kit(grade: WeaponGrade, variant: WeaponVariant): Kit {
  const m = MATERIAL[grade]
  const trim = VARIANT_TRIM[variant] ?? { fill: grade === "wood" ? m.dark : m.base, line: m.dark }
  const gem = VARIANT_GEM[variant]
  return { m, trim, handle: grade === "wood" ? "#5e3a20" : HANDLE, grade, variant, ...(gem ? { gem } : {}) }
}

function gem(k: Kit, x: number, y: number, r = 2.8): string {
  return k.gem ? `<circle cx="${x}" cy="${y}" r="${r}" fill="${k.gem}" stroke="${INK}" stroke-width=".9" /><circle cx="${f1(x - r * 0.35)}" cy="${f1(y - r * 0.35)}" r="${f1(r * 0.3)}" fill="#fff" opacity=".8" />` : ""
}

/** Блик серебра: четырёхлучевая искра. */
function sparkle(k: Kit, x: number, y: number, r = 4): string {
  if (k.grade !== "silver") return ""
  return `<path d="M${x} ${y - r} L${f1(x + r * 0.25)} ${f1(y - r * 0.25)} L${x + r} ${y} L${f1(x + r * 0.25)} ${f1(y + r * 0.25)} L${x} ${y + r} L${f1(x - r * 0.25)} ${f1(y + r * 0.25)} L${x - r} ${y} L${f1(x - r * 0.25)} ${f1(y - r * 0.25)} z" fill="#fff" />`
}

/** Древко/рукоять: тёмная кромка и цвет дерева. */
function pole(k: Kit, y1: number, y2: number, w: number): string {
  return `<path d="M0 ${y1} V${y2}" stroke="${INK}" stroke-width="${w + 2}" stroke-linecap="round" opacity=".75" />`
    + `<path d="M0 ${y1} V${y2}" stroke="${k.handle}" stroke-width="${w}" stroke-linecap="round" />`
    + `<path d="M${f1(-w * 0.22)} ${y1 - 1} V${y2 + 1}" stroke="#fff" stroke-width="${f1(w * 0.25)}" opacity=".18" />`
}

function sword(k: Kit): string {
  const { m, trim } = k
  const brave = k.variant === "brave"
  // у Brave — второй, призрачный клинок за основным
  const ghost = brave ? `<path d="M4 -8 L4 -38 L9 -45 L11 -37 L9 -8 Z" fill="${m.light}" stroke="${m.dark}" stroke-width="1.2" stroke-linejoin="round" opacity=".7" />` : ""
  return `${ghost}<path d="M-4.6 -8 L-4.6 -37 L0 -47 L4.6 -37 L4.6 -8 Z" fill="${m.base}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round" />`
    + `<path d="M-3 -9 L-3 -37 L0 -43.5 L0 -9 Z" fill="${m.light}" opacity=".75" />`
    + `<path d="M0 -10 V-39" stroke="${m.dark}" stroke-width="1" opacity=".6" />`
    + `<rect x="-11" y="-11" width="22" height="5" rx="2.5" fill="${trim.fill}" stroke="${INK}" stroke-width="1.3" />`
    + pole(k, -6, 6, 4.4)
    + `<circle cx="0" cy="8.5" r="3.4" fill="${trim.fill}" stroke="${INK}" stroke-width="1.2" />`
    + gem(k, 0, -8.5) + sparkle(k, -6, -36)
}

function spear(k: Kit): string {
  const { m, trim } = k
  const brave = k.variant === "brave"
  const tines = brave
    ? `<path d="M-3 -54 Q-9 -58 -9 -66 Q-5 -61 -2 -59 Z M3 -54 Q9 -58 9 -66 Q5 -61 2 -59 Z" fill="${m.base}" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round" />`
    : ""
  return pole(k, 24, -52, 3.4)
    + `<circle cx="0" cy="24.5" r="2.4" fill="${trim.fill}" stroke="${INK}" stroke-width="1" />`
    + tines
    + `<path d="M0 -76 Q8 -65 5.5 -57 L0 -53 L-5.5 -57 Q-8 -65 0 -76 Z" fill="${m.base}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round" />`
    + `<path d="M0 -72 Q-6 -64 -3.6 -57.5 L0 -55 Z" fill="${m.light}" opacity=".75" />`
    + `<rect x="-3.8" y="-55" width="7.6" height="5.5" rx="1.5" fill="${trim.fill}" stroke="${INK}" stroke-width="1.1" />`
    + `<path d="M-3 -46 l6 3 M-3 -42 l6 3" stroke="${k.variant === "basic" ? "#c0392b" : trim.fill}" stroke-width="1.6" stroke-linecap="round" />`
    + gem(k, 0, -52.3, 2.4) + sparkle(k, -6, -68, 3.5)
}

function axe(k: Kit): string {
  const { m, trim } = k
  const double = k.variant === "brave"
  const blade = "M2 -40 C9 -42 15 -46 18 -51 C25 -40 25 -24 18 -14 C15 -19 9 -22 2 -24 Z"
  const back = double
    ? `<path d="M-2 -40 C-9 -42 -13 -45 -15 -49 C-21 -40 -21 -25 -15 -16 C-13 -20 -9 -22 -2 -24 Z" fill="${m.base}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round" />`
    : `<path d="M-2 -38 L-9 -35 L-9 -29 L-2 -27 Z" fill="${m.dark}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round" />`
  return pole(k, 12, -42, 4)
    + back
    + `<path d="${blade}" fill="${m.base}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round" />`
    + `<path d="M18.5 -46 C23 -38 23 -27 18.5 -19" fill="none" stroke="${m.light}" stroke-width="2.4" stroke-linecap="round" />`
    + `<rect x="-3.6" y="-42" width="7.2" height="19" rx="2" fill="${trim.fill}" stroke="${INK}" stroke-width="1.2" />`
    + `<circle cx="0" cy="12.5" r="2.6" fill="${trim.fill}" stroke="${INK}" stroke-width="1" />`
    + gem(k, 0, -32.5, 2.4) + sparkle(k, 21, -30, 3.5)
}

/** Кастет — латная рукавица на кулаке: пальцы-сегменты, костяшки (у Killer — шипы), манжета цвета разновидности. */
function gauntlet(k: Kit): string {
  const { m, trim } = k
  const killer = k.variant === "killer"
  const knuckle = (x: number): string => killer
    ? `<path d="M${x - 2.2} -7.5 L${x} -14 L${x + 2.2} -7.5 Z" fill="${m.light}" stroke="${INK}" stroke-width=".9" stroke-linejoin="round" />`
    : `<circle cx="${x}" cy="-7.6" r="2.3" fill="${m.light}" stroke="${INK}" stroke-width=".9" />`
  return `<rect x="-7.5" y="4" width="15" height="6.5" rx="2.5" fill="${trim.fill}" stroke="${INK}" stroke-width="1.2" />`
    + `<path d="M-9 -2 Q-9.5 -9 -4 -9.5 H4 Q9.5 -9 9 -2 L8.5 3 Q8 6 4 6 H-4 Q-8 6 -8.5 3 Z" fill="${m.base}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round" />`
    + `<path d="M-3 -9 V-2 M3 -9 V-2 M-8.5 -2 H8.5" stroke="${m.dark}" stroke-width="1.1" fill="none" />`
    + `<path d="M-6.5 -7.5 Q-6.5 -4 -6 -3" stroke="${m.light}" stroke-width="1.6" fill="none" stroke-linecap="round" />`
    + knuckle(-5.6) + knuckle(0) + knuckle(5.6)
    + gem(k, 0, 2.2, 2) + sparkle(k, 9, -12, 3)
}

function bow(k: Kit, arrow: boolean): string {
  const { m, trim } = k
  // классический лук «D»: плечи выгнуты наружу, рукоять в середине — в лапе; концы с завитками
  const limb = "M-11 -28 C-5 -27 4 -17 3 0 C4 17 -5 27 -11 28"
  const tips = "M-11 -28 q-2.5 -1 -2 -5 M-11 28 q-2.5 1 -2 5"
  const pull = arrow ? -20 : -11
  const shaft = arrow
    ? `<path d="M-20 0 H20" stroke="${INK}" stroke-width="3" stroke-linecap="round" opacity=".7" /><path d="M-20 0 H20" stroke="#d9b98c" stroke-width="1.6" stroke-linecap="round" />`
      + `<path d="M26 0 L18 -4.2 L18 4.2 Z" fill="${m.base}" stroke="${INK}" stroke-width="1" stroke-linejoin="round" />`
      + `<path d="M-19 0 l-4 -4.5 h4 l3 4.5 z M-19 0 l-4 4.5 h4 l3 -4.5 z" fill="#e63946" stroke="#8d1c1c" stroke-width=".6" />`
    : ""
  // в покое лук повёрнут тетивой наружу: плечи не заходят на мордочку
  const flip = arrow ? "" : " transform=\"scale(-1 1)\""
  return `<g${flip}><path d="M-11 -28 L${pull} 0 L-11 28" fill="none" stroke="#f1e9da" stroke-width="1.3" />`
    + `<path d="M-11 -28 L${pull} 0 L-11 28" fill="none" stroke="${INK}" stroke-width=".5" opacity=".5" />`
    + `<path d="${limb} ${tips}" fill="none" stroke="${INK}" stroke-width="6.4" stroke-linecap="round" stroke-linejoin="round" opacity=".8" />`
    + `<path d="${limb} ${tips}" fill="none" stroke="${m.base}" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round" />`
    + `<path d="M-9 -28 C-4 -26 1 -18 1.6 -8" fill="none" stroke="${m.light}" stroke-width="1.4" stroke-linecap="round" opacity=".9" />`
    + `<rect x="-0.5" y="-6" width="7" height="12" rx="2.5" fill="${trim.fill === m.base ? k.handle : trim.fill}" stroke="${INK}" stroke-width="1" />`
    + shaft + gem(k, 3, -14, 2.2) + sparkle(k, -2, -24, 3.5) + "</g>"
}

/** Раскрытый гримуар над лапой: обложка цвета материала, руны на страницах, парящая печать. */
function grimoire(k: Kit): string {
  const { m, trim } = k
  const cover = k.grade === "wood" ? "#7b4a2a" : m.base
  // печать парит справа над книгой, мимо мордочки
  const sx = 13
  const sy = -33
  let star = ""
  for (let i = 0; i < 5; i++) {
    const a = (-90 + i * 144) * Math.PI / 180
    star += `${i === 0 ? "M" : "L"}${f1(sx + 6 * Math.cos(a))} ${f1(sy + 6 * Math.sin(a))} `
  }
  return `<circle cx="${sx}" cy="${sy}" r="11" fill="${RUNE}" opacity=".2" />`
    + `<circle cx="${sx}" cy="${sy}" r="8" fill="none" stroke="${RUNE}" stroke-width="1.6" opacity=".9" />`
    + `<path d="${star}z" fill="none" stroke="${RUNE}" stroke-width="1.3" stroke-linejoin="round" />`
    + `<g fill="${RUNE}"><circle cx="2" cy="-30" r="1.4" /><circle cx="22" cy="-45" r="1.2" /><circle cx="24" cy="-22" r="1" /></g>`
    + `<path d="M-17 -5 L-18 -24 Q-9 -27 0 -23 Q9 -27 18 -24 L17 -5 Q9 -8 0 -4 Q-9 -8 -17 -5 Z" fill="${cover}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round" />`
    + `<path d="M-15 -8 L-15.6 -22 Q-8 -24.5 0 -21 L0 -6.5 Q-8 -10 -15 -8 Z" fill="${PAGE}" stroke="#8d7b68" stroke-width=".8" />`
    + `<path d="M15 -8 L15.6 -22 Q8 -24.5 0 -21 L0 -6.5 Q8 -10 15 -8 Z" fill="#ece2c8" stroke="#8d7b68" stroke-width=".8" />`
    + `<path d="M-12 -18 h8 M-12 -14.5 h6 M-12 -11 h7 M4 -18 h8 M5 -14.5 h6" stroke="${RUNE}" stroke-width="1.3" stroke-linecap="round" />`
    + `<path d="M0 -21 V-5" stroke="${m.dark}" stroke-width="1.2" />`
    + `<rect x="-3" y="-7" width="6" height="4.5" rx="1.2" fill="${trim.fill}" stroke="${INK}" stroke-width=".9" />`
    + gem(k, 0, -4.8, 2) + sparkle(k, -16, -25, 3)
}

/** Посох целителя: древко, кольцо навершия из материала, светящийся кристалл с крестом. */
function staff(k: Kit): string {
  const { m, trim } = k
  const core = k.gem ?? HOLY
  const wings = k.variant === "brave" || k.grade === "silver"
    ? `<path d="M-8 -58 q-8 -2 -10 -10 q6 2 10 4 M8 -58 q8 -2 10 -10 q-6 2 -10 4" fill="${m.light}" stroke="${INK}" stroke-width="1" stroke-linejoin="round" />`
    : ""
  return pole(k, 22, -52, 3.6)
    + `<circle cx="0" cy="22.5" r="2.4" fill="${trim.fill}" stroke="${INK}" stroke-width="1" />`
    + `<circle cx="0" cy="-62" r="13" fill="#fff3b0" opacity=".4" />`
    + wings
    + `<circle cx="0" cy="-62" r="8.5" fill="none" stroke="${INK}" stroke-width="5.6" opacity=".8" />`
    + `<circle cx="0" cy="-62" r="8.5" fill="none" stroke="${m.base}" stroke-width="3.6" />`
    + `<path d="M-6 -67 A8.5 8.5 0 0 1 2 -70.3" fill="none" stroke="${m.light}" stroke-width="1.5" stroke-linecap="round" />`
    + `<circle cx="0" cy="-62" r="4.6" fill="${core}" stroke="${INK}" stroke-width="1" />`
    + `<path d="M0 -65 V-59 M-3 -62 H3" stroke="#fff" stroke-width="1.6" stroke-linecap="round" />`
    + `<rect x="-3.6" y="-54.5" width="7.2" height="5" rx="1.5" fill="${trim.fill}" stroke="${INK}" stroke-width="1" />`
    + sparkle(k, 9, -72, 3.5)
}

export type HeldPose = "idle" | "run" | "hurt" | "dead" | "happy" | "carried" | "blink"

export interface HeldWeapon {
  kind: WeaponSkill
  grade?: WeaponGrade
  variant?: WeaponVariant
  pose: HeldPose
  /** Точка хвата в позе idle: правая лапа у бока тела. */
  paw: { x: number, y: number }
  /** Лапа поверх рукояти (в позе dead не рисуется — оружие выпало); у кастета лапа под рукавицей. */
  pawSvg: (x: number, y: number) => string
  /** Левая лапа свободна (нет щита/посоха/книги): кастет и на ней. */
  leftPaw?: { x: number, y: number }
}

/** Наклон (градусы, по часовой от вертикали) в покое: остриё отведено наружу, мимо головы. */
const BASE_ROT: Record<WeaponSkill, number> = {
  sword: 26,
  spear: 12,
  axe: 6,
  gauntlet: 0,
  bow: 6,
  blackMagic: -4,
  whiteMagic: 8
}

/** Лапа с луком и кулак с кастетом подняты выше: лук не уходит под ноги, кулак — «в стойке». */
const LIFT: Partial<Record<WeaponSkill, number>> = { bow: -8, gauntlet: -5 }

interface Hold {
  dx: number
  dy: number
  rot: number
}

/** Положение лапы и наклон оружия в позе: run — замах, hurt — дёрнулось, happy — поднято, carried — опущено. */
function hold(kind: WeaponSkill, pose: HeldPose): Hold {
  const r = BASE_ROT[kind]
  const lift = LIFT[kind] ?? 0
  switch (pose) {
    case "run":
      if (kind === "sword") return { dx: -2, dy: -6, rot: 44 }
      if (kind === "axe") return { dx: -4, dy: -10, rot: -22 }
      if (kind === "spear") return { dx: -4, dy: -2, rot: 30 }
      if (kind === "bow") return { dx: -2, dy: -2, rot: -8 }
      if (kind === "gauntlet") return { dx: 5, dy: -14, rot: 0 }
      return { dx: -1, dy: -6, rot: r + 10 }
    case "hurt":
      return { dx: -2, dy: 4 + lift, rot: r - 16 }
    case "happy":
      return { dx: 2, dy: -18, rot: kind === "gauntlet" ? 0 : r * 0.3 }
    case "carried":
      return { dx: -1, dy: 3 + lift, rot: r + 8 }
    default:
      return { dx: 0, dy: lift, rot: r }
  }
}

function shape(kind: WeaponSkill, k: Kit, pose: HeldPose): string {
  switch (kind) {
    case "sword":
      return sword(k)
    case "spear":
      return spear(k)
    case "axe":
      return axe(k)
    case "gauntlet":
      return gauntlet(k)
    case "bow":
      return bow(k, pose === "run")
    case "blackMagic":
      return grimoire(k)
    case "whiteMagic":
      return staff(k)
  }
}

/** Где лежит выпавшее оружие (поза dead): хват и наклон, чтобы предмет лёг на землю рядом. */
const DROPPED: Record<WeaponSkill, Hold> = {
  sword: { dx: -14, dy: 18, rot: 78 },
  spear: { dx: -38, dy: 18, rot: 84 },
  axe: { dx: -16, dy: 20, rot: 70 },
  gauntlet: { dx: 12, dy: 16, rot: 20 },
  bow: { dx: -6, dy: 20, rot: 90 },
  blackMagic: { dx: 10, dy: 34, rot: 12 },
  whiteMagic: { dx: -32, dy: 18, rot: 84 }
}

/** Оружие в правой лапе: предмет в позе, затем лапа поверх хвата (у кастета — наоборот). */
export function heldWeaponSvg(w: HeldWeapon): string {
  const k = kit(w.grade ?? "iron", w.variant ?? "basic")
  const body = shape(w.kind, k, w.pose)
  if (w.pose === "dead") {
    const d = DROPPED[w.kind]
    return `<g class="held held-${w.kind} dropped" transform="translate(${f1(w.paw.x + d.dx)} ${f1(w.paw.y + d.dy)}) rotate(${d.rot})">${body}</g>`
  }
  const h = hold(w.kind, w.pose)
  const x = w.paw.x + h.dx
  const y = w.paw.y + h.dy
  const place = (px: number, py: number, rot: number, inner: string): string =>
    `<g transform="translate(${f1(px)} ${f1(py)})${rot ? ` rotate(${f1(rot)})` : ""}">${inner}</g>`
  if (w.kind === "gauntlet") {
    const left = w.leftPaw && w.pose !== "happy" ? w.pawSvg(w.leftPaw.x, w.leftPaw.y) + place(w.leftPaw.x, w.leftPaw.y, 0, body) : ""
    return `<g class="held held-gauntlet">${left}${w.pawSvg(x, y)}${place(x, y, h.rot, body)}</g>`
  }
  return `<g class="held held-${w.kind}">${place(x, y, h.rot, body)}${w.pawSvg(x, y)}</g>`
}
