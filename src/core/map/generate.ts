import type { Rng } from '../rng';
import { createRng } from '../rng';
import type { Difficulty, EnemyPlacement, MapDef, MoveType, ObjectiveKind, Pos, Rarity, ReinforcementWave, Species, TerrainId, UnitInstance } from '../types';
import { MAP_H, MAP_W, clamp, inBounds, posKey } from '../types';
import { isPassable } from './pathing';
import { generateUnit } from '../units';
import { BIOMES, biomeDef } from '@content/biomes';
import { DIFFICULTIES, REWARDS, TERRAIN_SHARE, difficultyDef } from '@content/balance';
import { CLASSES, classDef } from '@content/classes';
import { factionDef } from '@content/factions';

export interface GenerateMapOptions {
  seed: number;
  biomeId: string | 'random';
  difficulty: Difficulty;
  squadAvgLevel: number;
  squadSize: number;
  unlockedBiomes: string[];
  now?: number;
}

type Grid = TerrainId[][];

function emptyGrid(): Grid {
  return Array.from({ length: MAP_H }, () => Array.from({ length: MAP_W }, (): TerrainId => 'plain'));
}

function cells(): Pos[] {
  const out: Pos[] = [];
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) out.push({ x, y });
  return out;
}

function neighbors4(p: Pos): Pos[] {
  return [
    { x: p.x + 1, y: p.y },
    { x: p.x - 1, y: p.y },
    { x: p.x, y: p.y + 1 },
    { x: p.x, y: p.y - 1 },
  ].filter(inBounds);
}

function get(g: Grid, p: Pos): TerrainId {
  return g[p.y]?.[p.x] ?? 'wall';
}
function set(g: Grid, p: Pos, t: TerrainId): void {
  const row = g[p.y];
  if (row) row[p.x] = t;
}

function playerSpawnsFor(size: number): Pos[] {
  const order: Pos[] = [
    { x: 1, y: 7 },
    { x: 4, y: 7 },
    { x: 2, y: 7 },
    { x: 3, y: 7 },
    { x: 2, y: 6 },
    { x: 3, y: 6 },
  ];
  return order.slice(0, Math.max(1, Math.min(size, 6)));
}

function scatter(g: Grid, rng: Rng, terrain: TerrainId, count: number, allowed: (p: Pos) => boolean): void {
  let placed = 0;
  let guard = 0;
  while (placed < count && guard++ < 400) {
    const p = { x: rng.int(0, MAP_W - 1), y: rng.int(0, MAP_H - 1) };
    if (get(g, p) !== 'plain' || !allowed(p)) continue;
    set(g, p, terrain);
    placed++;
  }
}

function growBlob(g: Grid, rng: Rng, terrain: TerrainId, size: number, allowed: (p: Pos) => boolean): void {
  let start: Pos | null = null;
  for (let i = 0; i < 50 && !start; i++) {
    const p = { x: rng.int(0, MAP_W - 1), y: rng.int(0, MAP_H - 1) };
    if (get(g, p) === 'plain' && allowed(p)) start = p;
  }
  if (!start) return;
  const blob: Pos[] = [start];
  set(g, start, terrain);
  let guard = 0;
  while (blob.length < size && guard++ < 60) {
    const from = rng.pick(blob);
    const n = rng.pick(neighbors4(from));
    if (get(g, n) === 'plain' && allowed(n)) {
      set(g, n, terrain);
      blob.push(n);
    }
  }
}

function wallSegment(g: Grid, rng: Rng, allowed: (p: Pos) => boolean): void {
  const len = rng.int(2, 3);
  const horizontal = rng.chance(0.5);
  const start = { x: rng.int(0, MAP_W - (horizontal ? len : 1)), y: rng.int(1, MAP_H - 2 - (horizontal ? 0 : len - 1)) };
  for (let i = 0; i < len; i++) {
    const p = horizontal ? { x: start.x + i, y: start.y } : { x: start.x, y: start.y + i };
    if (get(g, p) === 'plain' && allowed(p)) set(g, p, 'wall');
  }
}

function bfsReach(g: Grid, from: Pos, moveType: MoveType): Set<string> {
  const seen = new Set<string>([posKey(from)]);
  const q = [from];
  while (q.length > 0) {
    const c = q.shift() as Pos;
    for (const n of neighbors4(c)) {
      const k = posKey(n);
      if (seen.has(k) || !isPassable(get(g, n), moveType)) continue;
      seen.add(k);
      q.push(n);
    }
  }
  return seen;
}

