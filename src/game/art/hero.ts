/**
 * Главный герой деревни: маленький чиби в чёрном плаще, лицо наглухо скрыто капюшоном.
 * Четыре направления (left — зеркало right), кадры ходьбы и дыхания. Без градиентов и id,
 * чтобы несколько копий в одном DOM не конфликтовали.
 */

export type HeroFacing = "down" | "up" | "left" | "right"
export type HeroPose = "idle" | "walk"

export interface HeroArt {
  facing?: HeroFacing
  pose?: HeroPose
  /** Номер кадра: ходьба — 0..3, дыхание — 0..1 (берётся по модулю). */
  frame?: number
  /** Тусклые блики глаз в темноте капюшона. */
  eyes?: boolean
}

export const HERO_VIEW = { w: 64, h: 80 } as const
export const HERO_WALK_FRAMES = 4
export const HERO_IDLE_FRAMES = 2
/** Точка опоры (ноги) в долях кадра — для setOrigin в Phaser. */
export const HERO_ANCHOR = { x: 0.5, y: 72 / 80 } as const

const C = {
  cloak: "#1c1c24",
  shade: "#101016",
  light: "#34343f",
  rim: "#4b4b5a",
  void: "#050507",
  lining: "#5a1420",
  clasp: "#9aa0ae",
  boot: "#0c0c10",
  eye: "#cfd8ff"
} as const

interface Motion {
  /** Подъём всего тела (шаг/вдох). */
  bob: number
  /** Сдвиг ступней по y: шагающая нога приподнята. */
  footL: number
  footR: number
  /** Раскачивание подола и рукавов по x. */
  sway: number
}

function motionOf(pose: HeroPose, frame: number): Motion {
  if (pose === "walk") {
    const f = ((frame % HERO_WALK_FRAMES) + HERO_WALK_FRAMES) % HERO_WALK_FRAMES
    return [
      { bob: 0, footL: 0, footR: 0, sway: 0 },
      { bob: -1.5, footL: -2, footR: 0.5, sway: 1.5 },
      { bob: 0, footL: 0, footR: 0, sway: 0 },
      { bob: -1.5, footL: 0.5, footR: -2, sway: -1.5 }
    ][f] as Motion
  }
  const f = ((frame % HERO_IDLE_FRAMES) + HERO_IDLE_FRAMES) % HERO_IDLE_FRAMES
  return { bob: f === 1 ? -0.7 : 0, footL: 0, footR: 0, sway: 0 }
}

const r = (n: number): string => String(Math.round(n * 10) / 10)

function hem(sway: number, y0 = 0): string {
  const s = sway
  return `Q${r(16 + s * 0.3)} ${r(58 + y0)} ${r(12 + s)} ${r(68 + y0)} `
    + `Q${r(17 + s)} ${r(71 + y0)} ${r(22 + s)} ${r(69 + y0)} Q${r(27 + s)} ${r(72 + y0)} ${r(32 + s)} ${r(70 + y0)} `
    + `Q${r(37 + s)} ${r(72 + y0)} ${r(42 + s)} ${r(69 + y0)} Q${r(47 + s)} ${r(71 + y0)} ${r(52 + s)} ${r(68 + y0)} `
    + `Q${r(48 + s * 0.3)} ${r(58 + y0)} 46 ${r(44 + y0)}`
}

function feet(m: Motion, side: boolean): string {
  const l = side ? 28 : 25
  const rr = side ? 37 : 39
  return `<g fill="${C.boot}">`
    + `<ellipse cx="${r(l + (side ? m.sway : 0))}" cy="${r(70.5 + m.footL)}" rx="4.6" ry="2.8" />`
    + `<ellipse cx="${r(rr - (side ? m.sway : 0))}" cy="${r(70.5 + m.footR)}" rx="4.6" ry="2.8" />`
    + "</g>"
}

/** Подол с алой подкладкой, складки и рукава. */
function cloak(m: Motion, back: boolean): string {
  const lining = `<path d="M24 43.6 Q18.6 44 18 47.6 ${hem(m.sway, 1.6)} Q46 43.6 40 43.6 Z" fill="${C.lining}" />`
  const body = `<path d="M24 42 Q18.5 42.4 18 46 ${hem(m.sway)} Q46 42 40 42 Z" fill="${C.cloak}" />`
  const folds = back
    ? `<path d="M32 46 Q${r(31 + m.sway * 0.6)} 58 ${r(32 + m.sway)} 69" fill="none" stroke="${C.shade}" stroke-width="1.6" />`
    : `<path d="M25 47 Q${r(23 + m.sway * 0.5)} 58 ${r(21 + m.sway)} 68 M39 47 Q${r(41 + m.sway * 0.5)} 58 ${r(43 + m.sway)} 68"`
      + ` fill="none" stroke="${C.shade}" stroke-width="1.4" />`
  const rim = `<path d="M19 46 Q17 57 ${r(13.5 + m.sway)} 66.5" fill="none" stroke="${C.light}" stroke-width="1.2" opacity=".8" />`
  const sleeveL = `<path d="M18 46 Q${r(12 + m.sway)} 53 ${r(15 + m.sway)} 59 Q${r(19 + m.sway)} 60 21 55 Z" fill="${C.shade}" />`
  const sleeveR = `<path d="M46 46 Q${r(52 - m.sway)} 53 ${r(49 - m.sway)} 59 Q${r(45 - m.sway)} 60 43 55 Z" fill="${C.shade}" />`
  return lining + body + folds + rim + sleeveL + sleeveR
}

