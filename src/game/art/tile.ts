/**
 * Тайлы карты 64×64 (вид сверху) в зависимости от биома и типа местности.
 * Слои: основа → свет сверху-слева → фактура земли биома → объект клетки с тенью → ambient occlusion по краям.
 * Варианты (`variant`) меняют фактуру и зеркалят объект, чтобы поле не выглядело плиткой.
 */
import type { TerrainId } from "@game/core/types"
import { biomeDef } from "@game/content/biomes"
import { hex, shade } from "./palettes"

const S = 64

/** Детерминированный ГПСЧ для декора тайла (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashStr(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const f1 = (n: number): string => n.toFixed(1)

/** Кость (вид сверху): стержень с парой шишек на концах, с тёмной обводкой. */
function bone(x1: number, y1: number, x2: number, y2: number, w: number, c: string, dark: string): string {
  const a = Math.atan2(y2 - y1, x2 - x1)
  const px = -Math.sin(a) * w * 0.5
  const py = Math.cos(a) * w * 0.5
  const ends = [
    [x1 + px, y1 + py],
    [x1 - px, y1 - py],
    [x2 + px, y2 + py],
    [x2 - px, y2 - py]
  ]
  const knobs = (rad: number, fill: string): string =>
    ends.map(([x, y]) => `<circle cx="${f1(x ?? 0)}" cy="${f1(y ?? 0)}" r="${f1(rad)}" fill="${fill}" />`).join("")
  const line = `M${f1(x1)} ${f1(y1)} L${f1(x2)} ${f1(y2)}`
  return `<g><path d="${line}" stroke="${dark}" stroke-width="${f1(w + 2)}" stroke-linecap="round" />${knobs(w * 0.55 + 1, dark)}<path d="${line}" stroke="${c}" stroke-width="${f1(w)}" stroke-linecap="round" />${knobs(w * 0.55, c)}</g>`
}

/** Черепок: купол с глазницами и носом. */
function skull(cx: number, cy: number, s: number, c: string, dark: string): string {
  return `<g><rect x="${f1(cx - s * 0.55)}" y="${f1(cy + s * 0.4)}" width="${f1(s * 1.1)}" height="${f1(s * 0.7)}" rx="${f1(s * 0.2)}" fill="${c}" stroke="${dark}" stroke-width="1.2" /><circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(s)}" fill="${c}" stroke="${dark}" stroke-width="1.2" /><g fill="#2a2420"><ellipse cx="${f1(cx - s * 0.4)}" cy="${f1(cy + s * 0.1)}" rx="${f1(s * 0.28)}" ry="${f1(s * 0.32)}" /><ellipse cx="${f1(cx + s * 0.4)}" cy="${f1(cy + s * 0.1)}" rx="${f1(s * 0.28)}" ry="${f1(s * 0.32)}" /><path d="M${f1(cx)} ${f1(cy + s * 0.35)} l${f1(-s * 0.14)} ${f1(s * 0.3)} h${f1(s * 0.28)} z" /></g><path d="M${f1(cx - s * 0.3)} ${f1(cy + s * 0.75)} v${f1(s * 0.3)} M${f1(cx)} ${f1(cy + s * 0.75)} v${f1(s * 0.3)} M${f1(cx + s * 0.3)} ${f1(cy + s * 0.75)} v${f1(s * 0.3)}" stroke="${dark}" stroke-width=".9" /><ellipse cx="${f1(cx - s * 0.35)}" cy="${f1(cy - s * 0.5)}" rx="${f1(s * 0.3)}" ry="${f1(s * 0.16)}" fill="#fff" opacity=".45" /></g>`
}

/** Вайя папоротника: стебель с парными листочками, сужающаяся к кончику. */
function fern(x: number, y: number, len: number, angle: number, c: string, dark: string): string {
  let leaves = ""
  for (let k = 0; k < 7; k++) {
    const t = (k + 1) / 8
    const s = (1 - t) * len * 0.32 + 1.2
    leaves += `<ellipse cx="${f1(-s * 0.6)}" cy="${f1(-t * len)}" rx="${f1(s * 0.6)}" ry="${f1(s * 0.28)}" transform="rotate(25 0 ${f1(-t * len)})" /><ellipse cx="${f1(s * 0.6)}" cy="${f1(-t * len)}" rx="${f1(s * 0.6)}" ry="${f1(s * 0.28)}" transform="rotate(-25 0 ${f1(-t * len)})" />`
  }
  return `<g transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(angle)})"><path d="M0 0 V${f1(-len)}" stroke="${dark}" stroke-width="1.4" stroke-linecap="round" /><g fill="${c}" stroke="${dark}" stroke-width=".5">${leaves}</g></g>`
}

/** Звёздочка-искра (масло, светлячки, искры проводки). */
function spark(x: number, y: number, s: number, fill: string, opacity = 1): string {
  const k = s * 0.3
  return `<path d="M${f1(x)} ${f1(y - s)} L${f1(x + k)} ${f1(y - k)} L${f1(x + s)} ${f1(y)} L${f1(x + k)} ${f1(y + k)} L${f1(x)} ${f1(y + s)} L${f1(x - k)} ${f1(y + k)} L${f1(x - s)} ${f1(y)} L${f1(x - k)} ${f1(y - k)} Z" fill="${fill}" opacity="${opacity}" />`
}

function plainDeco(biomeId: string, base: string): string {
  const d = shade(base, -0.16)
  switch (biomeId) {
    case "jungle":
      return `<g fill="none" stroke="${d}" stroke-width="2" stroke-linecap="round"><path d="M10 48 q4 -10 8 -2 M14 48 q2 -12 10 -8 M44 20 q4 -10 8 -2 M48 20 q2 -12 10 -8 M30 56 q3 -8 7 -3" /></g>`
    case "desert":
      return `<g fill="none" stroke="${d}" stroke-width="1.6" stroke-linecap="round" opacity=".8"><path d="M4 18 q10 -6 20 0 t20 0 t20 0" /><path d="M-4 38 q10 -6 20 0 t20 0 t20 0" /><path d="M8 56 q10 -6 20 0 t20 0" /></g>`
    case "glacier":
      return `<g fill="none" stroke="${shade(base, -0.1)}" stroke-width="1.5"><path d="M6 10 l14 18 l-6 12 l12 18" /><path d="M40 6 l8 14 l10 -4" /></g><g fill="#fff" opacity=".55"><ellipse cx="44" cy="46" rx="12" ry="4" /></g>`
    case "canyon":
      return `<g fill="none" stroke="${d}" stroke-width="1.6"><path d="M4 20 h20 l6 8 h30" /><path d="M0 44 h16 l8 -6 h22 l6 6 h12" /></g><circle cx="50" cy="14" r="2.5" fill="${d}" />`
    case "roofs":
      return `<g stroke="${d}" stroke-width="1.5"><path d="M0 16 h64 M0 32 h64 M0 48 h64" /><path d="M16 0 v16 M48 0 v16 M32 16 v16 M16 32 v16 M48 32 v16 M32 48 v16" /></g>`
    case "basement":
      return `<path d="M14 40 l10 6 l-4 10" fill="none" stroke="${d}" stroke-width="1.5" />`
    case "dump":
      return `<g fill="${d}"><rect x="10" y="12" width="9" height="4" transform="rotate(-20 14 14)" /><circle cx="46" cy="44" r="3" /><rect x="30" y="50" width="6" height="6" /></g>`
    case "winter_park":
      return "<g fill=\"#fff\" opacity=\".7\"><ellipse cx=\"20\" cy=\"22\" rx=\"12\" ry=\"4\" /><ellipse cx=\"46\" cy=\"46\" rx=\"14\" ry=\"5\" /></g>"
    // У новых биомов весь характер равнины — в фактуре земли (паркет, бетон, мох, гниль)
    case "deep_forest":
    case "indoors":
    case "factory":
    case "infested":
      return ""
    default:
      return `<g stroke="${d}" stroke-width="2" stroke-linecap="round"><path d="M12 20 l2 -6 M16 20 l1 -5 M40 44 l2 -6 M44 44 l1 -5 M24 52 l2 -6" /></g>`
  }
}

