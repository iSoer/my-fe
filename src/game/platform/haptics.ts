/** Тактильный отклик через Vibration API (где он есть: Android Chrome). */
export type HapticKind = "select" | "light" | "medium" | "heavy" | "error" | "success" | "warning"

const PATTERNS: Record<HapticKind, number | number[]> = {
  select: 5,
  light: 10,
  medium: 20,
  heavy: 35,
  error: [30, 40, 30],
  success: [15, 30, 15],
  warning: [20, 30]
}

let enabled = true
export function setHapticsEnabled(on: boolean): void {
  enabled = on
}

export function haptic(kind: HapticKind): void {
  if (!enabled || typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return
  try {
    navigator.vibrate(PATTERNS[kind])
  }
  catch {
    /* ignore */
  }
}
