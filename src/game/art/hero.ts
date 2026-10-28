/**
 * Главный герой деревни: маленький чиби в чёрном плаще, лицо наглухо скрыто капюшоном. Заскучав, он снимает
 * капюшон (`hood: false`) — под ним белый котёнок в больших наушниках; капюшон тогда лежит складками на плечах. Четыре направления (left — зеркало right), кадры ходьбы и дыхания. Без градиентов и id,
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
  /** Капюшон надет (по умолчанию). false — откинут, видна голова котёнка. */
  hood?: boolean
  /** Котёнок моргает (только без капюшона). */
  blink?: boolean
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

/** Котёнок под капюшоном: белая шёрстка, розовые уши и нос, голубые глаза; наушники — тёмные с алым кольцом. */
const K = {
  fur: "#f4f1ec",
  shade: "#d6d0c7",
  ear: "#f2a7b8",
  nose: "#e57d94",
  iris: "#7fb6e6",
  pupil: "#1b1a24",
  line: "#6b5f66",
  whisker: "#b9b0aa",
  phone: "#26262f",
  phoneLight: "#4a4a58",
  phoneRing: "#dc3341"
} as const

/** Чашка наушника: корпус, алое кольцо, амбушюра и блик. */
function cup(cx: number, cy: number, rx: number, ry: number): string {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${K.phone}" />`
    + `<ellipse cx="${cx}" cy="${cy}" rx="${r(rx * 0.68)}" ry="${r(ry * 0.72)}" fill="none" stroke="${K.phoneRing}" stroke-width="1.6" />`
    + `<ellipse cx="${r(cx - rx * 0.3)}" cy="${r(cy - ry * 0.45)}" rx="${r(rx * 0.28)}" ry="${r(ry * 0.18)}" fill="#fff" opacity=".35" />`
}

/** Большие наушники: дужка через макушку между ушками и две чашки по бокам головы (сбоку видна одна). */
function headphones(view: "front" | "back" | "side"): string {
  if (view === "side")
    return `<path d="M26 22 C25 11 33 7.5 40 10.5" fill="none" stroke="${K.phone}" stroke-width="3.4" stroke-linecap="round" />`
      + `<path d="M27.4 19 C27.4 12.5 32 9.8 37 10.8" fill="none" stroke="${K.phoneLight}" stroke-width="1" stroke-linecap="round" />`
      + `<rect x="24" y="20.5" width="4" height="4" rx="1" fill="${K.phone}" />`
      + cup(26, 28, 6.4, 8)
  const band = `<path d="M14.5 25 C14 9.5 50 9.5 49.5 25" fill="none" stroke="${K.phone}" stroke-width="3.4" stroke-linecap="round" />`
    + (view === "front" ? `<path d="M18 17 C22 11.5 42 11.5 46 17" fill="none" stroke="${K.phoneLight}" stroke-width="1" stroke-linecap="round" />` : "")
  // со спины видна тыльная сторона чашек — без бликов кольца
  const cups = view === "front"
    ? cup(14.5, 28.5, 5.4, 7.4) + cup(49.5, 28.5, 5.4, 7.4)
    : `<ellipse cx="14.5" cy="28.5" rx="5.4" ry="7.4" fill="${K.phone}" /><ellipse cx="49.5" cy="28.5" rx="5.4" ry="7.4" fill="${K.phone}" />`
      + `<path d="M12 23.5 Q14.5 22 17 23.5 M47 23.5 Q49.5 22 52 23.5" fill="none" stroke="${K.phoneLight}" stroke-width="1" stroke-linecap="round" />`
  return band + cups
}

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

/* ---------- Без капюшона: котёнок ---------- */

/** Откинутый капюшон анфас: складки ткани за головой на плечах, видна алая изнанка. */
function droppedFront(): string {
  return `<path d="M9 45 Q10 33 21 33.5 L43 33.5 Q54 33 55 45 Q45 50.5 32 50.5 Q19 50.5 9 45 Z" fill="${C.cloak}" />`
    + `<path d="M13 40.5 Q15 35.5 23 36 L41 36 Q49 35.5 51 40.5" fill="none" stroke="${C.lining}" stroke-width="2.2" stroke-linecap="round" />`
    + `<path d="M11 44 Q12 38 17 36.5" fill="none" stroke="${C.rim}" stroke-width="1.3" stroke-linecap="round" />`
}

