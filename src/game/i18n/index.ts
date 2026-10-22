import { atom } from "nanostores"

/** Языки интерфейса. По умолчанию — английский. */
export type Lang = "en" | "ru"

export const LANGS: readonly Lang[] = ["en", "ru"]
export const DEFAULT_LANG: Lang = "en"

/** Название языка на нём самом — для переключателя. */
export const LANG_NAMES: Record<Lang, string> = { en: "English", ru: "Русский" }

/** Текущий язык. Источник истины — `settings.lang` сейва; здесь его зеркало для чтения вне React. */
export const $lang = atom<Lang>(DEFAULT_LANG)

export function lang(): Lang {
  return $lang.get()
}

export function setLang(next: Lang): void {
  $lang.set(next)
  if (typeof document !== "undefined") document.documentElement.lang = next
}

/** Строка на текущем языке. Вызывать в момент показа (рендер, геттер, функция), а не при загрузке модуля. */
export function tr(en: string, ru: string): string {
  return $lang.get() === "ru" ? ru : en
}

/**
 * Форма слова по числу. Английский: [one, other]; русский: [один, несколько, много] — «1 кот, 2 кота, 5 котов».
 * Возвращает только слово; число подставляет вызывающий.
 */
export function plural(n: number, en: readonly [string, string], ru: readonly [string, string, string]): string {
  const abs = Math.abs(n)
  if ($lang.get() !== "ru") return abs === 1 ? en[0] : en[1]
  const d10 = abs % 10
  const d100 = abs % 100
  if (d10 === 1 && d100 !== 11) return ru[0]
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return ru[1]
  return ru[2]
}