function forestDeco(biomeId: string, base: string, frame = 0, id = "t"): string {
  const dark = shade(base, -0.25)
  const light = shade(base, 0.22)
  // Кадр 1 — листва качнулась: лёгкий наклон
  const sway = frame % 2 === 1 ? "transform=\"rotate(3 32 60)\"" : ""
  switch (biomeId) {
    case "jungle":
      return `<g ${sway}><g fill="${dark}" stroke="${shade(base, -0.4)}" stroke-width="1.2"><ellipse cx="18" cy="30" rx="14" ry="7" transform="rotate(-35 18 30)" /><ellipse cx="46" cy="24" rx="15" ry="7" transform="rotate(30 46 24)" /><ellipse cx="32" cy="46" rx="16" ry="7" transform="rotate(-10 32 46)" /></g><g fill="none" stroke="${light}" stroke-width="1.4"><path d="M8 36 l18 -12 M34 28 l22 -8 M18 50 l26 -6" /></g><path d="M56 0 q-6 20 2 40" fill="none" stroke="#7a5a3a" stroke-width="2.5" /></g>`
    case "desert":
      return `<g ${sway}><rect x="26" y="14" width="12" height="42" rx="6" fill="${base}" stroke="${dark}" stroke-width="1.5" /><rect x="12" y="24" width="9" height="18" rx="4.5" fill="${base}" stroke="${dark}" stroke-width="1.5" /><rect x="12" y="36" width="16" height="7" rx="3.5" fill="${base}" stroke="${dark}" stroke-width="1.5" /><rect x="42" y="18" width="9" height="20" rx="4.5" fill="${base}" stroke="${dark}" stroke-width="1.5" /><rect x="36" y="32" width="14" height="7" rx="3.5" fill="${base}" stroke="${dark}" stroke-width="1.5" /><g stroke="${shade(base, -0.45)}" stroke-width="1" stroke-linecap="round"><path d="M30 20 h4 M30 30 h4 M30 40 h4 M30 50 h4" /></g><circle cx="32" cy="14" r="3" fill="#ff8fb4" /></g>`
    case "glacier":
      return `<g ${sway}><g fill="${light}" stroke="${shade(base, -0.3)}" stroke-width="1.2"><path d="M6 44 l10 -18 l14 6 l-4 14 z" /><path d="M30 40 l12 -22 l16 10 l-6 16 z" /><path d="M14 56 l8 -10 l16 2 l-2 10 z" /></g><g fill="#fff" opacity=".7"><path d="M10 42 l8 -12 l6 3 z" /><path d="M34 36 l9 -14 l6 4 z" /></g></g>`
    case "canyon":
      return `<g ${sway}><g fill="${dark}" stroke="${shade(base, -0.45)}" stroke-width="1.2"><circle cx="22" cy="36" r="12" /><circle cx="44" cy="40" r="10" /></g><g stroke="${shade(base, -0.5)}" stroke-width="1.5" stroke-linecap="round"><path d="M22 22 v-6 M12 28 l-5 -4 M32 28 l5 -4 M44 28 v-5 M54 34 l5 -3 M14 44 l-6 3" /></g></g>`
    case "roofs":
      return "<g stroke=\"#8e5a3a\" stroke-width=\"5\" stroke-linecap=\"round\"><path d=\"M18 56 v-40 M46 56 v-28\" /></g><g stroke=\"#cfd8dc\" stroke-width=\"2\"><path d=\"M18 16 h-10 M18 24 h-6 M46 28 h10 M46 36 h6\" /></g>"
    case "basement":
      return "<g fill=\"#8d6e4a\" stroke=\"#5a4328\" stroke-width=\"1.5\"><rect x=\"6\" y=\"8\" width=\"24\" height=\"24\" /><rect x=\"34\" y=\"20\" width=\"24\" height=\"24\" /><rect x=\"12\" y=\"36\" width=\"20\" height=\"20\" /></g><g stroke=\"#5a4328\" stroke-width=\"1\"><path d=\"M6 8 l24 24 M30 8 l-24 24 M34 20 l24 24 M58 20 l-24 24\" /></g>"
    case "dump":
      return "<g><ellipse cx=\"32\" cy=\"36\" rx=\"26\" ry=\"16\" fill=\"#7d7760\" /><ellipse cx=\"22\" cy=\"28\" rx=\"14\" ry=\"10\" fill=\"#8e886d\" /><circle cx=\"44\" cy=\"26\" r=\"7\" fill=\"#2b2b2b\" /><circle cx=\"44\" cy=\"26\" r=\"3\" fill=\"#8e886d\" /><rect x=\"12\" y=\"40\" width=\"10\" height=\"6\" fill=\"#b7c0c8\" /></g>"
    case "winter_park":
      return "<g fill=\"#fff\" stroke=\"#d6e4f0\" stroke-width=\"1.5\"><ellipse cx=\"22\" cy=\"40\" rx=\"18\" ry=\"12\" /><ellipse cx=\"44\" cy=\"26\" rx=\"16\" ry=\"11\" /><ellipse cx=\"40\" cy=\"48\" rx=\"14\" ry=\"9\" /></g>"
    case "deep_forest": {
      // Чаща: ели сверху — ярусы звёздчатых лап, под ними папоротник; светлячки мерцают по кадрам
      const outline = shade(base, -0.5)
      const spruce = (cx: number, cy: number, rad: number): string => {
        let layers = ""
        for (let k = 0; k < 3; k++) {
          const ro = rad * (1 - k * 0.3)
          const ri = ro * 0.62
          const rot = k * 22.5
          let d = ""
          for (let i = 0; i < 16; i++) {
            const a = ((i * 22.5 + rot - 90) * Math.PI) / 180
            const rr = i % 2 ? ri : ro
            d += `${i ? "L" : "M"}${f1(cx + Math.cos(a) * rr)} ${f1(cy + Math.sin(a) * rr)} `
          }
          layers += `<path d="${d}Z" fill="${shade(base, -0.12 + k * 0.17)}" stroke="${outline}" stroke-width="1" stroke-linejoin="round" />`
        }
        return `<g>${layers}<circle cx="${f1(cx - rad * 0.12)}" cy="${f1(cy - rad * 0.12)}" r="${f1(rad * 0.16)}" fill="${shade(base, 0.45)}" /></g>`
      }
      const glow = frame % 2 === 1 ? 1 : 0.45
      const flies = [[12, 14], [54, 22], [34, 58]]
        .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4" fill="#f6ff9a" opacity="${f1(glow * 0.3)}" /><circle cx="${x}" cy="${y}" r="1.4" fill="#fbffd0" opacity="${glow}" />`)
        .join("")
      return `<g ${sway}>${fern(8, 60, 16, 30, light, dark)}${fern(58, 62, 14, -40, light, dark)}${spruce(44, 42, 17)}${spruce(21, 25, 19)}${spruce(16, 52, 10)}</g>${flies}`
    }
    case "indoors": {
      // Цветы в горшках: большая монстера в терракотовом горшке и фикус поменьше
      const dk = shade(base, -0.4)
      const leaf = (a: number, len: number): string =>
        `<g transform="rotate(${a} 24 28)"><ellipse cx="24" cy="${f1(28 - len * 0.55)}" rx="${f1(len * 0.38)}" ry="${f1(len * 0.55)}" fill="${base}" stroke="${dk}" stroke-width="1.1" /><path d="M24 28 V${f1(28 - len)}" stroke="${shade(base, 0.3)}" stroke-width="1.2" /><path d="M${f1(24 - len * 0.38)} ${f1(28 - len * 0.6)} l${f1(len * 0.18)} 1 M${f1(24 + len * 0.38)} ${f1(28 - len * 0.45)} l${f1(-len * 0.18)} -1" stroke="${shade("#b9875a", -0.1)}" stroke-width="1.6" /></g>`
      const ficus = [[46, 44], [52, 48], [42, 50], [48, 54], [44, 40], [52, 42]]
        .map(([x, y], i) => `<ellipse cx="${x}" cy="${y}" rx="4.2" ry="2.8" transform="rotate(${i * 50} ${x} ${y})" fill="${i % 2 ? shade(base, 0.12) : shade(base, -0.06)}" stroke="${dk}" stroke-width=".8" />`)
        .join("")
      return `<g><circle cx="24" cy="28" r="12" fill="#c8693c" stroke="#7a3a1f" stroke-width="1.6" /><circle cx="24" cy="28" r="9" fill="#4a3020" /><circle cx="47" cy="47" r="9" fill="#e8e1d4" stroke="#9a8f80" stroke-width="1.4" /><circle cx="47" cy="47" r="6.5" fill="#4a3020" /></g><g ${sway}>${[200, 260, 320, 30, 100, 150].map((a, i) => leaf(a, 15 + (i % 3) * 2)).join("")}${ficus}<circle cx="21" cy="25" r="1.5" fill="#fff" opacity=".4" /></g>`
    }
    case "factory": {
      // Клубок кабелей и шлангов: толстые жгуты с бликом, разъёмы; на оборванном конце искрит
      const cable = (d: string, c: string, w: number): string =>
        `<path d="${d}" fill="none" stroke="${shade(c, -0.5)}" stroke-width="${w + 2.4}" stroke-linecap="round" /><path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" /><path d="${d}" fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round" opacity=".22" transform="translate(-1 -1)" />`
      const hot = frame % 2 === 1
      return `<g>${cable("M0 42 C 18 52, 24 20, 44 18 S 62 30, 54 44 S 30 62, 18 54", "#d9b030", 5)}${cable("M2 18 C 20 2, 40 40, 22 44 S 4 30, 30 26 S 60 40, 62 60", base, 6)}${cable("M8 62 C 14 38, 50 50, 40 30 S 30 10, 50 8", "#b8443a", 4)}<g fill="#9aa4ab" stroke="#3a4046" stroke-width="1"><rect x="47" y="4" width="8" height="7" rx="1.5" /><rect x="0" y="15" width="6" height="7" rx="1.5" /></g><path d="M50 8 l4 -3 M50 8 l5 1" stroke="#e0a050" stroke-width="1.2" /></g>${spark(56, 6, hot ? 6 : 3.5, "#ffe27a", hot ? 1 : 0.7)}${hot ? spark(60, 12, 2.5, "#ff9a3a") : ""}`
    }
    case "infested": {
      // Мёртвый кустарник: голые ветки, на них фиолетовый грибок и светящиеся шляпки
      const twigs = "M32 36 l-14 -16 l-6 -3 M24 27 l-2 -10 M32 36 l14 -15 l2 -9 M42 25 l9 1 M32 36 l-18 9 l-7 6 M20 42 l-2 9 M32 36 l14 14 l9 2 M41 45 l2 10 M32 36 l1 -22"
      const twigs2 = "M52 54 l-6 -6 M52 54 l6 -8 M52 54 l-2 -10 M10 14 l6 6 M10 14 l-2 7"
      return `<g ${sway}><g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="${twigs}${twigs2}" stroke="${shade(base, -0.45)}" stroke-width="5" /><path d="${twigs}${twigs2}" stroke="${shade(base, 0.35)}" stroke-width="2.6" /></g><g fill="#8a5ab8" stroke="#4a2a6a" stroke-width=".9"><ellipse cx="24" cy="27" rx="5" ry="3.5" /><ellipse cx="42" cy="25" rx="4" ry="3" /><ellipse cx="22" cy="43" rx="4.5" ry="3" /><ellipse cx="40" cy="45" rx="3.5" ry="2.6" /></g><g fill="#c9a0ff" opacity=".7"><circle cx="23" cy="26" r="1.5" /><circle cx="41" cy="24" r="1.2" /><circle cx="21" cy="42" r="1.3" /></g><g fill="#9fff5a"><circle cx="33" cy="14" r="2.4" /><circle cx="13" cy="17" r="2" /><circle cx="51" cy="12" r="2" /><circle cx="58" cy="46" r="2" /></g><g fill="#9fff5a" opacity=".3"><circle cx="33" cy="14" r="5" /><circle cx="51" cy="12" r="4.4" /></g></g>`
    }
    default: {
      // Кусты: каждый — гроздь кругов листвы с объёмной заливкой, тёмными промежутками и бликами
      const bush = (cx: number, cy: number, r: number): string => {
        const parts = [
          [0, 0, 1],
          [-0.55, 0.25, 0.7],
          [0.55, 0.3, 0.68],
          [-0.3, -0.5, 0.62],
          [0.35, -0.45, 0.6]
        ]
        const leaves = parts
          .map(([dx, dy, k]) => `<circle cx="${f1(cx + (dx ?? 0) * r)}" cy="${f1(cy + (dy ?? 0) * r)}" r="${f1(r * (k ?? 1) * 0.72)}" fill="url(#${id}-leaf)" stroke="${shade(base, -0.45)}" stroke-width=".9" />`)
          .join("")
        const glints = [0, 1, 2]
          .map(i => `<ellipse cx="${f1(cx - r * 0.35 + i * r * 0.28)}" cy="${f1(cy - r * 0.45 + (i % 2) * r * 0.2)}" rx="${f1(r * 0.13)}" ry="${f1(r * 0.08)}" fill="#fff" opacity=".35" />`)
          .join("")
        return `<g>${leaves}${glints}</g>`
      }
      return `<g ${sway}>${bush(22, 24, 13)}${bush(44, 41, 12)}${bush(22, 47, 9)}<g fill="${dark}" opacity=".55"><circle cx="30" cy="34" r="1.4" /><circle cx="50" cy="30" r="1.1" /><circle cx="14" cy="36" r="1.2" /></g></g>`
    }
  }
}

