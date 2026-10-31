import { describe, expect, it } from "vitest"
import fc from "fast-check"
import { fallbackTerrain, generateExpedition } from "@game/core/map/expedition"
import { createRng } from "@game/core/rng"
import { generateMap } from "@game/core/map/generate"
import { applyAction, canExtract, chestToOpen, createBattle } from "@game/core/battle/reducer"
import { decideAction } from "@game/core/ai"
import { isPassable, tilesAtDistance, reachableTiles } from "@game/core/map/pathing"
import { EXPEDITION, turnLimitOf } from "@game/content/balance"
import { decorMask } from "@game/core/map/layouts"
import { itemCategory, itemPrice } from "@game/core/items"
import { buffDamageMult, buffLootMult, hasBuff } from "@game/core/battle/buffs"
import { simulateCombat } from "@game/core/combat"
import { resolveBattle } from "@game/core/progression"
import { createEmptySave } from "@game/core/save"
import { MAP_H, MAP_W, manhattan, mapSize, posKey, type BattleState, type Difficulty, type MapDef, type Pos } from "@game/core/types"
import { makeUnit, plainTiles } from "./helpers"

const DIFFS: Difficulty[] = ["easy", "normal", "hard", "nightmare"]

function bfs(map: MapDef, from: Pos): Set<string> {
  const { w, h } = mapSize(map)
  const seen = new Set([posKey(from)])
  const q = [from]
  while (q.length) {
    const c = q.shift() as Pos
    for (const n of [{ x: c.x + 1, y: c.y }, { x: c.x - 1, y: c.y }, { x: c.x, y: c.y + 1 }, { x: c.x, y: c.y - 1 }]) {
      if (n.x < 0 || n.y < 0 || n.x >= w || n.y >= h || seen.has(posKey(n)) || !isPassable(map.tiles[n.y]![n.x]!, "infantry")) continue
      seen.add(posKey(n))
      q.push(n)
    }
  }
  return seen
}

