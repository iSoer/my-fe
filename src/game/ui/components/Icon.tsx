import { Fragment, type ReactNode } from "react"
import { EMOJI_RE, iconOfEmoji, iconSvg } from "@game/art/icons"

const svgCache = new Map<string, string>()

function svgOf(id: string): string {
  let s = svgCache.get(id)
  if (s === undefined) {
    s = iconSvg(id)
    svgCache.set(id, s)
  }
  return s
}

/**
 * Иконка-штамп вместо эмодзи (`art/icons`). Размер — от шрифта (1.25em), тон — от фона: CSS-переменные `--ic-*`
 * задают светлые поверхности (карточки, шторки, светлые кнопки), см. `styles.css`.
 * `emoji` — эмодзи из данных/строк; неизвестный показывается как есть.
 */
export function Icon({ emoji, id, className }: { emoji?: string, id?: string, className?: string }) {
  const icon = id ?? (emoji ? iconOfEmoji(emoji) : undefined)
  if (!icon) return emoji ? <>{emoji}</> : null
  return <span className={`ic${className ? ` ${className}` : ""}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: svgOf(icon) }} />
}

/** Текст с эмодзи: каждый известный эмодзи заменяется иконкой, остальное остаётся текстом. */
export function IconText({ text }: { text: string | undefined | null }): ReactNode {
  if (!text) return null
  const parts: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(EMOJI_RE)) {
    const i = m.index ?? 0
    const id = iconOfEmoji(m[0])
    if (!id) continue
    if (i > last) parts.push(text.slice(last, i))
    parts.push(<Icon key={i} id={id} />)
    last = i + m[0].length
  }
  if (parts.length === 0) return text
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts.map((p, k) => <Fragment key={k}>{p}</Fragment>)}</>
}

/** Есть ли в строке эмодзи, у которого есть иконка. */
export function hasIcon(text: string): boolean {
  for (const m of text.matchAll(EMOJI_RE)) if (iconOfEmoji(m[0])) return true
  return false
}
