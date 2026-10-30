// Процедурный SVG деревни выживших: грязь и пожухлая трава, частокол по периметру, покосившиеся домики, заколоченные
// окна. Свет сверху-слева, как у тайлов боя (`art/tile.ts`). Палитра приглушённая, холодная; тёплые пятна — только
// огонь и окна, за которыми живут. Без id и градиентов — копии не конфликтуют.

import type { BuildingId } from "@game/core/types"

/** Размер клетки в SVG-единицах (как `TILE_SIZE` поля боя). */
export const VT = 64

const svg = (w: number, h: number, body: string): string =>
  `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`

/** Детерминированный «шум» для вариантов без rng. */
function noise(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0
  return () => {
    s = (Math.imul(s ^ (s >>> 13), 1274126177) + 0x6d2b79f5) >>> 0
    return (s % 1000) / 1000
  }
}

const r1 = (n: number): string => String(Math.round(n * 10) / 10)

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16)
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)))
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => f(v).toString(16).padStart(2, "0")).join("")}`
}

/* ---------- Палитра ---------- */

const GRASS = { base: "#3d4a2c", mid: "#4a5733", light: "#66704a", dark: "#2b3420", dry: "#7a7048" }
const MUD = { base: "#5a4a38", dark: "#43372a", light: "#7a6650", wet: "#33302c" }
const WOOD = { dark: "#3e3127", mid: "#5b4a3a", light: "#7a6650", pale: "#94806a", grain: "#2f251d" }
const IRON = { dark: "#2b2d33", mid: "#4f535c", light: "#7d838e", rust: "#7a4a2a" }
/** Тёплый свет окна или огня — единственный тёплый тон поселения. */
const GLOW = { core: "#ffd27a", warm: "#e8a24a", dim: "#8a5a2a" }

/* ---------- Износ зданий ---------- */

/**
 * Насколько разбито здание на уровне 1…5: 1 — едва стоит, каждое улучшение чинит часть поломок, но 0 не бывает —
 * выжившие латают, а не строят заново: на 5-м уровне остаются заплатки, трещины и заколоченное окно.
 */
export function buildingWear(level: number): number {
  const l = Math.max(1, Math.min(5, Math.round(level)))
  return [1, 0.78, 0.58, 0.4, 0.25][l - 1] as number
}

/* ---------- Земля ---------- */

/** Травинки: пучок штрихов трёх тонов. */
function blades(rnd: () => number, n: number, x0: number, y0: number, w: number, h: number, colors: string[]): string {
  let out = ""
  for (let i = 0; i < n; i++) {
    const x = x0 + rnd() * w
    const y = y0 + rnd() * h
    const len = 3 + rnd() * 5
    const bend = (rnd() - 0.5) * 4
    const c = colors[Math.floor(rnd() * colors.length)] ?? colors[0]
    out += `<path d="M${r1(x)} ${r1(y)} q${r1(bend)} ${r1(-len * 0.6)} ${r1(bend * 1.6)} ${r1(-len)}" stroke="${c}" stroke-width="${r1(0.9 + rnd() * 0.7)}" fill="none" stroke-linecap="round" />`
  }
  return out
}

/** Палый лист: вытянутый эллипс с прожилкой. */
function leaf(x: number, y: number, a: number, c: string): string {
  return `<g transform="rotate(${Math.round(a)} ${r1(x)} ${r1(y)})"><ellipse cx="${r1(x)}" cy="${r1(y)}" rx="3.4" ry="1.7" fill="${c}" />`
    + `<path d="M${r1(x - 3)} ${r1(y)} h6" stroke="${shade(c, 0.6)}" stroke-width=".6" /></g>`
}

/** Камушек со светлой гранью и тенью. */
function pebble(x: number, y: number, r: number, c = "#6d6a62"): string {
  return `<ellipse cx="${r1(x + 0.6)}" cy="${r1(y + 0.8)}" rx="${r1(r * 1.25)}" ry="${r1(r * 0.85)}" fill="#000" opacity=".25" />`
    + `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${r1(r * 1.25)}" ry="${r1(r * 0.9)}" fill="${c}" />`
    + `<ellipse cx="${r1(x - r * 0.35)}" cy="${r1(y - r * 0.35)}" rx="${r1(r * 0.55)}" ry="${r1(r * 0.35)}" fill="#a9a499" opacity=".55" />`
}

/**
 * Пожухлая трава: тёмная основа, пятна сырой земли и сухой травы, три слоя травинок, палые листья и камушки.
 * Пятна держатся внутри клетки, чтобы стыки соседних клеток не читались.
 */
export function villageGrassSvg(variant = 0): string {
  const rnd = noise(variant + 3)
  let body = `<rect width="64" height="64" fill="${GRASS.base}" />`
  for (let i = 0; i < 4; i++) {
    const rx = 7 + rnd() * 9
    const ry = 5 + rnd() * 6
    const x = rx + rnd() * (64 - rx * 2)
    const y = ry + rnd() * (64 - ry * 2)
    const c = [GRASS.dark, GRASS.mid, GRASS.dry, MUD.dark][i] as string
    body += `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${r1(rx)}" ry="${r1(ry)}" fill="${c}" opacity="${r1(0.18 + rnd() * 0.16)}" />`
  }
  // Проплешина сырой земли — не на каждой клетке
  if (variant % 4 === 1) {
    const x = 18 + rnd() * 28
    const y = 18 + rnd() * 28
    body += `<path d="M${r1(x - 9)} ${r1(y)} q3 -6 10 -5 q8 1 8 6 q-2 6 -10 5 q-7 0 -8 -6 Z" fill="${MUD.base}" opacity=".75" />`
      + `<path d="M${r1(x - 6)} ${r1(y + 1)} q5 -3 11 -1" stroke="${MUD.dark}" stroke-width="1" fill="none" opacity=".7" />`
  }
  body += blades(rnd, 26, 1, 4, 62, 60, [GRASS.dark, GRASS.mid])
  body += blades(rnd, 18, 1, 4, 62, 60, [GRASS.light, GRASS.mid, GRASS.dry])
  for (let i = 0; i < 1 + (variant % 3); i++)
    body += leaf(6 + rnd() * 52, 6 + rnd() * 52, rnd() * 180, ["#6b5230", "#7a5a2a", "#55462c"][i % 3] as string)
  if (variant % 3 === 2) body += pebble(10 + rnd() * 44, 10 + rnd() * 44, 1.6 + rnd() * 1.4)
  return svg(VT, VT, body)
}

/** Отпечаток лапы: подушечка и четыре пальца. */
function paw(x: number, y: number, a: number, c: string): string {
  return `<g transform="rotate(${Math.round(a)} ${r1(x)} ${r1(y)})" fill="${c}" opacity=".55">`
    + `<ellipse cx="${r1(x)}" cy="${r1(y + 1.4)}" rx="2.2" ry="1.8" />`
    + `<circle cx="${r1(x - 2.4)}" cy="${r1(y - 1.4)}" r=".9" /><circle cx="${r1(x - 0.8)}" cy="${r1(y - 2.4)}" r=".9" />`
    + `<circle cx="${r1(x + 0.9)}" cy="${r1(y - 2.4)}" r=".9" /><circle cx="${r1(x + 2.5)}" cy="${r1(y - 1.4)}" r=".9" /></g>`
}

/**
 * Разбитая тропа: размокшая глина, тёмные сырые пятна, втоптанные камни и щепки, следы лап; на одном варианте —
 * лужа с отражением неба. Заливает клетку целиком, стыки не видны.
 */
export function villagePathSvg(variant = 0): string {
  const rnd = noise(variant + 11)
  let body = `<rect width="64" height="64" fill="${MUD.base}" />`
  for (let i = 0; i < 5; i++) {
    const rx = 5 + rnd() * 9
    const ry = 4 + rnd() * 6
    body += `<ellipse cx="${r1(rx + rnd() * (64 - rx * 2))}" cy="${r1(ry + rnd() * (64 - ry * 2))}" rx="${r1(rx)}" ry="${r1(ry)}" fill="${i % 2 ? MUD.dark : MUD.light}" opacity="${r1(0.22 + rnd() * 0.18)}" />`
  }
  for (let i = 0; i < 18; i++)
    body += `<circle cx="${r1(rnd() * 64)}" cy="${r1(rnd() * 64)}" r="${r1(0.5 + rnd() * 0.9)}" fill="${rnd() > 0.5 ? MUD.dark : MUD.light}" opacity=".6" />`
  if (variant % 4 === 3) {
    const x = 20 + rnd() * 24
    const y = 22 + rnd() * 20
    body += `<path d="M${r1(x - 13)} ${r1(y)} q2 -7 12 -7 q12 0 13 6 q0 7 -12 8 q-12 0 -13 -7 Z" fill="${MUD.wet}" />`
      + `<path d="M${r1(x - 11)} ${r1(y - 1)} q2 -5 11 -5 q10 0 11 5 q-1 5 -11 6 q-10 0 -11 -6 Z" fill="#3a3b3c" />`
      + `<path d="M${r1(x - 6)} ${r1(y - 3)} q5 -2 10 0" stroke="#6e747c" stroke-width="1" fill="none" opacity=".6" />`
  }
  else {
    for (let i = 0; i < 2; i++) body += paw(8 + rnd() * 48, 8 + rnd() * 48, (rnd() - 0.5) * 70, MUD.dark)
  }
  for (let i = 0; i < 4; i++) body += pebble(5 + rnd() * 54, 5 + rnd() * 54, 1.1 + rnd() * 1.8, rnd() > 0.5 ? "#6d6a62" : "#7a7266")
  // Щепка
  const sx = 8 + rnd() * 44
  const sy = 8 + rnd() * 44
  body += `<path d="M${r1(sx)} ${r1(sy)} l${r1(6 + rnd() * 4)} ${r1(-2 + rnd() * 4)}" stroke="${WOOD.light}" stroke-width="1.6" stroke-linecap="round" opacity=".8" />`
  return svg(VT, VT, body)
}

/** Бурьян поверх травы: сухие метёлки, крапива, бледные цветки и пара поганок. */
export function villageWeedsSvg(variant = 0): string {
  const rnd = noise(variant + 31)
  let out = ""
  for (let k = 0; k < 4; k++) {
    const x = 8 + rnd() * 48
    const y = 16 + rnd() * 42
    for (let i = 0; i < 6; i++) {
      const a = (i - 2.5) * 0.28 + (rnd() - 0.5) * 0.2
      const len = 9 + rnd() * 8
      const c = i % 2 ? GRASS.dry : "#8a7f55"
      out += `<path d="M${r1(x)} ${r1(y)} q${r1(Math.sin(a) * len * 0.4)} ${r1(-len * 0.5)} ${r1(Math.sin(a) * len)} ${r1(-len)}" stroke="${c}" stroke-width="1.2" fill="none" stroke-linecap="round" />`
      if (i % 3 === 0) out += `<ellipse cx="${r1(x + Math.sin(a) * len)}" cy="${r1(y - len)}" rx="1.2" ry="2.6" fill="#a0905e" />`
    }
  }
  for (let i = 0; i < 3; i++) {
    const x = 8 + rnd() * 48
    const y = 10 + rnd() * 44
    out += `<path d="M${r1(x)} ${r1(y + 5)} q-1 -3 0 -5" stroke="${GRASS.mid}" stroke-width="1.1" fill="none" />`
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2
      out += `<circle cx="${r1(x + Math.cos(a) * 1.7)}" cy="${r1(y + Math.sin(a) * 1.7)}" r="1.3" fill="#c9c2a8" opacity=".85" />`
    }
    out += `<circle cx="${r1(x)}" cy="${r1(y)}" r=".9" fill="#8a7a3a" />`
  }
  if (variant % 2 === 0) {
    const x = 12 + rnd() * 40
    const y = 40 + rnd() * 16
    for (const dx of [0, 5]) {
      out += `<rect x="${r1(x + dx - 0.8)}" y="${r1(y - 4)}" width="1.6" height="4" fill="#d8d0bc" />`
        + `<path d="M${r1(x + dx - 3.4)} ${r1(y - 4)} q3.4 -4.6 6.8 0 Z" fill="${dx ? "#6e5a4a" : "#7a4a3a"}" />`
        + `<circle cx="${r1(x + dx - 1)}" cy="${r1(y - 5.4)}" r=".6" fill="#e8dcc8" />`
    }
  }
  return svg(VT, VT, out)
}

