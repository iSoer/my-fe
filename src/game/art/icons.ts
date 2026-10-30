/**
 * Иконки в стиле «штампа» вместо эмодзи: белый силуэт с жирным чернильным контуром, жёсткая красная тень и наклон
 * −10°, как у кнопок и плашек меню. У каждой иконки задана только геометрия (поле 64×64): силуэт `b` и линии
 * внутри `d`; тень, контур, заливку и наклон добавляет `iconSvg` — так все иконки выглядят одинаково.
 *
 * Тон: `light` — белая заливка (на тёмном фоне), `dark` — чернильная заливка и белые линии деталей (на светлом).
 * Контур чернильный в обоих тонах. Без тона SVG красится CSS-переменными `--ic-fill`, `--ic-line`, `--ic-det`,
 * `--ic-sh` (интерфейс, тон по фону контейнера); с тоном — вшитыми цветами (текстуры Phaser, файлы).
 *
 * Мини-разметка внутри `b` и `d`:
 * - `c="red"` — цвет заливки (силуэт) или линии (детали) из `ACCENT`; `L` — цвет линий деталей, `F` — цвет заливки;
 * - `w="5"` в силуэте — элемент-линия этой толщины (дуги, ручки, стебли);
 * - `fc="L"` в деталях — залить (точки глаз, замочная скважина).
 */

export type IconTone = "light" | "dark"

/** Акцентные цвета частей иконок — одинаковые в обоих тонах. */
export const ACCENT = {
  red: "#dc3341",
  gold: "#ffd166",
  orange: "#ff9f43",
  green: "#6cc04a",
  teal: "#4cc9a8",
  blue: "#4f8fd1",
  sky: "#bfe3ff",
  purple: "#9b6dff",
  pink: "#ff8fb1",
  brown: "#a0663a",
  tan: "#e0b07a",
  grey: "#b8b8c6",
  cream: "#fff4dc"
} as const

type AccentName = keyof typeof ACCENT

/** Цвета тонов: заливка, контур, линии деталей, тень. */
export const TONES: Record<IconTone, { fill: string, line: string, det: string, sh: string }> = {
  light: { fill: "#ffffff", line: "#0d0b10", det: "#0d0b10", sh: "#dc3341" },
  dark: { fill: "#1d1924", line: "#0d0b10", det: "#ffffff", sh: "#dc3341" }
}

interface IconDef {
  /** Силуэт: из него же строятся тень и контур. */
  b: string
  /** Линии и точки поверх заливки. */
  d?: string
}

/* ---------- Генераторы фигур ---------- */

const f1 = (n: number): string => (Math.round(n * 10) / 10).toString()

/** Звезда с `n` лучами: внешний радиус `r1`, внутренний `r2`. */
function star(cx: number, cy: number, n: number, r1: number, r2: number, rot = -90): string {
  const pts: string[] = []
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? r1 : r2
    const a = ((rot + (i * 180) / n) * Math.PI) / 180
    pts.push(`${f1(cx + r * Math.cos(a))},${f1(cy + r * Math.sin(a))}`)
  }
  return pts.join(" ")
}

/** Шестерёнка: `n` зубцов, радиусы впадин `r1` и зубцов `r2`. */
function gearPath(cx: number, cy: number, n: number, r1: number, r2: number): string {
  const pts: string[] = []
  const step = (Math.PI * 2) / n
  for (let i = 0; i < n; i++) {
    const a = i * step
    const t = step * 0.22
    for (const [ang, r] of [[a - step / 2 + t, r1], [a - t * 1.1, r2], [a + t * 1.1, r2], [a + step / 2 - t, r1]] as const)
      pts.push(`${f1(cx + r * Math.cos(ang))},${f1(cy + r * Math.sin(ang))}`)
  }
  return `M${pts.join(" L")} Z`
}

/** Снежинка: шесть лучей с веточками — линиями толщины `w`. */
function snowflake(cx: number, cy: number, r: number, w: number): string {
  let out = ""
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 - Math.PI / 2
    const x = cx + r * Math.cos(a)
    const y = cy + r * Math.sin(a)
    out += `<path w="${w}" d="M${cx} ${cy} L${f1(x)} ${f1(y)}"/>`
    const bx = cx + r * 0.58 * Math.cos(a)
    const by = cy + r * 0.58 * Math.sin(a)
    for (const s of [-1, 1]) {
      const b = a + s * 0.7
      out += `<path w="${w}" d="M${f1(bx)} ${f1(by)} L${f1(bx + r * 0.32 * Math.cos(b))} ${f1(by + r * 0.32 * Math.sin(b))}"/>`
    }
  }
  return out
}

const BONE = `<g transform="rotate(-35 32 32)"><rect x="17" y="27.5" width="30" height="9" rx="1.5"/><circle cx="16.5" cy="26.5" r="6.5"/><circle cx="16.5" cy="37.5" r="6.5"/><circle cx="47.5" cy="26.5" r="6.5"/><circle cx="47.5" cy="37.5" r="6.5"/></g>`
const BLADE = `<path d="M32 5 L36.5 11 V40 H27.5 V11 Z"/><rect x="21" y="39" width="22" height="5.5" rx="1.5" c="gold"/><rect x="29.3" y="44" width="5.4" height="9" c="brown"/><circle cx="32" cy="56" r="3.6" c="gold"/>`
const MUG = `<path d="M43 25 H49 C53 25 53 43 49 43 H43" w="5"/><rect x="15" y="19" width="29" height="35" rx="3" c="gold"/><path d="M12.5 22 C12 14 20 11 24.5 13.5 C28.5 9 36.5 9 38.5 13.5 C44.5 11 48.5 15.5 46.5 22 Z"/>`
const HOUSE = `<path d="M8 31 L32 9 L56 31 Z" c="red"/><rect x="15" y="29" width="34" height="25"/>`
const DROP = `<path d="M32 6 C38 18 48 27 48 38 C48 48 41 56 32 56 C23 56 16 48 16 38 C16 27 26 18 32 6 Z"/>`
const CUBE = (top: AccentName, left: AccentName, right: AccentName): string =>
  `<path d="M10 22 L32 12 L54 22 L32 32 Z" c="${top}"/><path d="M10 22 L32 32 V56 L10 46 Z" c="${left}"/><path d="M32 32 L54 22 V46 L32 56 Z" c="${right}"/>`
const TRAY = `<path d="M8 36 H20 L24 44 H40 L44 36 H56 V55 H8 Z"/>`
const PHONE = (x: number, w: number): string => `<rect x="${x}" y="7" width="${w}" height="50" rx="5"/>`
const CAT_HEAD = `<path d="M12 22 L14 8 L26 16 H38 L50 8 L52 22 C56 30 54 44 46 50 C40 55 24 55 18 50 C10 44 8 30 12 22 Z" c="gold"/>`

