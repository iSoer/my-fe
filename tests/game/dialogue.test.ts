import { beforeEach, describe, expect, it } from "vitest"
import { $save } from "@game/state/save"
import { $dialogue, advanceDialogue, canTalk, openDialogue, resetDialogues, skipDialogue } from "@game/state/dialogue"
import { DIALOGUES } from "@game/content/dialogues"
import { NPCS } from "@game/content/settlement"
import { createEmptySave, parseSave, serializeSave } from "@game/core/save"
import { setLang } from "@game/i18n"

const setDialogues = (on: boolean) => {
  const s = $save.get()
  $save.set({ ...s, settings: { ...s.settings, dialogues: on } })
}

describe("разговоры с жителями", () => {
  beforeEach(() => {
    $save.set(createEmptySave(1))
    resetDialogues()
  })

  it("у каждого жителя есть сцены по 2–3 реплики, на обоих языках", () => {
    for (const lang of ["en", "ru"] as const) {
      setLang(lang)
      for (const n of NPCS) {
        const scenes = DIALOGUES[n.id] ?? []
        expect(scenes.length, n.id).toBeGreaterThan(0)
        for (const scene of scenes) {
          const lines = scene()
          expect(lines.length).toBeGreaterThanOrEqual(2)
          expect(lines.length).toBeLessThanOrEqual(3)
          expect(lines[0]?.who).toBe("npc")
          for (const l of lines) expect(l.text.length).toBeGreaterThan(0)
        }
      }
    }
  })

  it("реплики идут по очереди, после последней разговор закрывается; сцены жителя — по кругу", () => {
    expect(openDialogue("sergeant")).toBe(true)
    const first = $dialogue.get()!
    expect(first.index).toBe(0)
    for (let i = 1; i < first.lines.length; i++) {
      advanceDialogue()
      expect($dialogue.get()?.index).toBe(i)
    }
    advanceDialogue()
    expect($dialogue.get()).toBeNull()
    openDialogue("sergeant")
    expect($dialogue.get()!.lines[0]!.text).not.toBe(first.lines[0]!.text)
  })

  it("любой разговор можно пропустить сразу", () => {
    openDialogue("scout")
    skipDialogue()
    expect($dialogue.get()).toBeNull()
  })

  it("выключены в настройках — жители молчат; по умолчанию и в старых сейвах — включены", () => {
    expect($save.get().settings.dialogues).toBe(true)
    setDialogues(false)
    expect(canTalk("sergeant")).toBe(false)
    expect(openDialogue("sergeant")).toBe(false)
    expect($dialogue.get()).toBeNull()
    const raw = JSON.parse(serializeSave(createEmptySave(1))) as { settings: Record<string, unknown> }
    delete raw.settings["dialogues"]
    const back = parseSave(JSON.stringify(raw))
    expect(back.ok && back.save.settings.dialogues).toBe(true)
    expect(canTalk("nobody")).toBe(false)
  })
})
