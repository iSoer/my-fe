import { describe, expect, it } from "vitest"
import { applyAction, createBattle, xpForCombat, xpForHeal } from "@game/core/battle/reducer"
import { nextEnemyAction } from "@game/core/ai"
import { attackOptions, reachableTiles } from "@game/core/map/pathing"
import { generateMap } from "@game/core/map/generate"
import { generateRoster } from "@game/core/units"
import type { BattleState, Difficulty } from "@game/core/types"
import { livingUnits } from "@game/core/battle/query"
import { makeBattle } from "./helpers"
import { BIOMES } from "@game/content/biomes"

const flat = { hp: 20, str: 10, mag: 10, spd: 5, def: 5, res: 5 }

describe("редьюсер боя", () => {
  it("wait перемещает и помечает юнита; второй раз действовать нельзя", () => {
    const b = makeBattle(
      [{ classId: "infantry_sword", pos: { x: 2, y: 7 } }],
      [{ classId: "infantry_sword", pos: { x: 2, y: 0 } }]
    )
    const id = b.players[0]!.id
    const { state, events } = applyAction(b.state, { type: "wait", unitId: id, to: { x: 2, y: 5 } })
    expect(state.units[id]!.pos).toEqual({ x: 2, y: 5 })
    expect(state.units[id]!.acted).toBe(true)
    expect(events.map(e => e.type)).toEqual(["moved", "waited"])
    expect(() => applyAction(state, { type: "wait", unitId: id, to: { x: 2, y: 5 } })).toThrow()
  })

  it("move переставляет бойца без завершения хода; дальность — от клетки начала хода", () => {
    const b = makeBattle(
      [{ classId: "infantry_sword", pos: { x: 2, y: 7 }, baseStats: flat }],
      [{ classId: "infantry_sword", pos: { x: 2, y: 3 }, baseStats: flat, stance: "hold" }]
    )
    const id = b.players[0]!.id
    let s = applyAction(b.state, { type: "move", unitId: id, to: { x: 2, y: 5 } }).state
    expect(s.units[id]!.pos).toEqual({ x: 2, y: 5 })
    expect(s.units[id]!.acted).toBe(false)
    expect(s.units[id]!.turnStart).toEqual({ x: 2, y: 7 })
    // Ход пехоты — 2 клетки от (2,7): к врагу на (2,4) уже не подойти, хоть от (2,5) это одна клетка
    expect(() => applyAction(s, { type: "move", unitId: id, to: { x: 2, y: 4 } })).toThrow()
    expect(() =>
      applyAction(s, { type: "attack", unitId: id, to: { x: 2, y: 4 }, targetId: b.enemies[0]!.id })
    ).toThrow()
    // Переставиться ещё раз и вернуться на исходную клетку можно
    s = applyAction(s, { type: "move", unitId: id, to: { x: 1, y: 6 } }).state
    const back = applyAction(s, { type: "move", unitId: id, to: { x: 2, y: 7 } })
    // Путь анимации — от клетки, где боец стоит сейчас
    const moved = back.events[0]
    expect(moved?.type === "moved" && moved.path.length).toBe(3)
    expect(moved?.type === "moved" && moved.path[0]).toEqual({ x: 1, y: 6 })
    expect(back.state.units[id]!.turnStart).toBeUndefined()
    // Действие завершает ход и сбрасывает клетку начала хода
    const waited = applyAction(s, { type: "wait", unitId: id, to: { x: 1, y: 6 } }).state
    expect(waited.units[id]!.acted).toBe(true)
    expect(waited.units[id]!.turnStart).toBeUndefined()
    // Конец фазы: не действовавший боец остаётся на месте, клетка начала хода забыта
    const ended = applyAction(s, { type: "endPhase" }).state
    expect(ended.units[id]!.pos).toEqual({ x: 1, y: 6 })
    expect(ended.units[id]!.turnStart).toBeUndefined()
    // исходное состояние не мутировано
    expect(b.state.units[id]!.pos).toEqual({ x: 2, y: 7 })
  })

  it("endPhase переключает фазу, снимает бонусы и начинает новый ход", () => {
    const b = makeBattle(
      [
        { classId: "infantry_sword", pos: { x: 2, y: 7 }, skills: { c: "c_hone_atk" } },
        { classId: "infantry_sword", pos: { x: 3, y: 7 } }
      ],
      [{ classId: "infantry_sword", pos: { x: 2, y: 0 }, stance: "hold" }]
    )
    // Вой атаки сработал при старте: сосед получил +4
    expect(b.state.units[b.players[1]!.id]!.bonuses.str).toBe(4)
    const s1 = applyAction(b.state, { type: "endPhase" }).state
    expect(s1.phase).toBe("enemy")
    const s2 = applyAction(s1, { type: "endPhase" }).state
    expect(s2.phase).toBe("player")
    expect(s2.turn).toBe(2)
    expect(s2.units[b.players[0]!.id]!.acted).toBe(false)
  })

  it("лечение Бинтом восстанавливает HP и даёт XP", () => {
    const b = makeBattle(
      [
        { classId: "infantry_whiteMagic", pos: { x: 2, y: 7 }, baseStats: flat },
        { classId: "infantry_sword", pos: { x: 3, y: 7 }, baseStats: flat }
      ],
      [{ classId: "infantry_sword", pos: { x: 2, y: 0 } }]
    )
    const healer = b.players[0]!.id
    const ally = b.players[1]!.id
    b.state.units[ally]!.hp = 5
    const { state, events } = applyAction(b.state, {
      type: "assist",
      unitId: healer,
      to: { x: 2, y: 7 },
      targetId: ally
    })
    expect(state.units[ally]!.hp).toBe(10)
    expect(events.some(e => e.type === "assist" && e.heal === 5)).toBe(true)
    // опыт за лечение — по вылеченному HP
    expect(events.find(e => e.type === "xp" && e.unitId === healer)).toMatchObject({ amount: xpForHeal(5) })
  })

  it("удар без урона даёт 1 опыта, удар с уроном — по разнице уровней", () => {
    const weak = makeBattle(
      [{ classId: "infantry_sword", pos: { x: 2, y: 4 }, level: 10, baseStats: { ...flat, str: 0, mag: 0 } }],
      [{ classId: "infantry_sword", pos: { x: 2, y: 3 }, level: 10, baseStats: { ...flat, def: 30, str: 0, mag: 0 } }]
    )
    const id = weak.players[0]!.id
    const r = applyAction(weak.state, { type: "attack", unitId: id, to: { x: 2, y: 4 }, targetId: weak.enemies[0]!.id })
    expect(r.events.find(e => e.type === "xp" && e.unitId === id)).toMatchObject({ amount: 1 })
  })

  it("Поменяться меняет позиции", () => {
    const b = makeBattle(
      [
        { classId: "infantry_sword", pos: { x: 2, y: 7 }, skills: { assist: "as_swap" } },
        { classId: "infantry_sword", pos: { x: 3, y: 7 } }
      ],
      [{ classId: "infantry_sword", pos: { x: 2, y: 0 } }]
    )
    const a = b.players[0]!.id
    const c = b.players[1]!.id
    const { state } = applyAction(b.state, { type: "assist", unitId: a, to: { x: 2, y: 7 }, targetId: c })
    expect(state.units[a]!.pos).toEqual({ x: 3, y: 7 })
    expect(state.units[c]!.pos).toEqual({ x: 2, y: 7 })
  })

  it("гибель всех бойцов — поражение; отступление — retreat", () => {
    const b = makeBattle(
      [{ classId: "infantry_sword", pos: { x: 2, y: 4 }, baseStats: { ...flat, hp: 10, def: 0 } }],
      [{ classId: "infantry_sword", pos: { x: 2, y: 3 }, baseStats: { ...flat, str: 50, mag: 50 } }]
    )
    const { state } = applyAction(b.state, {
      type: "attack",
      unitId: b.players[0]!.id,
      to: { x: 2, y: 4 },
      targetId: b.enemies[0]!.id
    })
    expect(state.result).toBe("defeat")
    const r = applyAction(b.state, { type: "retreat" })
    expect(r.state.result).toBe("retreat")
  })

  it("подкрепления появляются в заданный ход, победа только после них", () => {
    const b = makeBattle(
      [{ classId: "infantry_sword", pos: { x: 2, y: 4 }, baseStats: { ...flat, str: 50, mag: 50 } }],
      [{ classId: "infantry_sword", pos: { x: 2, y: 3 }, baseStats: { ...flat, hp: 5 } }],
      { reinforcements: [{ turn: 2, units: [{ unit: makeBattleUnitForWave(), pos: { x: 0, y: 0 } }] }] }
    )
    let s = applyAction(b.state, {
      type: "attack",
      unitId: b.players[0]!.id,
      to: { x: 2, y: 4 },
      targetId: b.enemies[0]!.id
    }).state
    expect(s.result).toBeUndefined()
    s = applyAction(s, { type: "endPhase" }).state // → enemy, ход 1
    s = applyAction(s, { type: "endPhase" }).state // → player, ход 2
    s = applyAction(s, { type: "endPhase" }).state // → enemy, ход 2 → спавн
    expect(s.spawnedWaves).toContain(2)
    expect(livingUnits(s, "enemy").length).toBe(1)
  })

  it("боевые бонусы (Шерсть к шерсти) не ломают статы", () => {
    const b = makeBattle(
      [
        {
          classId: "infantry_sword",
          pos: { x: 2, y: 4 },
          baseStats: flat,
          skills: { c: "c_spur_atk" }
        },
        { classId: "infantry_sword", pos: { x: 3, y: 4 }, baseStats: flat }
      ],
      [
        {
          classId: "infantry_sword",
          pos: { x: 2, y: 3 },
          baseStats: { ...flat, hp: 40 },
          species: "dog"
        }
      ]
    )
    const p = b.players[1]!.id
    const { state } = applyAction(b.state, {
      type: "attack",
      unitId: b.players[0]!.id,
      to: { x: 2, y: 4 },
      targetId: b.enemies[0]!.id
    })
    for (const u of Object.values(state.units)) expect(Number.isInteger(u.hp)).toBe(true)
    const r2 = applyAction(state, { type: "attack", unitId: p, to: { x: 3, y: 3 }, targetId: b.enemies[0]!.id })
    for (const u of Object.values(r2.state.units)) expect(Number.isInteger(u.hp)).toBe(true)
    // Шерсть к шерсти соседа даёт +3 Atk второму бойцу
    const enemy = r2.state.units[b.enemies[0]!.id]!
    expect(enemy.hp).toBeLessThan(40)
  })

  it("повышение уровня в бою увеличивает maxHp", () => {
    const b = makeBattle(
      [{ classId: "infantry_sword", pos: { x: 2, y: 4 }, level: 1, baseStats: { ...flat, str: 50, mag: 50 } }],
      [{ classId: "infantry_sword", pos: { x: 2, y: 3 }, level: 20, baseStats: { ...flat, hp: 5 } }]
    )
    const id = b.players[0]!.id
    b.state.roster[id] = { ...b.state.roster[id]!, xp: 50 }
    const { state, events } = applyAction(b.state, {
      type: "attack",
      unitId: id,
      to: { x: 2, y: 4 },
      targetId: b.enemies[0]!.id
    })
    expect(state.roster[id]!.level).toBeGreaterThan(1)
    expect(state.units[id]!.maxHp).toBeGreaterThanOrEqual(b.state.units[id]!.maxHp)
    expect(events.some(e => e.type === "levelUp")).toBe(true)
  })
})

