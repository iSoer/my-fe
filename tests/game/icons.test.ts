import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { EMOJI_ICON, EMOJI_RE, ICON_IDS, iconOfEmoji, iconSvg } from "@game/art/icons"

/** Типографские символы — остаются текстом (цвет у них свой, иконки не нужны). */
const TYPOGRAPHIC = new Set(["★", "☆", "♥", "♪", "♫", "♣", "✦", "✓", "✕", "➜", "⇱", "◆", "◇", "▲", "▼"])

function sources(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) sources(p, out)
    else if (/\.(tsx?|css)$/.test(p)) out.push(p)
  }
  return out
}

describe("иконки-штампы вместо эмодзи", () => {
  it("у каждого эмодзи в коде игры и платформы есть иконка", () => {
    const missing = new Set<string>()
    for (const file of [...sources("src/game"), ...sources("src/host")]) {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        const t = line.trim()
        if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) continue
        for (const m of line.matchAll(EMOJI_RE)) {
          const e = m[0].replace(/️/g, "")
          if (!TYPOGRAPHIC.has(e) && !iconOfEmoji(e)) missing.add(`${e} (${file})`)
        }
      }
    }
    expect([...missing]).toEqual([])
  })

  it("каждая иконка собирается в SVG в обоих тонах и для интерфейса", () => {
    for (const id of ICON_IDS) {
      for (const svg of [iconSvg(id, "light"), iconSvg(id, "dark"), iconSvg(id)]) {
        expect(svg.startsWith("<svg"), id).toBe(true)
        expect(svg, id).not.toMatch(/undefined|NaN| c="| w="| fc="/)
      }
    }
  })

  it("таблица эмодзи ссылается только на существующие иконки", () => {
    for (const [emoji, id] of Object.entries(EMOJI_ICON)) expect(ICON_IDS, emoji).toContain(id)
  })
})
