import { beforeEach, describe, expect, it } from "vitest"
import { $save, ensureRoster, finishBattle, scoutBattle, startBattle, dispatchBattle } from "@game/state/save"
import { $dialogue, advanceDialogue, canTalk, npcStoryAlerts, openDialogue, skipDialogue } from "@game/state/dialogue"
import { orderDrinkAction, upgradeAction } from "@game/state/settlement"
import { SCENES } from "@game/content/dialogues"
import { NPCS } from "@game/content/settlement"
import { createEmptySave, migrate, parseSave, serializeSave } from "@game/core/save"
import { atLeast, atMost, check, seen, specificity } from "@game/core/story/conditions"
import { factsOf, recordEvent } from "@game/core/story/facts"
import { pickScene } from "@game/core/story/dialogue"
import { setLang } from "@game/i18n"
import type { SaveGame } from "@game/core/types"

const s = (): SaveGame => $save.get()
const set = (fn: (x: SaveGame) => SaveGame) => $save.set(fn(s()))
const bump = (key: string, n: number) => set(x => ({ ...x, story: { ...x.story, counters: { ...x.story.counters, [key]: n } } }))
const buildTavern = (level: number) => set(x => ({ ...x, settlement: { ...x.settlement, buildings: { ...x.settlement.buildings, tavern: { level, builtAt: 1 } } } }))

beforeEach(() => {
  $save.set(createEmptySave(1))
  $dialogue.set(null)
})

describe("сцены разговоров", () => {
  it("у каждого жителя есть фоновые сцены по 2–3 реплики на обоих языках; id сцен уникальны", () => {
    expect(new Set(SCENES.map(x => x.id)).size).toBe(SCENES.length)
    for (const lang of ["en", "ru"] as const) {
      setLang(lang)
      for (const n of NPCS) expect(SCENES.some(x => x.npc === n.id && !x.when), n.id).toBe(true)
      for (const scene of SCENES) {
        const lines = scene.lines()
        expect(lines.length, scene.id).toBeGreaterThanOrEqual(2)
        expect(lines.length, scene.id).toBeLessThanOrEqual(3)
        expect(lines[0]?.who).toBe("npc")
        expect(NPCS.some(n => n.id === scene.npc), scene.id).toBe(true)
      }
    }
  })

  it("реплики идут по очереди, после последней разговор закрывается; фоновые — по кругу", () => {
    expect(openDialogue("sergeant")).toBe(true)
    const first = $dialogue.get()!
    for (let i = 1; i < first.lines.length; i++) {
      advanceDialogue()
      expect($dialogue.get()?.index).toBe(i)
    }
    advanceDialogue()
    expect($dialogue.get()).toBeNull()
    openDialogue("sergeant")
    expect($dialogue.get()!.sceneId).not.toBe(first.sceneId)
    skipDialogue()
    expect($dialogue.get()).toBeNull()
  })

  it("выключены в настройках — жители молчат и «!» не горит; в старых сейвах включены", () => {
    bump("sortie.victory", 1)
    expect(npcStoryAlerts()["sergeant"]).toBe(true)
    set(x => ({ ...x, settings: { ...x.settings, dialogues: false } }))
    expect(canTalk("sergeant")).toBe(false)
    expect(openDialogue("sergeant")).toBe(false)
    expect(npcStoryAlerts()["sergeant"]).toBe(false)
    const raw = JSON.parse(serializeSave(createEmptySave(1))) as { settings: Record<string, unknown> }
    delete raw.settings["dialogues"]
    const back = parseSave(JSON.stringify(raw))
    expect(back.ok && back.save.settings.dialogues).toBe(true)
  })
})

