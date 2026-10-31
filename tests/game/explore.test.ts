import { describe, expect, it } from "vitest"
import { generateExpedition } from "@game/core/map/expedition"
import { generateMap } from "@game/core/map/generate"
import { applyAction, chestToOpen, createBattle } from "@game/core/battle/reducer"
import { alertZone, isAsleep, isCalm, isRevealed } from "@game/core/battle/explore"
import { decideAction, nextEnemyAction } from "@game/core/ai"
import { MIGRATIONS, SAVE_VERSION, createEmptySave, parseSave, serializeSave } from "@game/core/save"
import { isPassable, reachableTiles } from "@game/core/map/pathing"
import { EXPEDITION } from "@game/content/balance"
import { terrainAt } from "@game/core/battle/query"
import { unitClass } from "@game/content/classes"
import { mapSize, manhattan, posKey, samePos, type BattleState, type Difficulty, type Pos } from "@game/core/types"
import { makeUnit } from "./helpers"

const CLASSES = ["infantry_sword", "infantry_spear", "cavalry_sword", "flier_sword", "infantry_bow", "armored_sword"] as const

function expedition(seed: number, difficulty: Difficulty = "normal", squad = 4): BattleState {
  const map = generateExpedition({ seed, difficulty, team: seed % 4, squadSize: squad })
  const units = map.playerSpawns.slice(0, squad).map((p, i) => makeUnit({ classId: CLASSES[i % CLASSES.length]!, pos: p, level: 5 }, false))
  return createBattle({ map, squad: units, seed, now: 1 }).state
}

const players = (s: BattleState) => Object.values(s.units).filter(u => u.side === "player" && u.alive)

/** Свободная проходимая клетка вне зоны тревоги, дальняя от отряда (по пути пехоты). */
function farSafeTile(s: BattleState): Pos {
  const lead = players(s)[0]!
  const zone = alertZone(s)
  const reach = reachableTiles(s, lead, lead.pos, 900, zone)
  return [...reach.values()].filter(n => n.canStop).sort((a, b) => b.cost - a.cost)[0]!.pos
}

/** Проиграть фазу врага до фазы игрока (или разведки). */
function enemyPhase(s0: BattleState): { state: BattleState, events: string[] } {
  let s = applyAction(s0, { type: "endPhase" }).state
  const events: string[] = []
  for (let guard = 0; s.phase === "enemy" && !s.result && guard < 300; guard++) {
    const r = applyAction(s, nextEnemyAction(s))
    events.push(...r.events.map(e => e.type))
    s = r.state
  }
  return { state: s, events }
}