/* ---------- Растительность ---------- */

/** Высота спрайта дерева в клетках: крона выше своей клетки, основание — у нижнего края клетки. */
export const TREE_H = 1.75

/** Вариантов дерева: три живых (тёмная хвоя и листва) и сухое. */
export const TREE_VARIANTS = 4

/**
 * Дерево: ствол с корнями и тенью, рваная крона из десятка комков с тенью снизу и бликом сверху-слева.
 * Последний вариант — сухое кривое дерево без листьев.
 */
export function villageTreeSvg(variant = 0): string {
  const rnd = noise(variant + 51)
  const h = VT * TREE_H
  const trunk = `<ellipse cx="34" cy="${h - 9}" rx="24" ry="7" fill="#000" opacity=".3" />`
    + `<path d="M27 ${h - 34} L28 ${h - 11} Q32 ${h - 7} 36 ${h - 11} L37 ${h - 34} Z" fill="${WOOD.mid}" />`
    + `<path d="M29 ${h - 34} L30 ${h - 12}" stroke="${WOOD.light}" stroke-width="1.6" />`
    + `<path d="M33 ${h - 30} l1 6 M31 ${h - 20} l2 4" stroke="${WOOD.grain}" stroke-width="1" />`
    + `<path d="M28 ${h - 12} q-5 2 -9 1 M36 ${h - 12} q5 2 9 1 M32 ${h - 10} q0 3 -2 4" stroke="${WOOD.dark}" stroke-width="2.4" fill="none" stroke-linecap="round" />`
  if (variant % TREE_VARIANTS === 3) {
    // сухое дерево: кривые ветви, обломанный сук
    const b = (d: string, w: number) => `<path d="${d}" stroke="${WOOD.dark}" stroke-width="${w}" fill="none" stroke-linecap="round" />`
    return svg(VT, h, trunk
      + b(`M32 ${h - 32} q-2 -16 -12 -28 q-6 -8 -4 -20`, 4.5)
      + b(`M33 ${h - 34} q6 -14 16 -22 q6 -6 6 -14`, 4)
      + b(`M22 ${h - 56} q-8 -2 -12 -10 M18 ${h - 70} q4 -10 12 -12 M45 ${h - 52} q8 4 12 0 M50 ${h - 62} q-6 -10 -2 -18`, 2.4)
      + b(`M31 ${h - 40} q1 -24 4 -40`, 3)
      + b(`M35 ${h - 70} q6 -6 4 -14 M34 ${h - 62} q-6 -4 -10 -12`, 1.6)
      + `<path d="M48 ${h - 46} l6 -3" stroke="${WOOD.pale}" stroke-width="2" stroke-linecap="round" />`)
  }
  const greens = [["#1f3322", "#2c4430", "#46603e"], ["#22301e", "#334428", "#55663a"], ["#1d2e26", "#2a4236", "#45604c"]]
  const [dark, mid, light] = greens[variant % 3] as [string, string, string]
  const cx = 32 + (rnd() - 0.5) * 4
  const cy = h - 50
  let crown = `<ellipse cx="${r1(cx + 2)}" cy="${r1(cy + 10)}" rx="27" ry="16" fill="#000" opacity=".25" />`
  const blobs: [number, number, number][] = []
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + rnd() * 0.4
    const d = 12 + rnd() * 8
    blobs.push([cx + Math.cos(a) * d * 1.1, cy + Math.sin(a) * d * 0.85 - 4, 9 + rnd() * 5])
  }
  for (const [x, y, r] of blobs) crown += `<circle cx="${r1(x)}" cy="${r1(y + 2)}" r="${r1(r)}" fill="${dark}" />`
  crown += `<ellipse cx="${r1(cx)}" cy="${r1(cy - 2)}" rx="20" ry="17" fill="${dark}" />`
  for (const [x, y, r] of blobs.filter(([x, y]) => y < cy + 4 && x < cx + 10))
    crown += `<circle cx="${r1(x + 1)}" cy="${r1(y)}" r="${r1(r * 0.75)}" fill="${mid}" />`
  crown += `<ellipse cx="${r1(cx - 4)}" cy="${r1(cy - 10)}" rx="13" ry="10" fill="${mid}" />`
  for (let i = 0; i < 6; i++) {
    const x = cx - 14 + rnd() * 18
    const y = cy - 20 + rnd() * 14
    crown += `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(2.5 + rnd() * 3)}" fill="${light}" opacity=".7" />`
  }
  // листья-штрихи по краю кроны — рваный силуэт
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2
    const x = cx + Math.cos(a) * 25
    const y = cy - 2 + Math.sin(a) * 19
    crown += `<path d="M${r1(x)} ${r1(y)} l${r1(Math.cos(a) * 4)} ${r1(Math.sin(a) * 4)}" stroke="${dark}" stroke-width="2.4" stroke-linecap="round" />`
  }
  return svg(VT, h, trunk + crown)
}

/** Колючий куст: тёмные комки листвы, ежевичные плети и пара красных ягод. */
export function villageBushSvg(variant = 0): string {
  const rnd = noise(variant + 71)
  let out = `<ellipse cx="33" cy="52" rx="24" ry="8" fill="#000" opacity=".3" />`
  const parts: [number, number, number][] = [[22, 40, 13], [42, 40, 13], [32, 30, 14], [18, 30, 9], [46, 30, 9]]
  for (const [x, y, r] of parts) out += `<circle cx="${x}" cy="${y + 3}" r="${r}" fill="#1c2a1a" />`
  for (const [x, y, r] of parts) out += `<circle cx="${x - 1}" cy="${y}" r="${r1(r * 0.8)}" fill="#2a3b24" />`
  for (let i = 0; i < 7; i++)
    out += `<circle cx="${r1(16 + rnd() * 30)}" cy="${r1(22 + rnd() * 16)}" r="${r1(2 + rnd() * 2.6)}" fill="#3f5434" opacity=".8" />`
  for (let i = 0; i < 4; i++) {
    const x = 10 + rnd() * 44
    out += `<path d="M${r1(x)} 50 q${r1((rnd() - 0.5) * 16)} -12 ${r1((rnd() - 0.5) * 24)} -24" stroke="#4a3328" stroke-width="1.2" fill="none" />`
  }
  for (let i = 0; i < 3; i++) out += `<circle cx="${r1(16 + rnd() * 32)}" cy="${r1(26 + rnd() * 18)}" r="1.6" fill="#7a1f24" />`
  return svg(VT, VT, out)
}

/* ---------- Частокол ---------- */

/** Высота спрайта частокола в клетках: колья выше своей клетки. */
export const PALISADE_H = 1.6

/** Кол частокола: заострённое бревно с корой, волокнами и тенью справа. */
function stake(x: number, w: number, top: number, bottom: number, rnd: () => number, tone = WOOD.mid): string {
  const tip = top - w * 0.9
  let grain = ""
  for (let i = 0; i < 2; i++) {
    const gx = x + w * (0.3 + rnd() * 0.4)
    grain += `<path d="M${r1(gx)} ${r1(top + 4 + rnd() * 10)} v${r1(8 + rnd() * 18)}" stroke="${WOOD.grain}" stroke-width=".8" opacity=".7" />`
  }
  return `<path d="M${r1(x)} ${r1(bottom)} V${r1(top)} L${r1(x + w / 2)} ${r1(tip)} L${r1(x + w)} ${r1(top)} V${r1(bottom)} Z" fill="${tone}" stroke="${WOOD.grain}" stroke-width="1.2" />`
    + `<path d="M${r1(x + w * 0.62)} ${r1(top - w * 0.2)} L${r1(x + w)} ${r1(top)} V${r1(bottom)} H${r1(x + w * 0.66)} Z" fill="#000" opacity=".22" />`
    + `<path d="M${r1(x + w / 2)} ${r1(tip)} L${r1(x + w * 0.2)} ${r1(top)}" stroke="${WOOD.pale}" stroke-width="1.2" opacity=".7" />`
    + grain
}

/** Следы когтей: три рваные царапины — что-то пыталось перелезть. */
function claws(x: number, y: number, s = 1): string {
  let out = ""
  for (let i = 0; i < 3; i++)
    out += `<path d="M${r1(x + i * 3.2 * s)} ${r1(y)} l${r1(2 * s)} ${r1(11 * s)}" stroke="#241b14" stroke-width="${r1(1.3 * s)}" stroke-linecap="round" />`
      + `<path d="M${r1(x + i * 3.2 * s + 0.8)} ${r1(y)} l${r1(2 * s)} ${r1(11 * s)}" stroke="${WOOD.pale}" stroke-width=".6" opacity=".6" />`
  return out
}

/**
 * Частокол вдоль верхней или нижней границы (одна клетка): колья разной высоты, две поперечины на гвоздях, у части
 * клеток — латка из ржавого железа, следы когтей или наружу торчат острые колья. Низ спрайта — низ клетки.
 */
