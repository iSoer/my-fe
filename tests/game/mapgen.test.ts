import { describe, expect, it } from "vitest"
import fc from "fast-check"
import { generateMap } from "@game/core/map/generate"
import { isPassable } from "@game/core/map/pathing"
import type { Difficulty, Pos, TerrainId } from "@game/core/types"
import { MAP_H, MAP_W, MAX_LEVEL, posKey } from "@game/core/types"
import { ENEMY_TEAMS, difficultyDef, teamLevels, teamTreats } from "@game/content/balance"
import { BIOMES } from "@game/content/biomes"
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
      squadSize: 4,
      unlockedBiomes: ALL_BIOMES
    })
    const b = generateMap({
      seed: 99,
      biomeId: "yard",
      difficulty: "normal",
      team: 1,
      squadSize: 4,
      unlockedBiomes: ALL_BIOMES
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
            squadSize: 4,
            unlockedBiomes: ALL_BIOMES
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
        const m = generateMap({ seed: 300 + i * 41, biomeId, difficulty: "normal", team: 1, squadSize: 4, unlockedBiomes: ALL_BIOMES })
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
      const m = generateMap({ seed: 42, biomeId: "yard", difficulty, team: 1, squadSize: 4, unlockedBiomes: ALL_BIOMES })
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
