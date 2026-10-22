/**
 * Фоны кинематика: половина сцены за бойцом. Зависят от биома и клетки, на которой стоит боец.
 * viewBox 0 0 200 300, земля начинается на y≈156 (0.52 высоты), лапы бойца на y≈186.
 */
import type { TerrainId } from "@game/core/types"
import { biomeDef } from "@game/content/biomes"
import { hex, shade } from "./palettes"

export type Side = "left" | "right"

const W = 200
const H = 300
const HORIZON = 156
const FEET = 186

interface Ctx {
  biome: ReturnType<typeof biomeDef>
  terrain: TerrainId
  side: Side
  /** Горизонтальная позиция бойца внутри половины. */
  x: number
  id: string
}

/* ---------- Мелкие помощники для новых биомов ---------- */

/** Ель из трёх ярусов со стволиком: основание на `base`, высота `h`, ширина нижнего яруса ≈ `w`. */
function spruce(cx: number, base: number, h: number, w: number, fill: string, stroke = "none"): string {
  const tiers = [0, 1, 2].map(i => {
    const top = base - h + i * h * 0.24
    const bw = w * (0.55 + i * 0.22)
    return `<path d="M${cx} ${top} L${cx + bw / 2} ${top + h * 0.42} H${cx - bw / 2} Z" />`
  })
  return `<g fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round"><rect x="${cx - w * 0.06}" y="${base - h * 0.2}" width="${w * 0.12}" height="${h * 0.2}" fill="#3a2616" />${tiers.join("")}</g>`
}

/** Папоротник: веер вытянутых листьев из точки `base`. */
function fern(cx: number, base: number, len: number, fill: string): string {
  const leaves = [-62, -34, -10, 14, 40, 64].map((a, i) => {
    const l = len * (i % 2 ? 0.85 : 1)
    const r = (a * Math.PI) / 180
    const ex = cx + Math.sin(r) * l * 0.5
    const ey = base - Math.cos(r) * l * 0.5
    return `<ellipse cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" rx="${(l * 0.16).toFixed(1)}" ry="${(l / 2).toFixed(1)}" transform="rotate(${a} ${ex.toFixed(1)} ${ey.toFixed(1)})" />`
  })
  return `<g fill="${fill}" stroke="${shade(fill, -0.35)}" stroke-width="1">${leaves.join("")}</g>`
}

/** Кость: палочка с парой шишечек на концах. */
function bone(x1: number, y1: number, x2: number, y2: number, w: number): string {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1
  const nx = (-(y2 - y1) / len) * w * 0.45
  const ny = ((x2 - x1) / len) * w * 0.45
  const knobs = [
    [x1 + nx, y1 + ny],
    [x1 - nx, y1 - ny],
    [x2 + nx, y2 + ny],
    [x2 - nx, y2 - ny]
  ]
  const k = (sw: number, fill: string): string => knobs.map(([kx, ky]) => `<circle cx="${kx!.toFixed(1)}" cy="${ky!.toFixed(1)}" r="${(w * 0.6 + sw).toFixed(1)}" fill="${fill}" />`).join("")
  return `<g>${k(1.4, "#7a7262")}<path d="M${x1} ${y1} L${x2} ${y2}" stroke="#7a7262" stroke-width="${w + 2.8}" stroke-linecap="round" />${k(0, "#e6dfc8")}<path d="M${x1} ${y1} L${x2} ${y2}" stroke="#e6dfc8" stroke-width="${w}" stroke-linecap="round" /></g>`
}

/** Жёлто-чёрная предупреждающая полоса. */
function hazard(id: string, x: number, y: number, w: number, h: number): string {
  const n = Math.ceil((w + h) / 12)
  return `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" /></clipPath><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#f0c020" stroke="#6a5208" stroke-width="1" /><g clip-path="url(#${id})" fill="#1e1e1e">${Array.from({ length: n }, (_, i) => `<path d="M${x - h + i * 12} ${y + h} l${h} -${h} h6 l-${h} ${h} z" />`).join("")}</g>`
}

/** Кабель/шланг с тёмной обводкой. */
function cable(d: string, color: string, w: number): string {
  return `<path d="${d}" fill="none" stroke="${shade(color, -0.5)}" stroke-width="${w + 3}" stroke-linecap="round" /><path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" /><path d="${d}" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity=".3" transform="translate(-1 -1.5)" />`
}

/** Жёлтая бочка со знаком радиации; `by` — низ бочки. */
function barrel(bx: number, by: number, w: number, h: number): string {
  const cy = by - h * 0.52
  const wedge = (a: number): string => {
    const r1 = ((a - 30) * Math.PI) / 180
    const r2 = ((a + 30) * Math.PI) / 180
    return `<path d="M${bx} ${cy} L${(bx + Math.cos(r1) * 9).toFixed(1)} ${(cy + Math.sin(r1) * 9).toFixed(1)} A9 9 0 0 1 ${(bx + Math.cos(r2) * 9).toFixed(1)} ${(cy + Math.sin(r2) * 9).toFixed(1)} Z" />`
  }
  return `<g><rect x="${bx - w / 2}" y="${by - h}" width="${w}" height="${h}" rx="4" fill="#c9a227" stroke="#6a4e0c" stroke-width="2" /><rect x="${bx - w / 2 + 4}" y="${by - h + 4}" width="6" height="${h - 8}" rx="3" fill="#f0d060" opacity=".7" /><g stroke="#8a6a12" stroke-width="2.4"><path d="M${bx - w / 2} ${by - h * 0.22} h${w} M${bx - w / 2} ${by - h * 0.82} h${w}" /></g><ellipse cx="${bx}" cy="${by - h}" rx="${w / 2}" ry="5" fill="#e0bc3a" stroke="#6a4e0c" stroke-width="2" /><circle cx="${bx}" cy="${cy}" r="10.5" fill="#f4d23a" stroke="#1e1e1e" stroke-width="1.2" /><g fill="#1e1e1e">${[-90, 30, 150].map(wedge).join("")}</g><circle cx="${bx}" cy="${cy}" r="3.4" fill="#f4d23a" /><circle cx="${bx}" cy="${cy}" r="2" fill="#1e1e1e" /></g>`
}

function defs(ctx: Ctx): string {
  const b = ctx.biome.id
  const grad: Record<string, [string, string]> = {
    deep_forest: ["#12281a", "#4a6e44"],
    indoors: ["#ead7b0", "#f6e8cc"],
    factory: ["#353b43", "#68707a"],
    infested: ["#24193a", "#5e7a46"],
    yard: ["#bfe3ff", "#eef9ff"],
    roofs: ["#5d3f8a", "#ff9a6b"],
    basement: ["#2a2530", "#3d3640"],
    dump: ["#b9b59a", "#eae4c6"],
    winter_park: ["#b9d6ee", "#f3f8fc"],
    jungle: ["#3f8f6a", "#bfe8a0"],
    desert: ["#ffd27a", "#fff2cc"],
    glacier: ["#1b3a6b", "#bfe3ff"],
    canyon: ["#5a2e6b", "#ff9a5c"]
  }
  const [top, bottom] = grad[b] ?? grad["yard"]!
  return `<defs>
    <linearGradient id="${ctx.id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}" /><stop offset="1" stop-color="${bottom}" /></linearGradient>
    <radialGradient id="${ctx.id}-glow" cx="50%" cy="20%" r="70%"><stop offset="0" stop-color="#fff2b0" stop-opacity=".9" /><stop offset="1" stop-color="#fff2b0" stop-opacity="0" /></radialGradient>
  </defs>`
}