function validate(g: Grid, playerSpawns: Pos[], enemySpawns: Pos[]): boolean {
  const all = cells();
  const passable = all.filter((p) => isPassable(get(g, p), 'infantry'));
  if (passable.length / all.length < 0.65) return false;
  for (let y = 0; y < MAP_H; y++) if ((g[y] ?? []).filter((t) => isPassable(t, 'infantry')).length < 2) return false;
  const first = playerSpawns[0];
  if (!first) return false;
  const reach = bfsReach(g, first, 'infantry');
  for (const p of playerSpawns) if (!reach.has(posKey(p))) return false;
  const reachableEnemies = enemySpawns.filter((p) => reach.has(posKey(p))).length;
  if (enemySpawns.length > 0 && reachableEnemies / enemySpawns.length < 0.8) return false;
  for (const p of [...playerSpawns, ...enemySpawns]) {
    const blocked = neighbors4(p).filter((n) => !isPassable(get(g, n), 'infantry')).length;
    if (blocked + (4 - neighbors4(p).length) >= 3) return false;
  }
  return true;
}

function pickEnemyClass(rng: Rng, roles: { melee: number; ranged: number; healer: number; purr: number; heavy: number }, difficulty: Difficulty): string {
  const pool = CLASSES.filter((c) => c.weaponKind !== 'purr' || roles.purr === 0);
  const want: Partial<Record<string, number>> = {};
  for (const c of pool) {
    let w = c.weight;
    const k = c.weaponKind;
    if (roles.melee === 0 && ['claw', 'fang', 'stick'].includes(k)) w *= 4;
    if (roles.ranged === 0 && ['hiss', 'howl', 'growl', 'slingshot', 'burr'].includes(k)) w *= 4;
    if (k === 'bandage') w = roles.healer > 0 ? 0 : difficulty === 'easy' ? 0 : w;
    if (k === 'purr') w = difficulty === 'easy' || difficulty === 'normal' ? 0 : w;
    if ((difficulty === 'hard' || difficulty === 'nightmare') && roles.heavy === 0 && (c.moveType === 'armor' || c.moveType === 'cavalry')) w *= 3;
    want[c.id] = w;
  }
  return rng.weighted(pool.map((c) => ({ item: c.id, w: want[c.id] ?? 0 })));
}

function makeEnemy(rng: Rng, level: number, rarityRange: [Rarity, Rarity], factionId: string, classId: string, difficulty: Difficulty, isBoss: boolean, now?: number): UnitInstance {
  const faction = factionDef(factionId);
  const rarity = clamp(rng.int(rarityRange[0], rarityRange[1]) + (isBoss ? 1 : 0), 1, 5) as Rarity;
  const species = rng.weighted((Object.entries(faction.species) as [Species, number][]).map(([item, w]) => ({ item, w })));
  const u = generateUnit({
    seed: rng.int(0, 0x7fffffff),
    level,
    rarity,
    species,
    classId,
    isEnemy: true,
    factionId,
    isBoss,
    withTrait: isBoss || difficulty === 'hard' || difficulty === 'nightmare',
    now,
  });
  return u;
}

/** Мотивы раскладки поля: добавляют узнаваемую структуру поверх случайной местности. */
export type MapMotif = 'open' | 'river' | 'corridor' | 'islands' | 'fort' | 'ruins';

const MOTIF_WEIGHTS: Record<string, Partial<Record<MapMotif, number>>> = {
  default: { open: 4, river: 2, corridor: 2, islands: 1, fort: 1, ruins: 1 },
  yard: { open: 4, river: 1, corridor: 2, islands: 1, fort: 2, ruins: 1 },
  roofs: { open: 3, corridor: 3, islands: 2, fort: 1, ruins: 2 },
  basement: { open: 2, corridor: 4, fort: 2, ruins: 2 },
  dump: { open: 3, corridor: 2, islands: 1, fort: 1, ruins: 3 },
  winter_park: { open: 3, river: 2, corridor: 1, islands: 2, fort: 1 },
  jungle: { open: 2, river: 4, islands: 2, ruins: 3, corridor: 1 },
  desert: { open: 5, corridor: 2, ruins: 2, fort: 1 },
  glacier: { open: 2, islands: 4, river: 2, corridor: 1 },
  canyon: { open: 2, corridor: 5, fort: 2, ruins: 1 },
};