function mountainDeco(biomeId: string): string {
  switch (biomeId) {
    case "jungle":
      return "<g fill=\"#8c8a6a\" stroke=\"#5a5a44\" stroke-width=\"1.5\"><rect x=\"8\" y=\"40\" width=\"48\" height=\"16\" /><rect x=\"14\" y=\"26\" width=\"36\" height=\"16\" /><rect x=\"22\" y=\"12\" width=\"20\" height=\"16\" /></g><g fill=\"#4f8f45\" opacity=\".8\"><ellipse cx=\"14\" cy=\"42\" rx=\"7\" ry=\"3\" /><ellipse cx=\"46\" cy=\"28\" rx=\"6\" ry=\"3\" /><ellipse cx=\"32\" cy=\"14\" rx=\"5\" ry=\"2.5\" /></g><rect x=\"28\" y=\"46\" width=\"8\" height=\"10\" fill=\"#2a2a20\" />"
    case "desert":
      return "<path d=\"M0 54 Q 20 20 44 30 Q 56 36 64 28 L 64 64 L 0 64 Z\" fill=\"#e2c17a\" stroke=\"#c9a257\" stroke-width=\"1.2\" /><path d=\"M6 50 Q 24 28 42 34\" fill=\"none\" stroke=\"#fff\" stroke-width=\"1.5\" opacity=\".5\" /><g fill=\"none\" stroke=\"#c9a257\" stroke-width=\"1\"><path d=\"M10 58 q6 -3 12 0 t12 0\" /></g>"
    case "glacier":
      return "<path d=\"M8 56 L 20 20 L 30 30 L 38 8 L 50 28 L 58 56 Z\" fill=\"#a9d8f0\" stroke=\"#5d9cc5\" stroke-width=\"1.5\" stroke-linejoin=\"round\" /><path d=\"M20 20 L 26 44 M38 8 L 44 40\" fill=\"none\" stroke=\"#e8f6ff\" stroke-width=\"2\" /><path d=\"M30 30 L 34 56\" stroke=\"#5d9cc5\" stroke-width=\"1\" />"
    case "canyon":
      return "<g fill=\"#b5653a\" stroke=\"#6e3a1f\" stroke-width=\"1.5\"><path d=\"M14 58 L 18 14 Q 32 6 44 16 L 50 58 Z\" /></g><g stroke=\"#8a4a2e\" stroke-width=\"1.6\"><path d=\"M18 30 h30 M16 42 h34 M20 22 h22\" /></g><path d=\"M22 14 q10 -8 20 0\" fill=\"none\" stroke=\"#e0a070\" stroke-width=\"2\" />"
    case "roofs":
      return "<rect x=\"10\" y=\"10\" width=\"44\" height=\"44\" rx=\"4\" fill=\"#9aa3ad\" stroke=\"#5f6a73\" stroke-width=\"2\" /><g stroke=\"#5f6a73\" stroke-width=\"2\"><path d=\"M16 20 h32 M16 28 h32 M16 36 h32 M16 44 h32\" /></g>"
    case "basement":
      return "<rect x=\"8\" y=\"6\" width=\"48\" height=\"52\" fill=\"#6d5a45\" stroke=\"#3f3222\" stroke-width=\"2\" /><g fill=\"#8d7658\"><rect x=\"10\" y=\"22\" width=\"44\" height=\"4\" /><rect x=\"10\" y=\"40\" width=\"44\" height=\"4\" /></g><g fill=\"#a3c9a8\"><rect x=\"14\" y=\"10\" width=\"8\" height=\"12\" /><rect x=\"26\" y=\"12\" width=\"8\" height=\"10\" /><rect x=\"40\" y=\"28\" width=\"10\" height=\"12\" fill=\"#e9c46a\" /></g>"
    case "dump":
      return "<g fill=\"#2b2b2b\" stroke=\"#111\" stroke-width=\"1\"><ellipse cx=\"32\" cy=\"44\" rx=\"24\" ry=\"9\" /><ellipse cx=\"30\" cy=\"32\" rx=\"22\" ry=\"9\" /><ellipse cx=\"34\" cy=\"20\" rx=\"20\" ry=\"8\" /></g><g fill=\"#555\"><ellipse cx=\"34\" cy=\"20\" rx=\"8\" ry=\"3\" /></g>"
    case "winter_park":
      return "<path d=\"M32 6 l-22 36 h44 z\" fill=\"#2f6b3a\" stroke=\"#1f4a28\" stroke-width=\"2\" /><path d=\"M32 20 l-26 38 h52 z\" fill=\"#3d7f49\" stroke=\"#1f4a28\" stroke-width=\"2\" /><g fill=\"#fff\" opacity=\".85\"><ellipse cx=\"26\" cy=\"34\" rx=\"8\" ry=\"3\" /><ellipse cx=\"38\" cy=\"48\" rx=\"10\" ry=\"3\" /></g>"
    case "deep_forest":
      // Валун, обросший мхом: светлая грань сверху-слева, мох шапкой
      return `<path d="M8 50 Q4 30 16 18 Q30 4 46 12 Q60 22 57 42 Q52 58 32 59 Q14 59 8 50 Z" fill="#7d7f73" stroke="#43453d" stroke-width="2" /><path d="M30 58 Q50 56 55 42 Q58 30 50 20 Q52 36 44 46 Q36 54 22 56 Z" fill="#5f6157" /><path d="M14 30 Q20 16 34 12" fill="none" stroke="#b3b5a8" stroke-width="2.4" stroke-linecap="round" /><path d="M38 30 l6 8 l-2 8" fill="none" stroke="#43453d" stroke-width="1.4" /><path d="M10 34 Q12 18 26 12 Q40 6 50 14 Q44 22 34 20 Q26 26 22 22 Q16 32 10 34 Z" fill="#4f8a3a" stroke="#2f5a26" stroke-width="1.2" /><g fill="#7ab45a"><circle cx="22" cy="16" r="2.2" /><circle cx="34" cy="12" r="1.8" /><circle cx="16" cy="25" r="1.6" /><circle cx="42" cy="13" r="1.4" /></g><ellipse cx="44" cy="50" rx="5" ry="2.4" fill="#4f8a3a" opacity=".9" />${fern(6, 62, 12, 25, "#5f9a45", "#2f5a26")}`
    case "indoors":
      // Шкаф (вид чуть сверху): крышка с коробкой и шляпной картонкой, фасад с двумя дверцами
      return "<rect x=\"6\" y=\"4\" width=\"52\" height=\"24\" rx=\"2\" fill=\"#82603f\" stroke=\"#3e2a1a\" stroke-width=\"1.8\" /><path d=\"M10 10 h44 M10 16 q20 2 44 0 M10 22 h44\" stroke=\"#6b4a32\" stroke-width=\"1\" opacity=\".7\" /><rect x=\"6\" y=\"28\" width=\"52\" height=\"32\" fill=\"#6b4a32\" stroke=\"#3e2a1a\" stroke-width=\"1.8\" /><path d=\"M32 28 v32\" stroke=\"#3e2a1a\" stroke-width=\"1.6\" /><g fill=\"none\" stroke=\"#4f3522\" stroke-width=\"1.2\"><rect x=\"10\" y=\"32\" width=\"18\" height=\"24\" rx=\"1\" /><rect x=\"36\" y=\"32\" width=\"18\" height=\"24\" rx=\"1\" /></g><g fill=\"#e0b060\" stroke=\"#8a6420\" stroke-width=\".8\"><circle cx=\"28.5\" cy=\"44\" r=\"1.8\" /><circle cx=\"35.5\" cy=\"44\" r=\"1.8\" /></g><ellipse cx=\"22\" cy=\"15\" rx=\"9\" ry=\"6\" fill=\"#e89aae\" stroke=\"#a85a6e\" stroke-width=\"1.2\" /><path d=\"M13 15 q9 3 18 0\" stroke=\"#fff\" stroke-width=\"1.4\" fill=\"none\" opacity=\".7\" /><rect x=\"36\" y=\"8\" width=\"16\" height=\"12\" rx=\"1\" fill=\"#d9b98a\" stroke=\"#8a6a40\" stroke-width=\"1.2\" /><path d=\"M36 13 h16\" stroke=\"#8a6a40\" stroke-width=\"1\" /><path d=\"M8 30 h48\" stroke=\"#fff\" stroke-width=\"1\" opacity=\".25\" />"
    case "factory":
      // Станок: корпус на основании в жёлтую полосу, шестерня, пульт с кнопкой, труба
      return `<rect x="4" y="48" width="56" height="12" fill="#e8c22a" stroke="#2a2a2a" stroke-width="1.5" /><g fill="#2a2a2a">${[0, 1, 2, 3, 4, 5].map(i => `<path d="M${4 + i * 10} 60 l6 -12 h5 l-6 12 z" />`).join("")}</g><rect x="8" y="8" width="48" height="44" rx="3" fill="#5a6670" stroke="#2c343a" stroke-width="2" /><rect x="11" y="11" width="42" height="6" rx="1" fill="#7a8892" /><g transform="translate(23 32)"><g fill="#9aa8b2" stroke="#2c343a" stroke-width="1">${[0, 45, 90, 135].map(a => `<rect x="-2.5" y="-12" width="5" height="24" transform="rotate(${a})" />`).join("")}</g><circle r="9" fill="#9aa8b2" stroke="#2c343a" stroke-width="1.2" /><circle r="3.5" fill="#2c343a" /></g><rect x="38" y="22" width="14" height="16" rx="1.5" fill="#3a444c" stroke="#1e2428" stroke-width="1" /><circle cx="45" cy="28" r="3" fill="#e0403a" stroke="#7a1a16" stroke-width="1" /><circle cx="41" cy="35" r="1.4" fill="#5aff7a" /><circle cx="49" cy="35" r="1.4" fill="#ffb347" /><path d="M56 30 h4 q2 0 2 2 v24" fill="none" stroke="#2c343a" stroke-width="6" /><path d="M56 30 h4 q2 0 2 2 v24" fill="none" stroke="#8a9aa4" stroke-width="3.6" /><g stroke="#2c343a" stroke-width="1.4"><path d="M38 42 h14 M38 45 h14" /></g>`
    case "infested": {
      // Груда костей с черепами
      const c = "#d8d0b8"
      const dk = "#6a604a"
      return `<ellipse cx="32" cy="46" rx="28" ry="14" fill="#2e2a22" opacity=".55" />${bone(6, 52, 30, 44, 4.2, c, dk)}${bone(34, 56, 58, 48, 4.2, c, dk)}${bone(12, 36, 34, 48, 4, c, dk)}${bone(30, 40, 54, 34, 4, c, dk)}${bone(16, 26, 38, 32, 3.6, c, dk)}${bone(24, 50, 46, 58, 3.6, c, dk)}${bone(38, 20, 48, 40, 3.4, c, dk)}${skull(24, 22, 7, c, dk)}${skull(44, 40, 6, c, dk)}${skull(12, 44, 5, c, dk)}<g fill="#7fe04a" opacity=".55"><ellipse cx="34" cy="52" rx="4" ry="1.6" /><ellipse cx="18" cy="34" rx="2.6" ry="1.2" /></g>`
    }
    default:
      return `<g stroke="#6b4a2c" stroke-width="1.2">${[0, 1, 2].map(r => [0, 1].map(c => `<g><rect x="${8 + c * 26 + (r % 2 ? 13 : 0) - (r % 2 ? 13 : 0)}" y="${12 + r * 14}" width="24" height="12" rx="6" fill="#a8763f" /><circle cx="${20 + c * 26}" cy="${18 + r * 14}" r="4.5" fill="#e0b57a" /></g>`).join("")).join("")}</g>`
  }
}

function waterDeco(biomeId: string, base: string, frame = 0): string {
  const light = shade(base, 0.35)
  // Кадры: волны смещаются по горизонтали и чуть меняют амплитуду
  const dx = (frame % 4) * 4
  const amp = frame % 2 === 1 ? 5 : 4
  const waves = `<g fill="none" stroke="${light}" stroke-width="2.4" stroke-linecap="round" opacity=".85" transform="translate(${dx} 0)"><path d="M-6 22 q6 -${amp} 12 0 t12 0 t12 0 t12 0 t12 0" /><path d="M-6 40 q6 -${amp} 12 0 t12 0 t12 0 t12 0 t12 0" /><path d="M-6 56 q6 -${amp} 12 0 t12 0 t12 0 t12 0 t12 0" /></g>`
  switch (biomeId) {
    case "jungle":
      return `${waves}<g fill="#2f5a36" opacity=".7"><ellipse cx="18" cy="32" rx="9" ry="4" /><ellipse cx="46" cy="46" rx="8" ry="3.5" /></g><g fill="none" stroke="#9fd38a" stroke-width="1.2" opacity=".8"><circle cx="${12 + dx}" cy="14" r="2" /><circle cx="${40 + dx}" cy="26" r="1.5" /><circle cx="${28 + dx}" cy="52" r="2.2" /></g>`
    case "desert":
      return `<ellipse cx="32" cy="36" rx="24" ry="16" fill="#5bc0eb" stroke="#e8d7a0" stroke-width="4" />${waves.replace("opacity=\".85\"", "opacity=\".7\"")}<path d="M48 22 q-2 -14 4 -18 M48 22 q-10 -8 -14 -4 M48 22 q10 -8 14 -4" fill="none" stroke="#3f8f45" stroke-width="2.4" stroke-linecap="round" /><rect x="46" y="22" width="4" height="12" fill="#8d6248" />`
    case "glacier":
      return `<path d="M6 12 l10 -4 l14 6 l12 -6 l14 6 l2 38 l-14 6 l-12 -4 l-14 6 l-12 -8 z" fill="#3a7fc1" stroke="#e8f6ff" stroke-width="3" />${waves}`
    case "canyon":
      return `<path d="M0 26 C 16 18, 24 42, 40 34 S 56 20, 64 30 L 64 42 C 50 36, 42 56, 26 48 S 10 40, 0 44 Z" fill="#4fa3d1" stroke="#2f6f96" stroke-width="1.2" />${waves.replace("opacity=\".85\"", "opacity=\".6\"")}`
    case "roofs":
      return "<path d=\"M8 20 l14 -10 l16 6 l14 -8 l8 14 l-6 18 l-16 10 l-20 -4 l-10 -12 z\" fill=\"#1b1a24\" stroke=\"#3b3550\" stroke-width=\"2\" />"
    case "dump":
      return "<g><ellipse cx=\"32\" cy=\"34\" rx=\"26\" ry=\"18\" fill=\"#171717\" /><path d=\"M14 30 q18 -6 36 0\" fill=\"none\" stroke=\"#7c6cff\" stroke-width=\"2\" opacity=\".6\" /><path d=\"M18 40 q14 4 28 -2\" fill=\"none\" stroke=\"#5ad1c8\" stroke-width=\"2\" opacity=\".5\" /></g>"
    case "winter_park":
      return "<ellipse cx=\"32\" cy=\"32\" rx=\"24\" ry=\"18\" fill=\"#9fd3f2\" stroke=\"#e9f4fb\" stroke-width=\"4\" /><path d=\"M50 22 l8 -6 M10 44 l-6 6\" stroke=\"#e9f4fb\" stroke-width=\"1.5\" />"
    case "deep_forest": {
      // Лесной ручей: течение, камни с мхом и бурунами, по воде плывёт лист
      const rock = (x: number, y: number, rx: number, ry: number): string =>
        `<ellipse cx="${x}" cy="${y}" rx="${rx + 3 + (frame % 2)}" ry="${ry + 2}" fill="none" stroke="#e8f6ff" stroke-width="1.4" opacity=".7" /><ellipse cx="${x + 1}" cy="${y + 1.5}" rx="${rx}" ry="${ry}" fill="#000" opacity=".25" /><ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#8a8c80" stroke="#4a4c44" stroke-width="1.2" /><ellipse cx="${x - rx * 0.25}" cy="${y - ry * 0.35}" rx="${rx * 0.6}" ry="${ry * 0.45}" fill="#5f9a45" />`
      return `${waves}${rock(16, 30, 7, 5)}${rock(48, 48, 6, 4.5)}${rock(50, 12, 4, 3)}<g transform="translate(${8 + dx * 2} ${50 - (frame % 2) * 2}) rotate(${frame * 25})"><ellipse rx="4.5" ry="2.4" fill="#d08a3a" stroke="#7a4a1a" stroke-width=".8" /><path d="M-4 0 h8" stroke="#7a4a1a" stroke-width=".7" /></g>`
    }
    case "indoors": {
      // Ванна на полу: эмалированная чаша, кран, слив, пена — и резиновый утёнок покачивается
      const dark = shade(base, -0.3)
      const ph = [0, 2, 4, 2][frame % 4] ?? 0
      const bob = [0, 1, 0, -1][frame % 4] ?? 0
      return `<rect x="5" y="5" width="54" height="55" rx="17" fill="#f6f7f9" stroke="#8a98a6" stroke-width="2" /><rect x="11" y="14" width="42" height="41" rx="13" fill="${base}" stroke="#c4ced8" stroke-width="2.4" /><g fill="none" stroke="${shade(base, 0.35)}" stroke-width="1.8" stroke-linecap="round" opacity=".9"><path d="M${16 + ph} 26 q4 -2.5 8 0 t8 0" /><path d="M${30 - ph} 44 q4 -2.5 8 0 t8 0" /></g><ellipse cx="22" cy="22" rx="6" ry="3" fill="#fff" opacity=".35" /><circle cx="32" cy="48" r="2" fill="${dark}" /><rect x="28" y="5" width="8" height="9" rx="2" fill="#cfd8dc" stroke="#6a7882" stroke-width="1" /><g fill="#e8eef2" stroke="#6a7882" stroke-width="1"><circle cx="21" cy="9" r="3" /><circle cx="43" cy="9" r="3" /></g><g fill="#fff" opacity=".9"><circle cx="44" cy="20" r="3" /><circle cx="48" cy="23" r="2.4" /><circle cx="42" cy="24" r="2" /></g><g transform="translate(${26 + ph} ${35 + bob})"><ellipse cx="0" cy="1" rx="6" ry="4.5" fill="#000" opacity=".15" /><ellipse cx="0" cy="0" rx="6" ry="4.5" fill="#ffd23a" stroke="#b88a10" stroke-width="1" /><circle cx="4" cy="-3" r="3.3" fill="#ffd23a" stroke="#b88a10" stroke-width="1" /><path d="M6.6 -3 l3 .8 l-3 1" fill="#ff8a2a" /><circle cx="4.6" cy="-4" r=".8" fill="#222" /></g>`
    }
    case "factory": {
      // Масляная лужа: тёмный глянец с радужными разводами, которые медленно плывут
      const ox = [0, 2, 4, 2][frame % 4] ?? 0
      const oy = [0, 1, 0, -1][frame % 4] ?? 0
      const sheen = (y: number, k: number): string =>
        ["#b07aff", "#5ad1c8", "#ffd75a"].map((c, i) => `<path d="M${6 + k} ${y + i * 2.4} q10 -7 20 -1 t22 1 q6 2 10 -2" stroke="${c}" stroke-width="2" fill="none" stroke-linecap="round" opacity=".5" />`).join("")
      return `<g transform="translate(${ox} ${oy})">${sheen(16, 0)}${sheen(42, -4)}</g><ellipse cx="18" cy="12" rx="9" ry="3" fill="#fff" opacity=".12" /><g fill="none" stroke="#6a6070" stroke-width="1"><circle cx="${44 - ox}" cy="30" r="${2 + (frame % 2)}" /><circle cx="20" cy="${52 + oy}" r="1.6" /></g>`
    }
    case "infested": {
      // Ядовитая жижа: тёмные разводы и пузыри, которые растут и лопаются по кадрам
      const dark = shade(base, -0.38)
      const bubbles = [[14, 18], [44, 14], [30, 34], [52, 44], [16, 50], [38, 56]]
        .map(([x, y], i) => {
          const st = (i + frame) % 4
          if (st === 0) return `<circle cx="${x}" cy="${y}" r="4.5" fill="none" stroke="#e6ffb0" stroke-width="1" opacity=".55" />`
          const rad = 1.4 + st * 1.2
          return `<circle cx="${x}" cy="${y}" r="${f1(rad)}" fill="${shade(base, 0.25)}" stroke="${dark}" stroke-width="1" /><circle cx="${f1((x ?? 0) - rad * 0.35)}" cy="${f1((y ?? 0) - rad * 0.35)}" r="${f1(rad * 0.3)}" fill="#fff" opacity=".8" />`
        })
        .join("")
      return `<g fill="none" stroke="${dark}" stroke-width="2.4" stroke-linecap="round" opacity=".45" transform="translate(${dx / 2} 0)"><path d="M4 26 q10 -8 20 0 t16 4" /><path d="M24 46 q12 6 24 -2 t14 0" /><path d="M36 22 q6 -6 14 -2" /></g><g transform="translate(0 ${frame % 2})">${bone(40, 26, 54, 30, 3, "#d8d0b8", "#4a5a2a")}</g>${bubbles}`
    }
    default:
      return waves
  }
}