export function villagePalisadeSvg(variant = 0): string {
  const rnd = noise(variant + 91)
  const H = VT * PALISADE_H
  const bottom = H - 4
  let out = `<rect x="0" y="${r1(H - 10)}" width="64" height="8" fill="#000" opacity=".3" />`
  const n = 5
  const w = 64 / n
  for (let i = 0; i < n; i++) {
    const top = 26 + rnd() * 12
    const tone = [WOOD.mid, WOOD.dark, WOOD.light][Math.floor(rnd() * 3)] as string
    // обломанный кол на одном из вариантов
    if (variant % 5 === 2 && i === 2) {
      out += `<path d="M${r1(i * w)} ${r1(bottom)} V${r1(top + 22)} l3 -6 l3 4 l3 -7 l${r1(w - 9)} 8 V${r1(bottom)} Z" fill="${WOOD.dark}" stroke="${WOOD.grain}" stroke-width="1.2" />`
      continue
    }
    out += stake(i * w, w, top, bottom, rnd, tone)
  }
  // поперечины с гвоздями
  for (const y of [H * 0.48, H * 0.78]) {
    out += `<rect x="-2" y="${r1(y)}" width="68" height="7" rx="2" fill="${WOOD.dark}" stroke="${WOOD.grain}" stroke-width="1" />`
      + `<path d="M0 ${r1(y + 1.6)} H64" stroke="${WOOD.light}" stroke-width="1" opacity=".5" />`
    for (let i = 0; i < n; i++) out += `<circle cx="${r1(i * w + w / 2)}" cy="${r1(y + 3.5)}" r="1.1" fill="${IRON.light}" />`
  }
  if (variant % 5 === 2) {
    // ржавый лист железа закрывает пролом
    out += `<path d="M${r1(w * 1.8)} ${r1(H * 0.3)} l${r1(w * 1.5)} -3 l2 ${r1(H * 0.42)} l${r1(-w * 1.5)} 2 Z" fill="${IRON.mid}" stroke="${IRON.dark}" stroke-width="1.4" />`
      + `<path d="M${r1(w * 2.1)} ${r1(H * 0.42)} l${r1(w * 0.9)} 10" stroke="${IRON.rust}" stroke-width="3" opacity=".7" stroke-linecap="round" />`
      + [0, 1, 2, 3].map(k => `<circle cx="${r1(w * 1.95 + (k % 2) * w * 1.3)}" cy="${r1(H * 0.33 + Math.floor(k / 2) * H * 0.36)}" r="1.2" fill="${IRON.light}" />`).join("")
  }
  if (variant % 5 === 1) out += claws(18 + rnd() * 20, H * 0.5 + 9)
  if (variant % 5 === 4) {
    // оберег: связка костей на верёвке
    const x = 20 + rnd() * 24
    out += `<path d="M${r1(x)} ${r1(H * 0.48)} v12" stroke="#a89878" stroke-width="1" />`
      + `<path d="M${r1(x - 4)} ${r1(H * 0.48 + 12)} l8 6 M${r1(x + 4)} ${r1(H * 0.48 + 12)} l-8 6" stroke="#d8cfb8" stroke-width="2.2" stroke-linecap="round" />`
  }
  return svg(VT, H, out)
}

/**
 * Частокол вдоль левой или правой границы (одна клетка, вид сверху-сбоку): ряд кольев, уходящих вглубь, — видны
 * острые верхушки, наружу торчат косые колья. `side` — с какой стороны поля стоит стена.
 */
export function villagePalisadeSideSvg(variant: number, side: "left" | "right"): string {
  const rnd = noise(variant + 131)
  const H = VT * PALISADE_H
  const off = H - VT
  let out = `<rect x="${side === "left" ? 40 : 4}" y="${r1(off)}" width="20" height="64" fill="#000" opacity=".28" />`
  // косые колья наружу (за пределы поселения)
  for (let i = 0; i < 2; i++) {
    const y = off + 14 + i * 30 + rnd() * 6
    out += side === "left"
      ? `<path d="M30 ${r1(y)} L2 ${r1(y - 8)} L4 ${r1(y - 3)} L28 ${r1(y + 4)} Z" fill="${WOOD.light}" stroke="${WOOD.grain}" stroke-width="1" />`
      : `<path d="M34 ${r1(y)} L62 ${r1(y - 8)} L60 ${r1(y - 3)} L36 ${r1(y + 4)} Z" fill="${WOOD.light}" stroke="${WOOD.grain}" stroke-width="1" />`
  }
  // колья друг за другом: дальний выше, ближний ниже; ширина кола — его сечение
  for (let i = 0; i < 5; i++) {
    const y = off - 14 + i * 15
    const top = y + rnd() * 4
    const tone = i % 2 ? WOOD.mid : WOOD.dark
    out += stake(19, 26, top, y + 40, rnd, tone)
  }
  out += `<rect x="16" y="${r1(off + 20)}" width="32" height="6" rx="2" fill="${WOOD.dark}" opacity=".9" />`
    + `<rect x="16" y="${r1(off + 50)}" width="32" height="6" rx="2" fill="${WOOD.dark}" opacity=".9" />`
  if (variant % 4 === 1) out += claws(24, off + 30, 0.9)
  return svg(VT, H, out)
}

/** Высота спрайта факела в клетках. */
export const TORCH_H = 1.5

/** Факел на шесте: кованая чаша и огонь (свечение — отдельным спрайтом сцены, оно мерцает). */
export function villageTorchSvg(): string {
  const H = VT * TORCH_H
  return svg(VT, H, `<ellipse cx="32" cy="${H - 4}" rx="9" ry="3" fill="#000" opacity=".35" />`
    + `<rect x="29.5" y="30" width="5" height="${H - 34}" fill="${WOOD.dark}" stroke="${WOOD.grain}" stroke-width="1" />`
    + `<path d="M31 34 v${H - 42}" stroke="${WOOD.light}" stroke-width="1" opacity=".6" />`
    + `<path d="M22 22 h20 l-4 12 h-12 Z" fill="${IRON.dark}" stroke="#15161a" stroke-width="1.2" />`
    + `<path d="M24 25 h16 M25 29 h14" stroke="${IRON.mid}" stroke-width="1" />`
    + `<path d="M32 2 q-11 10 -8 20 h16 q3 -10 -8 -20 Z" fill="${GLOW.warm}" />`
    + `<path d="M32 8 q-6 7 -4 14 h8 q2 -7 -4 -14 Z" fill="${GLOW.core}" />`
    + `<circle cx="32" cy="19" r="2.4" fill="#fff6d8" />`)
}

/** Рогатка за оградой: скрещённые заострённые брёвна, связанные верёвкой — от толпы с той стороны. */
export function villageSpikesSvg(variant = 0): string {
  const rnd = noise(variant + 151)
  const tilt = (rnd() - 0.5) * 10
  const log = (x1: number, y1: number, x2: number, y2: number) => `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${WOOD.grain}" stroke-width="7" stroke-linecap="round" />`
    + `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${WOOD.mid}" stroke-width="5" stroke-linecap="round" />`
    + `<path d="M${x2} ${y2} l${r1((x2 - x1) * 0.12)} ${r1((y2 - y1) * 0.12)}" stroke="${WOOD.pale}" stroke-width="3" stroke-linecap="round" />`
  return svg(VT, VT, `<ellipse cx="32" cy="52" rx="26" ry="6" fill="#000" opacity=".3" />`
    + `<g transform="rotate(${r1(tilt)} 32 40)">`
    + log(10, 54, 50, 16) + log(54, 54, 14, 16) + log(4, 40, 60, 40)
    + `<path d="M28 34 l8 10 M36 34 l-8 10" stroke="#a89878" stroke-width="1.6" />`
    + "</g>")
}

/* ---------- Домики ---------- */

export interface HouseArt {
  w: number
  h: number
  roof: string
  wall: string
  /** Чей домик: у Казармы флаг и щит с мечами, у Лавки полосатый навес и бочки. Подпись — вывеской сцены. */
  npc: "barracks" | "store" | "tavern"
  /** Износ 0…1 (`buildingWear`): наклон, дыры в крыше, заколоченные окна, трещины. */
  wear: number
}

/** Сколько клеток крыша выступает над прямоугольником стен домика. */
export const HOUSE_ROOF_OVER = 1.4

/** Дыра в крыше: рваный тёмный провал, сквозь который видны стропила. */
function roofHole(x: number, y: number, s: number, rnd: () => number): string {
  let d = ""
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2
    const r = s * (0.65 + rnd() * 0.5)
    d += `${i ? "L" : "M"}${r1(x + Math.cos(a) * r * 1.3)} ${r1(y + Math.sin(a) * r * 0.75)} `
  }
  return `<path d="${d}Z" fill="#14100d" />`
    + `<path d="M${r1(x - s)} ${r1(y - 2)} L${r1(x + s)} ${r1(y + 3)} M${r1(x - s * 0.4)} ${r1(y - s * 0.6)} V${r1(y + s * 0.6)}" stroke="${WOOD.mid}" stroke-width="2.4" />`
}

/** Латка на крыше: доски внахлёст или лист железа с заклёпками. */
function roofPatch(x: number, y: number, k: number, rnd: () => number): string {
  const a = (rnd() - 0.5) * 16
  if (k % 2 === 0) {
    return `<g transform="rotate(${r1(a)} ${r1(x)} ${r1(y)})">`
      + `<rect x="${r1(x - 13)}" y="${r1(y - 8)}" width="26" height="7" fill="${WOOD.light}" stroke="${WOOD.grain}" stroke-width="1" />`
      + `<rect x="${r1(x - 11)}" y="${r1(y - 1)}" width="24" height="7" fill="${WOOD.pale}" stroke="${WOOD.grain}" stroke-width="1" />`
      + `<circle cx="${r1(x - 10)}" cy="${r1(y - 4.5)}" r=".9" fill="${IRON.dark}" /><circle cx="${r1(x + 10)}" cy="${r1(y + 2.5)}" r=".9" fill="${IRON.dark}" /></g>`
  }
  return `<g transform="rotate(${r1(a)} ${r1(x)} ${r1(y)})">`
    + `<rect x="${r1(x - 12)}" y="${r1(y - 8)}" width="24" height="15" fill="${IRON.mid}" stroke="${IRON.dark}" stroke-width="1.2" />`
    + `<path d="M${r1(x - 8)} ${r1(y - 8)} v15 M${r1(x)} ${r1(y - 8)} v15 M${r1(x + 8)} ${r1(y - 8)} v15" stroke="${IRON.light}" stroke-width=".8" opacity=".6" />`
    + `<path d="M${r1(x - 4)} ${r1(y + 1)} l6 6" stroke="${IRON.rust}" stroke-width="2.6" opacity=".7" stroke-linecap="round" /></g>`
}

/** Трещина в стене: ломаная от точки вниз. */
function crack(x: number, y: number, len: number, rnd: () => number): string {
  let d = `M${r1(x)} ${r1(y)}`
  let cx = x
  let cy = y
  for (let i = 0; i < 4; i++) {
    cx += (rnd() - 0.5) * 8
    cy += len / 4
    d += ` L${r1(cx)} ${r1(cy)}`
  }
  return `<path d="${d}" stroke="#1c1712" stroke-width="1.6" fill="none" stroke-linejoin="bevel" />`
}

/**
 * Окно: рама, стекло и свет изнутри. `state`: 0 — целое (одна доска поперёк), 1 — треснувшее стекло,
 * 2 — выбитое и наполовину заколоченное, 3 — заколочено крест-накрест, свет пробивается щелями.
 */
