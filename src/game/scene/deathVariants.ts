import type { MoveType } from "@game/core/types"
import type { ArtWeapon } from "@game/art/index"

/**
 * Выбор варианта гибели (без Phaser — проверяется тестами). Выбирается детерминированно по seed
 * (юнит + ход), с уклоном под оружие убийцы и тип передвижения, чтобы карта и кинематик показывали одно и то же.
 */
export type DeathVariant
  = | "fall"
    | "gibs"
    | "explode"
    | "flatten"
    | "launch"
    | "dissolve"
    | "drill"
    | "crumble"
    | "electro"
    | "ragdoll"
    | "sink"
    | "behead"
    | "halve"
    | "impale"
    | "pincushion"
    | "ash"
    | "freeze"
    | "ascend"
    | "balloon"
    | "knockout"
    | "zombieMelt"

export const DEATH_VARIANTS: readonly DeathVariant[] = [
  "fall",
  "gibs",
  "explode",
  "flatten",
  "launch",
  "dissolve",
  "drill",
  "crumble",
  "electro",
  "ragdoll",
  "sink",
  "behead",
  "halve",
  "impale",
  "pincushion",
  "ash",
  "freeze",
  "ascend",
  "balloon",
  "knockout",
  "zombieMelt"
]

/** Варианты только для зомби (врагов): бойцам игрока не выпадают. */
export const ZOMBIE_ONLY_VARIANTS: readonly DeathVariant[] = ["zombieMelt"]

const BASE_WEIGHTS: Record<DeathVariant, number> = {
  fall: 3,
  gibs: 2,
  explode: 2,
  flatten: 1,
  launch: 2,
  dissolve: 1,
  drill: 1,
  crumble: 1,
  electro: 1,
  ragdoll: 2,
  sink: 1,
  behead: 1,
  halve: 1,
  impale: 1,
  pincushion: 1,
  ash: 1,
  freeze: 1,
  ascend: 1,
  balloon: 1,
  knockout: 2,
  zombieMelt: 3
}

/** Уклон по оружию убийцы (добавка к базовому весу). */
const WEAPON_BIAS: Record<ArtWeapon, Partial<Record<DeathVariant, number>>> = {
  // Меч рубит: голова с плеч, разрез пополам, куски. Копьё насаживает и пробивает. Топор — тяжёлый:
  // вбивает в землю, сносит голову, глушит. Кастеты — нокаут, «шарик», отлёт. Лук — ёж из стрел.
  // Тьма испепеляет, взрывает, растворяет; свет — душа возносится, лёд, «кристалл» (crumble в светлых тонах).
  sword: { behead: 4, halve: 5, gibs: 3, launch: 1, ragdoll: 1 },
  spear: { impale: 7, gibs: 3, ragdoll: 2, launch: 1 },
  axe: { behead: 5, flatten: 4, knockout: 3, halve: 2, launch: 2, gibs: 1, ragdoll: 1 },
  gauntlet: { knockout: 5, balloon: 4, launch: 3, ragdoll: 3, explode: 1 },
  bow: { pincushion: 7, launch: 2, fall: 2, ragdoll: 2 },
  blackMagic: { ash: 6, explode: 3, dissolve: 3, electro: 2, balloon: 2, freeze: 1 },
  whiteMagic: { ascend: 6, freeze: 3, crumble: 3, dissolve: 2, fall: 2 }
}

const MOVE_BIAS: Record<MoveType, Partial<Record<DeathVariant, number>>> = {
  infantry: {},
  armored: { crumble: 2, flatten: 1, knockout: 1, freeze: 1 },
  cavalry: { launch: 1, ragdoll: 1, behead: 1, impale: 1 },
  flier: { launch: 2, dissolve: 1, pincushion: 2, ascend: 1, balloon: 1 }
}

function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}
export { hash as deathHash }

/** Seed гибели: один и тот же для карты и кинематика. */
export function deathSeed(unitId: string, turn: number): number {
  return hash(`${unitId}:${turn}`)
}

/** Отладочное принуждение варианта: `window.__pfDeathOverride = 'gibs'`. */
function readOverride(isEnemy: boolean): DeathVariant | null {
  if (typeof window === "undefined") return null
  const v = (window as { __pfDeathOverride?: unknown }).__pfDeathOverride
  if (typeof v !== "string" || !(DEATH_VARIANTS as readonly string[]).includes(v)) return null
  if (!isEnemy && ZOMBIE_ONLY_VARIANTS.includes(v as DeathVariant)) return null
  return v as DeathVariant
}

/** Веса вариантов для убийцы/цели (для выбора и тестов). */
export function deathWeights(
  killerKind: ArtWeapon | undefined,
  moveType: MoveType,
  isEnemy: boolean
): Record<DeathVariant, number> {
  const weights: Record<DeathVariant, number> = { ...BASE_WEIGHTS }
  const addAll = (bias: Partial<Record<DeathVariant, number>>): void => {
    for (const [k, v] of Object.entries(bias) as [DeathVariant, number][]) weights[k] += v
  }
  if (killerKind) addAll(WEAPON_BIAS[killerKind])
  addAll(MOVE_BIAS[moveType])
  if (!isEnemy) for (const v of ZOMBIE_ONLY_VARIANTS) weights[v] = 0
  return weights
}

export function pickDeathVariant(
  seed: number,
  killerKind: ArtWeapon | undefined,
  moveType: MoveType,
  isEnemy = false
): DeathVariant {
  const forced = readOverride(isEnemy)
  if (forced) return forced
  const weights = deathWeights(killerKind, moveType, isEnemy)
  let total = 0
  for (const v of DEATH_VARIANTS) total += weights[v]
  let r = ((seed % 100000) / 100000) * total
  for (const v of DEATH_VARIANTS) {
    r -= weights[v]
    if (r < 0) return v
  }
  return "fall"
}