/** Стена стоит отдельным объектом на земле биома (а не заливает клетку целиком). */
function wallOnGround(biomeId: string, broken: boolean): boolean {
  if (["dump", "winter_park", "infested"].includes(biomeId)) return true
  // Гнилое бревно лежит на мху, сквозь ржавую решётку виден бетон
  return broken && (biomeId === "deep_forest" || biomeId === "factory")
}

function wallDeco(biomeId: string, base: string, broken: boolean, variant = 0): string {
  const mortar = shade(base, -0.35)
  const crack = broken
    ? "<path d=\"M30 4 l6 14 l-6 10 l8 16 l-4 14\" fill=\"none\" stroke=\"#1a1a1a\" stroke-width=\"2.5\" stroke-linejoin=\"round\" />"
    : ""
  switch (biomeId) {
    case "jungle":
      return `<g fill="${base}" stroke="${mortar}" stroke-width="1.4">${[0, 1, 2, 3, 4].map(i => `<rect x="${i * 12 + 3}" y="2" width="8" height="60" rx="4" />`).join("")}</g><g stroke="${mortar}" stroke-width="1.6">${[0, 1, 2, 3, 4].map(i => `<path d="M${i * 12 + 3} 22 h8 M${i * 12 + 3} 44 h8" />`).join("")}</g><path d="M0 14 q32 10 64 -2 M0 50 q32 -10 64 2" fill="none" stroke="#6b4a2c" stroke-width="2" />${broken ? `<path d="M26 2 l4 20 l-6 8 l8 16" fill="none" stroke="#3a2a14" stroke-width="2.5" /><rect x="39" y="2" width="8" height="26" fill="${hex(biomeDef(biomeId).colors.plain)}" />` : ""}`
    case "desert":
      return `<g fill="${base}" stroke="${mortar}" stroke-width="1.2">${[0, 1, 2, 3, 4].map(r => [0, 1, 2].map(c => `<rect x="${c * 24 + (r % 2 ? 12 : 0) - 10}" y="${r * 13 + 1}" width="22" height="11" rx="2" />`).join("")).join("")}</g><g stroke="${mortar}" stroke-width="2" opacity=".7"><path d="M8 8 h4 M30 34 h6 M50 60 h5" /></g>${crack}`
    case "glacier":
      return `<g fill="${base}" stroke="#e8f6ff" stroke-width="1.5">${[0, 1, 2, 3].map(r => [0, 1, 2].map(c => `<rect x="${c * 24 + (r % 2 ? 12 : 0) - 10}" y="${r * 16 + 1}" width="22" height="14" rx="3" />`).join("")).join("")}</g><g stroke="#fff" stroke-width="1" opacity=".8"><path d="M6 6 l6 4 M30 22 l6 4 M44 54 l6 4" /></g>${crack}`
    case "canyon":
      return `<g fill="${base}" stroke="${mortar}" stroke-width="1.2"><rect x="0" y="0" width="64" height="64" /><path d="M0 12 q32 4 64 -2 M0 26 q32 -4 64 2 M0 40 q32 4 64 -2 M0 54 q32 -4 64 2" fill="none" stroke="${shade(base, 0.2)}" stroke-width="3" /></g>${broken ? `<g fill="${shade(base, -0.2)}"><circle cx="20" cy="20" r="5" /><circle cx="44" cy="36" r="4" /><circle cx="30" cy="50" r="6" /><circle cx="52" cy="12" r="3" /></g>` : ""}`
    case "dump":
      return `<rect x="12" y="4" width="40" height="56" rx="3" fill="#dfe6ea" stroke="#8a949b" stroke-width="2" /><path d="M12 28 h40" stroke="#8a949b" stroke-width="2" /><rect x="44" y="10" width="3" height="12" rx="1.5" fill="#8a949b" /><rect x="44" y="34" width="3" height="18" rx="1.5" fill="#8a949b" />${broken ? "<path d=\"M14 6 l10 18 l-8 12 l12 16\" fill=\"none\" stroke=\"#5a5a5a\" stroke-width=\"2\" />" : ""}`
    case "winter_park":
      return `<g fill="#eef5fb" stroke="#b9cfe0" stroke-width="1.5">${[0, 1, 2, 3].map(r => [0, 1, 2].map(c => `<rect x="${c * 24 + (r % 2 ? 12 : 0) - 10}" y="${r * 16 + 1}" width="22" height="14" rx="3" />`).join("")).join("")}</g>${crack}`
    case "yard":
      return `<g fill="${base}" stroke="${mortar}" stroke-width="1.5">${[0, 1, 2, 3].map(i => `<rect x="${i * 16 + 1}" y="2" width="12" height="60" rx="2" />`).join("")}<rect x="0" y="18" width="64" height="5" /><rect x="0" y="42" width="64" height="5" /></g>${broken ? `<rect x="33" y="2" width="12" height="26" fill="${hex(biomeDef(biomeId).colors.plain)}" /><path d="M20 4 l-4 24 l6 -4 l-3 26" fill="none" stroke="#3a2a14" stroke-width="2" />` : ""}`
    case "deep_forest": {
      const dk = shade(base, -0.45)
      if (broken) {
        // Гнилое бревно на мху: трухлявые дыры, грибы-трутовики, срез с кольцами
        return `<rect x="0" y="14" width="60" height="36" rx="8" fill="${base}" stroke="${dk}" stroke-width="2" /><g stroke="${shade(base, -0.3)}" stroke-width="1.6" fill="none" stroke-linecap="round"><path d="M4 22 q20 -2 46 1 M2 32 q24 2 50 -1 M6 42 q22 -2 44 1" /></g><path d="M4 18 q24 -3 50 0" stroke="${shade(base, 0.3)}" stroke-width="2" fill="none" /><ellipse cx="56" cy="32" rx="7" ry="18" fill="${shade(base, 0.25)}" stroke="${dk}" stroke-width="1.8" /><g fill="none" stroke="${shade(base, -0.15)}" stroke-width="1"><ellipse cx="56" cy="32" rx="4.5" ry="12" /><ellipse cx="56" cy="32" rx="2" ry="5" /></g><g fill="#2a1a10"><ellipse cx="22" cy="30" rx="6" ry="4" /><ellipse cx="38" cy="40" rx="4" ry="2.6" /><ellipse cx="56" cy="36" rx="3" ry="5" /></g><g fill="#d8b070" stroke="#7a5a2a" stroke-width="1"><path d="M30 14 q5 -6 10 0 z" /><path d="M38 14 q4 -5 8 0 z" /><path d="M10 50 q5 6 10 0 z" /></g><g fill="#5f9a45" opacity=".9"><ellipse cx="12" cy="18" rx="7" ry="3" /><ellipse cx="46" cy="47" rx="6" ry="2.6" /></g>`
      }
      // Вековой ствол: кора с глубокими бороздами, дупло-сучок, мох, корни уходят в землю
      let furrows = ""
      for (let i = 0; i < 6; i++) {
        const x = 3 + i * 11
        furrows += `<path d="M${x} 0 q-3 16 1 32 t-1 32" stroke="${dk}" stroke-width="3" fill="none" /><path d="M${x + 5} 0 q-2 16 1 32 t-1 32" stroke="${shade(base, 0.18)}" stroke-width="1.6" fill="none" opacity=".7" />`
      }
      return `<rect x="0" y="0" width="64" height="64" fill="${base}" />${furrows}<ellipse cx="40" cy="26" rx="6" ry="8" fill="${shade(base, 0.12)}" stroke="${dk}" stroke-width="1.6" /><ellipse cx="40" cy="27" rx="3" ry="4.5" fill="#1a100a" /><g fill="#5f9a45" stroke="#2f5a26" stroke-width=".8"><path d="M0 8 q8 -6 16 2 q-6 6 -16 4 z" /><path d="M0 40 q6 -4 10 2 q-4 4 -10 3 z" /><path d="M50 52 q8 -5 14 0 v6 q-8 2 -14 -6 z" /></g><g fill="#7ab45a"><circle cx="6" cy="8" r="1.6" /><circle cx="56" cy="54" r="1.4" /></g>${variant % 2 ? `<g fill="#e8d0a0" stroke="#7a5a2a" stroke-width=".8"><path d="M16 46 q5 -5 10 0 z" /><path d="M20 52 q4 -4 8 0 z" /></g>` : ""}`
    }
    case "indoors": {
      const paper = "#d9c7a8"
      const wallpaper = `<rect x="0" y="0" width="64" height="64" fill="${paper}" />${[0, 1, 2, 3, 4, 5, 6, 7].map(i => `<rect x="${i * 8 + 2}" y="0" width="4" height="56" fill="${shade(paper, -0.08)}" />`).join("")}<g fill="${shade(paper, 0.18)}">${[0, 1, 2, 3].map(i => [0, 1, 2].map(k => `<path d="M${i * 16 + 8} ${k * 16 + 10} l3 4 l-3 4 l-3 -4 z" />`).join("")).join("")}</g><rect x="0" y="0" width="64" height="5" fill="${shade(paper, 0.2)}" stroke="${shade(paper, -0.35)}" stroke-width="1" /><rect x="0" y="52" width="64" height="12" fill="#f3ece0" stroke="#a89878" stroke-width="1.2" /><path d="M0 56 h64" stroke="#c8b898" stroke-width="1" />`
      if (broken) {
        // Дверь: филёнки, латунная ручка; по нижней филёнке пошла трещина — выбьют
        const dk = shade(base, -0.4)
        return `${wallpaper}<rect x="12" y="2" width="40" height="62" fill="${shade(base, -0.2)}" stroke="${dk}" stroke-width="1.6" /><rect x="16" y="5" width="32" height="59" fill="${base}" stroke="${dk}" stroke-width="1.4" /><g fill="${shade(base, 0.1)}" stroke="${dk}" stroke-width="1.2"><rect x="20" y="9" width="24" height="20" rx="1" /><rect x="20" y="35" width="24" height="24" rx="1" /></g><path d="M18 7 v54" stroke="#fff" stroke-width="1.2" opacity=".25" /><circle cx="43" cy="32" r="2.6" fill="#e0b060" stroke="#8a6420" stroke-width="1" /><path d="M22 40 l6 6 l-3 4 l8 5 l4 4" fill="none" stroke="#2a1a10" stroke-width="2" stroke-linejoin="round" /><path d="M36 37 l-3 6" stroke="#2a1a10" stroke-width="1.4" />`
      }
      // Стена с обоями и плинтусом: на одной — картина, на другой — бра с тёплым светом
      const hang = variant % 2
        ? "<circle cx=\"32\" cy=\"26\" r=\"16\" fill=\"#ffe9a8\" opacity=\".35\" /><circle cx=\"32\" cy=\"26\" r=\"9\" fill=\"#fff3c8\" opacity=\".45\" /><path d=\"M25 22 h14 l-3 9 h-8 z\" fill=\"#f4d27a\" stroke=\"#a07a30\" stroke-width=\"1.2\" /><rect x=\"30\" y=\"31\" width=\"4\" height=\"5\" fill=\"#a07a30\" />"
        : "<rect x=\"18\" y=\"12\" width=\"28\" height=\"24\" fill=\"#8a5a32\" stroke=\"#4a2e18\" stroke-width=\"1.4\" /><rect x=\"21\" y=\"15\" width=\"22\" height=\"18\" fill=\"#a8d8f0\" /><path d=\"M21 33 v-6 q6 -6 11 -1 q5 -5 11 1 v6 z\" fill=\"#6aa84f\" /><circle cx=\"38\" cy=\"20\" r=\"2.6\" fill=\"#ffd54a\" />"
      return `${wallpaper}${hang}`
    }
    case "factory": {
      const dk = shade(base, -0.45)
      if (broken) {
        // Ржавая решётка на бетоне: рама, прутья в рыжих пятнах, один погнут
        const bars = [12, 22, 42, 52].map(x => `<rect x="${x - 1.8}" y="4" width="3.6" height="56" fill="${base}" stroke="${shade(base, -0.45)}" stroke-width=".8" />`).join("")
        return `<rect x="3" y="3" width="58" height="58" rx="2" fill="none" stroke="${shade(base, -0.45)}" stroke-width="6" /><rect x="3" y="3" width="58" height="58" rx="2" fill="none" stroke="${base}" stroke-width="3.6" />${bars}<path d="M32 4 v14 q0 8 6 12 q-6 6 -6 14 v16" fill="none" stroke="${shade(base, -0.45)}" stroke-width="5.4" /><path d="M32 4 v14 q0 8 6 12 q-6 6 -6 14 v16" fill="none" stroke="${base}" stroke-width="3.6" /><g fill="${base}" stroke="${shade(base, -0.45)}" stroke-width=".8"><rect x="4" y="22" width="56" height="3.6" /><rect x="4" y="42" width="56" height="3.6" /></g><g fill="#5a2a14" opacity=".75"><circle cx="12" cy="34" r="2" /><circle cx="44" cy="12" r="1.6" /><circle cx="22" cy="52" r="2.2" /><circle cx="52" cy="44" r="1.8" /></g><g fill="#e08a4a" opacity=".7"><circle cx="21" cy="14" r="1.2" /><circle cx="53" cy="30" r="1.2" /></g>`
      }
      // Стальная стена: клёпаные листы, сварной шов, на одном варианте ржавые потёки
      const panels = [0, 1].map(r => [0, 1].map(c => `<rect x="${c * 32 + 1}" y="${r * 32 + 1}" width="30" height="30" fill="${shade(base, (r + c) % 2 ? -0.05 : 0.06)}" stroke="${dk}" stroke-width="1.4" />`).join("")).join("")
      const rivets = [4, 28, 36, 60].map(x => [4, 28, 36, 60].map(y => `<circle cx="${x}" cy="${y}" r="1.8" fill="${shade(base, 0.35)}" stroke="${dk}" stroke-width=".8" />`).join("")).join("")
      return `<rect x="0" y="0" width="64" height="64" fill="${base}" />${panels}<path d="M3 3 l26 26 M35 35 l12 12" stroke="#fff" stroke-width="1.4" opacity=".14" />${rivets}${variant % 2 ? "<path d=\"M28 6 q-2 12 1 22 M50 36 q-2 10 0 22\" stroke=\"#a0603a\" stroke-width=\"2.4\" fill=\"none\" opacity=\".75\" stroke-linecap=\"round\" />" : "<g fill=\"#e8c22a\"><rect x=\"6\" y=\"40\" width=\"20\" height=\"5\" /></g><g fill=\"#2a2a2a\"><path d=\"M8 45 l3 -5 h3 l-3 5 z M15 45 l3 -5 h3 l-3 5 z M22 45 l3 -5 h1 v5 z\" /></g>"}`
    }
    case "infested": {
      const dk = shade(base, -0.5)
      const plank = (x: number, y: number, w: number, h: number, a: number, c: string): string =>
        `<g transform="rotate(${a} ${x + w / 2} ${y + h / 2})"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1" fill="${c}" stroke="${dk}" stroke-width="1.4" /><path d="M${x + 3} ${y + h * 0.4} h${w - 8}" stroke="${shade(c, -0.25)}" stroke-width="1" /><path d="M${x + 1} ${y + 1.4} h${w - 2}" stroke="#fff" stroke-width="1" opacity=".2" /><g fill="#2a2420"><circle cx="${x + 3}" cy="${y + h / 2}" r="1" /><circle cx="${x + w - 3}" cy="${y + h / 2}" r="1" /></g></g>`
      const wire = (d: string): string => `<path d="${d}" fill="none" stroke="#2a2a2a" stroke-width="1.6" /><path d="${d}" fill="none" stroke="#a8acb0" stroke-width=".8" />`
      if (broken) {
        // Разбитая баррикада: обломки досок, провисшая проволока
        return `${plank(2, 30, 60, 11, -6, base)}<path d="M4 14 l18 -4 l2 6 l-3 4 l-17 3 z" fill="${shade(base, 0.08)}" stroke="${dk}" stroke-width="1.4" /><path d="M40 46 l18 6 l-2 8 l-14 -3 l-4 -5 l3 -2 z" fill="${base}" stroke="${dk}" stroke-width="1.4" />${wire("M0 22 q20 22 40 10 t24 12")}<g stroke="#2a2a2a" stroke-width="1.2">${[10, 22, 34, 46].map(x => `<path d="M${x - 2} ${30 - 2} l4 4 M${x + 2} ${30 - 2} l-4 4" />`).join("")}</g>`
      }
      // Баррикада: доски накрест, гвозди, колючая проволока сверху
      return `${plank(0, 10, 64, 12, -3, shade(base, 0.08))}${plank(0, 26, 64, 12, 2, base)}${plank(0, 42, 64, 12, -2, shade(base, 0.04))}${plank(6, 28, 52, 9, 38, shade(base, 0.15))}${wire("M0 7 l8 -3 l8 3 l8 -3 l8 3 l8 -3 l8 3 l8 -3 l8 3")}<g stroke="#2a2a2a" stroke-width="1.2">${[8, 24, 40, 56].map(x => `<path d="M${x - 2} 2 l4 4 M${x + 2} 2 l-4 4" />`).join("")}</g><ellipse cx="46" cy="50" rx="5" ry="2" fill="#7fe04a" opacity=".5" />`
    }
    default:
      return `<g fill="${base}" stroke="${mortar}" stroke-width="1.5">${[0, 1, 2, 3, 4].map(r => [0, 1, 2].map(c => `<rect x="${c * 24 + (r % 2 ? 12 : 0) - 10}" y="${r * 13 + 1}" width="22" height="11" />`).join("")).join("")}</g>${crack}`
  }
}

