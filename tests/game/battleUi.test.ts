import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { BattleAction, BattleState } from "@game/core/types"
import type * as AiModule from "@game/core/ai"
import { $save } from "@game/state/save"
import {
  $battleUi,
  beginDrag,
  cancel,
  dragHover,
  endDrag,
  endTurn,
  enterBattleScreen,
  isDisplaced,
  leaveBattleScreen,
  retreat,
  setPresenter,
  tapTile
} from "@game/state/battleUi"
import { createEmptySave } from "@game/core/save"
import { makeBattle, plainTiles } from "./helpers"

// ИИ врага можно подменить в отдельном тесте (зацикливание, ошибки); по умолчанию — настоящий
const ai = vi.hoisted(() => ({ override: null as ((s: BattleState) => BattleAction) | null }))
vi.mock("@game/core/ai", async (orig) => {
  const real = await orig<typeof AiModule>()
  return { ...real, nextEnemyAction: (s: BattleState) => (ai.override ? ai.override(s) : real.nextEnemyAction(s)) }
})

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
    tapTile({ x: 2, y: 4 })
    await flush()
    let bu = $save.get().battle!.units[id]!
    expect(bu.pos).toEqual({ x: 2, y: 4 })
    expect(bu.acted).toBe(false)
    expect(bu.turnStart).toEqual({ x: 2, y: 7 })
    let ui = $battleUi.get()
    expect(ui.mode).toBe("unitSelected")
    expect(ui.selectedId).toBe(id)
    expect(ui.origin).toEqual({ x: 2, y: 4 })
    // Дальность — от клетки начала хода (3 клетки пехоты): дальше (2,4) не уйти, но можно вернуться назад
    expect(ui.reach?.has("2,3")).toBe(false)
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

describe("контроллер боя: выбор союзника", () => {
  it("тап по не ходившему союзнику выбирает его, даже если у выбранного есть Поддержка", () => {
    const b = makeBattle(
      [
        { classId: "infantry_sword", pos: { x: 2, y: 7 }, baseStats: flat, skills: { assist: "as_swap" } },
        { classId: "infantry_sword", pos: { x: 3, y: 7 }, baseStats: flat }
      ],
      [{ classId: "infantry_sword", pos: { x: 2, y: 0 }, baseStats: flat, stance: "hold" }]
    )
    const save = createEmptySave(1)
    save.battle = b.state
    $save.set(save)
    enterBattleScreen()
    tapTile({ x: 2, y: 7 })
    expect($battleUi.get().assistTiles?.has("3,7")).toBe(true)
    tapTile({ x: 3, y: 7 })
    expect($battleUi.get().mode).toBe("unitSelected")
    expect($battleUi.get().selectedId).toBe(b.players[1]!.id)
    // Поддержку без лечения дают перетаскиванием на союзника
    beginDrag(b.players[1]!.id)
    endDrag({ x: 2, y: 7 })
    expect($battleUi.get().mode).toBe("unitSelected")
    tapTile({ x: 2, y: 7 })
    beginDrag(b.players[0]!.id)
    endDrag({ x: 3, y: 7 })
    expect($battleUi.get().mode).toBe("assistPreview")
  })

  it("лекарь по тапу на раненого союзника открывает лечение", () => {
    const b = setup({ x: 2, y: 0 })
    const save = $save.get()
    const ally = save.battle!.units[b.players[0]!.id]!
    ally.hp = Math.max(1, ally.hp - 5)
    $save.set({ ...save })
    tapTile({ x: 3, y: 7 })
    tapTile({ x: 2, y: 7 })
    expect($battleUi.get().mode).toBe("assistPreview")
  })
})

