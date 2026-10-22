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
    default:
      return waves
  }
}

function wallDeco(biomeId: string, base: string, broken: boolean): string {
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
  return !["roofs", "dump", "desert", "glacier", "canyon"].includes(biomeId)
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
      deco = `${waterDeco(biomeId, own, frame)}${fills || biomeId === "desert" || biomeId === "canyon" || biomeId === "glacier" ? waterLights(own, frame, rng(hashStr(`${biomeId}:w:${frame}`)), fills ? 0 : 12) : ""}`
      shadowed = false
      break
    }
    case "wall":
      base = biomeId === "dump" || biomeId === "winter_park" ? plain : shade(own, -0.1)
      ground = biomeId === "dump" || biomeId === "winter_park" ? groundTexture(biomeId, plain, r, 0.4, 0) : ""
      deco = wallDeco(biomeId, own, false)
      break
    case "wall_breakable":
      base = biomeId === "dump" || biomeId === "winter_park" ? plain : shade(own, -0.1)
      ground = biomeId === "dump" || biomeId === "winter_park" ? groundTexture(biomeId, plain, r, 0.4, 0) : ""
      deco = wallDeco(biomeId, own, true)
      break
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
      const foam = biomeId === "basement" ? "#cfd8dc" : "#ffffff"
      const dx = frame * 3
      body = `<defs><linearGradient id="${id}-wet" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(plain, -0.25)}" stop-opacity=".95" /><stop offset="1" stop-color="${water}" stop-opacity="0" /></linearGradient></defs>
<rect x="0" y="0" width="${S}" height="12" fill="url(#${id}-wet)" />
<path d="M${-8 + dx} 5 q4 3 8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0" stroke="${foam}" stroke-width="2.2" fill="none" opacity=".9" stroke-linecap="round" />
<path d="M${-4 - dx} 9 q4 2.4 8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0" stroke="${foam}" stroke-width="1.2" fill="none" opacity=".55" stroke-linecap="round" />
<g fill="${foam}" opacity=".8"><circle cx="${8 + dx}" cy="12" r="1.2" /><circle cx="${30 - dx}" cy="13" r="1" /><circle cx="${50 + dx}" cy="11" r="1.4" /></g>`
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