function makeBattleUnitForWave() {
  return makeBattle(
    [{ classId: "infantry_sword", pos: { x: 0, y: 7 } }],
    [{ classId: "infantry_sword", pos: { x: 5, y: 0 } }]
  ).enemies[0]!
}

/** Полная симуляция: игрок — простой бот (атакует, если может, иначе ждёт), враг — ИИ. */
function autoPlay(initial: BattleState, maxTurns = 30): BattleState {
  let s = initial
  let guard = 0
  while (!s.result && s.turn <= maxTurns && guard++ < 2000) {
    if (s.phase === "player") {
      const u = livingUnits(s, "player").find(x => !x.acted)
      if (!u) {
        s = applyAction(s, { type: "endPhase" }).state
        continue
      }
      const reach = reachableTiles(s, u)
      const opts = attackOptions(s, u, reach)
      if (opts.length > 0) {
        const o = opts[0]!
        s = applyAction(s, { type: "attack", unitId: u.unitId, to: o.from, targetId: o.targetId }).state
      }
      else {
        // идти вверх
        const tiles = [...reach.values()].filter(n => n.canStop).sort((a, b) => a.pos.y - b.pos.y)
        s = applyAction(s, { type: "wait", unitId: u.unitId, to: tiles[0]?.pos ?? u.pos }).state
      }
    }
    else {
      const a = nextEnemyAction(s)
      s = applyAction(s, a).state
    }
  }
  return s
}

