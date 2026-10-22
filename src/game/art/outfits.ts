/**
 * Наряды классов Fortune's Weave поверх миниатюры зверька: головной убор, одежда, плащ, эмблема,
 * отделка по ярусу класса и верховое животное (`mountOf` модели). Всё — в viewBox миниатюры 0 -28 120 140.
 * Классы различаются комбинациями небольшого набора примитивов; классы одной линии похожи и «богатеют» с ярусом.
 */
import type { ClassTier, Mount } from "@shared/character/classes"
import { INK, shade } from "./palettes"
import type { ArtSpecies } from "./critter"

export type HatKind
  = | "none"
    | "strawHat"
    | "beret"
    | "headband"
    | "bandana"
    | "featherCap"
    | "hood"
    | "helmet"
    | "plumedHelm"
    | "greatHelm"
    | "hornedHelm"
    | "kabuto"
    | "wingedHelm"
    | "turban"
    | "wizardHat"
    | "mitre"
    | "skullcap"
    | "veil"
    | "tiara"
    | "circlet"

export type GarbKind = "tunic" | "vest" | "gi" | "robe" | "armor" | "plate" | "dress" | "apron"

export type EmblemKind
  = | "none"
    | "cross"
    | "star"
    | "flame"
    | "leaf"
    | "sword"
    | "shield"
    | "moon"
    | "sun"
    | "hammer"
    | "feather"
    | "eye"
    | "fist"
    | "wave"
    | "skull"

export interface Outfit {
  hat: HatKind
  hatColor: string
  garb: GarbKind
  /** Основной цвет одежды. */
  color: string
  /** Цвет эмблемы, пера, плюмажа, пояса. */
  accent: string
  emblem: EmblemKind
  /** Плащ этого цвета за спиной. */
  cape?: string
  /** Маска на глаза (плуты и тени). */
  mask?: boolean
  /** Масть верхового животного (иначе по умолчанию для вида животного). */
  mountColor?: string
}

const o = (
  hat: HatKind,
  hatColor: string,
  garb: GarbKind,
  color: string,
  accent: string,
  emblem: EmblemKind,
  extra: Partial<Pick<Outfit, "cape" | "mask" | "mountColor">> = {}
): Outfit => ({ hat, hatColor, garb, color, accent, emblem, ...extra })

const GOLD = "#ffd54f"

