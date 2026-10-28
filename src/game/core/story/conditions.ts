// Условия триггеров — данные, а не функции: их можно проверить тестом, показать в отладке и посчитать специфичность.
// Факта нет — он равен 0 (ничего ещё не случилось). Без DOM и Phaser.

export type Cond
  = | { fact: string, gte?: number, lte?: number, eq?: number }
    | { all: Cond[] }
    | { any: Cond[] }
    | { not: Cond }

/** Факт не меньше `n`: «сходи 10 раз в вылазку» — `atLeast("sortie.started", 10)`. */
export const atLeast = (fact: string, n: number): Cond => ({ fact, gte: n })
/** Факт не больше `n` (в том числе «ещё не случалось» — `atMost(x, 0)`). */
export const atMost = (fact: string, n: number): Cond => ({ fact, lte: n })
/** Сцена уже была (для цепочек: вторая часть — после первой). */
export const seen = (sceneId: string): Cond => ({ fact: `seen.${sceneId}`, gte: 1 })

export function check(c: Cond, facts: Readonly<Record<string, number>>): boolean {
  if ("all" in c) return c.all.every(x => check(x, facts))
  if ("any" in c) return c.any.some(x => check(x, facts))
  if ("not" in c) return !check(c.not, facts)
  const v = facts[c.fact] ?? 0
  if (c.gte !== undefined && v < c.gte) return false
  if (c.lte !== undefined && v > c.lte) return false
  if (c.eq !== undefined && v !== c.eq) return false
  return true
}

/** Специфичность — сколько простых условий: при равном приоритете побеждает более конкретное правило. */
export function specificity(c: Cond): number {
  if ("all" in c) return c.all.reduce((a, x) => a + specificity(x), 0)
  if ("any" in c) return Math.max(0, ...c.any.map(specificity))
  if ("not" in c) return specificity(c.not)
  return 1
}
