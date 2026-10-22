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
    | "furCap"
    | "hood"
    | "ghillie"
    | "skullMask"
    | "helmet"
    | "kettle"
    | "shako"
    | "leafHelm"
    | "plumedHelm"
    | "greatHelm"
    | "hornedHelm"
    | "dragonHelm"
    | "kabuto"
    | "wingedHelm"
    | "topknot"
    | "turban"
    | "wizardHat"
    | "mitre"
    | "skullcap"
    | "antlers"
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
    | "castle"

/** Что видно из-за спины: торчит над левым плечом или по бокам. */
export type BackKind = "quiver" | "longbow" | "bindle" | "sack" | "banner" | "shawl"
/** Предмет в левой лапе (в правой — оружие). */
export type HandKind = "dagger" | "lute" | "kiteShield" | "towerShield" | "roundShield" | "heaterShield" | "staff" | "crozier" | "book" | "orb" | "fan"
/** Что на шее под подбородком. */
export type NeckKind = "ruff" | "fur" | "beads" | "fangs" | "scarf" | "pendant" | "kerchief"
/** Что на морде: не закрывает глаза и рот. */
export type FaceKind = "goggles" | "scope" | "beard"
/** Что на передних лапах (кулаки по бокам тела). */
export type PawKind = "gloves" | "wraps" | "gauntlets"
export type ShoulderKind = "spikes" | "single"
/** Броня верхового коня: налобник и шейные пластины или чешуйчатая попона. */
export type BardingKind = "plate" | "mail"

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
  back?: BackKind
  hand?: HandKind
  neck?: NeckKind
  /** Цвет шарфа, меха, платка (иначе по умолчанию для вида шейного убора). */
  neckColor?: string
  face?: FaceKind
  paws?: PawKind
  shoulders?: ShoulderKind
  barding?: BardingKind
  /** Заплатки на одежде. */
  patched?: boolean
}

type OutfitExtra = Partial<Omit<Outfit, "hat" | "hatColor" | "garb" | "color" | "accent" | "emblem">>

const o = (
  hat: HatKind,
  hatColor: string,
  garb: GarbKind,
  color: string,
  accent: string,
  emblem: EmblemKind,
  extra: OutfitExtra = {}
): Outfit => ({ hat, hatColor, garb, color, accent, emblem, ...extra })

const GOLD = "#ffd54f"

/**
 * Наряд каждого класса `CHARACTER_CLASSES` (ключ — id класса модели). У каждого класса есть крупный
 * профессиональный признак, читаемый на маленькой миниатюре: убор, предмет за спиной или в левой лапе,
 * шейный убор, перчатки, борода; линии классов делят признак, старший ярус богаче.
 */
export const CLASS_OUTFITS: Record<string, Outfit> = {
  // Beginner — стартовые классы
  "gladiator": o("plumedHelm", "#b8c0cc", "armor", "#b5651d", "#c0392b", "fist", { shoulders: "single" }),
  "hunter": o("furCap", "#8d6e63", "tunic", "#6b8e4e", "#c0392b", "feather", { back: "quiver" }),
  "soldier": o("kettle", "#8a96a8", "tunic", "#3d6fb6", "#f1f1f1", "star", { hand: "roundShield" }),
  "mage": o("turban", "#5a189a", "robe", "#6a2c91", "#f4d35e", "eye", { hand: "orb" }),
  "healer": o("headband", "#ffffff", "apron", "#f1f1f1", "#e63946", "cross", { neck: "scarf", neckColor: "#e63946" }),
  // Specialty
  "myrmidon": o("topknot", "#d62828", "gi", "#d62828", "#ffffff", "sword"),
  "brigand": o("bandana", "#7f4f24", "vest", "#5c3d2e", "#e0a458", "skull", { back: "sack", neck: "kerchief", neckColor: "#c0392b" }),
  "pugilist": o("headband", "#e85d04", "vest", "#e85d04", "#2b2d42", "fist", { paws: "gloves" }),
  "archer": o("featherCap", "#2d6a4f", "tunic", "#40916c", "#e9c46a", "feather", { back: "quiver" }),
  "rogue": o("bandana", "#5a189a", "vest", "#3c096c", "#c77dff", "none", { mask: true, hand: "dagger" }),
  "armored-knight": o("greatHelm", "#8a93a6", "plate", "#8a93a6", "#3d6fb6", "shield", { hand: "heaterShield" }),
  "light-cavalry": o("shako", "#1d3557", "tunic", "#e76f51", "#f4a261", "star", { neck: "scarf", neckColor: "#ffd60a" }),
  "wing-soldier": o("wingedHelm", "#e0e7ff", "armor", "#8ecae6", "#ffffff", "feather"),
  "priest": o("skullcap", "#f8f9fa", "robe", "#f8f9fa", "#4f8fd1", "none", { neck: "pendant", hand: "book" }),
  "shaman": o("skullMask", "#3c1642", "robe", "#3c1642", "#b388eb", "flame", { neck: "fangs" }),
  // Advanced
  "shido": o("kabuto", "#2b2b30", "gi", "#9d0208", "#ffd60a", "sun", { back: "banner" }),
  "dancer": o("veil", "#ff8fab", "dress", "#ff4d8d", "#ffd60a", "star", { hand: "fan" }),
  "warrior": o("hornedHelm", "#8d99ae", "vest", "#7f5539", "#e9c46a", "flame", { neck: "fur" }),
  "blacksmith": o("bandana", "#6c584c", "apron", "#8d6e63", "#f77f00", "hammer", { face: "goggles" }),
  "sniper": o("ghillie", "#344e41", "tunic", "#3a5a40", "#a3b18a", "eye", { face: "scope", back: "quiver" }),
  "forest-knight": o("leafHelm", "#6a8f5c", "tunic", "#344e41", "#95d5b2", "leaf", { back: "quiver" }),
  "ranger": o("hood", "#7f5539", "tunic", "#b08968", "#ddb892", "leaf", { cape: "#6f4e37", back: "longbow" }),
  "guardian": o("helmet", "#4361ee", "armor", "#4361ee", "#f1faee", "shield", { hand: "kiteShield" }),
  "dreadnought": o("greatHelm", "#495057", "plate", "#343a40", "#e63946", "skull", { shoulders: "spikes" }),
  "bardinger": o("plumedHelm", "#c9ced6", "armor", "#264653", "#e9c46a", "sun", { barding: "plate" }),
  "cataphract": o("greatHelm", "#6c757d", "plate", "#6c757d", "#9d0208", "shield", { mountColor: "#4a4e69", barding: "mail" }),
  "dragoon": o("dragonHelm", "#2d6a4f", "armor", "#2d6a4f", "#95d5b2", "flame"),
  "ovate": o("wizardHat", "#5a189a", "robe", "#7b2cbf", "#ffd60a", "moon", { hand: "staff" }),
  "bishop": o("mitre", "#ffffff", "robe", "#f8f9fa", GOLD, "cross", { cape: "#4f8fd1", hand: "crozier" }),
  "troubadour": o("beret", "#e5989b", "robe", "#ffb4a2", "#6d6875", "none", { mountColor: "#f1e3d3", hand: "lute" }),
  // Master
  "swordmaster": o("topknot", "#9d0208", "gi", "#370617", "#ffba08", "sword", { cape: "#6a040f", neck: "scarf", neckColor: "#9d0208" }),
  "high-savant": o("wizardHat", "#003049", "robe", "#003049", "#fcbf49", "star", { hand: "book" }),
  "battlemaster": o("hornedHelm", "#6c584c", "armor", "#7f5539", "#ffb703", "flame", { cape: "#9c6644", neck: "fur" }),
  "war-monk": o("skullcap", "#ffbf69", "gi", "#ffbf69", "#8d0801", "sun", { neck: "beads", paws: "wraps" }),
  "bow-adept": o("featherCap", "#1b4332", "tunic", "#2d6a4f", "#ffd60a", "feather", { cape: "#081c15", back: "quiver" }),
  "bow-knight": o("plumedHelm", "#40916c", "armor", "#2d6a4f", "#ffd60a", "feather", { back: "quiver" }),
  "shadow-seeker": o("hood", "#10002b", "vest", "#240046", "#9d4edd", "eye", { mask: true, cape: "#10002b", hand: "dagger" }),
  "sentinel": o("plumedHelm", "#1d3557", "armor", "#1d3557", "#f1faee", "shield", { cape: "#457b9d", hand: "towerShield" }),
  "castle-knight": o("greatHelm", "#adb5bd", "plate", "#adb5bd", "#1d3557", "castle", { cape: "#1d3557", hand: "towerShield" }),
  "orichaldia": o("plumedHelm", "#d4a373", "armor", "#d4a373", "#fefae0", "sun", { barding: "plate", hand: "heaterShield" }),
  "great-knight": o("greatHelm", "#495057", "plate", "#6c757d", "#ffb703", "shield", { cape: "#9d0208", mountColor: "#3d405b", barding: "mail" }),
  "celestial-trooper": o("wingedHelm", "#ffffff", "armor", "#caf0f8", GOLD, "star", { cape: "#90e0ef", hand: "kiteShield" }),
  "bau-lord": o("dragonHelm", "#370617", "armor", "#6a040f", "#ffba08", "flame", { cape: "#370617", mountColor: "#9d0208", shoulders: "spikes" }),
  "druid": o("antlers", "#386641", "robe", "#6a994e", "#f2e8cf", "leaf", { hand: "staff" }),
  "wiseman": o("hood", "#e9ecef", "robe", "#f8f9fa", GOLD, "sun", { cape: GOLD, face: "beard" }),
  "valkyrium": o("wingedHelm", "#f8f9fa", "robe", "#ffd6ff", GOLD, "moon", { mountColor: "#fdfdfd", hand: "orb" }),
  // Divine
  "the-blade": o("topknot", GOLD, "gi", "#ae2012", GOLD, "sword", { cape: GOLD, neck: "scarf", neckColor: GOLD, back: "banner" }),
  "the-apsara": o("tiara", GOLD, "dress", "#f4a261", GOLD, "star", { back: "shawl", hand: "fan" }),
  "the-eternal": o("hornedHelm", GOLD, "armor", "#9b2226", GOLD, "flame", { cape: "#9b2226", neck: "fur", neckColor: "#f1e3c6", shoulders: "spikes" }),
  "the-godhand": o("circlet", GOLD, "gi", "#ffffff", GOLD, "fist", { paws: "gauntlets", neck: "beads" }),
  "the-calamity": o("hood", "#3c096c", "vest", "#10002b", "#ff006e", "skull", { mask: true, cape: "#ff006e", shoulders: "spikes" }),
  "the-trident": o("plumedHelm", GOLD, "armor", "#0077b6", GOLD, "wave", { cape: "#023e8a", hand: "roundShield" }),
  "the-cavalier": o("plumedHelm", GOLD, "plate", "#e9ecef", GOLD, "sun", { cape: "#9d0208", mountColor: "#f1f1f1", barding: "plate" }),
  "the-avatar": o("circlet", GOLD, "robe", "#ffffff", GOLD, "star", { cape: "#c77dff", hand: "staff" })
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
  /** Окрас зверька: лапы, держащие предмет, и пучок волос. */
  fur?: { fur: string, dark: string, line: string }
  /** Оружие в правой лапе (art/held.ts): правый кулак рисует оружие, одинаковый предмет в левой лапе не дублируется. */
  weapon?: string
}