function sky(ctx: Ctx): string {
  const b = ctx.biome.id
  let far = ""
  switch (b) {
    case "yard":
      far = `<circle cx="${ctx.side === "left" ? 40 : 160}" cy="40" r="18" fill="#fff1a8" opacity=".9" />
        <g fill="#fff" opacity=".85"><ellipse cx="120" cy="52" rx="26" ry="9" /><ellipse cx="132" cy="46" rx="16" ry="9" /><ellipse cx="60" cy="84" rx="22" ry="7" /></g>
        <path d="M-10 ${HORIZON} h220" stroke="#8fbf5a" stroke-width="2" />
        <g fill="#c99a66" stroke="#9a6d3c" stroke-width="1"><rect x="-6" y="${HORIZON - 34}" width="212" height="4" /><rect x="-6" y="${HORIZON - 16}" width="212" height="4" />${Array.from({ length: 11 }, (_, i) => `<path d="M${i * 20 - 2} ${HORIZON - 40} h12 v40 h-12 z" />`).join("")}</g>
        <g fill="#6aa84f"><ellipse cx="170" cy="${HORIZON - 48}" rx="30" ry="24" /><ellipse cx="150" cy="${HORIZON - 36}" rx="22" ry="18" /></g>`
      break
    case "roofs":
      far = `<circle cx="${ctx.side === "left" ? 150 : 50}" cy="70" r="22" fill="#ffd27a" opacity=".95" />
        <g fill="#3b2f4a"><rect x="-10" y="96" width="60" height="70" /><rect x="40" y="76" width="44" height="90" /><rect x="90" y="106" width="50" height="60" /><rect x="140" y="86" width="70" height="80" /><rect x="96" y="60" width="10" height="50" /><rect x="100" y="52" width="2" height="12" /></g>
        <g fill="#ffd27a" opacity=".8"><rect x="4" y="110" width="6" height="8" /><rect x="22" y="124" width="6" height="8" /><rect x="52" y="90" width="6" height="8" /><rect x="66" y="112" width="6" height="8" /><rect x="156" y="100" width="6" height="8" /><rect x="178" y="118" width="6" height="8" /></g>
        <g fill="none" stroke="#d8d0e6" stroke-width="2" opacity=".6"><path d="M104 50 q6 -10 2 -20 q-4 -8 2 -14" /></g>`
      break
    case "basement":
      far = `<g fill="#5a4a44">${Array.from({ length: 12 }, (_, r) => Array.from({ length: 6 }, (_, c) => `<rect x="${c * 36 + (r % 2 ? 18 : 0) - 18}" y="${r * 14}" width="34" height="12" rx="1" fill="${r % 3 === 0 ? "#63524b" : "#574640"}" stroke="#3c302c" stroke-width="1" />`).join("")).join("")}</g>
        <g stroke="#7a7f88" stroke-width="7" stroke-linecap="round"><path d="M-10 36 h220" /><path d="M-10 36 h220" stroke="#9aa0a9" stroke-width="2" /></g>
        <path d="M${ctx.x} 0 v34" stroke="#2a2530" stroke-width="2" /><path d="M${ctx.x - 10} 34 h20 l-4 10 h-12 z" fill="#4b4a3a" /><circle cx="${ctx.x}" cy="52" r="9" fill="#fff2b0" /><ellipse cx="${ctx.x}" cy="${FEET - 6}" rx="90" ry="150" fill="url(#${ctx.id}-glow)" />`
      break
    case "dump":
      far = `<g fill="#9c957f"><ellipse cx="30" cy="${HORIZON}" rx="70" ry="44" /><ellipse cx="150" cy="${HORIZON + 4}" rx="80" ry="40" /><ellipse cx="100" cy="${HORIZON + 10}" rx="40" ry="20" fill="#8a846f" /></g>
        <g fill="#2b2b2b"><circle cx="46" cy="${HORIZON - 14}" r="12" /><circle cx="46" cy="${HORIZON - 14}" r="5" fill="#9c957f" /><circle cx="160" cy="${HORIZON - 6}" r="10" /><circle cx="160" cy="${HORIZON - 6}" r="4" fill="#9c957f" /></g>
        <g fill="none" stroke="#5a5a5a" stroke-width="2" stroke-linecap="round"><path d="M120 40 q6 -6 12 0" /><path d="M136 56 q6 -6 12 0" /><path d="M60 30 q6 -6 12 0" /></g>
        <g fill="#6b6b6b" opacity=".5"><circle cx="90" cy="110" r="1.4" /><circle cx="98" cy="104" r="1.2" /><circle cx="86" cy="100" r="1.1" /></g>`
      break
    case "jungle":
      far = `<g fill="#2f6b3a" opacity=".9"><ellipse cx="30" cy="${HORIZON - 40}" rx="60" ry="46" /><ellipse cx="120" cy="${HORIZON - 56}" rx="70" ry="54" /><ellipse cx="190" cy="${HORIZON - 36}" rx="50" ry="40" /></g>
        <g fill="#3f8f45"><ellipse cx="60" cy="${HORIZON - 20}" rx="40" ry="26" /><ellipse cx="160" cy="${HORIZON - 24}" rx="44" ry="28" /></g>
        <g fill="#8c8a6a" stroke="#5a5a44" stroke-width="1.5"><rect x="80" y="${HORIZON - 70}" width="40" height="16" /><rect x="86" y="${HORIZON - 84}" width="28" height="14" /><rect x="92" y="${HORIZON - 96}" width="16" height="12" /></g>
        <g fill="none" stroke="#5a3a1c" stroke-width="3" stroke-linecap="round"><path d="M20 0 q8 40 -4 80" /><path d="M150 0 q-10 50 6 90" /><path d="M190 0 q4 30 -6 60" /></g>
        <g fill="#7bc96f"><ellipse cx="16" cy="80" rx="8" ry="4" transform="rotate(-30 16 80)" /><ellipse cx="156" cy="90" rx="8" ry="4" transform="rotate(30 156 90)" /></g>`
      break
    case "desert":
      far = `<circle cx="${ctx.side === "left" ? 150 : 50}" cy="46" r="26" fill="#ffb347" opacity=".95" />
        <g fill="#e8c784"><ellipse cx="40" cy="${HORIZON + 6}" rx="90" ry="34" /><ellipse cx="170" cy="${HORIZON + 10}" rx="80" ry="30" /></g>
        <g fill="#d9b06a"><path d="M100 ${HORIZON} l34 -54 l34 54 z" /><path d="M20 ${HORIZON} l22 -36 l22 36 z" opacity=".8" /></g>
        <g fill="#7fb069" stroke="#4f7a3e" stroke-width="1"><rect x="178" y="${HORIZON - 40}" width="8" height="40" rx="4" /><rect x="168" y="${HORIZON - 30}" width="6" height="14" rx="3" /><rect x="168" y="${HORIZON - 20}" width="12" height="5" rx="2.5" /></g>
        <g fill="none" stroke="#5a5a5a" stroke-width="1.6" stroke-linecap="round"><path d="M60 70 q5 -5 10 0" /><path d="M72 62 q5 -5 10 0" /></g>`
      break
    case "glacier":
      far = `<g fill="none" stroke-width="14" stroke-linecap="round" opacity=".35"><path d="M-10 60 q50 -40 100 -10 t120 -20" stroke="#7fffb0" /><path d="M-10 86 q60 -40 110 -14 t110 -26" stroke="#b79cff" /></g>
        <g fill="#fff" opacity=".9">${Array.from({ length: 20 }, (_, i) => `<circle cx="${(i * 47) % W}" cy="${(i * 31) % (HORIZON - 40)}" r="${1 + (i % 3) * 0.5}" />`).join("")}</g>
        <g fill="#a9d8f0" stroke="#5d9cc5" stroke-width="1.5" stroke-linejoin="round"><path d="M-6 ${HORIZON} l30 -60 l24 26 l20 -40 l30 74 z" /><path d="M120 ${HORIZON} l26 -44 l30 20 l30 -30 l10 54 z" /></g>
        <g fill="#e8f6ff" opacity=".8"><path d="M24 ${HORIZON - 60} l10 20 l-12 6 z" /><path d="M146 ${HORIZON - 44} l12 16 l-14 4 z" /></g>`
      break
    case "canyon":
      far = `<circle cx="${ctx.side === "left" ? 160 : 40}" cy="70" r="24" fill="#ffd27a" opacity=".9" />
        <g fill="#8a4a2e"><rect x="-10" y="${HORIZON - 80}" width="70" height="80" rx="8" /><rect x="90" y="${HORIZON - 60}" width="50" height="60" rx="6" /><rect x="160" y="${HORIZON - 96}" width="60" height="96" rx="8" /></g>
        <g fill="#a8603a"><rect x="40" y="${HORIZON - 50}" width="70" height="50" rx="6" /><rect x="130" y="${HORIZON - 40}" width="50" height="40" rx="6" /></g>
        <g stroke="#6e3a1f" stroke-width="2" opacity=".7"><path d="M-10 ${HORIZON - 60} h70 M-10 ${HORIZON - 40} h70 M160 ${HORIZON - 70} h60 M160 ${HORIZON - 44} h60 M40 ${HORIZON - 30} h70" /></g>
        <g fill="none" stroke="#5a5a5a" stroke-width="1.6" stroke-linecap="round"><path d="M60 40 q5 -5 10 0" /><path d="M120 54 q5 -5 10 0" /></g>`
      break
    case "deep_forest":
      // Ряды стволов уходят в сумрак, сверху — сомкнутые кроны, сквозь них косые лучи
      far = `<g fill="#21402a">${Array.from({ length: 10 }, (_, i) => `<rect x="${i * 22 - 6 + ((i * 7) % 9)}" y="0" width="${6 + (i % 3) * 2}" height="${HORIZON}" />`).join("")}</g>
        <g fill="#183420">${Array.from({ length: 6 }, (_, i) => `<rect x="${i * 38 + 4 + ((i * 11) % 13)}" y="0" width="${12 + (i % 2) * 4}" height="${HORIZON}" />`).join("")}</g>
        <g fill="#0c1f12">${Array.from({ length: 8 }, (_, i) => `<ellipse cx="${i * 30 - 10}" cy="${4 + (i % 2) * 8}" rx="28" ry="${20 + (i % 3) * 4}" />`).join("")}</g>
        <g fill="#efffc0" opacity=".13">${[34, 86, 140].map((x0, i) => `<path d="M${x0} 0 h${12 + (i % 2) * 8} L${x0 + 46 + i * 4} ${HORIZON} h-${30 + (i % 2) * 10} Z" />`).join("")}</g>
        <g fill="#cfe6b8" opacity=".14"><ellipse cx="40" cy="${HORIZON - 26}" rx="70" ry="12" /><ellipse cx="160" cy="${HORIZON - 34}" rx="70" ry="10" /></g>
        <g fill="#eaff8a">${[[52, 70], [84, 96], [128, 60], [146, 108], [70, 124], [112, 84]].map(([fx, fy], i) => `<circle cx="${fx}" cy="${fy}" r="4" opacity=".22" /><circle cx="${fx}" cy="${fy}" r="${1.2 + (i % 2) * 0.4}" />`).join("")}</g>`
      break
    case "indoors": {
      // Стена с обоями: окно с занавесками и солнцем, картина и полка с книгами, плинтус
      const wx = ctx.side === "left" ? 46 : 98
      const px = ctx.side === "left" ? 120 : 48
      const curtain = (cx: number, dir: number): string => `<path d="M${cx} 30 h${dir * 20} q${-dir * 6} 44 ${dir * 2} 62 q${-dir * 8} 12 ${-dir * 2} 34 h${-dir * 20} z" fill="#d9605a" stroke="#9a3a34" stroke-width="1.5" /><path d="M${cx + dir * 8} 34 q${-dir * 2} 40 ${dir * 2} 60 M${cx + dir * 14} 34 q${-dir * 4} 40 ${dir * 2} 58" fill="none" stroke="#b44a44" stroke-width="1.5" />`
      far = `<g fill="#e2c899" opacity=".6">${Array.from({ length: 15 }, (_, i) => `<rect x="${i * 14}" y="0" width="7" height="${HORIZON}" />`).join("")}</g>
        <g fill="#c9a26a" opacity=".55">${Array.from({ length: 15 }, (_, i) => Array.from({ length: 7 }, (_, j) => `<path d="M${i * 14 + 10.5} ${j * 22 + 18 + (i % 2) * 11} l2.4 3 l-2.4 3 l-2.4 -3 z" />`).join("")).join("")}</g>
        <rect x="-4" y="0" width="208" height="10" fill="#fff6e6" stroke="#cdb48a" stroke-width="1.5" />
        <ellipse cx="${wx + 28}" cy="78" rx="80" ry="70" fill="url(#${ctx.id}-glow)" opacity=".6" />
        <defs><linearGradient id="${ctx.id}-win" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fc6f4" /><stop offset="1" stop-color="#dff3ff" /></linearGradient></defs>
        <rect x="${wx - 4}" y="36" width="64" height="84" rx="2" fill="#fffaf0" stroke="#b89a6a" stroke-width="2" />
        <rect x="${wx}" y="40" width="56" height="76" fill="url(#${ctx.id}-win)" />
        <circle cx="${wx + 40}" cy="56" r="13" fill="#fff6c0" opacity=".5" /><circle cx="${wx + 40}" cy="56" r="8" fill="#fff1a0" />
        <ellipse cx="${wx + 16}" cy="66" rx="10" ry="4" fill="#fff" opacity=".9" />
        <g fill="#7cbf6a"><ellipse cx="${wx + 12}" cy="114" rx="18" ry="14" /><ellipse cx="${wx + 44}" cy="116" rx="16" ry="10" fill="#6aab5a" /></g>
        <path d="M${wx + 28} 40 v76 M${wx} 78 h56" stroke="#fffaf0" stroke-width="3" />
        <rect x="${wx - 8}" y="118" width="72" height="5" rx="1" fill="#fff6e6" stroke="#b89a6a" stroke-width="1.2" />
        <path d="M${wx - 16} 30 h88" stroke="#8a6a3a" stroke-width="3" stroke-linecap="round" />
        ${curtain(wx - 12, 1)}${curtain(wx + 68, -1)}
        <rect x="${px}" y="38" width="32" height="26" fill="#bfe3ff" stroke="#c9a24a" stroke-width="4" /><path d="M${px} 64 l10 -10 l8 6 l8 -9 l6 13 z" fill="#6aa84f" /><circle cx="${px + 24}" cy="46" r="3" fill="#ffd27a" />
        <rect x="${px - 4}" y="38" width="40" height="30" fill="none" stroke="#8a6a2a" stroke-width="1" />
        <g stroke="#5a3a1a" stroke-width="1"><rect x="${px + 2}" y="76" width="6" height="16" fill="#3f6fa8" /><rect x="${px + 8}" y="78" width="5" height="14" fill="#c0504a" /><rect x="${px + 13}" y="75" width="6" height="17" fill="#e0b040" /><rect x="${px + 19}" y="80" width="4" height="12" fill="#5a8a4a" transform="rotate(14 ${px + 21} 92)" /></g>
        <path d="M${px + 28} 92 l2 -8 h6 l2 8 z" fill="#c8643a" stroke="#7a3a1c" stroke-width="1" /><ellipse cx="${px + 33}" cy="82" rx="5" ry="4" fill="#4f9a4a" />
        <rect x="${px - 6}" y="92" width="48" height="4" fill="#8a5a32" stroke="#5a3a1a" stroke-width="1" /><path d="M${px} 96 v6 l6 -6 M${px + 36} 96 v6 l-6 -6" stroke="#5a3a1a" stroke-width="1.5" fill="none" />
        <rect x="-4" y="${HORIZON - 9}" width="208" height="9" fill="#8a5a32" /><path d="M-4 ${HORIZON - 9} h208" stroke="#b07a4a" stroke-width="2" />`
      break
    }
    case "factory": {
      // Цех: окна-ленты под потолком, балки, кран-балка с крюком, лампы, трубы, жёлтая полоса у пола
      const hook = ctx.side === "left" ? 64 : 136
      const lamp = (lx: number): string => `<path d="M${lx} 72 v12" stroke="#1e2226" stroke-width="1.5" /><path d="M${lx - 2} ${HORIZON} L${lx - 10} 92 h20 L${lx + 2} ${HORIZON} Z" fill="#fff2c0" opacity=".07" /><path d="M${lx - 10} 92 l4 -8 h12 l4 8 z" fill="#3a4048" stroke="#1e2226" stroke-width="1.2" /><ellipse cx="${lx}" cy="92" rx="5" ry="2.4" fill="#fff2b0" /><circle cx="${lx}" cy="94" r="10" fill="#fff2b0" opacity=".2" />`
      far = `<g stroke="#3e454e" stroke-width="1.5">${[20, 60, 100, 140, 180].map(sx => `<path d="M${sx} 60 V${HORIZON}" />`).join("")}<path d="M-4 112 h208" /></g>
        <rect x="-4" y="14" width="208" height="38" fill="#a9c0cf" />
        <g fill="#7d95a6">${[1, 4, 6, 9].map(i => `<rect x="${i * 20 - 4}" y="${i % 2 ? 14 : 33}" width="20" height="19" />`).join("")}</g>
        <rect x="-4" y="14" width="208" height="38" fill="#eaf4ff" opacity=".25" />
        <g stroke="#2a2f35" stroke-width="3">${Array.from({ length: 11 }, (_, i) => `<path d="M${i * 20 - 4} 14 v38" />`).join("")}<path d="M-4 33 h208" stroke-width="2" /></g>
        <g fill="#eaf4ff" opacity=".06">${[16, 96, 170].map(x0 => `<path d="M${x0} 52 h24 l26 ${HORIZON - 52} h-36 Z" />`).join("")}</g>
        <rect x="-4" y="0" width="208" height="14" fill="#2a2f35" /><path d="M-4 7 h208" stroke="#3e454e" stroke-width="2" />
        <rect x="-4" y="52" width="208" height="8" fill="#2a2f35" />
        <g fill="#2a2f35" stroke="#1a1d21" stroke-width="1"><rect x="32" y="0" width="12" height="${HORIZON}" /><rect x="156" y="0" width="12" height="${HORIZON}" /></g>
        <g fill="#5a636d">${[32, 156].map(cx => Array.from({ length: 8 }, (_, i) => `<circle cx="${cx + 3}" cy="${70 + i * 11}" r="1.2" /><circle cx="${cx + 9}" cy="${70 + i * 11}" r="1.2" />`).join("")).join("")}</g>
        <rect x="-4" y="62" width="208" height="10" fill="#e0b020" stroke="#7a5a10" stroke-width="1.5" />
        <path d="M-4 67 ${Array.from({ length: 21 }, (_, i) => `L${i * 10 + 1} ${i % 2 ? 63.5 : 70.5}`).join(" ")}" fill="none" stroke="#8a6a10" stroke-width="1.5" />
        <rect x="${hook - 9}" y="72" width="18" height="8" rx="1" fill="#3a4048" stroke="#1e2226" stroke-width="1" />
        <path d="M${hook} 80 V112" stroke="#1e2226" stroke-width="2" stroke-dasharray="3 1.5" />
        <path d="M${hook} 112 v6 q0 7 -6 7 q-5 0 -6 -5" fill="none" stroke="#c0392b" stroke-width="3" stroke-linecap="round" />
        ${lamp(100)}${lamp(ctx.side === "left" ? 140 : 60)}
        <g stroke-linecap="butt"><path d="M-4 124 h208" stroke="#1e2226" stroke-width="8" /><path d="M-4 124 h208" stroke="#7a8a96" stroke-width="5" /><path d="M-4 133 h208" stroke="#4a1a14" stroke-width="7" /><path d="M-4 133 h208" stroke="#a8443a" stroke-width="4" /></g>
        <g fill="#2a2f35">${[10, 90, 170].map(cx => `<rect x="${cx}" y="119" width="5" height="18" />`).join("")}</g>
        <circle cx="${ctx.side === "left" ? 120 : 80}" cy="124" r="7" fill="none" stroke="#c0392b" stroke-width="2.4" /><path d="M${ctx.side === "left" ? 113 : 73} 124 h14 M${ctx.side === "left" ? 120 : 80} 117 v14" stroke="#c0392b" stroke-width="1.6" />
        ${hazard(`${ctx.id}-hz`, -4, HORIZON - 12, 208, 12)}`
      break
    }
    case "infested":
      // Ядовитое небо, бледная луна в рваных тучах
      far = `<circle cx="${ctx.side === "left" ? 128 : 72}" cy="46" r="34" fill="#c6ff8a" opacity=".16" />
        <circle cx="${ctx.side === "left" ? 128 : 72}" cy="46" r="17" fill="#e6f7c0" />
        <g fill="#c4d89a"><circle cx="${ctx.side === "left" ? 122 : 66}" cy="42" r="4" /><circle cx="${ctx.side === "left" ? 133 : 77}" cy="53" r="3" /><circle cx="${ctx.side === "left" ? 134 : 78}" cy="38" r="2" /></g>
        <g fill="#3a2652" opacity=".85"><ellipse cx="40" cy="30" rx="50" ry="7" /><ellipse cx="${ctx.side === "left" ? 140 : 60}" cy="58" rx="44" ry="5" /><ellipse cx="170" cy="22" rx="40" ry="6" /><ellipse cx="80" cy="84" rx="60" ry="6" opacity=".7" /></g>
        <g fill="#e6f7c0" opacity=".7">${Array.from({ length: 10 }, (_, i) => `<circle cx="${(i * 43) % W}" cy="${(i * 29) % 100}" r="${0.8 + (i % 2) * 0.5}" />`).join("")}</g>
        <g fill="#9fff5a" opacity=".16"><ellipse cx="40" cy="${HORIZON - 14}" rx="80" ry="16" /><ellipse cx="170" cy="${HORIZON - 20}" rx="70" ry="14" /></g>`
      break
    default:
      far = `<g fill="#2f6b3a">${[-10, 30, 70, 110, 150, 190].map((x, i) => `<path d="M${x} ${HORIZON} l20 -${48 + (i % 2) * 14} l20 ${48 + (i % 2) * 14} z" />`).join("")}</g>
        <g fill="#3d7f49">${[10, 50, 90, 130, 170].map((x, i) => `<path d="M${x} ${HORIZON} l16 -${34 + (i % 2) * 10} l16 ${34 + (i % 2) * 10} z" />`).join("")}</g>
        <g stroke="#3b3b45" stroke-width="3"><path d="M${ctx.side === "left" ? 170 : 30} ${HORIZON} v-70" /></g><circle cx="${ctx.side === "left" ? 170 : 30}" cy="${HORIZON - 72}" r="7" fill="#ffe9a8" />
        <g fill="#fff" opacity=".9">${Array.from({ length: 26 }, (_, i) => `<circle cx="${(i * 37) % W}" cy="${(i * 53) % (HORIZON + 60)}" r="${1 + (i % 3) * 0.6}" />`).join("")}</g>`
  }
  return `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#${ctx.id}-sky)" />${far}`
}

function ground(ctx: Ctx): string {
  const c = ctx.biome.colors
  const plain = hex(c.plain)
  const base = ctx.terrain === "water" ? plain : hex(c[ctx.terrain] ?? c.plain)
  const tone = ctx.terrain === "forest" ? shade(plain, -0.12) : ctx.terrain === "cover" ? plain : base
  const groundColor
    = ctx.terrain === "wall" || ctx.terrain === "wall_breakable" || ctx.terrain === "mountain" ? plain : tone
  let texture = ""
  switch (ctx.biome.id) {
    case "yard":
      texture = `<g stroke="${shade(groundColor, -0.18)}" stroke-width="2" stroke-linecap="round">${Array.from({ length: 14 }, (_, i) => `<path d="M${(i * 29) % W} ${HORIZON + 12 + ((i * 17) % 90)} l3 -6 M${((i * 29) % W) + 4} ${HORIZON + 12 + ((i * 17) % 90)} l2 -5" />`).join("")}</g>`
      break
    case "roofs":
      texture = `<g stroke="${shade(groundColor, -0.2)}" stroke-width="1.5">${Array.from({ length: 7 }, (_, i) => `<path d="M0 ${HORIZON + 18 + i * 20} h${W}" />`).join("")}${Array.from({ length: 10 }, (_, i) => `<path d="M${i * 22} ${HORIZON} v${H}" opacity=".5" />`).join("")}</g>`
      break
    case "basement":
      texture = `<g stroke="${shade(groundColor, -0.25)}" stroke-width="1.5" fill="none"><path d="M20 ${HORIZON + 30} l30 20 l-10 30" /><path d="M150 ${HORIZON + 60} l20 20" /></g>`
      break
    case "dump":
      texture = `<g fill="${shade(groundColor, -0.2)}"><rect x="20" y="${HORIZON + 40}" width="14" height="6" transform="rotate(-15 27 ${HORIZON + 43})" /><rect x="150" y="${HORIZON + 70}" width="18" height="5" /><circle cx="110" cy="${HORIZON + 100}" r="4" /><rect x="60" y="${HORIZON + 110}" width="10" height="10" /></g>`
      break
    case "jungle":
      texture = `<g fill="none" stroke="${shade(groundColor, -0.2)}" stroke-width="2.4" stroke-linecap="round">${Array.from({ length: 10 }, (_, i) => `<path d="M${(i * 41) % W} ${HORIZON + 20 + ((i * 23) % 100)} q4 -12 10 -3 M${((i * 41) % W) + 6} ${HORIZON + 20 + ((i * 23) % 100)} q2 -14 12 -9" />`).join("")}</g>`
      break
    case "desert":
      texture = `<g fill="none" stroke="${shade(groundColor, -0.14)}" stroke-width="2" stroke-linecap="round" opacity=".8">${Array.from({ length: 6 }, (_, i) => `<path d="M-10 ${HORIZON + 24 + i * 22} q20 -8 40 0 t40 0 t40 0 t40 0 t40 0 t40 0" />`).join("")}</g>`
      break
    case "glacier":
      texture = `<g fill="none" stroke="${shade(groundColor, -0.14)}" stroke-width="1.6"><path d="M10 ${HORIZON + 30} l30 20 l-10 30 l40 40" /><path d="M150 ${HORIZON + 50} l-20 24 l30 30" /><path d="M90 ${HORIZON + 100} l20 10" /></g><g fill="#fff" opacity=".6"><ellipse cx="60" cy="${HORIZON + 80}" rx="40" ry="8" /><ellipse cx="160" cy="${HORIZON + 120}" rx="30" ry="6" /></g>`
      break
    case "canyon":
      texture = `<g fill="none" stroke="${shade(groundColor, -0.2)}" stroke-width="1.8"><path d="M0 ${HORIZON + 40} h40 l10 10 h50 l8 -8 h40" /><path d="M20 ${HORIZON + 90} h50 l12 10 h60" /><path d="M120 ${HORIZON + 130} h40 l10 -6 h30" /></g><g fill="${shade(groundColor, -0.25)}"><circle cx="30" cy="${HORIZON + 70}" r="3" /><circle cx="170" cy="${HORIZON + 60}" r="2.4" /></g>`
      break
    case "deep_forest": {
      // Мох кочками, корни и опавшие листья
      const leaves = ["#c08a3a", "#8a9a3a", "#a8642a"]
      texture = `<g fill="${shade(groundColor, 0.12)}" opacity=".7">${[[30, 34], [150, 52], [80, 96], [180, 120], [20, 128]].map(([mx, my]) => `<ellipse cx="${mx}" cy="${HORIZON + my!}" rx="26" ry="7" />`).join("")}</g>
        <g fill="none" stroke="${shade(groundColor, -0.35)}" stroke-width="3" stroke-linecap="round"><path d="M-6 ${HORIZON + 22} q30 6 50 22 q14 10 30 8" /><path d="M206 ${HORIZON + 70} q-30 -2 -46 14 q-10 10 -26 10" /></g>
        <g>${Array.from({ length: 14 }, (_, i) => `<ellipse cx="${(i * 37 + 11) % W}" cy="${HORIZON + 16 + ((i * 29) % 120)}" rx="4" ry="2" fill="${leaves[i % 3]}" transform="rotate(${(i * 47) % 180} ${(i * 37 + 11) % W} ${HORIZON + 16 + ((i * 29) % 120)})" />`).join("")}</g>`
      break
    }
    case "indoors": {
      // Доски пола с перспективой, стыки вразбежку, под бойцом — ковёр
      const rows = [8, 18, 30, 45, 63, 85, 112, 144]
      texture = `<g stroke="${shade(groundColor, -0.22)}" stroke-width="1.4">${rows.map(r => `<path d="M0 ${HORIZON + r} h${W}" />`).join("")}</g><g stroke="${shade(groundColor, -0.16)}" stroke-width="1">${rows.slice(0, -1).map((r, i) => Array.from({ length: 3 }, (_, k) => `<path d="M${(k * 76 + i * 41) % 220 - 10} ${HORIZON + r} v${rows[i + 1]! - r}" />`).join("")).join("")}</g>
        <g fill="${shade(groundColor, 0.08)}" opacity=".6">${rows.slice(0, -1).map((r, i) => `<rect x="${(i * 37) % 180}" y="${HORIZON + r + 1}" width="40" height="${(rows[i + 1]! - r) / 2}" />`).join("")}</g>
        ${ctx.terrain === "plain" ? `<ellipse cx="${ctx.x}" cy="${FEET + 8}" rx="80" ry="18" fill="#8a3b4a" stroke="#f1e3c8" stroke-width="3" stroke-dasharray="2 3" /><ellipse cx="${ctx.x}" cy="${FEET + 8}" rx="64" ry="12" fill="none" stroke="#e0b060" stroke-width="2.5" /><ellipse cx="${ctx.x}" cy="${FEET + 8}" rx="34" ry="6" fill="#a8505e" />` : ""}`
      break
    }
    case "factory":
      // Бетонные плиты, жёлтая разметка, пятна масла, решётка стока
      texture = `<g stroke="${shade(groundColor, -0.2)}" stroke-width="1.5"><path d="M0 ${HORIZON + 40} h${W} M0 ${HORIZON + 100} h${W}" /><path d="M60 ${HORIZON} l-8 40 M140 ${HORIZON} l8 40 M40 ${HORIZON + 40} l-12 60 M160 ${HORIZON + 40} l12 60" /></g>
        <path d="M-6 ${HORIZON + 20} h212" stroke="#e0b020" stroke-width="4" stroke-dasharray="22 10" />
        <g fill="#2a2630" opacity=".45"><ellipse cx="34" cy="${HORIZON + 62}" rx="18" ry="5" /><ellipse cx="170" cy="${HORIZON + 118}" rx="22" ry="6" /><ellipse cx="96" cy="${HORIZON + 130}" rx="10" ry="3" /></g>
        <g><rect x="150" y="${HORIZON + 54}" width="34" height="12" fill="#3a3f45" stroke="#22262a" stroke-width="1.5" /><path d="${[155, 161, 167, 173, 179].map(gx => `M${gx} ${HORIZON + 56} v8`).join(" ")}" stroke="#22262a" stroke-width="2" /></g>`
      break
    case "infested":
      // Трещины, пятна светящейся слизи, косточки
      texture = `<g fill="none" stroke="${shade(groundColor, -0.35)}" stroke-width="1.8" stroke-linejoin="round"><path d="M10 ${HORIZON + 26} l20 10 l-6 14 l24 16" /><path d="M150 ${HORIZON + 40} l14 18 l-10 12 l20 24" /><path d="M80 ${HORIZON + 112} l20 -8 l16 10" /></g>
        <g fill="#7fe04a"><ellipse cx="40" cy="${HORIZON + 92}" rx="18" ry="5" opacity=".35" /><ellipse cx="40" cy="${HORIZON + 92}" rx="9" ry="2.6" opacity=".8" /><ellipse cx="170" cy="${HORIZON + 30}" rx="14" ry="4" opacity=".35" /><ellipse cx="170" cy="${HORIZON + 30}" rx="7" ry="2" opacity=".8" /></g>
        <g fill="#b07aff" opacity=".5"><circle cx="120" cy="${HORIZON + 24}" r="2" /><circle cx="126" cy="${HORIZON + 30}" r="1.4" /><circle cx="70" cy="${HORIZON + 56}" r="1.6" /></g>
        ${bone(126, HORIZON + 140, 146, HORIZON + 134, 3)}${bone(20, HORIZON + 50, 32, HORIZON + 58, 2.4)}`
      break
    default:
      texture = `<g fill="#fff" opacity=".6"><ellipse cx="40" cy="${HORIZON + 50}" rx="30" ry="8" /><ellipse cx="150" cy="${HORIZON + 90}" rx="40" ry="10" /></g>`
  }
  return `<rect x="0" y="${HORIZON}" width="${W}" height="${H - HORIZON}" fill="${groundColor}" /><rect x="0" y="${HORIZON}" width="${W}" height="6" fill="${shade(groundColor, 0.2)}" opacity=".7" />${texture}`
}

/* ---------- Реквизит клетки ---------- */

function bushes(ctx: Ctx): string {
  const x = ctx.x
  const g = hex(ctx.biome.colors.forest)
  const light = shade(g, 0.25)
  switch (ctx.biome.id) {
    case "roofs":
      return `<g stroke="#8e5a3a" stroke-width="5" stroke-linecap="round"><path d="M${x - 40} ${FEET} v-56" /><path d="M${x + 36} ${FEET} v-40" /></g><g stroke="#cfd8dc" stroke-width="2"><path d="M${x - 40} ${FEET - 56} h-16 M${x - 40} ${FEET - 48} h-10 M${x - 40} ${FEET - 40} h-6" /><path d="M${x + 36} ${FEET - 40} h14 M${x + 36} ${FEET - 32} h10" /></g><ellipse cx="${x}" cy="${FEET - 8}" rx="34" ry="10" fill="#8e5a3a" opacity=".8" /><ellipse cx="${x}" cy="${FEET - 10}" rx="30" ry="8" fill="#a66d47" />`
    case "basement":
      return `<g fill="#8d6e4a" stroke="#5a4328" stroke-width="1.5"><rect x="${x - 50}" y="${FEET - 46}" width="40" height="40" /><rect x="${x - 10}" y="${FEET - 70}" width="34" height="34" /><rect x="${x + 10}" y="${FEET - 36}" width="42" height="30" /></g><g stroke="#5a4328" stroke-width="1.2"><path d="M${x - 50} ${FEET - 46} l40 40 M${x - 10} ${FEET - 46} l-40 40 M${x - 10} ${FEET - 70} l34 34 M${x + 24} ${FEET - 70} l-34 34" /></g>`
    case "dump":
      return `<g><ellipse cx="${x}" cy="${FEET - 14}" rx="56" ry="26" fill="#7d7760" /><ellipse cx="${x - 20}" cy="${FEET - 26}" rx="30" ry="18" fill="#8e886d" /><circle cx="${x + 30}" cy="${FEET - 30}" r="13" fill="#2b2b2b" /><circle cx="${x + 30}" cy="${FEET - 30}" r="5" fill="#8e886d" /><rect x="${x - 46}" y="${FEET - 44}" width="14" height="10" fill="#b7c0c8" transform="rotate(-20 ${x - 39} ${FEET - 39})" /><path d="M${x + 4} ${FEET - 50} l6 -10 l6 10 z" fill="#e5c05a" /></g>`
    case "winter_park":
      return `<g fill="#fff" stroke="#d6e4f0" stroke-width="1.5"><ellipse cx="${x - 30}" cy="${FEET - 10}" rx="40" ry="20" /><ellipse cx="${x + 34}" cy="${FEET - 6}" rx="34" ry="16" /><ellipse cx="${x}" cy="${FEET - 22}" rx="28" ry="16" /></g>`
    case "jungle":
      return `<g fill="${g}" stroke="${shade(g, -0.35)}" stroke-width="1.5"><ellipse cx="${x - 40}" cy="${FEET - 30}" rx="30" ry="12" transform="rotate(-35 ${x - 40} ${FEET - 30})" /><ellipse cx="${x + 38}" cy="${FEET - 34}" rx="32" ry="12" transform="rotate(30 ${x + 38} ${FEET - 34})" /><ellipse cx="${x}" cy="${FEET - 16}" rx="36" ry="12" /></g><g fill="none" stroke="${light}" stroke-width="2"><path d="M${x - 62} ${FEET - 16} l44 -28 M${x + 16} ${FEET - 20} l44 -26" /></g><g fill="none" stroke="#5a3a1c" stroke-width="3" stroke-linecap="round"><path d="M${x - 20} 0 q10 60 -6 ${FEET - 60}" /><path d="M${x + 30} 0 q-10 70 8 ${FEET - 50}" /></g>`
    case "desert":
      return `<g fill="#7fb069" stroke="#4f7a3e" stroke-width="1.5"><rect x="${x - 10}" y="${FEET - 90}" width="20" height="90" rx="10" /><rect x="${x - 34}" y="${FEET - 64}" width="14" height="34" rx="7" /><rect x="${x - 34}" y="${FEET - 40}" width="26" height="12" rx="6" /><rect x="${x + 20}" y="${FEET - 76}" width="14" height="30" rx="7" /><rect x="${x + 8}" y="${FEET - 54}" width="26" height="12" rx="6" /></g><g stroke="#2f5a26" stroke-width="1.2" stroke-linecap="round">${[0, 1, 2, 3, 4].map(i => `<path d="M${x - 6} ${FEET - 80 + i * 16} h12" />`).join("")}</g><circle cx="${x}" cy="${FEET - 92}" r="6" fill="#ff8fb4" />`
    case "glacier":
      return `<g fill="#bfe3f5" stroke="#5d9cc5" stroke-width="1.5" stroke-linejoin="round"><path d="M${x - 60} ${FEET} l16 -40 l30 12 l-8 28 z" /><path d="M${x - 10} ${FEET} l22 -52 l34 20 l-10 32 z" /><path d="M${x + 30} ${FEET} l10 -26 l26 8 l-2 18 z" /></g><g fill="#fff" opacity=".7"><path d="M${x - 50} ${FEET - 10} l12 -24 l10 4 z" /><path d="M${x + 4} ${FEET - 20} l16 -30 l10 6 z" /></g>`
    case "canyon":
      return `<g fill="${g}" stroke="${shade(g, -0.45)}" stroke-width="1.5"><circle cx="${x - 30}" cy="${FEET - 18}" rx="30" r="26" /><circle cx="${x + 30}" cy="${FEET - 14}" r="22" /></g><g stroke="${shade(g, -0.5)}" stroke-width="2.4" stroke-linecap="round"><path d="M${x - 30} ${FEET - 46} v-12 M${x - 54} ${FEET - 30} l-10 -8 M${x - 6} ${FEET - 34} l10 -8 M${x + 30} ${FEET - 38} v-10 M${x + 52} ${FEET - 20} l10 -6 M${x + 12} ${FEET - 10} l-8 6" /></g>`
    case "deep_forest": {
      // Чаща: две тёмные ели и густой подлесок с папоротником
      const d = shade(g, -0.45)
      return `${spruce(x - 44, FEET + 4, 136, 74, shade(g, 0.32), d)}${spruce(x + 44, FEET + 4, 116, 66, shade(g, 0.2), d)}<g fill="${shade(g, 0.22)}" stroke="${d}" stroke-width="1.5">${[[-34, -14, 18], [34, -14, 18], [-18, -26, 16], [16, -28, 17], [0, -38, 14], [0, -12, 22]].map(([dx, dy, r]) => `<circle cx="${x + dx!}" cy="${FEET + dy!}" r="${r}" />`).join("")}</g><g fill="${shade(g, 0.5)}" opacity=".55">${[[-38, -22], [-22, -36], [12, -38], [-4, -48], [28, -22]].map(([dx, dy]) => `<path d="M${x + dx!} ${FEET + dy!} q4 -6 8 0" />`).join("")}<path d="M${x - 44} ${FEET - 96} l-10 18 h20 z M${x + 44} ${FEET - 78} l-8 14 h16 z" /></g>${fern(x - 60, FEET + 2, 40, "#5f9a3f")}${fern(x + 62, FEET + 2, 34, "#4f8a35")}`
    }
    case "indoors": {
      // Цветы в горшках: фикус, монстера и тюльпаны
      const pot = (px: number, w: number, h: number): string => `<path d="M${px - w / 2} ${FEET - h} h${w} l-${w * 0.12} ${h} h-${w * 0.76} z" fill="#c8643a" stroke="#7a3a1c" stroke-width="1.5" /><rect x="${px - w / 2 - 3}" y="${FEET - h - 6}" width="${w + 6}" height="8" rx="2" fill="#d97a4a" stroke="#7a3a1c" stroke-width="1.5" />`
      const leafD = shade(g, -0.4)
      return `<g><path d="M${x - 44} ${FEET - 34} q-4 -40 4 -70" stroke="#6b4a2c" stroke-width="3" fill="none" />
        <g fill="${g}" stroke="${leafD}" stroke-width="1.2">${[[-60, -96, -30], [-34, -108, 20], [-50, -76, -50], [-26, -82, 40], [-44, -120, 0], [-62, -64, -70], [-28, -60, 60]].map(([dx, dy, a]) => `<ellipse cx="${x + dx!}" cy="${FEET + dy!}" rx="9" ry="14" transform="rotate(${a} ${x + dx!} ${FEET + dy!})" />`).join("")}</g>
        <g fill="${light}" opacity=".6"><ellipse cx="${x - 58}" cy="${FEET - 100}" rx="3" ry="6" transform="rotate(-30 ${x - 58} ${FEET - 100})" /><ellipse cx="${x - 44}" cy="${FEET - 124}" rx="3" ry="6" /></g>
        ${pot(x - 44, 34, 34)}
        <g fill="#2f7a3a" stroke="#1c4a24" stroke-width="1.4">${[[30, -64, -40], [52, -70, 30], [38, -96, -8], [64, -46, 60]].map(([dx, dy, a]) => `<g transform="rotate(${a} ${x + dx!} ${FEET + dy!})"><path d="M${x + dx!} ${FEET + dy! + 20} C${x + dx! - 22} ${FEET + dy! + 6} ${x + dx! - 18} ${FEET + dy! - 22} ${x + dx!} ${FEET + dy! - 20} C${x + dx! + 18} ${FEET + dy! - 22} ${x + dx! + 22} ${FEET + dy! + 6} ${x + dx!} ${FEET + dy! + 20} Z" /><path d="M${x + dx!} ${FEET + dy! + 18} V${FEET + dy! - 16} M${x + dx! - 14} ${FEET + dy! - 4} l8 2 M${x + dx! + 14} ${FEET + dy! - 4} l-8 2 M${x + dx! - 12} ${FEET + dy! + 8} l8 -2 M${x + dx! + 12} ${FEET + dy! + 8} l-8 -2" fill="none" stroke="#1c4a24" /></g>`).join("")}</g>
        ${pot(x + 44, 40, 30)}
        <g stroke="#3f7a3a" stroke-width="2"><path d="M${x + 2} ${FEET - 20} v-26 M${x - 6} ${FEET - 20} q-2 -16 -8 -22 M${x + 10} ${FEET - 20} q2 -14 8 -20" /></g><g fill="#e0505a" stroke="#9a2a34" stroke-width="1"><ellipse cx="${x + 2}" cy="${FEET - 50}" rx="5" ry="7" /><ellipse cx="${x - 14}" cy="${FEET - 44}" rx="4.5" ry="6" fill="#f0c040" stroke="#9a7a10" /><ellipse cx="${x + 18}" cy="${FEET - 42}" rx="4.5" ry="6" /></g>
        ${pot(x + 2, 24, 18)}</g>`
    }
    case "factory":
      // Клубок кабелей и шлангов, катушка
      return `<g><circle cx="${x + 40}" cy="${FEET - 32}" r="30" fill="#4a525c" stroke="#1e2226" stroke-width="2" /><circle cx="${x + 40}" cy="${FEET - 32}" r="22" fill="#1e2226" /><g fill="none" stroke="#2f353c" stroke-width="2">${[20, 16, 12].map(r => `<circle cx="${x + 40}" cy="${FEET - 32}" r="${r}" />`).join("")}</g><circle cx="${x + 40}" cy="${FEET - 32}" r="7" fill="#8a96a0" stroke="#1e2226" stroke-width="1.5" /><path d="M${x + 22} ${FEET - 2} l18 -30 l18 30" fill="none" stroke="#2f353c" stroke-width="4" />
        <ellipse cx="${x - 30}" cy="${FEET - 12}" rx="34" ry="12" fill="none" stroke="#1e2226" stroke-width="7" /><ellipse cx="${x - 30}" cy="${FEET - 20}" rx="28" ry="10" fill="none" stroke="#2f353c" stroke-width="7" /><ellipse cx="${x - 30}" cy="${FEET - 28}" rx="22" ry="8" fill="none" stroke="#1e2226" stroke-width="7" />
        ${cable(`M${x - 74} ${FEET - 4} C${x - 50} ${FEET - 70} ${x - 6} ${FEET - 14} ${x + 8} ${FEET - 44} S${x + 40} ${FEET - 76} ${x + 70} ${FEET - 64}`, "#c0392b", 5)}
        ${cable(`M${x - 64} ${FEET - 40} q26 -36 56 -8 t56 -4 q14 4 20 30`, "#e0b020", 7)}
        ${cable(`M${x - 20} ${FEET - 2} q-10 -40 20 -50 q26 -6 30 20`, "#2f7ad1", 4)}
        <rect x="${x + 66}" y="${FEET - 70}" width="12" height="9" rx="2" fill="#8a96a0" stroke="#1e2226" stroke-width="1.5" /><path d="M${x + 78} ${FEET - 68} h4 M${x + 78} ${FEET - 63} h4" stroke="#e0b020" stroke-width="1.5" /></g>`
    case "infested":
      // Мёртвый кустарник с ядовитым грибком
      return `<g fill="none" stroke="#2a2618" stroke-linecap="round" stroke-linejoin="round"><g stroke-width="6"><path d="M${x - 40} ${FEET} q-6 -30 6 -54 q8 -16 -2 -36" /><path d="M${x + 8} ${FEET} q8 -40 -6 -70 q-6 -14 6 -34" /><path d="M${x + 50} ${FEET} q-4 -26 10 -46" /></g><g stroke-width="3"><path d="M${x - 36} ${FEET - 52} l-20 -14 l-6 -14 M${x - 34} ${FEET - 36} l18 -18 l14 -4 M${x - 36} ${FEET - 88} l-12 -8 M${x + 4} ${FEET - 70} l22 -14 l8 -16 M${x + 2} ${FEET - 50} l-20 -12 M${x + 2} ${FEET - 104} l10 -10 M${x + 60} ${FEET - 46} l14 -8 M${x + 58} ${FEET - 30} l-14 -14" /></g></g>
        <g fill="#3d3a2a" stroke="#1e1a10" stroke-width="1.5"><ellipse cx="${x}" cy="${FEET - 4}" rx="60" ry="9" /></g>
        <g fill="#b07aff" opacity=".3"><circle cx="${x - 34}" cy="${FEET - 42}" r="14" /><circle cx="${x + 6}" cy="${FEET - 64}" r="12" /></g><g fill="#9fff5a" opacity=".3"><circle cx="${x + 54}" cy="${FEET - 20}" r="12" /><circle cx="${x - 14}" cy="${FEET - 10}" r="12" /></g>
        <g stroke="#3a1a5a" stroke-width="1.2"><g fill="#b07aff"><ellipse cx="${x - 34}" cy="${FEET - 42}" rx="9" ry="5" /><ellipse cx="${x - 28}" cy="${FEET - 48}" rx="6" ry="3.5" /><ellipse cx="${x + 6}" cy="${FEET - 64}" rx="8" ry="4.5" /></g><g fill="#9fff5a" stroke="#2f6a1a"><circle cx="${x + 54}" cy="${FEET - 20}" r="6" /><circle cx="${x + 62}" cy="${FEET - 14}" r="4" /><circle cx="${x - 14}" cy="${FEET - 10}" r="5" /><circle cx="${x - 22}" cy="${FEET - 6}" r="3.5" /></g></g>`
    default:
      return `<g fill="${g}" stroke="${shade(g, -0.3)}" stroke-width="1.5"><ellipse cx="${x - 36}" cy="${FEET - 18}" rx="30" ry="24" /><ellipse cx="${x + 34}" cy="${FEET - 14}" rx="28" ry="20" /><ellipse cx="${x}" cy="${FEET - 28}" rx="26" ry="22" /></g><g fill="${light}" opacity=".7"><ellipse cx="${x - 44}" cy="${FEET - 26}" rx="10" ry="7" /><ellipse cx="${x + 26}" cy="${FEET - 22}" rx="9" ry="6" /><ellipse cx="${x - 6}" cy="${FEET - 36}" rx="9" ry="6" /></g>`
  }
}

function tallProp(ctx: Ctx): string {
  const x = ctx.x
  switch (ctx.biome.id) {
    case "roofs":
      return `<g><rect x="${x - 40}" y="${FEET - 70}" width="80" height="64" rx="4" fill="#9aa3ad" stroke="#5f6a73" stroke-width="2" /><g stroke="#5f6a73" stroke-width="2">${Array.from({ length: 7 }, (_, i) => `<path d="M${x - 30} ${FEET - 60 + i * 8} h60" />`).join("")}</g><circle cx="${x + 28}" cy="${FEET - 14}" r="4" fill="#2b2b2b" /></g>`
    case "basement":
      return `<g><rect x="${x - 46}" y="${FEET - 110}" width="92" height="104" fill="#6d5a45" stroke="#3f3222" stroke-width="2" /><g fill="#8d7658"><rect x="${x - 42}" y="${FEET - 80}" width="84" height="6" /><rect x="${x - 42}" y="${FEET - 46}" width="84" height="6" /></g><g fill="#a3c9a8" stroke="#5f8a66" stroke-width="1"><rect x="${x - 36}" y="${FEET - 100}" width="12" height="20" rx="2" /><rect x="${x - 18}" y="${FEET - 96}" width="12" height="16" rx="2" /><rect x="${x + 6}" y="${FEET - 102}" width="14" height="22" rx="2" fill="#e9c46a" /></g><g fill="#c97b5a" stroke="#8a4a2e" stroke-width="1"><rect x="${x - 30}" y="${FEET - 66}" width="20" height="20" /><rect x="${x + 2}" y="${FEET - 62}" width="26" height="16" /></g></g>`
    case "dump":
      return `<g fill="#2b2b2b" stroke="#111" stroke-width="1.5">${[0, 1, 2, 3].map(i => `<ellipse cx="${x + (i % 2 ? 8 : -8)}" cy="${FEET - 10 - i * 18}" rx="40" ry="12" />`).join("")}</g><g fill="#555">${[0, 1, 2, 3].map(i => `<ellipse cx="${x + (i % 2 ? 8 : -8)}" cy="${FEET - 10 - i * 18}" rx="16" ry="4" />`).join("")}</g>`
    case "jungle":
      return `<g fill="#8c8a6a" stroke="#5a5a44" stroke-width="2"><rect x="${x - 60}" y="${FEET - 40}" width="120" height="36" /><rect x="${x - 44}" y="${FEET - 72}" width="88" height="34" /><rect x="${x - 26}" y="${FEET - 100}" width="52" height="30" /><rect x="${x - 10}" y="${FEET - 118}" width="20" height="20" /></g><g fill="#4f8f45" opacity=".85"><ellipse cx="${x - 50}" cy="${FEET - 42}" rx="14" ry="6" /><ellipse cx="${x + 30}" cy="${FEET - 74}" rx="12" ry="5" /><ellipse cx="${x - 14}" cy="${FEET - 102}" rx="10" ry="4" /></g><rect x="${x - 12}" y="${FEET - 30}" width="24" height="26" fill="#1c1c14" />`
    case "desert":
      return `<path d="M${x - 110} ${FEET} Q ${x - 40} ${FEET - 80} ${x + 20} ${FEET - 60} Q ${x + 60} ${FEET - 48} ${x + 110} ${FEET - 70} L ${x + 110} ${FEET} Z" fill="#e2c17a" stroke="#c9a257" stroke-width="1.5" /><path d="M${x - 90} ${FEET - 6} Q ${x - 40} ${FEET - 66} ${x + 10} ${FEET - 52}" fill="none" stroke="#fff" stroke-width="2" opacity=".5" />`
    case "glacier":
      return `<path d="M${x - 70} ${FEET} L ${x - 40} ${FEET - 90} L ${x - 16} ${FEET - 60} L ${x + 6} ${FEET - 126} L ${x + 40} ${FEET - 70} L ${x + 70} ${FEET} Z" fill="#a9d8f0" stroke="#5d9cc5" stroke-width="2" stroke-linejoin="round" /><path d="M${x - 40} ${FEET - 90} L ${x - 28} ${FEET - 10} M${x + 6} ${FEET - 126} L ${x + 18} ${FEET - 20}" fill="none" stroke="#e8f6ff" stroke-width="3" />`
    case "canyon":
      return `<g fill="#b5653a" stroke="#6e3a1f" stroke-width="2"><path d="M${x - 40} ${FEET} L ${x - 32} ${FEET - 110} Q ${x} ${FEET - 130} ${x + 30} ${FEET - 112} L ${x + 44} ${FEET} Z" /></g><g stroke="#8a4a2e" stroke-width="2.4"><path d="M${x - 32} ${FEET - 80} h62 M${x - 36} ${FEET - 50} h74 M${x - 30} ${FEET - 100} h56" /></g><path d="M${x - 20} ${FEET - 118} q20 -14 44 -4" fill="none" stroke="#e0a070" stroke-width="3" />`
    case "winter_park":
      return `<g><path d="M${x} ${FEET - 130} l-46 70 h92 z" fill="#2f6b3a" stroke="#1f4a28" stroke-width="2" /><path d="M${x} ${FEET - 100} l-56 90 h112 z" fill="#3d7f49" stroke="#1f4a28" stroke-width="2" /><rect x="${x - 8}" y="${FEET - 12}" width="16" height="12" fill="#5a3a24" /><g fill="#fff" opacity=".85"><ellipse cx="${x - 20}" cy="${FEET - 76}" rx="14" ry="5" /><ellipse cx="${x + 14}" cy="${FEET - 46}" rx="18" ry="6" /><ellipse cx="${x - 30}" cy="${FEET - 22}" rx="16" ry="5" /></g></g>`
    case "deep_forest":
      // Валун, обросший мхом
      return `<g><path d="M${x - 64} ${FEET} Q${x - 70} ${FEET - 62} ${x - 26} ${FEET - 88} Q${x + 10} ${FEET - 106} ${x + 46} ${FEET - 76} Q${x + 74} ${FEET - 46} ${x + 62} ${FEET} Z" fill="#7d7f73" stroke="#45473e" stroke-width="2" /><path d="M${x + 20} ${FEET - 60} Q${x + 46} ${FEET - 40} ${x + 50} ${FEET}" fill="none" stroke="#5f6157" stroke-width="3" /><path d="M${x - 40} ${FEET - 30} l14 -10 l8 12" fill="none" stroke="#5f6157" stroke-width="2" />
        <path d="M${x - 62} ${FEET - 46} Q${x - 54} ${FEET - 84} ${x - 24} ${FEET - 92} Q${x + 10} ${FEET - 110} ${x + 44} ${FEET - 80} Q${x + 58} ${FEET - 66} ${x + 64} ${FEET - 50} q-8 10 -16 0 q-8 12 -18 2 q-10 12 -22 0 q-12 10 -22 -2 q-10 10 -20 0 q-8 8 -18 0 q-6 6 -12 0 z" fill="#5f8f3a" stroke="#34561e" stroke-width="1.5" />
        <path d="M${x - 44} ${FEET - 74} Q${x - 20} ${FEET - 94} ${x + 10} ${FEET - 94}" fill="none" stroke="#8cc05a" stroke-width="3" stroke-linecap="round" opacity=".8" />
        ${fern(x + 60, FEET + 2, 36, "#5f9a3f")}</g>`
    case "indoors":
      // Шкаф с антресолью
      return `<g><rect x="${x - 50}" y="${FEET - 142}" width="100" height="134" rx="2" fill="#6b4a32" stroke="#3a2616" stroke-width="2" /><rect x="${x - 55}" y="${FEET - 150}" width="110" height="10" rx="2" fill="#7d5a3e" stroke="#3a2616" stroke-width="2" />
        <g fill="#7d5a3e" stroke="#3a2616" stroke-width="1.5"><rect x="${x - 45}" y="${FEET - 136}" width="43" height="92" /><rect x="${x + 2}" y="${FEET - 136}" width="43" height="92" /><rect x="${x - 45}" y="${FEET - 38}" width="90" height="13" /><rect x="${x - 45}" y="${FEET - 22}" width="90" height="12" /></g>
        <g fill="none" stroke="#9a7452" stroke-width="1.5"><rect x="${x - 39}" y="${FEET - 128}" width="31" height="34" /><rect x="${x + 8}" y="${FEET - 128}" width="31" height="34" /><rect x="${x - 39}" y="${FEET - 86}" width="31" height="34" /><rect x="${x + 8}" y="${FEET - 86}" width="31" height="34" /></g>
        <g fill="#e0b040" stroke="#8a6a1a" stroke-width="1"><rect x="${x - 8}" y="${FEET - 96}" width="3" height="14" rx="1.5" /><rect x="${x + 5}" y="${FEET - 96}" width="3" height="14" rx="1.5" /><circle cx="${x}" cy="${FEET - 31}" r="2.4" /><circle cx="${x}" cy="${FEET - 16}" r="2.4" /></g>
        <g fill="#3a2616"><rect x="${x - 46}" y="${FEET - 8}" width="8" height="8" /><rect x="${x + 38}" y="${FEET - 8}" width="8" height="8" /></g>
        <rect x="${x - 40}" y="${FEET - 172}" width="40" height="22" fill="#d9b88a" stroke="#8a6a3a" stroke-width="1.5" /><path d="M${x - 40} ${FEET - 164} h40" stroke="#8a6a3a" stroke-width="1" /><path d="M${x + 18} ${FEET - 150} q-4 -14 4 -22 h8 q8 8 4 22 z" fill="#5a8ab8" stroke="#2f4a6a" stroke-width="1.5" /></g>`
    case "factory":
      // Станок: станина, пресс, шестерня, пульт
      return `<g>${hazard(`${ctx.id}-mh`, x - 64, FEET - 18, 128, 14)}
        <rect x="${x - 54}" y="${FEET - 100}" width="108" height="82" rx="4" fill="#5a6670" stroke="#2a3036" stroke-width="2" /><rect x="${x - 50}" y="${FEET - 96}" width="6" height="74" rx="3" fill="#7a8892" opacity=".7" />
        <g stroke="#2a3036" stroke-width="1.5">${[0, 1, 2, 3].map(i => `<path d="M${x - 34} ${FEET - 36 - i * 6} h28" />`).join("")}</g>
        <rect x="${x - 42}" y="${FEET - 148}" width="18" height="52" fill="#6b7a86" stroke="#2a3036" stroke-width="2" /><rect x="${x - 46}" y="${FEET - 154}" width="74" height="16" rx="3" fill="#e0b020" stroke="#6a5208" stroke-width="2" /><rect x="${x + 4}" y="${FEET - 138}" width="14" height="24" fill="#8a96a0" stroke="#2a3036" stroke-width="1.5" /><path d="M${x + 6} ${FEET - 114} h10 l-5 10 z" fill="#c8d0d6" stroke="#2a3036" stroke-width="1.2" />
        <circle cx="${x - 22}" cy="${FEET - 72}" r="17" fill="none" stroke="#3a4048" stroke-width="6" stroke-dasharray="4.5 3.5" /><circle cx="${x - 22}" cy="${FEET - 72}" r="14" fill="#8a96a0" stroke="#2a3036" stroke-width="1.5" /><circle cx="${x - 22}" cy="${FEET - 72}" r="4" fill="#2a3036" />
        <rect x="${x + 10}" y="${FEET - 86}" width="38" height="36" rx="2" fill="#2a2f34" stroke="#14171a" stroke-width="1.5" /><rect x="${x + 15}" y="${FEET - 81}" width="28" height="12" fill="#5ad16a" opacity=".85" /><circle cx="${x + 18}" cy="${FEET - 58}" r="3" fill="#e04a3a" /><circle cx="${x + 29}" cy="${FEET - 58}" r="3" fill="#f0c020" /><circle cx="${x + 40}" cy="${FEET - 58}" r="3" fill="#5ad16a" />
        <path d="M${x + 22} ${FEET - 112} l6 4 l-6 3 l7 4" fill="none" stroke="#ffcf6a" stroke-width="1.6" stroke-linecap="round" /></g>`
    case "infested":
      // Груда костей с черепом
      return `<g><path d="M${x - 72} ${FEET} Q${x - 40} ${FEET - 46} ${x} ${FEET - 54} Q${x + 44} ${FEET - 46} ${x + 72} ${FEET} Z" fill="#4a4434" stroke="#2a2618" stroke-width="2" />
        ${bone(x - 62, FEET - 6, x - 20, FEET - 18, 6)}${bone(x + 14, FEET - 10, x + 62, FEET - 4, 6)}${bone(x - 44, FEET - 30, x - 6, FEET - 46, 6)}${bone(x + 8, FEET - 40, x + 48, FEET - 24, 5)}${bone(x - 30, FEET - 12, x + 10, FEET - 26, 5)}${bone(x + 30, FEET - 52, x + 44, FEET - 80, 5)}
        <g fill="none" stroke="#7a7262" stroke-width="5" stroke-linecap="round"><path d="M${x - 58} ${FEET - 30} q-6 -24 10 -34 M${x - 46} ${FEET - 30} q-4 -30 14 -38 M${x - 34} ${FEET - 34} q0 -26 16 -34" /></g><g fill="none" stroke="#e6dfc8" stroke-width="3" stroke-linecap="round"><path d="M${x - 58} ${FEET - 30} q-6 -24 10 -34 M${x - 46} ${FEET - 30} q-4 -30 14 -38 M${x - 34} ${FEET - 34} q0 -26 16 -34" /></g>
        <path d="M${x - 16} ${FEET - 66} a18 17 0 1 1 32 0 v8 h-6 v6 h-20 v-6 h-6 z" fill="#e6dfc8" stroke="#7a7262" stroke-width="2" /><g fill="#2a2618"><ellipse cx="${x - 6}" cy="${FEET - 70}" rx="5" ry="5.5" /><ellipse cx="${x + 8}" cy="${FEET - 70}" rx="5" ry="5.5" /><path d="M${x + 1} ${FEET - 63} l-2.4 5 h4.8 z" /></g><g fill="#9fff5a"><circle cx="${x - 6}" cy="${FEET - 70}" r="1.8" /><circle cx="${x + 8}" cy="${FEET - 70}" r="1.8" /></g><path d="M${x - 8} ${FEET - 52} v-5 M${x - 2} ${FEET - 52} v-5 M${x + 4} ${FEET - 52} v-5" stroke="#7a7262" stroke-width="1.5" /></g>`
    default:
      return `<g stroke="#6b4a2c" stroke-width="1.5">${[0, 1, 2].map(r => [0, 1, 2, 3].map(c => `<g><rect x="${x - 52 + c * 26 + (r % 2 ? 13 : 0)}" y="${FEET - 16 - r * 18}" width="26" height="16" rx="7" fill="#a8763f" /><circle cx="${x - 39 + c * 26 + (r % 2 ? 13 : 0)}" cy="${FEET - 8 - r * 18}" r="5.5" fill="#e0b57a" /></g>`).join("")).join("")}</g>`
  }
}

function puddle(ctx: Ctx): string {
  const x = ctx.x
  const c = hex(ctx.biome.colors.water)
  switch (ctx.biome.id) {
    case "roofs":
      return `<g><path d="M${x - 54} ${FEET + 6} l16 -14 l20 6 l18 -10 l22 8 l12 12 l-8 14 l-24 6 l-30 -4 l-20 -6 z" fill="#1b1a24" stroke="#3b3550" stroke-width="2" /><path d="M${x - 30} ${FEET + 2} l10 -6 l14 4" fill="none" stroke="#6b6185" stroke-width="2" /></g>`
    case "dump":
      return `<g><ellipse cx="${x}" cy="${FEET + 8}" rx="60" ry="16" fill="#171717" /><path d="M${x - 30} ${FEET + 2} q20 -6 40 2" fill="none" stroke="#7c6cff" stroke-width="2" opacity=".6" /><path d="M${x - 20} ${FEET + 10} q16 4 36 -2" fill="none" stroke="#5ad1c8" stroke-width="2" opacity=".5" /></g>`
    case "jungle":
      return `<g><ellipse cx="${x}" cy="${FEET + 8}" rx="64" ry="18" fill="#4a7a52" stroke="#2f5a36" stroke-width="2" /><g fill="#2f5a36" opacity=".8"><ellipse cx="${x - 30}" cy="${FEET + 4}" rx="16" ry="6" /><ellipse cx="${x + 26}" cy="${FEET + 12}" rx="14" ry="5" /></g><g fill="none" stroke="#9fd38a" stroke-width="1.5"><circle cx="${x - 8}" cy="${FEET + 2}" r="3" /><circle cx="${x + 12}" cy="${FEET + 10}" r="2" /></g></g>`
    case "desert":
      return `<g><ellipse cx="${x}" cy="${FEET + 8}" rx="60" ry="16" fill="#5bc0eb" stroke="#e8d7a0" stroke-width="5" /><g fill="none" stroke="#fff" stroke-width="2" opacity=".7"><path d="M${x - 30} ${FEET + 4} q10 -4 20 0" /><path d="M${x + 6} ${FEET + 12} q10 -4 20 0" /></g><g fill="none" stroke="#3f8f45" stroke-width="3" stroke-linecap="round"><path d="M${x + 56} ${FEET - 10} q-4 -36 6 -46 M${x + 56} ${FEET - 10} q-24 -18 -34 -10 M${x + 56} ${FEET - 10} q24 -18 34 -10" /></g><rect x="${x + 52}" y="${FEET - 12}" width="8" height="22" fill="#8d6248" /></g>`
    case "glacier":
      return `<g><path d="M${x - 60} ${FEET + 2} l14 -12 l22 6 l16 -8 l22 6 l-2 22 l-24 6 l-26 -4 l-20 -6 z" fill="#3a7fc1" stroke="#e8f6ff" stroke-width="4" /><g stroke="#e8f6ff" stroke-width="1.6" fill="none"><path d="M${x + 36} ${FEET - 6} l16 -8 l8 -14 M${x - 54} ${FEET} l-16 -6" /></g></g>`
    case "canyon":
      return `<g><path d="M${x - 70} ${FEET + 2} C ${x - 40} ${FEET - 10} ${x - 10} ${FEET + 22} ${x + 20} ${FEET + 6} S ${x + 60} ${FEET - 4} ${x + 80} ${FEET + 8} L ${x + 80} ${FEET + 22} C ${x + 50} ${FEET + 14} ${x + 20} ${FEET + 30} ${x - 10} ${FEET + 18} S ${x - 50} ${FEET + 12} ${x - 70} ${FEET + 20} Z" fill="#4fa3d1" stroke="#2f6f96" stroke-width="1.5" /><path d="M${x - 40} ${FEET + 8} q14 -4 28 2" fill="none" stroke="#fff" stroke-width="2" opacity=".7" /></g>`
    case "winter_park":
      return `<g><ellipse cx="${x}" cy="${FEET + 8}" rx="58" ry="16" fill="#9fd3f2" stroke="#e9f4fb" stroke-width="5" /><g stroke="#e9f4fb" stroke-width="1.6" fill="none"><path d="M${x + 40} ${FEET - 2} l16 -8 l8 -14 M${x - 50} ${FEET + 2} l-16 -6" /></g></g>`
    case "deep_forest": {
      // Лесной ручей поперёк кадра с замшелыми камнями
      const stone = (sx: number, sy: number, r: number): string => `<ellipse cx="${sx}" cy="${sy}" rx="${r}" ry="${r * 0.6}" fill="#8a8c80" stroke="#45473e" stroke-width="1.5" /><path d="M${sx - r * 0.8} ${sy - r * 0.2} q${r * 0.8} ${-r * 0.7} ${r * 1.6} 0" fill="#5f8f3a" />`
      return `<g><path d="M-6 ${FEET - 8} C40 ${FEET - 16} 80 ${FEET} 120 ${FEET - 8} S180 ${FEET - 14} 206 ${FEET - 6} V${FEET + 22} C160 ${FEET + 30} 120 ${FEET + 14} 80 ${FEET + 24} S20 ${FEET + 18} -6 ${FEET + 26} Z" fill="${c}" stroke="${shade(c, -0.35)}" stroke-width="2" /><path d="M-6 ${FEET - 4} C40 ${FEET - 12} 80 ${FEET + 4} 120 ${FEET - 4} S180 ${FEET - 10} 206 ${FEET - 2}" fill="none" stroke="${shade(c, 0.35)}" stroke-width="2" opacity=".7" />
        <g fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".6"><path d="M${x - 50} ${FEET + 10} q10 -4 20 0" /><path d="M${x + 4} ${FEET + 16} q10 -4 20 0" /><path d="M${x + 50} ${FEET + 4} q8 -3 16 0" /></g>
        ${stone(x - 30, FEET + 6, 12)}${stone(x + 34, FEET + 12, 9)}${stone(x + 76, FEET - 2, 14)}${stone(x - 78, FEET + 14, 10)}</g>`
    }
    case "indoors":
      // Эмалированная ванна на лапках, с пеной и уточкой
      return `<g><g fill="#e0b040" stroke="#8a6a1a" stroke-width="1.5"><path d="M${x - 58} ${FEET - 14} q-4 10 -10 14 h14 q2 -6 4 -14 z" /><path d="M${x + 58} ${FEET - 14} q4 10 10 14 h-14 q-2 -6 -4 -14 z" /></g>
        <path d="M${x - 76} ${FEET - 56} H${x + 76} V${FEET - 40} Q${x + 74} ${FEET - 10} ${x + 46} ${FEET - 10} H${x - 46} Q${x - 74} ${FEET - 10} ${x - 76} ${FEET - 40} Z" fill="#f6f6f2" stroke="#9aa8b2" stroke-width="2" /><path d="M${x - 64} ${FEET - 44} Q${x - 62} ${FEET - 22} ${x - 40} ${FEET - 20}" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" /><path d="M${x + 70} ${FEET - 44} Q${x + 66} ${FEET - 18} ${x + 44} ${FEET - 16}" fill="none" stroke="#c8d2d8" stroke-width="3" stroke-linecap="round" />
        <rect x="${x - 80}" y="${FEET - 62}" width="160" height="8" rx="4" fill="#fff" stroke="#9aa8b2" stroke-width="2" /><rect x="${x - 72}" y="${FEET - 62}" width="144" height="4" rx="2" fill="${c}" />
        <g fill="#fff" stroke="#c8e6f4" stroke-width="1"><circle cx="${x - 40}" cy="${FEET - 64}" r="7" /><circle cx="${x - 30}" cy="${FEET - 68}" r="9" /><circle cx="${x - 18}" cy="${FEET - 64}" r="6" /><circle cx="${x + 30}" cy="${FEET - 65}" r="7" /><circle cx="${x + 40}" cy="${FEET - 69}" r="5" /><circle cx="${x - 24}" cy="${FEET - 84}" r="3" fill="none" /><circle cx="${x + 46}" cy="${FEET - 82}" r="2.4" fill="none" /></g>
        <g><ellipse cx="${x + 8}" cy="${FEET - 66}" rx="10" ry="6" fill="#ffd23a" stroke="#a8800a" stroke-width="1.2" /><circle cx="${x + 14}" cy="${FEET - 74}" r="5" fill="#ffd23a" stroke="#a8800a" stroke-width="1.2" /><path d="M${x + 18} ${FEET - 74} l5 1 l-5 2 z" fill="#f07a2a" /><circle cx="${x + 15}" cy="${FEET - 75.5}" r="1" fill="#222" /></g>
        <path d="M${x + 66} ${FEET - 62} v-24 q0 -8 -8 -8 h-8 v6" fill="none" stroke="#9aa8b2" stroke-width="5" stroke-linecap="round" /><path d="M${x + 66} ${FEET - 62} v-24 q0 -8 -8 -8 h-8 v6" fill="none" stroke="#e8eef2" stroke-width="2.4" stroke-linecap="round" /></g>`
    case "factory":
      // Масляная лужа с радужными разводами и опрокинутая канистра
      return `<g><ellipse cx="${x}" cy="${FEET + 8}" rx="66" ry="17" fill="#141218" stroke="#000" stroke-width="1.5" /><ellipse cx="${x - 6}" cy="${FEET + 6}" rx="50" ry="11" fill="${c}" />
        <g fill="none" stroke-width="2" stroke-linecap="round" opacity=".75"><path d="M${x - 38} ${FEET + 4} q20 -7 40 1" stroke="#b07cff" /><path d="M${x - 34} ${FEET + 8} q20 -6 40 1" stroke="#5ad1c8" /><path d="M${x - 30} ${FEET + 12} q18 -5 36 1" stroke="#f0d060" /><path d="M${x + 12} ${FEET + 14} q14 4 30 -2" stroke="#7c9cff" /></g>
        <g transform="rotate(-78 ${x + 64} ${FEET})"><rect x="${x + 50}" y="${FEET - 18}" width="28" height="36" rx="3" fill="#c0392b" stroke="#6a1a12" stroke-width="2" /><rect x="${x + 56}" y="${FEET - 24}" width="8" height="7" fill="#2a2f34" /><path d="M${x + 56} ${FEET - 10} h16 M${x + 56} ${FEET + 6} h16" stroke="#8a2a20" stroke-width="2" /></g></g>`
    case "infested":
      // Светящаяся ядовитая жижа с пузырями и торчащей костью
      return `<g><ellipse cx="${x}" cy="${FEET + 8}" rx="84" ry="26" fill="#9fff5a" opacity=".2" /><ellipse cx="${x}" cy="${FEET + 8}" rx="66" ry="17" fill="${c}" stroke="#2f6a1a" stroke-width="2" /><ellipse cx="${x - 6}" cy="${FEET + 6}" rx="42" ry="9" fill="#c6ff8a" opacity=".65" />
        <g fill="#e6ffc0" stroke="#4f9a2a" stroke-width="1.2"><circle cx="${x - 24}" cy="${FEET + 2}" r="5" /><circle cx="${x + 18}" cy="${FEET + 8}" r="3.4" /><circle cx="${x + 34}" cy="${FEET + 2}" r="6" /></g><g fill="none" stroke="#c6ff8a" stroke-width="1.5"><circle cx="${x + 6}" cy="${FEET - 14}" r="3" /><circle cx="${x - 12}" cy="${FEET - 26}" r="2" /></g>
        ${bone(x - 50, FEET + 8, x - 38, FEET - 16, 5)}<path d="M${x + 60} ${FEET + 4} q4 -8 0 -16" fill="none" stroke="#7fe04a" stroke-width="3" stroke-linecap="round" /></g>`
    default:
      return `<g><ellipse cx="${x}" cy="${FEET + 8}" rx="60" ry="16" fill="${c}" stroke="${shade(c, -0.25)}" stroke-width="1.5" /><g fill="none" stroke="#fff" stroke-width="2" opacity=".7"><path d="M${x - 30} ${FEET + 4} q10 -4 20 0" /><path d="M${x + 6} ${FEET + 12} q10 -4 20 0" /></g></g>`
  }
}

function wall(ctx: Ctx, broken: boolean): string {
  const x = ctx.x
  const crack = broken
    ? `<path d="M${x - 10} ${FEET - 90} l8 14 l-6 10 l10 16 l-4 12" fill="none" stroke="#1a1a1a" stroke-width="2.5" stroke-linejoin="round" /><path d="M${x + 20} ${FEET - 60} l-10 8 l6 10" fill="none" stroke="#1a1a1a" stroke-width="2" />`
    : ""
  switch (ctx.biome.id) {
    case "roofs":
      return `<g>${Array.from({ length: 6 }, (_, r) => Array.from({ length: 7 }, (_, c) => `<rect x="${c * 34 + (r % 2 ? 17 : 0) - 20}" y="${FEET - 100 + r * 16}" width="32" height="14" fill="${r % 2 ? "#8e5a3a" : "#9a6442"}" stroke="#5a3620" stroke-width="1" />`).join("")).join("")}<rect x="-4" y="${FEET - 106}" width="${W + 8}" height="8" fill="#b7c0c8" stroke="#5f6a73" stroke-width="1" />${crack}</g>`
    case "basement":
      return `<g>${Array.from({ length: 7 }, (_, r) => Array.from({ length: 7 }, (_, c) => `<rect x="${c * 34 + (r % 2 ? 17 : 0) - 20}" y="${FEET - 112 + r * 16}" width="32" height="14" fill="${r % 3 ? "#8d4a3c" : "#9c5646"}" stroke="#4a241c" stroke-width="1" />`).join("")).join("")}${crack}</g>`
    case "dump":
      return `<g><rect x="${x - 36}" y="${FEET - 120}" width="72" height="116" rx="4" fill="#dfe6ea" stroke="#8a949b" stroke-width="2" /><path d="M${x - 36} ${FEET - 70} h72" stroke="#8a949b" stroke-width="2" /><rect x="${x + 20}" y="${FEET - 110}" width="5" height="28" rx="2" fill="#8a949b" /><rect x="${x + 20}" y="${FEET - 60}" width="5" height="40" rx="2" fill="#8a949b" /><g fill="#c0392b"><circle cx="${x - 22}" cy="${FEET - 94}" r="4" /><circle cx="${x - 10}" cy="${FEET - 40}" r="3" /></g>${broken ? `<path d="M${x - 36} ${FEET - 120} l20 30 l-14 20 l22 24" fill="none" stroke="#5a5a5a" stroke-width="2.5" />` : ""}</g>`
    case "jungle":
      return `<g fill="#9a8b3c" stroke="#5a4e1c" stroke-width="1.5">${Array.from({ length: 12 }, (_, i) => `<rect x="${i * 18 - 6}" y="${FEET - 100}" width="12" height="98" rx="6" />`).join("")}</g><g stroke="#5a4e1c" stroke-width="2">${Array.from({ length: 12 }, (_, i) => `<path d="M${i * 18 - 6} ${FEET - 70} h12 M${i * 18 - 6} ${FEET - 36} h12" />`).join("")}</g><path d="M-6 ${FEET - 84} q100 20 212 -6 M-6 ${FEET - 20} q100 -20 212 6" fill="none" stroke="#6b4a2c" stroke-width="3" />${broken ? `<path d="M${x - 6} ${FEET - 100} l6 30 l-10 14 l12 24" fill="none" stroke="#2a2010" stroke-width="2.5" /><rect x="${x + 12}" y="${FEET - 100}" width="12" height="44" fill="${hex(ctx.biome.colors.plain)}" />` : ""}`
    case "desert":
      return `<g>${Array.from({ length: 6 }, (_, r) => Array.from({ length: 7 }, (_, c) => `<rect x="${c * 34 + (r % 2 ? 17 : 0) - 20}" y="${FEET - 100 + r * 16}" width="32" height="14" rx="2" fill="${r % 2 ? "#c8956b" : "#d4a277"}" stroke="#8a5a36" stroke-width="1" />`).join("")).join("")}<g fill="#8a5a36" opacity=".6"><path d="M${x - 20} ${FEET - 94} h6 M${x + 30} ${FEET - 60} h8" stroke="#8a5a36" stroke-width="2" /></g>${crack}</g>`
    case "glacier":
      return `<g>${Array.from({ length: 6 }, (_, r) => Array.from({ length: 6 }, (_, c) => `<rect x="${c * 40 + (r % 2 ? 20 : 0) - 24}" y="${FEET - 104 + r * 17}" width="38" height="15" rx="3" fill="#8fc4e8" stroke="#e8f6ff" stroke-width="1.5" />`).join("")).join("")}<g stroke="#fff" stroke-width="1.2" opacity=".8"><path d="M10 ${FEET - 96} l8 6 M90 ${FEET - 62} l8 6 M150 ${FEET - 28} l8 6" /></g>${crack}</g>`
    case "canyon":
      return `<g><rect x="-6" y="${FEET - 110}" width="${W + 12}" height="108" fill="#8a4a2e" stroke="#4a2414" stroke-width="2" /><g fill="none" stroke="#a8603a" stroke-width="5"><path d="M-6 ${FEET - 92} q100 6 212 -4 M-6 ${FEET - 66} q100 -6 212 4 M-6 ${FEET - 40} q100 6 212 -4 M-6 ${FEET - 16} q100 -6 212 4" /></g>${broken ? `<g fill="#6e3a1f"><circle cx="${x - 20}" cy="${FEET - 70}" r="10" /><circle cx="${x + 24}" cy="${FEET - 40}" r="8" /><circle cx="${x}" cy="${FEET - 14}" r="12" /></g>` : ""}</g>`
    case "winter_park":
      return `<g>${Array.from({ length: 5 }, (_, r) => Array.from({ length: 6 }, (_, c) => `<rect x="${c * 40 + (r % 2 ? 20 : 0) - 24}" y="${FEET - 90 + r * 18}" width="38" height="16" rx="3" fill="#eef5fb" stroke="#b9cfe0" stroke-width="1.5" />`).join("")).join("")}${crack}</g>`
    case "deep_forest": {
      const bark = hex(ctx.biome.colors.wall)
      if (broken) {
        // Гнилое бревно поперёк кадра: дупло, трутовики, мох
        const lb = hex(ctx.biome.colors.wall_breakable)
        return `<g><rect x="-6" y="${FEET - 62}" width="212" height="58" rx="26" fill="${lb}" stroke="${shade(lb, -0.5)}" stroke-width="2" /><g fill="none" stroke="${shade(lb, -0.3)}" stroke-width="2"><path d="M-6 ${FEET - 46} h70 l8 4 h60 M120 ${FEET - 30} h86 M-6 ${FEET - 20} h50 l10 -4 h40" /></g><path d="M-6 ${FEET - 56} h212" stroke="${shade(lb, 0.25)}" stroke-width="3" opacity=".7" />
          <ellipse cx="${x - 14}" cy="${FEET - 34}" rx="20" ry="13" fill="#2a1a0e" stroke="${shade(lb, -0.5)}" stroke-width="2" /><path d="M${x - 30} ${FEET - 40} l6 4 l4 -6 l6 6 l6 -4 l6 6 l6 -4" fill="none" stroke="#5a3e22" stroke-width="2" />
          <path d="M${x - 70} ${FEET - 60} q20 -12 46 -4 q30 -10 50 2 q-20 6 -50 2 q-26 6 -46 0 z" fill="#5f8f3a" stroke="#34561e" stroke-width="1.2" />
          <g fill="#d9a050" stroke="#8a5a20" stroke-width="1.2"><path d="M${x + 26} ${FEET - 46} q12 -8 22 0 z" /><path d="M${x + 30} ${FEET - 36} q10 -7 18 0 z" /><path d="M${x + 60} ${FEET - 30} q8 -6 14 0 z" /></g>
          <g fill="#c94a3a" stroke="#6a1a12" stroke-width="1"><path d="M${x - 50} ${FEET - 62} q6 -10 12 0 z" /></g><rect x="${x - 45}" y="${FEET - 62}" width="2" height="4" fill="#f4ecd8" /></g>`
      }
      // Вековой ствол с корнями во весь рост кадра
      return `<g><path d="M${x - 52} -4 C${x - 50} ${FEET - 60} ${x - 58} ${FEET - 24} ${x - 92} ${FEET + 2} H${x + 92} C${x + 58} ${FEET - 24} ${x + 50} ${FEET - 60} ${x + 52} -4 Z" fill="${bark}" stroke="${shade(bark, -0.5)}" stroke-width="2" />
        <g fill="none" stroke="${shade(bark, -0.35)}" stroke-width="3" stroke-linecap="round">${[-36, -18, 2, 20, 38].map((dx, i) => `<path d="M${x + dx} ${i * 10} q${(i % 2 ? 4 : -4)} 40 0 80 q${(i % 2 ? -4 : 4)} 30 ${dx * 0.3} ${FEET - 90 - i * 6}" />`).join("")}</g>
        <path d="M${x - 46} 0 C${x - 44} ${FEET - 70} ${x - 50} ${FEET - 30} ${x - 76} ${FEET}" fill="none" stroke="${shade(bark, 0.25)}" stroke-width="4" opacity=".7" />
        <g fill="${bark}" stroke="${shade(bark, -0.5)}" stroke-width="2"><path d="M${x - 70} ${FEET} q-10 -14 -36 -10 q20 4 22 14 z" /><path d="M${x + 70} ${FEET} q12 -12 38 -6 q-22 2 -24 8 z" /></g>
        <ellipse cx="${x + 6}" cy="${FEET - 92}" rx="14" ry="20" fill="#1a1008" stroke="${shade(bark, -0.5)}" stroke-width="2" />
        <g fill="#5f8f3a" opacity=".9"><ellipse cx="${x - 40}" cy="${FEET - 40}" rx="12" ry="18" /><ellipse cx="${x + 34}" cy="${FEET - 20}" rx="16" ry="10" /><ellipse cx="${x - 30}" cy="${FEET - 120}" rx="8" ry="12" /></g>
        <g fill="#d9a050" stroke="#8a5a20" stroke-width="1.2"><path d="M${x + 40} ${FEET - 64} q12 -8 22 0 z" /><path d="M${x + 42} ${FEET - 54} q10 -7 18 0 z" /></g></g>`
    }
    case "indoors": {
      const wc = hex(ctx.biome.colors.wall)
      const wallBase = `<rect x="-6" y="${FEET - 126}" width="${W + 12}" height="124" fill="${wc}" stroke="${shade(wc, -0.35)}" stroke-width="2" /><g fill="${shade(wc, -0.08)}">${Array.from({ length: 14 }, (_, i) => `<rect x="${i * 16 - 4}" y="${FEET - 126}" width="7" height="110" />`).join("")}</g><rect x="-6" y="${FEET - 132}" width="${W + 12}" height="8" fill="#fff6e6" stroke="#b89a6a" stroke-width="1.5" /><rect x="-6" y="${FEET - 18}" width="${W + 12}" height="16" fill="#8a5a32" stroke="#4a2a12" stroke-width="1.5" /><path d="M-6 ${FEET - 14} h${W + 12}" stroke="#b07a4a" stroke-width="2" />`
      if (broken) {
        // Дверь в проёме, исцарапанная когтями
        const dc = hex(ctx.biome.colors.wall_breakable)
        return `<g>${wallBase}<rect x="${x - 40}" y="${FEET - 130}" width="80" height="128" fill="#f4ead8" stroke="#b89a6a" stroke-width="2" /><rect x="${x - 33}" y="${FEET - 124}" width="66" height="122" fill="${dc}" stroke="${shade(dc, -0.45)}" stroke-width="2" />
          <g fill="${shade(dc, 0.1)}" stroke="${shade(dc, -0.35)}" stroke-width="1.5"><rect x="${x - 25}" y="${FEET - 116}" width="50" height="44" rx="2" /><rect x="${x - 25}" y="${FEET - 62}" width="50" height="50" rx="2" /></g>
          <circle cx="${x + 24}" cy="${FEET - 66}" r="4" fill="#e0b040" stroke="#8a6a1a" stroke-width="1.2" /><rect x="${x + 21}" y="${FEET - 60}" width="6" height="8" rx="1" fill="#c99a30" />
          <g stroke="#f1e3c8" stroke-width="2" stroke-linecap="round" opacity=".85"><path d="M${x - 18} ${FEET - 48} l10 22 M${x - 10} ${FEET - 50} l10 22 M${x - 2} ${FEET - 52} l10 22" /></g>
          <path d="M${x - 33} ${FEET - 80} l12 4 l-8 10 l10 6" fill="none" stroke="${shade(dc, -0.6)}" stroke-width="2" /></g>`
      }
      // Стена с обоями, плинтусом и фотографией
      return `<g>${wallBase}<rect x="${x - 22}" y="${FEET - 104}" width="44" height="34" fill="#f4ead8" stroke="#6b4a32" stroke-width="4" /><circle cx="${x - 6}" cy="${FEET - 88}" r="7" fill="#e8a060" /><circle cx="${x + 9}" cy="${FEET - 86}" r="6" fill="#8a8a8f" /><path d="M${x - 18} ${FEET - 72} q12 -10 36 0 z" fill="#6aa84f" /><path d="M${x} ${FEET - 104} l-10 -10 h20 z" fill="none" stroke="#6b4a32" stroke-width="1.2" />
        <rect x="${x + 44}" y="${FEET - 72}" width="12" height="18" rx="2" fill="#fffaf0" stroke="#b89a6a" stroke-width="1.2" /><rect x="${x + 48}" y="${FEET - 68}" width="4" height="8" rx="1" fill="#d9c7a8" /></g>`
    }
    case "factory": {
      if (broken) {
        // Ржавая решётка: прутья, один выгнут, рыжие подтёки
        const rust = hex(ctx.biome.colors.wall_breakable)
        return `<g><g fill="${rust}" stroke="${shade(rust, -0.5)}" stroke-width="1.5"><rect x="-6" y="${FEET - 124}" width="${W + 12}" height="10" /><rect x="-6" y="${FEET - 64}" width="${W + 12}" height="8" /><rect x="-6" y="${FEET - 12}" width="${W + 12}" height="10" /></g>
          <g stroke="${shade(rust, -0.5)}" stroke-width="7" stroke-linecap="round">${Array.from({ length: 15 }, (_, i) => i * 14 - 2).filter(bx => Math.abs(bx - x) > 10).map(bx => `<path d="M${bx} ${FEET - 116} V${FEET - 12}" />`).join("")}</g>
          <g stroke="${rust}" stroke-width="4.5" stroke-linecap="round">${Array.from({ length: 15 }, (_, i) => i * 14 - 2).filter(bx => Math.abs(bx - x) > 10).map(bx => `<path d="M${bx} ${FEET - 116} V${FEET - 12}" />`).join("")}</g>
          <path d="M${x - 4} ${FEET - 116} q-22 40 -2 70 q8 14 0 34" fill="none" stroke="${shade(rust, -0.5)}" stroke-width="7" stroke-linecap="round" /><path d="M${x - 4} ${FEET - 116} q-22 40 -2 70 q8 14 0 34" fill="none" stroke="${shade(rust, 0.1)}" stroke-width="4.5" stroke-linecap="round" />
          <g fill="#6a3418" opacity=".8"><ellipse cx="${x - 40}" cy="${FEET - 118}" rx="10" ry="3" /><ellipse cx="${x + 30}" cy="${FEET - 60}" rx="8" ry="3" /><path d="M${x + 28} ${FEET - 56} v14" stroke="#6a3418" stroke-width="2" /><path d="M${x - 44} ${FEET - 114} v20" stroke="#6a3418" stroke-width="2" /></g></g>`
      }
      // Стальная стена из клёпаных листов с предупреждающим знаком
      const s = hex(ctx.biome.colors.wall)
      return `<g>${Array.from({ length: 2 }, (_, r) => Array.from({ length: 6 }, (_, c) => `<rect x="${c * 36 - 8}" y="${FEET - 126 + r * 56}" width="36" height="56" fill="${(r + c) % 2 ? s : shade(s, 0.07)}" stroke="${shade(s, -0.4)}" stroke-width="1.5" />`).join("")).join("")}
        <g fill="${shade(s, 0.4)}">${Array.from({ length: 2 }, (_, r) => Array.from({ length: 6 }, (_, c) => [[4, 4], [32, 4], [4, 52], [32, 52]].map(([dx, dy]) => `<circle cx="${c * 36 - 8 + dx!}" cy="${FEET - 126 + r * 56 + dy!}" r="1.6" />`).join("")).join("")).join("")}</g>
        <rect x="-6" y="${FEET - 132}" width="${W + 12}" height="8" fill="#2a2f35" />${hazard(`${ctx.id}-wh`, -6, FEET - 16, W + 12, 14)}
        <path d="M${x} ${FEET - 112} l18 32 h-36 z" fill="#f0c020" stroke="#1e1e1e" stroke-width="2.4" stroke-linejoin="round" /><path d="M${x} ${FEET - 102} v12" stroke="#1e1e1e" stroke-width="3" stroke-linecap="round" /><circle cx="${x}" cy="${FEET - 85}" r="1.8" fill="#1e1e1e" /></g>`
    }
    case "infested": {
      // Баррикада: доски, крест-накрест, колючая проволока; разбитая — с дырой
      const pc = hex(ctx.biome.colors.wall)
      const rowsY = [FEET - 108, FEET - 82, FEET - 56, FEET - 30]
      const plank = (x1: number, x2: number, py: number, i: number): string => `<rect x="${x1}" y="${py}" width="${x2 - x1}" height="20" fill="${i % 2 ? pc : shade(pc, 0.1)}" stroke="${shade(pc, -0.5)}" stroke-width="1.5" transform="rotate(${((i * 3) % 5) - 2} ${(x1 + x2) / 2} ${py + 10})" />`
      const planks = rowsY.map((py, i) => broken && (i === 1 || i === 2)
        ? `${plank(-6, x - 22, py, i)}${plank(x + 20, W + 6, py, i)}<path d="M${x - 22} ${py} l8 6 l-6 4 l6 6 l-8 4 M${x + 20} ${py} l-6 5 l8 5 l-8 4 l6 6" fill="${shade(pc, 0.1)}" stroke="${shade(pc, -0.5)}" stroke-width="1.5" />`
        : plank(-6, W + 6, py, i)).join("")
      const posts = `<g fill="${shade(pc, -0.2)}" stroke="${shade(pc, -0.55)}" stroke-width="1.5">${[x - 70, x + 64].map(px => `<rect x="${px}" y="${FEET - 124}" width="12" height="124" />`).join("")}</g>`
      const wire = (y: number, sag: number): string => `<path d="M-6 ${y} ${Array.from({ length: 11 }, () => `q10 ${sag} 20 0`).join(" ")}" fill="none" stroke="#9a9aa0" stroke-width="1.5" /><g stroke="#9a9aa0" stroke-width="1.5">${Array.from({ length: 11 }, (_, i) => `<path d="M${i * 20 + 4} ${y + sag / 2 - 3} l4 6 M${i * 20 + 8} ${y + sag / 2 - 3} l-4 6" />`).join("")}</g>`
      const cross = broken
        ? `<rect x="${x - 70}" y="${FEET - 22}" width="96" height="14" fill="${shade(pc, 0.15)}" stroke="${shade(pc, -0.5)}" stroke-width="1.5" transform="rotate(-8 ${x - 22} ${FEET - 15})" />`
        : `<g fill="${shade(pc, 0.15)}" stroke="${shade(pc, -0.5)}" stroke-width="1.5"><rect x="${x - 60}" y="${FEET - 72}" width="120" height="14" transform="rotate(38 ${x} ${FEET - 65})" /><rect x="${x - 60}" y="${FEET - 72}" width="120" height="14" transform="rotate(-38 ${x} ${FEET - 65})" /></g>`
      return `<g>${posts}${planks}${cross}<g fill="#2a2618">${rowsY.map(py => `<circle cx="${x - 60}" cy="${py + 10}" r="1.6" /><circle cx="${x + 70}" cy="${py + 10}" r="1.6" />`).join("")}</g>${wire(FEET - 122, broken ? 8 : -8)}${broken ? `<path d="M${x - 4} ${FEET - 118} q6 20 -4 34 q-6 8 2 16" fill="none" stroke="#9a9aa0" stroke-width="1.5" />` : wire(FEET - 132, 6)}</g>`
    }
    default:
      return `<g fill="#c99a66" stroke="#8a5f30" stroke-width="1.5">${Array.from({ length: 11 }, (_, i) => `<path d="M${i * 20 - 4} ${FEET - 96} h14 v94 h-14 z" />`).join("")}<rect x="-6" y="${FEET - 70}" width="${W + 12}" height="6" /><rect x="-6" y="${FEET - 30}" width="${W + 12}" height="6" />${broken ? `<path d="M${x - 8} ${FEET - 96} l-6 40 l10 -6 l-4 40" fill="none" stroke="#3a2a14" stroke-width="2.5" /><rect x="${x + 12}" y="${FEET - 96}" width="14" height="40" fill="${hex(ctx.biome.colors.plain)}" />` : ""}</g>`
  }
}

function cover(ctx: Ctx): string {
  const x = ctx.x
  switch (ctx.biome.id) {
    case "roofs":
      return `<g><rect x="${x - 44}" y="${FEET - 60}" width="88" height="54" rx="4" fill="#cfd8dc" stroke="#78909c" stroke-width="2" /><circle cx="${x}" cy="${FEET - 33}" r="20" fill="#90a4ae" stroke="#546e7a" stroke-width="2" /><g stroke="#546e7a" stroke-width="2"><path d="M${x} ${FEET - 53} v40 M${x - 20} ${FEET - 33} h40 M${x - 14} ${FEET - 47} l28 28 M${x + 14} ${FEET - 47} l-28 28" /></g></g>`
    case "basement":
      return `<g><rect x="${x - 30}" y="${FEET - 80}" width="60" height="76" rx="8" fill="#6d4c41" stroke="#3e2723" stroke-width="2" /><g stroke="#3e2723" stroke-width="3"><path d="M${x - 30} ${FEET - 64} h60 M${x - 30} ${FEET - 22} h60" /></g><ellipse cx="${x}" cy="${FEET - 80}" rx="30" ry="6" fill="#8d6e63" stroke="#3e2723" stroke-width="2" /></g>`
    case "dump":
      return `<g><rect x="${x - 58}" y="${FEET - 50}" width="116" height="44" rx="10" fill="#8d6e63" stroke="#4e342e" stroke-width="2" /><rect x="${x - 62}" y="${FEET - 70}" width="20" height="60" rx="8" fill="#a1887f" stroke="#4e342e" stroke-width="2" /><rect x="${x + 42}" y="${FEET - 70}" width="20" height="60" rx="8" fill="#a1887f" stroke="#4e342e" stroke-width="2" /><rect x="${x - 50}" y="${FEET - 74}" width="100" height="30" rx="8" fill="#a1887f" stroke="#4e342e" stroke-width="2" /><path d="M${x - 10} ${FEET - 30} q10 -8 20 0" fill="none" stroke="#4e342e" stroke-width="2" /><circle cx="${x + 30}" cy="${FEET - 20}" r="4" fill="#fff" opacity=".7" /></g>`
    case "jungle":
      return `<g><rect x="${x - 56}" y="${FEET - 150}" width="112" height="150" rx="40" fill="#7a5a3a" stroke="#4a3220" stroke-width="2" /><ellipse cx="${x}" cy="${FEET - 60}" rx="28" ry="40" fill="#2a1c12" /><ellipse cx="${x}" cy="${FEET - 64}" rx="16" ry="26" fill="#140d08" /><g fill="#4f8f45"><ellipse cx="${x - 50}" cy="${FEET - 140}" rx="24" ry="10" transform="rotate(-30 ${x - 50} ${FEET - 140})" /><ellipse cx="${x + 50}" cy="${FEET - 136}" rx="24" ry="10" transform="rotate(30 ${x + 50} ${FEET - 136})" /></g></g>`
    case "desert":
      return `<g fill="none" stroke="#e8e0c8" stroke-width="7" stroke-linecap="round"><path d="M${x - 60} ${FEET - 4} q60 -90 120 0" /><path d="M${x - 46} ${FEET - 40} q0 -30 24 -42" /><path d="M${x - 26} ${FEET - 56} q4 -22 26 -28" /><path d="M${x - 2} ${FEET - 62} q8 -20 30 -22" /><path d="M${x + 22} ${FEET - 58} q10 -14 30 -10" /><path d="M${x - 60} ${FEET - 4} h120" /></g><g><ellipse cx="${x + 70}" cy="${FEET - 2}" rx="22" ry="16" fill="#e8e0c8" stroke="#bfb59a" stroke-width="2" /><circle cx="${x + 64}" cy="${FEET - 6}" r="4" fill="#2a2a2a" /><circle cx="${x + 78}" cy="${FEET - 6}" r="4" fill="#2a2a2a" /><path d="M${x + 60} ${FEET + 6} h22" stroke="#bfb59a" stroke-width="2" /></g>`
    case "glacier":
      return `<g><path d="M${x - 80} ${FEET + 4} q0 -110 80 -116 q80 6 80 116 z" fill="#eaf6ff" stroke="#9cc9e6" stroke-width="2" /><path d="M${x - 50} ${FEET + 4} q0 -70 50 -76 q50 6 50 76 z" fill="#2a4a66" /><path d="M${x - 30} ${FEET + 4} q0 -44 30 -50 q30 6 30 50 z" fill="#142a40" /><g fill="#fff" opacity=".8"><ellipse cx="${x - 40}" cy="${FEET - 92}" rx="14" ry="5" /><ellipse cx="${x + 36}" cy="${FEET - 86}" rx="12" ry="4" /></g></g>`
    case "canyon":
      return `<g><path d="M${x - 70} ${FEET + 2} L ${x - 60} ${FEET - 130} L ${x - 14} ${FEET - 130} L ${x - 20} ${FEET + 2} Z" fill="#b5653a" stroke="#6e3a1f" stroke-width="2" /><path d="M${x + 20} ${FEET + 2} L ${x + 14} ${FEET - 130} L ${x + 60} ${FEET - 130} L ${x + 70} ${FEET + 2} Z" fill="#b5653a" stroke="#6e3a1f" stroke-width="2" /><path d="M${x - 20} ${FEET + 2} L ${x - 14} ${FEET - 130} L ${x + 14} ${FEET - 130} L ${x + 20} ${FEET + 2} Z" fill="#1a0d08" /><g stroke="#8a4a2e" stroke-width="2"><path d="M${x - 60} ${FEET - 100} h40 M${x - 58} ${FEET - 60} h36 M${x + 20} ${FEET - 90} h40 M${x + 18} ${FEET - 50} h44" /></g></g>`
    case "winter_park":
      return `<g><path d="M${x - 70} ${FEET + 2} q70 -56 140 0 z" fill="#f4f9fd" stroke="#c3d7e6" stroke-width="2" /><g stroke="#c3d7e6" stroke-width="1.5" fill="none"><path d="M${x - 40} ${FEET - 10} q40 -24 80 0" /><path d="M${x - 20} ${FEET - 22} q20 -10 40 0" /></g></g>`
    case "deep_forest": {
      // Пень с годовыми кольцами и грибами
      const cc = hex(ctx.biome.colors.cover)
      const shroom = (sx: number, sy: number, s: number): string => `<rect x="${sx - s * 0.25}" y="${sy - s}" width="${s * 0.5}" height="${s}" rx="${s * 0.2}" fill="#f4ecd8" stroke="#8a7a5a" stroke-width="1" /><path d="M${sx - s * 0.8} ${sy - s * 0.85} q${s * 0.8} ${-s * 1.2} ${s * 1.6} 0 z" fill="#d9483a" stroke="#6a1a12" stroke-width="1.2" /><g fill="#fff"><circle cx="${sx - s * 0.3}" cy="${sy - s * 1.15}" r="${s * 0.12}" /><circle cx="${sx + s * 0.25}" cy="${sy - s * 1.25}" r="${s * 0.1}" /></g>`
      return `<g><g fill="${cc}" stroke="${shade(cc, -0.5)}" stroke-width="2"><path d="M${x - 62} ${FEET} q20 -4 26 -18 l10 6 q-6 8 -10 12 z" /><path d="M${x + 60} ${FEET} q-18 -4 -24 -16 l-10 6 q6 6 10 10 z" /></g>
        <path d="M${x - 40} ${FEET} q8 -10 6 -26 V${FEET - 62} H${x + 34} V${FEET - 26} q-2 16 6 26 Z" fill="${cc}" stroke="${shade(cc, -0.5)}" stroke-width="2" />
        <g fill="none" stroke="${shade(cc, -0.3)}" stroke-width="2"><path d="M${x - 22} ${FEET - 56} v48 M${x - 4} ${FEET - 54} v50 M${x + 18} ${FEET - 56} v44" /></g><path d="M${x - 30} ${FEET - 58} V${FEET - 10}" stroke="${shade(cc, 0.25)}" stroke-width="3" />
        <ellipse cx="${x}" cy="${FEET - 62}" rx="34" ry="10" fill="#d9b07a" stroke="${shade(cc, -0.5)}" stroke-width="2" /><g fill="none" stroke="#a8804a" stroke-width="1.5"><ellipse cx="${x}" cy="${FEET - 62}" rx="24" ry="7" /><ellipse cx="${x}" cy="${FEET - 62}" rx="13" ry="3.8" /><ellipse cx="${x}" cy="${FEET - 62}" rx="4" ry="1.2" /></g>
        <path d="M${x - 40} ${FEET - 30} q10 -10 20 -2 q8 -8 16 0" fill="#5f8f3a" stroke="#34561e" stroke-width="1.2" />
        ${shroom(x + 48, FEET, 14)}${shroom(x + 62, FEET + 2, 9)}${shroom(x - 50, FEET + 2, 11)}</g>`
    }
    case "indoors": {
      // Мягкое кресло со стёжкой
      const ac = hex(ctx.biome.colors.cover)
      const d = shade(ac, -0.45)
      return `<g><g fill="#5a3a1a"><rect x="${x - 48}" y="${FEET - 14}" width="7" height="14" /><rect x="${x + 41}" y="${FEET - 14}" width="7" height="14" /></g>
        <rect x="${x - 42}" y="${FEET - 112}" width="84" height="74" rx="20" fill="${ac}" stroke="${d}" stroke-width="2" /><g fill="${d}">${[[-20, -90], [0, -94], [20, -90], [-10, -72], [10, -72]].map(([dx, dy]) => `<circle cx="${x + dx!}" cy="${FEET + dy!}" r="2" />`).join("")}</g>
        <rect x="${x - 54}" y="${FEET - 38}" width="108" height="26" rx="6" fill="${shade(ac, -0.1)}" stroke="${d}" stroke-width="2" />
        <rect x="${x - 38}" y="${FEET - 52}" width="76" height="20" rx="7" fill="${shade(ac, 0.15)}" stroke="${d}" stroke-width="2" />
        <rect x="${x - 62}" y="${FEET - 72}" width="24" height="58" rx="11" fill="${ac}" stroke="${d}" stroke-width="2" /><rect x="${x + 38}" y="${FEET - 72}" width="24" height="58" rx="11" fill="${ac}" stroke="${d}" stroke-width="2" />
        <path d="M${x - 56} ${FEET - 64} v40 M${x - 34} ${FEET - 104} q34 -10 68 0" fill="none" stroke="${shade(ac, 0.35)}" stroke-width="3" stroke-linecap="round" opacity=".7" />
        <path d="M${x + 10} ${FEET - 56} q14 -10 26 -2 l-4 6 q-10 -4 -20 2 z" fill="#f1e3c8" stroke="#b89a6a" stroke-width="1" /></g>`
    }
    case "factory":
      // Бочки со знаком радиации: две внизу, одна сверху
      return `<g>${barrel(x - 26, FEET - 2, 44, 60)}${barrel(x + 24, FEET - 2, 44, 60)}${barrel(x - 2, FEET - 64, 40, 52)}</g>`
    case "infested": {
      // Надгробие на свежем холмике, рядом покосившийся крест
      const st = hex(ctx.biome.colors.cover)
      return `<g><ellipse cx="${x}" cy="${FEET - 2}" rx="56" ry="11" fill="#3a3626" stroke="#1e1a10" stroke-width="1.5" />
        <g transform="rotate(12 ${x + 48} ${FEET})"><rect x="${x + 45}" y="${FEET - 56}" width="6" height="56" fill="#5a4632" stroke="#2a1e12" stroke-width="1.2" /><rect x="${x + 34}" y="${FEET - 44}" width="28" height="6" fill="#5a4632" stroke="#2a1e12" stroke-width="1.2" /></g>
        <path d="M${x - 30} ${FEET - 4} V${FEET - 72} Q${x - 30} ${FEET - 106} ${x} ${FEET - 106} Q${x + 30} ${FEET - 106} ${x + 30} ${FEET - 72} V${FEET - 4} Z" fill="${st}" stroke="${shade(st, -0.5)}" stroke-width="2" />
        <path d="M${x - 24} ${FEET - 74} Q${x - 22} ${FEET - 98} ${x} ${FEET - 100}" fill="none" stroke="${shade(st, 0.35)}" stroke-width="3" stroke-linecap="round" />
        <path d="M${x} ${FEET - 92} v28 M${x - 10} ${FEET - 82} h20" stroke="${shade(st, -0.4)}" stroke-width="4" stroke-linecap="round" /><g stroke="${shade(st, -0.35)}" stroke-width="2.4" stroke-linecap="round"><path d="M${x - 16} ${FEET - 52} h32 M${x - 12} ${FEET - 42} h24" /></g>
        <path d="M${x + 30} ${FEET - 80} l-10 8 l4 10 l-8 12" fill="none" stroke="#2a2a30" stroke-width="2" />
        <path d="M${x - 30} ${FEET - 20} q10 -8 18 0 q6 -6 14 0 V${FEET - 4} H${x - 30} Z" fill="#6a7a3a" opacity=".9" />
        <g fill="#9fff5a"><path d="M${x + 14} ${FEET - 106} q2 10 0 16 q-3 -6 0 -16 z" opacity=".85" /><circle cx="${x + 14}" cy="${FEET - 88}" r="2" /></g></g>`
    }
    default:
      return `<g><rect x="${x - 44}" y="${FEET - 64}" width="88" height="60" rx="3" fill="#dcae72" stroke="#a8763f" stroke-width="2" /><path d="M${x - 44} ${FEET - 64} l-12 -12 h44 l-12 12 z M${x + 44} ${FEET - 64} l12 -12 h-44 l12 12 z" fill="#e8c18b" stroke="#a8763f" stroke-width="1.5" stroke-linejoin="round" /><rect x="${x - 5}" y="${FEET - 64}" width="10" height="60" fill="#c9924f" opacity=".5" /><path d="M${x - 30} ${FEET - 30} h20 M${x - 30} ${FEET - 22} h30" stroke="#a8763f" stroke-width="1.5" stroke-linecap="round" opacity=".7" /><path d="M${x + 14} ${FEET - 46} l-4 10 l6 -2 l-2 8" fill="none" stroke="#a8763f" stroke-width="1.5" /></g>`
  }
}

function prop(ctx: Ctx): string {
  switch (ctx.terrain) {
    case "forest":
      return bushes(ctx)
    case "mountain":
      return tallProp(ctx)
    case "water":
      return puddle(ctx)
    case "wall":
      return wall(ctx, false)
    case "wall_breakable":
      return wall(ctx, true)
    case "cover":
      return cover(ctx)
    default:
      return ""
  }
}

/* ---------- Слои для параллакса ---------- */

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.replace("#", ""), 16)
  const pb = parseInt(b.replace("#", ""), 16)
  const ch = (sh: number): number => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t)
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`
}

const SKY_BOTTOM: Record<string, string> = {
  yard: "#eef9ff",
  roofs: "#ff9a6b",
  basement: "#3d3640",
  dump: "#eae4c6",
  winter_park: "#f3f8fc",
  jungle: "#bfe8a0",
  desert: "#fff2cc",
  glacier: "#bfe3ff",
  canyon: "#ff9a5c",
  deep_forest: "#4a6e44",
  indoors: "#f6e8cc",
  factory: "#68707a",
  infested: "#5e7a46"
}

/** Дальний план: силуэты горизонта в два ряда, растворяющиеся в небе. */
function distant(ctx: Ctx): string {
  const b = ctx.biome.id
  const haze = SKY_BOTTOM[b] ?? "#eef9ff"
  const far = (c: string): string => mix(c, haze, 0.62)
  const mid = (c: string): string => mix(c, haze, 0.35)
  const y = HORIZON
  switch (b) {
    case "yard":
      return `<g fill="${far("#5f8f6a")}">${[10, 52, 98, 150].map((x, i) => `<rect x="${x}" y="${y - 44 - (i % 2) * 10}" width="${30 + (i % 3) * 6}" height="${50 + (i % 2) * 10}" /><path d="M${x - 4} ${y - 44 - (i % 2) * 10} l${19 + (i % 3) * 3} -16 l${19 + (i % 3) * 3} 16 z" />`).join("")}</g><g fill="${mid("#3f7a3a")}">${[0, 40, 84, 130, 176].map((x, i) => `<circle cx="${x}" cy="${y - 12}" r="${16 + (i % 3) * 5}" />`).join("")}</g>`
    case "roofs":
      return `<g fill="${far("#3a2a4a")}">${Array.from({ length: 9 }, (_, i) => `<rect x="${i * 24 - 6}" y="${y - 60 - ((i * 37) % 40)}" width="22" height="${66 + ((i * 37) % 40)}" />`).join("")}</g><g fill="#ffe08a" opacity=".55">${Array.from({ length: 18 }, (_, i) => `<rect x="${(i * 23) % 200}" y="${y - 50 - ((i * 13) % 50)}" width="3" height="4" />`).join("")}</g><g fill="${mid("#4a3550")}">${Array.from({ length: 7 }, (_, i) => `<rect x="${i * 32 - 10}" y="${y - 30 - ((i * 19) % 20)}" width="28" height="${36 + ((i * 19) % 20)}" />`).join("")}</g>`
    case "basement":
      return "<g stroke=\"#5a5060\" stroke-width=\"7\" fill=\"none\" opacity=\".8\"><path d=\"M-10 26 h220\" /><path d=\"M-10 42 h80 q10 0 10 10 v40\" /></g><g stroke=\"#3a3440\" stroke-width=\"2\" opacity=\".8\"><path d=\"M-10 22 h220 M-10 30 h220\" /></g><path d=\"M140 0 v54\" stroke=\"#222\" stroke-width=\"1.5\" /><circle cx=\"140\" cy=\"60\" r=\"7\" fill=\"#ffe7a0\" /><circle cx=\"140\" cy=\"60\" r=\"30\" fill=\"#ffe7a0\" opacity=\".18\" />"
    case "dump":
      return `<g fill="${far("#6b6550")}"><path d="M-10 ${y} q30 -50 60 -30 q20 -30 50 -6 q30 -40 70 -10 q20 -12 40 6 v40 h-220 z" /></g><g fill="${mid("#4e4a3a")}"><path d="M-10 ${y} q20 -20 40 -10 q24 -24 50 0 q30 -20 60 -2 q30 -16 60 6 v20 h-210 z" /></g>`
    case "winter_park":
      return `<g fill="${far("#9fb8cc")}"><path d="M-10 ${y - 10} q50 -40 100 -10 q50 -36 120 0 v20 h-220 z" /></g><g fill="${mid("#2f5a3a")}">${[8, 36, 70, 120, 150, 182].map((x, i) => `<path d="M${x} ${y - 40 - (i % 2) * 8} l-12 34 h24 z" />`).join("")}</g><g fill="#fff" opacity=".8">${[8, 36, 70, 120, 150, 182].map((x, i) => `<path d="M${x} ${y - 40 - (i % 2) * 8} l-4 10 h8 z" />`).join("")}</g>`
    case "jungle":
      return `<g fill="${far("#2f6a3a")}">${Array.from({ length: 8 }, (_, i) => `<ellipse cx="${i * 28}" cy="${y - 40}" rx="26" ry="${30 + (i % 3) * 8}" />`).join("")}</g><g fill="${mid("#1f5a2a")}">${Array.from({ length: 7 }, (_, i) => `<ellipse cx="${i * 32 + 12}" cy="${y - 12}" rx="22" ry="20" />`).join("")}</g><g stroke="${mid("#2f5a2a")}" stroke-width="2" fill="none">${[20, 70, 130, 175].map(x => `<path d="M${x} 0 q6 30 -2 60 q-6 20 4 40" />`).join("")}</g>`
    case "desert":
      return `<g fill="${far("#c98a4a")}"><path d="M110 ${y} v-46 h60 v46 z" /><path d="M100 ${y - 40} h80 v-6 h-80 z" /></g><g fill="${mid("#e0b060")}"><path d="M-10 ${y} q50 -30 100 -6 q60 -24 120 4 v10 h-220 z" /></g>`
    case "glacier":
      return `<g fill="none" stroke="#7cf0c0" stroke-width="10" opacity=".22"><path d="M-10 40 q60 -20 110 10 t110 -6" /><path d="M-10 58 q60 -16 110 8 t110 -4" stroke="#b07cf0" /></g><g fill="${far("#5d8fc5")}"><path d="M-10 ${y} l30 -60 l24 30 l30 -70 l30 50 l26 -40 l40 90 z" /></g><g fill="${mid("#8fc4e8")}"><path d="M-10 ${y} l40 -34 l30 20 l40 -40 l40 30 l30 -18 l40 42 z" /></g><g fill="#fff" opacity=".7"><path d="M44 ${y - 60} l-6 14 h12 z M104 ${y - 70} l-6 14 h12 z" /></g>`
    case "canyon":
      return `<g fill="${far("#7a3a2a")}"><path d="M-10 ${y} v-50 h40 v-10 h30 v60 z M120 ${y} v-70 h50 v20 h40 v50 z" /></g><g fill="${mid("#a8503a")}"><path d="M40 ${y} v-30 h60 v30 z M170 ${y} v-24 h40 v24 z" /></g>`
    case "deep_forest":
      return `${Array.from({ length: 9 }, (_, i) => spruce(i * 26 - 6, y + 2, 74 + ((i * 37) % 30), 36, far("#1a3d24"))).join("")}${Array.from({ length: 7 }, (_, i) => spruce(i * 34 + 8, y + 4, 54 + ((i * 23) % 24), 42, mid("#12301a"))).join("")}`
    case "indoors": {
      // Батарея под окном
      const wx = ctx.side === "left" ? 46 : 98
      return `<g fill="#f4f0e8" stroke="#b8ab94" stroke-width="1.2">${Array.from({ length: 8 }, (_, i) => `<rect x="${wx + 1 + i * 7}" y="${y - 38}" width="6" height="28" rx="3" />`).join("")}</g><path d="M${wx} ${y - 34} h56 M${wx} ${y - 14} h56" stroke="#b8ab94" stroke-width="1.5" /><path d="M${wx + 2} ${y - 10} v8 M${wx + 54} ${y - 10} v8" stroke="#8a7a64" stroke-width="2" />`
    }
    case "factory":
      // Цистерна и шкафы вдоль задней стены цеха
      return `<g fill="#4a525c" stroke="#2a2f35" stroke-width="1.5"><rect x="-6" y="${y - 56}" width="40" height="56" rx="12" /><rect x="150" y="${y - 40}" width="22" height="40" /><rect x="174" y="${y - 32}" width="30" height="32" /></g><g fill="#2a2f35"><path d="M-6 ${y - 40} h40 M-6 ${y - 20} h40" stroke="#2a2f35" stroke-width="2" /><rect x="154" y="${y - 34}" width="14" height="8" fill="#7fbf5a" opacity=".7" /><circle cx="180" cy="${y - 24}" r="2" fill="#e04a3a" /><circle cx="188" cy="${y - 24}" r="2" fill="#f0c020" /></g>`
    case "infested": {
      // Разрушенные дома, кривой забор и кресты
      const lit = "#b6ff6a"
      return `<g fill="${far("#2a1f38")}"><path d="M-6 ${y} V${y - 50} L22 ${y - 70} L34 ${y - 58} L30 ${y - 52} L46 ${y - 54} V${y} Z" /><path d="M66 ${y} V${y - 58} L80 ${y - 72} L86 ${y - 64} L94 ${y - 82} L100 ${y - 82} L100 ${y - 70} L110 ${y - 66} L122 ${y - 60} V${y} Z" /><path d="M150 ${y} V${y - 42} L160 ${y - 42} L166 ${y - 62} L178 ${y - 54} L188 ${y - 66} L206 ${y - 46} V${y} Z" /></g>
        <g fill="${lit}" opacity=".75"><rect x="8" y="${y - 40}" width="6" height="7" /><rect x="96" y="${y - 46}" width="6" height="8" /><rect x="172" y="${y - 34}" width="6" height="7" /></g>
        <g fill="#140e1e" opacity=".7"><rect x="28" y="${y - 38}" width="7" height="9" /><rect x="76" y="${y - 44}" width="7" height="10" /><path d="M160 ${y - 30} l6 -6 l4 8 z" /></g>
        <g fill="${mid("#20182a")}">${Array.from({ length: 22 }, (_, i) => `<rect x="${i * 9.6 - 4}" y="${y - 22 - ((i * 7) % 9)}" width="6" height="${26 + ((i * 7) % 9)}" transform="rotate(${((i * 13) % 11) - 5} ${i * 9.6 - 1} ${y})" />`).join("")}<rect x="-6" y="${y - 14}" width="212" height="3" /></g>
        <g fill="${mid("#2a2234")}">${[[30, 0], [118, 1], [176, 0]].map(([cx, t]) => `<g transform="rotate(${t ? 8 : -6} ${cx} ${y + 4})"><rect x="${cx! - 2}" y="${y - 30}" width="4" height="34" /><rect x="${cx! - 9}" y="${y - 22}" width="18" height="4" /></g>`).join("")}</g>`
    }
    default:
      return ""
  }
}

