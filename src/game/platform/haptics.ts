import { gameHost } from "./host"

/** Тактильный отклик: хост может взять его на себя (Telegram), иначе Vibration API (где он есть: Android Chrome). */
export type HapticKind
  = | "select"
    | "light"
    | "medium"
    | "heavy"
    | "error"
    | "success"
    | "warning"
    /** Удары в бою: блок, попадание, сильный удар или приём, добивание. */
    | "block"
    | "hit"
    | "crit"
    | "kill"

const PATTERNS: Record<HapticKind, number | number[]> = {
  select: 5,
  light: 10,
  medium: 20,
  heavy: 35,
  error: [30, 40, 30],
  success: [15, 30, 15],
  warning: [20, 30],
  block: [12, 25, 12],
  hit: 30,
  crit: [45, 30, 70],
  kill: [70, 40, 120]
}

let enabled = true
export function setHapticsEnabled(on: boolean): void {
  enabled = on
}

export function haptic(kind: HapticKind): void {
  if (!enabled) return
  if (gameHost().haptic?.(kind)) return
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return
  try {
    navigator.vibrate(PATTERNS[kind])
  }
  catch {
    /* ignore */
  }
}

/** Вибрация в момент контакта: сила по исходу удара. */
export function strikeHaptic(damage: number, frac: number, special: boolean, lethal: boolean): HapticKind {
  if (damage <= 0) return "block"
  if (lethal) return "kill"
  return special || frac >= 0.4 ? "crit" : "hit"
}
