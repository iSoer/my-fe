/**
 * SVG-миниатюры котиков, собачек и мышек в стиле cat-chase.
 * Один viewBox для всех видов и снаряжения: 0 -28 120 140 (запас сверху под шарики, корону, кастрюлю).
 * С `classId` поверх зверька рисуется наряд класса FW и его верховое животное (art/outfits.ts).
 */
import type { ClassTier, Mount } from "@shared/character/classes"
import type { WeaponGrade, WeaponSkill } from "@shared/character/skills"
import type { WeaponVariant } from "@game/core/skills/types"
import { BLUSH, INK, NOSE, mixColor, shade, type FurArt } from "./palettes"
import {
  RIDER_TRANSFORM,
  hatLift,
  heldPawSvg,
  leftPawFree,
  mountSvg,
  outfitAura,
  outfitBack,
  outfitBody,
  outfitCape,
  outfitHead,
  outfitHeadBack,
  outfitOf
} from "./outfits"
import { heldWeaponSvg } from "./held"
import { DEFAULT_LOOK, type CritterLook } from "./look"

export type ArtSpecies = "cat" | "dog" | "mouse"
export type Pose = "idle" | "run" | "hurt" | "dead" | "happy" | "carried" | "blink"
export type ArtMoveType = "infantry" | "armored" | "cavalry" | "flier"
/** Оружие в лапах — вид оружия (навык модели); материал и разновидность — `weaponGrade`, `weaponVariant`. */
export type ArtWeapon = WeaponSkill

export interface CritterArt {
  species: ArtSpecies
  fur: FurArt
  iris: string
  /** 0 однотонный, 1 полосатый, 2 пятнистый, 3 смокинг. */
  pattern: number
  /** 0 круглые, 1 миндалевидные, 2 сонные, 3 злые, 4 огромные, 5 косые. */
  eyes: number
  /** 0 нет, 1 красный ошейник, 2 синий ошейник, 3 бандана, 4 повязка, 5 шрам, 6 бантик, 7 колокольчик. */
  accessory: number
  moveType?: ArtMoveType
  weapon?: ArtWeapon
  /** Материал оружия: деревянное, железное, стальное, серебряное. */
  weaponGrade?: WeaponGrade
  /** Разновидность (Killer, Brave, …) — отметка на оружии. */
  weaponVariant?: WeaponVariant
  weaponColor?: string
  /** Детали внешности (уши, хвост, морда, отметины, пух…); без них — прежний облик вида (`DEFAULT_LOOK`). */
  look?: CritterLook
  boss?: boolean
  /** Хмурые брови (враги). */
  angry?: boolean
  /** Зомби-вариант той же модели (все враги): гнилая шерсть, мутные глаза, швы и заплатка. */
  zombie?: boolean
  pose?: Pose
  /** Класс FW (id модели): наряд класса из `CLASS_OUTFITS`. Без него — прежнее снаряжение по типу движения. */
  classId?: string
  /** Ярус класса: отделка одежды, у divine — нимб и сияние. */
  tier?: ClassTier
  /** Верховое животное класса (`mountOf` модели). */
  mount?: Mount
  /** Добавить CSS-хуки и оба набора глаз для анимации в DOM. */
  animated?: boolean
  blinkDelay?: number
}

export const VIEW = { x: 0, y: -28, w: 120, h: 140 } as const
export const VIEW_BOX = `${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`

const sw = "stroke-width=\"1.5\""

const f1 = (n: number): string => (Math.round(n * 10) / 10).toString()

function lookOf(a: CritterArt): CritterLook {
  return a.look ?? DEFAULT_LOOK[a.species]
}

/** Светлый ли цвет (для выбора контрастных пятен). */
function light(c: string): boolean {
  const n = parseInt(c.replace("#", ""), 16)
  return ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11 > 150
}

/** Отметины и пятна у зомби тоже «гниют». */
function tint(a: CritterArt, c: string): string {
  return a.zombie ? mixColor(c, "#7a9e4f", 0.65) : c
}

/** Тёмный «пойнт» сиамских: морда, уши, хвост, лапы. */
function pointColor(a: CritterArt): string {
  return tint(a, mixColor(a.fur.fur, "#3d2b22", 0.62))
}

/** Пятна, контрастные к шерсти: на светлой — тёмные, на тёмной — светлые. */
function spotColor(a: CritterArt): string {
  return light(a.fur.fur) ? a.fur.dark : a.fur.belly
}

const TAN = "#c98a46"

/**
 * Серп тени внутри круга (свет сверху-слева): часть круга (cx, cy, r), не закрытая тем же кругом,
 * сдвинутым на (−dx, −dy).
 */
function crescent(cx: number, cy: number, r: number, dx: number, dy: number): string {
  const d = Math.hypot(dx, dy)
  const mx = cx - dx / 2
  const my = cy - dy / 2
  const h = Math.sqrt(r * r - (d / 2) ** 2)
  const px = dy / d
  const py = -dx / d
  const p1 = `${f1(mx + h * px)} ${f1(my + h * py)}`
  const p2 = `${f1(mx - h * px)} ${f1(my - h * py)}`
  return `M${p1} A${r} ${r} 0 1 1 ${p2} A${r} ${r} 0 1 0 ${p1} z`
}

/* ---------- Глаза ---------- */

/**
 * Глаз зомби: запавшая тёмная глазница, мутный белок без блика, прикрыт веком; зрачок светится красным —
 * главный знак врага, читается даже на мелком спрайте. Глаза разного размера.
 */
function zombieEye(a: CritterArt, cx: number, cy: number, k: number): string {
  const rx = (a.species === "mouse" ? 6.5 : 7.5) * k
  const ry = (a.species === "mouse" ? 8 : 9.5) * k
  const px = cx + (k > 1 ? 1.5 : -1)
  return `<ellipse cx="${cx}" cy="${cy + 1}" rx="${f1(rx + 3.5)}" ry="${f1(ry + 3)}" fill="#3b2442" opacity=".55" />
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#e3ebc4" stroke="${INK}" stroke-width="1.6" />
    <circle cx="${px}" cy="${cy + 2}" r="${f1(4.2 * k)}" fill="#ff2d2d" opacity=".35" />
    <circle cx="${px}" cy="${cy + 2}" r="${f1(2.6 * k)}" fill="#e01b24" stroke="#5a0b0f" stroke-width=".8" />
    <circle cx="${px}" cy="${cy + 2}" r="${f1(1 * k)}" fill="#ffd9c2" />
    <path d="M${cx - rx - 0.5} ${cy - ry * 0.25} a${rx + 0.5} ${ry} 0 0 1 ${(rx + 0.5) * 2} 0 z" fill="${a.fur.fur}" stroke="${a.fur.line}" stroke-width="1.2" />`
}

function openEyes(a: CritterArt, cx: number, cy: number, shiftIn: number, big = false): string {
  let rx = big ? 9.5 : 8
  let ry = big ? 12 : 10.5
  if (a.eyes === 1 && !big) {
    rx = 7.5
    ry = 8.5
  }
  if (a.eyes === 4) {
    rx = 9.5
    ry = 12
  }
  if (a.species === "dog") {
    rx -= 1
    ry -= 1.5
  }
  if (a.species === "mouse") {
    rx -= 1.5
    ry -= 2.5
  }
  const px = cx + shiftIn
  return `
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${INK}" />
    <ellipse cx="${px}" cy="${cy + 2}" rx="${rx * 0.68}" ry="${ry * 0.72}" fill="${a.iris}" />
    <ellipse cx="${px}" cy="${cy + 5}" rx="${rx * 0.38}" ry="${ry * 0.34}" fill="${INK}" />
    <circle cx="${cx + 3.5}" cy="${cy - 4.5}" r="${rx * 0.4}" fill="#fff" />
    <circle cx="${cx - 3}" cy="${cy + 5}" r="1.5" fill="#fff" opacity=".9" />
    ${a.eyes === 2 ? `<path d="M${cx - rx} ${cy} a${rx} ${ry} 0 0 1 ${rx * 2} 0 z" fill="${a.fur.fur}" stroke="${a.fur.line}" stroke-width="1.2" />` : ""}`
}

