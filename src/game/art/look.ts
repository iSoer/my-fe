/**
 * Детали внешности миниатюры: форма ушей и хвоста, длина морды, отметины породы, пух, клок на макушке,
 * брови-пятна, веснушки, носочки. Выбираются детерминированно из seed бойца в рамках того, что допускает
 * порода (`BreedDef.look`) — сейв не меняется, старые бойцы получают детали тем же способом.
 */
import type { BreedLook, EarShape, Marking, TailShape } from "@game/content/breeds"

export type { EarShape, Marking, TailShape }

export interface CritterLook {
  ears: EarShape
  tail: TailShape
  /** Длина морды (собаки): 0 короткая, 1 средняя, 2 длинная. */
  muzzle: 0 | 1 | 2
  marking: Marking
  /** Пух на щеках (торчит по бокам головы). */
  cheeks: boolean
  /** Пушистое жабо на грудке. */
  chest: boolean
  /** Клок шерсти на макушке: 0 нет, 1 завиток, 2 хохолок. */
  tuft: 0 | 1 | 2
  /** Брови-пятна над глазами. */
  brows: boolean
  /** Веснушки на щеках. */
  freckles: boolean
  /** Усы: 0 короткие, 1 обычные, 2 длинные. */
  whiskers: 0 | 1 | 2
  /** Светлые «носочки» на лапах. */
  socks: boolean
  /** Торчащий клычок. */
  fang: boolean
  /** Кудрявые уши (пудель). */
  curly: boolean
}

/** Прежний облик вида: для миниатюр без данных бойца (заставки, деревня). */
export const DEFAULT_LOOK: Record<"cat" | "dog" | "mouse", CritterLook> = {
  cat: base("pointy", "long"),
  dog: base("floppy", "sickle"),
  mouse: base("round", "bare")
}

function base(ears: EarShape, tail: TailShape): CritterLook {
  return {
    ears,
    tail,
    muzzle: 1,
    marking: "none",
    cheeks: false,
    chest: false,
    tuft: 0,
    brows: false,
    freckles: false,
    whiskers: 1,
    socks: false,
    fang: false,
    curly: false
  }
}

/** Детерминированное число [0, 1) из seed и соли (хеш без состояния: старые бойцы получают те же детали). */
export function lookRand(seed: number, salt: number): number {
  let h = (seed | 0) ^ Math.imul((salt + 0x9e3779b9) | 0, 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d)
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** Облик бойца: варианты породы + случайные по seed мелочи (пух, клок, брови, веснушки, носочки). */
export function critterLook(species: "cat" | "dog" | "mouse", breed: BreedLook | undefined, seed: number): CritterLook {
  const r = (salt: number): number => lookRand(seed, salt)
  const pick = <T>(list: readonly T[] | undefined, fallback: T, salt: number): T =>
    list && list.length > 0 ? (list[Math.floor(r(salt) * list.length)] ?? fallback) : fallback
  const def = DEFAULT_LOOK[species]
  const fluffy = breed?.fluffy ?? false
  let marking: Marking = breed?.marking ?? "none"
  // у беспородных и пород без отметин — изредка своя отметина
  if (marking === "none") {
    const m = r(11)
    if (m < 0.12) marking = species === "dog" ? "blaze" : "eyepatch"
    else if (m < 0.2) marking = species === "cat" ? "blaze" : "eyepatch"
  }
  const tuftRoll = r(5)
  return {
    ears: pick(breed?.ears, def.ears, 1),
    tail: pick(breed?.tails, def.tail, 2),
    muzzle: pick(breed?.muzzle, 1, 3),
    marking,
    cheeks: r(4) < (fluffy ? 0.85 : 0.3),
    chest: r(6) < (fluffy ? 0.8 : 0.25),
    tuft: tuftRoll < 0.5 ? 0 : tuftRoll < 0.75 ? 1 : 2,
    brows: marking === "tan" || r(7) < 0.28,
    freckles: r(8) < 0.22,
    whiskers: Math.floor(r(9) * 3) as 0 | 1 | 2,
    socks: marking === "point" || marking === "tan" || r(10) < 0.3,
    fang: r(12) < 0.22,
    curly: species === "dog" && fluffy && (breed?.ears ?? []).includes("long")
  }
}