function houseWindow(x: number, y: number, state: number, shutter: string): string {
  const frame = `<rect x="${r1(x - 2)}" y="${r1(y - 2)}" width="38" height="32" rx="2" fill="${WOOD.dark}" />`
  const lit = `<rect x="${r1(x + 2)}" y="${r1(y + 2)}" width="30" height="24" fill="${state === 3 ? "#1a140e" : GLOW.dim}" />`
    + (state === 3 ? "" : `<rect x="${r1(x + 4)}" y="${r1(y + 4)}" width="26" height="20" fill="${GLOW.warm}" opacity=".75" />`
      + `<rect x="${r1(x + 6)}" y="${r1(y + 6)}" width="10" height="8" fill="${GLOW.core}" opacity=".55" />`)
  const bars = `<path d="M${r1(x + 17)} ${r1(y + 2)} v24 M${r1(x + 2)} ${r1(y + 14)} h30" stroke="${WOOD.dark}" stroke-width="2.2" />`
  const plank = (x1: number, y1: number, x2: number, y2: number) => `<path d="M${r1(x1)} ${r1(y1)} L${r1(x2)} ${r1(y2)}" stroke="${WOOD.grain}" stroke-width="7.5" stroke-linecap="square" />`
    + `<path d="M${r1(x1)} ${r1(y1)} L${r1(x2)} ${r1(y2)}" stroke="${WOOD.light}" stroke-width="5.5" stroke-linecap="square" />`
    + `<circle cx="${r1(x1 + (x2 - x1) * 0.08)}" cy="${r1(y1 + (y2 - y1) * 0.08)}" r="1" fill="${IRON.dark}" />`
    + `<circle cx="${r1(x2 - (x2 - x1) * 0.08)}" cy="${r1(y2 - (y2 - y1) * 0.08)}" r="1" fill="${IRON.dark}" />`
  // уцелевшая ставня висит криво на одной петле
  const shutters = `<rect x="${r1(x - 9)}" y="${r1(y - 1)}" width="7" height="30" fill="${shutter}" stroke="${WOOD.grain}" stroke-width="1" />`
    + `<rect x="${r1(x + 36)}" y="${r1(y + 2)}" width="7" height="30" fill="${shutter}" stroke="${WOOD.grain}" stroke-width="1" transform="rotate(9 ${r1(x + 36)} ${r1(y + 2)})" />`
  let over = ""
  if (state === 0) over = plank(x - 3, y + 20, x + 37, y + 16)
  if (state === 1) over = `<path d="M${r1(x + 22)} ${r1(y + 4)} l-5 7 l6 4 l-4 8 M${r1(x + 17)} ${r1(y + 11)} l-8 3" stroke="#2a1d10" stroke-width="1.2" fill="none" />`
  if (state === 2) over = `<path d="M${r1(x + 2)} ${r1(y + 2)} h12 l-4 9 l6 5 l-8 10 h-6 Z" fill="#14100d" />` + plank(x - 3, y + 8, x + 37, y + 12) + plank(x - 3, y + 21, x + 37, y + 19)
  if (state === 3) {
    over = `<path d="M${r1(x + 4)} ${r1(y + 13)} h26" stroke="${GLOW.warm}" stroke-width="1.4" opacity=".7" />`
      + plank(x - 4, y - 2, x + 38, y + 30) + plank(x + 38, y - 2, x - 4, y + 30) + plank(x - 4, y + 13, x + 38, y + 14)
  }
  return shutters + frame + lit + (state < 2 ? bars : "") + over
}

/**
 * Домик NPC: дощатый фасад с дверью посередине нижнего ряда, окна, крыша с трубой и приметы по назначению (`npc`).
 * Износ `wear` (уровень здания) решает, насколько дом покосился и разбит: дыры в крыше превращаются в латки, доски
 * с окон снимают, трещин меньше, у стен появляются мешки с песком и колья. Идеальным дом не становится.
 * Спрайт — ширина `w` клеток, высота `h + HOUSE_ROOF_OVER`, низ совпадает с нижним краем стен.
 */