/** Наряд каждого класса `CHARACTER_CLASSES` (ключ — id класса модели). */
export const CLASS_OUTFITS: Record<string, Outfit> = {
  // Base
  "commoner": o("strawHat", "#c0392b", "tunic", "#a47148", "#6d4c2f", "none"),
  "noble": o("beret", "#3a5ba0", "vest", "#3a5ba0", GOLD, "shield"),
  // Beginner
  "gladiator": o("plumedHelm", "#b8c0cc", "armor", "#b5651d", "#c0392b", "fist"),
  "hunter": o("featherCap", "#4f7a3a", "tunic", "#6b8e4e", "#c0392b", "feather"),
  "soldier": o("helmet", "#9aa6b8", "tunic", "#3d6fb6", "#f1f1f1", "shield"),
  "diviner": o("turban", "#2a9d8f", "robe", "#2a9d8f", "#f4d35e", "eye"),
  // Specialty
  "myrmidon": o("headband", "#d62828", "gi", "#d62828", "#ffffff", "sword"),
  "brigand": o("bandana", "#7f4f24", "vest", "#5c3d2e", "#e0a458", "skull"),
  "pugilist": o("headband", "#e85d04", "vest", "#e85d04", "#2b2d42", "fist"),
  "archer": o("featherCap", "#2d6a4f", "tunic", "#40916c", "#e9c46a", "feather"),
  "rogue": o("bandana", "#5a189a", "vest", "#3c096c", "#c77dff", "none", { mask: true }),
  "armored-knight": o("greatHelm", "#8a93a6", "plate", "#8a93a6", "#3d6fb6", "shield"),
  "light-cavalry": o("helmet", "#c9ced6", "tunic", "#e76f51", "#f4a261", "star"),
  "wing-soldier": o("wingedHelm", "#e0e7ff", "armor", "#8ecae6", "#ffffff", "feather"),
  "priest": o("skullcap", "#f8f9fa", "robe", "#f8f9fa", "#4f8fd1", "cross"),
  "shaman": o("hood", "#3c1642", "robe", "#3c1642", "#b388eb", "flame"),
  // Advanced
  "shido": o("kabuto", "#2b2b30", "gi", "#9d0208", "#ffd60a", "sun"),
  "dancer": o("veil", "#ff8fab", "dress", "#ff4d8d", "#ffd60a", "star"),
  "warrior": o("hornedHelm", "#8d99ae", "vest", "#7f5539", "#e9c46a", "flame"),
  "blacksmith": o("bandana", "#6c584c", "apron", "#8d6e63", "#f77f00", "hammer"),
  "sniper": o("hood", "#344e41", "tunic", "#3a5a40", "#a3b18a", "eye"),
  "forest-knight": o("helmet", "#6a8f5c", "tunic", "#344e41", "#dad7cd", "leaf"),
  "ranger": o("hood", "#7f5539", "tunic", "#b08968", "#ddb892", "leaf", { cape: "#6f4e37" }),
  "guardian": o("helmet", "#4361ee", "armor", "#4361ee", "#f1faee", "shield"),
  "dreadnought": o("greatHelm", "#495057", "plate", "#343a40", "#e63946", "skull"),
  "bardinger": o("plumedHelm", "#c9ced6", "armor", "#264653", "#e9c46a", "sun"),
  "cataphract": o("greatHelm", "#6c757d", "plate", "#6c757d", "#9d0208", "shield", { mountColor: "#4a4e69" }),
  "dragoon": o("hornedHelm", "#2d6a4f", "armor", "#2d6a4f", "#95d5b2", "flame"),
  "ovate": o("wizardHat", "#5a189a", "robe", "#7b2cbf", "#ffd60a", "moon"),
  "bishop": o("mitre", "#ffffff", "robe", "#f8f9fa", GOLD, "cross", { cape: "#4f8fd1" }),
  "troubadour": o("beret", "#e5989b", "robe", "#ffb4a2", "#6d6875", "cross", { mountColor: "#f1e3d3" }),
  // Master
  "swordmaster": o("headband", "#9d0208", "gi", "#370617", "#ffba08", "sword", { cape: "#6a040f" }),
  "high-savant": o("wizardHat", "#003049", "robe", "#003049", "#fcbf49", "star"),
  "battlemaster": o("hornedHelm", "#6c584c", "armor", "#7f5539", "#ffb703", "flame", { cape: "#9c6644" }),
  "war-monk": o("skullcap", "#ffbf69", "gi", "#ffbf69", "#8d0801", "sun"),
  "bow-adept": o("hood", "#1b4332", "tunic", "#2d6a4f", "#ffd60a", "feather", { cape: "#081c15" }),
  "bow-knight": o("plumedHelm", "#40916c", "armor", "#2d6a4f", "#ffd60a", "feather"),
  "shadow-seeker": o("hood", "#10002b", "vest", "#240046", "#9d4edd", "eye", { mask: true, cape: "#10002b" }),
  "sentinel": o("plumedHelm", "#1d3557", "armor", "#1d3557", "#f1faee", "shield", { cape: "#457b9d" }),
  "castle-knight": o("greatHelm", "#adb5bd", "plate", "#adb5bd", "#1d3557", "shield", { cape: "#1d3557" }),
  "orichaldia": o("plumedHelm", "#d4a373", "armor", "#d4a373", "#fefae0", "sun"),
  "great-knight": o("greatHelm", "#495057", "plate", "#6c757d", "#ffb703", "shield", { cape: "#9d0208", mountColor: "#3d405b" }),
  "celestial-trooper": o("wingedHelm", "#ffffff", "armor", "#caf0f8", GOLD, "star", { cape: "#90e0ef" }),
  "bau-lord": o("hornedHelm", "#370617", "armor", "#6a040f", "#ffba08", "flame", { cape: "#370617", mountColor: "#9d0208" }),
  "druid": o("hood", "#386641", "robe", "#6a994e", "#f2e8cf", "leaf"),
  "wiseman": o("hood", "#e9ecef", "robe", "#f8f9fa", GOLD, "sun", { cape: GOLD }),
  "valkyrium": o("wingedHelm", "#f8f9fa", "robe", "#ffd6ff", GOLD, "moon", { mountColor: "#fdfdfd" }),
  // Divine
  "the-blade": o("headband", GOLD, "gi", "#ae2012", GOLD, "sword", { cape: GOLD }),
  "the-apsara": o("tiara", GOLD, "dress", "#f4a261", GOLD, "star"),
  "the-eternal": o("hornedHelm", GOLD, "armor", "#9b2226", GOLD, "flame", { cape: "#9b2226" }),
  "the-godhand": o("circlet", GOLD, "gi", "#ffffff", GOLD, "fist"),
  "the-calamity": o("hood", "#3c096c", "vest", "#10002b", "#ff006e", "skull", { mask: true, cape: "#ff006e" }),
  "the-trident": o("plumedHelm", GOLD, "armor", "#0077b6", GOLD, "wave", { cape: "#023e8a" }),
  "the-cavalier": o("plumedHelm", GOLD, "plate", "#e9ecef", GOLD, "sun", { cape: "#9d0208", mountColor: "#f1f1f1" }),
  "the-avatar": o("circlet", GOLD, "robe", "#ffffff", GOLD, "star", { cape: "#c77dff" })
}

/** Наряд класса; у неизвестного id — простая туника. */
export function outfitOf(classId: string): Outfit {
  return CLASS_OUTFITS[classId] ?? o("none", "#888888", "tunic", "#a47148", "#6d4c2f", "none")
}

/* ---------- Геометрия миниатюры ---------- */

export interface OutfitArt {
  species: ArtSpecies
  classId?: string
  tier?: ClassTier
  mount?: Mount
  pose?: string
}

function headGeom(s: ArtSpecies): { cy: number, r: number, top: number } {
  const r = s === "mouse" ? 31 : s === "dog" ? 33 : 34
  const cy = s === "mouse" ? 52 : 50
  return { cy, r, top: cy - r }
}

function bodyGeom(s: ArtSpecies): { cy: number, rx: number, ry: number } {
  return { cy: s === "mouse" ? 88 : 86, rx: s === "mouse" ? 24 : s === "dog" ? 28 : 27, ry: s === "mouse" ? 16 : 18 }
}

/** Полуширина эллипса тела на высоте y. */
function halfWidth(rx: number, ry: number, dy: number): number {
  return rx * Math.sqrt(Math.max(0, 1 - (dy / ry) ** 2))
}

const f1 = (n: number): string => (Math.round(n * 10) / 10).toString()

/* ---------- Ярус ---------- */

const TIER_TRIM: Record<ClassTier, { color: string, width: number } | null> = {
  base: null,
  beginner: { color: "#b07a3a", width: 1.6 },
  specialty: { color: "#d7dce3", width: 2 },
  advanced: { color: "#e3b341", width: 2.2 },
  master: { color: GOLD, width: 2.8 },
  divine: { color: "#fff2a8", width: 3 }
}