function eyesGroup(a: CritterArt, pose: Pose): string {
  const cy = a.species === "mouse" ? 50 : 52
  const lx = 45
  const rx = 75
  const cross = a.eyes === 5 ? 2.2 : 0
  const angry = (a.angry && !a.zombie) || a.eyes === 3
  const brows = angry
    ? `<g stroke="${INK}" stroke-width="3" stroke-linecap="round"><path d="M35 40 l15 6" /><path d="M85 40 l-15 6" /></g>`
    : ""
  const happy = `<g class="eyes-happy" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round">
      <path d="M37 ${cy + 2} q8 -10 16 0" /><path d="M67 ${cy + 2} q8 -10 16 0" /></g>`
  if (pose === "dead") {
    return `<g stroke="${INK}" stroke-width="3.4" stroke-linecap="round">
      <path d="M38 ${cy - 7} l14 14 M52 ${cy - 7} l-14 14" /><path d="M68 ${cy - 7} l14 14 M82 ${cy - 7} l-14 14" /></g>`
  }
  if (pose === "hurt") {
    return `<g fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M38 ${cy - 6} l10 6 l-10 6" /><path d="M82 ${cy - 6} l-10 6 l10 6" /></g>${brows}`
  }
  if (pose === "blink" && !a.animated) {
    return `<g fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round">
      <path d="M37 ${cy + 1} q8 3 16 0" /><path d="M67 ${cy + 1} q8 3 16 0" /></g>${brows}`
  }
  if (pose === "happy" && !a.animated) return happy.replace(" class=\"eyes-happy\"", "") + brows
  if (a.zombie && pose !== "happy") return zombieEye(a, lx, cy, 1.15) + zombieEye(a, rx, cy, 0.9)
  const big = pose === "carried"
  const open = `<g class="eyes-open"${a.animated ? ` style="animation-delay:${(a.blinkDelay ?? 0).toFixed(2)}s"` : ""}>
      ${openEyes(a, lx, cy, cross, big)}${openEyes(a, rx, cy, -cross, big)}</g>`
  return open + (a.animated ? happy : "") + brows
}

/* ---------- Рот и нос ---------- */

/** Высота рта под носом у вида (для оскала зомби поверх обычного рта). */
function mouthY(a: CritterArt): number {
  if (a.species === "cat") return 68
  if (a.species === "mouse") return 72.5
  const m = lookOf(a).muzzle
  return (m === 0 ? 66 : m === 2 ? 69 : 67) + 1.5
}

/**
 * Оскал зомби: приоткрытая тёмная пасть с кривыми зубами, от уголка — зашитый разрыв щеки, с губы тянется
 * зелёная слюна. Мёртвый — без оскала (крестики в глазах и так всё говорят).
 */
function zombieMouth(a: CritterArt, pose: Pose): string {
  if (pose === "dead") return ""
  const y = mouthY(a)
  return `<path d="M52.5 ${y - 1.5} q7.5 -2.5 15 0 q-1 6 -7.5 6.5 q-6.5 -0.5 -7.5 -6.5 z" fill="#3a1a22" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round" />
    <path d="M53.5 ${y - 1.3} l2 3 l1.6 -3.2 l1.8 3.6 l1.6 -3.8 l1.8 3.4 l1.7 -3.2 l1.9 3 l1.6 -2.6 z" fill="#f1ead2" stroke="${INK}" stroke-width=".6" stroke-linejoin="round" />
    <path d="M67.5 ${y - 1} q6 -1 11 -5" fill="none" stroke="#5a0b0f" stroke-width="1.6" stroke-linecap="round" />
    <g stroke="${INK}" stroke-width="1.1" stroke-linecap="round"><path d="M69.5 ${y - 3.2} l1 3.6 M72.6 ${y - 4} l1 3.6 M75.6 ${y - 5.4} l1 3.4" /></g>
    <path d="M55.5 ${y + 3.5} q1.5 5 0 8 a2.2 2.2 0 1 0 3 -1 q-1 -4 -1.2 -7 z" fill="#9fd356" stroke="#4f7a1f" stroke-width=".8" />`
}

function fangSvg(x: number, y: number): string {
  return `<path d="M${x} ${y} l1.6 4.2 l1.6 -4.2 z" fill="#fff" stroke="${INK}" stroke-width=".6" stroke-linejoin="round" />`
}

function mouth(a: CritterArt, pose: Pose): string {
  const s = a.species
  const look = lookOf(a)
  if (s === "cat") {
    // подушечки усов и крошечный подбородок
    const padsFill = look.marking === "point" ? shade(pointColor(a), 0.15) : a.fur.belly
    const pads = `<g fill="${padsFill}"><ellipse cx="55" cy="66.5" rx="5.6" ry="4.2" /><ellipse cx="65" cy="66.5" rx="5.6" ry="4.2" /></g>
      <g fill="${a.fur.line}" opacity=".55"><circle cx="52.5" cy="65.5" r=".8" /><circle cx="54.5" cy="68" r=".8" /><circle cx="67.5" cy="65.5" r=".8" /><circle cx="65.5" cy="68" r=".8" /></g>`
    const nose = `${pads}<path d="M56.5 62 h7 l-3.5 4.5 z" fill="${NOSE}" stroke="${shade(NOSE, -0.3)}" stroke-width=".6" stroke-linejoin="round" /><circle cx="58.6" cy="62.9" r=".8" fill="#fff" opacity=".8" />`
    if (pose === "dead")
      return `${nose}<path d="M52 68 h16" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" /><ellipse cx="64" cy="71" rx="3.5" ry="4.5" fill="#ff7f9c" />`
    if (pose === "hurt")
      return `${nose}<ellipse cx="60" cy="69" rx="4" ry="4.5" fill="${INK}" /><ellipse cx="60" cy="71" rx="2.2" ry="2" fill="#ff7f9c" />`
    if (pose === "happy")
      return `${nose}<path d="M50 66 q5 7 10 0 q5 7 10 0" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" />`
    if (pose === "carried") return `${nose}<ellipse cx="60" cy="69" rx="2.6" ry="3" fill="${INK}" />`
    return `${nose}<path d="M53 66 q3.5 4 7 0 q3.5 4 7 0" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" />${look.fang ? fangSvg(61.4, 67.6) : ""}`
  }
  if (s === "dog") {
    // длина морды: 0 — короткая приплюснутая (мопс), 2 — длинная (овчарка, такса)
    const m = look.muzzle
    const my = m === 0 ? 66 : m === 2 ? 69 : 67
    const mry = m === 0 ? 8.5 : m === 2 ? 13 : 11
    const mrx = m === 0 ? 14 : m === 2 ? 13 : 15
    const ny = m === 0 ? 61 : m === 2 ? 62 : 62
    const muzzleFill = look.marking === "muzzle" ? tint(a, mixColor(a.fur.line, "#2a2128", 0.55)) : look.marking === "tan" ? tint(a, TAN) : a.fur.belly
    const bridge = m === 2 ? `<path d="M55 ${my - mry + 2} Q60 ${my - mry - 1} 65 ${my - mry + 2}" fill="none" stroke="${shade(muzzleFill, -0.25)}" stroke-width="1.2" opacity=".7" />` : ""
    const wrinkles = m === 0 ? `<path d="M50 ${my - 9} q10 -4 20 0 M53 ${my - 12} q7 -3 14 0" fill="none" stroke="${a.fur.line}" stroke-width="1.3" stroke-linecap="round" opacity=".6" />` : ""
    const dots = `<g fill="${shade(muzzleFill, -0.35)}" opacity=".6"><circle cx="52" cy="${my}" r=".9" /><circle cx="54.5" cy="${my + 2.5}" r=".9" /><circle cx="68" cy="${my}" r=".9" /><circle cx="65.5" cy="${my + 2.5}" r=".9" /></g>`
    const base = `${wrinkles}<ellipse cx="60" cy="${my}" rx="${mrx}" ry="${mry}" fill="${muzzleFill}" />${bridge}${dots}<ellipse cx="60" cy="${ny}" rx="${m === 0 ? 5.4 : 4.8}" ry="3.6" fill="${INK}" /><circle cx="58.5" cy="${ny - 1}" r="1.2" fill="#fff" opacity=".8" />`
    const y0 = my - 2
    if (pose === "dead")
      return `${base}<path d="M52 ${y0 + 4} h16" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" /><path d="M64 ${y0 + 4} q6 4 3 9 q-4 1 -5 -4 z" fill="#ff7f9c" />`
    if (pose === "hurt")
      return `${base}<ellipse cx="60" cy="${y0 + 5}" rx="5" ry="4.5" fill="${INK}" /><path d="M57 ${y0 + 7} q3 4 6 0 z" fill="#ff7f9c" />`
    if (pose === "happy")
      return `${base}<path d="M50 ${y0 + 2} q10 10 20 0" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" /><path d="M56 ${y0 + 5} q4 9 8 0 z" fill="#ff8fa8" />`
    if (pose === "carried") return `${base}<ellipse cx="60" cy="${y0 + 5}" rx="3" ry="3.4" fill="${INK}" />`
    return `${base}<path d="M60 ${ny + 3} v${y0 - ny} M54 ${y0 + 3} q6 5 12 0" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" /><path d="M57.5 ${y0 + 5} q2.5 8 5 0 z" fill="${NOSE}" />${look.fang ? fangSvg(63, y0 + 3.4) + fangSvg(53.8, y0 + 3.4) : ""}`
  }
  // мышь: вытянутая мордочка, розовый нос, два зуба
  const muzzle = `<ellipse cx="60" cy="63" rx="13" ry="9.5" fill="${a.fur.belly}" /><g fill="${a.fur.line}" opacity=".5"><circle cx="52" cy="63" r=".8" /><circle cx="68" cy="63" r=".8" /><circle cx="53.5" cy="66" r=".8" /><circle cx="66.5" cy="66" r=".8" /></g><circle cx="60" cy="67.5" r="3.4" fill="${NOSE}" stroke="${shade(NOSE, -0.25)}" stroke-width=".8" /><circle cx="59" cy="66.4" r="1" fill="#fff" opacity=".8" />`
  if (pose === "dead")
    return `${muzzle}<path d="M54 72 h12" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" /><ellipse cx="63" cy="74" rx="2.5" ry="3.5" fill="#ff7f9c" />`
  if (pose === "hurt" || pose === "carried")
    return `${muzzle}<ellipse cx="60" cy="73" rx="${pose === "carried" ? 2.2 : 3}" ry="3.2" fill="${INK}" />`
  const teeth = `<rect x="57.2" y="70.5" width="2.6" height="4.5" rx=".6" fill="#fff" stroke="${INK}" stroke-width=".6" /><rect x="60.2" y="70.5" width="2.6" height="4.5" rx=".6" fill="#fff" stroke="${INK}" stroke-width=".6" />`
  const smile
    = pose === "happy"
      ? `<path d="M53 70 q7 6 14 0" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" />`
      : `<path d="M60 70.5 v1" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" />`
  return `${muzzle}${smile}${teeth}`
}

