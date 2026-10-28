import { lang } from "@game/i18n"

// Цитаты для болтовни сплетников в поселении (`GOSSIPS`): только настоящие, у каждой — источник и ссылка, где она
// найдена дословно. Оригинал — в `original`, второй язык — перевод. Сам список — `quotes.json`, грузится отдельным
// чанком при входе в поселение.

export interface Quote {
  id: string
  ru: string
  en: string
  /** На каком языке сказано в оригинале; другой — перевод. */
  original: "ru" | "en"
  /** Кто или откуда: «Елена Летучая», «Джон Уотерс — Pink Flamingos (1972)». */
  source: { ru: string, en: string }
  /** Персонаж фильма, если это реплика персонажа. */
  speaker: string | null
  /** Где сказано: передача, интервью, год. */
  context: string | null
  /** Страница, на которой цитата найдена. */
  url: string
}

export function loadQuotes(): Promise<readonly Quote[]> {
  return import("./quotes.json").then(m => m.default as readonly Quote[])
}

/** Текст и подпись на текущем языке. */
export function quoteLine(q: Quote): { text: string, source: string } {
  const ru = lang() === "ru"
  return { text: ru ? q.ru : q.en, source: ru ? q.source.ru : q.source.en }
}