describe("чаща: разведка до зоны тревоги", () => {
  it("вылазка начинается с разведки; в обычной схватке разведки нет", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = expedition(seed)
      expect(s.explore).toBe(true)
      expect(isCalm(s)).toBe(true)
    }
    const map = generateMap({ seed: 1, biomeId: "yard", difficulty: "easy", team: 0, squadSize: 4 })
    const units = map.playerSpawns.slice(0, 4).map(p => makeUnit({ classId: "infantry_sword", pos: p }, false))
    const sk = createBattle({ map, squad: units, seed: 1, now: 1 }).state
    expect(sk.explore).toBeUndefined()
    const lead = players(sk)[0]!
    expect(() => applyAction(sk, { type: "explore", unitId: lead.unitId, to: { x: 0, y: 0 } })).toThrow()
  })

  it("отряд проходит далеко за одно действие, строем, вне зон; ход не тратится", () => {
    for (const seed of [1, 7, 11, 23]) {
      const s = expedition(seed, "hard", 6)
      const to = farSafeTile(s)
      const lead = players(s)[0]!
      expect(manhattan(lead.pos, to)).toBeGreaterThan(6)
      const r = applyAction(s, { type: "explore", unitId: lead.unitId, to })
      expect(r.state.explore).toBe(true)
      expect(r.state.turn).toBe(s.turn)
      expect(r.state.phase).toBe("player")
      expect(r.state.units[lead.unitId]!.pos).toEqual(to)
      const moved = r.events.find(e => e.type === "squadMoved")
      expect(moved && moved.type === "squadMoved" && moved.moves.length).toBeGreaterThan(1)
      // Никто не встал в зону тревоги, никто не на одной клетке с другим
      const zone = alertZone(r.state)
      const ps = players(r.state)
      for (const u of ps) expect(zone.has(posKey(u.pos))).toBe(false)
      expect(new Set(Object.values(r.state.units).filter(u => u.alive).map(u => posKey(u.pos))).size)
        .toBe(Object.values(r.state.units).filter(u => u.alive).length)
      // Строй: остальные рядом с ведущим (если путь не перекрыт)
      const near = ps.filter(u => manhattan(u.pos, to) <= 3)
      expect(near.length).toBeGreaterThanOrEqual(Math.min(ps.length, 3))
      // Пути — по проходимым клеткам, шагами в соседнюю клетку
      if (moved?.type === "squadMoved") {
        for (const m of moved.moves) {
          const cls = unitClass(r.state.roster[m.unitId]!)
          for (let i = 1; i < m.path.length; i++) {
            expect(manhattan(m.path[i]!, m.path[i - 1]!)).toBe(1)
            expect(isPassable(terrainAt(r.state, m.path[i]!), cls.moveType)).toBe(true)
          }
        }
      }
    }
  })

  it("путь в лагерь обрывается перед зоной тревоги — начинается пошаговый бой, враги ещё спят", () => {
    for (const seed of [1, 2, 3, 9, 14]) {
      const s = expedition(seed)
      const chest = s.map.expedition!.chests[0]!
      const lead = players(s)[0]!
      const r = applyAction(s, { type: "explore", unitId: lead.unitId, to: chest.pos })
      expect(r.state.explore).toBe(false)
      expect(r.events.some(e => e.type === "alarm")).toBe(true)
      expect(r.state.phase).toBe("player")
      const zone = alertZone(s)
      for (const u of players(r.state)) {
        expect(zone.has(posKey(u.pos))).toBe(false)
        expect(u.acted).toBe(false)
      }
      expect(Object.values(r.state.units).filter(u => u.side === "enemy" && u.alive).every(isAsleep)).toBe(true)
      // Ведущий стоит вплотную к зоне: следующий шаг пути — уже в ней
      const lp = r.state.units[lead.unitId]!.pos
      const size = mapSize(s.map)
      const touches = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const n = { x: lp.x + dx!, y: lp.y + dy! }
        return n.x >= 0 && n.y >= 0 && n.x < size.w && n.y < size.h && zone.has(posKey(n))
      })
      expect(touches).toBe(true)
      // В бою обычные действия снова работают, разведка — нет
      expect(() => applyAction(r.state, { type: "explore", unitId: lead.unitId, to: lp })).toThrow()
    }
  })

  it("в разведке пошаговые действия и конец хода недоступны", () => {
    const s = expedition(3)
    const lead = players(s)[0]!
    expect(() => applyAction(s, { type: "move", unitId: lead.unitId, to: lead.pos })).toThrow()
    expect(() => applyAction(s, { type: "wait", unitId: lead.unitId, to: lead.pos })).toThrow()
    expect(() => applyAction(s, { type: "endPhase" })).toThrow()
    expect(applyAction(s, { type: "retreat" }).state.result).toBe("retreat")
  })

  it("бой без проснувшихся врагов кончается после хода врага — снова разведка", () => {
    const s = expedition(2)
    const lead = players(s)[0]!
    const fight = applyAction(s, { type: "explore", unitId: lead.unitId, to: s.map.expedition!.chests[0]!.pos }).state
    expect(fight.explore).toBe(false)
    const after = enemyPhase(fight)
    expect(after.state.explore).toBe(true)
    expect(after.state.phase).toBe("player")
    expect(players(after.state).every(u => !u.acted)).toBe(true)
  })

  it("пока есть проснувшийся враг, бой продолжается", () => {
    const s = expedition(2)
    const lead = players(s)[0]!
    const fight: BattleState = structuredClone(applyAction(s, { type: "explore", unitId: lead.unitId, to: s.map.expedition!.chests[0]!.pos }).state)
    // Враг рядом с отрядом проснулся и наступает
    const foe = Object.values(fight.units).filter(u => u.side === "enemy" && u.alive)
      .sort((a, b) => manhattan(a.pos, fight.units[lead.unitId]!.pos) - manhattan(b.pos, fight.units[lead.unitId]!.pos))[0]!
    foe.stance = "advance"
    delete foe.post
    const after = enemyPhase(fight)
    if (!after.state.result) {
      expect(after.state.explore).toBeFalsy()
      expect(after.events.length).toBeGreaterThan(0)
    }
  })

  it("встав на клетку в разведке, боец подбирает сердечко", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const s = expedition(seed)
      const zone = alertZone(s)
      const heart = s.expedition!.pickups.find(p => p.kind === "heart" && !zone.has(posKey(p.pos)))
      if (!heart) continue
      const lead = players(s)[0]!
      const hurt: BattleState = structuredClone(s)
      hurt.units[lead.unitId]!.hp = 1
      const r = applyAction(hurt, { type: "explore", unitId: lead.unitId, to: heart.pos, solo: true })
      if (!samePos(r.state.units[lead.unitId]!.pos, heart.pos)) continue
      expect(r.state.units[lead.unitId]!.hp).toBe(r.state.units[lead.unitId]!.maxHp)
      expect(r.state.expedition!.pickups.some(p => p.id === heart.id)).toBe(false)
      // solo — остальные не двигались
      for (const u of players(s)) if (u.unitId !== lead.unitId) expect(r.state.units[u.unitId]!.pos).toEqual(u.pos)
      return
    }
    throw new Error("не нашлось сердечка вне зон")
  })

  it("в разведке ключ общий на отряд: сундук открывает любой боец; в бою — только тот, у кого ключ", () => {
    const s: BattleState = structuredClone(expedition(4))
    // Лагерь перебит: стражей нет, ключ от сундука у первого бойца
    for (const u of Object.values(s.units)) if (u.side === "enemy") u.alive = false
    const chest = s.map.expedition!.chests[0]!
    const [a, b] = players(s)
    s.expedition!.keys[chest.id] = { unitId: a!.unitId }
    const r = applyAction(s, { type: "explore", unitId: b!.unitId, to: chest.pos, solo: true })
    expect(r.state.explore).toBe(true)
    expect(r.state.units[b!.unitId]!.pos).toEqual(chest.pos)
    expect(chestToOpen(r.state, b!.unitId)?.id).toBe(chest.id)
    const opened = applyAction(r.state, { type: "openChest", unitId: b!.unitId })
    expect(opened.state.expedition!.opened).toEqual([chest.id])
    expect(opened.state.expedition!.keys[chest.id]).toBeUndefined()
    // В бою тот же боец без ключа открыть не может, а носитель ключа — может
    const fight: BattleState = structuredClone(r.state)
    delete fight.explore
    expect(chestToOpen(fight, b!.unitId)).toBeUndefined()
    expect(() => applyAction(fight, { type: "openChest", unitId: b!.unitId })).toThrow()
    // Павший носитель ключа не делится им и в разведке
    const dead: BattleState = structuredClone(r.state)
    dead.units[a!.unitId]!.alive = false
    expect(chestToOpen(dead, b!.unitId)).toBeUndefined()
  })

  it("зона тревоги совпадает с правилом ИИ: вне зоны спящий враг не просыпается, в зоне — просыпается", () => {
    for (const seed of [1, 5, 9]) {
      const s = expedition(seed, "nightmare", 1)
      const lone = players(s)[0]!
      const zone = alertZone(s)
      const size = mapSize(s.map)
      let inside = 0
      let outside = 0
      for (let y = 0; y < size.h; y += 2) {
        for (let x = (y / 2) % 2; x < size.w; x += 3) {
          const p = { x, y }
          if (!isPassable(terrainAt(s, p), "infantry") || Object.values(s.units).some(u => u.alive && samePos(u.pos, p))) continue
          const t: BattleState = structuredClone(s)
          t.units[lone.unitId]!.pos = p
          t.phase = "enemy"
          const woke = Object.values(t.units).filter(u => u.side === "enemy" && u.alive).some((e) => {
            const a = decideAction(t, e.unitId)
            return !(a.type === "wait" && samePos(a.to, e.pos) && !a.newStance)
          })
          // Зона считается при текущих позициях (игрок может перекрыть врагу проход) — сверяем с ней же
          const inZone = alertZone(t).has(posKey(p))
          expect(woke).toBe(inZone)
          if (zone.has(posKey(p))) inside++
          else outside++
        }
      }
      expect(inside).toBeGreaterThan(0)
      expect(outside).toBeGreaterThan(0)
    }
  })
})