function whiskers(a: CritterArt): string {
  const w = lookOf(a).whiskers
  const long = (a.species === "mouse" ? 16 : 12) + (w - 1) * 4
  const y = a.species === "mouse" ? 64 : 60
  const third = w === 2 ? `<path d="M23 ${y - 5} l-${long - 3} -3" /><path d="M97 ${y - 5} l${long - 3} -3" />` : ""
  return `<g stroke="${a.fur.line}" stroke-width="1.4" stroke-linecap="round" opacity=".8">
    <path d="M22 ${y} h-${long}" /><path d="M23 ${y + 6} l-${long - 1} 3" />
    <path d="M98 ${y} h${long}" /><path d="M97 ${y + 6} l${long - 1} 3" />${third}</g>`
}

/* ---------- Уши ---------- */

interface EarParts {
  /** За головой. */
  back: string
  /** Поверх головы (вислоухие, загнутые кончики). */
  front: string
}

/** Пара ушей из левого: правое — зеркальная копия; поворот при гибели вокруг основания. */
function earPair(left: string, pivot: [number, number], droop: number, cls = "ear"): string {
  const rot = (deg: number): string => (deg ? ` transform="rotate(${deg} ${pivot[0]} ${pivot[1]})"` : "")
  return `<g class="${cls} ear-l"><g${rot(-droop)}>${left}</g></g>`
    + `<g class="${cls} ear-r"><g transform="translate(120 0) scale(-1 1)"><g${rot(-droop)}>${left}</g></g></g>`
}

function catEar(a: CritterArt, look: CritterLook): { back: string, front: string } {
  const f = a.fur
  const outer = look.marking === "point" ? pointColor(a) : f.fur
  const st = `stroke="${f.line}" ${sw} stroke-linejoin="round"`
  const fluff = `<path d="M33 29 l-3 -6 M36 27 l-2 -7 M39 26 l0 -6" stroke="${f.belly}" stroke-width="1.3" stroke-linecap="round" opacity=".9" />`
  switch (look.ears) {
    case "tufted":
      return {
        back: `<path d="M29 36 L21 4 Q22 1 25 3 L53 22 Z" fill="${outer}" ${st} /><path d="M32 31 L26 10 L47 23 Z" fill="${f.earInner}" />${fluff}
          <path d="M22 4 l-3 -10 M23 3 l1 -11 M24 4 l4 -8" stroke="${f.line}" stroke-width="2" stroke-linecap="round" />`,
        front: ""
      }
    case "round":
      return {
        back: `<path d="M30 34 Q22 12 33 11 Q43 12 51 23 Z" fill="${outer}" ${st} /><path d="M33 29 Q28 17 34 16 Q41 17 46 24 Z" fill="${f.earInner}" />`,
        front: ""
      }
    case "folded":
      // вислоухий: маленькое ухо прижато вперёд, кончик лежит на лбу
      return {
        back: "",
        front: `<path d="M27 32 Q26 17 38 16 Q48 17 50 25 Q44 23 40 27 Q36 25 33 31 Z" fill="${outer}" ${st} /><path d="M33 26 Q35 20 41 20 Q46 21 47 24 Q42 23 39 25 Z" fill="${shade(f.earInner, -0.08)}" opacity=".85" />`
      }
    case "big":
      return {
        back: `<path d="M28 39 L15 -1 Q16 -4 19 -2 L55 22 Z" fill="${outer}" ${st} /><path d="M31 33 L20 6 L48 23 Z" fill="${f.earInner}" />${fluff}`,
        front: ""
      }
    default:
      return {
        back: `<path d="M30 34 L24 9 Q25 6 28 8 L52 22 Z" fill="${outer}" ${st} /><path d="M32 30 L28 14 L46 23 Z" fill="${f.earInner}" />${look.cheeks ? fluff : ""}`,
        front: ""
      }
  }
}

function dogEar(a: CritterArt, look: CritterLook): { back: string, front: string } {
  const f = a.fur
  const flap = look.marking === "muzzle" ? tint(a, mixColor(f.line, "#2a2128", 0.4)) : f.dark
  const st = `stroke="${f.line}" ${sw} stroke-linejoin="round"`
  switch (look.ears) {
    case "erect":
      return {
        back: `<path d="M32 36 Q25 12 30 3 Q34 -1 39 3 L56 22 Z" fill="${look.marking === "muzzle" ? flap : f.fur}" ${st} /><path d="M35 30 Q30 14 33 8 Q36 6 39 9 L49 22 Z" fill="${f.earInner}" />`,
        front: ""
      }
    case "big":
      return {
        back: `<path d="M35 36 L9 6 Q9 2 13 3 L56 22 Z" fill="${f.fur}" ${st} /><path d="M35 30 L15 9 L49 22 Z" fill="${f.earInner}" />`,
        front: ""
      }
    case "semi":
      // полустоячее: кончик загнут вперёд
      return {
        back: `<path d="M33 34 L30 12 L53 22 Z" fill="${f.fur}" ${st} /><path d="M35 30 L33 16 L47 23 Z" fill="${f.earInner}" />`,
        front: `<path d="M30 13 Q31 6 38 7 Q45 9 47 18 Q40 15 36 22 Z" fill="${flap}" ${st} />`
      }
    case "button":
      // «розочка»: маленькое ухо загнуто назад и в сторону
      return {
        back: `<path d="M40 28 Q28 21 19 29 Q15 37 20 45 Q25 37 35 35 Z" fill="${flap}" ${st} /><path d="M21 33 Q25 29 31 30" fill="none" stroke="${shade(flap, -0.25)}" stroke-width="1.2" stroke-linecap="round" />`,
        front: ""
      }
    case "long":
      if (look.curly) {
        const c = (x: number, y: number, r: number): string => `<circle cx="${x}" cy="${y}" r="${r}" />`
        return {
          back: `<g fill="${flap}" ${st}>${c(30, 40, 10)}${c(25, 54, 10)}${c(24, 68, 10)}${c(28, 81, 9)}</g>
            <g fill="${flap}">${c(30, 40, 8.6)}${c(25, 54, 8.6)}${c(24, 68, 8.6)}</g>`,
          front: ""
        }
      }
      return {
        back: `<path d="M37 28 C 15 30, 8 74, 21 87 C 32 93, 43 70, 42 40 Z" fill="${flap}" ${st} /><path d="M33 40 C 24 50, 21 66, 24 78" fill="none" stroke="${shade(flap, -0.2)}" stroke-width="1.4" stroke-linecap="round" opacity=".6" />`,
        front: ""
      }
    default:
      return {
        back: `<path d="M36 30 C 16 32, 10 66, 24 74 C 34 78, 42 62, 42 42 Z" fill="${flap}" ${st} /><path d="M31 42 C 24 52, 22 62, 25 69" fill="none" stroke="${shade(flap, -0.2)}" stroke-width="1.4" stroke-linecap="round" opacity=".6" />`,
        front: ""
      }
  }
}