/** Лучи от солнца/лампы на дальнем плане. */
function farRays(ctx: Ctx): string {
  const b = ctx.biome.id
  // В помещениях и в чаще свет нарисован в самой сцене (окно, лампы, лучи сквозь кроны)
  if (b === "basement" || b === "deep_forest" || b === "indoors" || b === "factory" || b === "infested") return ""
  const x = ctx.side === "left" ? 40 : 160
  const color = b === "roofs" || b === "canyon" ? "#ffd0a0" : b === "glacier" || b === "winter_park" ? "#e8f6ff" : "#fff6c8"
  return `<g fill="${color}" opacity=".18">${[-38, -14, 10, 34].map(a => `<path d="M${x} 30 L${x + Math.tan((a * Math.PI) / 180) * 140 - 10} ${HORIZON} L${x + Math.tan((a * Math.PI) / 180) * 140 + 10} ${HORIZON} Z" />`).join("")}</g>`
}

/** Передний план: травинки, камешки, снег у нижнего края — под ногами бойца и ближе к зрителю. */
function foreground(ctx: Ctx): string {
  const b = ctx.biome.id
  const c = hex(ctx.biome.colors.plain)
  const dark = shade(c, -0.3)
  const bottom = H - 4
  switch (b) {
    case "yard":
    case "jungle":
      return `<g stroke="${dark}" stroke-width="3" stroke-linecap="round" fill="none">${Array.from({ length: 18 }, (_, i) => `<path d="M${i * 12} ${bottom} q${(i % 3) - 1} -14 ${((i % 5) - 2) * 3} -${18 + (i % 4) * 6}" />`).join("")}</g>`
    case "winter_park":
    case "glacier":
      return `<path d="M-10 ${bottom - 16} q40 -12 80 0 t80 0 t80 0 V ${H} H -10 Z" fill="#ffffff" opacity=".85" />`
    case "desert":
    case "canyon":
      return `<g fill="${dark}">${[16, 60, 132, 180].map((x, i) => `<ellipse cx="${x}" cy="${bottom - 4}" rx="${10 + (i % 2) * 6}" ry="6" />`).join("")}</g>`
    case "dump":
      return `<g fill="${dark}"><rect x="10" y="${bottom - 12}" width="22" height="8" rx="2" transform="rotate(-10 20 ${bottom - 8})" /><circle cx="160" cy="${bottom - 6}" r="8" /></g>`
    case "deep_forest":
      return `${fern(52, bottom + 6, 46, "#3f7a2f")}${fern(150, bottom + 8, 40, "#4a8a35")}<g stroke="${dark}" stroke-width="3" stroke-linecap="round" fill="none">${Array.from({ length: 9 }, (_, i) => `<path d="M${i * 24 + 6} ${bottom} q${(i % 3) - 1} -10 ${((i % 5) - 2) * 3} -${12 + (i % 3) * 5}" />`).join("")}</g>`
    case "factory":
      return `<g fill="#3a3f45" stroke="#1e2226" stroke-width="1.5"><path d="M56 ${bottom - 10} l5 -3 l5 3 v6 l-5 3 l-5 -3 z" /><rect x="132" y="${bottom - 10}" width="26" height="5" rx="2" transform="rotate(-12 145 ${bottom - 8})" /></g><circle cx="61" cy="${bottom - 7}" r="1.8" fill="#8a96a0" />`
    case "infested":
      return `<g fill="#7fe04a"><ellipse cx="54" cy="${bottom - 4}" rx="22" ry="7" opacity=".3" /><ellipse cx="54" cy="${bottom - 4}" rx="13" ry="4" opacity=".85" /><circle cx="60" cy="${bottom - 6}" r="1.6" fill="#e6ffc0" /></g>${bone(136, bottom - 4, 160, bottom - 10, 4)}`
    default:
      return ""
  }
}