function star(cx: number, cy: number, r: number, fill: string): string {
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rr = i % 2 === 0 ? r : r * 0.45
    pts.push(`${f1(cx + rr * Math.cos(a))},${f1(cy + rr * Math.sin(a))}`)
  }
  return `<polygon points="${pts.join(" ")}" fill="${fill}" />`
}

/* ---------- Эмблема ---------- */

function emblem(kind: EmblemKind, x: number, y: number, c: string): string {
  const d = shade(c, -0.35)
  switch (kind) {
    case "cross":
      return `<path d="M${x} ${y - 5} v10 M${x - 4} ${y - 1} h8" stroke="${c}" stroke-width="2.8" stroke-linecap="round" />`
    case "star":
      return star(x, y, 5.5, c)
    case "flame":
      return `<path d="M${x} ${y - 6} q6 5 4 9 q-1 3 -4 3 q-4 0 -4 -4 q0 -3 2 -4 q0 3 2 3 q-1 -4 0 -7 z" fill="${c}" stroke="${d}" stroke-width=".8" />`
    case "leaf":
      return `<path d="M${x - 5} ${y + 4} Q${x - 5} ${y - 5} ${x + 5} ${y - 5} Q${x + 5} ${y + 4} ${x - 5} ${y + 4} z" fill="${c}" stroke="${d}" stroke-width=".8" /><path d="M${x - 4} ${y + 3} L${x + 4} ${y - 4}" stroke="${d}" stroke-width=".8" />`
    case "sword":
      return `<path d="M${x} ${y - 7} v11 M${x - 4} ${y + 2} h8 M${x} ${y + 2} v4" stroke="${c}" stroke-width="2.2" stroke-linecap="round" />`
    case "shield":
      return `<path d="M${x - 5} ${y - 5} h10 v4 q0 5 -5 8 q-5 -3 -5 -8 z" fill="${c}" stroke="${d}" stroke-width="1" />`
    case "moon":
      return `<path d="M${x + 2} ${y - 6} a6 6 0 1 0 0 12 a4.5 4.5 0 1 1 0 -12 z" fill="${c}" />`
    case "sun":
      return `<g stroke="${c}" stroke-width="1.6" stroke-linecap="round"><path d="M${x} ${y - 8} v3 M${x} ${y + 5} v3 M${x - 8} ${y} h3 M${x + 5} ${y} h3 M${x - 5.5} ${y - 5.5} l2 2 M${x + 3.5} ${y + 3.5} l2 2 M${x + 5.5} ${y - 5.5} l-2 2 M${x - 3.5} ${y + 3.5} l-2 2" /></g><circle cx="${x}" cy="${y}" r="3.6" fill="${c}" />`
    case "hammer":
      return `<path d="M${x} ${y - 2} v8" stroke="${d}" stroke-width="2.2" stroke-linecap="round" /><rect x="${x - 5}" y="${y - 6}" width="10" height="5" rx="1" fill="${c}" stroke="${d}" stroke-width=".8" />`
    case "feather":
      return `<path d="M${x - 5} ${y + 6} Q${x - 3} ${y - 4} ${x + 5} ${y - 7} Q${x + 3} ${y + 2} ${x - 5} ${y + 6} z" fill="${c}" stroke="${d}" stroke-width=".8" />`
    case "eye":
      return `<path d="M${x - 6} ${y} Q${x} ${y - 6} ${x + 6} ${y} Q${x} ${y + 6} ${x - 6} ${y} z" fill="${c}" stroke="${d}" stroke-width=".8" /><circle cx="${x}" cy="${y}" r="2" fill="${INK}" />`
    case "fist":
      return `<rect x="${x - 5}" y="${y - 4}" width="10" height="8" rx="3" fill="${c}" stroke="${d}" stroke-width=".9" /><path d="M${x - 2} ${y - 4} v3 M${x + 1} ${y - 4} v3" stroke="${d}" stroke-width=".8" />`
    case "wave":
      return `<path d="M${x - 6} ${y + 1} q3 -5 6 0 q3 5 6 0" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round" /><path d="M${x} ${y - 7} v12 M${x - 3} ${y - 5} v3 M${x + 3} ${y - 5} v3" stroke="${c}" stroke-width="1.4" stroke-linecap="round" />`
    case "skull":
      return `<circle cx="${x}" cy="${y - 1}" r="4.6" fill="${c}" /><rect x="${x - 2.6}" y="${y + 2}" width="5.2" height="3.2" rx="1" fill="${c}" /><circle cx="${x - 1.7}" cy="${y - 1}" r="1.2" fill="${INK}" /><circle cx="${x + 1.7}" cy="${y - 1}" r="1.2" fill="${INK}" />`
    default:
      return ""
  }
}

/* ---------- Верховые животные ---------- */

const MOUNT_COLOR: Record<Mount, string> = { horse: "#8d5a3b", pegasus: "#f4f1ff", dragon: "#52b788" }

function featherWings(c: string): string {
  const line = shade(c, -0.3)
  const wing = `<path d="M50 88 C34 76 12 68 4 46 C14 52 22 52 26 50 C18 40 18 30 22 22 C32 38 42 52 56 80 z" fill="${c}" stroke="${line}" stroke-width="1.3" stroke-linejoin="round" />
    <path d="M44 80 C30 70 18 62 12 52 M48 72 C38 60 30 48 26 34" fill="none" stroke="${line}" stroke-width="1" opacity=".6" />`
  return `<g class="wings">${wing}<g transform="translate(120 0) scale(-1 1)">${wing}</g></g>`
}

