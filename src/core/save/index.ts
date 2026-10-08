import { z } from 'zod';
import LZString from 'lz-string';
import type { SaveGame } from '../types';
import { DEFAULT_SETTINGS } from '../types';

export const SAVE_VERSION = 2;

const stat = z.number();
const statsSchema = z.object({ hp: stat, atk: stat, spd: stat, def: stat, res: stat });
const partialStats = z.object({ hp: stat.optional(), atk: stat.optional(), spd: stat.optional(), def: stat.optional(), res: stat.optional() });
const pos = z.object({ x: z.number().int(), y: z.number().int() });
const statName = z.enum(['hp', 'atk', 'spd', 'def', 'res']);
const difficulty = z.enum(['easy', 'normal', 'hard', 'nightmare']);

const unitSchema = z.object({
  id: z.string(),
  seed: z.number(),
  name: z.string(),
  epithet: z.string().optional(),
  gender: z.enum(['m', 'f']),
  species: z.enum(['cat', 'dog', 'mouse']),
  breedId: z.string(),
  traitId: z.string().optional(),
  personalityId: z.string(),
  classId: z.string(),
  rarity: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  level: z.number().int().min(1).max(40),
  xp: z.number(),
  sp: z.number(),
  baseStats: statsSchema,
  growths: statsSchema,
  asset: statName.optional(),
  flaw: statName.optional(),
  weaponTier: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  skills: z.object({
    weapon: z.string(),
    assist: z.string().optional(),
    special: z.string().optional(),
    a: z.string().optional(),
    b: z.string().optional(),
    c: z.string().optional(),
  }),
  learned: z.array(z.string()),
  learnable: z.array(z.string()),
  appearance: z.object({
    build: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    furPalette: z.number(),
    pattern: z.number(),
    eyes: z.number(),
    eyeColor: z.number(),
    accessory: z.number(),
  }),
  history: z.object({ battles: z.number(), kills: z.number(), damageDealt: z.number(), damageTaken: z.number(), closestCall: z.number() }),
  createdAt: z.number(),
  isEnemy: z.boolean().optional(),
  isBoss: z.boolean().optional(),
  factionId: z.string().optional(),
});

const armySchema = z.object({
  id: z.string(),
  units: z.array(unitSchema),
  squadIds: z.array(z.string()),
  createdAt: z.number(),
  battles: z.number(),
  wins: z.number(),
});

const terrain = z.enum(['plain', 'forest', 'mountain', 'water', 'wall', 'wall_breakable', 'cover']);
const stance = z.enum(['hold', 'advance', 'guard']);

const mapSchema = z.object({
  seed: z.number(),
  biomeId: z.string(),
  factionId: z.string(),
  difficulty,
  objective: z.enum(['rout', 'killBoss']),
  tiles: z.array(z.array(terrain)),
  playerSpawns: z.array(pos),
  enemies: z.array(z.object({ unit: unitSchema, pos, stance })),
  reinforcements: z.array(z.object({ turn: z.number(), units: z.array(z.object({ unit: unitSchema, pos })) })),
  rewards: z.object({ treats: z.number(), glory: z.number(), recruitChance: z.number() }),
});

const battleUnitSchema = z.object({
  unitId: z.string(),
  side: z.enum(['player', 'enemy']),
  pos,
  hp: z.number(),
  maxHp: z.number(),
  specialCd: z.number(),
  acted: z.boolean(),
  alive: z.boolean(),
  bonuses: partialStats,
  penalties: partialStats,
  stance,
  flags: z.record(z.string(), z.number()),
  spawnedTurn: z.number(),
});

const battleSchema = z.object({
  id: z.string(),
  seed: z.number(),
  map: mapSchema,
  difficulty,
  turn: z.number(),
  phase: z.enum(['player', 'enemy']),
  units: z.record(z.string(), battleUnitSchema),
  roster: z.record(z.string(), unitSchema),
  walls: z.record(z.string(), z.number()),
  decals: z.array(z.object({ pos, kind: z.enum(['splat', 'pool']) })),
  result: z.enum(['victory', 'defeat', 'retreat']).optional(),
  stats: z.object({
    kills: z.number(),
    damage: z.number(),
    turns: z.number(),
    deaths: z.array(z.string()),
    xpGained: z.record(z.string(), z.number()),
    mvpId: z.string().optional(),
  }),
  spawnedWaves: z.array(z.number()),
  enemyQueue: z.array(z.string()).nullable(),
  startedAt: z.number(),
});

const memorialSchema = z.object({
  id: z.string(),
  unit: unitSchema,
  diedAt: z.number(),
  killerName: z.string().optional(),
  battleTurn: z.number().optional(),
  biomeId: z.string().optional(),
  epitaph: z.string(),
  reason: z.enum(['killed', 'released']),
});

const settingsSchema = z.object({
  music: z.number(),
  sfx: z.number(),
  haptics: z.boolean(),
  animSpeed: z.union([z.literal(1), z.literal(2)]),
  cinematic: z.enum(['always', 'mine', 'never']),
  autoEndTurn: z.boolean(),
  dangerZoneDefault: z.boolean(),
  blood: z.enum(['sea', 'pools']),
  confirmAttack: z.boolean(),
});

const levelUpSchema = z.object({ unitId: z.string(), from: z.number(), to: z.number(), gains: partialStats });