describe("вылазка в чащу: карта", () => {
  it("квадратное поле в две прежние карты, мрачный лес, лагеря под охраной 2–4 врагов, выход в углу; всё достижимо (property)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0x7fffffff }), fc.constantFrom(...DIFFS), fc.integer({ min: 0, max: 3 }), (seed, difficulty, team) => {
        const m = generateExpedition({ seed, difficulty, team, squadSize: 4 })
        expect(m.mode).toBe("expedition")
        expect(m.objective).toBe("extract")
        expect(m.biomeId).toBe("deep_forest")
        expect(mapSize(m)).toEqual({ w: EXPEDITION.w, h: EXPEDITION.h })
        expect(EXPEDITION.w).toBe(EXPEDITION.h)
        // Площадь — как две прежние карты чащи (18×24) с округлением до квадрата
        expect(Math.abs(EXPEDITION.w * EXPEDITION.h - 2 * MAP_W * 3 * MAP_H * 3)).toBeLessThan(EXPEDITION.w * 2)
        expect(m.tiles.every(r => r.length === EXPEDITION.w)).toBe(true)
        expect(m.reinforcements).toEqual([])
        const exp = m.expedition!
        // Выход — в углу карты, старт — в другом
        const { w, h } = mapSize(m)
        // Три выхода — в углах (кроме угла старта), далеко от старта
        expect(exp.exits.length).toBe(3)
        for (const e of exp.exits) {
          expect([0, w - 1]).toContain(e.x)
          expect([0, h - 1]).toContain(e.y)
          expect(manhattan(e, m.playerSpawns[0]!)).toBeGreaterThan(10)
        }
        expect(exp.chests.length).toBe(EXPEDITION.chests[difficulty])
        const reach = bfs(m, m.playerSpawns[0]!)
        for (const e of exp.exits) expect(reach.has(posKey(e))).toBe(true)
        for (const c of exp.chests) {
          expect(reach.has(posKey(c.pos))).toBe(true)
          const guards = m.enemies.filter(e => e.post && e.post.x === c.pos.x && e.post.y === c.pos.y)
          expect(guards.length).toBeGreaterThanOrEqual(2)
          expect(guards.length).toBeLessThanOrEqual(4)
          // Ключ — у одного из стражей этого сундука
          expect(guards.map(g => g.unit.id)).toContain(c.keyHolderId)
          for (const g of guards) {
            expect(manhattan(g.pos, c.pos)).toBeLessThanOrEqual(3)
            expect(g.stance).toBe("hold")
            expect(g.leash).toBe(EXPEDITION.leash)
            expect(reach.has(posKey(g.pos))).toBe(true)
          }
          // Сундук с Вкусняшками — с Вкусняшками, с предметом — с предметом
          if (c.kind === "treats") expect(c.treats).toBeGreaterThan(0)
          else expect(c.itemId).toBeDefined()
        }
        // Тропинки есть и идут по проходимым клеткам
        const paths = Object.entries(m.decor ?? {}).filter(([, d]) => d === "path")
        expect(paths.length).toBeGreaterThan(20)
        for (const [k] of paths) {
          const [x, y] = k.split(",").map(Number)
          expect(isPassable(m.tiles[y!]![x!]!, "infantry")).toBe(true)
        }
        const all = [...m.playerSpawns, ...m.enemies.map(e => e.pos)].map(posKey)
        expect(new Set(all).size).toBe(all.length)
      }),
      { numRuns: 40 }
    )
  })

  it("три выхода: два из них стережёт по одному врагу на коротком поводке, третий свободен (property)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0x7fffffff }), fc.constantFrom(...DIFFS), (seed, difficulty) => {
        const m = generateExpedition({ seed, difficulty, team: 1, squadSize: 4 })
        const guards = m.expedition!.exits.map(e => m.enemies.filter(g => g.post?.x === e.x && g.post?.y === e.y))
        expect(guards.filter(g => g.length === 1).length).toBe(EXPEDITION.exitGuards)
        expect(guards.filter(g => g.length === 0).length).toBe(3 - EXPEDITION.exitGuards)
        for (const [g] of guards.filter(x => x.length === 1)) {
          expect(g!.leash).toBe(EXPEDITION.exitGuardLeash)
          expect(manhattan(g!.pos, g!.post!)).toBeLessThanOrEqual(3)
          // Обычный страж, не вожак-одиночка с бонусом
          expect(g!.unit.isBoss).toBeFalsy()
          expect(m.expedition!.elites.some(el => el.unitId === g!.unit.id)).toBe(false)
        }
      }),
      { numRuns: 30 }
    )
  })

  it("все враги (стражи лагерей и выходов, одиночки) и сердечки — на клетках, достижимых пехотой от старта (property)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0x7fffffff }), fc.constantFrom(...DIFFS), (seed, difficulty) => {
        const m = generateExpedition({ seed, difficulty, team: 1, squadSize: 4 })
        const reach = bfs(m, m.playerSpawns[0]!)
        for (const e of m.enemies) expect(reach.has(posKey(e.pos)), `враг ${posKey(e.pos)}`).toBe(true)
        for (const h of m.expedition!.pickups) expect(reach.has(posKey(h.pos)), `сердечко ${posKey(h.pos)}`).toBe(true)
        expect(m.expedition!.elites.length).toBe(m.enemies.filter(e => e.unit.isBoss).length)
      }),
      { numRuns: 30 }
    )
  })

  it("generateExpedition не бросает исключений на переборе seed × сложностей", () => {
    for (let seed = 0; seed < 40; seed++)
      for (const difficulty of DIFFS)
        expect(() => generateExpedition({ seed: seed * 7919 + 3, difficulty, team: seed % 4, squadSize: 1 + (seed % 6) }), `${seed} ${difficulty}`).not.toThrow()
  }, 30_000)

  it("запасная поляна: хотя бы один лагерь, всё поле проходимо — выходы и лагеря достижимы", () => {
    const size = { w: EXPEDITION.w, h: EXPEDITION.h }
    const start = { x: 2, y: size.h - 3 }
    const exits = [{ x: size.w - 1, y: 0 }, { x: 0, y: 0 }, { x: size.w - 1, y: size.h - 1 }]
    for (let seed = 0; seed < 20; seed++) {
      for (const campCount of [1, 3, 6, 40]) {
        const { g, camps } = fallbackTerrain(size, createRng(seed), start, exits, campCount)
        expect(camps.length).toBeGreaterThanOrEqual(1)
        expect(camps.length).toBeLessThanOrEqual(Math.max(1, campCount))
        const m = { tiles: g } as MapDef
        const reach = bfs(m, start)
        for (const p of [...exits, ...camps]) expect(reach.has(posKey(p))).toBe(true)
      }
    }
  })

  it("уйти можно через любой выход", () => {
    const { state, player, chest } = miniExpedition({ guardPos: { x: 5, y: 0 } })
    for (const exitPos of [{ x: 0, y: 7 }, { x: 5, y: 7 }]) {
      const s: BattleState = structuredClone(state)
      s.map.expedition!.exits = [{ x: 0, y: 7 }, { x: 5, y: 7 }]
      s.expedition!.opened = [chest.id]
      s.units[player.id]!.pos = { x: exitPos.x, y: 6 }
      const r = applyAction(s, { type: "wait", unitId: player.id, to: exitPos })
      expect(r.state.result).toBeUndefined()
      expect(canExtract(r.state, player.id)).toBe(true)
      expect(applyAction(r.state, { type: "extract", unitId: player.id }).state.result).toBe("victory")
    }
  })

  it("как в Dota: три дороги от старта к выходу, ручей с мостами, по одним дорогам и тропам можно дойти до любого лагеря", () => {
    for (const seed of [1, 2, 3, 42, 777]) {
      const m = generateExpedition({ seed, difficulty: "normal", team: 1, squadSize: 4 })
      const { w, h } = mapSize(m)
      const exp = m.expedition!
      expect(exp.exits).toEqual([{ x: w - 1, y: 0 }, { x: 0, y: 0 }, { x: w - 1, y: h - 1 }])
      const decor = m.decor ?? {}
      const cells = Object.entries(decor).map(([k, d]) => ({ x: Number(k.split(",")[0]), y: Number(k.split(",")[1]), d }))
      // Ручей и мосты через него
      expect(m.tiles.flat().filter(t => t === "water").length).toBeGreaterThan(w)
      expect(cells.filter(c => c.d === "bridge").length).toBeGreaterThanOrEqual(2)
      // Дороги идут и вдоль левого/верхнего края, и вдоль нижнего/правого, и через середину
      expect(cells.some(c => c.x <= 4 && c.y < h / 2)).toBe(true)
      expect(cells.some(c => c.y >= h - 4 && c.x > w / 2)).toBe(true)
      expect(cells.some(c => Math.abs(c.x - w / 2) <= 3 && Math.abs(c.y - h / 2) <= 3)).toBe(true)
      // Сеть дорог и троп связна: от старта по ней — к выходу и к каждому сундуку
      const seen = new Set<string>()
      const q = [cells.find(c => manhattan(c, m.playerSpawns[0]!) <= 2)!]
      expect(q[0]).toBeDefined()
      seen.add(posKey(q[0]!))
      while (q.length) {
        const c = q.shift()!
        for (const n of [{ x: c.x + 1, y: c.y }, { x: c.x - 1, y: c.y }, { x: c.x, y: c.y + 1 }, { x: c.x, y: c.y - 1 }]) {
          if (seen.has(posKey(n)) || !decor[posKey(n)]) continue
          seen.add(posKey(n))
          q.push({ ...n, d: decor[posKey(n)]! })
        }
      }
      for (const e of exp.exits) expect(seen.has(posKey(e)), `seed ${seed}: выход ${posKey(e)}`).toBe(true)
      for (const c of exp.chests) expect(seen.has(posKey(c.pos)), `seed ${seed}: сундук ${posKey(c.pos)}`).toBe(true)
      // Лагеря — не на дорогах, а в лесу в стороне; сундук тем богаче, чем больше стражей
      const bySize = exp.chests.filter(c => c.kind === "treats").map(c => ({ c, n: m.enemies.filter(e => e.post?.x === c.pos.x && e.post?.y === c.pos.y).length }))
      const small = bySize.filter(x => x.n === 2).map(x => x.c.treats)
      const big = bySize.filter(x => x.n === 4).map(x => x.c.treats)
      if (small.length && big.length) expect(Math.min(...big)).toBeGreaterThan(Math.max(...small))
    }
  })

  it("лимит ходов: в чаще его нет, в обычном бою — прежние 20", () => {
    expect(turnLimitOf(generateExpedition({ seed: 1, difficulty: "easy", team: 0, squadSize: 4 }))).toBe(Number.POSITIVE_INFINITY)
    expect(turnLimitOf(generateMap({ seed: 1, biomeId: "yard", difficulty: "easy", team: 0, squadSize: 4 }))).toBe(20)
  })

  it("генерация быстрая: карта чащи — меньше 400 мс", () => {
    const t0 = performance.now()
    generateExpedition({ seed: 12345, difficulty: "nightmare", team: 3, squadSize: 4 })
    expect(performance.now() - t0).toBeLessThan(400)
  })

  it("тропинки чащи — связные автотайлы и за пределами обычного поля 6×8", () => {
    const m = generateExpedition({ seed: 77, difficulty: "normal", team: 0, squadSize: 4 })
    const size = mapSize(m)
    const far = Object.keys(m.decor ?? {}).map(k => k.split(",").map(Number) as [number, number]).filter(([x, y]) => x >= MAP_W || y >= MAP_H)
    expect(far.length).toBeGreaterThan(10)
    for (const [x, y] of far) expect(decorMask(m.decor, { x, y }, size), `${x},${y}`).not.toBe(0)
  })

  it("детерминирована по seed; обычная схватка — прежнее поле 6×8 без режима чащи", () => {
    const a = generateExpedition({ seed: 5, difficulty: "normal", team: 1, squadSize: 4 })
    const b = generateExpedition({ seed: 5, difficulty: "normal", team: 1, squadSize: 4 })
    expect(a).toEqual(b)
    const skirmish = generateMap({ seed: 5, biomeId: "yard", difficulty: "normal", team: 1, squadSize: 4 })
    expect(mapSize(skirmish)).toEqual({ w: MAP_W, h: MAP_H })
    expect(skirmish.mode).toBeUndefined()
    expect(skirmish.expedition).toBeUndefined()
  })

  it("на большом поле досягаемы клетки за пределами 6×8: ход и дальность атаки считаются по размеру карты", () => {
    expect(tilesAtDistance({ x: 10, y: 15 }, 1, { w: 18, h: 24 }).length).toBe(4)
    expect(tilesAtDistance({ x: 10, y: 15 }, 1).length).toBe(0)
    const m = generateExpedition({ seed: 9, difficulty: "easy", team: 0, squadSize: 4 })
    const { state } = createBattle({ map: m, squad: [makeUnit({ classId: "infantry_sword", pos: m.playerSpawns[0]! }, false)], seed: 1, now: 1 })
    const bu = Object.values(state.units).find(u => u.side === "player")!
    const reach = reachableTiles(state, bu)
    expect([...reach.values()].some(n => n.pos.y < MAP_H * 3 - MAP_H || n.pos.x >= MAP_W || n.pos.y >= MAP_H)).toBe(true)
  })
})

