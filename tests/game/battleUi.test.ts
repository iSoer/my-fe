import { beforeEach, describe, expect, it } from "vitest"
import { $save } from "@game/state/save"
import {
  $battleUi,
  beginDrag,
  cancel,
  dragHover,
  endDrag,
  enterBattleScreen,
  isDisplaced,
  tapTile
} from "@game/state/battleUi"
import { createEmptySave } from "@game/core/save"
import { makeBattle, plainTiles } from "./helpers"

const flat = { hp: 20, str: 10, mag: 10, spd: 5, def: 5, res: 5 }

function setup(enemyPos = { x: 2, y: 2 }) {
  const b = makeBattle(
    [
      { classId: "infantry_sword", pos: { x: 2, y: 7 }, baseStats: flat },
      { classId: "infantry_whiteMagic", pos: { x: 3, y: 7 }, baseStats: flat }
    ],
    [{ classId: "infantry_sword", pos: enemyPos, baseStats: flat, stance: "hold" }]
  )
  const save = createEmptySave(1)
  save.battle = b.state
  $save.set(save)
  enterBattleScreen()
  return b
}

/** Дождаться, пока контроллер доиграет асинхронное перемещение. */
const flush = () => new Promise(r => setTimeout(r, 0))

describe("контроллер боя: управление в духе FEH", () => {
  beforeEach(() => setup())

  it("тап по бойцу: видны ход и цели, меню действий нет", () => {
    setup({ x: 2, y: 0 })
    tapTile({ x: 2, y: 7 })
    const ui = $battleUi.get()
    expect(ui.mode).toBe("unitSelected")
    expect(ui.reach?.has("2,5")).toBe(true)
    expect(ui.attackTiles?.size).toBe(0)
  })

  it("тап по врагу — прогноз, повторный тап по нему — атака", async () => {
    const b = setup({ x: 2, y: 4 })
    tapTile({ x: 2, y: 7 })
    tapTile({ x: 2, y: 4 })
    let ui = $battleUi.get()
    expect(ui.mode).toBe("forecast")
    expect(ui.targetId).toBe(b.enemies[0]!.id)
    expect(ui.movedTo).toEqual({ x: 2, y: 5 })
    expect(isDisplaced(ui)).toBe(true)
    tapTile({ x: 2, y: 4 })
    await flush()
    ui = $battleUi.get()
    expect(ui.mode).toBe("idle")
    expect($save.get().battle?.units[b.players[0]!.id]?.acted).toBe(true)
  })

  it("тап по клетке передвигает бойца, но не завершает его ход; отмена прогноза возвращает к выбору", async () => {
    const b = setup({ x: 2, y: 0 })
    const id = b.players[0]!.id
    tapTile({ x: 2, y: 7 })
    tapTile({ x: 2, y: 5 })
    await flush()
    let bu = $save.get().battle!.units[id]!
    expect(bu.pos).toEqual({ x: 2, y: 5 })
    expect(bu.acted).toBe(false)
    expect(bu.turnStart).toEqual({ x: 2, y: 7 })
    let ui = $battleUi.get()
    expect(ui.mode).toBe("unitSelected")
    expect(ui.selectedId).toBe(id)
    expect(ui.origin).toEqual({ x: 2, y: 5 })
    // Дальность — от клетки начала хода: дальше (2,5) не уйти, но можно вернуться назад
    expect(ui.reach?.has("2,4")).toBe(false)
    expect(ui.reach?.get("2,7")?.canStop).toBe(true)
    tapTile({ x: 1, y: 6 })
    await flush()
    bu = $save.get().battle!.units[id]!
    expect(bu.pos).toEqual({ x: 1, y: 6 })
    tapTile({ x: 2, y: 7 })
    await flush()
    bu = $save.get().battle!.units[id]!
    expect(bu.pos).toEqual({ x: 2, y: 7 })
    expect(bu.turnStart).toBeUndefined()
    ui = $battleUi.get()
    expect(ui.mode).toBe("unitSelected")
  })

  it("переставленный боец остаётся на месте после снятия выбора и снова выбирается", async () => {
    const b = setup({ x: 2, y: 0 })
    const id = b.players[0]!.id
    tapTile({ x: 2, y: 7 })
    tapTile({ x: 2, y: 5 })
    await flush()
    tapTile({ x: 2, y: 5 }) // тап по себе снимает выбор
    expect($battleUi.get().mode).toBe("idle")
    expect($save.get().battle!.units[id]!.pos).toEqual({ x: 2, y: 5 })
    tapTile({ x: 2, y: 5 })
    expect($battleUi.get().selectedId).toBe(id)
    expect($battleUi.get().reach?.get("2,7")?.canStop).toBe(true)
  })

  it("тап мимо цели в прогнозе — снова выбор бойца; отмена возвращает к выбору", () => {
    setup({ x: 2, y: 4 })
    tapTile({ x: 2, y: 7 })
    tapTile({ x: 2, y: 4 })
    expect($battleUi.get().mode).toBe("forecast")
    cancel()
    const ui = $battleUi.get()
    expect(ui.mode).toBe("unitSelected")
    expect(ui.movedTo).toBeUndefined()
  })
})