function batWings(c: string): string {
  const line = shade(c, -0.4)
  const wing = `<path d="M50 90 L10 38 L18 56 L2 54 L16 70 L4 76 L46 94 z" fill="${shade(c, -0.12)}" stroke="${line}" stroke-width="1.3" stroke-linejoin="round" />
    <path d="M48 90 L12 42 M47 91 L6 58 M46 93 L8 74" fill="none" stroke="${line}" stroke-width="1" opacity=".7" />`
  return `<g class="wings">${wing}<g transform="translate(120 0) scale(-1 1)">${wing}</g></g>`
}

function horseBody(c: string, cloth: string, dragon: boolean): string {
  const dark = shade(c, -0.38)
  const legs = [28, 41, 80, 93]
    .map(x => `<rect x="${x}" y="99" width="8" height="${dragon ? 11 : 13}" rx="3" fill="${shade(c, -0.08)}" stroke="${dark}" stroke-width="1.3" />`)
    .join("")
  const tail = dragon
    ? `<path d="M98 92 Q114 92 116 106" fill="none" stroke="${c}" stroke-width="8" stroke-linecap="round" /><path d="M111 101 l9 0 l-5 9 z" fill="${dark}" />`
    : `<path d="M100 88 q15 2 16 18" fill="none" stroke="${dark}" stroke-width="7" stroke-linecap="round" />`
  const neck = `<path d="M38 92 Q22 80 18 62 L31 58 Q34 76 50 86 z" fill="${c}" stroke="${dark}" stroke-width="1.4" stroke-linejoin="round" />`
  const head = dragon
    ? `<path d="M0 60 Q6 48 24 52 Q33 56 30 66 Q16 72 0 66 z" fill="${c}" stroke="${dark}" stroke-width="1.4" stroke-linejoin="round" />
      <path d="M22 52 l8 -12 l-2 14 z M15 51 l3 -10 l2 11 z" fill="#f1e3c6" stroke="#a68a64" stroke-width=".9" />
      <path d="M2 64 h10" stroke="${dark}" stroke-width="1.2" />
      <circle cx="14" cy="57" r="2.4" fill="#ffd60a" /><circle cx="14" cy="57" r="1.1" fill="${INK}" />`
    : `<ellipse cx="13" cy="62" rx="13" ry="8.5" fill="${c}" stroke="${dark}" stroke-width="1.4" transform="rotate(-24 13 62)" />
      <path d="M19 53 l3 -10 l4 11 z" fill="${c}" stroke="${dark}" stroke-width="1.1" />
      <circle cx="10" cy="59" r="2" fill="${INK}" /><circle cx="2" cy="67" r="1.2" fill="${dark}" />
      <path d="M24 52 Q34 62 42 84" fill="none" stroke="${dark}" stroke-width="5" stroke-linecap="round" />`
  const spines = dragon
    ? `<path d="M66 82 l5 -8 l4 8 M78 82 l5 -8 l4 8 M90 85 l5 -7 l4 8" fill="${shade(c, 0.2)}" stroke="${dark}" stroke-width="1.1" />`
    : ""
  return `${tail}${legs}<ellipse cx="62" cy="92" rx="42" ry="13" fill="${c}" stroke="${dark}" stroke-width="1.5" />
    <ellipse cx="62" cy="89" rx="30" ry="5" fill="#ffffff" opacity=".18" />
    ${spines}${neck}${head}
    <path d="M38 84 Q60 76 84 84 L86 96 Q60 102 36 96 z" fill="${cloth}" stroke="${shade(cloth, -0.35)}" stroke-width="1.3" stroke-linejoin="round" />
    <path d="M38 94 Q60 100 84 94" fill="none" stroke="${GOLD}" stroke-width="1.6" opacity=".8" />`
}

/** Всадник поверх животного: уменьшен и приподнят, чтобы животное было видно под ним. */
export const RIDER_TRANSFORM = "translate(60 8) scale(0.8) translate(-60 -8)"

/** Животное под всадником (позади тела). */
export function mountSvg(a: OutfitArt): string {
  if (!a.mount) return ""
  const outfit = a.classId ? outfitOf(a.classId) : undefined
  const c = outfit?.mountColor ?? MOUNT_COLOR[a.mount]
  const cloth = outfit?.color ?? "#c0392b"
  const wings = a.mount === "pegasus" ? featherWings("#ffffff") : a.mount === "dragon" ? batWings(c) : ""
  return `<g class="mount">${wings}${horseBody(c, cloth, a.mount === "dragon")}</g>`
}

/* ---------- Одежда ---------- */

/** Сияние божественного яруса: самый задний слой. */
export function outfitAura(a: OutfitArt): string {
  if (!a.classId || a.tier !== "divine") return ""
  return "<g class=\"aura\"><ellipse cx=\"60\" cy=\"58\" rx=\"58\" ry=\"62\" fill=\"#ffd54f\" opacity=\".16\" /><ellipse cx=\"60\" cy=\"58\" rx=\"46\" ry=\"50\" fill=\"#ffe066\" opacity=\".2\" /><ellipse cx=\"60\" cy=\"58\" rx=\"57\" ry=\"61\" fill=\"none\" stroke=\"#ffe066\" stroke-width=\"1.5\" opacity=\".55\" /></g>"
}

/** Плащ за спиной (поверх животного, до хвоста и тела). */
export function outfitCape(a: OutfitArt): string {
  if (!a.classId) return ""
  const outfit = outfitOf(a.classId)
  if (!outfit.cape) return ""
  const { cy, rx, ry } = bodyGeom(a.species)
  const bottom = a.mount ? 102 : 110
  return `<path class="cape" d="M${60 - rx + 4} ${cy - ry + 2} Q60 ${cy - ry - 4} ${60 + rx - 4} ${cy - ry + 2} L${60 + rx + 10} ${bottom} Q60 ${bottom + 5} ${60 - rx - 10} ${bottom} z" fill="${outfit.cape}" stroke="${shade(outfit.cape, -0.35)}" stroke-width="1.4" stroke-linejoin="round" />`
}