describe("сейв: разведка и бонус «Живица»", () => {
  it("разведка переживает сохранение", () => {
    const save = createEmptySave(1)
    save.battle = expedition(4)
    const r = parseSave(serializeSave(save))
    expect(r.ok && r.save.battle?.explore).toBe(true)
  })

  it("v12 → v13: «Живица» пропадает у отряда и с земли, одиночка с ней оставит «Удачу»", () => {
    const save = createEmptySave(1)
    const b = expedition(6)
    delete b.explore
    const raw = JSON.parse(serializeSave({ ...save, battle: b })) as Record<string, unknown>
    type RawExp = { elites: { buff: string }[], pickups: unknown[] }
    const battle = raw["battle"] as { map: { expedition: RawExp }, expedition: { pickups: unknown[], buffs: unknown } }
    battle.map.expedition.elites[0]!.buff = "regen"
    battle.map.expedition.pickups.push({ id: "buff_x", pos: { x: 0, y: 0 }, kind: "regen" })
    battle.expedition.pickups.push({ id: "buff_x", pos: { x: 0, y: 0 }, kind: "regen" })
    battle.expedition.buffs = { team: ["regen", "swift"], units: { u: ["regen", "fury"] } }
    const v12 = { ...raw, version: 12 }
    const out = MIGRATIONS[12]!(v12)
    expect(out["version"]).toBe(13)
    const r = parseSave(JSON.stringify(v12))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const nb = r.save.battle!
    expect(nb.map.expedition!.elites[0]!.buff).toBe("fortune")
    expect(nb.map.expedition!.pickups.some(p => (p.kind as string) === "regen")).toBe(false)
    expect(nb.expedition!.pickups.some(p => (p.kind as string) === "regen")).toBe(false)
    expect(nb.expedition!.buffs).toEqual({ team: ["swift"], units: { u: ["fury"] } })
    // Старый бой без поля разведки продолжается пошагово
    expect(nb.explore).toBeUndefined()
  })
})