function hoodFront(eyes: boolean): string {
  return `<path d="M27 7.5 Q30 -1 40 1.5 Q35.5 3.5 37 8 Z" fill="${C.cloak}" />`
    + `<path d="M32 5 C46 5 53 15 53 28 C53 39 46 46 32 46 C18 46 11 39 11 28 C11 15 18 5 32 5 Z" fill="${C.cloak}" />`
    + `<path d="M15 22 C17 12 24 7.5 32 7" fill="none" stroke="${C.rim}" stroke-width="1.6" stroke-linecap="round" />`
    + `<path d="M47 40 C44 43.5 39 45 32 45" fill="none" stroke="${C.shade}" stroke-width="2" stroke-linecap="round" />`
    // проём капюшона: толстый край ткани и непроглядная тьма
    + "<path d=\"M32 15 C43 15 47.5 22.5 47.5 31 C47.5 38.5 41 43 32 43 C23 43 16.5 38.5 16.5 31 C16.5 22.5 21 15 32 15 Z\""
    + ` fill="${C.shade}" />`
    + "<path d=\"M32 17.5 C41 17.5 45 23.5 45 31 C45 37.5 39.5 41 32 41 C24.5 41 19 37.5 19 31 C19 23.5 23 17.5 32 17.5 Z\""
    + ` fill="${C.void}" />`
    + (eyes
      ? `<g fill="${C.eye}" opacity=".5"><ellipse cx="27" cy="31.5" rx="1.7" ry="1" /><ellipse cx="37" cy="31.5" rx="1.7" ry="1" /></g>`
      : "")
    + `<circle cx="32" cy="46" r="2.3" fill="${C.clasp}" /><circle cx="31.4" cy="45.4" r=".8" fill="#e6e9f0" />`
}

function hoodBack(): string {
  return `<path d="M27 7.5 Q30 -1 40 1.5 Q35.5 3.5 37 8 Z" fill="${C.cloak}" />`
    + `<path d="M32 5 C46 5 53 15 53 28 C53 39 46 46 32 46 C18 46 11 39 11 28 C11 15 18 5 32 5 Z" fill="${C.cloak}" />`
    + `<path d="M32 7 Q30.5 26 32 45" fill="none" stroke="${C.shade}" stroke-width="1.6" />`
    + `<path d="M15 22 C17 12 24 7.5 32 7" fill="none" stroke="${C.rim}" stroke-width="1.6" stroke-linecap="round" />`
    + `<path d="M13 34 C16 42 24 46 32 46 C40 46 48 42 51 34" fill="none" stroke="${C.shade}" stroke-width="2" />`
}

/** Вид справа; вид слева — зеркало. */
function hoodSide(eyes: boolean): string {
  return `<path d="M22 10 Q12 4 7 11 Q13 11 17 17 Z" fill="${C.cloak}" />`
    + `<path d="M31 5 C45 5 52 15 52 28 C52 39 45 46 31 46 C18 46 12 39 12 28 C12 15 18 5 31 5 Z" fill="${C.cloak}" />`
    + `<path d="M15 24 C16 13 23 7.5 31 7" fill="none" stroke="${C.rim}" stroke-width="1.6" stroke-linecap="round" />`
    + `<path d="M40 16 C49 17 52 24 52 31 C52 38 48 42.5 41 43 C36.5 39 35 35 35 30 C35 24 36.5 19 40 16 Z" fill="${C.shade}" />`
    + "<path d=\"M41 18.5 C48 19.5 50.5 25 50.5 31 C50.5 37 47 40.5 41.5 41 C38 37.5 37 34 37 30 C37 25 38.5 21 41 18.5 Z\""
    + ` fill="${C.void}" />`
    + (eyes ? `<ellipse cx="45.5" cy="31.5" rx="1.3" ry="1" fill="${C.eye}" opacity=".5" />` : "")
    + `<circle cx="38" cy="46" r="2.1" fill="${C.clasp}" />`
}

export function heroSvg(a: HeroArt = {}): string {
  const facing = a.facing ?? "down"
  const pose = a.pose ?? "idle"
  const m = motionOf(pose, a.frame ?? 0)
  const eyes = a.eyes ?? true
  const side = facing === "left" || facing === "right"
  const hood = facing === "up" ? hoodBack() : side ? hoodSide(eyes) : hoodFront(eyes)
  const shadow = `<ellipse cx="32" cy="73" rx="${r(15 + m.bob * 0.6)}" ry="3.6" fill="#000" opacity=".28" />`
  const figure = `<g transform="translate(0 ${r(m.bob)})">${cloak(m, facing === "up")}${hood}</g>`
  const body = `${shadow}${feet(m, side)}${figure}`
  const content = facing === "left" ? `<g transform="translate(${HERO_VIEW.w} 0) scale(-1 1)">${body}</g>` : body
  return `<svg viewBox="0 0 ${HERO_VIEW.w} ${HERO_VIEW.h}" width="${HERO_VIEW.w}" height="${HERO_VIEW.h}"`
    + ` xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${content}</svg>`
}

/** Ключ текстуры Phaser для кадра. */
export function heroArtKey(a: HeroArt = {}): string {
  const pose = a.pose ?? "idle"
  const n = pose === "walk" ? HERO_WALK_FRAMES : HERO_IDLE_FRAMES
  const f = (((a.frame ?? 0) % n) + n) % n
  return `hero:${a.facing ?? "down"}:${pose}:${f}:${a.eyes === false ? 0 : 1}`
}