function pickMotif(rng: Rng, biomeId: string): MapMotif {
  const w = MOTIF_WEIGHTS[biomeId] ?? MOTIF_WEIGHTS['default'] ?? {};
  return rng.weighted((Object.entries(w) as [MapMotif, number][]).map(([item, wt]) => ({ item, w: wt })));
}

/** Применить мотив к уже засеянной сетке. Валидация ниже отбросит непроходимые варианты. */
function applyMotif(g: Grid, rng: Rng, motif: MapMotif, allowed: (p: Pos) => boolean, waterLike: TerrainId): void {
  switch (motif) {
    case 'river': {
      // Полоса воды поперёк поля с 1–2 бродами
      const horizontal = rng.chance(0.65);
      if (horizontal) {
        const y = rng.int(3, 4);
        const fords = new Set([rng.int(0, MAP_W - 1)]);
        if (rng.chance(0.6)) fords.add(rng.int(0, MAP_W - 1));
        for (let x = 0; x < MAP_W; x++) {
          const p = { x, y };
          if (!allowed(p)) continue;
          set(g, p, fords.has(x) ? 'plain' : waterLike);
        }
      } else {
        const x = rng.int(2, 3);
        const fords = new Set([rng.int(1, MAP_H - 2), rng.int(1, MAP_H - 2)]);
        for (let y = 1; y < MAP_H - 1; y++) {
          const p = { x, y };
          if (!allowed(p)) continue;
          set(g, p, fords.has(y) ? 'plain' : waterLike);
        }
      }
      break;
    }
    case 'corridor': {
      // Две стены-«направляющие», между ними проход
      const x1 = rng.int(1, 2);
      const x2 = rng.int(3, 4);
      const y0 = rng.int(2, 3);
      const len = rng.int(2, 3);
      for (let i = 0; i < len; i++) {
        for (const x of [x1, x2]) {
          const p = { x, y: y0 + i };
          if (allowed(p) && get(g, p) !== 'water' && get(g, p) !== 'mountain') set(g, p, rng.chance(0.2) ? 'wall_breakable' : 'wall');
        }
      }
      break;
    }
    case 'islands': {
      for (let i = 0; i < rng.int(3, 4); i++) growBlob(g, rng, waterLike, rng.int(2, 3), (p) => allowed(p) && p.y > 1 && p.y < MAP_H - 2);
      break;
    }
    case 'fort': {
      // Вражеская зона огорожена стеной с 1–2 «воротами» из хлипкой стены
      const y = 3;
      const gates = new Set([rng.int(1, MAP_W - 2)]);
      if (rng.chance(0.5)) gates.add(rng.int(1, MAP_W - 2));
      for (let x = 0; x < MAP_W; x++) {
        const p = { x, y };
        if (!allowed(p)) continue;
        set(g, p, gates.has(x) ? 'wall_breakable' : 'wall');
      }
      // внутри крепости — укрытия
      for (let i = 0; i < 2; i++) {
        const p = { x: rng.int(0, MAP_W - 1), y: rng.int(1, 2) };
        if (allowed(p) && get(g, p) === 'plain') set(g, p, 'cover');
      }
      break;
    }
    case 'ruins': {
      // Разбросанные обломки стен и укрытия
      for (let i = 0; i < rng.int(3, 5); i++) {
        const p = { x: rng.int(0, MAP_W - 1), y: rng.int(1, MAP_H - 2) };
        if (allowed(p) && get(g, p) === 'plain') set(g, p, rng.chance(0.5) ? 'wall_breakable' : 'cover');
      }
      break;
    }
    default:
      break;
  }
}

export function availableBiomes(unlocked: string[]): string[] {
  return BIOMES.filter((b) => unlocked.includes(b.id) || b.unlockWins === 0).map((b) => b.id);
}