export function villageHouseSvg(a: HouseArt): string {
  const rnd = noise(a.npc === "barracks" ? 7 : a.npc === "store" ? 13 : 23)
  const wear = Math.max(0.05, Math.min(1, a.wear))
  const W = a.w * VT
  const H = (a.h + HOUSE_ROOF_OVER) * VT
  const facadeTop = H - VT * 1.7
  const roofBase = facadeTop + 6
  const cx = W / 2
  const doorW = VT * 0.62
  const doorH = VT * 1.02
  const doorX = cx - doorW / 2
  const doorY = H - doorH
  const sag = 3 + wear * 9
  const roofTop = 14
  // наклон: верх уходит вбок, низ стоит; дом чуть уже спрайта, чтобы наклон не обрезался
  const lean = (a.npc === "barracks" ? -1 : 1) * (1 + wear * 4)
  const fitX = (W - 40) / W

  // стены из досок внахлёст
  let siding = ""
  for (let y = facadeTop + 12, i = 0; y < H - 12; y += 9, i++) {
    siding += `<rect x="10" y="${r1(y)}" width="${r1(W - 20)}" height="9" fill="${shade(a.wall, i % 2 ? 0.94 : 1.03)}" />`
      + `<path d="M10 ${r1(y + 8.5)} H${r1(W - 10)}" stroke="${shade(a.wall, 0.62)}" stroke-width="1.2" />`
    // стыки досок вразбежку
    const jx = 20 + ((i * 37) % (W - 50))
    siding += `<path d="M${r1(jx)} ${r1(y)} v9" stroke="${shade(a.wall, 0.62)}" stroke-width="1" />`
  }
  // подтёки под карнизом и мох у цоколя
  let grime = ""
  for (let i = 0; i < 5; i++) {
    const x = 16 + rnd() * (W - 32)
    grime += `<path d="M${r1(x)} ${r1(facadeTop + 10)} v${r1(10 + rnd() * 22 * (0.4 + wear))}" stroke="#1f1a14" stroke-width="${r1(3 + rnd() * 4)}" opacity=".2" stroke-linecap="round" />`
  }
  for (let i = 0; i < 7; i++)
    grime += `<circle cx="${r1(12 + rnd() * (W - 24))}" cy="${r1(H - 13 + rnd() * 4)}" r="${r1(2.5 + rnd() * 3)}" fill="#3f5434" opacity=".7" />`
  let cracks = ""
  const nCracks = 1 + Math.round(wear * 3)
  for (let i = 0; i < nCracks; i++) cracks += crack(18 + rnd() * (W - 36), facadeTop + 14 + rnd() * 20, 18 + rnd() * 22, rnd)
  // выломанная доска: тёмная щель в обшивке
  const hole = wear > 0.5
    ? `<path d="M${r1(W - 70)} ${r1(facadeTop + 48)} h30 l-3 9 h-24 Z" fill="#17120e" />`
      + `<path d="M${r1(W - 40)} ${r1(facadeTop + 48)} l6 -3" stroke="${shade(a.wall, 0.8)}" stroke-width="3" />`
    : ""

  // окна: износ решает, какое заколочено
  const winStates = wear > 0.85 ? [3, 3] : wear > 0.65 ? [3, 2] : wear > 0.45 ? [2, 1] : wear > 0.3 ? [3, 1] : [0, 1]
  const winY = facadeTop + 22
  const windows = houseWindow(cx - doorW / 2 - 60, winY, winStates[0] as number, shade(a.roof, 0.8))
    + houseWindow(cx + doorW / 2 + 26, winY, winStates[1] as number, shade(a.roof, 0.8))

  // дверь: доски, одна выбита на старом доме; железные полосы у починенного
  const door = `<rect x="${r1(doorX - 5)}" y="${r1(doorY - 5)}" width="${r1(doorW + 10)}" height="${r1(doorH + 5)}" rx="3" fill="${WOOD.dark}" />`
    + `<rect x="${r1(doorX)}" y="${r1(doorY)}" width="${r1(doorW)}" height="${r1(doorH)}" fill="${WOOD.mid}" />`
    + `<path d="M${r1(doorX + doorW / 3)} ${r1(doorY + 2)} V${r1(H - 3)} M${r1(doorX + (doorW * 2) / 3)} ${r1(doorY + 2)} V${r1(H - 3)}" stroke="${WOOD.grain}" stroke-width="1.6" />`
    + (wear > 0.7
      ? `<path d="M${r1(doorX + doorW / 3)} ${r1(doorY + 18)} h${r1(doorW / 3)} v26 l-5 -4 l-4 6 l-4 -5 Z" fill="#120e0b" />`
      : `<path d="M${r1(doorX)} ${r1(doorY + 14)} h${r1(doorW)} M${r1(doorX)} ${r1(H - 18)} h${r1(doorW)}" stroke="${IRON.mid}" stroke-width="4" />`
        + `<circle cx="${r1(doorX + 5)}" cy="${r1(doorY + 14)}" r="1.3" fill="${IRON.light}" /><circle cx="${r1(doorX + doorW - 5)}" cy="${r1(H - 18)}" r="1.3" fill="${IRON.light}" />`)
    + `<path d="M${r1(doorX)} ${r1(doorY + doorH * 0.4)} l${r1(doorW)} ${r1(doorH * 0.35)}" stroke="${WOOD.grain}" stroke-width="3" opacity=".6" />`
    + `<circle cx="${r1(doorX + doorW - 7)}" cy="${r1(doorY + doorH * 0.55)}" r="2.2" fill="${IRON.light}" />`
    + `<rect x="${r1(doorX - 9)}" y="${r1(H - 5)}" width="${r1(doorW + 18)}" height="5" fill="#5d5a55" />`

  // крыша: просевший конёк, ряды дранки с неровными стыками
  const ridge = `M${r1(W * 0.18)} ${roofTop} Q${r1(cx)} ${r1(roofTop + sag * 2)} ${r1(W * 0.82)} ${roofTop}`
  const roofShape = `M0 ${r1(roofBase)} L${r1(W * 0.18)} ${roofTop} Q${r1(cx)} ${r1(roofTop + sag * 2)} ${r1(W * 0.82)} ${roofTop} L${W} ${r1(roofBase)} Q${r1(cx)} ${r1(roofBase + sag)} 0 ${r1(roofBase)} Z`
  let shingles = ""
  for (let row = 1; row <= 6; row++) {
    const t = row / 7
    const y = roofTop + sag * (1 - t) + t * (roofBase - roofTop)
    const inset = W * 0.18 * (1 - t) + 3
    shingles += `<path d="M${r1(inset)} ${r1(y)} Q${r1(cx)} ${r1(y + sag * (0.6 + t * 0.4))} ${r1(W - inset)} ${r1(y)}" stroke="${shade(a.roof, 0.62)}" stroke-width="1.8" fill="none" />`
    for (let x = inset + 6 + (row % 2) * 7; x < W - inset - 6; x += 14 + rnd() * 4) {
      const yy = y - (roofBase - roofTop) / 7 + 2 + sag * 0.6 * Math.sin((x / W) * Math.PI)
      shingles += `<path d="M${r1(x)} ${r1(yy)} v${r1((roofBase - roofTop) / 7 - 2)}" stroke="${shade(a.roof, 0.7)}" stroke-width="1" />`
    }
    // съехавшая дранка — светлые и тёмные пятна
    for (let k = 0; k < 2; k++) {
      const x = inset + 10 + rnd() * (W - inset * 2 - 24)
      shingles += `<rect x="${r1(x)}" y="${r1(y - 7 + sag * 0.6 * Math.sin((x / W) * Math.PI))}" width="11" height="6" fill="${shade(a.roof, rnd() > 0.5 ? 1.2 : 0.75)}" opacity=".8" transform="rotate(${r1((rnd() - 0.5) * 14)} ${r1(x)} ${r1(y)})" />`
    }
  }
  const holes = Math.round(wear * 3)
  const patches = 1 + Math.round((1 - wear) * 3)
  let roofDamage = ""
  for (let i = 0; i < holes; i++) roofDamage += roofHole(W * (0.28 + i * 0.22 + rnd() * 0.06), roofTop + 18 + rnd() * (roofBase - roofTop - 34), 7 + wear * 5, rnd)
  for (let i = 0; i < patches; i++) roofDamage += roofPatch(W * (0.2 + ((i * 0.31 + 0.12) % 0.62)), roofTop + 22 + rnd() * (roofBase - roofTop - 38), i, rnd)
  // мох на крыше
  for (let i = 0; i < 4; i++)
    roofDamage += `<ellipse cx="${r1(W * 0.15 + rnd() * W * 0.7)}" cy="${r1(roofBase - 8 - rnd() * 14)}" rx="${r1(5 + rnd() * 6)}" ry="3" fill="#3f5434" opacity=".65" />`

  // труба: обломанная у старого дома
  const chX = W * 0.7
  const chimney = wear > 0.6
    ? `<path d="M${r1(chX)} 40 V14 l5 -5 l4 6 l5 -8 l4 7 V40 Z" fill="#5e4a42" stroke="#2a201c" stroke-width="1.4" />`
    : `<rect x="${r1(chX)}" y="6" width="18" height="34" fill="#5e4a42" stroke="#2a201c" stroke-width="1.4" />`
      + `<rect x="${r1(chX - 3)}" y="2" width="24" height="7" fill="#463631" />`
      + `<path d="M${r1(chX + 3)} 14 h12 M${r1(chX + 3)} 24 h12" stroke="#3a2e29" stroke-width="1" />`

  // починка: мешки с песком и колья у стен — тем больше, чем выше уровень
  const fixes = 1 - wear
  let barricade = ""
  if (fixes > 0.3) {
    for (let i = 0; i < 3; i++) {
      const x = 14 + i * 15
      barricade += `<ellipse cx="${x}" cy="${r1(H - 8)}" rx="9" ry="6" fill="#8a7a5a" stroke="#4a3f2c" stroke-width="1.2" />`
    }
    barricade += `<ellipse cx="29" cy="${r1(H - 18)}" rx="9" ry="6" fill="#9a8a68" stroke="#4a3f2c" stroke-width="1.2" />`
  }
  if (fixes > 0.5) {
    barricade += `<path d="M${r1(W - 14)} ${r1(H - 4)} L${r1(W - 24)} ${r1(H - 46)} M${r1(W - 26)} ${r1(H - 4)} L${r1(W - 30)} ${r1(H - 40)}" stroke="${WOOD.mid}" stroke-width="4" stroke-linecap="round" />`
      + `<path d="M${r1(W - 24)} ${r1(H - 46)} l-1 -5 M${r1(W - 30)} ${r1(H - 40)} l-1 -5" stroke="${WOOD.pale}" stroke-width="3" stroke-linecap="round" />`
  }
  if (fixes > 0.7) {
    // фонарь у двери — у ухоженного дома
    barricade += `<path d="M${r1(doorX + doorW + 12)} ${r1(doorY + 4)} v-8 h6" stroke="${IRON.dark}" stroke-width="2" fill="none" />`
      + `<rect x="${r1(doorX + doorW + 14)}" y="${r1(doorY - 3)}" width="8" height="11" rx="2" fill="${GLOW.core}" stroke="${IRON.dark}" stroke-width="1.4" />`
  }

  const emblemY = facadeTop - 4
  const tatter = (x: number, y: number, w: number, color: string) => {
    // рваный край ткани
    let d = `M${r1(x)} ${r1(y)} h${r1(w)}`
    for (let i = 0; i <= 5; i++) d += ` L${r1(x + w - (w / 5) * i)} ${r1(y + 16 + (i % 2 ? 6 : 0) + rnd() * 5)}`
    return `<path d="${d} Z" fill="${color}" />`
  }
  // бар: вывеска с кружкой на кованом кронштейне, пирамида бочек, скамья и пустые бутылки
  const tavern = () => {
    const sx = W - 64
    const sy = facadeTop - 26
    let bottles = ""
    for (let i = 0; i < 3; i++) {
      const x = cx + doorW / 2 + 14 + i * 7
      bottles += `<rect x="${r1(x)}" y="${r1(H - 18)}" width="5" height="12" rx="2" fill="${i === 1 ? "#3a5a3a" : "#5a3a2a"}" opacity=".9" />`
        + `<rect x="${r1(x + 1.5)}" y="${r1(H - 22)}" width="2" height="5" fill="#2a2a2a" />`
    }
    const barrel = (x: number, y: number) => `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="12" ry="14" fill="${WOOD.mid}" stroke="${WOOD.grain}" stroke-width="2" />`
      + `<path d="M${r1(x - 12)} ${r1(y - 6)} h24 M${r1(x - 12)} ${r1(y + 6)} h24" stroke="${IRON.dark}" stroke-width="2.4" />`
      + `<circle cx="${r1(x)}" cy="${r1(y)}" r="2" fill="${WOOD.grain}" />`
    return `<path d="M${r1(sx)} ${r1(sy - 8)} h44 M${r1(sx + 6)} ${r1(sy - 8)} l-8 12" stroke="${IRON.dark}" stroke-width="3" fill="none" />`
      + `<path d="M${r1(sx + 10)} ${r1(sy - 8)} v6 M${r1(sx + 36)} ${r1(sy - 8)} v4" stroke="${IRON.dark}" stroke-width="1.5" />`
      + `<g transform="rotate(${r1(wear * 8)} ${r1(sx + 23)} ${r1(sy - 6)})">`
      + `<rect x="${r1(sx + 4)}" y="${r1(sy - 2)}" width="38" height="28" rx="3" fill="#b8a98a" stroke="${WOOD.dark}" stroke-width="2.5" />`
      + `<rect x="${r1(sx + 14)}" y="${r1(sy + 5)}" width="14" height="16" rx="2" fill="${GLOW.warm}" stroke="${WOOD.grain}" stroke-width="1.6" />`
      + `<path d="M${r1(sx + 28)} ${r1(sy + 8)} q6 0 6 5 q0 5 -6 5" stroke="${WOOD.grain}" stroke-width="2" fill="none" />`
      + `<path d="M${r1(sx + 13)} ${r1(sy + 6)} q2 -5 8 -3 q5 -3 8 2" fill="#f3ead8" stroke="${WOOD.grain}" stroke-width="1" /></g>`
      + barrel(22, H - 16) + barrel(46, H - 16) + barrel(34, H - 38)
      + `<rect x="${r1(cx + doorW / 2 + 6)}" y="${r1(H - 26)}" width="34" height="5" fill="${WOOD.light}" stroke="${WOOD.grain}" stroke-width="1" />`
      + `<path d="M${r1(cx + doorW / 2 + 9)} ${r1(H - 21)} v15 M${r1(cx + doorW / 2 + 37)} ${r1(H - 21)} v15" stroke="${WOOD.dark}" stroke-width="3" />`
      + bottles
  }
  const props = a.npc === "tavern" ? tavern() : a.npc === "barracks"
    // рваный флаг на крыше, помятый щит с мечами над дверью, стойка с копьями
    ? `<rect x="${r1(W * 0.86)}" y="0" width="4" height="${r1(roofBase - 6)}" fill="${WOOD.dark}" />`
      + tatter(W * 0.86 + 4, 2, 28, "#7a2a26")
      + `<path d="M${r1(W * 0.86 + 14)} 6 l4 10" stroke="#4a1a16" stroke-width="1.4" />`
      + `<path d="M${r1(cx - 15)} ${r1(emblemY - 14)} h30 v14 q0 14 -15 20 q-15 -6 -15 -20 Z" fill="#33506e" stroke="#1a2534" stroke-width="2.4" />`
      + `<path d="M${r1(cx - 11)} ${r1(emblemY - 10)} L${r1(cx + 11)} ${r1(emblemY + 12)} M${r1(cx + 11)} ${r1(emblemY - 10)} L${r1(cx - 11)} ${r1(emblemY + 12)}" stroke="#b8bcc4" stroke-width="3" stroke-linecap="round" />`
      + `<path d="M${r1(cx + 4)} ${r1(emblemY - 14)} l-3 7 l5 3" stroke="#1a2534" stroke-width="1.6" fill="none" />`
      + `<path d="M${r1(W - 22)} ${r1(H - 8)} V${r1(facadeTop + 6)} M${r1(W - 14)} ${r1(H - 8)} V${r1(facadeTop + 10)}" stroke="${WOOD.mid}" stroke-width="3" />`
      + `<path d="M${r1(W - 25)} ${r1(facadeTop + 6)} l3 -9 l3 9 Z M${r1(W - 17)} ${r1(facadeTop + 10)} l3 -9 l3 9 Z" fill="${IRON.light}" />`
      + `<rect x="${r1(W - 28)}" y="${r1(H - 30)}" width="20" height="4" fill="${WOOD.dark}" />`
    // выцветший рваный навес, бочка и ящики у стены
    : (() => {
        const aw = doorW + 46
        const ax = cx - aw / 2
        const ay = facadeTop - 2
        let stripes = ""
        for (let i = 0; i < 6; i++) {
          const x = ax + (aw / 6) * i
          const torn = (i === 1 && wear > 0.4) || (i === 4 && wear > 0.7)
          stripes += torn
            ? `<path d="M${r1(x)} ${r1(ay)} h${r1(aw / 6)} v6 l-4 10 l-3 -7 l-4 9 Z" fill="${i % 2 === 0 ? "#3a5244" : "#a8987a"}" />`
            : `<path d="M${r1(x)} ${r1(ay)} h${r1(aw / 6)} v20 q${r1(-aw / 12)} 7 ${r1(-aw / 6)} 0 Z" fill="${i % 2 === 0 ? "#3a5244" : "#a8987a"}" />`
        }
        return stripes
          + `<rect x="${r1(ax - 2)}" y="${r1(ay - 4)}" width="${r1(aw + 4)}" height="6" rx="2" fill="${WOOD.dark}" />`
          + `<ellipse cx="22" cy="${r1(H - 18)}" rx="13" ry="16" fill="${WOOD.mid}" stroke="${WOOD.grain}" stroke-width="2" />`
          + `<path d="M10 ${r1(H - 24)} h24 M10 ${r1(H - 12)} h24" stroke="${IRON.dark}" stroke-width="2.4" />`
          + `<rect x="${r1(W - 36)}" y="${r1(H - 28)}" width="26" height="22" fill="${WOOD.light}" stroke="${WOOD.grain}" stroke-width="2" />`
          + `<path d="M${r1(W - 36)} ${r1(H - 28)} l26 22 M${r1(W - 10)} ${r1(H - 28)} l-26 22" stroke="${WOOD.grain}" stroke-width="1.5" />`
          + `<rect x="${r1(W - 32)}" y="${r1(H - 44)}" width="18" height="16" fill="${WOOD.mid}" stroke="${WOOD.grain}" stroke-width="1.6" transform="rotate(-8 ${r1(W - 23)} ${r1(H - 36)})" />`
      })()

  const house = `<rect x="8" y="${r1(facadeTop)}" width="${r1(W - 16)}" height="${r1(H - facadeTop)}" fill="${a.wall}" />`
    + siding
    + `<rect x="8" y="${r1(facadeTop)}" width="${r1(W - 16)}" height="12" fill="#000" opacity=".35" />`
    + `<rect x="8" y="${r1(H - 12)}" width="${r1(W - 16)}" height="12" fill="#5d5a55" />`
    + `<path d="M8 ${r1(H - 6)} H${r1(W - 8)}" stroke="#3f3c38" stroke-width="1.4" />`
    + `<rect x="8" y="${r1(facadeTop)}" width="9" height="${r1(H - facadeTop)}" fill="${WOOD.dark}" />`
    + `<rect x="${r1(W - 17)}" y="${r1(facadeTop)}" width="9" height="${r1(H - facadeTop)}" fill="${WOOD.dark}" />`
    + grime + cracks + hole + windows + door
    + chimney
    + `<path d="${roofShape}" fill="${a.roof}" />`
    + `<path d="M0 ${r1(roofBase)} L${r1(W * 0.18)} ${roofTop} Q${r1(W * 0.34)} ${r1(roofTop + sag)} ${r1(W * 0.5)} ${r1(roofTop + sag)} L${r1(W * 0.42)} ${r1(roofBase + sag * 0.8)} Q${r1(W * 0.2)} ${r1(roofBase + sag * 0.4)} 0 ${r1(roofBase)} Z" fill="${shade(a.roof, 1.2)}" opacity=".35" />`
    + shingles + roofDamage
    + `<path d="${ridge}" stroke="${shade(a.roof, 0.55)}" stroke-width="5" fill="none" stroke-linecap="round" />`
    + `<path d="M0 ${r1(roofBase)} Q${r1(cx)} ${r1(roofBase + sag)} ${W} ${r1(roofBase)}" stroke="${shade(a.roof, 0.5)}" stroke-width="8" fill="none" stroke-linecap="round" />`
    + props + barricade
  return svg(W, H, `<ellipse cx="${r1(cx + 8)}" cy="${r1(H - 2)}" rx="${r1(W * 0.52)}" ry="9" fill="#000" opacity=".35" />`
    + `<g transform="translate(${r1(cx)} ${r1(H)}) skewX(${r1(lean)}) scale(${Math.round(fitX * 1000) / 1000} 1) translate(${r1(-cx)} ${r1(-H)})">${house}</g>`)
}