const summarySchema = z.object({
  result: z.enum(['victory', 'defeat', 'retreat']),
  difficulty,
  biomeId: z.string(),
  turns: z.number(),
  kills: z.number(),
  damage: z.number(),
  fallen: z.array(memorialSchema),
  xp: z.record(z.string(), z.number()),
  levelUps: z.array(levelUpSchema),
  rewards: z.object({ treats: z.number(), glory: z.number(), flawless: z.boolean() }),
  captive: unitSchema.optional(),
  mvpId: z.string().optional(),
  survivors: z.array(unitSchema),
  armyFell: z.boolean(),
});

export const saveSchema = z.object({
  version: z.number().int(),
  updatedAt: z.number(),
  profile: z.object({
    glory: z.number(),
    treats: z.number(),
    wins: z.object({ easy: z.number(), normal: z.number(), hard: z.number(), nightmare: z.number() }),
    armiesCreated: z.number(),
    rosterRerolls: z.number(),
    freeRerolls: z.number(),
    hiresSinceBattle: z.number(),
  }),
  army: armySchema.optional(),
  battle: battleSchema.optional(),
  shelter: z.object({ candidates: z.array(unitSchema), captive: unitSchema.optional(), seed: z.number() }),
  memorial: z.array(memorialSchema),
  achievements: z.array(z.string()),
  settings: settingsSchema,
  stats: z.object({ battles: z.number(), wins: z.number(), kills: z.number(), deaths: z.number(), armiesLost: z.number() }),
  pendingRoster: z.object({ seed: z.number(), rerolls: z.number(), returnTo: z.enum(['battle', 'army']) }).optional(),
  lastBattle: summarySchema.optional(),
});

export function createEmptySave(now: number): SaveGame {
  return {
    version: SAVE_VERSION,
    updatedAt: now,
    profile: { glory: 0, treats: 0, wins: { easy: 0, normal: 0, hard: 0, nightmare: 0 }, armiesCreated: 0, rosterRerolls: 0, freeRerolls: 0, hiresSinceBattle: 0 },
    shelter: { candidates: [], seed: 0 },
    memorial: [],
    achievements: [],
    settings: { ...DEFAULT_SETTINGS },
    stats: { battles: 0, wins: 0, kills: 0, deaths: 0, armiesLost: 0 },
  };
}

/** Миграции: ключ — версия, С которой мигрируем. */
export const MIGRATIONS: Record<number, (old: Record<string, unknown>) => Record<string, unknown>> = {
  // v1 → v2: армия из 4 слотов (лишние бойцы уходят на Кладбище как «ушедшие»), счётчик наймов.
  1: (old) => {
    const data = { ...old } as Record<string, unknown>;
    const profile = { ...((data['profile'] as Record<string, unknown>) ?? {}) };
    if (typeof profile['hiresSinceBattle'] !== 'number') profile['hiresSinceBattle'] = 0;
    data['profile'] = profile;
    const army = data['army'] as { units?: Array<Record<string, unknown>>; squadIds?: string[] } | undefined;
    if (army && Array.isArray(army.units) && army.units.length > 4) {
      const squad = new Set(army.squadIds ?? []);
      const kept = [...army.units.filter((u) => squad.has(String(u['id']))), ...army.units.filter((u) => !squad.has(String(u['id'])))].slice(0, 4);
      const dropped = army.units.filter((u) => !kept.includes(u));
      const memorial = Array.isArray(data['memorial']) ? [...(data['memorial'] as unknown[])] : [];
      const now = Date.now();
      for (const u of dropped) {
        memorial.push({ id: `m_${String(u['id'])}_${now.toString(36)}`, unit: u, diedAt: now, epitaph: 'Ушёл при переезде в новую казарму. Писем не шлёт.', reason: 'released' });
      }
      data['memorial'] = memorial;
      data['army'] = { ...army, units: kept, squadIds: kept.map((u) => String(u['id'])) };
    } else if (army && Array.isArray(army.units)) {
      data['army'] = { ...army, squadIds: army.units.map((u) => String(u['id'])) };
    }
    data['version'] = 2;
    return data;
  },
};

export function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  let data = raw;
  let v = typeof data['version'] === 'number' ? (data['version'] as number) : 0;
  while (v < SAVE_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) break;
    data = m(data);
    v = typeof data['version'] === 'number' ? (data['version'] as number) : v + 1;
  }
  return data;
}

export type ParseResult = { ok: true; save: SaveGame } | { ok: false; error: string };

export function parseSave(json: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    return { ok: false, error: `JSON: ${(e as Error).message}` };
  }
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'не объект' };
  const migrated = migrate(raw as Record<string, unknown>);
  const res = saveSchema.safeParse(migrated);
  if (!res.success) return { ok: false, error: res.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).slice(0, 5).join('; ') };
  return { ok: true, save: res.data as SaveGame };
}

export function serializeSave(save: SaveGame): string {
  return JSON.stringify(save);
}

export const CLOUD_CHUNK = 4000;

export function compressSave(save: SaveGame): string {
  return LZString.compressToUTF16(serializeSave(save));
}

export function decompressSave(data: string): ParseResult {
  const json = LZString.decompressFromUTF16(data);
  if (!json) return { ok: false, error: 'не удалось распаковать' };
  return parseSave(json);
}

export function chunkString(s: string, size = CLOUD_CHUNK): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out;
}

export function hashSave(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}