function coverDeco(biomeId: string, base: string): string {
  switch (biomeId) {
    case "jungle":
      return "<rect x=\"10\" y=\"4\" width=\"44\" height=\"60\" rx=\"18\" fill=\"#7a5a3a\" stroke=\"#4a3220\" stroke-width=\"2\" /><ellipse cx=\"32\" cy=\"36\" rx=\"12\" ry=\"16\" fill=\"#2a1c12\" /><ellipse cx=\"32\" cy=\"34\" rx=\"7\" ry=\"10\" fill=\"#140d08\" /><g fill=\"#4f8f45\"><ellipse cx=\"14\" cy=\"10\" rx=\"8\" ry=\"4\" transform=\"rotate(-30 14 10)\" /><ellipse cx=\"50\" cy=\"12\" rx=\"8\" ry=\"4\" transform=\"rotate(30 50 12)\" /></g>"
    case "desert":
      return "<g fill=\"none\" stroke=\"#e8e0c8\" stroke-width=\"3.5\" stroke-linecap=\"round\"><path d=\"M10 44 q22 -30 44 0\" /><path d=\"M14 30 q0 -12 10 -16\" /><path d=\"M20 24 q2 -8 10 -10\" /><path d=\"M26 22 q3 -8 12 -8\" /><path d=\"M34 22 q4 -6 12 -4\" /><path d=\"M10 44 h44\" /></g><ellipse cx=\"52\" cy=\"46\" rx=\"8\" ry=\"6\" fill=\"#e8e0c8\" stroke=\"#bfb59a\" stroke-width=\"1.5\" /><circle cx=\"50\" cy=\"45\" r=\"1.6\" fill=\"#2a2a2a\" /><circle cx=\"55\" cy=\"45\" r=\"1.6\" fill=\"#2a2a2a\" />"
    case "glacier":
      return "<path d=\"M6 60 q0 -40 26 -44 q26 4 26 44 z\" fill=\"#eaf6ff\" stroke=\"#9cc9e6\" stroke-width=\"2\" /><path d=\"M16 60 q0 -26 16 -30 q16 4 16 30 z\" fill=\"#2a4a66\" /><path d=\"M22 60 q0 -16 10 -20 q10 4 10 20 z\" fill=\"#142a40\" />"
    case "canyon":
      return "<path d=\"M22 0 L 42 0 L 40 64 L 24 64 Z\" fill=\"#3a1e12\" stroke=\"#6e3a1f\" stroke-width=\"1.5\" /><path d=\"M28 0 L 36 0 L 35 64 L 29 64 Z\" fill=\"#1a0d08\" /><g stroke=\"#6e3a1f\" stroke-width=\"1.2\"><path d=\"M22 14 h-6 M42 20 h6 M22 40 h-8 M42 46 h8\" /></g>"
    case "roofs":
      return "<rect x=\"8\" y=\"10\" width=\"48\" height=\"44\" rx=\"4\" fill=\"#cfd8dc\" stroke=\"#78909c\" stroke-width=\"2\" /><circle cx=\"32\" cy=\"32\" r=\"14\" fill=\"#90a4ae\" stroke=\"#546e7a\" stroke-width=\"2\" /><path d=\"M32 18 v28 M18 32 h28\" stroke=\"#546e7a\" stroke-width=\"2\" />"
    case "basement":
      return "<circle cx=\"32\" cy=\"32\" r=\"22\" fill=\"#6d4c41\" stroke=\"#3e2723\" stroke-width=\"2\" /><circle cx=\"32\" cy=\"32\" r=\"14\" fill=\"none\" stroke=\"#3e2723\" stroke-width=\"2.5\" /><circle cx=\"32\" cy=\"32\" r=\"5\" fill=\"#8d6e63\" />"
    case "dump":
      return "<rect x=\"6\" y=\"18\" width=\"52\" height=\"30\" rx=\"7\" fill=\"#8d6e63\" stroke=\"#4e342e\" stroke-width=\"2\" /><rect x=\"2\" y=\"12\" width=\"12\" height=\"36\" rx=\"5\" fill=\"#a1887f\" stroke=\"#4e342e\" stroke-width=\"2\" /><rect x=\"50\" y=\"12\" width=\"12\" height=\"36\" rx=\"5\" fill=\"#a1887f\" stroke=\"#4e342e\" stroke-width=\"2\" /><path d=\"M20 24 h24 M32 24 v20\" stroke=\"#4e342e\" stroke-width=\"1.5\" />"
    case "winter_park":
      return "<path d=\"M4 54 q28 -46 56 0 z\" fill=\"#f4f9fd\" stroke=\"#c3d7e6\" stroke-width=\"2\" /><path d=\"M16 46 q16 -22 32 0\" fill=\"none\" stroke=\"#c3d7e6\" stroke-width=\"1.5\" />"
    case "deep_forest": {
      // Пень с кольцами на срезе, корнями и красными грибами
      const dk = shade(base, -0.5)
      return `<g stroke="${dk}" stroke-width="7" stroke-linecap="round"><path d="M30 32 L6 22 M30 32 L12 56 M30 32 L52 54 M30 32 L56 18" /></g><g stroke="${shade(base, -0.15)}" stroke-width="4.4" stroke-linecap="round"><path d="M30 32 L6 22 M30 32 L12 56 M30 32 L52 54 M30 32 L56 18" /></g><circle cx="30" cy="32" r="18" fill="${shade(base, -0.25)}" stroke="${dk}" stroke-width="2" /><circle cx="30" cy="31" r="14" fill="${shade(base, 0.3)}" /><g fill="none" stroke="${shade(base, 0.05)}" stroke-width="1.2"><circle cx="30" cy="31" r="10.5" /><circle cx="30" cy="31" r="7" /><circle cx="30" cy="31" r="3.5" /></g><path d="M30 31 l10 -6" stroke="${dk}" stroke-width="1.4" /><g fill="#d8443a" stroke="#6a1a14" stroke-width="1"><circle cx="48" cy="44" r="5" /><circle cx="54" cy="36" r="3.6" /><circle cx="42" cy="52" r="3.2" /></g><g fill="#fff"><circle cx="47" cy="42" r="1.1" /><circle cx="50" cy="45" r=".9" /><circle cx="54" cy="35" r=".8" /><circle cx="42" cy="51" r=".8" /></g><ellipse cx="14" cy="40" rx="5" ry="2.4" fill="#5f9a45" />`
    }
    case "indoors":
      // Кресло сверху: спинка, подлокотники, сиденье с пуговицами, подушка
      return `<rect x="6" y="4" width="52" height="18" rx="8" fill="${shade(base, -0.18)}" stroke="#3e161e" stroke-width="1.8" /><rect x="4" y="14" width="13" height="44" rx="6" fill="${shade(base, -0.06)}" stroke="#3e161e" stroke-width="1.8" /><rect x="47" y="14" width="13" height="44" rx="6" fill="${shade(base, -0.06)}" stroke="#3e161e" stroke-width="1.8" /><rect x="16" y="18" width="32" height="40" rx="5" fill="${base}" stroke="#3e161e" stroke-width="1.6" /><path d="M18 22 h28" stroke="#fff" stroke-width="1.4" opacity=".25" /><g fill="${shade(base, -0.3)}"><circle cx="25" cy="32" r="1.3" /><circle cx="39" cy="32" r="1.3" /><circle cx="32" cy="42" r="1.3" /><circle cx="25" cy="50" r="1.3" /><circle cx="39" cy="50" r="1.3" /></g><rect x="22" y="10" width="16" height="13" rx="4" fill="#e8c470" stroke="#8a6a20" stroke-width="1.2" transform="rotate(-12 30 16)" /><path d="M7 18 h7 M50 18 h7" stroke="#fff" stroke-width="1.2" opacity=".25" />`
    case "factory": {
      // Бочки сверху: обода, пробки, на одной — знак радиации
      const dk = shade(base, -0.45)
      const barrel = (cx: number, cy: number, rad: number, mark: boolean): string => {
        let trefoil = ""
        if (mark) {
          for (const a0 of [-90, 30, 150]) {
            const a1 = ((a0 - 30) * Math.PI) / 180
            const a2 = ((a0 + 30) * Math.PI) / 180
            const ri = rad * 0.2
            const ro = rad * 0.58
            trefoil += `<path d="M${f1(cx + Math.cos(a1) * ri)} ${f1(cy + Math.sin(a1) * ri)} L${f1(cx + Math.cos(a1) * ro)} ${f1(cy + Math.sin(a1) * ro)} A${f1(ro)} ${f1(ro)} 0 0 1 ${f1(cx + Math.cos(a2) * ro)} ${f1(cy + Math.sin(a2) * ro)} L${f1(cx + Math.cos(a2) * ri)} ${f1(cy + Math.sin(a2) * ri)} Z" fill="#2a2a2a" />`
          }
          trefoil += `<circle cx="${cx}" cy="${cy}" r="${f1(rad * 0.13)}" fill="#2a2a2a" />`
        }
        return `<g><circle cx="${cx}" cy="${cy}" r="${rad}" fill="${base}" stroke="${dk}" stroke-width="1.6" /><circle cx="${cx}" cy="${cy}" r="${rad - 2.6}" fill="none" stroke="${shade(base, -0.25)}" stroke-width="1.4" /><circle cx="${cx}" cy="${cy}" r="${rad - 5.4}" fill="none" stroke="${shade(base, 0.2)}" stroke-width="1" opacity=".7" />${trefoil}${mark ? "" : `<circle cx="${f1(cx + rad * 0.4)}" cy="${f1(cy - rad * 0.3)}" r="2" fill="${shade(base, -0.3)}" stroke="${dk}" stroke-width=".8" />`}<path d="M${f1(cx - rad * 0.7)} ${f1(cy - rad * 0.3)} a${f1(rad * 0.8)} ${f1(rad * 0.8)} 0 0 1 ${f1(rad * 0.6)} ${f1(-rad * 0.45)}" stroke="#fff" stroke-width="1.6" fill="none" opacity=".45" stroke-linecap="round" /></g>`
      }
      return `${barrel(20, 21, 14, true)}${barrel(46, 26, 12, false)}${barrel(30, 47, 13, false)}<ellipse cx="50" cy="52" rx="6" ry="2.6" fill="#2a2630" opacity=".7" />`
    }
    case "infested": {
      // Надгробие с крестом, трещиной и потёком слизи; перед ним — свежий холмик
      const dk = shade(base, -0.45)
      return `<ellipse cx="32" cy="52" rx="20" ry="9" fill="#3e3426" stroke="#2a2218" stroke-width="1.2" /><g fill="#5a4a36"><circle cx="22" cy="52" r="1.4" /><circle cx="40" cy="55" r="1.2" /><circle cx="33" cy="49" r="1" /></g>${bone(38, 51, 47, 55, 2.2, "#d8d0b8", "#6a604a")}<path d="M16 48 V22 a16 16 0 0 1 32 0 V48 z" fill="${base}" stroke="${dk}" stroke-width="2" /><rect x="16" y="42" width="32" height="6" fill="${shade(base, -0.2)}" /><path d="M19 22 a13 13 0 0 1 13 -12" stroke="#fff" stroke-width="1.6" fill="none" opacity=".4" /><path d="M32 16 v20 M25 23 h14" stroke="${shade(base, -0.35)}" stroke-width="3.2" stroke-linecap="round" /><path d="M42 12 l-4 8 l3 4 l-3 6" fill="none" stroke="${dk}" stroke-width="1.2" /><path d="M16 26 q4 -2 6 2 v10 q-2 3 -3 0 v-6 q-2 2 -3 0 z" fill="#7fe04a" opacity=".85" /><g fill="#5f7a3a" opacity=".85"><ellipse cx="44" cy="42" rx="4" ry="2" /><ellipse cx="20" cy="44" rx="3" ry="1.6" /></g>`
    }
    default:
      return `<rect x="10" y="12" width="44" height="42" rx="3" fill="${base}" stroke="#a8763f" stroke-width="2" /><path d="M10 12 h44 M32 12 v42" stroke="#a8763f" stroke-width="2" /><rect x="28" y="12" width="8" height="42" fill="#c9924f" opacity=".45" /><path d="M16 42 h12 M16 48 h18" stroke="#a8763f" stroke-width="1.5" stroke-linecap="round" opacity=".7" />`
  }
}