describe("чаща: туман войны", () => {
  const near = (a: Pos, b: Pos, r: number) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= r * r + r

  it("в начале видно только вокруг отряда; выходы, лагеря и враги вдали скрыты; вне чащи тумана нет", () => {
    for (const seed of [1, 2, 3, 4]) {
      const s = expedition(seed, "hard")
      const { w, h } = mapSize(s.map)
      expect(s.revealed).toHaveLength(w * h)
      for (const u of players(s)) expect(isRevealed(s, u.pos)).toBe(true)
      for (const e of s.map.expedition!.exits) expect(isRevealed(s, e)).toBe(false)
      // Каждая клетка открыта, только если рядом боец
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const p = { x, y }
          const expected = players(s).some(u => near(u.pos, p, EXPEDITION.vision))
          expect(isRevealed(s, p)).toBe(expected)
        }
      }
      for (const c of s.map.expedition!.chests) expect(isRevealed(s, c.pos)).toBe(false)
    }
    const map = generateMap({ seed: 1, biomeId: "yard", difficulty: "easy", team: 0, squadSize: 4 })
    const units = map.playerSpawns.slice(0, 4).map(p => makeUnit({ classId: "infantry_sword", pos: p }, false))
    const sk = createBattle({ map, squad: units, seed: 1, now: 1 }).state
    expect(sk.revealed).toBeUndefined()
    expect(isRevealed(sk, { x: 0, y: 0 })).toBe(true)
  })

  it("карта открывается по всему пройденному пути и остаётся открытой", () => {
    const s = expedition(7, "normal", 4)
    const to = farSafeTile(s)
    const lead = players(s)[0]!
    const r = applyAction(s, { type: "explore", unitId: lead.unitId, to })
    const moved = r.events.find(e => e.type === "squadMoved")
    expect(moved?.type).toBe("squadMoved")
    if (moved?.type !== "squadMoved") return
    for (const m of moved.moves) for (const p of m.path) expect(isRevealed(r.state, p)).toBe(true)
    // Разведанное не закрывается
    for (let i = 0; i < s.revealed!.length; i++) if (s.revealed![i] === "1") expect(r.state.revealed![i]).toBe("1")
    expect(r.state.revealed!.split("1").length).toBeGreaterThan(s.revealed!.split("1").length)
  })

  it("отряд встал перед зоной тревоги — потревоживший его враг виден", () => {
    for (const seed of [1, 2, 3, 9, 14]) {
      const s = expedition(seed)
      const lead = players(s)[0]!
      const r = applyAction(s, { type: "explore", unitId: lead.unitId, to: s.map.expedition!.chests[0]!.pos })
      if (r.state.explore) continue
      const zoneOf = (e: (typeof r.state.units)[string]) => alertZone({ ...r.state, units: { [e.unitId]: e, ...Object.fromEntries(players(r.state).map(u => [u.unitId, u])) } })
      const lp = r.state.units[lead.unitId]!.pos
      const size = mapSize(s.map)
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: lp.x + dx!, y: lp.y + dy! }))
        .filter(p => p.x >= 0 && p.y >= 0 && p.x < size.w && p.y < size.h)
      const culprits = Object.values(r.state.units).filter(e => e.side === "enemy" && e.alive && edge.some(p => zoneOf(e).has(posKey(p))))
      expect(culprits.length).toBeGreaterThan(0)
      expect(culprits.some(e => isRevealed(r.state, e.pos))).toBe(true)
    }
  })

  it("сейв: разведанное сохраняется; v13 → v14 — только номер версии", () => {
    const save = createEmptySave(1)
    save.battle = expedition(5)
    const r = parseSave(serializeSave(save))
    expect(r.ok && r.save.battle?.revealed).toBe(save.battle.revealed)
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(14)
    const v13 = { ...JSON.parse(serializeSave(save)), version: 13 }
    expect(MIGRATIONS[13]!(v13)).toEqual({ ...v13, version: 14 })
  })
})
