import type { BattleState, MapDef, Pos, TerrainId, UnitInstance, UnitSkills, Difficulty, Stance } from '@core/types';
import { MAP_H, MAP_W } from '@core/types';
import { generateUnit } from '@core/units';
import { createBattle } from '@core/battle/reducer';

export interface TestUnitSpec {
  classId: string;
  level?: number;
  seed?: number;
  pos: Pos;
  skills?: Partial<UnitSkills>;
  traitId?: string | null;
  species?: 'cat' | 'dog';
  stance?: Stance;
  baseStats?: Partial<UnitInstance['baseStats']>;
  weaponTier?: 0 | 1 | 2 | 3;
  isBoss?: boolean;
}

let counter = 1;

export function makeUnit(spec: TestUnitSpec, isEnemy: boolean): UnitInstance {
  const seed = spec.seed ?? counter++ * 7919;
  const u = generateUnit({ seed, level: spec.level ?? 1, classId: spec.classId, rarity: 3, isEnemy, species: spec.species, withTrait: false, isBoss: spec.isBoss });
  // Детерминированные статы для тестов: убираем талант/изъян и видовые сдвиги, если заданы baseStats
  if (spec.baseStats) u.baseStats = { ...u.baseStats, ...spec.baseStats };
  delete u.asset;
  delete u.flaw;
  if (spec.traitId === null) delete u.traitId;
  else if (spec.traitId) u.traitId = spec.traitId;
  if (spec.skills) u.skills = { ...u.skills, ...spec.skills };
  if (spec.weaponTier !== undefined) u.weaponTier = spec.weaponTier;
  // убрать стартовые пассивки/спецприёмы, если явно не заданы — чтобы тесты были предсказуемы
  if (!spec.skills?.special) delete u.skills.special;
  if (!spec.skills?.a) delete u.skills.a;
  if (!spec.skills?.b) delete u.skills.b;
  if (!spec.skills?.c) delete u.skills.c;
  if (!spec.skills?.assist && u.classId !== 'infantry_bandage' && u.classId !== 'cavalry_bandage' && u.classId !== 'infantry_purr') delete u.skills.assist;
  return u;
}

export function plainTiles(overrides: Record<string, TerrainId> = {}): TerrainId[][] {
  const tiles: TerrainId[][] = Array.from({ length: MAP_H }, () => Array.from({ length: MAP_W }, (): TerrainId => 'plain'));
  for (const [k, t] of Object.entries(overrides)) {
    const [x, y] = k.split(',').map(Number);
    if (x !== undefined && y !== undefined && tiles[y]) (tiles[y] as TerrainId[])[x] = t;
  }
  return tiles;
}

export interface TestBattle {
  state: BattleState;
  players: UnitInstance[];
  enemies: UnitInstance[];
}

export function makeBattle(
  players: TestUnitSpec[],
  enemies: TestUnitSpec[],
  opts: { tiles?: TerrainId[][]; difficulty?: Difficulty; reinforcements?: MapDef['reinforcements']; objective?: MapDef['objective'] } = {},
): TestBattle {
  const pUnits = players.map((p) => makeUnit(p, false));
  const eUnits = enemies.map((e) => makeUnit(e, true));
  const map: MapDef = {
    seed: 1,
    biomeId: 'yard',
    factionId: 'yard_pack',
    difficulty: opts.difficulty ?? 'normal',
    objective: opts.objective ?? 'rout',
    tiles: opts.tiles ?? plainTiles(),
    playerSpawns: players.map((p) => p.pos),
    enemies: eUnits.map((u, i) => ({ unit: u, pos: (enemies[i] as TestUnitSpec).pos, stance: (enemies[i] as TestUnitSpec).stance ?? 'advance' })),
    reinforcements: opts.reinforcements ?? [],
    rewards: { treats: 100, glory: 3, recruitChance: 0 },
  };
  const { state } = createBattle({ map, squad: pUnits, seed: 42, now: 1000 });
  return { state, players: pUnits, enemies: eUnits };
}