describe("полные бои: ИИ не падает и бой завершается", () => {
  const diffs: Difficulty[] = ["easy", "normal", "hard", "nightmare"]
  for (const d of diffs) {
    it(`сложность ${d}`, () => {
      for (let i = 0; i < 6; i++) {
        const seed = 1000 + i * 17 + d.length
        const roster = generateRoster({ seed, glory: 0 })
        const squad = roster.slice(0, 4).map(u => ({ ...u, level: 10 }))
        const map = generateMap({
          seed,
          biomeId: BIOMES[i % BIOMES.length]!.id,
          difficulty: d,
          team: 1,
          squadSize: 4
        })
        const { state } = createBattle({ map, squad, seed, now: 1 })
        const end = autoPlay(state, 40)
        expect(["victory", "defeat", undefined]).toContain(end.result)
        expect(end.turn).toBeLessThanOrEqual(41)
        // мёртвые не воскресают, HP всегда конечные целые в [0, maxHp]
        for (const u of Object.values(end.units)) {
          if (!u.alive) expect(u.hp).toBe(0)
          expect(Number.isInteger(u.hp)).toBe(true)
          expect(Number.isInteger(u.maxHp)).toBe(true)
          expect(u.hp).toBeGreaterThanOrEqual(0)
          expect(u.hp).toBeLessThanOrEqual(u.maxHp)
        }
      }
    })
  }
})