export function generateMap(opts: GenerateMapOptions): MapDef {
  const root = createRng(opts.seed);
  const diff = difficultyDef(opts.difficulty);
  const biomeId = opts.biomeId === 'random' ? root.fork('biome').pick(availableBiomes(opts.unlockedBiomes)) : opts.biomeId;
  const biome = biomeDef(biomeId);
  const playerSpawns = playerSpawnsFor(opts.squadSize);
  const enemyCount = root.fork('count').int(diff.enemies[0], diff.enemies[1]);

  let tiles: Grid | null = null;
  let enemySpawns: Pos[] = [];
  const reserved = new Set<string>(playerSpawns.map(posKey));

  for (let attempt = 0; attempt < 50 && !tiles; attempt++) {
    const rng = root.fork(`terrain:${attempt}`);
    const g = emptyGrid();
    const total = MAP_W * MAP_H;
    const allowed = (p: Pos): boolean => !reserved.has(posKey(p));

    const forestShare = clamp(rng.next() * (TERRAIN_SHARE.forest[1] - TERRAIN_SHARE.forest[0]) + TERRAIN_SHARE.forest[0] + biome.bias.forest, 0.05, 0.35);
    const wallShare = clamp(rng.next() * (TERRAIN_SHARE.walls[1] - TERRAIN_SHARE.walls[0]) + TERRAIN_SHARE.walls[0] + biome.bias.walls, 0.03, 0.18);
    const impShare = clamp(rng.next() * (TERRAIN_SHARE.impassable[1] - TERRAIN_SHARE.impassable[0]) + TERRAIN_SHARE.impassable[0] + biome.bias.impassable, 0, 0.15);

    const forestCells = Math.round(total * forestShare);
    let placedForest = 0;
    while (placedForest < forestCells) {
      const size = rng.int(2, 4);
      growBlob(g, rng, 'forest', size, allowed);
      placedForest += size;
    }
    const wallCells = Math.round(total * wallShare);
    for (let placed = 0; placed < wallCells; placed += 2) wallSegment(g, rng, allowed);
    const impCells = Math.round(total * impShare);
    let placedImp = 0;
    while (placedImp < impCells) {
      const size = rng.int(1, 3);
      const t: TerrainId = rng.chance(biome.bias.mountainVsWater) ? 'mountain' : 'water';
      growBlob(g, rng, t, size, (p) => allowed(p) && p.y > 0 && p.y < MAP_H - 1);
      placedImp += size;
    }
    // Мотив раскладки — узнаваемая структура поля
    const motif = pickMotif(rng.fork('motif'), biome.id);
    applyMotif(g, rng.fork('motif-apply'), motif, allowed, biome.bias.mountainVsWater > 0.75 ? 'mountain' : 'water');

    const covers = rng.int(TERRAIN_SHARE.covers[0], TERRAIN_SHARE.covers[1]) + biome.bias.covers;
    scatter(g, rng, 'cover', covers, (p) => allowed(p) && p.y > 2 && p.y < 6);
    scatter(g, rng, 'cover', diff.enemyCovers, (p) => allowed(p) && p.y <= 2);
    const breakable = rng.int(TERRAIN_SHARE.breakable[0], TERRAIN_SHARE.breakable[1]);
    scatter(g, rng, 'wall_breakable', breakable, (p) => allowed(p) && p.y > 1 && p.y < 6);

    // Спавны игрока — всегда проходимы
    for (const p of playerSpawns) set(g, p, 'plain');

    // Спавны врагов в рядах 0–2
    const candidates = rng.shuffle(cells().filter((p) => p.y <= 2 && isPassable(get(g, p), 'infantry')));
    enemySpawns = candidates.slice(0, enemyCount);
    if (enemySpawns.length < enemyCount) continue;
    if (validate(g, playerSpawns, enemySpawns)) tiles = g;
  }

  if (!tiles) {
    tiles = emptyGrid();
    for (const p of [{ x: 0, y: 3 }, { x: 5, y: 4 }, { x: 2, y: 3 }, { x: 3, y: 4 }]) set(tiles, p, 'forest');
    set(tiles, { x: 2, y: 5 }, 'cover');
    set(tiles, { x: 3, y: 2 }, 'cover');
    enemySpawns = [{ x: 1, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 0, y: 2 }, { x: 5, y: 2 }, { x: 1, y: 2 }, { x: 4, y: 2 }].slice(0, enemyCount);
  }

  // Враги
  const erng = root.fork('enemies');
  const factionId = biome.factionId;
  const roles = { melee: 0, ranged: 0, healer: 0, purr: 0, heavy: 0 };
  const colorCount: Record<string, number> = {};
  const enemies: EnemyPlacement[] = [];
  const bossIndex = diff.boss ? 0 : -1;
  const sortedSpawns = [...enemySpawns].sort((a, b) => b.y - a.y || a.x - b.x); // ближние к игроку — первыми (ближники)

  const classFor = (i: number): string => {
    let classId = pickEnemyClass(erng, roles, opts.difficulty);
    const cls = classDef(classId);
    const color = cls.weaponKind;
    // не более 60 % одного оружия
    if ((colorCount[color] ?? 0) + 1 > Math.ceil(enemyCount * 0.6) && i > 0) classId = pickEnemyClass(erng, roles, opts.difficulty);
    const c2 = classDef(classId);
    colorCount[c2.weaponKind] = (colorCount[c2.weaponKind] ?? 0) + 1;
    if (['claw', 'fang', 'stick'].includes(c2.weaponKind)) roles.melee++;
    if (['hiss', 'howl', 'growl', 'slingshot', 'burr'].includes(c2.weaponKind)) roles.ranged++;
    if (c2.weaponKind === 'bandage') roles.healer++;
    if (c2.weaponKind === 'purr') roles.purr++;
    if (c2.moveType === 'armor' || c2.moveType === 'cavalry') roles.heavy++;
    return classId;
  };

  const levelOf = (): number => clamp(opts.squadAvgLevel + erng.int(diff.levelRange[0], diff.levelRange[1]), 1, 40);
  const classIds = Array.from({ length: enemyCount }, (_, i) => classFor(i));
  // Расстановка: ближники/броня — ближе к игроку, дальники/лекари — дальше
  const melee = classIds.filter((c) => ['claw', 'fang', 'stick', 'purr'].includes(classDef(c).weaponKind));
  const ranged = classIds.filter((c) => !melee.includes(c));
  const ordered = [...melee, ...ranged];
  const holdCount = Math.round(enemyCount * diff.holdRatio);
  ordered.forEach((classId, i) => {
    const pos = sortedSpawns[i];
    if (!pos) return;
    const isBoss = i === bossIndex && diff.boss;
    const unit = makeEnemy(erng, levelOf(), diff.rarity, factionId, classId, opts.difficulty, isBoss, opts.now);
    const stance = isBoss ? 'guard' : i < holdCount ? 'hold' : 'advance';
    enemies.push({ unit, pos, stance });
  });
  if (diff.boss) {
    // Босс стоит дальше всех — в ряду 0 по центру, если свободно
    const boss = enemies.find((e) => e.unit.isBoss);
    const far = [...enemySpawns].sort((a, b) => a.y - b.y || Math.abs(a.x - 2.5) - Math.abs(b.x - 2.5))[0];
    if (boss && far) {
      const other = enemies.find((e) => e.pos.x === far.x && e.pos.y === far.y);
      if (other && other !== boss) other.pos = boss.pos;
      boss.pos = far;
    }
  }
  // Клетка под каждым врагом должна быть проходима для его типа движения
  for (const e of enemies) if (!isPassable(get(tiles, e.pos), classDef(e.unit.classId).moveType)) set(tiles, e.pos, 'plain');

  // Подкрепления
  const reinforcements: ReinforcementWave[] = [];
  const rrng = root.fork('reinforcements');
  const topFree = cells().filter((p) => p.y === 0 && isPassable(get(tiles, p), 'infantry'));
  for (const wave of diff.reinforcements) {
    const units: ReinforcementWave['units'] = [];
    const spots = rrng.shuffle(topFree);
    for (let i = 0; i < wave.count; i++) {
      const pos = spots[i % Math.max(1, spots.length)] ?? { x: i, y: 0 };
      const classId = pickEnemyClass(rrng, { melee: 1, ranged: 1, healer: 1, purr: 1, heavy: 0 }, opts.difficulty);
      if (!isPassable(get(tiles, pos), classDef(classId).moveType)) set(tiles, pos, 'plain');
      units.push({ unit: makeEnemy(rrng, levelOf(), diff.rarity, factionId, classId, opts.difficulty, false, opts.now), pos });
    }
    reinforcements.push({ turn: wave.turn, units });
  }

  const objective: ObjectiveKind = diff.objective;
  const treats = Math.round((REWARDS.treatsBase + REWARDS.treatsPerLevel * opts.squadAvgLevel) * diff.treatsMult);

  return {
    seed: opts.seed,
    biomeId,
    factionId,
    difficulty: opts.difficulty,
    objective,
    tiles,
    playerSpawns,
    enemies,
    reinforcements,
    rewards: { treats, glory: diff.glory, recruitChance: diff.recruitChance },
  };
}

export { DIFFICULTIES };