describe("условия триггеров", () => {
  it("факта нет — он 0; пороги, «не больше», и/или/не; специфичность — число критериев", () => {
    const f = { a: 5 }
    expect(check(atLeast("a", 5), f)).toBe(true)
    expect(check(atLeast("a", 6), f)).toBe(false)
    expect(check(atMost("b", 0), f)).toBe(true)
    expect(check({ any: [atLeast("b", 1), atLeast("a", 1)] }, f)).toBe(true)
    expect(check({ not: atLeast("a", 1) }, f)).toBe(false)
    expect(specificity({ all: [atLeast("a", 1), seen("x")] })).toBe(2)
  })

  it("события копятся в общих и уточнённых счётчиках; производные факты читаются из сейва", () => {
    let save = recordEvent(s(), { type: "drinkDrunk", drinkId: "pale_ale" })
    save = recordEvent(save, { type: "drinkDrunk", drinkId: "oak_stout" })
    const f = factsOf({ ...save, settlement: { ...save.settlement, buildings: { ...save.settlement.buildings, tavern: { level: 3, builtAt: 1 } } } })
    expect(f["drink.drunk"]).toBe(2)
    expect(f["drink.drunk.pale_ale"]).toBe(1)
    expect(f["building.level.tavern"]).toBe(3)
    expect(f["building.level.barracks"]).toBe(1)
  })
})

describe("сюжетные сцены по делам игрока", () => {
  it("простое: улучшил бар — у трактирщицы новая сцена с «!», один раз; потом снова фоновые", () => {
    buildTavern(1)
    expect(npcStoryAlerts()["barkeep"]).toBe(false)
    set(x => ({ ...x, profile: { ...x.profile, treats: 10_000 } }))
    expect(upgradeAction("tavern").ok).toBe(true)
    expect(s().story.counters["building.upgraded.tavern"]).toBe(1)
    expect(npcStoryAlerts()["barkeep"]).toBe(true)
    openDialogue("barkeep")
    expect($dialogue.get()!.sceneId).toBe("barkeep.upgraded")
    // открыл — значит, увидел, даже если пропустил
    skipDialogue()
    expect(npcStoryAlerts()["barkeep"]).toBe(false)
    openDialogue("barkeep")
    expect($dialogue.get()!.sceneId).toMatch(/^barkeep\.idle/)
  })

  it("счётчик: 10 вылазок — сцена у разведчика; 9 — ещё нет", () => {
    bump("sortie.started", 9)
    expect(pickScene(s(), "scout")?.id).toMatch(/idle/)
    bump("sortie.started", 10)
    expect(pickScene(s(), "scout")?.id).toBe("scout.ten_sorties")
  })

  it("специфичное: 100 светлых эля — важнее улучшения бара; цепочка — только после первой сцены", () => {
    buildTavern(3)
    bump("drink.drunk.pale_ale", 100)
    expect(pickScene(s(), "barkeep")?.id).toBe("barkeep.pale_ale_100")
    bump("sortie.victory", 30)
    expect(pickScene(s(), "sergeant")?.id).toBe("sergeant.first_win")
    openDialogue("sergeant")
    expect(pickScene(s(), "sergeant")?.id).toBe("sergeant.veteran")
  })

  it("вылазка и кружка из бара сами пишут события: вылазка, выпитое пиво, итог боя", () => {
    ensureRoster()
    buildTavern(1)
    set(x => ({ ...x, profile: { ...x.profile, treats: 1000 } }))
    expect(orderDrinkAction("pale_ale").ok).toBe(true)
    scoutBattle("easy")
    expect(startBattle(s().army!.squadIds).ok).toBe(true)
    dispatchBattle({ type: "retreat" })
    finishBattle()
    const c = s().story.counters
    expect(c["drink.ordered.pale_ale"]).toBe(1)
    expect(c["drink.drunk.pale_ale"]).toBe(1)
    expect(c["sortie.started"]).toBe(1)
    expect(c["sortie.started.easy"]).toBe(1)
    expect(c["sortie.finished"]).toBe(1)
    expect(c["sortie.retreat"]).toBe(1)
  })

  it("старый сейв: счётчики восстанавливаются из общей статистики", () => {
    const old = { ...JSON.parse(serializeSave(createEmptySave(1))), version: 10, stats: { battles: 12, wins: 7, kills: 40, deaths: 2, armiesLost: 0 } } as Record<string, unknown>
    delete old["story"]
    const m = migrate(old) as { story: SaveGame["story"] }
    expect(m.story.counters["sortie.started"]).toBe(12)
    expect(m.story.counters["sortie.victory"]).toBe(7)
    expect(m.story.seen).toEqual([])
  })
})
