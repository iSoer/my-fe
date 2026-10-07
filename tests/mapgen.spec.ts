import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { generateMap } from '@core/map/generate';
import { isPassable } from '@core/map/pathing';
import type { Difficulty, Pos, TerrainId } from '@core/types';
import { MAP_H, MAP_W, posKey } from '@core/types';
import { difficultyDef } from '@content/balance';
import { BIOMES } from '@content/biomes';
import { classDef } from '@content/classes';

const ALL_BIOMES = BIOMES.map((b) => b.id);

function bfs(tiles: TerrainId[][], from: Pos): Set<string> {
  const seen = new Set<string>([posKey(from)]);
  const q = [from];
  while (q.length) {
    const c = q.shift() as Pos;
    for (const n of [
      { x: c.x + 1, y: c.y },
      { x: c.x - 1, y: c.y },
      { x: c.x, y: c.y + 1 },
      { x: c.x, y: c.y - 1 },
    ]) {
      if (n.x < 0 || n.y < 0 || n.x >= MAP_W || n.y >= MAP_H) continue;
      const k = posKey(n);
      if (seen.has(k) || !isPassable(tiles[n.y]![n.x]!, 'infantry')) continue;
      seen.add(k);
      q.push(n);
    }
  }
  return seen;
}

describe('generateMap', () => {
  it('детерминирована по seed', () => {
    const a = generateMap({ seed: 99, biomeId: 'yard', difficulty: 'normal', squadAvgLevel: 5, squadSize: 4, unlockedBiomes: ALL_BIOMES });
    const b = generateMap({ seed: 99, biomeId: 'yard', difficulty: 'normal', squadAvgLevel: 5, squadSize: 4, unlockedBiomes: ALL_BIOMES });
    expect(a).toEqual(b);
  });

  it('инварианты выполняются для случайных seed × сложностей × биомов', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0x7fffffff }),
        fc.constantFrom<Difficulty>('easy', 'normal', 'hard', 'nightmare'),
        fc.constantFrom(...ALL_BIOMES),
        fc.integer({ min: 1, max: 40 }),
        (seed, difficulty, biomeId, lvl) => {
          const m = generateMap({ seed, biomeId, difficulty, squadAvgLevel: lvl, squadSize: 4, unlockedBiomes: ALL_BIOMES });
          const d = difficultyDef(difficulty);
          expect(m.tiles.length).toBe(MAP_H);
          expect(m.tiles.every((r) => r.length === MAP_W)).toBe(true);
          expect(m.enemies.length).toBeGreaterThanOrEqual(d.enemies[0]);
          expect(m.enemies.length).toBeLessThanOrEqual(d.enemies[1]);
          expect(m.playerSpawns.length).toBe(4);
          // спавны проходимы для своих типов
          for (const p of m.playerSpawns) expect(m.tiles[p.y]![p.x]).toBe('plain');
          for (const e of m.enemies) expect(isPassable(m.tiles[e.pos.y]![e.pos.x]!, classDef(e.unit.classId).moveType)).toBe(true);
          // уникальные позиции
          const all = [...m.playerSpawns, ...m.enemies.map((e) => e.pos)].map(posKey);
          expect(new Set(all).size).toBe(all.length);
          // связность: из первого спавна игрока достижимо ≥80 % врагов (пехотой)
          const reach = bfs(m.tiles, m.playerSpawns[0]!);
          const reachable = m.enemies.filter((e) => reach.has(posKey(e.pos))).length;
          expect(reachable / m.enemies.length).toBeGreaterThanOrEqual(0.8);
          // проходимых клеток ≥ 65 %
          const passable = m.tiles.flat().filter((t) => isPassable(t, 'infantry')).length;
          expect(passable / (MAP_W * MAP_H)).toBeGreaterThanOrEqual(0.65);
          // уровни врагов в диапазоне
          for (const e of m.enemies) {
            expect(e.unit.level).toBeGreaterThanOrEqual(Math.min(40, Math.max(1, lvl + d.levelRange[0])));
            expect(e.unit.level).toBeLessThanOrEqual(Math.max(1, Math.min(40, lvl + d.levelRange[1])));
            expect(e.unit.isEnemy).toBe(true);
          }
          expect(m.reinforcements.length).toBe(d.reinforcements.length);
          if (d.boss) {
            expect(m.enemies.filter((e) => e.unit.isBoss).length).toBe(1);
            expect(m.objective).toBe('killBoss');
          }
          expect(m.rewards.treats).toBeGreaterThan(0);
        },
      ),
      { numRuns: 200 },
    );
  });
});
