// Иконки снаряжения для интерфейса: оружие по виду и материалу (грейду), талисманы — кольца с камнем своего цвета.
// Чистые SVG-строки (viewBox 64×64), без DOM: рисуются в карточке бойца, шторках снаряжения и Лавке.
import type { WeaponGrade, WeaponSkill } from "@shared/character/skills"
import type { WeaponVariant } from "@game/core/skills/types"

const svg = (body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">${body}</svg>`

const INK = "#3b2614"

/** Материал грейда: основной цвет «металла», светлый блик и тёмная кромка. Деревянное — коричневое целиком. */
const MATERIAL: Record<WeaponGrade, { base: string, light: string, dark: string }> = {
  wood: { base: "#a0673a", light: "#c98b55", dark: "#6b4226" },
  iron: { base: "#9aa3ad", light: "#c9d0d8", dark: "#5f6873" },
  steel: { base: "#b7cbe0", light: "#e3eef9", dark: "#5a7894" },
  silver: { base: "#e9eef4", light: "#ffffff", dark: "#8f9cab" }
}

/** Рукоять, древко, переплёт — дерево у любого грейда (у деревянного — темнее, чтобы отличаться от клинка). */
const HANDLE = "#7a4e2d"

/** Отметка разновидности на рукояти: Killer — красный камень, Brave — золотой, «-slayer» — зелёный. */
const VARIANT_GEM: Partial<Record<WeaponVariant, string>> = {
  killer: "#e63946",
  brave: "#ffd166",
  armorslayer: "#52b788",
  cavslayer: "#52b788"
}

function gem(x: number, y: number, color: string | undefined): string {
  return color ? `<circle cx="${x}" cy="${y}" r="4" fill="${color}" stroke="${INK}" stroke-width="1.5" />` : ""
}

function sword(m: typeof MATERIAL.wood, g?: string): string {
  return `<path d="M44 8 L56 8 L56 20 L28 46 L18 36 Z" fill="${m.base}" stroke="${m.dark}" stroke-width="2.5" stroke-linejoin="round" />`
    + `<path d="M50 11 L53 11 L25 41 L23 39 Z" fill="${m.light}" opacity=".8" />`
    + `<path d="M12 34 L30 52" stroke="${m.dark}" stroke-width="7" stroke-linecap="round" />`
    + `<path d="M12 34 L30 52" stroke="${m.base}" stroke-width="4" stroke-linecap="round" />`
    + `<path d="M21 43 L11 53" stroke="${HANDLE}" stroke-width="6" stroke-linecap="round" />`
    + `<circle cx="9" cy="55" r="4.5" fill="${m.dark}" />`
    + gem(21, 43, g)
}

function spear(m: typeof MATERIAL.wood, g?: string): string {
  return `<path d="M10 54 L44 20" stroke="${HANDLE}" stroke-width="5" stroke-linecap="round" />`
    + `<path d="M40 18 Q46 6 58 6 Q58 18 46 24 Z" fill="${m.base}" stroke="${m.dark}" stroke-width="2.5" stroke-linejoin="round" />`
    + `<path d="M46 14 Q50 9 55 9" stroke="${m.light}" stroke-width="2" fill="none" />`
    + `<path d="M36 22 L42 28" stroke="${m.dark}" stroke-width="5" stroke-linecap="round" />`
    + gem(39, 25, g)
}

function axe(m: typeof MATERIAL.wood, g?: string): string {
  return `<path d="M14 56 L42 14" stroke="${HANDLE}" stroke-width="6" stroke-linecap="round" />`
    + `<path d="M34 10 Q52 4 58 20 Q48 22 44 34 Q30 26 34 10 Z" fill="${m.base}" stroke="${m.dark}" stroke-width="2.5" stroke-linejoin="round" />`
    + `<path d="M50 10 Q56 14 56 19" stroke="${m.light}" stroke-width="2.5" fill="none" />`
    + gem(26, 38, g)
}

function gauntlet(m: typeof MATERIAL.wood, g?: string): string {
  return `<path d="M16 34 Q14 18 24 14 L44 14 Q52 14 52 24 L52 40 Q52 50 42 52 L26 52 Q16 50 16 34 Z" fill="${m.base}" stroke="${m.dark}" stroke-width="2.5" />`
    + `<path d="M26 14 V26 M34 14 V26 M42 14 V26" stroke="${m.dark}" stroke-width="2" />`
    + `<path d="M20 20 Q22 16 26 16" stroke="${m.light}" stroke-width="2.5" fill="none" />`
    + `<rect x="20" y="50" width="26" height="8" rx="3" fill="${HANDLE}" stroke="${INK}" stroke-width="1.5" />`
    + gem(33, 38, g)
}

function bow(m: typeof MATERIAL.wood, g?: string): string {
  return `<path d="M18 6 Q52 32 18 58" stroke="${m.dark}" stroke-width="7" fill="none" stroke-linecap="round" />`
    + `<path d="M18 6 Q52 32 18 58" stroke="${m.base}" stroke-width="4" fill="none" stroke-linecap="round" />`
    + `<path d="M18 6 L18 58" stroke="#f1e9da" stroke-width="1.5" />`
    + `<path d="M12 32 L54 32" stroke="${HANDLE}" stroke-width="2.5" />`
    + `<path d="M54 32 L47 28 L47 36 Z" fill="${m.dark}" />`
    + `<path d="M12 32 L8 28 M12 32 L8 36" stroke="#e63946" stroke-width="2" />`
    + gem(32, 32, g)
}

function tome(m: typeof MATERIAL.wood, sigil: string, g?: string): string {
  return `<path d="M12 12 Q12 8 16 8 L50 8 L50 54 L16 54 Q12 54 12 50 Z" fill="${m.base}" stroke="${m.dark}" stroke-width="2.5" />`
    + `<path d="M50 8 L54 12 L54 58 L18 58 L16 54 L50 54 Z" fill="#f1e9da" stroke="${m.dark}" stroke-width="2" />`
    + `<path d="M16 8 V54" stroke="${m.dark}" stroke-width="2" />`
    + `<circle cx="33" cy="31" r="11" fill="none" stroke="${sigil}" stroke-width="3" />`
    + `<path d="M33 22 L39 36 L26 27 L40 27 L27 36 Z" fill="none" stroke="${sigil}" stroke-width="2" stroke-linejoin="round" />`
    + gem(33, 48, g)
}

function staff(m: typeof MATERIAL.wood, g?: string): string {
  return `<path d="M20 58 L40 22" stroke="${HANDLE}" stroke-width="5" stroke-linecap="round" />`
    + `<circle cx="44" cy="16" r="13" fill="#fff3b0" opacity=".45" />`
    + `<path d="M36 22 Q32 8 44 6 Q56 8 52 22" fill="none" stroke="${m.dark}" stroke-width="3" />`
    + `<circle cx="44" cy="16" r="7" fill="${m.light}" stroke="${m.dark}" stroke-width="2" />`
    + `<path d="M44 12 V20 M40 16 H48" stroke="#e63946" stroke-width="2.4" stroke-linecap="round" />`
    + gem(32, 40, g)
}

/** Иконка оружия: вид — форма (меч, копьё, топор, кастет, лук, гримуар, посох), грейд — материал. */
export function weaponIconSvg(kind: WeaponSkill, grade: WeaponGrade, variant: WeaponVariant = "basic"): string {
  const m = MATERIAL[grade]
  const g = VARIANT_GEM[variant]
  switch (kind) {
    case "sword":
      return svg(sword(m, g))
    case "spear":
      return svg(spear(m, g))
    case "axe":
      return svg(axe(m, g))
    case "gauntlet":
      return svg(gauntlet(m, g))
    case "bow":
      return svg(bow(m, g))
    case "blackMagic":
      return svg(tome(m, "#9d4edd", g))
    case "whiteMagic":
      return svg(staff(m, g))
  }
}

/** Цвет камня кольца по талисману: красный — атака, жёлтый — скорость и т. д. */
const RING_GEM: Record<string, string> = {
  tal_fang: "#e63946",
  tal_bell: "#ffd166",
  tal_collar: "#4f8fd1",
  tal_ribbon: "#ff8fab",
  tal_heart: "#2ec4b6",
  tal_claw: "#f77f00",
  tal_book: "#9d4edd",
  tal_coin: "#e9c46a",
  tal_mint: "#52b788",
  tal_foil: "#adb5bd"
}

/** Талисман — кольцо: золотой ободок и камень цвета талисмана; без id — пустой пунктирный слот. */
export function ringSvg(talismanId?: string): string {
  if (!talismanId)
    return svg(`<ellipse cx="32" cy="38" rx="17" ry="15" fill="none" stroke="#b9a98f" stroke-width="5" stroke-dasharray="6 5" />`
      + `<path d="M32 30 V46 M24 38 H40" stroke="#b9a98f" stroke-width="3" stroke-linecap="round" />`)
  const color = RING_GEM[talismanId] ?? "#e63946"
  return svg(`<ellipse cx="32" cy="40" rx="18" ry="16" fill="none" stroke="#8a5f0a" stroke-width="8" />`
    + `<ellipse cx="32" cy="40" rx="18" ry="16" fill="none" stroke="#ffd166" stroke-width="5" />`
    + `<path d="M18 34 Q22 27 30 25" stroke="#fff4c2" stroke-width="2" fill="none" />`
    + `<path d="M24 22 L32 12 L40 22 L32 30 Z" fill="${color}" stroke="${INK}" stroke-width="2" stroke-linejoin="round" />`
    + `<path d="M28 20 L32 15 L34 18" stroke="#ffffff" stroke-width="1.6" fill="none" opacity=".8" />`)
}