/** Одежда, эмблема и отделка яруса поверх тела. */
export function outfitBody(a: OutfitArt): string {
  if (!a.classId) return ""
  const outfit = outfitOf(a.classId)
  const { cy, rx, ry } = bodyGeom(a.species)
  const c = outfit.color
  const line = shade(c, -0.38)
  const top = cy - ry
  const base = `<ellipse cx="60" cy="${cy}" rx="${rx - 0.5}" ry="${ry - 0.5}" fill="${c}" stroke="${line}" stroke-width="1.5" />`
  const belt = (y: number, color: string, width = 4): string => {
    const w = halfWidth(rx - 1, ry - 1, y - cy)
    return `<path d="M${f1(60 - w)} ${y} H${f1(60 + w)}" stroke="${color}" stroke-width="${width}" />`
  }
  const skirt = (flare: number, wavy: boolean): string => {
    if (a.mount) return ""
    const l = 60 - rx + 3
    const r = 60 + rx - 3
    const bl = 60 - rx - flare
    const br = 60 + rx + flare
    const hem = wavy
      ? `Q${f1(br - 8)} 114 ${f1(br - 14)} 109 Q${f1((br + bl) / 2 + 8)} 115 60 109 Q${f1((br + bl) / 2 - 8)} 115 ${f1(bl + 14)} 109 Q${f1(bl + 8)} 114 ${f1(bl)} 109`
      : `Q60 113 ${f1(bl)} 109`
    return `<path d="M${r} ${cy} L${f1(br)} 109 ${hem} L${l} ${cy} z" fill="${c}" stroke="${line}" stroke-width="1.4" stroke-linejoin="round" />`
  }
  let g = ""
  let emblemAt = { x: 60, y: cy + 2 }
  switch (outfit.garb) {
    case "tunic":
      g = base + belt(cy + 7, "#5a3a1e") + `<rect x="57" y="${cy + 4.5}" width="6" height="5" rx="1" fill="${outfit.accent}" stroke="#5a3a1e" stroke-width=".8" />`
      emblemAt = { x: 60, y: cy - 4 }
      break
    case "vest":
      g = base + `<path d="M50 ${top + 2} L60 ${cy + 10} L70 ${top + 2} z" fill="#f5efe0" stroke="${line}" stroke-width="1" />`
        + `<g fill="${outfit.accent}"><circle cx="${f1(60 - 9)}" cy="${cy + 2}" r="1.5" /><circle cx="${f1(60 + 9)}" cy="${cy + 2}" r="1.5" /></g>`
      emblemAt = { x: 60 + rx - 10, y: cy - 6 }
      break
    case "gi":
      g = base + `<path d="M47 ${top + 3} L63 ${cy + 7} M73 ${top + 3} L57 ${cy + 7}" stroke="#ffffff" stroke-width="3.2" stroke-linecap="round" opacity=".92" />`
        + belt(cy + 8, shade(outfit.accent, -0.1), 4.5)
      emblemAt = { x: 60 - rx + 12, y: cy - 2 }
      break
    case "robe":
      g = skirt(5, false) + base
        + `<path d="M60 ${top + 1} V${a.mount ? cy + ry - 1 : 110}" stroke="${outfit.accent}" stroke-width="3" />`
      emblemAt = { x: 60, y: cy - 3 }
      break
    case "dress":
      g = skirt(9, true) + base
        + `<path d="M${60 - rx + 4} ${cy - 6} L${60 + rx - 4} ${cy + 6}" stroke="${outfit.accent}" stroke-width="4" stroke-linecap="round" />`
      emblemAt = { x: 60 + rx - 9, y: cy + 4 }
      break
    case "apron":
      g = base + `<path d="M49 ${cy - 7} h22 v${ry + 3} q-11 4 -22 0 z" fill="#5d4037" stroke="#3e2723" stroke-width="1" />`
        + `<path d="M50 ${cy - 7} L44 ${top + 3} M70 ${cy - 7} L76 ${top + 3}" stroke="#3e2723" stroke-width="2" />`
      emblemAt = { x: 60, y: cy + 1 }
      break
    case "armor": {
      const steel = "#d4dae2"
      g = base
        + `<path d="M45 ${top + 5} Q60 ${top} 75 ${top + 5} L73 ${cy + 8} Q60 ${cy + 15} 47 ${cy + 8} z" fill="${steel}" stroke="#6c757d" stroke-width="1.3" />`
        + `<path d="M50 ${top + 8} Q60 ${top + 5} 70 ${top + 8}" stroke="#ffffff" stroke-width="1.6" fill="none" opacity=".8" />`
        + `<g fill="${c}" stroke="${line}" stroke-width="1.3"><circle cx="${60 - rx + 5}" cy="${top + 7}" r="8" /><circle cx="${60 + rx - 5}" cy="${top + 7}" r="8" /></g>`
      emblemAt = { x: 60, y: cy + 1 }
      break
    }
    case "plate": {
      const steelLine = shade(c, -0.45)
      g = `<ellipse cx="60" cy="${cy}" rx="${rx + 1}" ry="${ry}" fill="${c}" stroke="${steelLine}" stroke-width="1.8" />`
        + belt(cy - 4, steelLine, 1.4) + belt(cy + 5, steelLine, 1.4)
        + `<rect x="54" y="${top + 2}" width="12" height="${ry * 2 - 3}" rx="2" fill="${outfit.accent}" stroke="${shade(outfit.accent, -0.35)}" stroke-width="1" />`
        + `<g fill="${shade(c, 0.12)}" stroke="${steelLine}" stroke-width="1.5"><ellipse cx="${60 - rx + 3}" cy="${top + 6}" rx="11" ry="9" /><ellipse cx="${60 + rx - 3}" cy="${top + 6}" rx="11" ry="9" /></g>`
        + `<g fill="${steelLine}"><circle cx="${60 - rx + 3}" cy="${top + 6}" r="1.4" /><circle cx="${60 + rx - 3}" cy="${top + 6}" r="1.4" /></g>`
      emblemAt = { x: 60, y: cy - 2 }
      break
    }
  }
  const em = emblem(outfit.emblem, emblemAt.x, emblemAt.y, outfit.garb === "plate" ? shade(outfit.color, 0.5) : outfit.accent)
  return `<g class="outfit">${g}${em}${tierTrim(a, cy, rx, ry)}</g>`
}