/* ---------- Кладбище ---------- */

/** Высота спрайта Кладбища в клетках: ограда участка и надгробия, крест поднимается на полклетки выше. */
export const GRAVEYARD_H_OVER = 0.5

/**
 * Кладбище: участок `w` × `h` клеток за кованой оградой с калиткой снизу посередине, надгробия рядами, холмики
 * свежих могил, крест, сухое дерево и фонарь. Износ `wear`: надгробия кренятся и трескаются, прутья ограды выпадают.
 * Низ спрайта — нижний край участка.
 */
export function villageGraveyardSvg(w: number, h: number, wear = 0.6): string {
  const rnd = noise(41)
  const W = w * VT
  const H = (h + GRAVEYARD_H_OVER) * VT
  const top = GRAVEYARD_H_OVER * VT
  let stones = ""
  const stone = (x: number, y: number, k: number) => {
    const sw = 22
    const sh = 28 + (k % 2) * 6
    const tilt = (rnd() - 0.5) * 22 * wear
    const broken = rnd() < wear * 0.45
    const body = broken
      ? `<path d="M${r1(x - sw / 2)} ${r1(y + 4)} V${r1(y - sh * 0.45)} l6 -4 l5 5 l5 -7 l${r1(sw - 16)} 6 V${r1(y + 4)} Z" fill="#6d6a66" stroke="#3a3836" stroke-width="2" />`
      : `<path d="M${r1(x - sw / 2)} ${r1(y + 4)} V${r1(y - sh + 11)} q${r1(sw / 2)} -14 ${sw} 0 V${r1(y + 4)} Z" fill="#76726c" stroke="#3a3836" stroke-width="2" />`
        + `<path d="M${r1(x - 5)} ${r1(y - sh + 18)} h10 M${r1(x)} ${r1(y - sh + 13)} v12" stroke="#4a4744" stroke-width="2" />`
    return `<ellipse cx="${r1(x)}" cy="${r1(y + 10)}" rx="16" ry="6" fill="#3b2f22" opacity=".7" />`
      + `<g transform="rotate(${r1(tilt)} ${r1(x)} ${r1(y + 4)})">${body}`
      + `<path d="M${r1(x - sw / 2 + 2)} ${r1(y)} q4 -4 9 -2" stroke="#3f5434" stroke-width="3" opacity=".7" fill="none" /></g>`
  }
  const cols = Math.max(2, w - 1)
  for (let row = 0; row < 2; row++)
    for (let i = 0; i < cols; i++) stones += stone(28 + (i + 0.5) * ((W - 56) / cols) + (row % 2) * 10, top + 44 + row * 62, i + row)
  // свежий холмик с лопатой
  const mound = `<ellipse cx="${r1(W * 0.3)}" cy="${r1(H - 30)}" rx="20" ry="8" fill="#4a3b2a" />`
    + `<ellipse cx="${r1(W * 0.3 - 4)}" cy="${r1(H - 33)}" rx="12" ry="4" fill="#5a4a36" />`
    + `<path d="M${r1(W * 0.3 + 18)} ${r1(H - 30)} l8 -26" stroke="${WOOD.mid}" stroke-width="3" />`
    + `<path d="M${r1(W * 0.3 + 14)} ${r1(H - 26)} l6 -2 l2 8 l-7 2 Z" fill="${IRON.mid}" />`
  let fence = ""
  const gateL = W / 2 - 22
  const gateR = W / 2 + 22
  let k = 0
  for (let x = 6; x <= W - 6; x += 12, k++) {
    if (x > gateL && x < gateR) continue
    if (rnd() < wear * 0.25) continue
    const bend = (rnd() - 0.5) * 8 * wear
    fence += `<path d="M${r1(x)} ${r1(H - 4)} L${r1(x + bend)} ${r1(H - 30)} l-3 -5 h6 l-3 5" stroke="#1d1e26" stroke-width="2.4" fill="#1d1e26" />`
  }
  for (let y = top + 10; y < H - 6; y += 12)
    for (const x of [6, W - 6]) fence += `<path d="M${x} ${r1(y)} v10" stroke="#1d1e26" stroke-width="2.4" />`
  return svg(W, H, `<rect x="4" y="${r1(top + 4)}" width="${r1(W - 8)}" height="${r1(H - top - 8)}" rx="6" fill="#33402a" />`
    + `<rect x="4" y="${r1(top + 4)}" width="${r1(W - 8)}" height="${r1(H - top - 8)}" rx="6" fill="#1d1e26" opacity=".2" />`
    + `<path d="M${r1(W - 30)} ${r1(top + 40)} q-6 -24 4 -44 M${r1(W - 28)} ${r1(top + 6)} q10 -6 16 -2 M${r1(W - 27)} ${r1(top + 14)} q-12 -4 -16 -12" stroke="${WOOD.dark}" stroke-width="5" fill="none" stroke-linecap="round" />`
    + `<g transform="rotate(${r1(4 * wear)} ${r1(W / 2)} ${r1(top + 28)})"><rect x="${r1(W / 2 - 4)}" y="4" width="8" height="${r1(top + 24)}" fill="#5a4c40" /><rect x="${r1(W / 2 - 14)}" y="14" width="28" height="8" fill="#5a4c40" /></g>`
    + stones + mound
    + `<path d="M6 ${r1(H - 26)} H${r1(gateL)} M${r1(gateR)} ${r1(H - 26)} H${r1(W - 6)} M6 ${r1(top + 10)} H${r1(W - 6)}" stroke="#1d1e26" stroke-width="3" />`
    + fence
    + `<path d="M${r1(gateL)} ${r1(H - 4)} V${r1(H - 40)} M${r1(gateR)} ${r1(H - 4)} V${r1(H - 40)}" stroke="#1d1e26" stroke-width="4" />`
    + `<circle cx="${r1(gateR + 10)}" cy="${r1(H - 40)}" r="13" fill="${GLOW.warm}" opacity=".25" />`
    + `<rect x="${r1(gateR + 5)}" y="${r1(H - 48)}" width="10" height="14" rx="2" fill="${GLOW.core}" stroke="#1d1e26" stroke-width="1.5" />`)
}

/* ---------- Ворота ---------- */

/** Высота спрайта ворот в клетках: столбы и перекладина поднимаются над нижним рядом карты. */
export const GATE_H = 2.3

/**
 * Ворота на выход из поселения (`w` клеток): тяжёлые столбы, обитые железом створки (приоткрыты), перекладина
 * с черепом-вывеской, колья наружу и следы когтей. За воротами — туман и тёмная дорога. Низ — низ ряда ворот.
 */
export function villageGateSvg(w: number): string {
  const rnd = noise(61)
  const W = w * VT
  const H = VT * GATE_H
  const postW = 24
  const lx = VT * 0.28
  const rx = W - VT * 0.28 - postW
  const top = 28
  const beamY = top - 4
  const inner = lx + postW
  const innerR = rx
  let stakes = ""
  for (const [from, to] of [[0, lx], [rx + postW, W]] as const) {
    for (let x = from; x < to - 4; x += 10) stakes += stake(x, 10, H - 70 + rnd() * 10, H - 6, rnd)
  }
  const post = (x: number) => `<rect x="${r1(x)}" y="${top}" width="${postW}" height="${r1(H - top - 4)}" rx="3" fill="${WOOD.mid}" stroke="${WOOD.grain}" stroke-width="1.6" />`
    + `<rect x="${r1(x + 3)}" y="${top}" width="5" height="${r1(H - top - 4)}" fill="${WOOD.light}" opacity=".5" />`
    + `<rect x="${r1(x - 2)}" y="${r1(top + 28)}" width="${postW + 4}" height="8" fill="${IRON.mid}" stroke="${IRON.dark}" stroke-width="1.2" />`
    + `<rect x="${r1(x - 2)}" y="${r1(H - 44)}" width="${postW + 4}" height="8" fill="${IRON.mid}" stroke="${IRON.dark}" stroke-width="1.2" />`
    + `<path d="M${r1(x + 6)} ${r1(top + 34)} l10 6" stroke="${IRON.rust}" stroke-width="2.4" opacity=".7" />`
    + `<path d="M${r1(x)} ${top} l${postW / 2} -12 l${postW / 2} 12 Z" fill="${WOOD.light}" stroke="${WOOD.grain}" stroke-width="1.4" />`
  const lantern = (x: number) => `<line x1="${r1(x)}" y1="${r1(top + 40)}" x2="${r1(x)}" y2="${r1(top + 48)}" stroke="${IRON.dark}" stroke-width="1.5" />`
    + `<circle cx="${r1(x)}" cy="${r1(top + 56)}" r="13" fill="${GLOW.warm}" opacity=".3" />`
    + `<rect x="${r1(x - 5)}" y="${r1(top + 48)}" width="10" height="14" rx="2" fill="${GLOW.core}" stroke="${IRON.dark}" stroke-width="1.5" />`
  // створки приоткрыты внутрь: доски, железные полосы, царапины
  const door = (x0: number, dir: 1 | -1) => {
    const x1 = x0 + dir * 24
    let planks = ""
    for (let i = 1; i < 4; i++) {
      const x = x0 + ((x1 - x0) * i) / 4
      planks += `<line x1="${r1(x)}" y1="${r1(top + 26 + i * 2)}" x2="${r1(x)}" y2="${r1(H - 10 + i)}" stroke="${WOOD.grain}" stroke-width="1.2" />`
    }
    return `<path d="M${r1(x0)} ${r1(top + 22)} L${r1(x1)} ${r1(top + 32)} L${r1(x1)} ${r1(H - 6)} L${r1(x0)} ${r1(H - 12)} Z" fill="${WOOD.mid}" stroke="${WOOD.grain}" stroke-width="1.5" />`
      + planks
      + `<path d="M${r1(x0)} ${r1(top + 40)} L${r1(x1)} ${r1(top + 48)} M${r1(x0)} ${r1(H - 30)} L${r1(x1)} ${r1(H - 22)}" stroke="${IRON.mid}" stroke-width="4" />`
      + claws(Math.min(x0, x1) + 6, top + 56, 0.7)
  }
  const signW = Math.min(W * 0.62, 132)
  let fog = ""
  for (let i = 0; i < 3; i++) fog += `<ellipse cx="${r1(inner + 20 + i * 34)}" cy="${r1(top + 36 + i * 6)}" rx="26" ry="6" fill="#8a94a6" opacity=".22" />`
  return svg(W, H, `<ellipse cx="${r1(W / 2 + 6)}" cy="${r1(H - 3)}" rx="${r1(W * 0.5)}" ry="7" fill="#000" opacity=".35" />`
    // за воротами: тёмный луг, туман и дорога вдаль
    + `<rect x="${r1(inner)}" y="${r1(top + 18)}" width="${r1(innerR - inner)}" height="${r1(H - top - 22)}" fill="#1f2a1c" />`
    + `<path d="M${r1(W / 2 - 26)} ${r1(H - 4)} L${r1(W / 2 - 6)} ${r1(top + 20)} H${r1(W / 2 + 6)} L${r1(W / 2 + 26)} ${r1(H - 4)} Z" fill="${MUD.dark}" />`
    + fog
    + stakes
    + door(inner, 1) + door(innerR, -1)
    + post(lx) + post(rx)
    + lantern(lx - 6) + lantern(rx + postW + 6)
    + `<rect x="${r1(lx - 10)}" y="${r1(beamY)}" width="${r1(rx + postW - lx + 20)}" height="14" rx="3" fill="${WOOD.mid}" stroke="${WOOD.grain}" stroke-width="2" />`
    + `<rect x="${r1(lx - 10)}" y="${r1(beamY + 2)}" width="${r1(rx + postW - lx + 20)}" height="4" rx="2" fill="${WOOD.pale}" opacity=".4" />`
    + `<line x1="${r1(W / 2 - signW / 2 + 10)}" y1="${r1(beamY + 14)}" x2="${r1(W / 2 - signW / 2 + 10)}" y2="${r1(beamY + 22)}" stroke="${IRON.dark}" stroke-width="2" />`
    + `<line x1="${r1(W / 2 + signW / 2 - 10)}" y1="${r1(beamY + 14)}" x2="${r1(W / 2 + signW / 2 - 10)}" y2="${r1(beamY + 22)}" stroke="${IRON.dark}" stroke-width="2" />`
    + `<rect x="${r1(W / 2 - signW / 2)}" y="${r1(beamY + 21)}" width="${r1(signW)}" height="24" rx="3" fill="#b8a98a" stroke="${WOOD.dark}" stroke-width="2.5" />`
    + `<path d="M${r1(W / 2 - 12)} ${r1(beamY + 26)} l24 14 M${r1(W / 2 + 12)} ${r1(beamY + 26)} l-24 14" stroke="#6a1e1a" stroke-width="3" stroke-linecap="round" />`)
}