const ICONS: Record<string, IconDef> = {
  /* ----- валюта, бой, награды ----- */
  bone: { b: BONE },
  swords: {
    b: `<g transform="rotate(42 32 32)">${BLADE}</g><g transform="rotate(-42 32 32)">${BLADE}</g>`,
    d: `<path d="M32 13 V36" transform="rotate(42 32 32)"/><path d="M32 13 V36" transform="rotate(-42 32 32)"/>`
  },
  dagger: {
    b: `<g transform="rotate(40 32 32) translate(0 1)">${BLADE}</g>`,
    d: `<path d="M32 13 V36" transform="rotate(40 32 32) translate(0 1)"/>`
  },
  knife: {
    b: `<g transform="rotate(-45 32 32)"><path d="M28 6 C38 10 39 26 37 38 H28 Z"/><rect x="27" y="37.5" width="11" height="4" c="grey"/><rect x="28.5" y="41" width="8" height="16" rx="3" c="brown"/></g>`,
    d: `<g transform="rotate(-45 32 32)"><circle cx="32.5" cy="46" r="1.4" fc="L"/><circle cx="32.5" cy="52" r="1.4" fc="L"/></g>`
  },
  sparkles: {
    b: `<path d="M27 6 C29 20 33 24 47 26 C33 28 29 32 27 46 C25 32 21 28 7 26 C21 24 25 20 27 6 Z" c="gold"/><path d="M47 36 C48 43 50 45 57 46 C50 47 48 49 47 56 C46 49 44 47 37 46 C44 45 46 43 47 36 Z" c="gold"/>`
  },
  glowstar: {
    b: `<polygon points="${star(32, 34, 5, 22, 10)}" c="gold"/>`,
    d: `<path d="M8 10 L13 15 M56 10 L51 15 M32 2 V6"/>`
  },
  boom: {
    b: `<polygon points="${star(32, 32, 10, 27, 14, -80)}" c="orange"/><polygon points="${star(32, 32, 8, 15, 8, -70)}" c="gold"/>`
  },
  anger: {
    b: `<path w="6" c="red" d="M12 25 C21 25 25 21 25 12"/><path w="6" c="red" d="M39 12 C39 21 43 25 52 25"/><path w="6" c="red" d="M52 39 C43 39 39 43 39 52"/><path w="6" c="red" d="M25 52 C25 43 21 39 12 39"/>`
  },
  trophy: {
    b: `<path w="5" c="gold" d="M19 15 H11 C10 26 15 31 21 31"/><path w="5" c="gold" d="M45 15 H53 C54 26 49 31 43 31"/><path d="M17 9 H47 V22 C47 34 41 40 32 40 C23 40 17 34 17 22 Z" c="gold"/><rect x="28.5" y="39" width="7" height="8" c="gold"/><rect x="19" y="46" width="26" height="9" rx="1.5" c="brown"/>`,
    d: `<polygon points="${star(32, 22, 5, 7, 3)}" fc="L"/>`
  },
  crown: {
    b: `<path d="M9 46 L11 18 L22 31 L32 12 L42 31 L53 18 L55 46 Z" c="gold"/><rect x="9" y="44" width="46" height="9" rx="1.5" c="gold"/>`,
    d: `<circle cx="32" cy="48.5" r="2.6" fc="red"/><circle cx="20" cy="48.5" r="2.2" fc="L"/><circle cx="44" cy="48.5" r="2.2" fc="L"/>`
  },
  gift: {
    b: `<rect x="12" y="29" width="40" height="26" rx="1.5" c="red"/><rect x="9" y="20" width="46" height="11" rx="1.5" c="red"/><path d="M32 20 C24 8 13 12 18 19 Z" c="gold"/><path d="M32 20 C40 8 51 12 46 19 Z" c="gold"/><rect x="28.5" y="20" width="7" height="35" c="gold"/>`
  },
  target: {
    b: `<circle cx="30" cy="34" r="21"/><circle cx="30" cy="34" r="14.5" c="red"/><circle cx="30" cy="34" r="8.5"/><circle cx="30" cy="34" r="3.5" c="red"/><path w="3.5" d="M31 33 L52 12"/><path d="M50 7 L57 7 L57 14 L52 12 Z" c="gold"/>`
  },
  skull: {
    b: `<circle cx="32" cy="27" r="19"/><rect x="21" y="36" width="22" height="16" rx="4"/>`,
    d: `<circle cx="24.5" cy="28" r="5" fc="L"/><circle cx="39.5" cy="28" r="5" fc="L"/><path d="M32 34 L29.5 39 H34.5 Z" fc="L"/><path d="M27 46 V52 M32 46 V52 M37 46 V52"/>`
  },
  skullbones: {
    b: `<path w="6" d="M12 52 L52 16"/><path w="6" d="M12 16 L52 52"/><circle cx="11" cy="51" r="4.5"/><circle cx="53" cy="51" r="4.5"/><circle cx="11" cy="17" r="4.5"/><circle cx="53" cy="17" r="4.5"/><circle cx="32" cy="27" r="14"/><rect x="24" y="33" width="16" height="12" rx="3"/>`,
    d: `<circle cx="26.5" cy="27.5" r="3.6" fc="L"/><circle cx="37.5" cy="27.5" r="3.6" fc="L"/><path d="M29 39.5 V44 M32 39.5 V44 M35 39.5 V44"/>`
  },
  ghost: {
    b: `<path d="M13 55 V28 C13 15 21 7 32 7 C43 7 51 15 51 28 V55 L44.5 49 L38 55 L32 49 L26 55 L19.5 49 Z"/>`,
    d: `<ellipse cx="25" cy="27" rx="3.5" ry="5" fc="L"/><ellipse cx="39" cy="27" rx="3.5" ry="5" fc="L"/><ellipse cx="32" cy="39" rx="4" ry="3" fc="L"/>`
  },
  flagwhite: {
    b: `<rect x="12" y="7" width="5.5" height="50" rx="1.5" c="brown"/><path d="M17 10 C26 5 33 15 42 11 C46 9.5 49 9 53 9.5 V32 C47 33 43 36 37 34 C28 31 24 37 17 36 Z"/>`
  },
  stopwatch: {
    b: `<rect x="27" y="5" width="10" height="6" rx="1.5"/><path w="4" d="M47 15 L51 11"/><circle cx="32" cy="36" r="20"/>`,
    d: `<path d="M32 36 V24 M32 36 L40 40"/><circle cx="32" cy="36" r="2.4" fc="L"/>`
  },
  hourglass: {
    b: `<path d="M18 13 H46 C46 24 36 28 36 32 C36 36 46 40 46 51 H18 C18 40 28 36 28 32 C28 28 18 24 18 13 Z"/><path d="M23 17 H41 C40 23 34 26 32 29.5 C30 26 24 23 23 17 Z" c="gold"/><path d="M23.5 50 C25 44 29.5 42 32 42 C34.5 42 39 44 40.5 50 Z" c="gold"/><rect x="13" y="7" width="38" height="7" rx="1.5" c="brown"/><rect x="13" y="50" width="38" height="7" rx="1.5" c="brown"/>`
  },
  lightning: { b: `<polygon points="37,3 13,37 29.5,37 25,61 51,25 34,25" c="gold"/>` },
  fire: {
    b: `<path d="M32 5 C37 16 49 22 49 38 C49 48 41 57 32 57 C23 57 15 48 15 38 C15 30 19 25 24 21 C24 29 27 32 30 32 C27 22 29 13 32 5 Z" c="orange"/><path d="M32 30 C37 36 41 40 41 46 C41 52 37 55 32 55 C27 55 23 52 23 46 C23 40 29 37 32 30 Z" c="gold"/>`
  },
  warning: {
    b: `<path d="M32 6 L58 53 H6 Z" c="gold"/>`,
    d: `<path d="M32 22 V38"/><circle cx="32" cy="45.5" r="2.8" fc="L"/>`
  },
  lock: {
    b: `<path w="5.5" d="M21 30 V22 C21 15 26 11 32 11 C38 11 43 15 43 22 V30"/><rect x="14" y="28" width="36" height="27" rx="3" c="gold"/>`,
    d: `<circle cx="32" cy="38.5" r="3.6" fc="L"/><path d="M32 41 V47"/>`
  },
  key: {
    b: `<circle cx="18" cy="32" r="11" c="gold"/><rect x="26" y="28.5" width="29" height="7" rx="1.5" c="gold"/><rect x="44" y="34" width="5" height="9" c="gold"/><rect x="51" y="34" width="4.5" height="6.5" c="gold"/>`,
    d: `<circle cx="16.5" cy="32" r="4" fc="L"/>`
  },
  shield: {
    b: `<path d="M32 7 L52 13 V30 C52 42 44 50 32 57 C20 50 12 42 12 30 V13 Z"/><path d="M32 7 L52 13 V30 C52 42 44 50 32 57 Z" c="red"/>`,
    d: `<path d="M32 9 V55"/>`
  },
  heart: {
    b: `<path d="M32 54 C13 42 8 31 8 22 C8 13 15 8 21.5 8 C26.5 8 30 11 32 15 C34 11 37.5 8 42.5 8 C49 8 56 13 56 22 C56 31 51 42 32 54 Z" c="red"/>`,
    d: `<path c="F" d="M15 21 C15 16.5 18 14 21.5 14"/>`
  },
  bandage: {
    b: `<g transform="rotate(-38 32 32)"><rect x="6" y="23" width="52" height="18" rx="9" c="tan"/><rect x="22" y="23" width="20" height="18" c="cream"/></g>`,
    d: `<g transform="rotate(-38 32 32)"><circle cx="27" cy="28.5" r="1.4" fc="L"/><circle cx="37" cy="28.5" r="1.4" fc="L"/><circle cx="27" cy="35.5" r="1.4" fc="L"/><circle cx="37" cy="35.5" r="1.4" fc="L"/></g>`
  },
  blood: { b: `${DROP.replace("/>", ` c="red"/>`)}`, d: `<path c="F" d="M24 38 C24 33 26 30 28 28"/>` },
  drop: { b: `${DROP.replace("/>", ` c="blue"/>`)}`, d: `<path c="F" d="M24 38 C24 33 26 30 28 28"/>` },
  paw: {
    b: `<ellipse cx="32" cy="42" rx="12" ry="10"/><ellipse cx="17" cy="28" rx="5.5" ry="6.5" transform="rotate(-20 17 28)"/><ellipse cx="26" cy="17" rx="5.5" ry="6.5" transform="rotate(-8 26 17)"/><ellipse cx="38" cy="17" rx="5.5" ry="6.5" transform="rotate(8 38 17)"/><ellipse cx="47" cy="28" rx="5.5" ry="6.5" transform="rotate(20 47 28)"/>`
  },
  footprints: {
    b: `<ellipse cx="20" cy="40" rx="7" ry="11" transform="rotate(-10 20 40)"/><circle cx="15" cy="26" r="2.8"/><circle cx="20" cy="24.5" r="2.8"/><circle cx="25" cy="26" r="2.8"/><ellipse cx="44" cy="26" rx="7" ry="11" transform="rotate(10 44 26)"/><circle cx="39" cy="12" r="2.8"/><circle cx="44" cy="10.5" r="2.8"/><circle cx="49" cy="12" r="2.8"/>`
  },
  tooth: {
    b: `<path d="M15 15 C15 8 26 7 32 11 C38 7 49 8 49 15 C49 25 45 30 45 40 C45 50 41 57 38.5 57 C34.5 57 35 43 32 43 C29 43 29.5 57 25.5 57 C23 57 19 50 19 40 C19 30 15 25 15 15 Z"/>`,
    d: `<path d="M24 15 C27 15 29 17 32 19"/>`
  },
  ring: {
    b: `<circle w="5.5" cx="32" cy="40" r="14" c="gold"/><path d="M32 6 L43 15 L32 29 L21 15 Z" c="teal"/>`,
    d: `<path d="M21 15 H43 M32 6 L28 15 L32 29 L36 15 Z"/>`
  },
  bell: {
    b: `<circle cx="32" cy="8" r="4" c="gold"/><path d="M32 9 C42 9 46 17 46 27 V38 L53 47 H11 L18 38 V27 C18 17 22 9 32 9 Z" c="gold"/><circle cx="32" cy="51" r="5.5" c="gold"/>`,
    d: `<path c="F" d="M24 24 C24 19 26 16 29 15"/>`
  },
  chain: {
    b: `<ellipse w="5" cx="18" cy="18" rx="10" ry="6.5" transform="rotate(45 18 18)" c="grey"/><ellipse w="5" cx="32" cy="32" rx="10" ry="6.5" transform="rotate(-45 32 32)" c="grey"/><ellipse w="5" cx="46" cy="46" rx="10" ry="6.5" transform="rotate(45 46 46)" c="grey"/>`
  },
  ribbon: {
    b: `<path d="M32 32 L22 54 L27 52 L30 57 L33 36 Z" c="pink"/><path d="M32 32 L42 54 L37 52 L34 57 L31 36 Z" c="pink"/><path d="M32 30 L11 17 C6 25 6 35 11 43 Z" c="pink"/><path d="M32 30 L53 17 C58 25 58 35 53 43 Z" c="pink"/><circle cx="32" cy="30" r="7" c="pink"/>`
  },
  book: {
    b: `<path d="M32 15 C24 11 15 11 7 13 V49 C15 47 24 47 32 51 C40 47 49 47 57 49 V13 C49 11 40 11 32 15 Z" c="red"/><path d="M32 17 C25 13 17 13 11 14.5 V45 C18 44 25 44 32 47.5 Z"/><path d="M32 17 C39 13 47 13 53 14.5 V45 C46 44 39 44 32 47.5 Z"/>`,
    d: `<path d="M32 17 V47 M16 22 C20 21 24 21 27 23 M16 29 C20 28 24 28 27 30 M37 23 C40 21 44 21 48 22 M37 30 C40 28 44 28 48 29"/>`
  },
  coin: {
    b: `<circle cx="32" cy="32" r="22" c="gold"/>`,
    d: `<circle cx="32" cy="32" r="15"/><polygon points="${star(32, 32, 5, 8, 3.5)}" fc="L"/>`
  },
  /* ----- классы, перемещение, бой ----- */
  wing: {
    b: `<path d="M10 42 C12 24 27 9 54 9 C52 15 48 17 44 19 C50 19 52 21 52 23 C46 28 41 28 37 28 C43 30 45 32 45 34 C37 38 31 38 27 38 C31 40 31 42 29 44 C22 49 15 49 10 42 Z"/>`,
    d: `<path d="M18 40 C26 30 36 22 46 18 M22 42 C30 36 36 32 42 30"/>`
  },
  horse: {
    b: `<path d="M48 57 L50 31 C50 20 44 13 37 12 L34 6 L31 12 L27 7 L25 14 C20 18 14 26 11 31 C10 34 12 37 15 37 L23 35 C26 35 28 38 28 42 L27 57 Z"/><path d="M37 12 C46 13 52 21 52 33 L50 31 C50 20 44 13 37 12 Z" c="brown"/>`,
    d: `<circle cx="27" cy="22" r="2.3" fc="L"/><circle cx="15" cy="32" r="1.4" fc="L"/>`
  },
  bow: {
    b: `<path w="5" c="brown" d="M20 7 C42 17 42 47 20 57"/><path w="3" d="M8 32 H50"/><path d="M50 26 L59 32 L50 38 Z" c="grey"/><path d="M6 27 L14 32 L6 37 L10 32 Z" c="red"/>`,
    d: `<path d="M20 7 V57"/>`
  },
  dancer: {
    b: `<circle cx="34" cy="11" r="6"/><path d="M33 19 L45 47 C38 51 26 53 16 49 Z" c="red"/><path w="4" d="M33 21 L48 13"/><path w="4" d="M32 22 L18 30"/><path w="4" d="M28 48 L24 58"/><path w="4" d="M36 48 L42 57"/>`
  },
  crystal: {
    b: `<path d="M18 47 H46 L51 56 H13 Z" c="brown"/><circle cx="32" cy="28" r="19" c="purple"/>`,
    d: `<path c="F" d="M22 25 C22 19 26 15 31 14"/><circle c="F" cx="38" cy="33" r="2" fc="F"/>`
  },
  gradcap: {
    b: `<path d="M18 30 V42 C18 49 46 49 46 42 V30 L32 37 Z"/><path d="M32 12 L59 24 L32 36 L5 24 Z"/><path w="3" c="gold" d="M50 27 V42"/><circle cx="50" cy="44" r="3.5" c="gold"/>`,
    d: `<circle cx="32" cy="24" r="2.2" fc="L"/>`
  },
  handshake: {
    b: `<rect x="3" y="27" width="14" height="17" rx="2" c="blue"/><rect x="47" y="27" width="14" height="17" rx="2" c="red"/><path d="M15 29 C23 20 41 20 49 29 V43 C41 50 23 50 15 43 Z" c="tan"/>`,
    d: `<path d="M24 32 L33 41 M29 29 L38 38 M35 28 L42 35"/>`
  },
  up: { b: `<path d="M32 6 L54 30 H41 V56 H23 V30 H10 Z" c="green"/>` },
  next: { b: `<path d="M8 14 L28 32 L8 50 Z"/><path d="M27 14 L47 32 L27 50 Z"/><rect x="47" y="14" width="7" height="36" rx="1.5"/>` },
  gear: { b: `<path d="${gearPath(32, 32, 9, 17, 24)}" c="grey"/>`, d: `<circle cx="32" cy="32" r="7" fc="L"/>` },
  weights: {
    b: `<rect x="8" y="28.5" width="48" height="7" rx="1.5" c="grey"/><rect x="11" y="17" width="9" height="30" rx="2" c="red"/><rect x="44" y="17" width="9" height="30" rx="2" c="red"/><rect x="5" y="22" width="7" height="20" rx="2" c="red"/><rect x="52" y="22" width="7" height="20" rx="2" c="red"/>`
  },
  die: {
    b: CUBE("cream", "cream", "cream").replace(/ c="cream"/g, ""),
    d: `<ellipse cx="32" cy="22" rx="3" ry="2" fc="L"/><circle cx="17" cy="32" r="2.2" fc="L"/><circle cx="25" cy="44" r="2.2" fc="L"/><circle cx="39" cy="36" r="2.2" fc="L"/><circle cx="47" cy="30" r="2.2" fc="L"/><circle cx="43" cy="42" r="2.2" fc="L"/>`
  },
  /* ----- природа и местность ----- */
  herb: {
    b: `<path w="4" c="green" d="M18 56 C26 42 36 28 48 10"/><ellipse cx="22" cy="40" rx="10" ry="5" transform="rotate(-25 22 40)" c="green"/><ellipse cx="40" cy="38" rx="10" ry="5" transform="rotate(-60 40 38)" c="green"/><ellipse cx="30" cy="25" rx="10" ry="5" transform="rotate(-20 30 25)" c="green"/><ellipse cx="47" cy="20" rx="9" ry="4.5" transform="rotate(-65 47 20)" c="green"/>`
  },
  leaf: {
    b: `<path d="M10 54 C10 30 27 11 55 9 C53 36 36 54 10 54 Z" c="green"/>`,
    d: `<path d="M12 52 C24 40 35 29 47 17 M24 40 H34 M30 34 L31 24"/>`
  },
  sprout: {
    b: `<path w="4" c="green" d="M32 56 V30"/><path d="M32 34 C30 22 20 16 9 18 C10 30 20 36 32 34 Z" c="green"/><path d="M32 30 C34 18 44 12 55 14 C54 26 44 32 32 30 Z" c="green"/><path d="M18 56 C20 50 26 48 32 48 C38 48 44 50 46 56 Z" c="brown"/>`
  },
  tree: {
    b: `<rect x="28" y="48" width="8" height="10" c="brown"/><path d="M32 5 L46 24 H40 L50 37 H43 L53 51 H11 L21 37 H14 L24 24 H18 Z" c="green"/>`
  },
  palm: {
    b: `<path w="6" c="brown" d="M30 58 C32 46 32 32 28 22"/><path d="M28 22 C20 12 10 12 4 18 C12 18 20 20 28 22 Z" c="green"/><path d="M28 22 C30 10 40 6 48 8 C42 12 34 16 28 22 Z" c="green"/><path d="M28 22 C40 18 52 22 58 30 C48 28 38 26 28 22 Z" c="green"/><path d="M28 22 C20 24 12 32 10 40 C16 34 22 28 28 22 Z" c="green"/><circle cx="30" cy="25" r="3.5" c="brown"/>`
  },
  mountain: {
    b: `<path d="M3 55 L24 17 L34 33 L42 23 L61 55 Z" c="grey"/><path d="M24 17 L31 30 L27 28 L23 32 L18 28 Z"/><path d="M42 23 L48 33 L44 31 L40 34 L37 30 Z"/>`
  },
  log: {
    b: `<rect x="14" y="20" width="38" height="24" rx="4" c="brown"/><ellipse cx="14" cy="32" rx="8" ry="12" c="tan"/>`,
    d: `<ellipse cx="14" cy="32" rx="4" ry="6.5"/><path d="M26 26 H44 M30 38 H48"/>`
  },
  bridge: {
    b: `<rect x="5" y="22" width="54" height="8" rx="1.5" c="brown"/><path d="M8 30 H56 V36 C48 36 42 40 40 50 H24 C22 40 16 36 8 36 Z" c="grey"/><path w="3.5" c="blue" d="M4 56 C10 52 14 52 20 56 M44 56 C50 52 54 52 60 56"/>`,
    d: `<path d="M14 22 V14 M32 22 V12 M50 22 V14 M14 14 L32 12 L50 14"/>`
  },
  snowflake: { b: snowflake(32, 32, 24, 5) },
  icecube: {
    b: CUBE("sky", "sky", "blue"),
    d: `<path c="F" d="M16 34 V42 M20 28 L28 24"/>`
  },
  desert: {
    b: `<circle cx="46" cy="18" r="9" c="orange"/><path d="M4 56 C12 40 22 38 32 44 C40 34 52 36 60 48 V56 Z" c="gold"/><path w="4" c="green" d="M20 44 V28 M20 36 C14 36 14 30 14 30 M20 33 C26 33 26 27 26 27"/>`
  },
  park: {
    b: `<rect x="5" y="9" width="54" height="46" rx="4"/><path d="M5 40 L22 20 L34 34 L42 26 L59 44 V51 C59 53 57 55 55 55 H9 C7 55 5 53 5 51 Z" c="green"/><path d="M24 55 C28 48 34 46 40 44 C44 46 44 50 38 55 Z" c="blue"/><circle cx="46" cy="17" r="4.5" c="gold"/>`
  },
  cloud: {
    b: `<path d="M16 46 C7 46 5 35 12 31 C10 21 22 15 28 21 C32 11 48 11 50 23 C58 23 61 35 55 41 C53 45 50 46 48 46 Z"/>`,
    d: `<path d="M18 40 C14 40 13 36 15 34"/>`
  },
  city: {
    b: `<rect x="6" y="28" width="14" height="28" c="grey"/><rect x="19" y="12" width="14" height="44" c="blue"/><rect x="32" y="22" width="12" height="34" c="grey"/><rect x="43" y="32" width="15" height="24" c="blue"/>`,
    d: `<path d="M24 18 H28 M24 26 H28 M24 34 H28 M24 42 H28 M10 34 H16 M10 42 H16 M36 28 H40 M36 36 H40 M47 38 H54 M47 46 H54"/>`
  },
  factory: {
    b: `<rect x="45" y="8" width="9" height="48" c="grey"/><path d="M6 56 V32 L19 24 V32 L32 24 V32 L45 24 V56 Z" c="grey"/><circle cx="49" cy="5" r="3.5"/>`,
    d: `<path d="M12 40 H18 M24 40 H30 M36 40 H42 M12 48 H18 M24 48 H30 M36 48 H42"/>`
  },
  biohazard: {
    b: `<circle cx="32" cy="22" r="11" c="gold"/><circle cx="21" cy="40" r="11" c="gold"/><circle cx="43" cy="40" r="11" c="gold"/>`,
    d: `<circle cx="32" cy="34" r="5" fc="L"/><circle cx="32" cy="34" r="11"/><path d="M32 13 V20 M23 43 L28 38 M41 43 L36 38"/>`
  },
  /* ----- постройки и предметы быта ----- */
  house: { b: HOUSE, d: `<rect x="27" y="39" width="10" height="15" fc="L"/><rect x="19" y="34" width="6" height="6"/><rect x="39" y="34" width="6" height="6"/>` },
  homegarden: {
    b: `${HOUSE}<ellipse cx="11" cy="48" rx="8" ry="7" c="green"/><ellipse cx="53" cy="48" rx="8" ry="7" c="green"/>`,
    d: `<rect x="27" y="39" width="10" height="15" fc="L"/><rect x="19" y="34" width="6" height="6"/>`
  },
  castle: {
    b: `<rect x="12" y="28" width="40" height="28" c="grey"/><rect x="6" y="16" width="14" height="40" c="grey"/><rect x="44" y="16" width="14" height="40" c="grey"/><rect x="6" y="11" width="4" height="6" c="grey"/><rect x="11" y="11" width="4" height="6" c="grey"/><rect x="16" y="11" width="4" height="6" c="grey"/><rect x="44" y="11" width="4" height="6" c="grey"/><rect x="49" y="11" width="4" height="6" c="grey"/><rect x="54" y="11" width="4" height="6" c="grey"/><path w="2.5" d="M32 28 V8"/><path d="M33 8 L44 12 L33 16 Z" c="red"/>`,
    d: `<path d="M26 56 V46 C26 40 38 40 38 46 V56" fc="L"/><path d="M13 26 V32 M51 26 V32"/>`
  },
  barrier: {
    b: `<rect x="14" y="30" width="6" height="26" c="grey"/><rect x="44" y="30" width="6" height="26" c="grey"/><rect x="6" y="16" width="52" height="16" rx="2" c="gold"/>`,
    d: `<path d="M14 16 L8 32 M28 16 L22 32 M42 16 L36 32 M56 16 L50 32" style="stroke-width:5"/>`
  },
  hammer: {
    b: `<g transform="rotate(-40 32 32)"><rect x="28.5" y="22" width="7" height="36" rx="2" c="brown"/><rect x="15" y="9" width="34" height="14" rx="2.5" c="grey"/></g>`
  },
  cart: {
    b: `<path w="4.5" d="M5 13 H14 L20 41 H47"/><path d="M16 19 H55 L49 39 H21 Z"/><circle cx="24" cy="50" r="5"/><circle cx="44" cy="50" r="5"/>`,
    d: `<path d="M29 19 L31 39 M41 19 L39 39 M18 29 H52"/>`
  },
  box: {
    b: CUBE("cream", "tan", "brown"),
    d: `<path d="M21 17 L43 27 V36"/>`
  },
  barrel: {
    b: `<path d="M17 8 H47 C52 20 52 44 47 56 H17 C12 44 12 20 17 8 Z" c="brown"/>`,
    d: `<path d="M14 20 H50 M14 44 H50 M27 8 C25 24 25 40 27 56 M37 8 C39 24 39 40 37 56" style="stroke-width:3.5"/>`
  },
  couch: {
    b: `<rect x="14" y="17" width="36" height="20" rx="5" c="red"/><rect x="8" y="31" width="48" height="16" rx="4" c="red"/><rect x="5" y="26" width="10" height="22" rx="4" c="red"/><rect x="49" y="26" width="10" height="22" rx="4" c="red"/><rect x="11" y="47" width="5" height="7" c="brown"/><rect x="48" y="47" width="5" height="7" c="brown"/>`,
    d: `<path d="M32 33 V45"/>`
  },
  candle: {
    b: `<path d="M32 6 C37 12 38 17 32 22 C26 17 27 12 32 6 Z" c="gold"/><rect x="23" y="25" width="18" height="31" rx="2" c="cream"/>`,
    d: `<path d="M32 22 V25 M28 25 V33"/>`
  },
  trash: {
    b: `<path d="M16 18 H48 L44 57 H20 Z" c="grey"/><rect x="11" y="11" width="42" height="7" rx="1.5" c="grey"/><rect x="26" y="6" width="12" height="6" rx="1.5" c="grey"/>`,
    d: `<path d="M26 25 L27 50 M32 25 V50 M38 25 L37 50"/>`
  },
  map: {
    b: `<path d="M6 14 L21 9 L43 15 L58 10 V50 L43 55 L21 49 L6 54 Z" c="cream"/>`,
    d: `<path d="M21 9 V49 M43 15 V55"/><path c="red" d="M12 42 C18 34 24 40 30 32 C34 26 40 30 46 24" style="stroke-dasharray:3 4"/><path c="red" d="M47 20 L53 26 M53 20 L47 26"/>`
  },
  magnifier: {
    b: `<g transform="rotate(-45 32 32)"><rect x="28.5" y="38" width="7" height="22" rx="2.5" c="brown"/></g><circle cx="27" cy="27" r="17"/><circle cx="27" cy="27" r="11" c="sky"/>`,
    d: `<path c="F" d="M20 25 C20 21 23 18 27 18"/>`
  },
  globe: {
    b: `<circle cx="32" cy="32" r="23" c="blue"/>`,
    d: `<ellipse cx="32" cy="32" rx="10" ry="23"/><path d="M32 9 V55 M10 25 H54 M10 39 H54"/>`
  },
  speaker: {
    b: `<rect x="7" y="24" width="11" height="16" rx="1.5"/><path d="M17 24 L33 11 V53 L17 40 Z"/><path w="4" d="M40 24 C44 28 44 36 40 40"/><path w="4" d="M46 17 C54 25 54 39 46 47"/>`
  },
  floppy: {
    b: `<path d="M9 9 H47 L55 17 V55 H9 Z" c="blue"/><rect x="19" y="9" width="23" height="15" c="grey"/><rect x="16" y="33" width="32" height="20" rx="1.5"/>`,
    d: `<rect x="33" y="12" width="5" height="9" fc="L"/><path d="M21 40 H43 M21 46 H38"/>`
  },
  outbox: {
    b: `${TRAY}<path d="M32 6 L46 20 H38 V36 H26 V20 H18 Z" c="green"/>`
  },
  inbox: {
    b: `${TRAY}<path d="M32 38 L46 24 H38 V8 H26 V24 H18 Z" c="blue"/>`
  },
  clipboard: {
    b: `<rect x="12" y="10" width="40" height="47" rx="3" c="brown"/><rect x="17" y="16" width="30" height="36" rx="1.5"/><rect x="24" y="6" width="16" height="9" rx="2" c="grey"/>`,
    d: `<path d="M22 25 H42 M22 32 H42 M22 39 H42 M22 46 H34"/>`
  },
  cabinet: {
    b: `<rect x="13" y="7" width="38" height="50" rx="2" c="grey"/>`,
    d: `<path d="M13 24 H51 M13 41 H51 M27 15 H37 M27 32 H37 M27 49 H37"/>`
  },
  chart: {
    b: `<rect x="7" y="7" width="50" height="50" rx="3"/><rect x="14" y="34" width="8" height="17" c="red"/><rect x="28" y="22" width="8" height="29" c="gold"/><rect x="42" y="14" width="8" height="37" c="teal"/>`
  },
  arrows: {
    b: `<path w="5.5" d="M13 30 C13 19 22 12 32 12 C38 12 43 15 46 19"/><path d="M50 8 L52 26 L36 22 Z"/><path w="5.5" d="M51 34 C51 45 42 52 32 52 C26 52 21 49 18 45"/><path d="M14 56 L12 38 L28 42 Z"/>`
  },
  speech: {
    b: `<path d="M11 10 H53 C56 10 58 12 58 15 V38 C58 41 56 43 53 43 H28 L15 55 V43 H11 C8 43 6 41 6 38 V15 C6 12 8 10 11 10 Z"/>`,
    d: `<circle cx="20" cy="27" r="3.2" fc="L"/><circle cx="32" cy="27" r="3.2" fc="L"/><circle cx="44" cy="27" r="3.2" fc="L"/>`
  },
  phone: { b: `${PHONE(17, 30)}<rect x="21" y="13" width="22" height="34" rx="1.5" c="sky"/>`, d: `<circle cx="32" cy="51.5" r="2" fc="L"/>` },
  phonein: {
    b: `${PHONE(26, 28)}<rect x="30" y="13" width="20" height="34" rx="1.5" c="sky"/><path d="M3 28 H13 V21 L25 32 L13 43 V36 H3 Z" c="gold"/>`,
    d: `<circle cx="40" cy="51.5" r="2" fc="L"/>`
  },
  /* ----- еда и напитки ----- */
  beer: { b: MUG, d: `<path d="M23 28 V48 M33 28 V48"/>` },
  beers: {
    b: `<g transform="translate(-9 6) rotate(-14 30 36) scale(0.78)">${MUG}</g><g transform="translate(19 2) rotate(14 30 36) scale(0.78)">${MUG}</g>`
  },
  apple: {
    b: `<path w="3.5" c="brown" d="M32 18 C32 12 34 8 37 6"/><path d="M35 13 C40 6 48 6 52 9 C48 15 41 16 35 13 Z" c="green"/><path d="M32 18 C40 12 53 15 53 30 C53 45 43 57 32 53 C21 57 11 45 11 30 C11 15 24 12 32 18 Z" c="green"/>`,
    d: `<path c="F" d="M19 28 C19 23 22 20 26 20"/>`
  },
  cherries: {
    b: `<path w="3.5" c="green" d="M19 38 C23 25 31 15 41 9"/><path w="3.5" c="green" d="M42 40 C40 29 40 19 41 9"/><path d="M41 9 C46 4 54 6 57 10 C52 14 46 14 41 9 Z" c="green"/><circle cx="19" cy="45" r="11" c="red"/><circle cx="43" cy="47" r="11" c="red"/>`,
    d: `<path c="F" d="M13 44 C13 41 15 39 17 38.5"/>`
  },
  pepper: {
    b: `<path d="M45 15 C52 21 52 30 45 38 C37 47 24 55 10 56 C15 50 22 44 28 36 C34 27 37 20 45 15 Z" c="red"/><path w="4" c="green" d="M45 15 C47 10 51 8 55 9"/>`,
    d: `<path c="F" d="M41 22 C40 28 36 34 31 38"/>`
  },
  honey: {
    b: `<path d="M13 27 C13 19 51 19 51 27 V44 C51 52 45 57 32 57 C19 57 13 52 13 44 Z" c="gold"/><rect x="15" y="13" width="34" height="9" rx="2" c="brown"/><path d="M38 22 V33 C38 36 42 36 42 33 V26" c="gold"/>`,
    d: `<path d="M17 36 H47"/>`
  },
  flask: {
    b: `<path d="M25 8 H39 V22 L53 49 C55 53 52 57 47 57 H17 C12 57 9 53 11 49 L25 22 Z"/><path d="M18 38 H46 L52 50 C53 53 51 55 47 55 H17 C13 55 11 53 12 50 Z" c="teal"/>`,
    d: `<path d="M22 8 H42"/><circle cx="28" cy="46" r="2.5"/><circle cx="37" cy="44" r="1.8"/>`
  },
  /* ----- звери ----- */
  cat: {
    b: CAT_HEAD,
    d: `<ellipse cx="23" cy="32" rx="3" ry="4" fc="L"/><ellipse cx="41" cy="32" rx="3" ry="4" fc="L"/><path d="M29.5 40 H34.5 L32 43 Z" fc="L"/><path d="M32 43 C30 47 27 47 26 45 M32 43 C34 47 37 47 38 45 M6 36 L17 38 M7 43 L17 41 M58 36 L47 38 M57 43 L47 41"/>`
  },
  catshock: {
    b: CAT_HEAD,
    d: `<circle cx="23" cy="30" r="5"/><circle cx="41" cy="30" r="5"/><circle cx="23" cy="30" r="1.8" fc="L"/><circle cx="41" cy="30" r="1.8" fc="L"/><ellipse cx="32" cy="44" rx="4" ry="5" fc="L"/><path d="M6 36 L17 38 M58 36 L47 38"/>`
  },
  dog: {
    b: `<path d="M16 22 C16 12 24 8 32 8 C40 8 48 12 48 22 C50 32 48 46 32 54 C16 46 14 32 16 22 Z"/><path d="M17 13 C9 13 5 22 7 32 C9 38 13 38 16 34 C17 26 18 18 17 13 Z" c="brown"/><path d="M47 13 C55 13 59 22 57 32 C55 38 51 38 48 34 C47 26 46 18 47 13 Z" c="brown"/>`,
    d: `<circle cx="25" cy="28" r="3" fc="L"/><circle cx="39" cy="28" r="3" fc="L"/><ellipse cx="32" cy="38" rx="5" ry="3.5" fc="L"/><path d="M32 41 V45 M27 47 C30 49 34 49 37 47"/>`
  },
  mouse: {
    b: `<circle cx="15" cy="18" r="11" c="grey"/><circle cx="49" cy="18" r="11" c="grey"/><path d="M14 34 C14 22 22 16 32 16 C42 16 50 22 50 34 C50 46 42 54 32 56 C22 54 14 46 14 34 Z" c="grey"/>`,
    d: `<circle cx="15" cy="18" r="5" fc="pink"/><circle cx="49" cy="18" r="5" fc="pink"/><circle cx="25" cy="33" r="3" fc="L"/><circle cx="39" cy="33" r="3" fc="L"/><circle cx="32" cy="43" r="3.2" fc="pink"/><path d="M8 40 L22 42 M56 40 L42 42"/>`
  },
  /* ----- прочее ----- */
  headstone: {
    b: `<path d="M18 52 V24 C18 15 24 9 32 9 C40 9 46 15 46 24 V52 Z" c="grey"/><rect x="11" y="50" width="42" height="7" rx="1.5" c="brown"/>`,
    d: `<path d="M32 19 V37 M25 26 H39"/>`
  },
  bricks: {
    b: `<rect x="8" y="14" width="48" height="36" rx="1.5" c="red"/>`,
    d: `<path d="M8 26 H56 M8 38 H56 M24 14 V26 M40 14 V26 M16 26 V38 M32 26 V38 M48 26 V38 M24 38 V50 M40 38 V50"/>`
  },
  sneaker: {
    b: `<path d="M7 45 V29 L19 27 L28 36 C36 36 46 36 52 40 C57 43 57 51 52 51 H10 C7 51 7 49 7 45 Z" c="blue"/>`,
    d: `<path d="M7 45 H56 M22 32 L18 36 M26 35 L22 39"/>`
  }
}