/** Голова котёнка анфас: круглая, ушки с розовым, большие глаза, нос, «w»-ротик, румянец и усы. */
function kittenFront(blink: boolean): string {
  const eye = (x: number): string => blink
    ? `<path d="M${x - 2.8} 29.5 Q${x} 31.8 ${x + 2.8} 29.5" fill="none" stroke="${K.pupil}" stroke-width="1.4" stroke-linecap="round" />`
    : `<ellipse cx="${x}" cy="29" rx="2.9" ry="3.4" fill="${K.iris}" /><ellipse cx="${x}" cy="29.3" rx="1.6" ry="2.6" fill="${K.pupil}" />`
      + `<circle cx="${x - 0.9}" cy="27.8" r="0.95" fill="#fff" />`
  return `<path d="M17 22 L15.5 7 L28 14.5 Z" fill="${K.fur}" /><path d="M18.6 19 L17.8 10.4 L25.2 14.8 Z" fill="${K.ear}" />`
    + `<path d="M47 22 L48.5 7 L36 14.5 Z" fill="${K.fur}" /><path d="M45.4 19 L46.2 10.4 L38.8 14.8 Z" fill="${K.ear}" />`
    + `<ellipse cx="32" cy="28" rx="16.5" ry="14.5" fill="${K.fur}" />`
    + `<path d="M17 32 Q20 41.5 32 42.5 Q44 41.5 47 32 Q44 39 32 39.5 Q20 39 17 32 Z" fill="${K.shade}" />`
    + `<path d="M28 15 Q29.5 17.5 29 20 M32 14.2 L32 18.6 M36 15 Q34.5 17.5 35 20" fill="none" stroke="${K.shade}" stroke-width="1.3" stroke-linecap="round" />`
    + eye(25.5) + eye(38.5)
    + `<ellipse cx="21" cy="34" rx="2.8" ry="1.6" fill="${K.ear}" opacity=".55" /><ellipse cx="43" cy="34" rx="2.8" ry="1.6" fill="${K.ear}" opacity=".55" />`
    + `<path d="M30.6 33 L33.4 33 L32 34.6 Z" fill="${K.nose}" />`
    + `<path d="M29.4 35.6 Q30.7 37.2 32 35.6 Q33.3 37.2 34.6 35.6" fill="none" stroke="${K.line}" stroke-width="0.9" stroke-linecap="round" />`
    + headphones("front")
    + `<g stroke="${K.whisker}" stroke-width="0.8" stroke-linecap="round"><path d="M18 33 L11 31.5 M18 35 L11.5 36" /><path d="M46 33 L53 31.5 M46 35 L52.5 36" /></g>`
}

/** Откинутый капюшон сзади: тряпичным мешком висит на спине, прикрывая шею. */
function droppedBack(): string {
  return `<path d="M15 38 Q32 33 49 38 Q50 47 43 52 Q32 56 21 52 Q14 47 15 38 Z" fill="${C.cloak}" />`
    + `<path d="M18 40 Q32 36 46 40" fill="none" stroke="${C.rim}" stroke-width="1.3" stroke-linecap="round" />`
    + `<path d="M32 39 Q31 46 32 53" fill="none" stroke="${C.shade}" stroke-width="1.5" />`
}

/** Голова котёнка со спины: ушки и затылок. */
function kittenBack(): string {
  return `<path d="M17 22 L15.5 7 L28 14.5 Z" fill="${K.fur}" /><path d="M47 22 L48.5 7 L36 14.5 Z" fill="${K.fur}" />`
    + `<path d="M17.8 19.5 L17 10 L25 14.6" fill="none" stroke="${K.shade}" stroke-width="1.2" stroke-linejoin="round" />`
    + `<path d="M46.2 19.5 L47 10 L39 14.6" fill="none" stroke="${K.shade}" stroke-width="1.2" stroke-linejoin="round" />`
    + `<ellipse cx="32" cy="28" rx="16.5" ry="14.5" fill="${K.fur}" />`
    + `<path d="M19 34 Q24 41.5 32 41.5 Q40 41.5 45 34 Q40 38.5 32 38.5 Q24 38.5 19 34 Z" fill="${K.shade}" />`
    + `<path d="M29 16 Q30 20 29.5 24 M35 16 Q34 20 34.5 24" fill="none" stroke="${K.shade}" stroke-width="1.3" stroke-linecap="round" />`
    + headphones("back")
}