/** Сколько кадров анимации есть у местности (вода «шевелится», листва качается). */
export const TILE_FRAME_COUNT: Partial<Record<TerrainId, number>> = { water: 4, forest: 2 }

/** Сколько вариантов внешнего вида у местности: фактура и зеркальный объект, чтобы поле не было «плиткой». */
export const TILE_VARIANTS: Partial<Record<TerrainId, number>> = { plain: 3, forest: 2, mountain: 2, cover: 2, wall: 2 }

/** Вода заливает клетку целиком (а не лежит лужей на земле): у такой воды есть берега с пеной. */
export function waterFillsTile(biomeId: string): boolean {
  // Ванна в доме — предмет на полу; ручей, масло и жижа заливают клетки сплошь
  return !["roofs", "dump", "desert", "glacier", "canyon", "indoors"].includes(biomeId)
}

/* ---------- Фактура земли ---------- */

function blades(r: () => number, n: number, colors: string[], len: number, width = 1.4): string {
  let out = ""
  for (let i = 0; i < n; i++) {
    const x = r() * S
    const y = 4 + r() * (S - 4)
    const l = len * (0.6 + r() * 0.7)
    const lean = (r() - 0.5) * l * 0.9
    const c = colors[Math.floor(r() * colors.length)] ?? colors[0]
    out += `<path d="M${f1(x)} ${f1(y)} q${f1(lean * 0.3)} ${f1(-l * 0.6)} ${f1(lean)} ${f1(-l)}" stroke="${c}" stroke-width="${width}" fill="none" stroke-linecap="round" />`
  }
  return out
}

function specks(r: () => number, n: number, colors: string[], rMin: number, rMax: number, opacity = 1): string {
  let out = `<g opacity="${opacity}">`
  for (let i = 0; i < n; i++) {
    const c = colors[Math.floor(r() * colors.length)] ?? colors[0]
    out += `<circle cx="${f1(r() * S)}" cy="${f1(r() * S)}" r="${f1(rMin + r() * (rMax - rMin))}" fill="${c}" />`
  }
  return `${out}</g>`
}

function pebbles(r: () => number, n: number, base: string): string {
  let out = ""
  for (let i = 0; i < n; i++) {
    const x = 4 + r() * (S - 8)
    const y = 4 + r() * (S - 8)
    const rx = 1.6 + r() * 2.6
    const ry = rx * (0.6 + r() * 0.3)
    const c = shade(base, -0.2 + r() * 0.35)
    out += `<ellipse cx="${f1(x + 0.7)}" cy="${f1(y + 1)}" rx="${f1(rx)}" ry="${f1(ry)}" fill="#000" opacity=".22" /><ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(rx)}" ry="${f1(ry)}" fill="${c}" /><ellipse cx="${f1(x - rx * 0.3)}" cy="${f1(y - ry * 0.35)}" rx="${f1(rx * 0.4)}" ry="${f1(ry * 0.3)}" fill="#fff" opacity=".35" />`
  }
  return out
}

function flowers(r: () => number, n: number, palette: string[]): string {
  let out = ""
  for (let i = 0; i < n; i++) {
    const x = 6 + r() * (S - 12)
    const y = 6 + r() * (S - 12)
    const c = palette[Math.floor(r() * palette.length)] ?? palette[0]
    const pr = 1.5 + r() * 0.8
    let petals = ""
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + r()
      petals += `<circle cx="${f1(x + Math.cos(a) * pr)}" cy="${f1(y + Math.sin(a) * pr)}" r="${f1(pr * 0.75)}" fill="${c}" />`
    }
    out += `<g><path d="M${f1(x)} ${f1(y + 1)} q-1 3 0 5" stroke="#3f7a2a" stroke-width="1" fill="none" />${petals}<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(pr * 0.55)}" fill="#ffd54a" /></g>`
  }
  return out
}

function cracks(r: () => number, n: number, color: string, width = 1.1): string {
  let out = ""
  for (let i = 0; i < n; i++) {
    let x = r() * S
    let y = r() * S
    let d = `M${f1(x)} ${f1(y)}`
    for (let k = 0; k < 4; k++) {
      x += (r() - 0.5) * 18
      y += (r() - 0.3) * 14
      d += ` L${f1(x)} ${f1(y)}`
    }
    out += `<path d="${d}" stroke="${color}" stroke-width="${width}" fill="none" stroke-linejoin="round" stroke-linecap="round" />`
  }
  return out
}

