import { describe, expect, it } from "vitest"
import fc from "fast-check"
import { generateMap } from "@game/core/map/generate"
import { LAYOUTS, LAYOUT_WEIGHTS, bridgeVertical, decorMask, layoutDef } from "@game/core/map/layouts"
import { isPassable } from "@game/core/map/pathing"
import type { Difficulty, Pos, TerrainId } from "@game/core/types"
import { MAP_H, MAP_W, MAX_LEVEL, posKey } from "@game/core/types"
import { ENEMY_TEAMS, TERRAIN_SHARE, difficultyDef, teamLevels, teamTreats } from "@game/content/balance"
import { BIOMES, waterFillsTile } from "@game/content/biomes"
import { unitClass } from "@game/content/classes"
import { generateUnit } from "@game/core/units"

const ALL_BIOMES = BIOMES.map(b => b.id)

function bfs(tiles: TerrainId[][], from: Pos): Set<string> {
  const seen = new Set<string>([posKey(from)])
  const q = [from]
  while (q.length) {
    const c = q.shift() as Pos
    for (const n of [
      { x: c.x + 1, y: c.y },
      { x: c.x - 1, y: c.y },
      { x: c.x, y: c.y + 1 },
      { x: c.x, y: c.y - 1 }
    ]) {
      if (n.x < 0 || n.y < 0 || n.x >= MAP_W || n.y >= MAP_H) continue
      const k = posKey(n)
      if (seen.has(k) || !isPassable(tiles[n.y]![n.x]!, "infantry")) continue
      seen.add(k)
      q.push(n)
    }
  }
  return seen
}

describe("generateMap", () => {
  it("детерминирована по seed", () => {
    const a = generateMap({
      seed: 99,
      biomeId: "yard",
      difficulty: "normal",
      team: 1,
      squadSize: 4
    })
    const b = generateMap({
      seed: 99,
      biomeId: "yard",
      difficulty: "normal",
      team: 1,
      squadSize: 4
    })
    expect(a).toEqual(b)
  })

  it("инварианты выполняются для случайных seed × сложностей × биомов", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0x7fffffff }),
        fc.constantFrom<Difficulty>("easy", "normal", "hard", "nightmare"),
        fc.constantFrom(...ALL_BIOMES),
        fc.integer({ min: 0, max: 3 }),
        (seed, difficulty, biomeId, team) => {
          const m = generateMap({
            seed,
            biomeId,
            difficulty,
            team,
            squadSize: 4
          })
          const d = difficultyDef(difficulty)
          expect(m.tiles.length).toBe(MAP_H)
          expect(m.tiles.every(r => r.length === MAP_W)).toBe(true)
          expect(m.enemies.length).toBeGreaterThanOrEqual(d.enemies[0])
          expect(m.enemies.length).toBeLessThanOrEqual(d.enemies[1])
          expect(m.playerSpawns.length).toBe(4)
          // спавны проходимы для своих типов
          for (const p of m.playerSpawns) expect(m.tiles[p.y]![p.x]).toBe("plain")
          for (const e of m.enemies)
            expect(isPassable(m.tiles[e.pos.y]![e.pos.x]!, unitClass(e.unit).moveType)).toBe(true)
          // уникальные позиции
          const all = [...m.playerSpawns, ...m.enemies.map(e => e.pos)].map(posKey)
          expect(new Set(all).size).toBe(all.length)
          // связность: из первого спавна игрока достижимо ≥80 % врагов (пехотой)
          const reach = bfs(m.tiles, m.playerSpawns[0]!)
          const reachable = m.enemies.filter(e => reach.has(posKey(e.pos))).length
          expect(reachable / m.enemies.length).toBeGreaterThanOrEqual(0.8)
          // проходимых клеток ≥ 65 %
          const passable = m.tiles.flat().filter(t => isPassable(t, "infantry")).length
          expect(passable / (MAP_W * MAP_H)).toBeGreaterThanOrEqual(0.65)
          // уровни врагов — в окне команды внутри диапазона сложности
          const [lo, hi] = teamLevels(d, team)
          for (const e of [...m.enemies, ...m.reinforcements.flatMap(w => w.units)]) {
            expect(e.unit.level).toBeGreaterThanOrEqual(lo)
            expect(e.unit.level).toBeLessThanOrEqual(Math.min(MAX_LEVEL, hi))
            expect(e.unit.isEnemy).toBe(true)
          }
          expect(m.reinforcements.length).toBe(d.reinforcements.length)
          if (d.boss) {
            expect(m.enemies.filter(e => e.unit.isBoss).length).toBe(1)
            expect(m.objective).toBe("killBoss")
          }
          expect(m.rewards.treats).toBeGreaterThan(0)
        }
      ),
      { numRuns: 200 }
    )
  })
})