describe("опыт как в Fire Emblem", () => {
  it("урон — по разнице уровней, без урона — 1, добивание — больше всего, вожак — ещё больше", () => {
    const hit = xpForCombat(10, 10, "hit")
    const kill = xpForCombat(10, 10, "kill")
    expect(xpForCombat(10, 10, "none")).toBe(1)
    expect(hit).toBe(20)
    expect(kill).toBe(50)
    expect(kill).toBeGreaterThan(hit * 2)
    expect(xpForCombat(10, 10, "kill", true)).toBe(70)
    expect(xpForCombat(10, 14, "hit")).toBeGreaterThan(hit)
    expect(xpForCombat(13, 10, "hit")).toBeLessThan(hit)
    expect(xpForCombat(13, 10, "kill")).toBeLessThan(kill)
    // намного сильнее врага — почти ничего, но не меньше 1
    expect(xpForCombat(40, 5, "kill")).toBe(1)
    for (let gap = 0; gap < 40; gap++) expect(xpForCombat(10 + gap, 10, "kill")).toBeGreaterThanOrEqual(1)
  })
  it("лечение: больше вылечил — больше опыта; предметом — вдвое меньше", () => {
    expect(xpForHeal(10)).toBe(15)
    expect(xpForHeal(20)).toBeGreaterThan(xpForHeal(10))
    expect(xpForHeal(200)).toBe(25)
    expect(xpForHeal(10, true)).toBe(8)
    expect(xpForHeal(1, true)).toBeGreaterThanOrEqual(3)
  })
})