/** Фактура земли биома; `density` — 1 для чистой равнины, меньше — под объектами. */
function groundTexture(biomeId: string, color: string, r: () => number, density: number, variant: number): string {
  const n = (k: number): number => Math.max(0, Math.round(k * density))
  const d1 = shade(color, -0.14)
  const d2 = shade(color, -0.26)
  const l1 = shade(color, 0.14)
  const l2 = shade(color, 0.26)
  switch (biomeId) {
    case "yard":
      return `${specks(r, n(16), [d1, l1], 2, 5, 0.35)}${blades(r, n(46), [d1, d2, l1, l2], 7)}${variant > 0 ? flowers(r, n(variant === 1 ? 3 : 5), ["#ffffff", "#ffd1dc", "#fff59d", "#b39ddb"]) : ""}${variant === 2 ? pebbles(r, n(2), "#bcaaa4") : ""}`
    case "jungle":
      return `${specks(r, n(14), [d1, d2, l1], 2, 6, 0.45)}${pebbles(r, n(3), "#8d7a5a")}${blades(r, n(18), ["#2f7a3a", "#4f9f45", d2], 6, 1.8)}${variant > 0 ? `<path d="M${f1(r() * 20)} ${f1(30 + r() * 30)} q20 -14 44 -4" stroke="#6b4a2c" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".8" />` : ""}`
    case "desert": {
      let ripples = ""
      const off = r() * 10
      for (let i = 0; i < 6; i++) {
        const y = 6 + i * 11 + off
        ripples += `<path d="M-6 ${f1(y)} q10 -5 20 0 t20 0 t20 0 t20 0" stroke="${d1}" stroke-width="1.6" fill="none" opacity=".75" /><path d="M-6 ${f1(y - 1.6)} q10 -5 20 0 t20 0 t20 0 t20 0" stroke="${l2}" stroke-width="1" fill="none" opacity=".7" />`
      }
      return `${ripples}${specks(r, n(20), [d2, l2], 0.5, 1.2, 0.8)}${variant > 0 ? pebbles(r, n(3), "#c7a46a") : ""}`
    }
    case "glacier":
      return `${specks(r, n(10), ["#ffffff"], 2, 7, 0.25)}${cracks(r, n(3), "#ffffff", 1.2)}${cracks(r, n(2), d2, 1)}<g fill="#fff">${Array.from({ length: n(5) }, () => `<path d="M${f1(r() * S)} ${f1(r() * S)} l1.2 -3.2 l1.2 3.2 l3.2 1.2 l-3.2 1.2 l-1.2 3.2 l-1.2 -3.2 l-3.2 -1.2 z" opacity=".9" />`).join("")}</g>`
    case "canyon": {
      let strata = ""
      for (let i = 0; i < 5; i++) {
        const y = 8 + i * 13 + r() * 4
        strata += `<path d="M-4 ${f1(y)} q16 ${f1((r() - 0.5) * 6)} 34 0 t36 0" stroke="${i % 2 ? d1 : l1}" stroke-width="${f1(2 + r() * 2)}" fill="none" opacity=".6" />`
      }
      return `${strata}${pebbles(r, n(4), "#c27a4a")}${cracks(r, n(2), d2)}`
    }
    case "roofs": {
      // Черепица: ряды «чешуек» с тенью и бликом
      let tiles = ""
      const rowH = 11
      for (let row = 0; row < 7; row++) {
        const y = row * rowH - 4
        const shift = row % 2 ? 8 : 0
        for (let c = -1; c < 5; c++) {
          const x = c * 16 + shift
          const tone = shade(color, (r() - 0.5) * 0.18)
          tiles += `<path d="M${x} ${y} h16 v${rowH - 3} q-8 6 -16 0 z" fill="${tone}" stroke="${d2}" stroke-width=".8" /><path d="M${x + 2} ${y + 2} h12" stroke="${l2}" stroke-width="1.2" opacity=".55" />`
        }
      }
      return `${tiles}${variant > 0 ? specks(r, n(4), ["#6b8f4a", "#8aa85a"], 2, 4, 0.75) : ""}`
    }
    case "basement":
      return `${specks(r, n(60), [d1, l1, d2], 0.4, 1.3, 0.7)}${variant > 0 ? `<ellipse cx="${f1(14 + r() * 36)}" cy="${f1(14 + r() * 36)}" rx="${f1(8 + r() * 6)}" ry="${f1(5 + r() * 4)}" fill="${d2}" opacity=".35" />` : ""}${cracks(r, n(variant === 2 ? 3 : 1), d2, 1.2)}<path d="M0 32 h64 M32 0 v64" stroke="${d1}" stroke-width=".8" opacity=".5" />`
    case "dump": {
      const junk = ["#b0bec5", "#ef9a9a", "#90caf9", "#fff59d", "#a5d6a7"]
      let bits = ""
      for (let i = 0; i < n(5); i++) {
        const x = 4 + r() * 56
        const y = 4 + r() * 56
        const c = junk[Math.floor(r() * junk.length)] ?? junk[0]
        bits += `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(3 + r() * 5)}" height="${f1(2 + r() * 3)}" rx=".8" fill="${c}" transform="rotate(${f1(r() * 180)} ${f1(x)} ${f1(y)})" opacity=".85" />`
      }
      return `${specks(r, n(24), [d1, d2, l1], 1, 3, 0.55)}${bits}${variant > 0 ? `<ellipse cx="${f1(18 + r() * 28)}" cy="${f1(18 + r() * 28)}" rx="10" ry="6" fill="#2b2b2b" opacity=".35" />` : ""}`
    }
    case "winter_park":
      return `${specks(r, n(10), ["#dde8f2", "#ffffff"], 3, 8, 0.6)}<g fill="#b9d3ea" opacity=".45">${Array.from({ length: n(4) }, () => `<ellipse cx="${f1(r() * S)}" cy="${f1(r() * S)}" rx="${f1(6 + r() * 6)}" ry="${f1(2 + r() * 2)}" />`).join("")}</g><g fill="#fff">${Array.from({ length: n(6) }, () => `<path d="M${f1(r() * S)} ${f1(r() * S)} l1 -2.6 l1 2.6 l2.6 1 l-2.6 1 l-1 2.6 l-1 -2.6 l-2.6 -1 z" />`).join("")}</g>${variant === 2 ? `<g fill="#c9d9e8">${[0, 1, 2].map(i => `<ellipse cx="${18 + i * 12}" cy="${40 - i * 10}" rx="2.4" ry="3.2" /><ellipse cx="${22 + i * 12}" cy="${44 - i * 10}" rx="2.4" ry="3.2" />`).join("")}</g>` : ""}`
    case "deep_forest": {
      // Мох: мягкие пятна, ворс, опавшие листья; варианты — луч сквозь кроны, папоротник, корень с грибами
      const leafColors = ["#c08a3a", "#a0582d", "#8a9a3a", "#d4a24a"]
      let leaves = ""
      for (let i = 0; i < n(variant === 0 ? 6 : 4); i++) {
        const x = 4 + r() * 56
        const y = 4 + r() * 56
        const c = leafColors[Math.floor(r() * leafColors.length)] ?? "#c08a3a"
        leaves += `<g transform="rotate(${f1(r() * 180)} ${f1(x)} ${f1(y)})"><ellipse cx="${f1(x)}" cy="${f1(y)}" rx="3.4" ry="1.8" fill="${c}" opacity=".9" /><path d="M${f1(x - 3)} ${f1(y)} h6" stroke="${shade(c, -0.35)}" stroke-width=".6" /></g>`
      }
      const rootY = f1(20 + r() * 20)
      const extra =
        variant === 0
          ? `<path d="M${f1(r() * 20)} 0 l18 0 l${f1(26 + r() * 10)} 64 l-18 0 z" fill="#fff6b0" opacity=".12" />`
          : variant === 1
            ? `${fern(14 + r() * 10, 56, 22, -30 + r() * 20, l1, d2)}${fern(40 + r() * 12, 58, 18, 15 + r() * 20, l1, d2)}`
            : `<path d="M-2 ${rootY} q22 -10 36 4 t30 -2" stroke="#4a3220" stroke-width="5" fill="none" stroke-linecap="round" /><path d="M-2 ${rootY} q22 -10 36 4 t30 -2" stroke="#6b4a2c" stroke-width="2.6" fill="none" stroke-linecap="round" transform="translate(-.6 -.8)" /><g fill="#e8d8b8" stroke="#8a6a40" stroke-width=".7"><circle cx="40" cy="44" r="2.6" /><circle cx="45" cy="46" r="2" /><circle cx="42" cy="49" r="1.6" /></g>`
      return `${specks(r, n(14), [d1, d2, l1], 4, 9, 0.45)}${specks(r, n(40), [l1, l2, d2], 0.5, 1.3, 0.75)}${extra}${leaves}`
    }
    case "indoors": {
      // Паркет «ёлочкой»: столбцы косых планок с разным тоном; варианты — солнечный зайчик из окна, коврик
      let planks = ""
      for (let c = 0; c < 4; c++) {
        const x = c * 16
        const dir = c % 2 ? 8 : -8
        for (let k = -2; k < 9; k++) {
          const y = k * 8
          const tone = shade(color, (r() - 0.5) * 0.2)
          planks += `<path d="M${x} ${y} l16 ${dir} v8 l-16 ${-dir} z" fill="${tone}" stroke="${d2}" stroke-width=".8" stroke-linejoin="round" />`
          if (r() < 0.35) planks += `<path d="M${x + 3} ${f1(y + 4 + dir * 0.18)} l10 ${f1(dir * 0.62)}" stroke="${d1}" stroke-width=".7" opacity=".7" />`
        }
      }
      const extra =
        variant === 1
          ? `<path d="M8 6 h26 l22 52 h-26 z" fill="#fff4cc" opacity=".22" /><path d="M21 6 l22 52 M19 30 h24" stroke="${d2}" stroke-width="2" opacity=".18" />`
          : variant === 2
            ? `<ellipse cx="${f1(20 + r() * 24)}" cy="${f1(20 + r() * 24)}" rx="14" ry="9" fill="${d2}" opacity=".18" /><g stroke="${l2}" stroke-width=".8" opacity=".6" stroke-linecap="round"><path d="M${f1(10 + r() * 30)} ${f1(10 + r() * 40)} l12 3 M${f1(16 + r() * 30)} ${f1(14 + r() * 40)} l9 -2" /></g><g fill="#d8cfc0" opacity=".85"><circle cx="${f1(10 + r() * 44)}" cy="${f1(48 + r() * 8)}" r="2.2" /><circle cx="${f1(10 + r() * 44)}" cy="${f1(8 + r() * 8)}" r="1.4" /></g>`
            : ""
      return `${planks}${extra}`
    }
    case "factory": {
      // Бетон: крошка, разводы, швы плит; варианты — анкеры и трещины, жёлтая разметка с масляным пятном, решётка стока
      const concrete = `${specks(r, n(10), [d1, l1], 4, 9, 0.22)}${specks(r, n(70), [d1, d2, l1], 0.4, 1.2, 0.6)}<path d="M0 .7 h64 M.7 0 v64" stroke="${d2}" stroke-width="1.4" opacity=".7" /><path d="M0 2.2 h64 M2.2 0 v64" stroke="${l2}" stroke-width=".8" opacity=".45" />`
      const extra =
        variant === 0
          ? `${cracks(r, n(2), d2, 1.2)}<g fill="${d2}" stroke="${l1}" stroke-width=".8">${[[20, 20], [44, 20], [20, 44], [44, 44]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2" />`).join("")}</g>`
          : variant === 1
            ? `<rect x="0" y="46" width="64" height="7" fill="#e8c22a" opacity=".75" /><g fill="#2a2a2a" opacity=".7">${[0, 1, 2, 3, 4, 5, 6].map(i => `<path d="M${i * 10 - 2} 53 l4 -7 h5 l-4 7 z" />`).join("")}</g>${specks(r, n(10), [color, d1], 0.6, 1.6, 0.8)}<ellipse cx="${f1(18 + r() * 28)}" cy="${f1(18 + r() * 10)}" rx="11" ry="6" fill="#2a2630" opacity=".55" /><ellipse cx="${f1(26 + r() * 10)}" cy="22" rx="4" ry="1.6" fill="#7a5aff" opacity=".25" />`
            : `<rect x="40" y="40" width="16" height="16" rx="1.5" fill="#55595d" stroke="${d2}" stroke-width="1.4" /><g fill="#2a2d30">${[0, 1, 2].map(i => `<rect x="42.5" y="${42.5 + i * 4.6}" width="11" height="2.6" rx="1" />`).join("")}</g><path d="M48 56 q2 4 1 8" stroke="#8a5a3a" stroke-width="2.4" fill="none" opacity=".45" />${cracks(r, n(2), d2, 1.2)}`
      return `${concrete}${extra}`
    }
    case "infested": {
      // Больная земля: гнилые фиолетовые пятна, трещины, светящаяся слизь, споры; варианты — кость, череп с грибком
      let slime = ""
      for (let i = 0; i < n(variant === 1 ? 3 : 2); i++) {
        const x = 8 + r() * 48
        const y = 8 + r() * 48
        const rx = 4 + r() * 5
        slime += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(rx + 2)}" ry="${f1(rx * 0.6 + 1.5)}" fill="#7fe04a" opacity=".22" /><ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(rx)}" ry="${f1(rx * 0.6)}" fill="#7fe04a" opacity=".45" /><ellipse cx="${f1(x - rx * 0.3)}" cy="${f1(y - rx * 0.2)}" rx="${f1(rx * 0.35)}" ry="${f1(rx * 0.18)}" fill="#e6ffb0" opacity=".7" />`
      }
      const extra =
        variant === 1
          ? bone(14 + r() * 10, 40 + r() * 10, 36 + r() * 10, 46 + r() * 8, 2.6, "#d8d0b8", "#4a4430")
          : variant === 2
            ? `${skull(40 + r() * 8, 22 + r() * 8, 4.5, "#d8d0b8", "#4a4430")}<g fill="#8a5ab8">${[0, 1, 2].map(i => `<circle cx="${12 + i * 5}" cy="${48 - i * 3}" r="${2.4 - i * 0.4}" />`).join("")}</g>`
            : ""
      return `${specks(r, n(12), ["#4a3a52", d2, "#5a4a62"], 3, 8, 0.5)}${specks(r, n(30), [d1, l1], 0.5, 1.4, 0.7)}${cracks(r, n(3), shade(color, -0.45), 1.4)}${slime}${extra}${specks(r, n(12), ["#c6ff8a", "#b07aff"], 0.6, 1.2, 0.85)}`
    }
    default:
      return blades(r, n(30), [d1, l1], 6)
  }
}

