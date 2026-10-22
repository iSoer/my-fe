// Чистая геометрия клякс крови (без Phaser): форма детерминирована по seed

/** LCG: одинаковый вид клякс для одного seed. */
export function goreRng(seed: number): () => number {
  let s = (seed >>> 0) || 0x9e3779b9
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

/**
 * Контур кляксы: точки вокруг центра с неровным радиусом. Чистая функция (для тестов):
 * радиус каждой точки в пределах [r × (1 − jitter), r × (1 + jitter)].
 */
export function blobOutline(seed: number, points: number, r: number, jitter: number): { x: number, y: number }[] {
  const rnd = goreRng(seed)
  const out: { x: number, y: number }[] = []
  // Сглаженный шум: среднее двух соседних случайных значений
  const raw = Array.from({ length: points }, () => rnd() * 2 - 1)
  for (let i = 0; i < points; i++) {
    const n = ((raw[i] ?? 0) * 2 + (raw[(i + 1) % points] ?? 0) + (raw[(i + points - 1) % points] ?? 0)) / 4
    const a = (i / points) * Math.PI * 2
    const rr = r * (1 + n * jitter)
    out.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr })
  }
  return out
}