/** Откинутый капюшон сбоку (вид справа): складки за затылком. */
function droppedSide(): string {
  return `<path d="M9 44 Q8 32 20 32.5 L38 35 Q44 40 41 47 Q28 51 15 48 Z" fill="${C.cloak}" />`
    + `<path d="M12 39 Q14 34.5 21 35 L36 37" fill="none" stroke="${C.lining}" stroke-width="2.2" stroke-linecap="round" />`
}

/** Голова котёнка в профиль (смотрит вправо): ушки, глаз, мордочка с носом и усами. */
function kittenSide(blink: boolean): string {
  const eye = blink
    ? `<path d="M37.6 29.5 Q40.2 31.8 42.8 29.5" fill="none" stroke="${K.pupil}" stroke-width="1.4" stroke-linecap="round" />`
    : `<ellipse cx="40.4" cy="29" rx="2.5" ry="3.4" fill="${K.iris}" /><ellipse cx="41" cy="29.3" rx="1.4" ry="2.6" fill="${K.pupil}" />`
      + `<circle cx="40" cy="27.8" r="0.9" fill="#fff" />`
  return `<path d="M19 21 L15.5 7.5 L28 14 Z" fill="${K.shade}" />`
    + `<path d="M33 15 L41 4.5 L44.5 19 Z" fill="${K.fur}" /><path d="M35.6 14.6 L40.6 8 L42.6 17 Z" fill="${K.ear}" />`
    + `<ellipse cx="32" cy="28" rx="16" ry="14.5" fill="${K.fur}" />`
    + `<ellipse cx="46" cy="33" rx="5.2" ry="4" fill="${K.fur}" />`
    + `<path d="M18 33 Q22 41.5 32 42.5 Q40 42 44 37.5 Q38 40 31 39.5 Q22 39 18 33 Z" fill="${K.shade}" />`
    + `<path d="M24 15.5 Q25.5 18.5 25 21.5 M28.5 14.5 Q29.5 17.5 29 20.5" fill="none" stroke="${K.shade}" stroke-width="1.3" stroke-linecap="round" />`
    + eye
    + `<ellipse cx="38.5" cy="35" rx="2.6" ry="1.5" fill="${K.ear}" opacity=".55" />`
    + `<path d="M49.6 30.8 L51.6 31.6 L50 33 Z" fill="${K.nose}" />`
    + `<path d="M47.6 35.2 Q48.8 36.6 50.2 35.4" fill="none" stroke="${K.line}" stroke-width="0.9" stroke-linecap="round" />`
    + headphones("side")
    + `<g stroke="${K.whisker}" stroke-width="0.8" stroke-linecap="round"><path d="M47 33.4 L55 31.8 M47 35 L54.6 36" /></g>`
}

export function heroSvg(a: HeroArt = {}): string {
  const facing = a.facing ?? "down"
  const pose = a.pose ?? "idle"
  const m = motionOf(pose, a.frame ?? 0)
  const eyes = a.eyes ?? true
  const side = facing === "left" || facing === "right"
  const blink = !!a.blink
  const hood = a.hood === false
    ? facing === "up"
      ? kittenBack() + droppedBack()
      : side
        ? droppedSide() + kittenSide(blink) + `<circle cx="38" cy="46" r="2.1" fill="${C.clasp}" />`
        : droppedFront() + kittenFront(blink) + `<circle cx="32" cy="46" r="2.3" fill="${C.clasp}" /><circle cx="31.4" cy="45.4" r=".8" fill="#e6e9f0" />`
    : facing === "up" ? hoodBack() : side ? hoodSide(eyes) : hoodFront(eyes)
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
  const head = a.hood === false ? (a.blink ? "kb" : "k") : a.eyes === false ? 0 : 1
  return `hero:${a.facing ?? "down"}:${pose}:${f}:${head}`
}

/** Портрет героя для окна разговора: капюшон крупно, анфас. */
export function heroPortraitSvg(): string {
  return heroSvg({ facing: "down" }).replace(`viewBox="0 0 ${HERO_VIEW.w} ${HERO_VIEW.h}" width="${HERO_VIEW.w}" height="${HERO_VIEW.h}"`, "viewBox=\"6 0 52 52\" width=\"52\" height=\"52\"")
}