describe("контроллер боя: ход врага и уход с экрана", () => {
  afterEach(() => {
    ai.override = null
    setPresenter(null)
  })

  it("ИИ топчется на месте — предохранитель завершает фазу врага, ход переходит к игроку", async () => {
    const b = setup({ x: 2, y: 0 })
    const enemy = b.enemies[0]!.id
    // «Передвинуться» на свою же клетку: действие законно, но фаза не продвигается
    ai.override = s => ({ type: "move", unitId: enemy, to: s.units[enemy]!.pos })
    const err = vi.spyOn(console, "error").mockImplementation(() => {})
    await endTurn()
    err.mockRestore()
    const st = $save.get().battle!
    expect(st.phase).toBe("player")
    expect(st.turn).toBe(2)
    expect($battleUi.get().mode).toBe("idle")
    expect($battleUi.get().busy).toBe(false)
  })

  it("ошибочное действие ИИ — враг ждёт на месте, игра не падает", async () => {
    const b = setup({ x: 2, y: 0 })
    const enemy = b.enemies[0]!.id
    ai.override = s => ({ type: "attack", unitId: enemy, to: s.units[enemy]!.pos, targetId: "нет-такого" })
    const err = vi.spyOn(console, "error").mockImplementation(() => {})
    await endTurn()
    err.mockRestore()
    const st = $save.get().battle!
    expect(st.phase).toBe("player")
    expect(st.units[enemy]!.pos).toEqual({ x: 2, y: 0 })
    expect($battleUi.get().busy).toBe(false)
  })

  it("отступить во время хода врага нельзя", async () => {
    setup({ x: 2, y: 0 })
    let release = (): void => {}
    setPresenter({ play: () => new Promise<void>((r) => { release = r }) })
    const turn = endTurn()
    expect($battleUi.get().busy).toBe(true)
    await retreat()
    expect($save.get().battle!.result).toBeUndefined()
    release()
    setPresenter(null)
    await turn
    expect($save.get().battle!.phase).toBe("player")
  })

  it("уход с экрана посреди анимации: циклы останавливаются, бой в сейве цел, при возврате ход врага доигрывается", async () => {
    setup({ x: 2, y: 0 })
    // Презентер, который никогда не доигрывает (Phaser-игру уничтожили посреди твина)
    setPresenter({ play: () => new Promise<void>(() => {}) })
    const turn = endTurn()
    await flush()
    leaveBattleScreen()
    await turn
    let st = $save.get().battle!
    expect(st.phase).toBe("enemy")
    expect($battleUi.get().busy).toBe(false)
    setPresenter(null)
    enterBattleScreen()
    await flush()
    await flush()
    st = $save.get().battle!
    expect(st.phase).toBe("player")
    expect(st.turn).toBe(2)
    expect($battleUi.get().mode).toBe("idle")
  })
})

describe("контроллер боя: разведка в чаще", () => {
  /** Чаща 30×30 из генератора; отряд из двух бойцов на старте. */
  async function exploring() {
    const { generateExpedition } = await import("@game/core/map/expedition")
    const { createBattle } = await import("@game/core/battle/reducer")
    const { makeUnit } = await import("./helpers")
    const map = generateExpedition({ seed: 3, difficulty: "normal", team: 0, squadSize: 2 })
    const squad = map.playerSpawns.slice(0, 2).map(p => makeUnit({ classId: "infantry_sword", pos: p }, false))
    const save = createEmptySave(1)
    save.battle = createBattle({ map, squad, seed: 3, now: 1 }).state
    $save.set(save)
    enterBattleScreen()
    return save.battle
  }

  afterEach(() => leaveBattleScreen())

  it("тап по клетке — весь отряд идёт туда за одно нажатие, зоны тревоги видны, конец хода недоступен", async () => {
    const st = await exploring()
    expect(st.explore).toBe(true)
    expect($battleUi.get().alertTiles.size).toBeGreaterThan(0)
    const lead = Object.values(st.units).find(u => u.side === "player")!
    const to = { x: lead.pos.x, y: lead.pos.y - 4 }
    tapTile(to)
    await flush()
    const after = $save.get().battle!
    expect(after.explore).toBe(true)
    expect(Object.values(after.units).some(u => u.side === "player" && u.pos.x === to.x && u.pos.y === to.y)).toBe(true)
    expect(Object.values(after.units).filter(u => u.side === "player").every(u => u.pos.y < lead.pos.y)).toBe(true)
    expect($battleUi.get().busy).toBe(false)
    await endTurn()
    expect($save.get().battle!.phase).toBe("player")
    expect($save.get().battle!.turn).toBe(st.turn)
  })

  it("выбранный боец идёт один; подсветки хода в разведке нет, но перетаскивать можно", async () => {
    const st = await exploring()
    const [a, b] = Object.values(st.units).filter(u => u.side === "player")
    tapTile(a!.pos)
    expect($battleUi.get().mode).toBe("unitSelected")
    const to = { x: a!.pos.x + 3, y: a!.pos.y - 2 }
    tapTile(to)
    await flush()
    const after = $save.get().battle!
    expect(after.units[a!.unitId]!.pos).toEqual(to)
    expect(after.units[b!.unitId]!.pos).toEqual(b!.pos)
  })

  it("путь в лагерь — отряд встаёт перед зоной тревоги, и начинается пошаговый бой", async () => {
    const st = await exploring()
    tapTile(st.map.expedition!.chests[0]!.pos)
    await flush()
    const after = $save.get().battle!
    expect(after.explore).toBe(false)
    expect(after.phase).toBe("player")
    // Теперь — обычный бой: выбранному бойцу видна его дальность
    const p = Object.values(after.units).find(u => u.side === "player" && u.alive)!
    tapTile(p.pos)
    expect($battleUi.get().reach?.size).toBeLessThan(60)
  })
})