/** Эмодзи → иконка. Ключ — эмодзи без селектора варианта (U+FE0F). */
export const EMOJI_ICON: Record<string, string> = {
  "🦴": "bone", "⚔": "swords", "🗡": "dagger", "🔪": "knife", "✨": "sparkles", "🌟": "glowstar", "💥": "boom", "💢": "anger",
  "🏆": "trophy", "👑": "crown", "🎁": "gift", "🎯": "target", "💀": "skull", "☠": "skullbones", "👻": "ghost",
  "🏳": "flagwhite", "⏱": "stopwatch", "⏳": "hourglass", "⚡": "lightning", "🔥": "fire", "⚠": "warning", "🔒": "lock",
  "🗝": "key", "🛡": "shield", "❤": "heart", "🩹": "bandage", "🩸": "blood", "💧": "drop", "🐾": "paw", "👣": "footprints",
  "🦷": "tooth", "💍": "ring", "🔔": "bell", "⛓": "chain", "🎀": "ribbon", "📖": "book", "🪙": "coin",
  "🪽": "wing", "🐎": "horse", "🏹": "bow", "💃": "dancer", "🔮": "crystal", "🎓": "gradcap", "🤝": "handshake",
  "⬆": "up", "⏭": "next", "⚙": "gear", "🏋": "weights", "🎲": "die",
  "🌿": "herb", "🍃": "leaf", "🌱": "sprout", "🌲": "tree", "🌴": "palm", "⛰": "mountain", "🪵": "log", "🌉": "bridge",
  "❄": "snowflake", "🧊": "icecube", "🏜": "desert", "🏞": "park", "☁": "cloud", "🏙": "city", "🏭": "factory",
  "☣": "biohazard", "🏠": "house", "🏡": "homegarden", "🏰": "castle", "🚧": "barrier", "🔨": "hammer", "🛒": "cart",
  "📦": "box", "🛢": "barrel", "🛋": "couch", "🕯": "candle", "🗑": "trash", "🗺": "map", "🔎": "magnifier",
  "🌐": "globe", "🔊": "speaker", "💾": "floppy", "📤": "outbox", "📥": "inbox", "📋": "clipboard", "🗄": "cabinet",
  "📊": "chart", "🔄": "arrows", "💬": "speech", "📱": "phone", "📲": "phonein",
  "🍺": "beer", "🍻": "beers", "🍏": "apple", "🍒": "cherries", "🌶": "pepper", "🍯": "honey", "🧪": "flask",
  "🐱": "cat", "🙀": "catshock", "🐶": "dog", "🐭": "mouse",
  "🪦": "headstone", "🧱": "bricks", "👟": "sneaker"
}