function mouseEar(a: CritterArt, look: CritterLook): { back: string, front: string } {
  const f = a.fur
  // у мышей внутри уха ярко-розовое, с прожилкой
  const pink = a.zombie ? f.earInner : mixColor(f.earInner, "#ffa8c0", 0.55)
  const [cx, cy, r] = look.ears === "big" ? [25, 19, 19] : look.ears === "small" ? [33, 28, 10.5] : [29, 24, 15]
  return {
    back: `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${f.fur}" stroke="${f.line}" ${sw} /><circle cx="${cx + 1}" cy="${cy + 1}" r="${f1(r * 0.66)}" fill="${pink}" />
      <path d="M${f1(cx - r * 0.3)} ${f1(cy - r * 0.25)} q${f1(r * 0.25)} ${f1(r * 0.3)} ${f1(r * 0.5)} ${f1(r * 0.45)}" fill="none" stroke="${shade(pink, -0.18)}" stroke-width="1.2" stroke-linecap="round" />`,
    front: ""
  }
}

function ears(a: CritterArt, pose: Pose): EarParts {
  const look = lookOf(a)
  const dead = pose === "dead"
  if (a.species === "cat") {
    const e = catEar(a, look)
    return { back: e.back ? earPair(e.back, [30, 34], dead ? 25 : 0) : "", front: e.front ? earPair(e.front, [30, 30], dead ? 15 : 0, "ear ear-fold") : "" }
  }
  if (a.species === "dog") {
    const e = dogEar(a, look)
    return { back: e.back ? earPair(e.back, [36, 30], dead ? 12 : 0) : "", front: e.front ? earPair(e.front, [36, 24], dead ? 12 : 0, "ear ear-fold") : "" }
  }
  const e = mouseEar(a, look)
  return { back: earPair(e.back, [30, 26], dead ? 30 : 0), front: "" }
}

/* ---------- Окрас ---------- */

function patternHead(a: CritterArt): string {
  const f = a.fur
  const stripes = `<g fill="none" stroke="${f.line}" stroke-width="3" stroke-linecap="round" opacity=".7"><path d="M52 20 v9" /><path d="M60 17 v10" /><path d="M68 20 v9" /></g>`
  if (a.pattern === 1 || (a.pattern === 0 && f.tabby)) return stripes
  if (a.pattern === 2)
    return `<g fill="${f.dark}" opacity=".85"><circle cx="76" cy="34" r="6" /><circle cx="38" cy="42" r="3.5" /></g>`
  if (a.pattern === 3) return `<ellipse cx="60" cy="66" rx="16" ry="12" fill="${f.belly}" opacity=".95" />`
  return ""
}

function patternBody(a: CritterArt): string {
  const f = a.fur
  if (a.pattern === 1)
    return `<g fill="none" stroke="${f.line}" stroke-width="3" stroke-linecap="round" opacity=".55"><path d="M40 78 q4 4 2 10" /><path d="M78 78 q-4 4 -2 10" /></g>`
  if (a.pattern === 2)
    return `<g fill="${f.dark}" opacity=".85"><circle cx="46" cy="82" r="4" /><circle cx="70" cy="94" r="3" /></g>`
  if (a.pattern === 3) return `<ellipse cx="60" cy="88" rx="19" ry="13" fill="${f.belly}" />`
  return ""
}

/** Отметины породы на голове (поверх окраса, до теней и мордочки). */
function markingHead(a: CritterArt, cy: number, r: number): string {
  const f = a.fur
  const look = lookOf(a)
  switch (look.marking) {
    case "point":
      return `<ellipse cx="60" cy="${cy + 12}" rx="${r * 0.62}" ry="${r * 0.5}" fill="${pointColor(a)}" opacity=".9" />`
    case "mask":
      // светлая маска хаски с «вдовьим мыском» между глаз, тёмная шапочка сверху
      return `<path d="M${60 - r + 1} ${cy + 4} Q${60 - r + 5} ${cy - 12} 44 ${cy - 7} Q52 ${cy - 6} 55 ${cy - 17} L60 ${cy - 23} L65 ${cy - 17} Q68 ${cy - 6} 76 ${cy - 7} Q${60 + r - 5} ${cy - 12} ${60 + r - 1} ${cy + 4} Q${60 + r - 6} ${cy + r - 2} 60 ${cy + r} Q${60 - r + 6} ${cy + r - 2} ${60 - r + 1} ${cy + 4} Z" fill="${f.belly}" />`
    case "blaze":
      return `<path d="M56 ${cy - r + 1} Q60 ${cy - r - 1} 64 ${cy - r + 1} L63.5 ${cy - 4} Q66 ${cy + 4} 66 ${cy + 10} L54 ${cy + 10} Q54 ${cy + 4} 56.5 ${cy - 4} Z" fill="${f.belly}" />`
    case "calico":
      return `<path d="M${60 - r + 3} ${cy - 6} Q${60 - r + 6} ${cy - r + 4} 50 ${cy - r + 2} Q56 ${cy - 22} 50 ${cy - 12} Q42 ${cy - 4} ${60 - r + 3} ${cy - 6} Z" fill="${tint(a, "#f4a259")}" />
        <path d="M70 ${cy - r + 3} Q84 ${cy - r + 4} ${60 + r - 3} ${cy - 10} Q84 ${cy - 4} 76 ${cy - 12} Q68 ${cy - 18} 70 ${cy - r + 3} Z" fill="${tint(a, "#3d3540")}" />`
    case "eyepatch":
      return `<ellipse cx="76" cy="${cy}" rx="12.5" ry="12" fill="${tint(a, light(f.fur) ? mixColor(f.dark, "#7a4a26", 0.5) : f.belly)}" opacity=".95" />`
    case "tan":
      return `<g fill="${tint(a, TAN)}"><ellipse cx="42" cy="${cy + 17}" rx="7" ry="5" /><ellipse cx="78" cy="${cy + 17}" rx="7" ry="5" /></g>`
    default:
      return ""
  }
}

/** Брови-пятна, веснушки — мелочи, отличающие бойцов одного вида. */
function faceSpots(a: CritterArt, cy: number): string {
  const look = lookOf(a)
  let s = ""
  if (look.brows) {
    const c = look.marking === "tan" ? tint(a, TAN) : spotColor(a)
    s += `<g fill="${c}"><ellipse cx="43" cy="${cy - 15}" rx="5" ry="3.2" transform="rotate(-12 43 ${cy - 15})" /><ellipse cx="77" cy="${cy - 15}" rx="5" ry="3.2" transform="rotate(12 77 ${cy - 15})" /></g>`
  }
  if (look.freckles) {
    const c = light(a.fur.fur) ? a.fur.line : a.fur.belly
    s += `<g fill="${c}" opacity=".7"><circle cx="38" cy="${cy + 12}" r="1.2" /><circle cx="42" cy="${cy + 14}" r="1.2" /><circle cx="37" cy="${cy + 16}" r="1.2" /><circle cx="82" cy="${cy + 12}" r="1.2" /><circle cx="78" cy="${cy + 14}" r="1.2" /><circle cx="83" cy="${cy + 16}" r="1.2" /></g>`
  }
  return s
}

