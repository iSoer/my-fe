import { SETTLEMENT_RAIN } from "@game/content/settlement"

// Дождь над поселением по часам: одно и то же у всех, после перезагрузки не меняется. Без DOM и Phaser.

/** Сколько секунд дождь набирает силу в начале окна и стихает в конце. */
const FADE_MS = 8_000

/** Идёт ли дождь в окне номер `cycle` (детерминированно: хэш номера окна против доли `share`). */
export function rainyCycle(cycle: number): boolean {
  let h = Math.imul(cycle ^ 0x5bd1e995, 0x27d4eb2d) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x165667b1) >>> 0
  return (h % 1000) / 1000 < SETTLEMENT_RAIN.share
}

/** Сила дождя 0…1 в момент `now`: 0 — сухо, 1 — ливень; у краёв окна плавно нарастает и стихает. */
export function rainAt(now: number): number {
  const { cycleMs } = SETTLEMENT_RAIN
  const cycle = Math.floor(now / cycleMs)
  if (!rainyCycle(cycle)) return 0
  const t = now - cycle * cycleMs
  // Соседнее окно тоже дождливое — на стыке дождь не прерывается
  const fadeIn = rainyCycle(cycle - 1) ? 1 : Math.min(1, t / FADE_MS)
  const fadeOut = rainyCycle(cycle + 1) ? 1 : Math.min(1, (cycleMs - t) / FADE_MS)
  return Math.min(fadeIn, fadeOut)
}