/** Высота глаз (как в critter.ts). */
function eyeY(s: ArtSpecies): number {
  return s === "mouse" ? 50 : 52
}

/** Низ мордочки: ниже этой линии можно рисовать шейный убор и бороду. */
function muzzleBottom(s: ArtSpecies): number {
  return s === "dog" ? 77 : s === "mouse" ? 75 : 71
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
    case "castle":
      return `<path d="M${x - 6} ${y + 6} V${y - 3} h2.2 v-3 h2.4 v3 h2.8 v-3 h2.4 v3 h2.2 V${y + 6} z" fill="${c}" stroke="${d}" stroke-width=".8" /><path d="M${x - 1.8} ${y + 6} v-3 a1.8 1.8 0 0 1 3.6 0 v3 z" fill="${d}" />`
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

/** Чешуйчатая попона: закрывает корпус коня до колен (катафракты). */
function mailBarding(trim: string): string {
  const steel = "#aeb6c2"
  const line = "#5f6773"
  let scales = ""
  for (let row = 0; row < 3; row++) {
    const y = 88 + row * 6
    for (let x = 30 + (row % 2) * 4; x <= 96; x += 8) scales += `M${x - 4} ${y} q4 5 8 0 `
  }
  return `<g class="barding"><path d="M24 90 Q24 78 46 79 Q62 74 80 79 Q102 78 102 92 L102 104 Q62 110 24 104 z" fill="${steel}" stroke="${line}" stroke-width="1.4" stroke-linejoin="round" />
    <path d="${scales}" fill="none" stroke="${line}" stroke-width="1" opacity=".75" />
    <path d="M24 104 Q34 110 44 105 Q53 111 63 106 Q73 111 82 105 Q92 110 102 104" fill="none" stroke="${trim}" stroke-width="3" stroke-linecap="round" /></g>`
}

/** Латы коня: налобник с шипом и пластины по шее (бардинги). */
function plateBarding(trim: string): string {
  const steel = "#c9ced6"
  const line = "#5f6773"
  return `<g class="barding"><path d="M28 60 L22 86 L34 88 L42 64 z" fill="${steel}" stroke="${line}" stroke-width="1.3" stroke-linejoin="round" />
    <path d="M24 72 l13 3 M23 79 l13 3" stroke="${line}" stroke-width="1.1" />
    <path d="M2 58 Q6 48 20 50 Q28 54 26 62 Q14 66 4 64 z" fill="${steel}" stroke="${line}" stroke-width="1.3" stroke-linejoin="round" />
    <path d="M14 51 l2 -10 l4 10 z" fill="${trim}" stroke="${line}" stroke-width="1" />
    <path d="M34 86 Q30 98 40 100 L46 88 z" fill="${steel}" stroke="${line}" stroke-width="1.2" stroke-linejoin="round" />
    <circle cx="10" cy="59" r="3" fill="${line}" /><circle cx="10" cy="59" r="1.8" fill="${INK}" /></g>`
}

function horseBody(c: string, cloth: string, dragon: boolean, barding?: BardingKind, trim = GOLD): string {
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
    ${barding === "mail" ? mailBarding(trim) : ""}${spines}${neck}${head}${barding === "plate" ? plateBarding(trim) : ""}
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
  return `<g class="mount">${wings}${horseBody(c, cloth, a.mount === "dragon", outfit?.barding, outfit?.accent)}</g>`
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

/* ---------- За спиной ---------- */

const WOOD = "#8d6248"
const WOOD_DARK = "#5a3a1e"

/** Оперение стрелы, торчащей из колчана: остриё пера в (x, y). */
function fletching(x: number, y: number, c: string): string {
  const d = shade(c, -0.35)
  return `<path d="M${x} ${y} l-4 -9 l4 3 l4 -3 z" fill="${c}" stroke="${d}" stroke-width=".9" stroke-linejoin="round" />`
}

/** Предмет за спиной: рисуется до хвоста и тела, видны концы над плечом и по бокам. */
export function outfitBack(a: OutfitArt): string {
  if (!a.classId) return ""
  const outfit = outfitOf(a.classId)
  const { cy } = bodyGeom(a.species)
  switch (outfit.back) {
    case "quiver": {
      // колчан наискосок: низ за поясом, горловина со стрелами над левым плечом
      const fl = outfit.accent
      const rich = a.tier === "master" || a.tier === "divine"
      const band = rich ? GOLD : "#d9b38c"
      return `<g class="back quiver" transform="rotate(-32 40 ${cy + 6})">
        <path d="M34 ${cy - 52} V${cy - 44} M40 ${cy - 55} V${cy - 44} M46 ${cy - 52} V${cy - 44}" stroke="#6b4a2c" stroke-width="1.6" />
        ${fletching(34, cy - 50, fl)}${fletching(40, cy - 53, fl)}${fletching(46, cy - 50, fl)}
        <rect x="31" y="${cy - 46}" width="18" height="56" rx="5" fill="#8d5a3b" stroke="${WOOD_DARK}" stroke-width="1.5" />
        <rect x="30" y="${cy - 47}" width="20" height="7" rx="2.5" fill="${band}" stroke="${WOOD_DARK}" stroke-width="1.2" />
        <path d="M33 ${cy - 30} h14 M33 ${cy - 12} h14" stroke="${band}" stroke-width="2" /></g>`
    }
    case "longbow":
      return `<g class="back longbow"><path d="M34 ${cy - 92} Q-4 ${cy - 40} 34 ${cy + 16}" fill="none" stroke="${WOOD_DARK}" stroke-width="6" stroke-linecap="round" />
        <path d="M34 ${cy - 92} Q-4 ${cy - 40} 34 ${cy + 16}" fill="none" stroke="#b07d4f" stroke-width="3.4" stroke-linecap="round" />
        <path d="M33 ${cy - 90} L33 ${cy + 14}" stroke="#f1e3c6" stroke-width="1.1" />
        <path d="M13 ${cy - 46} v12" stroke="${outfit.accent}" stroke-width="5" stroke-linecap="round" /></g>`
    case "bindle": {
      // узелок на палке через плечо: палка торчит над плечом, узел висит под её концом
      const y = cy - 76
      return `<g class="back bindle">
        <path d="M2 ${y + 4} Q-3 ${y + 24} 12 ${y + 26} Q28 ${y + 26} 24 ${y + 6} Q20 ${y - 4} 12 ${y} Q6 ${y - 4} 2 ${y + 4} z" fill="#d62828" stroke="#8d1c1c" stroke-width="1.4" stroke-linejoin="round" />
        <g fill="#ffffff"><circle cx="8" cy="${y + 10}" r="1.8" /><circle cx="17" cy="${y + 15}" r="1.8" /><circle cx="19" cy="${y + 6}" r="1.8" /><circle cx="9" cy="${y + 20}" r="1.8" /></g>
        <path d="M58 ${cy + 8} L2 ${y - 14}" stroke="${WOOD_DARK}" stroke-width="5.4" stroke-linecap="round" /><path d="M58 ${cy + 8} L2 ${y - 14}" stroke="${WOOD}" stroke-width="3.2" stroke-linecap="round" />
        <path d="M8 ${y - 2} l3 -6 l5 4 z" fill="#d62828" stroke="#8d1c1c" stroke-width="1.2" stroke-linejoin="round" /></g>`
    }
    case "sack":
      return `<g class="back sack"><path d="M44 ${cy - 4} Q30 ${cy - 30} 26 ${cy - 52}" fill="none" stroke="#7f5539" stroke-width="3" />
        <path d="M24 ${cy - 54} Q2 ${cy - 54} 2 ${cy - 30} Q2 ${cy - 10} 20 ${cy - 10} Q38 ${cy - 10} 36 ${cy - 32} Q34 ${cy - 46} 28 ${cy - 52} z" fill="#c8a36a" stroke="#7f5539" stroke-width="1.5" stroke-linejoin="round" />
        <path d="M20 ${cy - 58} l6 3 l2 -6 z" fill="#c8a36a" stroke="#7f5539" stroke-width="1.2" stroke-linejoin="round" /><path d="M21 ${cy - 52} l8 -2" stroke="#7f5539" stroke-width="2.4" stroke-linecap="round" />
        <path d="M10 ${cy - 30} h9 v9 h-9 z" fill="#a47148" stroke="#7f5539" stroke-width="1" stroke-dasharray="2 1.5" />
        <text x="22" y="${cy - 24}" font-size="10" font-weight="bold" fill="#7f5539" font-family="sans-serif">$</text></g>`
    case "banner": {
      // сасимоно: флажок на древке за спиной, над головой справа
      const top = -24
      return `<g class="back banner"><path d="M88 ${cy - 6} V${top}" stroke="#2b2b30" stroke-width="3" />
        <path d="M89 ${top + 1} h19 v32 h-19 z" fill="${outfit.color}" stroke="${shade(outfit.color, -0.4)}" stroke-width="1.3" />
        <path d="M89 ${top + 1} h19" stroke="${outfit.accent}" stroke-width="3" />
        ${emblem(outfit.emblem, 98.5, top + 18, outfit.accent)}</g>`
    }
    case "shawl": {
      // парящий шарф апсары: петли по обе стороны от плеч
      const c = outfit.color
      const rib = `<path d="M40 ${cy - 6} C12 ${cy - 4} 2 ${cy - 30} 12 ${cy - 52} C18 ${cy - 64} 30 ${cy - 58} 24 ${cy - 48}" fill="none" stroke="${shade(c, -0.3)}" stroke-width="8" stroke-linecap="round" opacity=".55" />
        <path d="M40 ${cy - 6} C12 ${cy - 4} 2 ${cy - 30} 12 ${cy - 52} C18 ${cy - 64} 30 ${cy - 58} 24 ${cy - 48}" fill="none" stroke="${shade(c, 0.25)}" stroke-width="5.5" stroke-linecap="round" />`
      return `<g class="back shawl">${rib}<g transform="translate(120 0) scale(-1 1)">${rib}</g></g>`
    }
    default:
      return ""
  }
}

/* ---------- В левой лапе, на лапах, на плечах ---------- */

/** Лапа, держащая предмет. */
function paw(a: OutfitArt, x: number, y: number, r = 5.5): string {
  const fur = a.fur?.fur ?? "#f4a261"
  const line = a.fur?.line ?? "#8d5a3b"
  return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r}" fill="${fur}" stroke="${line}" stroke-width="1.4" />`
}

function shieldFace(outfit: Outfit, rich: boolean): { face: string, rim: string, mark: string } {
  return { face: outfit.color, rim: rich ? GOLD : "#d4dae2", mark: outfit.accent }
}

/** Посох в левой лапе при посохе-оружии в правой (и книга при гримуаре) — лишний: остаётся оружие. */
function duplicatesWeapon(hand: HandKind, weapon: string | undefined): boolean {
  return ((hand === "staff" || hand === "crozier") && weapon === "whiteMagic") || (hand === "book" && weapon === "blackMagic")
}

/** Левая лапа свободна (нет щита, посоха, книги…): в ней можно показать второй кастет. */
export function leftPawFree(a: OutfitArt): boolean {
  if (!a.classId) return true
  const hand = outfitOf(a.classId).hand
  return !hand || duplicatesWeapon(hand, a.weapon)
}

/** Лапа, держащая оружие: в перчатке/бинтах/рукавице наряда или просто лапа окраса. */
export function heldPawSvg(a: OutfitArt, x: number, y: number): string {
  const outfit = a.classId ? outfitOf(a.classId) : undefined
  if (outfit?.paws) return fist(a, outfit, x, y)
  return paw(a, x, y, 6.4)
}

/** Предмет в левой лапе: щит, посох, книга, шар, веер. Рисуется до головы. */
function handItem(a: OutfitArt, outfit: Outfit): string {
  if (!outfit.hand || duplicatesWeapon(outfit.hand, a.weapon)) return ""
  const { cy, rx } = bodyGeom(a.species)
  const rich = a.tier === "master" || a.tier === "divine"
  const hx = 60 - rx - 1
  const hy = cy + 4
  const big = (kind: EmblemKind, x: number, y: number, c: string, k = 1.5): string =>
    `<g transform="translate(${f1(x)} ${f1(y)}) scale(${k}) translate(${f1(-x)} ${f1(-y)})">${emblem(kind, x, y, c)}</g>`
  switch (outfit.hand) {
    case "kiteShield":
    case "heaterShield": {
      const { face, rim, mark } = shieldFace(outfit, rich)
      const x = hx - 6
      const y = hy - 2
      const low = outfit.hand === "kiteShield" ? 22 : 16
      return `<g class="hand shield"><path d="M${f1(x - 14)} ${y - 16} Q${f1(x)} ${y - 20} ${f1(x + 14)} ${y - 16} L${f1(x + 13)} ${y + 2} Q${f1(x + 8)} ${y + low - 6} ${f1(x)} ${y + low} Q${f1(x - 8)} ${y + low - 6} ${f1(x - 13)} ${y + 2} z" fill="${face}" stroke="${rim}" stroke-width="3.4" stroke-linejoin="round" />
        <path d="M${f1(x - 14)} ${y - 16} Q${f1(x)} ${y - 20} ${f1(x + 14)} ${y - 16} L${f1(x + 13)} ${y + 2} Q${f1(x + 8)} ${y + low - 6} ${f1(x)} ${y + low} Q${f1(x - 8)} ${y + low - 6} ${f1(x - 13)} ${y + 2} z" fill="none" stroke="${shade(face, -0.5)}" stroke-width="1" />
        ${big(outfit.emblem, x, y - 2, mark)}</g>`
    }
    case "towerShield": {
      const { face, rim, mark } = shieldFace(outfit, rich)
      const x = hx - 7
      const y = hy - 4
      return `<g class="hand shield"><rect x="${f1(x - 15)}" y="${y - 24}" width="30" height="48" rx="4" fill="${face}" stroke="${rim}" stroke-width="3.6" />
        <rect x="${f1(x - 15)}" y="${y - 24}" width="30" height="48" rx="4" fill="none" stroke="${shade(face, -0.5)}" stroke-width="1" />
        <path d="M${f1(x - 13)} ${y + 12} H${f1(x + 13)}" stroke="${rim}" stroke-width="2.4" />
        <g fill="${shade(rim, -0.35)}"><circle cx="${f1(x - 10)}" cy="${y - 19}" r="1.4" /><circle cx="${f1(x + 10)}" cy="${y - 19}" r="1.4" /><circle cx="${f1(x - 10)}" cy="${y + 19}" r="1.4" /><circle cx="${f1(x + 10)}" cy="${y + 19}" r="1.4" /></g>
        ${big(outfit.emblem, x, y - 4, mark, 1.6)}</g>`
    }
    case "roundShield": {
      const x = hx - 6
      const y = hy - 1
      const wood = rich ? outfit.color : "#a47148"
      const rim = rich ? GOLD : "#8a96a8"
      return `<g class="hand shield"><circle cx="${f1(x)}" cy="${y}" r="16" fill="${wood}" stroke="${rim}" stroke-width="3.4" />
        ${rich ? "" : `<path d="M${f1(x - 8)} ${y - 14} V${y + 14} M${f1(x)} ${y - 16} V${y + 16} M${f1(x + 8)} ${y - 14} V${y + 14}" stroke="${shade(wood, -0.3)}" stroke-width="1" />`}
        <circle cx="${f1(x)}" cy="${y}" r="16" fill="none" stroke="${shade(rim, -0.4)}" stroke-width="1" />
        ${rich ? big(outfit.emblem, x, y, outfit.accent, 1.4) : `<circle cx="${f1(x)}" cy="${y}" r="5" fill="${rim}" stroke="${shade(rim, -0.4)}" stroke-width="1.2" />`}</g>`
    }
    case "staff":
    case "crozier": {
      const x = hx - 6
      const top = -6
      const gold = outfit.hand === "crozier" || rich
      const pole = gold ? "#d4a017" : WOOD
      let head = ""
      if (outfit.hand === "crozier") {
        head = `<path d="M${f1(x)} ${top + 10} V${top - 2} Q${f1(x)} ${top - 14} ${f1(x - 10)} ${top - 14} Q${f1(x - 18)} ${top - 14} ${f1(x - 18)} ${top - 5} Q${f1(x - 18)} ${top + 2} ${f1(x - 11)} ${top + 1} Q${f1(x - 6)} ${top} ${f1(x - 8)} ${top - 5}" fill="none" stroke="${GOLD}" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M${f1(x)} ${top + 10} V${top - 2} Q${f1(x)} ${top - 14} ${f1(x - 10)} ${top - 14} Q${f1(x - 18)} ${top - 14} ${f1(x - 18)} ${top - 5} Q${f1(x - 18)} ${top + 2} ${f1(x - 11)} ${top + 1} Q${f1(x - 6)} ${top} ${f1(x - 8)} ${top - 5}" fill="none" stroke="#fff3b0" stroke-width="1.4" stroke-linecap="round" />`
      }
      else {
        // развилка навершия держит светящийся шар цвета класса
        const orb = outfit.accent
        head = `<path d="M${f1(x)} ${top + 6} q-8 -4 -7 -14 M${f1(x)} ${top + 6} q8 -4 7 -14" fill="none" stroke="${pole}" stroke-width="3" stroke-linecap="round" />
          <circle cx="${f1(x)}" cy="${top - 4}" r="9" fill="${orb}" opacity=".35" />
          <circle cx="${f1(x)}" cy="${top - 4}" r="5.6" fill="${orb}" stroke="${shade(orb, -0.4)}" stroke-width="1.2" /><circle cx="${f1(x - 1.8)}" cy="${top - 6}" r="1.6" fill="#ffffff" opacity=".85" />`
        if (outfit.emblem === "leaf")
          head += `<path d="M${f1(x)} ${top + 14} q-10 -2 -12 6 q8 3 12 -6 z M${f1(x)} ${top + 20} q10 -3 12 4 q-8 4 -12 -4 z" fill="#52b788" stroke="#2d6a4f" stroke-width="1" />`
      }
      return `<g class="hand staff"><path d="M${f1(x)} ${cy + 22} V${top + 6}" stroke="${shade(pole, -0.4)}" stroke-width="5.6" stroke-linecap="round" />
        <path d="M${f1(x)} ${cy + 22} V${top + 6}" stroke="${pole}" stroke-width="3.4" stroke-linecap="round" />${head}${paw(a, x + 1, hy - 4)}</g>`
    }
    case "dagger": {
      // кинжал обратным хватом: клинок вверх вдоль бока
      const x = hx - 4
      const y = hy - 2
      const hilt = outfit.accent
      return `<g class="hand dagger" transform="rotate(-24 ${f1(x)} ${y})">
        <path d="M${f1(x - 4)} ${y - 6} L${f1(x)} ${y - 34} L${f1(x + 4)} ${y - 6} z" fill="#e9ecef" stroke="#495057" stroke-width="1.3" stroke-linejoin="round" />
        <path d="M${f1(x)} ${y - 30} V${y - 8}" stroke="#adb5bd" stroke-width="1.2" />
        <rect x="${f1(x - 8)}" y="${y - 7}" width="16" height="4" rx="2" fill="${hilt}" stroke="${shade(hilt, -0.45)}" stroke-width="1" />
        <rect x="${f1(x - 2.5)}" y="${y - 3}" width="5" height="10" rx="1.5" fill="${shade(hilt, -0.3)}" /><circle cx="${f1(x)}" cy="${y + 8}" r="2.6" fill="${hilt}" /></g>${paw(a, x, y + 1)}`
    }
    case "lute": {
      // лютня наискосок: корпус у левого бока, гриф с колками над плечом
      const x = hx - 4
      const y = hy - 2
      return `<g class="hand lute" transform="rotate(32 ${f1(x)} ${y})">
        <rect x="${f1(x - 3.5)}" y="${y - 50}" width="7" height="40" rx="2" fill="#7f5539" stroke="${WOOD_DARK}" stroke-width="1.2" />
        <path d="M${f1(x - 4)} ${y - 50} l-3 -10 h14 l-3 10 z" fill="${WOOD_DARK}" /><g fill="#f1e3c6"><circle cx="${f1(x - 6)}" cy="${y - 56}" r="1.8" /><circle cx="${f1(x + 6)}" cy="${y - 56}" r="1.8" /></g>
        <ellipse cx="${f1(x)}" cy="${y}" rx="15" ry="18" fill="#d08c3e" stroke="${WOOD_DARK}" stroke-width="1.6" />
        <circle cx="${f1(x)}" cy="${y - 4}" r="4.6" fill="#3e2723" /><path d="M${f1(x - 5)} ${y + 10} h10" stroke="${WOOD_DARK}" stroke-width="2.4" />
        <path d="M${f1(x - 1.2)} ${y - 50} V${y + 10} M${f1(x + 1.2)} ${y - 50} V${y + 10}" stroke="#f1e3c6" stroke-width=".7" /></g>${paw(a, x + 12, y + 2)}`
    }
    case "book": {
      const x = hx - 6
      const y = hy - 4
      const cover = "#8e3b23"
      return `<g class="hand book" transform="rotate(-14 ${f1(x)} ${y})"><rect x="${f1(x - 12)}" y="${y - 16}" width="25" height="32" rx="2.5" fill="#f8f1dc" stroke="#8d6e63" stroke-width="1.2" />
        <rect x="${f1(x - 14)}" y="${y - 17}" width="25" height="32" rx="2.5" fill="${cover}" stroke="${shade(cover, -0.45)}" stroke-width="1.5" />
        <path d="M${f1(x - 11)} ${y - 17} v32" stroke="${shade(cover, -0.35)}" stroke-width="2.2" />
        <path d="M${f1(x - 14)} ${y - 12} h4 M${f1(x - 14)} ${y + 10} h4" stroke="${GOLD}" stroke-width="2" />
        ${big(outfit.emblem === "none" ? "cross" : outfit.emblem, x - 1, y - 1, GOLD, 1.3)}</g>${paw(a, x + 9, y + 11)}`
    }
    case "orb": {
      const x = hx - 7
      const y = hy - 8
      const glow = outfit.accent
      return `<g class="hand orb"><circle cx="${f1(x)}" cy="${y}" r="15" fill="${glow}" opacity=".25" />
        <path d="M${f1(x - 9)} ${y + 16} L${f1(x - 6)} ${y + 8} H${f1(x + 6)} L${f1(x + 9)} ${y + 16} z" fill="${GOLD}" stroke="#b8860b" stroke-width="1.2" stroke-linejoin="round" />
        <circle cx="${f1(x)}" cy="${y}" r="11" fill="#cde8f6" stroke="#5e7fa3" stroke-width="1.5" />
        <path d="M${f1(x - 6)} ${y + 2} q4 -8 10 -4 q4 3 -1 7" fill="none" stroke="#9b5de5" stroke-width="2" stroke-linecap="round" opacity=".75" />
        <ellipse cx="${f1(x - 4)}" cy="${y - 5}" rx="3.2" ry="2.2" fill="#ffffff" opacity=".9" /></g>${paw(a, x + 8, y + 15)}`
    }
    case "fan": {
      const x = hx - 1
      const y = hy - 6
      const c = outfit.accent
      const r = 23
      let ribs = ""
      for (let i = 0; i <= 6; i++) {
        const ang = Math.PI + (i * Math.PI) / 2 / 6 + 0.1
        ribs += `M${f1(x)} ${y} L${f1(x + r * Math.cos(ang))} ${f1(y + r * Math.sin(ang))} `
      }
      const a0 = Math.PI + 0.1
      const a1 = Math.PI * 1.5 + 0.1
      return `<g class="hand fan"><path d="M${f1(x)} ${y} L${f1(x + r * Math.cos(a0))} ${f1(y + r * Math.sin(a0))} A${r} ${r} 0 0 1 ${f1(x + r * Math.cos(a1))} ${f1(y + r * Math.sin(a1))} z" fill="${c}" stroke="${shade(c, -0.4)}" stroke-width="1.3" stroke-linejoin="round" />
        <path d="${ribs}" stroke="${shade(c, -0.3)}" stroke-width=".9" />
        <path d="M${f1(x + (r - 3) * Math.cos(a0))} ${f1(y + (r - 3) * Math.sin(a0))} A${r - 3} ${r - 3} 0 0 1 ${f1(x + (r - 3) * Math.cos(a1))} ${f1(y + (r - 3) * Math.sin(a1))}" fill="none" stroke="${outfit.color}" stroke-width="2.4" /></g>${paw(a, x, y)}`
    }
    default:
      return ""
  }
}

/** Кулак в перчатке наряда: боксёрская перчатка, бинты или золотая латная рукавица. */
function fist(a: OutfitArt, outfit: Outfit, x: number, y: number): string {
  switch (outfit.paws) {
    case "gloves":
      return `<rect x="${f1(x - 7)}" y="${f1(y + 6)}" width="14" height="6" rx="2" fill="#ffffff" stroke="#adb5bd" stroke-width="1" />
          <circle cx="${f1(x)}" cy="${f1(y)}" r="10" fill="#d62828" stroke="#7a1010" stroke-width="1.5" />
          <path d="M${f1(x - 5)} ${f1(y - 1)} q2 6 9 4" fill="none" stroke="#7a1010" stroke-width="1.2" />
          <ellipse cx="${f1(x - 3)}" cy="${f1(y - 5)}" rx="3.4" ry="2.2" fill="#ffffff" opacity=".55" />`
    case "wraps":
      return `${paw(a, x, y, 7.5)}<path d="M${f1(x - 7)} ${f1(y - 3)} l14 2 M${f1(x - 7.5)} ${f1(y + 1)} l15 2 M${f1(x - 6)} ${f1(y + 5)} l12 1.5" stroke="#f8f1dc" stroke-width="2.6" stroke-linecap="round" />`
    default:
      return `<path d="M${f1(x - 6)} ${f1(y + 6)} l-2 6 h16 l-2 -6 z" fill="${GOLD}" stroke="#b8860b" stroke-width="1" />
          <rect x="${f1(x - 9)}" y="${f1(y - 8)}" width="18" height="16" rx="6" fill="${GOLD}" stroke="#b8860b" stroke-width="1.5" />
          <path d="M${f1(x - 6)} ${f1(y - 8)} v6 M${f1(x - 2)} ${f1(y - 8)} v6 M${f1(x + 2)} ${f1(y - 8)} v6 M${f1(x + 6)} ${f1(y - 8)} v6" stroke="#b8860b" stroke-width="1.1" />
          <circle cx="${f1(x)}" cy="${f1(y + 3)}" r="2.2" fill="#ff6f9c" />`
  }
}

/** Кулаки по бокам тела: боксёрские перчатки, бинты, золотые латные рукавицы. Правый — с оружием (art/held.ts). */
function pawGear(a: OutfitArt, outfit: Outfit): string {
  if (!outfit.paws) return ""
  const { cy, rx } = bodyGeom(a.species)
  const y = cy + 3
  return `<g class="paws">${fist(a, outfit, 60 - rx - 1, y)}${a.weapon ? "" : fist(a, outfit, 60 + rx + 1, y)}</g>`
}

/** Шипастые наплечники или один большой наплечник гладиатора. */
function shoulderGear(a: OutfitArt, outfit: Outfit): string {
  if (!outfit.shoulders) return ""
  const { cy, rx, ry } = bodyGeom(a.species)
  const top = cy - ry
  if (outfit.shoulders === "single") {
    const bronze = "#c58b4a"
    const line = "#6d4c2f"
    return `<g class="shoulders"><path d="M${60 - rx + 8} ${top + 4} L${60 + rx - 6} ${cy + 12}" stroke="#6d4c2f" stroke-width="4" />
      <ellipse cx="${60 - rx - 4}" cy="${top + 22}" rx="11" ry="8" fill="${bronze}" stroke="${line}" stroke-width="1.4" />
      <ellipse cx="${60 - rx - 3}" cy="${top + 13}" rx="13" ry="9" fill="${shade(bronze, 0.1)}" stroke="${line}" stroke-width="1.4" />
      <ellipse cx="${60 - rx - 1}" cy="${top + 4}" rx="15" ry="10" fill="${shade(bronze, 0.22)}" stroke="${line}" stroke-width="1.5" />
      <path d="M${60 - rx - 12} ${top + 2} q8 -6 20 -4" fill="none" stroke="#ffffff" stroke-width="1.8" opacity=".6" /></g>`
  }
  const steel = shade(outfit.color, 0.15)
  const line = shade(outfit.color, -0.5)
  const y = cy - 8
  const spikes = (x: number, dir: number): string => {
    let p = ""
    for (const ang of [165, 202, 239]) {
      const t = ((dir > 0 ? ang : 180 - ang) * Math.PI) / 180
      const tx = x + 25 * Math.cos(t)
      const ty = y + 25 * Math.sin(t)
      const nx = -Math.sin(t) * 4.6
      const ny = Math.cos(t) * 4.6
      const bx = x + 9 * Math.cos(t)
      const by = y + 9 * Math.sin(t)
      p += `<path d="M${f1(bx + nx)} ${f1(by + ny)} L${f1(tx)} ${f1(ty)} L${f1(bx - nx)} ${f1(by - ny)} z" fill="#e9ecef" stroke="${line}" stroke-width="1.3" stroke-linejoin="round" />`
    }
    return `${p}<ellipse cx="${x}" cy="${y}" rx="12" ry="10" fill="${steel}" stroke="${line}" stroke-width="1.6" /><ellipse cx="${x}" cy="${y - 3}" rx="6" ry="3" fill="#ffffff" opacity=".35" />`
  }
  return `<g class="shoulders">${spikes(60 - rx - 1, 1)}${spikes(60 + rx + 1, -1)}</g>`
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
      if (outfit.patched) {
        g += `<g stroke="${shade(c, -0.45)}" stroke-width="1" stroke-dasharray="2 1.4"><rect x="${60 - rx + 9}" y="${cy - 8}" width="9" height="9" fill="#d4a373" transform="rotate(-10 ${60 - rx + 13} ${cy - 4})" /><rect x="${60 + rx - 17}" y="${cy - 2}" width="8" height="8" fill="#7f9c6b" transform="rotate(8 ${60 + rx - 13} ${cy + 2})" /></g>`
      }
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
      // кожаный фартук кузнеца: широкий, ниже тела, с карманом и молотом
      g = base + `<path d="M46 ${cy - 8} h28 l${a.mount ? 2 : 5} ${a.mount ? ry + 6 : ry + 14} q-19 5 -${a.mount ? 32 : 38} 0 z" fill="#6d4c41" stroke="#3e2723" stroke-width="1.4" stroke-linejoin="round" />`
        + `<path d="M47 ${cy - 8} L42 ${top + 2} M73 ${cy - 8} L78 ${top + 2}" stroke="#3e2723" stroke-width="2.4" />`
        + `<path d="M${60 - rx + 2} ${cy + 2} H${60 + rx - 2}" stroke="#3e2723" stroke-width="2" />`
        + `<path d="M48 ${cy + 8} h10 v7 h-10 z" fill="none" stroke="#a1887f" stroke-width="1.1" stroke-dasharray="2 1.4" />`
      emblemAt = { x: 64, y: cy - 2 }
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
  return `<g class="outfit">${g}${em}${tierTrim(a, cy, rx, ry)}${shoulderGear(a, outfit)}${pawGear(a, outfit)}${handItem(a, outfit)}</g>`
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

const HOODED = new Set<HatKind>(["hood", "ghillie", "skullMask"])

/** Часть убора за головой (до ушей и головы): капюшон. */
export function outfitHeadBack(a: OutfitArt): string {
  if (!a.classId) return ""
  const outfit = outfitOf(a.classId)
  if (!HOODED.has(outfit.hat)) return ""
  const { cy, r } = headGeom(a.species)
  return `<circle class="hood-back" cx="60" cy="${cy + 2}" r="${r + 7}" fill="${shade(outfit.hatColor, -0.15)}" stroke="${shade(outfit.hatColor, -0.45)}" stroke-width="1.5" />`
}

function hoodFront(cy: number, t: number, r: number, c: string): string {
  const dark = shade(c, -0.4)
  return `<path d="M${60 - r - 6} ${cy + 4} Q${60 - r - 6} ${t - 8} 60 ${t - 8} Q${60 + r + 6} ${t - 8} ${60 + r + 6} ${cy + 4} Q${60 + r - 3} ${t + 7} 60 ${t + 9} Q${60 - r + 3} ${t + 7} ${60 - r - 6} ${cy + 4} z" fill="${c}" stroke="${dark}" stroke-width="1.5" stroke-linejoin="round" />
    <path d="M${60 - r + 2} ${t + 12} Q60 ${t + 3} ${60 + r - 2} ${t + 12}" fill="none" stroke="${shade(c, 0.25)}" stroke-width="1.6" opacity=".7" />`
}

function leaf(x: number, y: number, ang: number, len: number, c: string): string {
  return `<path d="M0 0 Q${f1(len * 0.5)} ${f1(-len * 0.38)} ${len} 0 Q${f1(len * 0.5)} ${f1(len * 0.38)} 0 0 z" transform="translate(${f1(x)} ${f1(y)}) rotate(${ang})" fill="${c}" stroke="${shade(c, -0.4)}" stroke-width="1" />`
}

/** Шейный убор под подбородком: поверх ошейника-аксессуара. */
function neckGear(a: OutfitArt, outfit: Outfit): string {
  if (!outfit.neck) return ""
  const y = muzzleBottom(a.species) + (a.species === "cat" ? 8 : 3)
  // дуга от плеча к плечу через грудь
  const arc = (t: number, sag: number): { x: number, y: number } => {
    const u = 1 - t
    return { x: u * u * 38 + 2 * u * t * 60 + t * t * 82, y: u * u * (y - 3) + 2 * u * t * (y + sag) + t * t * (y - 3) }
  }
  switch (outfit.neck) {
    case "ruff": {
      let pleats = ""
      for (let i = -5; i <= 5; i++) pleats += `M${f1(60 + i * 4.2)} ${y - 3} L${f1(60 + i * 4.9)} ${y + 7} `
      return `<g class="neck ruff"><ellipse cx="60" cy="${y + 2}" rx="27" ry="8" fill="#ffffff" stroke="#adb5bd" stroke-width="1.4" />
        <path d="${pleats}" stroke="#ced4da" stroke-width="1.2" />
        <circle cx="60" cy="${y + 14}" r="5" fill="${GOLD}" stroke="#b8860b" stroke-width="1.3" /><circle cx="60" cy="${y + 14}" r="2" fill="#c0392b" /></g>`
    }
    case "fur": {
      const c = outfit.neckColor ?? "#a1887f"
      let tufts = ""
      for (let i = 0; i < 9; i++) {
        const x = 31 + i * 7.25
        const yy = y + 1 + Math.sin((i / 8) * Math.PI) * 4
        tufts += `<circle cx="${f1(x)}" cy="${f1(yy)}" r="7" />`
      }
      return `<g class="neck fur"><g fill="${c}" stroke="${shade(c, -0.4)}" stroke-width="1.3">${tufts}</g>
        <g fill="${shade(c, 0.3)}">${[0, 2, 4, 6, 8].map(i => `<circle cx="${f1(31 + i * 7.25 - 1.5)}" cy="${f1(y - 1 + Math.sin((i / 8) * Math.PI) * 4)}" r="2.6" />`).join("")}</g></g>`
    }
    case "beads": {
      let beads = ""
      for (let i = 0; i <= 10; i++) {
        const p = arc(i / 10, 22)
        beads += `<circle cx="${f1(p.x)}" cy="${f1(p.y)}" r="3.6" />`
      }
      const bottom = arc(0.5, 22)
      const big = outfit.accent
      return `<g class="neck beads"><g fill="#6d3b1f" stroke="#3e2112" stroke-width="1">${beads}</g>
        <circle cx="60" cy="${f1(bottom.y + 6)}" r="5" fill="${big}" stroke="${shade(big, -0.4)}" stroke-width="1.2" />
        <path d="M58 ${f1(bottom.y + 10)} l-2 7 h8 l-2 -7 z" fill="${big}" /></g>`
    }
    case "fangs": {
      const cord = arc(0, 18)
      let fangs = ""
      for (const t of [0.18, 0.34, 0.66, 0.82]) {
        const p = arc(t, 18)
        fangs += `<path d="M${f1(p.x - 2.6)} ${f1(p.y)} L${f1(p.x)} ${f1(p.y + 9)} L${f1(p.x + 2.6)} ${f1(p.y)} z" />`
      }
      const mid = arc(0.5, 18)
      return `<g class="neck fangs"><path d="M${f1(cord.x)} ${f1(cord.y)} Q60 ${y + 18} 82 ${y - 3}" fill="none" stroke="#3e2112" stroke-width="1.6" />
        <g fill="#f8f1dc" stroke="#7f5539" stroke-width="1">${fangs}</g>
        <path d="M${f1(mid.x)} ${f1(mid.y - 3)} l6 10 h-12 z" fill="#f1e3c6" stroke="#7f5539" stroke-width="1" /><circle cx="60" cy="${f1(mid.y)}" r="3" fill="${outfit.accent}" /></g>`
    }
    case "scarf": {
      const c = outfit.neckColor ?? outfit.accent
      const d = shade(c, -0.35)
      return `<g class="neck scarf"><path d="M42 ${y + 2} Q22 ${y + 4} 10 ${y + 18} Q22 ${y + 14} 30 ${y + 16} Q18 ${y + 22} 14 ${y + 32} Q32 ${y + 20} 46 ${y + 8} z" fill="${c}" stroke="${d}" stroke-width="1.3" stroke-linejoin="round" />
        <path d="M34 ${y - 4} Q60 ${y + 8} 86 ${y - 4} L85 ${y + 5} Q60 ${y + 17} 35 ${y + 5} z" fill="${c}" stroke="${d}" stroke-width="1.4" stroke-linejoin="round" />
        <path d="M40 ${y + 1} Q60 ${y + 11} 80 ${y + 1}" fill="none" stroke="${shade(c, 0.3)}" stroke-width="1.4" /></g>`
    }
    case "pendant": {
      const p = arc(0.5, 14)
      return `<g class="neck pendant"><path d="M40 ${y - 3} Q60 ${y + 14} 80 ${y - 3}" fill="none" stroke="${GOLD}" stroke-width="1.8" />
        <path d="M60 ${f1(p.y)} v16 M53 ${f1(p.y + 5)} h14" stroke="#b8860b" stroke-width="5.4" stroke-linecap="round" />
        <path d="M60 ${f1(p.y)} v16 M53 ${f1(p.y + 5)} h14" stroke="${GOLD}" stroke-width="3.4" stroke-linecap="round" /></g>`
    }
    case "kerchief": {
      const c = outfit.neckColor ?? outfit.accent
      return `<g class="neck kerchief"><path d="M36 ${y - 4} Q60 ${y + 4} 84 ${y - 4} L62 ${y + 20} Q60 ${y + 22} 58 ${y + 20} z" fill="${c}" stroke="${shade(c, -0.4)}" stroke-width="1.4" stroke-linejoin="round" />
        <g fill="#ffffff" opacity=".8"><circle cx="50" cy="${y + 2}" r="1.5" /><circle cx="60" cy="${y + 9}" r="1.5" /><circle cx="70" cy="${y + 2}" r="1.5" /></g>
        <path d="M80 ${y - 3} l8 6 l-2 -9 z" fill="${c}" stroke="${shade(c, -0.4)}" stroke-width="1" /></g>`
    }
    default:
      return ""
  }
}

/** Признак на морде: очки-гогглы на лбу, прицел-монокль, борода. Глаза и рот открыты. */
function faceGear(a: OutfitArt, outfit: Outfit): string {
  const ey = eyeY(a.species)
  switch (outfit.face) {
    case "goggles": {
      const y = ey - 19
      const lens = (x: number): string => `<circle cx="${x}" cy="${y}" r="7.6" fill="#b5651d" stroke="#5a3a1e" stroke-width="1.4" /><circle cx="${x}" cy="${y}" r="5" fill="#8fd3f4" stroke="#3e2723" stroke-width="1" /><circle cx="${x - 1.8}" cy="${y - 1.8}" r="1.6" fill="#ffffff" />`
      return `<g class="face goggles"><path d="M27 ${y + 3} Q60 ${y - 3} 93 ${y + 3}" fill="none" stroke="#3e2723" stroke-width="3.4" />${lens(50)}${lens(70)}<path d="M57 ${y} h6" stroke="#5a3a1e" stroke-width="2.4" /></g>`
    }
    case "scope":
      return `<g class="face scope"><circle cx="75" cy="${ey}" r="13.5" fill="none" stroke="#1b1f1d" stroke-width="3.2" />
        <circle cx="75" cy="${ey}" r="13.5" fill="none" stroke="#a3b18a" stroke-width="1" />
        <path d="M86 ${ey - 8} l9 -7" stroke="#1b1f1d" stroke-width="5" stroke-linecap="round" /><path d="M87 ${ey - 8.6} l8 -6" stroke="#6c757d" stroke-width="1.4" stroke-linecap="round" />
        <path d="M62 ${ey - 4} q-14 -8 -32 -6" fill="none" stroke="#1b1f1d" stroke-width="1.6" /></g>`
    case "beard": {
      const y = muzzleBottom(a.species) - 1
      return `<g class="face beard"><path d="M38 ${y - 3} Q36 ${y + 16} 46 ${y + 26} Q52 ${y + 32} 60 ${y + 40} Q68 ${y + 32} 74 ${y + 26} Q84 ${y + 16} 82 ${y - 3} Q72 ${y + 4} 60 ${y + 2} Q48 ${y + 4} 38 ${y - 3} z" fill="#f1f3f5" stroke="#adb5bd" stroke-width="1.4" stroke-linejoin="round" />
        <path d="M48 ${y + 10} q2 10 6 16 M60 ${y + 12} v20 M72 ${y + 10} q-2 10 -6 16" fill="none" stroke="#ced4da" stroke-width="1.4" stroke-linecap="round" /></g>`
    }
    default:
      return ""
  }
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
      h = hoodFront(cy, t, r, c)
      break
    case "ghillie": {
      // маскхалат снайпера: капюшон в пучках листьев и травы
      const greens = ["#588157", "#a3b18a", "#3a5a40", "#6b8e23"]
      let tufts = ""
      const n = 11
      for (let i = 0; i < n; i++) {
        const ang = 180 + (i * 180) / (n - 1)
        const rad = (ang * Math.PI) / 180
        const x = 60 + (r + 6) * Math.cos(rad)
        const y = cy + 2 + (r + 6) * Math.sin(rad) * 1.02
        tufts += leaf(x, y, ang - 10 + (i % 2) * 20, 13, greens[i % greens.length]!)
      }
      h = hoodFront(cy, t, r, c) + tufts
        + leaf(60 - r - 6, cy + 2, 160, 12, greens[1]!) + leaf(60 + r + 6, cy + 2, 20, 12, greens[2]!)
      break
    }
    case "skullMask": {
      // черепной убор шамана: звериный череп поверх капюшона, рога завитками
      const bone = "#f1e3c6"
      const boneLine = "#8d7356"
      h = hoodFront(cy, t, r, c)
        + `<path d="M44 ${t + 2} q-14 -2 -16 -14 q-1 -9 7 -10 q6 0 5 6 q-6 -2 -6 3 q1 7 12 7 z M76 ${t + 2} q14 -2 16 -14 q1 -9 -7 -10 q-6 0 -5 6 q6 -2 6 3 q-1 7 -12 7 z" fill="${bone}" stroke="${boneLine}" stroke-width="1.3" stroke-linejoin="round" />`
        + `<path d="M42 ${t + 8} Q42 ${t - 12} 60 ${t - 12} Q78 ${t - 12} 78 ${t + 8} L72 ${t + 12} L70 ${t + 20} L66 ${t + 17} L63 ${t + 22} L60 ${t + 18} L57 ${t + 22} L54 ${t + 17} L50 ${t + 20} L48 ${t + 12} z" fill="${bone}" stroke="${boneLine}" stroke-width="1.4" stroke-linejoin="round" />`
        + `<g fill="#2b1633"><ellipse cx="52" cy="${t + 2}" rx="4.6" ry="5" /><ellipse cx="68" cy="${t + 2}" rx="4.6" ry="5" /><path d="M58 ${t + 10} l2 -3 l2 3 z" /></g>`
        + `<g fill="${acc}"><circle cx="52" cy="${t + 3}" r="1.6" /><circle cx="68" cy="${t + 3}" r="1.6" /></g>`
      break
    }
    case "furCap": {
      // енотовая шапка охотника с полосатым хвостом
      const tail = `M${60 + r - 6} ${t + 8} C${60 + r + 8} ${t + 8} ${60 + r + 12} ${t + 24} ${60 + r + 6} ${t + 40}`
      h = `<path d="${tail}" fill="none" stroke="${dark}" stroke-width="10.5" stroke-linecap="round" />
        <path d="${tail}" fill="none" stroke="${c}" stroke-width="8" stroke-linecap="round" />
        <path d="${tail}" fill="none" stroke="${shade(c, -0.5)}" stroke-width="8" stroke-dasharray="3.5 5" />
        <circle cx="${60 + r + 6}" cy="${t + 40}" r="3.8" fill="#f1e3c6" />`
        + `<path d="M${60 - r + 2} ${t + 18} Q${60 - r + 2} ${t - 7} 60 ${t - 7} Q${60 + r - 2} ${t - 7} ${60 + r - 2} ${t + 18} z" fill="${c}" stroke="${dark}" stroke-width="1.5" />
        <path d="M${60 - r + 1} ${t + 16} Q60 ${t + 8} ${60 + r - 1} ${t + 16}" fill="none" stroke="#d7b98e" stroke-width="7" stroke-linecap="round" />
        <path d="M48 ${t - 2} l2 5 M58 ${t - 5} l1 5 M68 ${t - 3} l-1 5" stroke="${dark}" stroke-width="1.2" stroke-linecap="round" />`
      break
    }
    case "kettle":
      // каска пехотинца с широкими полями
      h = `<path d="M${f1(60 - r * 0.72)} ${t + 12} Q${f1(60 - r * 0.72)} ${t - 9} 60 ${t - 9} Q${f1(60 + r * 0.72)} ${t - 9} ${f1(60 + r * 0.72)} ${t + 12} z" fill="${c}" stroke="${dark}" stroke-width="1.5" />
        <path d="M${f1(60 - r * 0.5)} ${t - 1} Q60 ${t - 6} ${f1(60 + r * 0.5)} ${t - 1}" fill="none" stroke="#ffffff" stroke-width="2" opacity=".5" />
        <ellipse cx="60" cy="${t + 12}" rx="${r + 11}" ry="5.5" fill="${shade(c, -0.08)}" stroke="${dark}" stroke-width="1.5" />
        <path d="M${60 - r + 2} ${t + 14} Q${60 - r + 4} ${cy + 18} 50 ${cy + 26} M${60 + r - 2} ${t + 14} Q${60 + r - 4} ${cy + 18} 70 ${cy + 26}" fill="none" stroke="#5a3a1e" stroke-width="1.6" />`
      break
    case "shako":
      // кивер гусара: высокий цилиндр, козырёк, кокарда и султан
      h = `<path d="M44 ${t + 12} L42 ${t - 22} L78 ${t - 22} L76 ${t + 12} z" fill="${c}" stroke="${dark}" stroke-width="1.5" stroke-linejoin="round" />
        <ellipse cx="60" cy="${t - 22}" rx="18" ry="4" fill="${shade(c, 0.15)}" stroke="${dark}" stroke-width="1.3" />
        <path d="M43 ${t + 4} H77" stroke="${acc}" stroke-width="3" /><path d="M43 ${t - 17} H77" stroke="${acc}" stroke-width="2" />
        <path d="M42 ${t + 12} Q60 ${t + 22} 78 ${t + 12} z" fill="#1b1b1b" />
        <circle cx="60" cy="${t - 8}" r="4.6" fill="${acc}" stroke="${shade(acc, -0.4)}" stroke-width="1.2" />
        <ellipse cx="60" cy="${t - 32}" rx="4.6" ry="9" fill="#ffffff" stroke="#adb5bd" stroke-width="1.2" /><path d="M60 ${t - 24} v2" stroke="${acc}" stroke-width="3" />`
      break
    case "leafHelm":
      h = helmetDome(60, t, r, c) + `<rect x="58" y="${t + 14}" width="4" height="12" rx="1" fill="${dark}" />`
        + leaf(60, t - 4, -150, 22, "#52b788") + leaf(60, t - 4, -30, 22, "#40916c") + leaf(60, t - 4, -90, 24, acc)
      break
    case "dragonHelm": {
      // шлем драконьего всадника: гребень-плавник и острые щёчные крылья
      const fin = `<path d="M${60 - r + 3} ${t + 14} L${60 - r - 14} ${t + 4} L${60 - r - 4} ${t + 2} L${60 - r - 12} ${t - 8} L${60 - r + 6} ${t + 2} z" fill="${acc}" stroke="${shade(acc, -0.45)}" stroke-width="1.2" stroke-linejoin="round" />`
      h = `<path d="M46 ${t - 2} L50 ${t - 20} L56 ${t - 8} L60 ${t - 26} L64 ${t - 8} L70 ${t - 20} L74 ${t - 2} z" fill="${acc}" stroke="${shade(acc, -0.45)}" stroke-width="1.3" stroke-linejoin="round" />`
        + helmetDome(60, t, r, c) + fin + `<g transform="translate(120 0) scale(-1 1)">${fin}</g>`
        + `<path d="M60 ${t + 4} l-6 9 h12 z" fill="${acc}" stroke="${shade(acc, -0.45)}" stroke-width="1" />`
      break
    }
    case "topknot": {
      // пучок волос мечника, перехваченный лентой, и повязка на лбу
      const hair = a.fur?.dark ?? "#3b2a20"
      h = `<path d="M66 ${t - 8} q14 -6 22 4 M66 ${t - 8} q16 0 20 12" fill="none" stroke="${c}" stroke-width="3.6" stroke-linecap="round" />
        <circle cx="60" cy="${t - 6}" r="9.5" fill="${hair}" stroke="${shade(hair, -0.4)}" stroke-width="1.4" />
        <path d="M55 ${t - 10} q5 -4 10 0" fill="none" stroke="${shade(hair, 0.35)}" stroke-width="1.4" />
        <rect x="52" y="${t + 1}" width="16" height="5" rx="2" fill="${c}" stroke="${shade(c, -0.4)}" stroke-width="1" />
        <path d="M${60 - r + 2} ${t + 18} Q60 ${t + 9} ${60 + r - 2} ${t + 18}" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round" />`
      break
    }
    case "antlers": {
      // венок друида и оленьи рога
      const antler = `<path d="M46 ${t + 6} Q38 ${t - 6} 30 ${t - 26} M40 ${t - 6} Q32 ${t - 6} 24 ${t - 12} M35 ${t - 15} Q38 ${t - 24} 42 ${t - 30}" fill="none" stroke="#6d4c41" stroke-width="6" stroke-linecap="round" />
        <path d="M46 ${t + 6} Q38 ${t - 6} 30 ${t - 26} M40 ${t - 6} Q32 ${t - 6} 24 ${t - 12} M35 ${t - 15} Q38 ${t - 24} 42 ${t - 30}" fill="none" stroke="#c8a27a" stroke-width="3.4" stroke-linecap="round" />`
      let wreath = ""
      for (let i = 0; i < 9; i++) {
        const ang = 200 + i * 17.5
        const rad = (ang * Math.PI) / 180
        wreath += leaf(60 + (r - 8) * Math.cos(rad), cy + 4 + (r - 6) * Math.sin(rad), ang + 70, 12, i % 2 ? "#52b788" : c)
      }
      h = antler + `<g transform="translate(120 0) scale(-1 1)">${antler}</g>` + wreath
        + `<circle cx="60" cy="${t + 4}" r="3" fill="#e63946" /><circle cx="54" cy="${t + 6}" r="2.2" fill="#e63946" />`
      break
    }
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
    const tall = outfit.hat === "plumedHelm" || outfit.hat === "hornedHelm" || outfit.hat === "dragonHelm" || outfit.hat === "shako"
    const hy = t - (tall ? 30 : outfit.hat === "topknot" ? 24 : 16)
    halo = `<g class="halo"><ellipse cx="60" cy="${hy}" rx="17" ry="4.6" fill="none" stroke="#ffe066" stroke-width="3.2" /><ellipse cx="60" cy="${hy}" rx="17" ry="4.6" fill="none" stroke="#fffbe0" stroke-width="1.2" />
      ${star(16, t + 8, 3, "#fff3b0")}${star(104, t + 14, 2.6, "#fff3b0")}${star(100, cy + 34, 2.2, "#fff3b0")}</g>`
  }
  return `<g class="hat">${neckGear(a, outfit)}${mask}${h}${faceGear(a, outfit)}${halo}</g>`
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
    case "dragonHelm":
    case "shako":
    case "leafHelm":
    case "antlers":
      return -24
    default:
      return -12
  }
}