/** Клок шерсти на макушке: завиток или хохолок из трёх прядей. */
function tuft(a: CritterArt, top: number): string {
  const t = lookOf(a).tuft
  const f = a.fur
  const fill = lookOf(a).marking === "calico" ? tint(a, "#f4a259") : f.fur
  if (t === 1)
    return `<path d="M55 ${top + 3} Q53 ${top - 8} 63 ${top - 8} Q69 ${top - 7} 67 ${top - 2} Q65 ${top - 5} 61 ${top - 3} Q59 ${top} 62 ${top + 3} Z" fill="${fill}" stroke="${f.line}" stroke-width="1.3" stroke-linejoin="round" />`
  if (t === 2)
    return `<path d="M51 ${top + 4} L52 ${top - 6} L56 ${top + 1} L59 ${top - 9} L62 ${top + 1} L67 ${top - 6} L69 ${top + 4} Z" fill="${fill}" stroke="${f.line}" stroke-width="1.3" stroke-linejoin="round" />`
  return ""
}

/** Пух на щеках: пряди торчат по бокам головы (рисуется до головы). */
function cheekFluff(a: CritterArt, cy: number, r: number): string {
  if (!lookOf(a).cheeks) return ""
  const f = a.fur
  const x = 60 - r + 3
  const left = `<path d="M${x} ${cy + 2} L${x - 11} ${cy + 6} L${x - 3} ${cy + 9} L${x - 12} ${cy + 15} L${x - 1} ${cy + 15} L${x - 7} ${cy + 22} L${x + 6} ${cy + 18} Z" fill="${f.fur}" stroke="${f.line}" ${sw} stroke-linejoin="round" />`
  return `<g class="cheeks">${left}<g transform="translate(120 0) scale(-1 1)">${left}</g></g>`
}

/** Пушистое жабо на грудке под подбородком. */
function chestFluff(a: CritterArt): string {
  if (!lookOf(a).chest) return ""
  const f = a.fur
  const y = a.species === "mouse" ? 76 : a.species === "dog" ? 78 : 76
  return `<path class="chest" d="M44 ${y} L46 ${y + 12} L51 ${y + 8} L54 ${y + 16} L60 ${y + 10} L66 ${y + 16} L69 ${y + 8} L74 ${y + 12} L76 ${y} Z" fill="${lookOf(a).marking === "tan" ? tint(a, TAN) : f.belly}" stroke="${f.line}" stroke-width="1.2" stroke-linejoin="round" />`
}

/* ---------- Аксессуары и снаряжение ---------- */

function accessory(a: CritterArt): string {
  switch (a.accessory) {
    case 1:
      return "<path d=\"M42 74 q18 12 36 0 l-6 10 q-12 6 -24 0 z\" fill=\"#e5536f\" stroke=\"#b83a52\" stroke-width=\"1.2\" stroke-linejoin=\"round\" />"
    case 2:
      return "<path d=\"M42 74 q18 12 36 0 l-6 10 q-12 6 -24 0 z\" fill=\"#4f8fd1\" stroke=\"#2f69a8\" stroke-width=\"1.2\" stroke-linejoin=\"round\" />"
    case 3:
      return `<path d="M40 76 q20 10 40 0 l-20 22 z" fill="#e5536f" stroke="#b83a52" stroke-width="1.2" stroke-linejoin="round" />
        <g fill="#fff" opacity=".8"><circle cx="54" cy="84" r="1.6" /><circle cx="62" cy="88" r="1.6" /><circle cx="66" cy="81" r="1.6" /></g>`
    case 4:
      return `<path d="M30 44 Q 60 28, 92 40" fill="none" stroke="${INK}" stroke-width="2.6" /><ellipse cx="75" cy="52" rx="10" ry="12" fill="${INK}" /><circle cx="78" cy="48" r="1.6" fill="#fff" opacity=".5" />`
    case 5:
      return "<g stroke=\"#c0392b\" stroke-width=\"2.2\" stroke-linecap=\"round\"><path d=\"M38 36 l12 18\" /><path d=\"M41 41 l-5 3\" /><path d=\"M45 47 l-5 3\" /></g>"
    case 6:
      return "<g transform=\"translate(34 20)\"><path d=\"M0 0 l-12 -9 v18 z\" fill=\"#ff6f9c\" stroke=\"#d94f7f\" stroke-width=\"1\" /><path d=\"M0 0 l12 -9 v18 z\" fill=\"#ff6f9c\" stroke=\"#d94f7f\" stroke-width=\"1\" /><circle cx=\"0\" cy=\"0\" r=\"3.2\" fill=\"#ff8fb4\" stroke=\"#d94f7f\" stroke-width=\"1\" /></g>"
    case 7:
      return "<path d=\"M42 74 q18 12 36 0\" fill=\"none\" stroke=\"#e5536f\" stroke-width=\"4.5\" stroke-linecap=\"round\" /><circle cx=\"60\" cy=\"84\" r=\"5\" fill=\"#ffd54f\" stroke=\"#c99a2e\" stroke-width=\"1.2\" /><circle cx=\"60\" cy=\"86.5\" r=\"1.2\" fill=\"#8a5a10\" />"
    default:
      return ""
  }
}

function crown(lift = 0): string {
  return `<g transform="translate(0 ${lift})"><path d="M42 14 l6 -16 l12 10 l12 -10 l6 16 z" fill="#ffd54f" stroke="#d99a2b" stroke-width="1.5" stroke-linejoin="round" />
    <circle cx="48" cy="-1" r="2.4" fill="#ff6f9c" /><circle cx="60" cy="8" r="2.4" fill="#8fd3f4" /><circle cx="72" cy="-1" r="2.4" fill="#ff6f9c" /></g>`
}

/** Снаряжение: до тела (сзади) и после головы (спереди/сверху). С классом — наряд и животное класса. */
function gearBehind(a: CritterArt): string {
  if (a.classId) return outfitCape(a) + outfitBack(a)
  if (a.moveType === "cavalry") {
    return `<g class="vacuum"><ellipse cx="60" cy="104" rx="36" ry="10" fill="#2f3440" stroke="#1c2029" stroke-width="1.5" />
      <ellipse cx="60" cy="101" rx="36" ry="10" fill="#4a5262" stroke="#1c2029" stroke-width="1.5" />
      <ellipse cx="60" cy="101" rx="26" ry="6.5" fill="none" stroke="#6c768a" stroke-width="1.2" />
      <circle cx="60" cy="98" r="2.6" fill="#7ee081" /><circle cx="52" cy="99" r="1.6" fill="#ff6b6b" /></g>`
  }
  if (a.moveType === "flier") {
    const c = a.weaponColor ?? "#ff6f9c"
    const c2 = shade(c, 0.35)
    const c3 = shade(c, -0.2)
    return `<g class="balloons" stroke="${INK}" stroke-width=".9" opacity=".95">
      <path d="M40 -2 Q 50 40 58 74 M62 -10 Q 62 40 60 74 M82 0 Q 72 40 62 74" fill="none" stroke="#6b6b7a" stroke-width="1.2" />
      <ellipse cx="40" cy="-6" rx="11" ry="13" fill="${c2}" /><ellipse cx="82" cy="-4" rx="11" ry="13" fill="${c3}" /><ellipse cx="62" cy="-14" rx="12.5" ry="14.5" fill="${c}" />
      <g fill="#fff" opacity=".55"><ellipse cx="36" cy="-11" rx="3" ry="4.5" transform="rotate(-20 36 -11)" /><ellipse cx="78" cy="-9" rx="3" ry="4.5" transform="rotate(-20 78 -9)" /><ellipse cx="58" cy="-20" rx="3.4" ry="5" transform="rotate(-20 58 -20)" /></g></g>`
  }
  return ""
}

function gearBody(a: CritterArt): string {
  if (a.classId) return outfitBody(a)
  if (a.moveType === "armored" && a.species === "cat") {
    return `<g class="box"><rect x="26" y="74" width="68" height="34" rx="3" fill="#dcae72" stroke="#a8763f" stroke-width="1.5" />
      <path d="M26 74 l-9 -9 h30 l-9 9 z" fill="#e8c18b" stroke="#a8763f" stroke-width="1.2" stroke-linejoin="round" />
      <path d="M94 74 l9 -9 h-30 l9 9 z" fill="#e8c18b" stroke="#a8763f" stroke-width="1.2" stroke-linejoin="round" />
      <rect x="56" y="74" width="8" height="34" fill="#c9924f" opacity=".5" />
      <path d="M34 92 h10 M34 97 h16" stroke="#a8763f" stroke-width="1.2" stroke-linecap="round" opacity=".7" /></g>`
  }
  return ""
}