export const ICON_IDS = Object.keys(ICONS)

/** Иконка эмодзи (или undefined — такого эмодзи в наборе нет). Селектор варианта U+FE0F не важен. */
export function iconOfEmoji(emoji: string): string | undefined {
  return EMOJI_ICON[emoji.replace(/️/g, "")]
}

/** Эмодзи и символы-пиктограммы в тексте (с селектором варианта и ZWJ-склейками). */
export const EMOJI_RE = /\p{Extended_Pictographic}️?(?:‍\p{Extended_Pictographic}️?)*/gu

/* ---------- Сборка SVG ---------- */

const accent = (name: string): string => (ACCENT as Record<string, string>)[name] ?? name

/** Цвета слоёв: шестнадцатеричные (тон задан) или CSS-переменные с запасным значением (интерфейс). */
function paletteOf(tone?: IconTone): { fill: string, line: string, det: string, sh: string } {
  if (tone) return TONES[tone]
  const l = TONES.light
  return { fill: `var(--ic-fill, ${l.fill})`, line: `var(--ic-line, ${l.line})`, det: `var(--ic-det, ${l.det})`, sh: `var(--ic-sh, ${l.sh})` }
}

/** Силуэт для тени и контура: без цветов, линии `w` — толще на ширину контура. */
function silhouette(b: string, extra: number): string {
  return b
    .replace(/\sc="[^"]*"/g, "")
    .replace(/\sw="([\d.]+)"/g, (_m, w: string) => ` fill="none" stroke-width="${Number(w) + extra}"`)
}