function tierTrim(a: OutfitArt, cy: number, rx: number, ry: number): string {
  const trim = a.tier ? TIER_TRIM[a.tier] : null
  if (!trim) return ""
  const top = cy - ry
  let s = `<path d="M${60 - rx + 6} ${top + 4} Q60 ${top + 12} ${60 + rx - 6} ${top + 4}" fill="none" stroke="${trim.color}" stroke-width="${trim.width + 0.6}" stroke-linecap="round" />`
  if (a.tier === "advanced") {
    s += `<g fill="${trim.color}"><circle cx="${60 - rx + 6}" cy="${top + 5}" r="2.4" /><circle cx="${60 + rx - 6}" cy="${top + 5}" r="2.4" /></g>`
  }
  if (a.tier === "master" || a.tier === "divine") {
    const ep = (x: number): string => `<ellipse cx="${x}" cy="${top + 4}" rx="9" ry="4" fill="${trim.color}" stroke="#b8860b" stroke-width="1" />
      <path d="M${x - 6} ${top + 7} v5 M${x - 2} ${top + 8} v5 M${x + 2} ${top + 8} v5 M${x + 6} ${top + 7} v5" stroke="#b8860b" stroke-width="1.2" stroke-linecap="round" />`
    s += ep(60 - rx + 5) + ep(60 + rx - 5)
  }
  return s
}

/* ---------- Головной убор ---------- */

/** Часть убора за головой (до ушей и головы): капюшон. */
export function outfitHeadBack(a: OutfitArt): string {
  if (!a.classId) return ""
  const outfit = outfitOf(a.classId)
  if (outfit.hat !== "hood") return ""
  const { cy, r } = headGeom(a.species)
  return `<circle class="hood-back" cx="60" cy="${cy + 2}" r="${r + 7}" fill="${shade(outfit.hatColor, -0.15)}" stroke="${shade(outfit.hatColor, -0.45)}" stroke-width="1.5" />`
}

function helmetDome(cx: number, top: number, r: number, c: string): string {
  const dark = shade(c, -0.4)
  return `<path d="M${60 - r + 1} ${top + 20} Q${60 - r + 1} ${top - 6} ${cx} ${top - 6} Q${60 + r - 1} ${top - 6} ${60 + r - 1} ${top + 20} z" fill="${c}" stroke="${dark}" stroke-width="1.5" stroke-linejoin="round" />
    <path d="M${60 - r + 8} ${top + 2} Q60 ${top - 3} ${60 + r - 8} ${top + 2}" fill="none" stroke="#ffffff" stroke-width="2" opacity=".55" />
    <path d="M${60 - r} ${top + 20} H${60 + r}" stroke="${dark}" stroke-width="3.2" stroke-linecap="round" />`
}