function gearHead(a: CritterArt): string {
  if (a.classId) return outfitHead(a)
  if (a.moveType === "armored" && a.species === "dog") {
    return `<g class="pot"><ellipse cx="60" cy="36" rx="32" ry="7" fill="#9aa3b1" stroke="#5f6773" stroke-width="1.5" />
      <path d="M30 14 h60 v22 h-60 z" fill="#b7bfcb" stroke="#5f6773" stroke-width="1.5" />
      <path d="M30 14 h60" stroke="#e5eaf0" stroke-width="3" /><path d="M24 20 h-6 v8 h6 M96 20 h6 v8 h-6" fill="none" stroke="#5f6773" stroke-width="3" stroke-linecap="round" />
      <ellipse cx="60" cy="14" rx="30" ry="5" fill="#d6dce4" stroke="#5f6773" stroke-width="1.2" /><circle cx="60" cy="10" r="3.5" fill="#5f6773" /></g>`
  }
  if (a.moveType === "armored" && a.species === "mouse") {
    return `<g class="thimble"><path d="M40 12 q20 -16 40 0 v24 h-40 z" fill="#c9cbd4" stroke="#6f737f" stroke-width="1.5" stroke-linejoin="round" />
      <path d="M40 30 h40" stroke="#8c909b" stroke-width="2" /><g fill="#8c909b"><circle cx="50" cy="12" r="1.3" /><circle cx="60" cy="8" r="1.3" /><circle cx="70" cy="12" r="1.3" /><circle cx="46" cy="20" r="1.3" /><circle cx="56" cy="17" r="1.3" /><circle cx="66" cy="17" r="1.3" /><circle cx="75" cy="21" r="1.3" /></g></g>`
  }
  return ""
}

/** Правая лапа у бока тела: точка хвата оружия. */
function pawAnchor(a: CritterArt, side: 1 | -1): { x: number, y: number } {
  const rx = a.species === "mouse" ? 24 : a.species === "dog" ? 28 : 27
  const cy = a.species === "mouse" ? 88 : 86
  return { x: 60 + side * (rx + 1), y: cy + 3 }
}

/** Лапа окраса с пальчиками (без перчаток наряда). */
function furPaw(a: CritterArt, x: number, y: number, r = 6.4): string {
  const f = a.fur
  const look = lookOf(a)
  const fill = look.marking === "point" ? pointColor(a) : look.socks ? f.belly : f.fur
  return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r}" fill="${fill}" stroke="${f.line}" stroke-width="1.4" />
    <path d="M${f1(x - 2.2)} ${f1(y + r - 4)} v2.6 M${f1(x + 2.2)} ${f1(y + r - 4)} v2.6" stroke="${f.line}" stroke-width="1.1" stroke-linecap="round" />`
}

/** Оружие в правой лапе: вид — форма, грейд — материал, разновидность — отметка (art/held.ts). */
function weaponProp(a: CritterArt, pose: Pose): string {
  if (!a.weapon) return ""
  const outfitPaws = a.classId ? outfitOf(a.classId).paws : undefined
  const fistR = a.weapon === "gauntlet" ? 8 : 6.4
  const pawSvg = (x: number, y: number): string => (outfitPaws ? heldPawSvg(a, x, y) : furPaw(a, x, y, fistR))
  return heldWeaponSvg({
    kind: a.weapon,
    ...(a.weaponGrade ? { grade: a.weaponGrade } : {}),
    ...(a.weaponVariant ? { variant: a.weaponVariant } : {}),
    pose,
    paw: pawAnchor(a, 1),
    pawSvg,
    ...(leftPawFree(a) && !outfitPaws ? { leftPaw: pawAnchor(a, -1) } : {})
  })
}

/* ---------- Тело ---------- */

interface TailStroke {
  d: string
  /** Толщина хвоста. */
  w: number
  /** Кончик: для кисточки и помпона. */
  end: [number, number]
}

function catTail(shape: string, pose: Pose): TailStroke {
  if (shape === "stub") return { d: "M38 92 C 31 91, 27 86, 29 80", w: 11, end: [29, 80] }
  const w = shape === "fluffy" ? 14 : shape === "thin" ? 6.5 : 9
  if (pose === "dead") return { d: "M38 92 C 20 100, 6 96, 6 90", w, end: [6, 90] }
  if (pose === "run") return { d: "M38 92 C 12 90, 6 66, 20 56", w, end: [20, 56] }
  if (pose === "carried") return { d: "M38 92 C 30 100, 30 108, 24 112", w, end: [24, 112] }
  if (shape === "thin") return { d: "M38 92 C 14 96, 8 74, 18 62 C 22 56, 28 58, 26 62", w, end: [26, 62] }
  return { d: "M38 92 C 14 94, 8 72, 22 62", w, end: [22, 62] }
}

function dogTail(shape: string, pose: Pose): TailStroke {
  if (shape === "stub") return { d: "M34 86 C 29 84, 27 80, 28 76", w: 10, end: [28, 76] }
  const w = shape === "plume" ? 13 : shape === "thin" || shape === "pom" ? 5.5 : 9
  if (pose === "dead") return { d: "M34 86 C 20 92, 10 90, 8 86", w, end: [8, 86] }
  if (pose === "carried") return { d: "M34 86 C 28 94, 28 102, 22 108", w, end: [22, 108] }
  switch (shape) {
    case "curl":
      return { d: "M34 86 C 18 84, 14 64, 28 60 C 38 58, 41 70, 32 72", w, end: [32, 72] }
    case "long":
      return { d: "M34 86 C 20 90, 12 84, 10 72", w, end: [10, 72] }
    case "plume":
      return { d: "M34 86 C 16 90, 8 80, 9 66", w, end: [9, 66] }
    case "pom":
      return { d: "M34 86 C 26 82, 22 72, 25 62", w, end: [25, 62] }
    default:
      return { d: "M34 86 C 18 80, 20 58, 38 62", w, end: [38, 62] }
  }
}

function mouseTail(shape: string, pose: Pose): TailStroke {
  if (shape === "stub") return { d: "M40 94 C 35 96, 31 95, 30 91", w: 6, end: [30, 91] }
  const w = shape === "ringed" ? 6.5 : shape === "fluffy" ? 11 : 4.5
  if (pose === "dead") return { d: "M40 94 C 24 104, 10 100, 4 92", w, end: [4, 92] }
  if (pose === "run") return { d: "M40 94 C 20 100, 8 86, 12 70", w, end: [12, 70] }
  if (pose === "carried") return { d: "M40 94 C 34 104, 34 112, 26 118", w, end: [26, 118] }
  if (shape === "curl") return { d: "M40 94 C 22 98, 8 86, 14 72 C 18 63, 28 66, 25 73 C 23 77, 18 74, 20 71", w, end: [20, 71] }
  if (shape === "fluffy") return { d: "M40 94 C 22 98, 12 86, 18 70", w, end: [18, 70] }
  return { d: "M40 94 C 22 98, 10 86, 18 70 C 22 62, 14 60, 12 64", w, end: [12, 64] }
}

/** Хвост: форма по облику (пушистый, кольцом, тонкий, обрубок, с кисточкой…), полоски у табби. */
function tail(a: CritterArt, pose: Pose): string {
  const f = a.fur
  const look = lookOf(a)
  const shape = look.tail
  const t = a.species === "cat" ? catTail(shape, pose) : a.species === "dog" ? dogTail(shape, pose) : mouseTail(shape, pose)
  const bare = a.species === "mouse" && (shape === "bare" || shape === "ringed" || shape === "curl" || shape === "tufted" || shape === "stub")
  const pink = a.zombie ? f.earInner : mixColor(f.earInner, "#ffa8c0", 0.45)
  const fill = bare ? pink : look.marking === "point" ? pointColor(a) : f.fur
  const edge = bare ? shade(pink, -0.25) : f.line
  const stroke = (d: string, w: number, c: string, extra = "", cap: "round" | "butt" = "round"): string =>
    `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="${cap}" stroke-linejoin="round"${extra} />`
  let s = bare
    ? stroke(t.d, t.w + 2, edge) + stroke(t.d, t.w, fill)
    : stroke(t.d, t.w + 3, f.line, " opacity=\".35\"") + stroke(t.d, t.w, fill)
  // кольца: полосы табби, кольчатый хвост крысы
  if (!bare && (a.pattern === 1 || f.tabby) && shape !== "stub")
    s += stroke(t.d, t.w, f.line, ` stroke-dasharray="3 7" opacity=".5"`, "butt")
  if (shape === "ringed") s += stroke(t.d, t.w, edge, ` stroke-dasharray="1 3.5" opacity=".7"`, "butt")
  // светлая прядь вдоль пушистого хвоста
  if (shape === "fluffy" || shape === "plume") s += stroke(t.d, t.w * 0.3, shade(fill, 0.3), " opacity=\".6\" stroke-dasharray=\"10 6\"")
  const [ex, ey] = t.end
  if (shape === "tufted")
    s += `<path d="M${ex} ${ey} l-5 -7 l4 2 l1 -7 l3 7 l3 -4 l-1 7 z" fill="${f.dark}" stroke="${f.line}" stroke-width="1" stroke-linejoin="round" />`
  if (shape === "pom") s += `<g fill="${f.fur}" stroke="${f.line}" stroke-width="1.2"><circle cx="${ex - 3}" cy="${ey - 2}" r="5.5" /><circle cx="${ex + 3}" cy="${ey - 3}" r="5.5" /><circle cx="${ex}" cy="${ey - 7}" r="5.5" /></g><circle cx="${ex}" cy="${ey - 3}" r="5" fill="${f.fur}" />`
  // белый кончик (бигль, проточина)
  if (look.marking === "blaze" && !bare && shape !== "stub") s += `<circle cx="${ex}" cy="${ey}" r="${f1(t.w / 2)}" fill="${f.belly}" />`
  return `<g class="tail">${s}</g>`
}

/** Ступни: носочки, пальчики; у мышей — розовые, в позе «на руках» видны подушечки. */
function foot(a: CritterArt, cls: string, cx: number, cy: number, rx: number, ry: number, pads: boolean): string {
  const f = a.fur
  const look = lookOf(a)
  const pinkFeet = a.species === "mouse" && !a.zombie
  const fill = look.marking === "point" ? pointColor(a) : look.marking === "tan" ? tint(a, TAN) : look.socks || a.pattern === 3 ? f.belly : f.fur
  const toes = `<path d="M${f1(cx - rx * 0.3)} ${f1(cy - ry + 1.5)} v3.2 M${f1(cx + rx * 0.3)} ${f1(cy - ry + 1.5)} v3.2" stroke="${f.line}" stroke-width="1.2" stroke-linecap="round" />`
  const pink = mixColor(f.earInner, "#ffa8c0", 0.45)
  const beans = pads
    ? `<ellipse cx="${cx}" cy="${f1(cy + 1.2)}" rx="${f1(rx * 0.42)}" ry="${f1(ry * 0.38)}" fill="${pink}" /><g fill="${pink}"><circle cx="${f1(cx - rx * 0.5)}" cy="${f1(cy - ry * 0.35)}" r="1.5" /><circle cx="${cx}" cy="${f1(cy - ry * 0.55)}" r="1.5" /><circle cx="${f1(cx + rx * 0.5)}" cy="${f1(cy - ry * 0.35)}" r="1.5" /></g>`
    : ""
  const tips = pinkFeet ? `<ellipse cx="${cx}" cy="${f1(cy + ry * 0.35)}" rx="${f1(rx * 0.7)}" ry="${f1(ry * 0.4)}" fill="${pink}" opacity=".9" />` : ""
  return `<g class="leg ${cls}"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${f1(ry)}" fill="${fill}" stroke="${f.line}" ${sw} />${tips}${beans || toes}</g>`
}