describe("контроллер боя: хлипкие препятствия", () => {
  it("боец бьёт стену с места, а на следующем ходу — ещё раз и ломает её", async () => {
    const b = makeBattle(
      [{ classId: "infantry_sword", pos: { x: 2, y: 7 }, baseStats: flat }],
      [{ classId: "infantry_sword", pos: { x: 2, y: 0 }, baseStats: flat, stance: "hold" }],
      { tiles: plainTiles({ "2,6": "wall_breakable" }) }
    )
    const id = b.players[0]!.id
    const save = createEmptySave(1)
    save.battle = b.state
    $save.set(save)
    enterBattleScreen()
    for (const hpAfter of [1, 0]) {
      tapTile({ x: 2, y: 7 })
      expect($battleUi.get().attackTiles?.has("2,6")).toBe(true)
      tapTile({ x: 2, y: 6 })
      expect($battleUi.get().mode).toBe("wallPreview")
      expect($battleUi.get().movedTo).toEqual({ x: 2, y: 7 })
      tapTile({ x: 2, y: 6 })
      await flush()
      const st = $save.get().battle!
      expect(st.walls["2,6"]).toBe(hpAfter)
      expect(st.units[id]!.pos).toEqual({ x: 2, y: 7 })
      // Новый ход: боец снова может действовать
      st.units[id]!.acted = false
      enterBattleScreen()
    }
  })
})

describe("контроллер боя: перетаскивание", () => {
  it("взять → тащить по клеткам → отпустить: боец встал и остаётся выбранным", () => {
    const b = setup({ x: 2, y: 0 })
    const id = b.players[0]!.id
    expect(beginDrag(id)).toBe(true)
    let ui = $battleUi.get()
    expect(ui.dragging).toBe(true)
    expect(ui.mode).toBe("unitSelected")
    dragHover({ x: 2, y: 6 })
    ui = $battleUi.get()
    expect(ui.dragValid).toBe(true)
    expect(ui.path).toEqual([
      { x: 2, y: 7 },
      { x: 2, y: 6 }
    ])
    dragHover({ x: 0, y: 0 })
    ui = $battleUi.get()
    expect(ui.dragValid).toBe(false)
    expect(ui.path).toBeUndefined()
    expect(endDrag({ x: 1, y: 6 })).toBe(true)
    ui = $battleUi.get()
    expect(ui.dragging).toBe(false)
    expect(ui.mode).toBe("unitSelected")
    expect(ui.selectedId).toBe(id)
    const bu = $save.get().battle!.units[id]!
    expect(bu.pos).toEqual({ x: 1, y: 6 })
    expect(bu.acted).toBe(false)
  })

  it("отпустить вне досягаемости — юнит возвращается, остаётся выбранным", () => {
    const b = setup({ x: 2, y: 0 })
    beginDrag(b.players[0]!.id)
    expect(endDrag({ x: 5, y: 0 })).toBe(false)
    const ui = $battleUi.get()
    expect(ui.mode).toBe("unitSelected")
    expect(ui.dragging).toBe(false)
    expect(ui.movedTo).toBeUndefined()
    expect($save.get().battle!.units[b.players[0]!.id]!.pos).toEqual({ x: 2, y: 7 })
  })

  it("отпустить на враге в досягаемости — прогноз атаки с лучшей клетки", () => {
    const b = setup({ x: 2, y: 4 })
    beginDrag(b.players[0]!.id)
    dragHover({ x: 2, y: 4 })
    expect($battleUi.get().dragValid).toBe(true)
    expect(endDrag({ x: 2, y: 4 })).toBe(true)
    const ui = $battleUi.get()
    expect(ui.mode).toBe("forecast")
    expect(ui.targetId).toBe(b.enemies[0]!.id)
    expect(ui.movedTo).toEqual({ x: 2, y: 5 })
  })

  it("нельзя взять врага или уже действовавшего юнита", () => {
    const b = setup({ x: 2, y: 0 })
    expect(beginDrag(b.enemies[0]!.id)).toBe(false)
    const save = $save.get()
    save.battle!.units[b.players[0]!.id]!.acted = true
    $save.set({ ...save })
    expect(beginDrag(b.players[0]!.id)).toBe(false)
  })
})

describe("контроллер боя: справка о клетке", () => {
  it("тап по пустой клетке показывает её свойства; повторный тап закрывает", () => {
    const b = makeBattle(
      [{ classId: "infantry_sword", pos: { x: 2, y: 7 }, baseStats: flat }],
      [{ classId: "infantry_sword", pos: { x: 2, y: 0 }, baseStats: flat, stance: "hold" }],
      { tiles: plainTiles({ "4,4": "forest" }) }
    )
    const save = createEmptySave(1)
    save.battle = b.state
    $save.set(save)
    enterBattleScreen()
    tapTile({ x: 4, y: 4 })
    expect($battleUi.get().mode).toBe("tileInfo")
    expect($battleUi.get().infoPos).toEqual({ x: 4, y: 4 })
    tapTile({ x: 4, y: 4 })
    expect($battleUi.get().mode).toBe("idle")
  })

  it("тап по клетке вне хода выбранного бойца — тоже справка", () => {
    setup({ x: 2, y: 0 })
    tapTile({ x: 2, y: 7 })
    tapTile({ x: 5, y: 2 })
    const ui = $battleUi.get()
    expect(ui.mode).toBe("tileInfo")
    expect(ui.selectedId).toBeUndefined()
  })
})