/* ---------- Вода ---------- */

/** Каустика и блики: кадр `frame` сдвигает сетку световых линий и мерцание. */
function waterLights(base: string, frame: number, r: () => number, inset: number): string {
  const light = shade(base, 0.45)
  const ph = frame * 1.6
  let lines = ""
  for (let i = 0; i < 4; i++) {
    const y = inset + 8 + i * 13 + Math.sin(ph + i) * 2
    lines += `<path d="M${inset} ${f1(y)} c8 ${f1(-4 + Math.sin(ph + i) * 3)} 14 ${f1(4 + Math.cos(ph) * 2)} 22 0 s14 ${f1(-5 + Math.sin(ph * 1.3 + i) * 2)} 22 0 s10 4 ${S} 0" stroke="${light}" stroke-width="1.2" fill="none" opacity=".45" />`
  }
  let sparks = ""
  for (let i = 0; i < 4; i++) {
    const x = inset + 6 + r() * (S - 2 * inset - 12)
    const y = inset + 6 + r() * (S - 2 * inset - 12)
    const on = (i + frame) % 4 === 0
    sparks += `<path d="M${f1(x)} ${f1(y - (on ? 4 : 2))} l1 ${on ? 3 : 1.5} l${on ? 3 : 1.5} 1 l-${on ? 3 : 1.5} 1 l-1 ${on ? 3 : 1.5} l-1 -${on ? 3 : 1.5} l-${on ? 3 : 1.5} -1 l${on ? 3 : 1.5} -1 z" fill="#fff" opacity="${on ? 0.95 : 0.4}" />`
  }
  return `${lines}${sparks}`
}

/* ---------- Сборка ---------- */

/** Объекты, отбрасывающие тень на соседние клетки (свет сверху-слева). */
export function isTallTerrain(terrain: TerrainId): boolean {
  return terrain === "wall" || terrain === "wall_breakable" || terrain === "mountain" || terrain === "cover" || terrain === "forest"
}

function defs(id: string, base: string): string {
  return `<defs>
<linearGradient id="${id}-lit" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22" /><stop offset=".45" stop-color="#fff" stop-opacity="0" /><stop offset=".6" stop-color="#000" stop-opacity="0" /><stop offset="1" stop-color="#000" stop-opacity=".2" /></linearGradient>
<radialGradient id="${id}-ao" cx="50%" cy="50%" r="72%"><stop offset=".62" stop-color="#000" stop-opacity="0" /><stop offset="1" stop-color="#000" stop-opacity=".3" /></radialGradient>
<radialGradient id="${id}-leaf" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="${shade(base, 0.3)}" /><stop offset=".55" stop-color="${base}" /><stop offset="1" stop-color="${shade(base, -0.35)}" /></radialGradient>
<radialGradient id="${id}-deep" cx="45%" cy="40%" r="70%"><stop offset="0" stop-color="${shade(base, 0.18)}" /><stop offset="1" stop-color="${shade(base, -0.28)}" /></radialGradient>
<filter id="${id}-ds" x="-20%" y="-20%" width="150%" height="150%"><feDropShadow dx="2.2" dy="3" stdDeviation="1.8" flood-color="#000" flood-opacity=".42" /></filter>
</defs>`
}

/**
 * SVG тайла 64×64 для клетки местности `terrain` в биоме `biomeId`; `frame` — кадр анимации,
 * `variant` — вариант оформления (0 … TILE_VARIANTS − 1).
 */
export function tileSvg(biomeId: string, terrain: TerrainId, frame = 0, variant = 0): string {
  const b = biomeDef(biomeId)
  const plain = hex(b.colors.plain)
  const own = hex(b.colors[terrain] ?? b.colors.plain)
  const id = `t${hashStr(`${biomeId}:${terrain}:${frame}:${variant}`).toString(36)}`
  // Фактура и объекты зависят только от варианта: кадры одного варианта совпадают во всём, кроме анимации
  const r = rng(hashStr(`${biomeId}:${terrain}:${variant}`))
  const mirror = variant % 2 === 1 ? `transform="translate(${S} 0) scale(-1 1)"` : ""
  let base = own
  let ground = ""
  let deco = ""
  let shadowed = true
  switch (terrain) {
    case "plain":
      ground = groundTexture(biomeId, plain, r, 1, variant)
      deco = plainDeco(biomeId, plain)
      shadowed = false
      break
    case "forest":
      base = shade(plain, -0.08)
      ground = groundTexture(biomeId, base, r, 0.5, 0)
      deco = forestDeco(biomeId, own, frame, id)
      break
    case "mountain":
      base = plain
      ground = groundTexture(biomeId, plain, r, 0.4, 0)
      deco = mountainDeco(biomeId)
      break
    case "water": {
      const fills = waterFillsTile(biomeId)
      base = fills ? own : plain
      ground = fills ? `<rect x="0" y="0" width="${S}" height="${S}" fill="url(#${id}-deep)" />` : groundTexture(biomeId, plain, r, 0.5, 0)
      // Масло и жижа не бликуют каустикой: у них свои разводы и пузыри
      deco = `${waterDeco(biomeId, own, frame)}${(fills && biomeId !== "factory" && biomeId !== "infested") || biomeId === "desert" || biomeId === "canyon" || biomeId === "glacier" ? waterLights(own, frame, rng(hashStr(`${biomeId}:w:${frame}`)), fills ? 0 : 12) : ""}`
      shadowed = false
      break
    }
    case "wall":
    case "wall_breakable": {
      const broken = terrain === "wall_breakable"
      const onGround = wallOnGround(biomeId, broken)
      base = onGround ? plain : shade(own, -0.1)
      ground = onGround ? groundTexture(biomeId, plain, r, 0.4, 0) : ""
      deco = wallDeco(biomeId, own, broken, variant)
      break
    }
    case "cover":
      base = plain
      ground = groundTexture(biomeId, plain, r, 0.6, 0)
      deco = coverDeco(biomeId, own)
      break
  }
  const object = deco ? `<g ${shadowed ? `filter="url(#${id}-ds)"` : ""}><g ${mirror}>${deco}</g></g>` : ""
  return `<svg viewBox="0 0 ${S} ${S}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${defs(id, own)}<rect x="0" y="0" width="${S}" height="${S}" fill="${base}" />${ground}<rect x="0" y="0" width="${S}" height="${S}" fill="url(#${id}-lit)" />${object}<rect x="0" y="0" width="${S}" height="${S}" fill="url(#${id}-ao)" /></svg>`
}

/** Бесшовная земля биома без освещения и AO — фон вокруг поля (повторяется плиткой). */
export function groundSvg(biomeId: string): string {
  const plain = hex(biomeDef(biomeId).colors.plain)
  const r = rng(hashStr(`${biomeId}:ground`))
  return `<svg viewBox="0 0 ${S} ${S}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="0" y="0" width="${S}" height="${S}" fill="${plain}" />${groundTexture(biomeId, plain, r, 0.7, 0)}</svg>`
}

/** Накладки на края клеток: пена у берега, тень от высокого соседа, обломки разрушенной стены. */
export type TileEdgeKind = "shore" | "shade" | "rubble"

/**
 * SVG накладки 64×64. «shore» и «shade» нарисованы у ВЕРХНЕГО края: для других сторон картинку поворачивают.
 * «shore» лежит на клетке воды со стороны суши; «shade» — на клетке под высоким объектом; «rubble» — на месте стены.
 */
export function tileEdgeSvg(biomeId: string, kind: TileEdgeKind, frame = 0): string {
  const b = biomeDef(biomeId)
  const id = `e${hashStr(`${biomeId}:${kind}:${frame}`).toString(36)}`
  const plain = hex(b.colors.plain)
  let body = ""
  switch (kind) {
    case "shore": {
      const water = hex(b.colors.water)
      // «Пена»: у масла — радужная плёнка, у жижи — ядовито-зелёные пузыри
      const foam = biomeId === "basement" ? "#cfd8dc" : biomeId === "factory" ? `url(#${id}-rb)` : biomeId === "infested" ? "#c6ff8a" : "#ffffff"
      const dx = frame * 3
      const rainbow = biomeId === "factory" ? `<linearGradient id="${id}-rb" x1="0" y1="0" x2="${S}" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ff6ad5" /><stop offset=".3" stop-color="#ffd75a" /><stop offset=".55" stop-color="#5affc8" /><stop offset=".8" stop-color="#6a8cff" /><stop offset="1" stop-color="#c77dff" /></linearGradient>` : ""
      const blobs = biomeId === "infested" ? `<g fill="#c6ff8a" stroke="#4a8a2a" stroke-width=".8">${[[12, 10, 2.6], [26, 6, 1.8], [42, 11, 3], [56, 7, 2]].map(([x, y, rad], i) => `<circle cx="${f1((x ?? 0) + (i % 2 ? -dx : dx))}" cy="${y}" r="${f1((rad ?? 2) * (frame % 2 ? 1.15 : 0.9))}" />`).join("")}</g>` : ""
      body = `<defs><linearGradient id="${id}-wet" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(plain, -0.25)}" stop-opacity=".95" /><stop offset="1" stop-color="${water}" stop-opacity="0" /></linearGradient>${rainbow}</defs>
<rect x="0" y="0" width="${S}" height="12" fill="url(#${id}-wet)" />
<path d="M${-8 + dx} 5 q4 3 8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0" stroke="${foam}" stroke-width="2.2" fill="none" opacity=".9" stroke-linecap="round" />
<path d="M${-4 - dx} 9 q4 2.4 8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0" stroke="${foam}" stroke-width="1.2" fill="none" opacity=".55" stroke-linecap="round" />
<g fill="${foam}" opacity=".8"><circle cx="${8 + dx}" cy="12" r="1.2" /><circle cx="${30 - dx}" cy="13" r="1" /><circle cx="${50 + dx}" cy="11" r="1.4" /></g>${blobs}`
      break
    }
    case "shade":
      body = `<defs><linearGradient id="${id}-sh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".42" /><stop offset="1" stop-color="#000" stop-opacity="0" /></linearGradient></defs><rect x="0" y="0" width="${S}" height="22" fill="url(#${id}-sh)" />`
      break
    case "rubble": {
      const wall = hex(b.colors.wall_breakable)
      const r = rng(hashStr(`${biomeId}:rubble`))
      let chunks = ""
      for (let i = 0; i < 9; i++) {
        const x = 8 + r() * 48
        const y = 10 + r() * 46
        const w = 4 + r() * 9
        const h = 3 + r() * 6
        const c = shade(wall, -0.25 + r() * 0.35)
        chunks += `<g transform="rotate(${f1(r() * 90 - 45)} ${f1(x)} ${f1(y)})"><rect x="${f1(x + 1.2)}" y="${f1(y + 1.6)}" width="${f1(w)}" height="${f1(h)}" rx="1" fill="#000" opacity=".3" /><rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" rx="1" fill="${c}" /><rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="1.4" fill="#fff" opacity=".3" /></g>`
      }
      body = `<ellipse cx="32" cy="38" rx="26" ry="16" fill="${shade(plain, -0.3)}" opacity=".45" />${specks(r, 26, [shade(wall, -0.3), shade(wall, 0.1)], 0.6, 1.6, 0.9)}${chunks}`
      break
    }
  }
  return `<svg viewBox="0 0 ${S} ${S}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`
}

export const TILE_SIZE = S