function legs(a: CritterArt, pose: Pose): string {
  if (a.mount || (!a.classId && a.moveType === "cavalry")) return ""
  const dx = pose === "run" ? 6 : pose === "carried" ? -4 : 0
  const cy = pose === "carried" ? 99 : 102
  const rx = a.species === "mouse" ? 7.5 : 9
  const ry = (a.species === "mouse" ? 5.5 : 6.5) * (pose === "carried" ? 1.15 : 1)
  const pads = pose === "carried" || pose === "dead"
  return `<g class="legs">${foot(a, "leg-back", 44 - dx, cy, rx, ry, pads)}${foot(a, "leg-front", 76 + dx, cy, rx, ry, pads)}</g>`
}

function body(a: CritterArt): string {
  const f = a.fur
  const rx = a.species === "mouse" ? 24 : a.species === "dog" ? 28 : 27
  const ry = a.species === "mouse" ? 16 : 18
  const cy = a.species === "mouse" ? 88 : 86
  const belly = lookOf(a).marking === "tan" ? tint(a, TAN) : f.belly
  return `<ellipse cx="60" cy="${cy}" rx="${rx}" ry="${ry}" fill="${f.fur}" stroke="${f.line}" ${sw} />
    <path d="${crescent(60, cy, ry - 0.8, 3.5, 4)}" transform="translate(60 ${cy}) scale(${f1(rx / ry)} 1) translate(-60 ${-cy})" fill="${f.line}" opacity=".16" />
    <ellipse cx="60" cy="${cy + 4}" rx="15" ry="10" fill="${belly}" />${patternBody(a)}${a.zombie ? zombiePatch(cy) : ""}`
}

/** Лицо зомби вместо румянца: трупные пятна на щеках и шрам со швами через лоб. */
function zombieFace(a: CritterArt, cy: number, r: number): string {
  const top = cy - r * 0.62
  return `<ellipse cx="33" cy="${cy + 9}" rx="7" ry="4.5" fill="#5f7a3e" opacity=".5" />
    <ellipse cx="88" cy="${cy + 7}" rx="5" ry="3.5" fill="#6b4f72" opacity=".45" />
    <path d="M70 ${top} q8 6 14 16" fill="none" stroke="${a.fur.line}" stroke-width="2" stroke-linecap="round" />
    <g stroke="${INK}" stroke-width="1.4" stroke-linecap="round">
      <path d="M71 ${top + 4} l5 -3 M74 ${top + 8} l5 -3 M77 ${top + 12} l5 -3" /></g>`
}

/** Заплатка со стежками на боку тела зомби и рваная рана на животе, сквозь которую видны рёбра. */
function zombiePatch(cy: number): string {
  return `<path d="M44 ${cy - 2} q4 -5 9 -3 q4 3 2 9 q-1 6 -7 6 q-6 -1 -6 -6 q-1 -3 2 -6 z" fill="#5c1f24" stroke="#2f0d10" stroke-width="1.2" stroke-linejoin="round" />
    <g fill="none" stroke="#efe6c8" stroke-width="1.7" stroke-linecap="round"><path d="M45.5 ${cy + 0.5} q4.5 -2.5 8.5 0 M45 ${cy + 4} q5 -2.5 9.5 0 M46.5 ${cy + 7.5} q4 -2 7.5 0" /></g>
    <path d="M44 ${cy - 2} l-1.5 2 M49 ${cy - 5} l0 -2 M55 ${cy + 1} l2 0" stroke="#2f0d10" stroke-width="1" stroke-linecap="round" />
    <rect x="66" y="${cy - 10}" width="12" height="10" rx="1.5" fill="#a58b6b" stroke="#5c4632" stroke-width="1.2" transform="rotate(-12 72 ${cy - 5})" />
    <g stroke="#3b2614" stroke-width="1" stroke-linecap="round" transform="rotate(-12 72 ${cy - 5})">
      <path d="M66 ${cy - 8} h-2 M66 ${cy - 4} h-2 M78 ${cy - 8} h2 M78 ${cy - 4} h2 M69 ${cy - 10} v-2 M75 ${cy - 10} v-2" /></g>`
}

