import { describe, expect, it } from "vitest"
import { applyAction, createBattle, xpForCombat, xpForHeal } from "@game/core/battle/reducer"
import { nextEnemyAction } from "@game/core/ai"
import { attackOptions, reachableTiles } from "@game/core/map/pathing"
import { generateMap } from "@game/core/map/generate"
import { generateRoster } from "@game/core/units"
import type { BattleState, Difficulty } from "@game/core/types"
import { livingUnits } from "@game/core/battle/query"
import { makeBattle, makeUnit, plainTiles } from "./helpers"
import { KILLER_FLAG, terrainAt } from "@game/core/battle/query"
import { posKey, type SaveGame, type UnitInstance } from "@game/core/types"
import { createEmptySave } from "@game/core/save"
import { resolveBattle } from "@game/core/progression"
import { planAssist } from "@game/core/battle/assist"
import { BATTLE, COMBAT } from "@game/content/balance"
import { simulateCombat } from "@game/core/combat"
import { healPower, weaponMt } from "@game/core/units"
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
      [{ classId: "infantry_sword", pos: { x: 2, y: 2 }, baseStats: flat, stance: "hold" }]
    )
    const id = b.players[0]!.id
    let s = applyAction(b.state, { type: "move", unitId: id, to: { x: 2, y: 4 } }).state
    expect(s.units[id]!.pos).toEqual({ x: 2, y: 4 })
    expect(s.units[id]!.acted).toBe(false)
    expect(s.units[id]!.turnStart).toEqual({ x: 2, y: 7 })
    // Ход пехоты — 3 клетки от (2,7): к врагу на (2,3) уже не подойти, хоть от (2,4) это одна клетка
    expect(() => applyAction(s, { type: "move", unitId: id, to: { x: 2, y: 3 } })).toThrow()
    expect(() =>
      applyAction(s, { type: "attack", unitId: id, to: { x: 2, y: 3 }, targetId: b.enemies[0]!.id })
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
        { classId: "infantry_whiteMagic", pos: { x: 2, y: 7 }, baseStats: { ...flat, mag: 2 } },
        { classId: "infantry_sword", pos: { x: 3, y: 7 }, baseStats: { ...flat, hp: 40 } }
      ],
      [{ classId: "infantry_sword", pos: { x: 2, y: 0 } }]
    )
    const healer = b.players[0]!.id
    const ally = b.players[1]!.id
    b.state.units[ally]!.hp = 5
    const heal = 5 + healPower(b.players[0]!)
    const { state, events } = applyAction(b.state, {
      type: "assist",
      unitId: healer,
      to: { x: 2, y: 7 },
      targetId: ally
    })
    expect(state.units[ally]!.hp).toBe(5 + heal)
    expect(events.some(e => e.type === "assist" && e.heal === heal)).toBe(true)
    // опыт за лечение — по вылеченному HP
    expect(events.find(e => e.type === "xp" && e.unitId === healer)).toMatchObject({ amount: xpForHeal(heal) })
  })

  it("лечение = база умения + Mag лекаря + Mt посоха (заточка лечит сильнее)", () => {
    const heal = (mag: number, weaponTier: 0 | 1 = 0): number => {
      const b = makeBattle(
        [
          { classId: "infantry_whiteMagic", pos: { x: 2, y: 7 }, baseStats: { ...flat, mag }, weaponTier },
          { classId: "infantry_sword", pos: { x: 3, y: 7 }, baseStats: { ...flat, hp: 90 } }
        ],
        [{ classId: "infantry_sword", pos: { x: 2, y: 0 } }]
      )
      b.state.units[b.players[1]!.id]!.hp = 1
      return planAssist(b.state, b.players[0]!.id, { x: 2, y: 7 }, b.players[1]!.id).heal
    }
    const mt = weaponMt(makeBattle([{ classId: "infantry_whiteMagic", pos: { x: 2, y: 7 }, baseStats: flat }], []).players[0]!)
    expect(heal(10)).toBe(5 + 10 + mt)
    expect(heal(20) - heal(10)).toBe(10)
    expect(heal(10, 1) - heal(10)).toBe(COMBAT.weaponTierMt)
  })

  it("удар, не пробивающий защиту, всё равно ранит на 1 (минимальный урон) и даёт опыт за попадание", () => {
    const weak = makeBattle(
      [{ classId: "infantry_sword", pos: { x: 2, y: 4 }, level: 10, baseStats: { ...flat, str: 1, mag: 1 } }],
      [{ classId: "infantry_sword", pos: { x: 2, y: 3 }, level: 10, baseStats: { ...flat, hp: 40, def: 60, str: 1, mag: 1 } }]
    )
    const id = weak.players[0]!.id
    const out = simulateCombat(weak.state, id, weak.enemies[0]!.id, { x: 2, y: 4 })
    expect(out.strikes[0]!.damage).toBe(COMBAT.minDamage)
    const r = applyAction(weak.state, { type: "attack", unitId: id, to: { x: 2, y: 4 }, targetId: weak.enemies[0]!.id })
    expect(r.events.find(e => e.type === "xp" && e.unitId === id)).toMatchObject({ amount: xpForCombat(10, 10, "hit") })
  })

  it("по лимиту ходов отряд отступает: живые бойцы целы, исход — отступление", () => {
    const b = makeBattle(
      [{ classId: "infantry_sword", pos: { x: 2, y: 7 }, baseStats: flat }],
      [{ classId: "infantry_sword", pos: { x: 2, y: 0 }, baseStats: flat, stance: "hold" }]
    )
    let s = b.state
    s.turn = BATTLE.turnLimit
    s = applyAction(s, { type: "endPhase" }).state // фаза врага последнего хода
    expect(s.result).toBeUndefined()
    const end = applyAction(s, { type: "endPhase" })
    expect(end.state.result).toBe("retreat")
    expect(end.state.timeUp).toBe(true)
    expect(end.events.some(e => e.type === "battleEnded" && e.result === "retreat")).toBe(true)
    expect(end.state.units[b.players[0]!.id]!.alive).toBe(true)
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
  it("лечение: больше вылечил — больше опыта", () => {
    expect(xpForHeal(10)).toBe(15)
    expect(xpForHeal(20)).toBeGreaterThan(xpForHeal(10))
    expect(xpForHeal(200)).toBe(25)
  })
})