/** Головной убор поверх головы, маска и знак яруса над головой. */
export function outfitHead(a: OutfitArt): string {
  if (!a.classId) return ""
  const outfit = outfitOf(a.classId)
  const { cy, r, top: t } = headGeom(a.species)
  const c = outfit.hatColor
  const dark = shade(c, -0.4)
  const acc = outfit.accent
  let h = ""
  switch (outfit.hat) {
    case "strawHat":
      h = `<ellipse cx="60" cy="${t + 8}" rx="${r + 12}" ry="7" fill="#e9c46a" stroke="#b5892f" stroke-width="1.4" />
        <path d="M${f1(60 - r * 0.62)} ${t + 8} Q60 ${t - 20} ${f1(60 + r * 0.62)} ${t + 8} z" fill="#f2d07a" stroke="#b5892f" stroke-width="1.4" />
        <path d="M${f1(60 - r * 0.6)} ${t + 4} Q60 ${t - 1} ${f1(60 + r * 0.6)} ${t + 4}" fill="none" stroke="${c}" stroke-width="3.2" />`
      break
    case "beret":
      h = `<ellipse cx="54" cy="${t + 4}" rx="${f1(r * 0.86)}" ry="10" fill="${c}" stroke="${dark}" stroke-width="1.4" transform="rotate(-12 54 ${t + 4})" />
        <circle cx="52" cy="${t - 5}" r="2.4" fill="${dark}" />
        <path d="M70 ${t + 1} q14 -12 20 -26 q-2 14 -18 28 z" fill="${acc}" stroke="${shade(acc, -0.35)}" stroke-width="1" />`
      break
    case "headband":
      h = `<path d="M${60 - r + 2} ${t + 18} Q60 ${t + 8} ${60 + r - 2} ${t + 18}" fill="none" stroke="${c}" stroke-width="6.5" stroke-linecap="round" />
        <path d="M${60 + r - 4} ${t + 18} q12 2 18 11 M${60 + r - 4} ${t + 18} q14 -2 21 5" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round" />`
      break
    case "bandana":
      h = `<path d="M${60 - r + 1} ${t + 20} Q60 ${t - 16} ${60 + r - 1} ${t + 20} Q60 ${t + 10} ${60 - r + 1} ${t + 20} z" fill="${c}" stroke="${dark}" stroke-width="1.4" />
        <path d="M${60 - r + 3} ${t + 17} l-13 3 l5 -11 z M${60 - r + 3} ${t + 17} l-9 10 l-2 -9 z" fill="${c}" stroke="${dark}" stroke-width="1" />
        <g fill="#ffffff" opacity=".75"><circle cx="50" cy="${t + 4}" r="1.6" /><circle cx="62" cy="${t + 1}" r="1.6" /><circle cx="72" cy="${t + 6}" r="1.6" /></g>`
      break
    case "featherCap":
      h = `<path d="M${60 - r + 2} ${t + 18} Q${f1(60 - r / 2)} ${t - 10} 66 ${t - 5} Q${60 + r} ${t + 2} ${60 + r - 1} ${t + 18} Q60 ${t + 8} ${60 - r + 2} ${t + 18} z" fill="${c}" stroke="${dark}" stroke-width="1.4" />
        <path d="M74 ${t + 1} q14 -18 27 -22 q-6 14 -25 25 z" fill="${acc}" stroke="${shade(acc, -0.35)}" stroke-width="1" />`
      break
    case "hood":
      h = `<path d="M${60 - r - 6} ${cy + 4} Q${60 - r - 6} ${t - 8} 60 ${t - 8} Q${60 + r + 6} ${t - 8} ${60 + r + 6} ${cy + 4} Q${60 + r - 3} ${t + 7} 60 ${t + 9} Q${60 - r + 3} ${t + 7} ${60 - r - 6} ${cy + 4} z" fill="${c}" stroke="${dark}" stroke-width="1.5" stroke-linejoin="round" />
        <path d="M${60 - r + 2} ${t + 12} Q60 ${t + 3} ${60 + r - 2} ${t + 12}" fill="none" stroke="${shade(c, 0.25)}" stroke-width="1.6" opacity=".7" />`
      break
    case "helmet":
      h = helmetDome(60, t, r, c) + `<rect x="58" y="${t + 14}" width="4" height="12" rx="1" fill="${dark}" />`
      break
    case "plumedHelm":
      h = `<path d="M60 ${t - 6} q-6 -18 12 -24 q-2 10 12 14 q-14 1 -18 12 z" fill="${acc}" stroke="${shade(acc, -0.35)}" stroke-width="1.2" />`
        + helmetDome(60, t, r, c) + `<rect x="58" y="${t + 14}" width="4" height="12" rx="1" fill="${dark}" />`
      break
    case "greatHelm":
      h = helmetDome(60, t, r, c)
        + `<path d="M60 ${t - 6} V${t + 18}" stroke="${shade(c, 0.3)}" stroke-width="3" />`
        + `<path d="M${60 - r + 1} ${t + 20} v14 q5 5 10 2 v-16 z M${60 + r - 1} ${t + 20} v14 q-5 5 -10 2 v-16 z" fill="${c}" stroke="${dark}" stroke-width="1.3" stroke-linejoin="round" />`
        + `<path d="M${60 - r + 6} ${t + 12} H${60 - 6} M${60 + 6} ${t + 12} H${60 + r - 6}" stroke="${dark}" stroke-width="2" stroke-linecap="round" />`
      break
    case "hornedHelm":
      h = `<path d="M${60 - r + 6} ${t + 8} q-18 -6 -16 -28 q8 15 24 17 z M${60 + r - 6} ${t + 8} q18 -6 16 -28 q-8 15 -24 17 z" fill="#f1e3c6" stroke="#a68a64" stroke-width="1.3" stroke-linejoin="round" />`
        + helmetDome(60, t, r, c)
      break
    case "kabuto":
      h = helmetDome(60, t, r, c)
        + `<path d="M${60 - r - 4} ${t + 22} L${60 - r + 4} ${t + 12} M${60 + r + 4} ${t + 22} L${60 + r - 4} ${t + 12}" stroke="${c}" stroke-width="6" stroke-linecap="round" />`
        + `<path d="M42 ${t - 3} Q60 ${t + 7} 78 ${t - 3} L84 ${t - 16} Q60 ${t - 2} 36 ${t - 16} z" fill="${acc}" stroke="${shade(acc, -0.35)}" stroke-width="1.2" stroke-linejoin="round" />`
      break
    case "wingedHelm": {
      const wing = `<path d="M${60 - r + 3} ${t + 10} q-15 -4 -21 -19 q10 2 14 -2 q2 9 11 11 z" fill="#ffffff" stroke="#9aa5b8" stroke-width="1.2" stroke-linejoin="round" />`
      h = helmetDome(60, t, r, c) + wing + `<g transform="translate(120 0) scale(-1 1)">${wing}</g>`
      break
    }
    case "turban":
      h = `<ellipse cx="60" cy="${t + 6}" rx="${r - 1}" ry="15" fill="${c}" stroke="${dark}" stroke-width="1.4" />
        <path d="M${60 - r + 6} ${t + 6} Q60 ${t - 6} ${60 + r - 6} ${t + 8} M${60 - r + 4} ${t + 13} Q60 ${t + 2} ${60 + r - 4} ${t + 14}" fill="none" stroke="${dark}" stroke-width="1.3" opacity=".7" />
        <circle cx="60" cy="${t + 6}" r="3.4" fill="${acc}" stroke="${shade(acc, -0.35)}" stroke-width="1" />
        <path d="M60 ${t + 3} q3 -12 10 -16" fill="none" stroke="${acc}" stroke-width="2.4" stroke-linecap="round" />`
      break
    case "wizardHat":
      h = `<path d="M${f1(60 - r * 0.58)} ${t + 8} L72 ${t - 38} L${f1(60 + r * 0.58)} ${t + 8} z" fill="${c}" stroke="${dark}" stroke-width="1.4" stroke-linejoin="round" />
        <ellipse cx="60" cy="${t + 9}" rx="${r + 8}" ry="7" fill="${c}" stroke="${dark}" stroke-width="1.4" />
        <path d="M${f1(60 - r * 0.52)} ${t + 3} Q60 ${t + 7} ${f1(60 + r * 0.52)} ${t + 3}" fill="none" stroke="${acc}" stroke-width="3" />
        ${star(64, t - 14, 3.5, acc)}${star(56, t - 2, 2.4, acc)}`
      break
    case "mitre":
      h = `<path d="M${f1(60 - r * 0.5)} ${t + 10} L${f1(60 - r * 0.44)} ${t - 20} L60 ${t - 32} L${f1(60 + r * 0.44)} ${t - 20} L${f1(60 + r * 0.5)} ${t + 10} z" fill="${c}" stroke="#b8860b" stroke-width="1.6" stroke-linejoin="round" />
        <path d="M60 ${t - 22} v22 M53 ${t - 12} h14" stroke="${acc}" stroke-width="3" stroke-linecap="round" />
        <path d="M${f1(60 - r * 0.5)} ${t + 8} H${f1(60 + r * 0.5)}" stroke="${acc}" stroke-width="3" />`
      break
    case "skullcap":
      h = `<path d="M${f1(60 - r * 0.62)} ${t + 7} Q60 ${t - 9} ${f1(60 + r * 0.62)} ${t + 7} z" fill="${c}" stroke="${dark}" stroke-width="1.4" />`
      break
    case "veil":
      h = `<path d="M${60 - r} ${t + 18} Q60 ${t - 4} ${60 + r} ${t + 18} L${60 + r + 9} ${cy + 26} L${60 + r - 5} ${cy + 16} L${60 + r - 5} ${t + 22} Q60 ${t + 10} ${60 - r + 5} ${t + 22} L${60 - r + 5} ${cy + 16} L${60 - r - 9} ${cy + 26} z" fill="${c}" opacity=".72" stroke="${dark}" stroke-width="1" />
        <path d="M46 ${t + 9} L50 ${t + 1} L55 ${t + 6} L60 ${t - 3} L65 ${t + 6} L70 ${t + 1} L74 ${t + 9} Q60 ${t + 6} 46 ${t + 9} z" fill="${acc}" stroke="#b8860b" stroke-width="1" />`
      break
    case "tiara":
      h = `<path d="M44 ${t + 9} L48 ${t - 2} L54 ${t + 4} L60 ${t - 8} L66 ${t + 4} L72 ${t - 2} L76 ${t + 9} Q60 ${t + 5} 44 ${t + 9} z" fill="${c}" stroke="#b8860b" stroke-width="1.3" stroke-linejoin="round" />
        <circle cx="60" cy="${t + 3}" r="2.6" fill="#ff6f9c" />`
      break
    case "circlet":
      h = `<path d="M${60 - r + 3} ${t + 16} Q60 ${t + 6} ${60 + r - 3} ${t + 16}" fill="none" stroke="${c}" stroke-width="3.2" stroke-linecap="round" />
        <path d="M60 ${t + 4} l4 6 l-4 6 l-4 -6 z" fill="#8fd3f4" stroke="#b8860b" stroke-width="1.2" />`
      break
    default:
      h = ""
  }
  let mask = ""
  if (outfit.mask) {
    const ey = a.species === "mouse" ? 50 : 52
    mask = `<path fill-rule="evenodd" d="M27 ${ey - 9} Q60 ${ey - 17} 93 ${ey - 9} L93 ${ey + 6} Q60 ${ey + 1} 27 ${ey + 6} z M34 ${ey} a11 12 0 1 0 22 0 a11 12 0 1 0 -22 0 z M64 ${ey} a11 12 0 1 0 22 0 a11 12 0 1 0 -22 0 z" fill="#1b1430" opacity=".9" />`
  }
  let halo = ""
  if (a.tier === "divine") {
    const hy = t - (outfit.hat === "plumedHelm" || outfit.hat === "hornedHelm" ? 30 : 16)
    halo = `<g class="halo"><ellipse cx="60" cy="${hy}" rx="17" ry="4.6" fill="none" stroke="#ffe066" stroke-width="3.2" /><ellipse cx="60" cy="${hy}" rx="17" ry="4.6" fill="none" stroke="#fffbe0" stroke-width="1.2" />
      ${star(16, t + 8, 3, "#fff3b0")}${star(104, t + 14, 2.6, "#fff3b0")}${star(100, cy + 34, 2.2, "#fff3b0")}</g>`
  }
  return `<g class="hat">${mask}${h}${halo}</g>`
}

/** Какой высоты убор: корону вожака поднимаем над высокими уборами. */
export function hatLift(classId: string | undefined): number {
  if (!classId) return 0
  switch (outfitOf(classId).hat) {
    case "none":
    case "headband":
    case "circlet":
    case "tiara":
      return 0
    case "wizardHat":
    case "mitre":
    case "plumedHelm":
    case "hornedHelm":
      return -24
    default:
      return -12
  }
}