/** Маленькая вылазка на обычном поле: сундук, его страж с ключом, выход в углу. */
/**
 * Маленькая вылазка на обычном поле. По умолчанию — пошаговый бой (`explore: true` — оставить разведку, если отряд
 * вне зоны тревоги): так проверяются правила ключа, сундука и выхода.
 */
function miniExpedition(opts: { guardHp?: number, guardPos?: Pos, playerPos?: Pos, leash?: number, explore?: boolean } = {}) {
  const player = makeUnit({ classId: "infantry_sword", pos: opts.playerPos ?? { x: 2, y: 4 }, baseStats: { hp: 40, str: 30, spd: 20, def: 10, res: 10 } }, false)
  const guard = makeUnit({ classId: "infantry_axe", pos: opts.guardPos ?? { x: 2, y: 3 }, baseStats: { hp: opts.guardHp ?? 1, str: 1, spd: 1, def: 0, res: 0 } }, true)
  const chest = { id: "chest_0", pos: { x: 2, y: 1 }, kind: "treats" as const, treats: 77, keyHolderId: guard.id }
  const map: MapDef = {
    seed: 1,
    biomeId: "deep_forest",
    factionId: "forest_lynxes",
    difficulty: "normal",
    objective: "extract",
    mode: "expedition",
    expedition: { chests: [chest], exits: [{ x: 5, y: 7 }], pickups: [], elites: [] },
    tiles: plainTiles(),
    playerSpawns: [opts.playerPos ?? { x: 2, y: 4 }],
    enemies: [{ unit: guard, pos: opts.guardPos ?? { x: 2, y: 3 }, stance: "hold", post: chest.pos, leash: opts.leash ?? 3 }],
    reinforcements: [],
    rewards: { treats: 100, glory: 3 }
  }
  const { state } = createBattle({ map, squad: [player], seed: 3, now: 1 })
  if (!opts.explore) delete state.explore
  return { state, player, guard, chest }
}