describe("Поддержки: перемещения и HP", () => {
  /** Боец с Поддержкой `assist` на (2,5), союзник на (2,4) — направление «вверх». */
  const pair = (assist: string, opts: { blocker?: { x: number, y: number } } = {}) => {
    const b = makeBattle(
      [
        { classId: "infantry_sword", pos: { x: 2, y: 5 }, baseStats: { ...flat, hp: 40 }, skills: { assist } },
        { classId: "infantry_sword", pos: { x: 2, y: 4 }, baseStats: { ...flat, hp: 40 } }
      ],
      [{ classId: "infantry_sword", pos: opts.blocker ?? { x: 5, y: 0 }, stance: "hold" }]
    )
    const self = b.players[0]!.id
    const ally = b.players[1]!.id
    const run = (st = b.state) => applyAction(st, { type: "assist", unitId: self, to: { x: 2, y: 5 }, targetId: ally })
    return { b, self, ally, run }
  }

  it("Перестановка ставит союзника на клетку позади бойца", () => {
    const { self, ally, run } = pair("as_reposition")
    const { state } = run()
    expect(state.units[ally]!.pos).toEqual({ x: 2, y: 6 })
    expect(state.units[self]!.pos).toEqual({ x: 2, y: 5 })
  })

  it("Оттащить: боец отступает на клетку, союзник встаёт на его место", () => {
    const { self, ally, run } = pair("as_drawback")
    const { state } = run()
    expect(state.units[self]!.pos).toEqual({ x: 2, y: 6 })
    expect(state.units[ally]!.pos).toEqual({ x: 2, y: 5 })
  })

  it("Пируэт переносит бойца за союзника", () => {
    const { self, ally, run } = pair("as_pivot")
    const { state } = run()
    expect(state.units[self]!.pos).toEqual({ x: 2, y: 3 })
    expect(state.units[ally]!.pos).toEqual({ x: 2, y: 4 })
  })

  it("Толкнуть сдвигает союзника на 1, Пнуть — на 2; занятая клетка на пути — Поддержка невозможна", () => {
    const shove = pair("as_shove")
    expect(shove.run().state.units[shove.ally]!.pos).toEqual({ x: 2, y: 3 })
    const smite = pair("as_smite")
    expect(smite.run().state.units[smite.ally]!.pos).toEqual({ x: 2, y: 2 })
    const blocked = pair("as_smite", { blocker: { x: 2, y: 3 } })
    expect(planAssist(blocked.b.state, blocked.self, { x: 2, y: 5 }, blocked.ally).valid).toBe(false)
    expect(() => blocked.run()).toThrow()
  })

  it("Отдать вкусняшку: −10 HP себе, +10 союзнику; при HP ≤ 10 — нельзя", () => {
    const { b, self, ally, run } = pair("as_ardent")
    b.state.units[ally]!.hp = 20
    const { state, events } = run()
    expect(state.units[self]!.hp).toBe(30)
    expect(state.units[ally]!.hp).toBe(30)
    expect(events.find(e => e.type === "assist")).toMatchObject({ heal: 10, unitHpAfter: 30, targetHpAfter: 30 })
    b.state.units[self]!.hp = 10
    expect(planAssist(b.state, self, { x: 2, y: 5 }, ally).valid).toBe(false)
  })

  it("Поменяться шкурой (v1.1, движок) обменивает HP в пределах максимума", () => {
    const { b, self, ally } = pair("as_reciprocal")
    b.state.units[self]!.hp = 35
    b.state.units[ally]!.hp = 8
    const plan = planAssist(b.state, self, { x: 2, y: 5 }, ally)
    expect(plan.valid).toBe(true)
    expect(plan.selfHpDelta).toBe(8 - 35)
    expect(plan.targetHpDelta).toBe(35 - 8)
    b.state.units[self]!.hp = 8
    expect(planAssist(b.state, self, { x: 2, y: 5 }, ally).valid).toBe(false)
  })

  it("союзник, сдвинутый Поддержкой в чаще, подбирает ключ и сердечко на новой клетке", () => {
    const { b, ally, run } = pair("as_shove")
    const at = { x: 2, y: 3 }
    b.state.map.expedition = { chests: [], exits: [], pickups: [], elites: [] }
    b.state.expedition = {
      keys: { c1: { pos: at } },
      opened: [],
      pickups: [{ id: "h1", pos: at, kind: "heart" }],
      buffs: { team: [], units: {} },
      found: []
    }
    b.state.units[ally]!.hp = 10
    const { state, events } = run()
    expect(state.expedition!.keys["c1"]).toEqual({ unitId: ally })
    expect(state.units[ally]!.hp).toBe(state.units[ally]!.maxHp)
    expect(events.some(e => e.type === "keyTaken" && e.unitId === ally)).toBe(true)
    expect(events.some(e => e.type === "pickup" && e.unitId === ally)).toBe(true)
  })
})

