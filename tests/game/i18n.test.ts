import { afterEach, describe, expect, it } from "vitest"
import { DEFAULT_LANG, lang, plural, setLang, tr } from "@game/i18n"
import { createEmptySave, parseSave, serializeSave } from "@game/core/save"

afterEach(() => setLang(DEFAULT_LANG))

describe("i18n", () => {
  it("по умолчанию английский", () => {
    expect(lang()).toBe("en")
    expect(tr("Cat", "Кот")).toBe("Cat")
    expect(createEmptySave(1).settings.lang).toBe("en")
  })
  it("tr следует за текущим языком", () => {
    setLang("ru")
    expect(tr("Cat", "Кот")).toBe("Кот")
  })
  it("plural: английские и русские формы", () => {
    const en = ["cat", "cats"] as const
    const ru = ["кот", "кота", "котов"] as const
    expect([0, 1, 2, 5].map(n => plural(n, en, ru))).toEqual(["cats", "cat", "cats", "cats"])
    setLang("ru")
    expect([1, 2, 5, 11, 12, 21, 22, 25, 111, 104].map(n => plural(n, en, ru))).toEqual([
      "кот",
      "кота",
      "котов",
      "котов",
      "котов",
      "кот",
      "кота",
      "котов",
      "котов",
      "кота"
    ])
  })
  it("сейв без языка (до локализации) получает английский, выбранный язык переживает round-trip", () => {
    const s = createEmptySave(1)
    const old = JSON.parse(serializeSave(s)) as { settings: Record<string, unknown> }
    delete old.settings.lang
    const r = parseSave(JSON.stringify(old))
    expect(r.ok && r.save.settings.lang).toBe("en")
    s.settings.lang = "ru"
    const r2 = parseSave(serializeSave(s))
    expect(r2.ok && r2.save.settings.lang).toBe("ru")
  })
})