export interface BackdropLayers {
  /** Небо, светило, силуэты горизонта, лучи — двигать медленнее всего. */
  far: string
  /** Земля с фактурой и затенением к краю кадра. */
  mid: string
  /** Реквизит клетки с тенью и передний план — двигать быстрее всего. */
  near: string
}

/**
 * Фон кинематика тремя слоями одного размера (viewBox 0 0 200 300, прозрачные там, где слоя нет) —
 * для параллакса: far ← mid ← near. Склеенные по порядку дают `backdropSvg`.
 */
export function backdropLayersSvg(biomeId: string, terrain: TerrainId, side: Side): BackdropLayers {
  const biome = biomeDef(biomeId)
  const ctx: Ctx = { biome, terrain, side, x: side === "left" ? 108 : 92, id: `bd-${biomeId}-${terrain}-${side}` }
  const head = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`
  const haze = SKY_BOTTOM[biomeId] ?? "#eef9ff"
  const far = `${head}${defs(ctx)}${sky(ctx)}${farRays(ctx)}${distant(ctx)}
<defs><linearGradient id="${ctx.id}-haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${haze}" stop-opacity="0" /><stop offset="1" stop-color="${haze}" stop-opacity=".55" /></linearGradient></defs>
<rect x="0" y="${HORIZON - 40}" width="${W}" height="40" fill="url(#${ctx.id}-haze)" /></svg>`
  const mid = `${head}<defs><linearGradient id="${ctx.id}-gsh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0" /><stop offset="1" stop-color="#000" stop-opacity=".35" /></linearGradient>
<radialGradient id="${ctx.id}-spot" cx="${ctx.side === "left" ? "54%" : "46%"}" cy="62%" r="45%"><stop offset="0" stop-color="#fff" stop-opacity=".16" /><stop offset="1" stop-color="#fff" stop-opacity="0" /></radialGradient></defs>
${ground(ctx)}<rect x="0" y="${HORIZON}" width="${W}" height="${H - HORIZON}" fill="url(#${ctx.id}-gsh)" /><rect x="0" y="${HORIZON}" width="${W}" height="${H - HORIZON}" fill="url(#${ctx.id}-spot)" /></svg>`
  const near = `${head}<defs><filter id="${ctx.id}-ds" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="3" dy="5" stdDeviation="3" flood-color="#000" flood-opacity=".35" /></filter>
<linearGradient id="${ctx.id}-vig" x1="0" y1="0" x2="0" y2="1"><stop offset=".7" stop-color="#000" stop-opacity="0" /><stop offset="1" stop-color="#000" stop-opacity=".35" /></linearGradient></defs>
<ellipse cx="${ctx.x}" cy="${FEET + 4}" rx="70" ry="10" fill="#000" opacity=".18" /><g filter="url(#${ctx.id}-ds)">${prop(ctx)}</g>${foreground(ctx)}<rect x="0" y="0" width="${W}" height="${H}" fill="url(#${ctx.id}-vig)" /></svg>`
  return { far, mid, near }
}

/** Половина фона кинематика за бойцом, стоящим на клетке `terrain` биома `biomeId` (все слои вместе). */
export function backdropSvg(biomeId: string, terrain: TerrainId, side: Side): string {
  const layers = backdropLayersSvg(biomeId, terrain, side)
  const inner = (svg: string): string => svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  ${inner(layers.far)}
  ${inner(layers.mid)}
  ${inner(layers.near)}
</svg>`
}

export const BACKDROP = { W, H, HORIZON, FEET } as const