/** Перебор открывающих тегов фигур (группы не трогаем). */
function eachTag(src: string, fn: (name: string, attrs: string) => string): string {
  return src.replace(/<(\w+)([^>]*?)\s*(\/?)>/g, (tag, name: string, attrs: string, close: string) =>
    name === "g" ? tag : `<${name}${fn(name, attrs)}${close ? " /" : ""}>`)
}

/** Заливка силуэта: цветные части — своим цветом, остальное наследует цвет слоя; линии `w` — обводкой. */
function filled(b: string): string {
  return eachTag(b, (_n, attrs) => {
    const c = /\sc="([^"]*)"/.exec(attrs)?.[1]
    const w = /\sw="([\d.]+)"/.exec(attrs)?.[1]
    const a = attrs.replace(/\sc="[^"]*"/, "").replace(/\sw="[^"]*"/, "")
    const color = c ? accent(c) : "currentColor"
    if (w) return `${a} fill="none" stroke="${color}" stroke-width="${w}"`
    return c ? `${a} fill="${color}"` : a
  })
}

/** Детали: `c` — цвет линии, `fc` — заливка; L — цвет линий деталей (currentColor слоя), F — цвет заливки иконки. */
function detailed(d: string, fillColor: string): string {
  const pick = (v: string): string => (v === "L" ? "currentColor" : v === "F" ? fillColor : accent(v))
  return eachTag(d, (_n, attrs) => {
    const c = /\sc="([^"]*)"/.exec(attrs)?.[1]
    const fc = /\sfc="([^"]*)"/.exec(attrs)?.[1]
    let a = attrs.replace(/\sc="[^"]*"/, "").replace(/\sfc="[^"]*"/, "")
    // var() в атрибутах не работает — цвета через style
    const style: string[] = []
    if (c) style.push(`stroke:${pick(c)}`)
    if (fc) style.push(`fill:${pick(fc)}`, ...(c ? [] : ["stroke:none"]))
    if (style.length) {
      const own = /\sstyle="([^"]*)"/.exec(a)?.[1]
      a = a.replace(/\sstyle="[^"]*"/, "")
      a += ` style="${[...style, ...(own ? [own] : [])].join(";")}"`
    }
    return a
  })
}

/**
 * SVG иконки. С тоном — вшитые цвета (Phaser, файлы); без — цвета из CSS-переменных `--ic-fill`, `--ic-line`,
 * `--ic-det`, `--ic-sh` (интерфейс: тон задаёт фон контейнера).
 */
export function iconSvg(id: string, tone?: IconTone): string {
  const def = ICONS[id]
  if (!def) return ""
  const p = paletteOf(tone)
  const sil = silhouette(def.b, 6)
  const layer = (style: string, body: string, extra = ""): string => `<g${extra} style="${style}">${body}</g>`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true">`
    + `<g transform="translate(30 31) skewX(-10) translate(-32 -32)" stroke-linejoin="round" stroke-linecap="round">`
    + layer(`fill:${p.sh};stroke:${p.sh}`, sil, ` transform="translate(3.5 3.5)" stroke-width="6"`)
    + layer(`fill:${p.line};stroke:${p.line}`, sil, ` stroke-width="6"`)
    + layer(`fill:${p.fill};color:${p.fill}`, filled(def.b))
    + (def.d ? layer(`fill:none;stroke:${p.det};color:${p.det}`, detailed(def.d, p.fill), ` stroke-width="3.2"`) : "")
    + `</g></svg>`
  )
}