describe("баланс карт и сложности", () => {
  it("непроходимые для пехоты клетки (стены, горы, вода) — в среднем не больше 18 % поля", () => {
    let blocked = 0
    let cells = 0
    for (const biomeId of ALL_BIOMES) {
      for (let i = 0; i < 24; i++) {
        const m = generateMap({ seed: 300 + i * 41, biomeId, difficulty: "normal", team: 1, squadSize: 4})
        for (const row of m.tiles) {
          for (const t of row) {
            cells++
            if (t === "wall" || t === "wall_breakable" || t === "mountain" || t === "water") blocked++
          }
        }
      }
    }
    expect(blocked / cells).toBeLessThan(0.18)
  })
  it("на «Легко» статы врагов умножены на enemyStatMult, на остальных — как у модели", () => {
    for (const difficulty of ["easy", "normal"] as Difficulty[]) {
      const mult = difficultyDef(difficulty).enemyStatMult
      const m = generateMap({ seed: 42, biomeId: "yard", difficulty, team: 1, squadSize: 4})
      for (const { unit } of m.enemies) {
        // Статы модели зависят только от seed, звезды, уровня и класса
        const plain = generateUnit({ seed: unit.seed, level: unit.level, rarity: unit.rarity, classId: unit.classId, isEnemy: true })
        for (const [k, v] of Object.entries(plain.maxStats))
          expect(unit.maxStats[k as keyof typeof unit.maxStats]).toBe(Math.max(1, Math.round(v * mult)))
      }
    }
    expect(difficultyDef("easy").enemyStatMult).toBeLessThan(1)
  })
})

describe("команды врагов", () => {
  it("уровни закреплены за сложностью: 4 окна подряд покрывают диапазон, «Легко» — 1–20", () => {
    expect(difficultyDef("easy").levels).toEqual([1, 20])
    expect([0, 1, 2, 3].map(t => teamLevels(difficultyDef("easy"), t))).toEqual([[1, 5], [6, 10], [11, 15], [16, 20]])
    for (const d of ["easy", "normal", "hard", "nightmare"] as Difficulty[]) {
      const def = difficultyDef(d)
      const windows = Array.from({ length: ENEMY_TEAMS }, (_, t) => teamLevels(def, t))
      expect(windows[0]![0]).toBe(def.levels[0])
      expect(windows[ENEMY_TEAMS - 1]![1]).toBe(def.levels[1])
      for (let t = 1; t < ENEMY_TEAMS; t++) expect(windows[t]![0]).toBe(windows[t - 1]![1] + 1)
      // команда сильнее — награда больше
      for (let t = 1; t < ENEMY_TEAMS; t++) expect(teamTreats(def, t)).toBeGreaterThan(teamTreats(def, t - 1))
    }
  })
})

describe("случайный биом", () => {
  it("выпадает любой из всех биомов — без привязки к прогрессии", () => {
    const seen = new Set<string>()
    for (let seed = 0; seed < 400 && seen.size < ALL_BIOMES.length; seed++)
      seen.add(generateMap({ seed, biomeId: "random", difficulty: "easy", team: 0, squadSize: 4 }).biomeId)
    expect([...seen].sort()).toEqual([...ALL_BIOMES].sort())
  })
})

describe("препятствия", () => {
  it("непроходимых клеток немного: не больше предела раскладки (обычно TERRAIN_SHARE.maxBlocked) на любой карте (property)", () => {
    const diffs: Difficulty[] = ["easy", "normal", "hard", "nightmare"]
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0x7fffffff }), fc.integer({ min: 0, max: 3 }), (seed, d) => {
        const map = generateMap({ seed, biomeId: "random", difficulty: diffs[d]!, team: seed % ENEMY_TEAMS, squadSize: 4 })
        const blocked = map.tiles.flat().filter(t => !isPassable(t, "infantry")).length
        expect(blocked).toBeLessThanOrEqual(layoutDef(map.layout ?? "glade").maxBlocked)
        expect(layoutDef(map.layout ?? "glade").maxBlocked).toBeLessThanOrEqual(TERRAIN_SHARE.maxBlocked + 2)
      }),
      { numRuns: 200 }
    )
  })
})