describe("вылазка в чащу: ключ, сундук, выход", () => {
  it("ключ у стража; убил его боец — ключ у бойца; встал на сундук и открыл — добыча; встал на выход и ушёл — победа", () => {
    const { state: s0, player, guard, chest } = miniExpedition()
    expect(s0.expedition!.keys[chest.id]).toEqual({ unitId: guard.id })
    const r1 = applyAction(s0, { type: "attack", unitId: player.id, to: { x: 2, y: 4 }, targetId: guard.id })
    expect(r1.state.units[guard.id]!.alive).toBe(false)
    expect(r1.state.expedition!.keys[chest.id]).toEqual({ unitId: player.id })
    expect(r1.events.some(e => e.type === "keyTaken" && e.unitId === player.id)).toBe(true)
    // Все враги мертвы — но это не победа: в чаще нужно уйти через выход
    expect(r1.state.result).toBeUndefined()

    // Следующий ход: встал с ключом на сундук — сам он не открывается, игрок подтверждает (ход не тратится)
    const s2: BattleState = structuredClone(r1.state)
    s2.units[player.id]!.acted = false
    s2.units[player.id]!.pos = { x: 2, y: 2 }
    const stepped = applyAction(s2, { type: "move", unitId: player.id, to: { x: 2, y: 1 } })
    expect(stepped.events.some(e => e.type === "chestOpened")).toBe(false)
    expect(stepped.state.expedition!.opened).toEqual([])
    expect(chestToOpen(stepped.state, player.id)?.id).toBe(chest.id)
    const r2 = applyAction(stepped.state, { type: "openChest", unitId: player.id })
    const opened = r2.events.find(e => e.type === "chestOpened")
    expect(opened).toMatchObject({ chestId: chest.id, unitId: player.id, treats: 77 })
    expect(r2.state.expedition!.opened).toEqual([chest.id])
    expect(r2.state.stats.loot).toBe(r1.state.stats.loot + 77)
    expect(r2.state.units[player.id]!.acted).toBe(false)
    expect(chestToOpen(r2.state, player.id)).toBeUndefined()
    // Второй раз тот же сундук не открыть
    expect(() => applyAction(r2.state, { type: "openChest", unitId: player.id })).toThrow()

    // Выход в углу: встал — игрок подтверждает, и отряд уходит с добычей
    const s3: BattleState = structuredClone(r2.state)
    s3.units[player.id]!.acted = false
    delete s3.units[player.id]!.turnStart
    s3.units[player.id]!.pos = { x: 5, y: 6 }
    const onExitTile = applyAction(s3, { type: "move", unitId: player.id, to: { x: 5, y: 7 } })
    expect(onExitTile.state.result).toBeUndefined()
    expect(canExtract(onExitTile.state, player.id)).toBe(true)
    const r3 = applyAction(onExitTile.state, { type: "extract", unitId: player.id })
    expect(r3.events.some(e => e.type === "extracted")).toBe(true)
    expect(r3.state.result).toBe("victory")
  })

  it("без ключа и рядом с сундуком он не открывается; уйти через выход можно и без открытого сундука", () => {
    const { state, player, chest } = miniExpedition({ guardPos: { x: 5, y: 0 } })
    const s: BattleState = structuredClone(state)
    s.units[player.id]!.pos = { x: 2, y: 2 }
    // Без ключа — даже стоя на сундуке
    const r = applyAction(s, { type: "move", unitId: player.id, to: { x: 2, y: 1 } })
    expect(chestToOpen(r.state, player.id)).toBeUndefined()
    expect(() => applyAction(r.state, { type: "openChest", unitId: player.id })).toThrow()
    expect(r.state.expedition!.opened).toEqual([])
    // С ключом, но рядом (не на сундуке) — тоже нет
    const near: BattleState = structuredClone(state)
    near.units[player.id]!.pos = { x: 2, y: 3 }
    near.expedition!.keys[chest.id] = { unitId: player.id }
    const r1 = applyAction(near, { type: "wait", unitId: player.id, to: { x: 2, y: 2 } })
    expect(chestToOpen(r1.state, player.id)).toBeUndefined()
    expect(r1.state.expedition!.opened).toEqual([])
    const s2: BattleState = structuredClone(state)
    s2.units[player.id]!.pos = { x: 5, y: 6 }
    // На выходе без открытого сундука бой сам не кончается, но уйти можно и так — без добычи из сундуков
    const r2 = applyAction(s2, { type: "wait", unitId: player.id, to: { x: 5, y: 7 } })
    expect(r2.state.result).toBeUndefined()
    expect(canExtract(r2.state, player.id)).toBe(true)
    const left = applyAction(r2.state, { type: "extract", unitId: player.id })
    expect(left.state.result).toBe("victory")
    expect(left.state.expedition!.opened).toEqual([])
    expect(left.state.expedition!.found).toEqual([])
  })

  it("павший носитель роняет ключ на свою клетку, встал на неё — подобрал сразу, без действия", () => {
    const { state, player, chest } = miniExpedition({ guardPos: { x: 5, y: 0 } })
    const s: BattleState = structuredClone(state)
    s.expedition!.keys[chest.id] = { pos: { x: 3, y: 4 } }
    const r = applyAction(s, { type: "move", unitId: player.id, to: { x: 3, y: 4 } })
    expect(r.state.expedition!.keys[chest.id]).toEqual({ unitId: player.id })
    expect(r.state.units[player.id]!.acted).toBe(false)
  })

  it("сам выход не срабатывает: ни перестановка, ни завершённое действие не уводят отряд без подтверждения", () => {
    const { state, player, chest } = miniExpedition({ guardPos: { x: 5, y: 0 } })
    const s: BattleState = structuredClone(state)
    s.expedition!.opened = [chest.id]
    s.units[player.id]!.pos = { x: 5, y: 6 }
    const moved = applyAction(s, { type: "move", unitId: player.id, to: { x: 5, y: 7 } })
    expect(moved.state.result).toBeUndefined()
    const done = applyAction(moved.state, { type: "wait", unitId: player.id, to: { x: 5, y: 7 } })
    expect(done.state.result).toBeUndefined()
    // Уйти можно и после действия бойца
    expect(applyAction(done.state, { type: "extract", unitId: player.id }).state.result).toBe("victory")
    // Не на выходе — нельзя
    expect(() => applyAction(s, { type: "extract", unitId: player.id })).toThrow()
  })

  it("страж на поводке: дальнего игрока не преследует и возвращается к сундуку, ближнего — только в пределах поводка", () => {
    // Игрок дальше радиуса тревоги (`EXPEDITION.alertRadius = 6`) и зоны атаки стража
    const far = miniExpedition({ guardHp: 40, guardPos: { x: 2, y: 3 }, playerPos: { x: 5, y: 7 }, leash: 2 })
    const s: BattleState = structuredClone(far.state)
    s.phase = "enemy"
    s.units[far.guard.id]!.stance = "advance"
    const away = decideAction(s, far.guard.id)
    expect(away.type).toBe("wait")
    if (away.type === "wait") {
      expect(manhattan(away.to, far.chest.pos)).toBeLessThanOrEqual(2)
      expect(away.newStance).toBe("hold")
    }
    // Спящий страж не просыпается по таймеру хода, пока игрок далеко
    const late: BattleState = structuredClone(far.state)
    late.phase = "enemy"
    late.turn = 30
    expect(decideAction(late, far.guard.id).type).toBe("wait")
    expect((decideAction(late, far.guard.id) as { to: Pos }).to).toEqual({ x: 2, y: 3 })

    const near = miniExpedition({ guardHp: 40, guardPos: { x: 2, y: 2 }, playerPos: { x: 2, y: 6 }, leash: 2 })
    const t: BattleState = structuredClone(near.state)
    t.phase = "enemy"
    t.units[near.guard.id]!.stance = "advance"
    const act = decideAction(t, near.guard.id)
    const to = (act as { to: Pos }).to
    expect(manhattan(to, near.chest.pos)).toBeLessThanOrEqual(2)
  })
})