describe("лечащие спецприёмы", () => {
  const healers = (special: string) => {
    const b = makeBattle(
      [
        { classId: "infantry_whiteMagic", pos: { x: 2, y: 7 }, baseStats: flat, skills: { special } },
        { classId: "infantry_sword", pos: { x: 3, y: 7 }, baseStats: { ...flat, hp: 90 } },
        { classId: "infantry_sword", pos: { x: 0, y: 5 }, baseStats: { ...flat, hp: 90 } }
      ],
      [{ classId: "infantry_sword", pos: { x: 5, y: 0 }, stance: "hold" }]
    )
    const [h, t, o] = b.players.map(u => u.id) as [string, string, string]
    b.state.units[h]!.specialCd = 0
    b.state.units[t]!.hp = 1
    b.state.units[o]!.hp = 50
    return { b, h, t, o }
  }

  it("Мурчание исцеления добавляет +10 к лечению и уходит на перезарядку", () => {
    const { b, h, t } = healers("sp_imbue")
    const plan = planAssist(b.state, h, { x: 2, y: 7 }, t)
    expect(plan.specialTriggered).toBe(true)
    expect(plan.heal).toBe(5 + healPower(b.players[0]!) + 10)
    const { state } = applyAction(b.state, { type: "assist", unitId: h, to: { x: 2, y: 7 }, targetId: t })
    expect(state.units[t]!.hp).toBe(1 + plan.heal)
    expect(state.units[h]!.specialCd).toBe(1)
  })

  it("Общий лай лечит остальных союзников на 10 — с событием на каждого — и даёт опыт за всё вылеченное", () => {
    const { b, h, t, o } = healers("sp_heavenly")
    const { state, events } = applyAction(b.state, { type: "assist", unitId: h, to: { x: 2, y: 7 }, targetId: t })
    expect(state.units[o]!.hp).toBe(60)
    const ev = events.find(e => e.type === "effect" && e.effect.unitId === o)
    expect(ev).toMatchObject({ effect: { type: "heal", amount: 10, sourceId: h }, hpAfter: 60 })
    const heal = (events.find(e => e.type === "assist") as { heal: number }).heal
    expect(events.find(e => e.type === "xp" && e.unitId === h)).toMatchObject({ amount: xpForHeal(heal + 10) })
  })
})