describe("раскладки карт", () => {
  const maps = (layout: string, biomes = ALL_BIOMES) => {
    const out = []
    for (const biomeId of biomes) {
      for (let seed = 1; seed < 400; seed++) {
        const m = generateMap({ seed, biomeId, difficulty: "normal", team: 1, squadSize: 4 })
        if (m.layout === layout) out.push(m)
        if (out.length >= 30) return out
      }
    }
    return out
  }

  it("в каждом биоме выпадает несколько разных раскладок; вода — только там, где она заливает клетку", () => {
    for (const biomeId of ALL_BIOMES) {
      const seen = new Set<string>()
      for (let seed = 0; seed < 120; seed++) seen.add(generateMap({ seed, biomeId, difficulty: "normal", team: 0, squadSize: 4 }).layout ?? "")
      expect(seen.size, biomeId).toBeGreaterThanOrEqual(3)
      if (!waterFillsTile(biomeId)) {
        expect(seen.has("riverBridge"), biomeId).toBe(false)
        expect(seen.has("lake"), biomeId).toBe(false)
      }
    }
    for (const w of Object.values(LAYOUT_WEIGHTS)) for (const id of Object.keys(w)) expect(LAYOUTS).toHaveProperty(id)
  })

  it("переправа: река делит поле на две части, через неё ведёт мост посередине, тропинка доходит до моста с обеих сторон", () => {
    const list = maps("riverBridge", ["yard", "jungle", "deep_forest"])
    expect(list.length).toBeGreaterThan(5)
    for (const m of list) {
      const bridges = Object.entries(m.decor ?? {}).filter(([, d]) => d === "bridge").map(([k]) => k.split(",").map(Number) as [number, number])
      expect(bridges.length).toBe(1)
      const [bx, by] = bridges[0]!
      expect([2, 3]).toContain(bx)
      expect(m.tiles[by]![bx]).toBe("plain")
      expect(bridgeVertical(m.tiles, { x: bx, y: by })).toBe(true)
      // река: в рядах 3–4 воды не меньше 4 клеток, без моста и бродов пехоте не пройти
      const water = m.tiles.slice(3, 5).flat().filter(t => t === "water").length
      expect(water).toBeGreaterThanOrEqual(4)
      expect(m.decor?.[posKey({ x: bx, y: by - 1 })]).toBe("path")
      expect(m.decor?.[posKey({ x: bx, y: by + 1 })]).toBe("path")
    }
  })

  it("опушка: лес гуще с одного края, посередине — тропинка снизу доверху", () => {
    const list = maps("forestEdge", ["yard", "deep_forest", "jungle", "winter_park"])
    expect(list.length).toBeGreaterThan(5)
    for (const m of list) {
      const col = (x: number) => m.tiles.filter(r => r[x] === "forest").length
      const left = col(0) + col(1)
      const right = col(MAP_W - 1) + col(MAP_W - 2)
      expect(Math.max(left, right)).toBeGreaterThan(Math.min(left, right) + 3)
      const pathRows = new Set(Object.entries(m.decor ?? {}).filter(([, d]) => d === "path").map(([k]) => Number(k.split(",")[1])))
      expect(pathRows.size).toBe(MAP_H)
    }
  })

  it("тропинки — проходимая земля, связная линия без одиночных клеток; лес без одиночных кустов посреди поля", () => {
    for (const layout of ["forestEdge", "crossroads", "glade", "lake", "fort", "pass"]) {
      for (const m of maps(layout)) {
        const decor = m.decor ?? {}
        for (const [k, d] of Object.entries(decor)) {
          const [x, y] = k.split(",").map(Number) as [number, number]
          if (d === "path") expect(isPassable(m.tiles[y]![x]!, "infantry")).toBe(true)
          // у каждой клетки тропинки есть продолжение (соседняя тропинка, мост или край поля)
          expect(decorMask(decor, { x, y }), `${layout} ${k}`).not.toBe(0)
        }
      }
    }
    // в рощах поляны лесные клетки держатся вместе
    let lonely = 0
    let forest = 0
    for (const m of maps("glade")) {
      for (let y = 0; y < MAP_H; y++) {
        for (let x = 0; x < MAP_W; x++) {
          if (m.tiles[y]![x] !== "forest") continue
          forest++
          const near = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].some(([dx, dy]) => m.tiles[y + dy!]?.[x + dx!] === "forest")
          if (!near) lonely++
        }
      }
    }
    expect(lonely / Math.max(1, forest)).toBeLessThan(0.1)
  })

  it("маска автотайла: прямой участок, поворот, перекрёсток и выход за край поля", () => {
    const decor = { "2,3": "path", "2,2": "path", "2,4": "path", "3,3": "path" } as const
    expect(decorMask(decor, { x: 2, y: 3 })).toBe(1 | 2 | 4)
    expect(decorMask(decor, { x: 3, y: 3 })).toBe(8)
    expect(decorMask({ "0,0": "path", "0,1": "path" }, { x: 0, y: 0 })).toBe(1 | 4)
    expect(decorMask({ "5,4": "path", "4,4": "path" }, { x: 5, y: 4 })).toBe(2 | 8)
  })
})