describe("вылазка в чащу: награды, сердечки и бонусы", () => {
  it("в сундуках — Вкусняшки, оружие или украшения; чем выше сложность, тем дороже находка", () => {
    const kinds = new Set<string>()
    const price = (d: Difficulty) => {
      const prices: number[] = []
      for (let seed = 1; seed < 40; seed++) {
        const m = generateExpedition({ seed, difficulty: d, team: 0, squadSize: 4 })
        for (const c of m.expedition!.chests) {
          kinds.add(c.kind)
          if (c.kind === "treats") expect(c.treats).toBeGreaterThan(0)
          else {
            expect(c.itemId).toBeDefined()
            expect(itemCategory(c.itemId!)).toBe(c.kind === "weapon" ? "weapon" : "talisman")
            prices.push(itemPrice(c.itemId!))
          }
        }
      }
      return prices.reduce((a, b) => a + b, 0) / Math.max(1, prices.length)
    }
    const easy = price("easy")
    const nightmare = price("nightmare")
    expect([...kinds].sort()).toEqual(["talisman", "treats", "weapon"])
    expect(nightmare).toBeGreaterThan(easy * 1.3)
  })

  it("сердечки — на тропах; одиночки — вожаки уровнем выше команды, у каждого свой бонус", () => {
    for (const d of DIFFS) {
      const m = generateExpedition({ seed: 31, difficulty: d, team: 1, squadSize: 4 })
      const exp = m.expedition!
      expect(exp.pickups.filter(p => p.kind === "heart").length).toBe(EXPEDITION.hearts)
      for (const p of exp.pickups) expect(m.decor?.[posKey(p.pos)]).toBe("path")
      expect(exp.elites.length).toBe(EXPEDITION.elites[d])
      expect(new Set(exp.elites.map(e => e.buff)).size).toBe(exp.elites.length)
      for (const e of exp.elites) {
        const placed = m.enemies.find(x => x.unit.id === e.unitId)!
        expect(placed.unit.isBoss).toBe(true)
        expect(placed.leash).toBe(EXPEDITION.eliteLeash)
        // Одиночка — не в лагере
        for (const c of exp.chests) expect(manhattan(placed.pos, c.pos)).toBeGreaterThanOrEqual(6)
      }
    }
  })

  it("сердечко: встал — здоровье полностью; одиночка пал — на его клетке бонус, подобрал — действует", () => {
    const { state, player, guard } = miniExpedition({ guardPos: { x: 2, y: 3 } })
    const s: BattleState = structuredClone(state)
    s.map.expedition!.elites = [{ unitId: guard.id, buff: "fury" }]
    s.expedition!.pickups = [{ id: "heart_0", pos: { x: 3, y: 4 }, kind: "heart" }]
    s.units[player.id]!.hp = 5
    const healed = applyAction(s, { type: "move", unitId: player.id, to: { x: 3, y: 4 } })
    expect(healed.state.units[player.id]!.hp).toBe(healed.state.units[player.id]!.maxHp)
    expect(healed.state.expedition!.pickups).toEqual([])
    // Убить одиночку — бонус на его клетке
    const s2: BattleState = structuredClone(healed.state)
    const r = applyAction(s2, { type: "attack", unitId: player.id, to: { x: 2, y: 4 }, targetId: guard.id })
    expect(r.state.units[guard.id]!.alive).toBe(false)
    expect(r.state.expedition!.pickups).toEqual([{ id: `buff_${guard.id}`, pos: { x: 2, y: 3 }, kind: "fury" }])
    expect(r.events.some(e => e.type === "pickupDropped")).toBe(true)
    const s3: BattleState = structuredClone(r.state)
    s3.units[player.id]!.acted = false
    delete s3.units[player.id]!.turnStart
    const got = applyAction(s3, { type: "move", unitId: player.id, to: { x: 2, y: 3 } })
    expect(got.state.expedition!.buffs.units[player.id]).toEqual(["fury"])
    expect(hasBuff(got.state, player.id, "fury")).toBe(true)
  })

  it("бонусы работают: ярость +20 % урона, оберег −20 %, ветер +2 хода, удача — больше добычи", () => {
    const { state, player, guard } = miniExpedition({ guardHp: 200, guardPos: { x: 2, y: 3 } })
    const plain = simulateCombat(state, player.id, guard.id, { x: 2, y: 4 })
    const dealt = (st: BattleState) => {
      const out = simulateCombat(st, player.id, guard.id, { x: 2, y: 4 })
      return out.defender.hpBefore - out.defender.hpAfter
    }
    const base = plain.defender.hpBefore - plain.defender.hpAfter
    const fury: BattleState = structuredClone(state)
    fury.expedition!.buffs.units[player.id] = ["fury"]
    expect(dealt(fury)).toBeGreaterThan(base)
    expect(buffDamageMult(fury, player.id, guard.id)).toBeCloseTo(1.2)
    const aegis: BattleState = structuredClone(state)
    aegis.expedition!.buffs.units[player.id] = ["aegis"]
    expect(buffDamageMult(aegis, guard.id, player.id)).toBeCloseTo(0.8)
    // Ветер — всему отряду
    const swift: BattleState = structuredClone(state)
    swift.expedition!.buffs.team = ["swift"]
    const bu = state.units[player.id]!
    expect(reachableTiles(swift, swift.units[player.id]!).size).toBeGreaterThan(reachableTiles(state, bu).size)
    // Удача
    const lucky: BattleState = structuredClone(state)
    lucky.expedition!.buffs.team = ["fortune"]
    expect(buffLootMult(lucky)).toBe(1.5)
    expect(buffLootMult(state)).toBe(1)
  })

  it("находки из сундуков достаются армии, только если отряд ушёл через выход", () => {
    const { state } = miniExpedition()
    const save = createEmptySave(1)
    save.army = { id: "a", units: Object.values(state.roster).filter(u => !u.isEnemy), squadIds: [], createdAt: 1, battles: 0, wins: 0 }
    const won: BattleState = structuredClone(state)
    won.expedition!.found = ["tal_bell"]
    won.result = "victory"
    const res = resolveBattle(save, won, 10)
    expect(res.inventory["tal_bell"]).toBe(1)
    expect(res.summary.found).toEqual(["tal_bell"])
    const lost: BattleState = structuredClone(won)
    lost.result = "retreat"
    expect(resolveBattle(save, lost, 10).inventory["tal_bell"]).toBeUndefined()
  })
})