/* ---------- Полигон ---------- */

/** Высота спрайта полигона в клетках (над нижним краем участка поднимаются мишень и чучела). */
export const TRAINING_H = 2.4

/**
 * Тренировочный полигон на `w` клеток: утоптанная грязная площадка за изгородью, два чучела, мишень со стрелами,
 * стойка с деревянным оружием и флажок. Износ `wear`: штакетины выпадают, чучела рваные, флажок — лоскут.
 * Низ спрайта — нижний край участка.
 */
export function villageTrainingSvg(w: number, wear = 0.6): string {
  const rnd = noise(81)
  const W = w * VT
  const H = TRAINING_H * VT
  const yardTop = H - 74
  const dummy = (x: number, tilt: number) => `<g transform="rotate(${tilt} ${r1(x)} ${r1(H - 10)})">`
    + `<rect x="${r1(x - 3)}" y="${r1(H - 92)}" width="6" height="84" fill="${WOOD.mid}" />`
    + `<rect x="${r1(x - 24)}" y="${r1(H - 74)}" width="48" height="6" rx="2" fill="${WOOD.mid}" />`
    + `<ellipse cx="${r1(x)}" cy="${r1(H - 52)}" rx="15" ry="22" fill="#a8935e" stroke="#6a5a34" stroke-width="2" />`
    + `<path d="M${r1(x - 13)} ${r1(H - 58)} h26 M${r1(x - 14)} ${r1(H - 46)} h28" stroke="#6a5a34" stroke-width="2" />`
    + (wear > 0.4 ? `<path d="M${r1(x + 4)} ${r1(H - 50)} l8 4 l-3 6 l6 3" stroke="#c9b680" stroke-width="2" fill="none" />` : "")
    + `<rect x="${r1(x - 7)}" y="${r1(H - 66)}" width="12" height="9" fill="#5a4a3a" opacity=".8" transform="rotate(12 ${r1(x)} ${r1(H - 62)})" />`
    + `<circle cx="${r1(x)}" cy="${r1(H - 92)}" r="12" fill="#b8a46e" stroke="#6a5a34" stroke-width="2" />`
    + `<path d="M${r1(x - 5)} ${r1(H - 95)} l3 3 m0 -3 l-3 3 M${r1(x + 2)} ${r1(H - 95)} l3 3 m0 -3 l-3 3" stroke="#2a1d10" stroke-width="1.6" />`
    + `<path d="M${r1(x - 8)} ${r1(H - 102)} q8 -8 16 0" stroke="#8a7a4a" stroke-width="3" fill="none" />`
    + "</g>"
  const tx = W * 0.5
  const arrow = (dx: number, dy: number, a: number) => `<path d="M${r1(tx + dx)} ${r1(H - 86 + dy)} l${r1(Math.cos(a) * 22)} ${r1(Math.sin(a) * 22)}" stroke="${WOOD.mid}" stroke-width="2.2" />`
    + `<path d="M${r1(tx + dx + Math.cos(a) * 22)} ${r1(H - 86 + dy + Math.sin(a) * 22)} l3 -4 m-3 4 l-1 -5" stroke="#c9c2a8" stroke-width="1.8" />`
  const target = `<path d="M${r1(tx - 18)} ${r1(H - 8)} L${r1(tx)} ${r1(H - 70)} L${r1(tx + 18)} ${r1(H - 8)} M${r1(tx)} ${r1(H - 70)} V${r1(H - 6)}" stroke="${WOOD.dark}" stroke-width="4" fill="none" />`
    + `<circle cx="${r1(tx)}" cy="${r1(H - 86)}" r="26" fill="#b8b0a0" stroke="${WOOD.dark}" stroke-width="3" />`
    + `<circle cx="${r1(tx)}" cy="${r1(H - 86)}" r="19" fill="#8a2a26" />`
    + `<circle cx="${r1(tx)}" cy="${r1(H - 86)}" r="12" fill="#b8b0a0" />`
    + `<circle cx="${r1(tx)}" cy="${r1(H - 86)}" r="6" fill="#8a2a26" />`
    + `<path d="M${r1(tx - 14)} ${r1(H - 100)} l10 8 l-4 6" stroke="#4a3a2a" stroke-width="1.4" fill="none" />`
    + arrow(4, -2, -0.45) + arrow(-8, 6, -0.9)
  const rx = W - 58
  const rack = `<rect x="${r1(rx)}" y="${r1(H - 64)}" width="44" height="6" fill="${WOOD.mid}" />`
    + `<rect x="${r1(rx)}" y="${r1(H - 30)}" width="44" height="6" fill="${WOOD.mid}" />`
    + `<path d="M${r1(rx + 2)} ${r1(H - 8)} V${r1(H - 70)} M${r1(rx + 42)} ${r1(H - 8)} V${r1(H - 70)}" stroke="${WOOD.dark}" stroke-width="5" />`
    + `<path d="M${r1(rx + 12)} ${r1(H - 26)} V${r1(H - 84)} M${r1(rx + 22)} ${r1(H - 26)} V${r1(H - 90)} M${r1(rx + 32)} ${r1(H - 26)} V${r1(H - 80)}" stroke="${WOOD.pale}" stroke-width="4" stroke-linecap="round" />`
    + `<path d="M${r1(rx + 6)} ${r1(H - 74)} h12 M${r1(rx + 16)} ${r1(H - 80)} h12 M${r1(rx + 26)} ${r1(H - 70)} h12" stroke="${WOOD.mid}" stroke-width="3" />`
  let fence = ""
  for (let x = 6; x <= W - 6; x += 22) {
    if (rnd() < wear * 0.3) continue
    fence += `<rect x="${r1(x - 3)}" y="${r1(yardTop - 18)}" width="6" height="26" rx="1" fill="${WOOD.mid}" stroke="${WOOD.grain}" stroke-width="1" transform="rotate(${r1((rnd() - 0.5) * 14 * wear)} ${r1(x)} ${r1(yardTop + 8)})" />`
  }
  fence += `<path d="M4 ${r1(yardTop - 12)} H${r1(W * (wear > 0.6 ? 0.55 : 1) - 4)} M4 ${r1(yardTop - 2)} H${r1(W - 4)}" stroke="${WOOD.dark}" stroke-width="3.4" />`
  if (wear > 0.6) fence += `<path d="M${r1(W * 0.55)} ${r1(yardTop - 12)} l18 10" stroke="${WOOD.dark}" stroke-width="3.4" />`
  let puddles = ""
  for (let i = 0; i < 2; i++)
    puddles += `<ellipse cx="${r1(40 + rnd() * (W - 80))}" cy="${r1(H - 16 - rnd() * 30)}" rx="${r1(12 + rnd() * 10)}" ry="4" fill="#2e3440" opacity=".7" />`
  const flag = `<rect x="14" y="${r1(H - 130)}" width="4" height="124" fill="${WOOD.dark}" />`
    + (wear > 0.5
      ? `<path d="M18 ${r1(H - 128)} h22 l-6 6 l5 4 l-8 3 l4 5 h-17 Z" fill="#7a2a26" />`
      : `<path d="M18 ${r1(H - 128)} h30 l-8 10 l8 10 h-30 Z" fill="#7a2a26" stroke="#4a1a16" stroke-width="1.5" />`)
  return svg(W, H, `<ellipse cx="${r1(W / 2 + 6)}" cy="${r1(H - 6)}" rx="${r1(W * 0.5)}" ry="12" fill="#000" opacity=".3" />`
    + `<rect x="4" y="${r1(yardTop)}" width="${r1(W - 8)}" height="${r1(H - yardTop - 4)}" rx="14" fill="${MUD.base}" />`
    + `<rect x="4" y="${r1(yardTop)}" width="${r1(W - 8)}" height="${r1(H - yardTop - 4)}" rx="14" fill="${MUD.dark}" opacity=".35" />`
    + `<path d="M30 ${r1(H - 30)} q40 -10 80 0 M${r1(W - 120)} ${r1(H - 44)} q30 -8 60 0" stroke="${MUD.light}" stroke-width="3" fill="none" opacity=".6" />`
    + puddles + fence + flag + dummy(W * 0.2 + 18, -4 - wear * 6) + dummy(W * 0.34 + 14, 5 + wear * 4) + target + rack)
}

/* ---------- Пустой участок ---------- */

/** Высота спрайта пустого участка в клетках. */
export const PLOT_H = 1.3

/**
 * Пустой участок: развалины прежнего дома — обгорелые брёвна, кирпичи, колышки с бечёвкой под новую стройку
 * и стопка досок. `reserved` — участок на будущее: только развалины.
 */