describe("стены, подкрепления, стойки, счёт ходов", () => {
  it("attackWall: два удара ломают стену, клетка становится проходимой; стена вне дальности — ошибка", () => {
    const b = makeBattle(
      [{ classId: "infantry_sword", pos: { x: 2, y: 5 }, baseStats: flat }],
      [{ classId: "infantry_sword", pos: { x: 5, y: 0 }, stance: "hold" }],
      { tiles: plainTiles({ "2,3": "wall_breakable" }) }
    )
    const id = b.players[0]!.id
    const wall = { x: 2, y: 3 }
    expect(b.state.walls[posKey(wall)]).toBe(BATTLE.wallHp)
    expect(() => applyAction(b.state, { type: "attackWall", unitId: id, to: { x: 2, y: 5 }, wall })).toThrow()
    let r = applyAction(b.state, { type: "attackWall", unitId: id, to: { x: 2, y: 4 }, wall })
    expect(r.events.find(e => e.type === "wallHit")).toMatchObject({ hpAfter: 1 })
    expect(r.state.units[id]!.acted).toBe(true)
    expect(terrainAt(r.state, wall)).toBe("wall_breakable")
    const s = applyAction(applyAction(r.state, { type: "endPhase" }).state, { type: "endPhase" }).state
    r = applyAction(s, { type: "attackWall", unitId: id, to: { x: 2, y: 4 }, wall })
    expect(r.state.walls[posKey(wall)]).toBe(0)
    expect(terrainAt(r.state, wall)).toBe("plain")
  })

  it("подкрепление на занятой клетке встаёт на ближайшую свободную проходимую (поиск в ширину)", () => {
    const wave = makeUnit({ classId: "infantry_sword", pos: { x: 2, y: 0 } }, true)
    const b = makeBattle(
      [
        { classId: "infantry_sword", pos: { x: 2, y: 0 } },
        { classId: "infantry_sword", pos: { x: 1, y: 0 } },
        { classId: "infantry_sword", pos: { x: 3, y: 0 } },
        { classId: "infantry_sword", pos: { x: 2, y: 1 } }
      ],
      [{ classId: "infantry_sword", pos: { x: 5, y: 7 }, stance: "hold" }],
      { reinforcements: [{ turn: 1, units: [{ unit: wave, pos: { x: 2, y: 0 } }] }] }
    )
    const { state, events } = applyAction(b.state, { type: "endPhase" })
    expect(state.units[wave.id]?.pos).toEqual({ x: 4, y: 0 })
    expect(events.some(e => e.type === "reinforcements" && e.unitIds.includes(wave.id))).toBe(true)
  })

  it("враг из guard, чья цель выжила, переходит в наступление; добил — стойка из действия", () => {
    const duel = (playerHp: number) => {
      const b = makeBattle(
        [{ classId: "infantry_sword", pos: { x: 2, y: 4 }, baseStats: { ...flat, hp: 90 } }],
        [{ classId: "infantry_sword", pos: { x: 2, y: 3 }, baseStats: { ...flat, hp: 90, str: 20 }, stance: "guard" }]
      )
      b.state.phase = "enemy"
      b.state.units[b.players[0]!.id]!.hp = playerHp
      const e = b.enemies[0]!.id
      const r = applyAction(b.state, { type: "attack", unitId: e, to: { x: 2, y: 3 }, targetId: b.players[0]!.id, newStance: "guard" })
      return r.state.units[e]!.stance
    }
    expect(duel(90)).toBe("advance")
    expect(duel(1)).toBe("guard")
  })

  it("stats.turns считает текущий ход с первого", () => {
    const b = makeBattle(
      [{ classId: "infantry_sword", pos: { x: 2, y: 7 } }],
      [{ classId: "infantry_sword", pos: { x: 2, y: 0 }, stance: "hold" }]
    )
    expect(b.state.stats.turns).toBe(1)
    const s = applyAction(applyAction(b.state, { type: "endPhase" }).state, { type: "endPhase" }).state
    expect(s.stats.turns).toBe(2)
  })

  it("павший помнит убийцу: Мемориал называет его, а не ближайшего (тем более мёртвого) врага", () => {
    const b = makeBattle(
      [{ classId: "infantry_sword", pos: { x: 2, y: 4 }, baseStats: flat }],
      [
        { classId: "infantry_bow", pos: { x: 2, y: 2 }, baseStats: { ...flat, str: 40 } },
        { classId: "infantry_sword", pos: { x: 3, y: 4 }, baseStats: flat, stance: "hold" }
      ]
    )
    const p = b.players[0]!
    const [archer, near] = b.enemies as [UnitInstance, UnitInstance]
    b.state.phase = "enemy"
    const { state } = applyAction(b.state, { type: "attack", unitId: archer.id, to: { x: 2, y: 2 }, targetId: p.id })
    expect(state.units[p.id]!.alive).toBe(false)
    expect(state.units[p.id]!.flags[`${KILLER_FLAG}${archer.id}`]).toBe(1)
    const save: SaveGame = {
      ...createEmptySave(1),
      army: { id: "a", units: b.players, squadIds: [p.id], createdAt: 1, battles: 0, wins: 0 }
    }
    const done = { ...state, result: "defeat" as const }
    expect(resolveBattle(save, done, 5000).memorial.at(-1)?.killerName).toBe(archer.name)
    // Без отметки — ближайший живой враг: мёртвый сосед не в счёт
    const legacy = structuredClone(done)
    legacy.units[p.id]!.flags = {}
    legacy.units[near.id]!.alive = false
    expect(resolveBattle(save, legacy, 5000).memorial.at(-1)?.killerName).toBe(archer.name)
  })
})