function head(a: CritterArt, pose: Pose): string {
  const f = a.fur
  const r = a.species === "mouse" ? 31 : a.species === "dog" ? 33 : 34
  const cy = a.species === "mouse" ? 52 : 50
  const blushY = a.species === "mouse" ? 62 : 60
  const blush = pose === "happy" ? 0.75 : 0.55
  const e = ears(a, pose)
  return `<g class="head">
    ${outfitHeadBack(a)}
    ${e.back}
    ${cheekFluff(a, cy, r)}
    <circle cx="60" cy="${cy}" r="${r}" fill="${f.fur}" stroke="${f.line}" ${sw} />
    ${patternHead(a)}
    ${markingHead(a, cy, r)}
    <path d="${crescent(60, cy, r - 0.8, 4, 5)}" fill="${f.line}" opacity=".15" />
    <ellipse cx="${60 - r * 0.5}" cy="${cy - r * 0.55}" rx="8" ry="4.5" transform="rotate(-35 ${60 - r * 0.5} ${cy - r * 0.55})" fill="#fff" opacity=".22" />
    ${e.front}
    ${tuft(a, cy - r)}
    ${a.zombie ? zombieFace(a, cy, r) : `<ellipse cx="34" cy="${blushY}" rx="8" ry="4.5" fill="${BLUSH}" opacity="${blush}" />
    <ellipse cx="86" cy="${blushY}" rx="8" ry="4.5" fill="${BLUSH}" opacity="${blush}" />`}
    ${faceSpots(a, cy)}
    ${eyesGroup(a, pose)}
    ${mouth(a, pose)}
    ${a.zombie ? zombieMouth(a, pose) : ""}
    ${whiskers(a)}
    ${accessory(a)}
    ${gearHead(a)}
    ${a.boss ? crown(hatLift(a.classId)) : ""}
    ${pose === "hurt" ? "<path d=\"M96 36 q4 -8 8 0 a4 4 0 1 1 -8 0 z\" fill=\"#8ecae6\" />" : ""}
  </g>`
}

/**
 * Гнилая шерсть зомби из окраса модели: цвета смешиваются с болотно-зелёным, окрас угадывается;
 * внутри ушей — синюшный. Без `zombie` — без изменений.
 */
export function zombieFur(f: FurArt): FurArt {
  return {
    ...f,
    fur: mixColor(f.fur, "#7a9e4f", 0.72),
    belly: mixColor(f.belly, "#b9cc8a", 0.7),
    line: mixColor(f.line, "#24301b", 0.6),
    dark: mixColor(f.dark, "#3e5233", 0.6),
    earInner: "#8f7a99"
  }
}

function zombify(a: CritterArt): CritterArt {
  return a.zombie ? { ...a, fur: zombieFur(a.fur) } : a
}

/**
 * Одежда зомби истлела: рваные дыры с гнилой кожей и бурые пятна поверх наряда — так враг отличим от своего
 * бойца того же класса даже по силуэту одежды.
 */
function zombieRags(a: CritterArt): string {
  const cy = a.species === "mouse" ? 88 : 86
  const hole = (x: number, y: number, s: number) =>
    `<path d="M${f1(x - 4 * s)} ${f1(y - 1 * s)} l${f1(2 * s)} ${f1(-3 * s)} l${f1(2 * s)} ${f1(1.5 * s)} l${f1(2.5 * s)} ${f1(-2 * s)} l${f1(1.5 * s)} ${f1(3.5 * s)} l${f1(-1 * s)} ${f1(3 * s)} l${f1(-3 * s)} ${f1(1 * s)} l${f1(-2.5 * s)} ${f1(-1.5 * s)} z" fill="${a.fur.fur}" stroke="${a.fur.line}" stroke-width="1" stroke-linejoin="round" />`
  return `<g class="rags">
    <g fill="#4a3a1e" opacity=".32"><ellipse cx="72" cy="${cy + 9}" rx="7" ry="3.5" /><ellipse cx="50" cy="${cy + 12}" rx="5" ry="2.5" /><ellipse cx="80" cy="${cy - 3}" rx="3.5" ry="5" /></g>
    ${hole(71, cy + 4, 1.1)}${hole(52, cy + 11, 0.8)}
    <path d="M40 ${cy + 14} l3 4 l2 -3 l3 4 l2 -3 l3 3" fill="none" stroke="${a.fur.line}" stroke-width="1.2" stroke-linejoin="round" opacity=".7" />
  </g>`
}

/** Сияние яруса и верховое животное — позади всадника. */
function behindRider(a: CritterArt): string {
  return a.classId ? outfitAura(a) + mountSvg(a) : ""
}

/** Всадник на животном уменьшен и приподнят (`RIDER_TRANSFORM`). */
function onMount(a: CritterArt, inner: string): string {
  return a.mount ? `<g class="rider" transform="${RIDER_TRANSFORM}">${inner}</g>` : inner
}

/** Полный SVG миниатюры. */
export function critterSvg(art: CritterArt): string {
  const a = zombify(art)
  const pose: Pose = a.pose ?? "idle"
  const rigTransform
    = a.zombie && (pose === "idle" || pose === "blink" || pose === "happy")
      // зомби сутулится и клонится вперёд, будто вот-вот шагнёт
      ? "transform=\"rotate(6 60 104)\""
      : pose === "hurt"
      ? "transform=\"translate(0 6) scale(1.06 0.94) translate(0 -2)\""
      : pose === "run"
        ? "transform=\"translate(0 -3) rotate(4 60 86)\""
        : pose === "carried"
          ? "transform=\"translate(60 40) scale(0.96 1.06) rotate(-6) translate(-60 -40)\""
          : ""
  // выпавшее оружие лежит у лап (под телом), в остальных позах — в правой лапе поверх головы
  const dropped = pose === "dead" ? weaponProp(a, pose) : ""
  const held = pose === "dead" ? "" : weaponProp(a, pose)
  const rider = `${gearBehind(a)}${tail(a, pose)}${legs(a, pose)}${dropped}${body(a)}${gearBody(a)}${chestFluff(a)}${a.zombie ? zombieRags(a) : ""}${head(a, pose)}${held}`
  return `<svg viewBox="${VIEW_BOX}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" overflow="visible">
  <g class="rig" ${rigTransform}>
    ${behindRider(a)}
    ${onMount(a, rider)}
  </g>
</svg>`
}

/* ---------- Части тела для анимаций разлёта ---------- */

export type CritterPart = "head" | "body" | "tail" | "legFront" | "legBack"
export const CRITTER_PARTS: readonly CritterPart[] = ["head", "body", "tail", "legFront", "legBack"]

/** Центры частей в нормированных координатах текстуры (0..1), для origin спрайтов при разлёте. */
export const CRITTER_PART_ANCHORS: Record<CritterPart, { x: number, y: number }> = {
  head: { x: 0.5, y: (50 - VIEW.y) / VIEW.h },
  body: { x: 0.5, y: (86 - VIEW.y) / VIEW.h },
  tail: { x: 22 / VIEW.w, y: (80 - VIEW.y) / VIEW.h },
  legFront: { x: 76 / VIEW.w, y: (102 - VIEW.y) / VIEW.h },
  legBack: { x: 44 / VIEW.w, y: (102 - VIEW.y) / VIEW.h }
}

function singleLeg(a: CritterArt, which: "front" | "back"): string {
  const rx = a.species === "mouse" ? 7.5 : 9
  const ry = a.species === "mouse" ? 5.5 : 6.5
  const cx = which === "front" ? 76 : 44
  return `${foot(a, `leg-${which}`, cx, 102, rx, ry, false)}
    <ellipse cx="${cx}" cy="${102 - ry + 1}" rx="${rx * 0.55}" ry="2.2" fill="#d9122b" opacity=".85" />`
}

/**
 * Отдельная часть миниатюры в том же viewBox, что и целая фигура: накладывается поверх спрайта
 * без пересчёта координат. Голова — с крестиками в глазах, срезы отмечены кровью.
 */
export function critterPartSvg(a: CritterArt, part: CritterPart): string {
  const dead: CritterArt = { ...zombify(a), pose: "dead", animated: false }
  let inner = ""
  switch (part) {
    case "head":
      inner = onMount(dead, `${head(dead, "dead")}<ellipse cx="60" cy="84" rx="14" ry="4" fill="#d9122b" opacity=".9" />`)
      break
    case "body":
      inner = behindRider(dead)
        + onMount(dead, `${gearBehind(dead)}${weaponProp(dead, "dead")}${body(dead)}${gearBody(dead)}${chestFluff(dead)}<ellipse cx="60" cy="70" rx="12" ry="3.5" fill="#d9122b" opacity=".9" />`)
      break
    case "tail":
      inner = onMount(dead, `${tail(dead, "idle")}<circle cx="38" cy="92" r="4" fill="#d9122b" opacity=".9" />`)
      break
    case "legFront":
      inner = onMount(dead, singleLeg(dead, "front"))
      break
    case "legBack":
      inner = onMount(dead, singleLeg(dead, "back"))
      break
  }
  return `<svg viewBox="${VIEW_BOX}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" overflow="visible"><g class="rig">${inner}</g></svg>`
}