export function villagePlotSvg(w: number, reserved = false): string {
  const rnd = noise(w * 7 + (reserved ? 1 : 0))
  const W = w * VT
  const H = PLOT_H * VT
  const top = 18
  const stake = (x: number, y: number) => `<path d="M${r1(x - 3)} ${r1(y)} V${r1(y - 22)} l3 -6 l3 6 V${r1(y)} Z" fill="${reserved ? WOOD.dark : WOOD.light}" stroke="${WOOD.grain}" stroke-width="1.4" />`
  const corners: [number, number][] = [[14, H - 22], [W - 14, H - 22], [26, top + 22], [W - 26, top + 22]]
  const rope = reserved
    ? ""
    : `<path d="M14 ${r1(H - 40)} L26 ${r1(top + 4)} L${r1(W - 26)} ${r1(top + 4)} L${r1(W - 14)} ${r1(H - 40)} Z" stroke="#b8a98a" stroke-width="2" fill="none" stroke-dasharray="6 4" />`
  let ruins = ""
  for (let i = 0; i < 3; i++) {
    const x = 30 + rnd() * (W - 90)
    const y = top + 20 + rnd() * (H - top - 40)
    const a = (rnd() - 0.5) * 50
    ruins += `<g transform="rotate(${r1(a)} ${r1(x + 24)} ${r1(y)})"><rect x="${r1(x)}" y="${r1(y - 4)}" width="48" height="8" rx="3" fill="#2a221c" />`
      + `<path d="M${r1(x + 4)} ${r1(y - 2)} h20" stroke="#4a3a2e" stroke-width="2" /><circle cx="${r1(x + 44)}" cy="${r1(y)}" r="3" fill="#7a3a1a" opacity=".6" /></g>`
  }
  for (let i = 0; i < 6; i++)
    ruins += `<rect x="${r1(20 + rnd() * (W - 40))}" y="${r1(top + 14 + rnd() * (H - top - 30))}" width="8" height="5" fill="#6a4a3e" stroke="#3a2a22" stroke-width="1" transform="rotate(${r1((rnd() - 0.5) * 60)} ${r1(W / 2)} ${r1(H / 2)})" />`
  const planks = reserved
    ? ""
    : `<rect x="${r1(W * 0.58)}" y="${r1(H - 40)}" width="60" height="9" rx="2" fill="${WOOD.light}" stroke="${WOOD.grain}" stroke-width="1.4" />`
      + `<rect x="${r1(W * 0.58 + 6)}" y="${r1(H - 49)}" width="56" height="9" rx="2" fill="${WOOD.pale}" stroke="${WOOD.grain}" stroke-width="1.4" />`
      + `<rect x="${r1(W * 0.58 + 2)}" y="${r1(H - 58)}" width="50" height="9" rx="2" fill="${WOOD.light}" stroke="${WOOD.grain}" stroke-width="1.4" />`
      + `<path d="M${r1(W * 0.3)} ${r1(H - 30)} l22 -16" stroke="${WOOD.mid}" stroke-width="4" stroke-linecap="round" />`
      + `<rect x="${r1(W * 0.3 + 16)}" y="${r1(H - 56)}" width="16" height="9" rx="2" fill="${IRON.mid}" transform="rotate(-36 ${r1(W * 0.3 + 24)} ${r1(H - 51)})" />`
  return svg(W, H, `<ellipse cx="${r1(W / 2)}" cy="${r1((H + top) / 2)}" rx="${r1(W / 2 - 4)}" ry="${r1((H - top) / 2 - 2)}" fill="${reserved ? "#3a3128" : MUD.base}" />`
    + `<ellipse cx="${r1(W / 2)}" cy="${r1((H + top) / 2)}" rx="${r1(W / 2 - 18)}" ry="${r1((H - top) / 2 - 10)}" fill="#000" opacity=".2" />`
    + ruins + rope + corners.map(([x, y]) => stake(x, y)).join("") + planks)
}

/**
 * Свет из окон здания, когда в нём есть что-то новое (вместо значка «!»): слой того же размера и наклона, что и
 * спрайт здания уровня `level`, — яркие окна (свет пробивается и сквозь доски), щель двери и лучи на землю.
 * У Кладбища загорается фонарь у калитки. У Полигона и Бара окон нет и «нового» не бывает — `null`.
 * Сцена кладёт слой поверх здания с блендингом ADD и плавно пульсирует им.
 */
export function villageBuildingLightSvg(id: BuildingId, w: number, h: number, level: number): string | null {
  const wear = buildingWear(level)
  if (id === "graveyard") {
    const W = w * VT
    const H = (h + GRAVEYARD_H_OVER) * VT
    const lx = W / 2 + 22 + 10
    const ly = H - 40
    return svg(W, H, `<defs><radialGradient id="lg"><stop offset="0" stop-color="${GLOW.core}" stop-opacity=".9" /><stop offset=".45" stop-color="${GLOW.warm}" stop-opacity=".45" /><stop offset="1" stop-color="${GLOW.warm}" stop-opacity="0" /></radialGradient></defs>`
      + `<circle cx="${r1(lx)}" cy="${r1(ly)}" r="58" fill="url(#lg)" />`
      + `<rect x="${r1(lx - 5)}" y="${r1(ly - 8)}" width="10" height="14" rx="2" fill="${GLOW.core}" />`)
  }
  if (id !== "barracks" && id !== "store") return null
  const W = w * VT
  const H = (h + HOUSE_ROOF_OVER) * VT
  const cx = W / 2
  const facadeTop = H - VT * 1.7
  const doorW = VT * 0.62
  const doorH = VT * 1.02
  const doorX = cx - doorW / 2
  const doorY = H - doorH
  const winY = facadeTop + 22
  // Наклон и сжатие — как у дома (`villageHouseSvg`), иначе окна разъедутся
  const lean = (id === "barracks" ? -1 : 1) * (1 + wear * 4)
  const fitX = (W - 40) / W
  const win = (x: number): string =>
    `<circle cx="${r1(x + 17)}" cy="${r1(winY + 14)}" r="40" fill="url(#halo)" />`
    + `<path d="M${r1(x + 2)} ${r1(winY + 26)} H${r1(x + 32)} L${r1(x + 46)} ${r1(H - 2)} H${r1(x - 12)} Z" fill="url(#beam)" />`
    + `<rect x="${r1(x + 2)}" y="${r1(winY + 2)}" width="30" height="24" fill="${GLOW.core}" opacity=".95" />`
  const light = win(cx - doorW / 2 - 60) + win(cx + doorW / 2 + 26)
    + `<rect x="${r1(doorX + doorW * 0.3)}" y="${r1(doorY + 4)}" width="3" height="${r1(doorH - 8)}" fill="${GLOW.core}" opacity=".9" />`
    + `<rect x="${r1(doorX + doorW * 0.64)}" y="${r1(doorY + 4)}" width="3" height="${r1(doorH - 8)}" fill="${GLOW.core}" opacity=".9" />`
  return svg(W, H, `<defs>`
    + `<radialGradient id="halo"><stop offset="0" stop-color="${GLOW.core}" stop-opacity=".7" /><stop offset=".5" stop-color="${GLOW.warm}" stop-opacity=".3" /><stop offset="1" stop-color="${GLOW.warm}" stop-opacity="0" /></radialGradient>`
    + `<linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${GLOW.warm}" stop-opacity=".55" /><stop offset="1" stop-color="${GLOW.warm}" stop-opacity="0" /></linearGradient>`
    + `</defs><g transform="translate(${r1(cx)} ${r1(H)}) skewX(${r1(lean)}) scale(${Math.round(fitX * 1000) / 1000} 1) translate(${r1(-cx)} ${r1(-H)})">${light}</g>`)
}

/** Цвет здания: крыша домиков (у Полигона — тёмное дерево, у Кладбища — камень). */
export const BUILDING_TRIM: Record<BuildingId, string> = {
  barracks: "#5e3a2e",
  store: "#3b4a3c",
  tavern: "#4a3a52",
  training: "#6a4a2a",
  graveyard: "#4c505a"
}

/** Знак на табличке стройки: можно строить (молоток), пока нельзя (замок), участок под будущее (крест). */
export type StakeSignKind = "build" | "locked" | "reserved"

/**
 * Табличка, вбитая в землю у непостроенного участка (60 × 72): столбик в грязи, доска на гвоздях и выжженный знак.
 * Тап по ней открывает карточку участка: что здесь можно построить и за сколько.
 */
export function villageStakeSignSvg(kind: StakeSignKind): string {
  const mark = kind === "build"
    // молоток
    ? `<path d="M33 16 L22 30" stroke="${WOOD.grain}" stroke-width="4" stroke-linecap="round" /><path d="M28 10 L40 18 L36 23 L24 15 Z" fill="${WOOD.grain}" />`
    : kind === "locked"
      // замок
      ? `<path d="M24 20 V16 a6 6 0 0 1 12 0 V20" stroke="${WOOD.grain}" stroke-width="3" fill="none" /><rect x="21" y="19" width="18" height="13" rx="2" fill="${WOOD.grain}" /><circle cx="30" cy="25" r="1.8" fill="${WOOD.pale}" />`
      // крест из досок
      : `<path d="M22 12 L38 30 M38 12 L22 30" stroke="${WOOD.grain}" stroke-width="4" stroke-linecap="round" />`
  return svg(60, 72, `<ellipse cx="30" cy="67" rx="14" ry="4" fill="${MUD.dark}" opacity=".8" />`
    + `<path d="M26.5 34 H33.5 V64 L30 69 L26.5 64 Z" fill="${WOOD.dark}" stroke="${WOOD.grain}" stroke-width="1.6" />`
    + `<g transform="rotate(-4 30 21)"><rect x="6" y="6" width="48" height="31" rx="3" fill="#000" opacity=".25" transform="translate(2 2)" />`
    + `<rect x="6" y="6" width="48" height="31" rx="3" fill="${WOOD.pale}" stroke="${WOOD.grain}" stroke-width="2" />`
    + `<path d="M8 17 H52 M8 27 H52" stroke="${WOOD.light}" stroke-width="1.2" />`
    + `<circle cx="11" cy="11" r="1.6" fill="${IRON.mid}" /><circle cx="49" cy="11" r="1.6" fill="${IRON.mid}" /><circle cx="11" cy="32" r="1.6" fill="${IRON.mid}" /><circle cx="49" cy="32" r="1.6" fill="${IRON.mid}" />`
    + `${mark}</g>`)
}

/**
 * Спрайт здания на участке `w × h` клеток на уровне `level`: чем выше уровень, тем меньше разбито (`buildingWear`),
 * но целым не бывает. Исчерпывающий `switch` — новое здание без арта не скомпилируется.
 */
export function villageBuildingSvg(id: BuildingId, w: number, h: number, level: number): string {
  const wear = buildingWear(level)
  switch (id) {
    case "barracks":
      return villageHouseSvg({ w, h, roof: BUILDING_TRIM.barracks, wall: "#7d6a52", npc: "barracks", wear })
    case "store":
      return villageHouseSvg({ w, h, roof: BUILDING_TRIM.store, wall: "#857256", npc: "store", wear })
    case "training":
      return villageTrainingSvg(w, wear)
    case "graveyard":
      return villageGraveyardSvg(w, h, wear)
    case "tavern":
      return villageHouseSvg({ w, h, roof: BUILDING_TRIM.tavern, wall: "#7a6448", npc: "tavern", wear })
  }
}
