/** Базовые типы игрового ядра. Никаких зависимостей от DOM/Phaser. */

export type Species = 'cat' | 'dog';
export type Gender = 'm' | 'f';
export type MoveType = 'infantry' | 'armor' | 'cavalry' | 'flier';
export type WeaponKind =
  | 'claw'
  | 'fang'
  | 'stick'
  | 'hiss'
  | 'howl'
  | 'growl'
  | 'slingshot'
  | 'burr'
  | 'bandage'
  | 'purr';
export type Color = 'red' | 'blue' | 'green' | 'colorless';
export type Stat = 'hp' | 'atk' | 'spd' | 'def' | 'res';
export type Stats = Record<Stat, number>;
export type Rarity = 1 | 2 | 3 | 4 | 5;
export type Side = 'player' | 'enemy';
export type Difficulty = 'easy' | 'normal' | 'hard' | 'nightmare';
export type TerrainId = 'plain' | 'forest' | 'mountain' | 'water' | 'wall' | 'wall_breakable' | 'cover';
export type SkillSlot = 'weapon' | 'assist' | 'special' | 'a' | 'b' | 'c';
export type Stance = 'hold' | 'advance' | 'guard';
export type ObjectiveKind = 'rout' | 'killBoss';
export type BattleResult = 'victory' | 'defeat' | 'retreat';

export interface Pos {
  x: number;
  y: number;
}

export const STATS: readonly Stat[] = ['hp', 'atk', 'spd', 'def', 'res'] as const;
export const MAP_W = 6;
export const MAP_H = 8;
export const MAX_LEVEL = 40;
export const SQUAD_SIZE = 4;
export const BARRACKS_CAP = 10;

export function posKey(p: Pos): string {
  return `${p.x},${p.y}`;
}
export function samePos(a: Pos, b: Pos): boolean {
  return a.x === b.x && a.y === b.y;
}
export function manhattan(a: Pos, b: Pos): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
export function inBounds(p: Pos): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < MAP_W && p.y < MAP_H;
}
export function emptyStats(): Stats {
  return { hp: 0, atk: 0, spd: 0, def: 0, res: 0 };
}
export function addStats(a: Stats, b: Partial<Stats>): Stats {
  return {
    hp: a.hp + (b.hp ?? 0),
    atk: a.atk + (b.atk ?? 0),
    spd: a.spd + (b.spd ?? 0),
    def: a.def + (b.def ?? 0),
    res: a.res + (b.res ?? 0),
  };
}
export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Внешность — индексы слоёв, из которых собирается портрет и спрайт. */
export interface Appearance {
  build: 0 | 1 | 2;
  furPalette: number;
  pattern: number;
  eyes: number;
  eyeColor: number;
  accessory: number;
}

export interface UnitHistory {
  battles: number;
  kills: number;
  damageDealt: number;
  damageTaken: number;
  closestCall: number;
}

export interface UnitSkills {
  weapon: string;
  assist?: string;
  special?: string;
  a?: string;
  b?: string;
  c?: string;
}

/** Персонаж (боец игрока или враг) вне боя. */
export interface UnitInstance {
  id: string;
  seed: number;
  name: string;
  epithet?: string;
  gender: Gender;
  species: Species;
  breedId: string;
  traitId?: string;
  personalityId: string;
  classId: string;
  rarity: Rarity;
  level: number;
  xp: number;
  sp: number;
  baseStats: Stats;
  growths: Stats;
  asset?: Stat;
  flaw?: Stat;
  weaponTier: 0 | 1 | 2 | 3;
  skills: UnitSkills;
  learned: string[];
  learnable: string[];
  appearance: Appearance;
  history: UnitHistory;
  createdAt: number;
  isEnemy?: boolean;
  isBoss?: boolean;
  factionId?: string;
}

export interface Army {
  id: string;
  units: UnitInstance[];
  squadIds: string[];
  createdAt: number;
  battles: number;
  wins: number;
}

export interface MapRewards {
  treats: number;
  glory: number;
  recruitChance: number;
}

export interface EnemyPlacement {
  unit: UnitInstance;
  pos: Pos;
  stance: Stance;
}

export interface ReinforcementWave {
  turn: number;
  units: { unit: UnitInstance; pos: Pos }[];
}

export interface MapDef {
  seed: number;
  biomeId: string;
  factionId: string;
  difficulty: Difficulty;
  objective: ObjectiveKind;
  tiles: TerrainId[][];
  playerSpawns: Pos[];
  enemies: EnemyPlacement[];
  reinforcements: ReinforcementWave[];
  rewards: MapRewards;
}

/** Состояние юнита внутри боя. */
export interface BattleUnit {
  unitId: string;
  side: Side;
  pos: Pos;
  hp: number;
  maxHp: number;
  specialCd: number;
  acted: boolean;
  alive: boolean;
  bonuses: Partial<Stats>;
  penalties: Partial<Stats>;
  stance: Stance;
  flags: Record<string, number>;
  /** На каком ходу появился (для подкреплений). */
  spawnedTurn: number;
}

export interface Decal {
  pos: Pos;
  kind: 'splat' | 'pool';
}

export interface BattleStats {
  kills: number;
  damage: number;
  turns: number;
  deaths: string[];
  xpGained: Record<string, number>;
  mvpId?: string;
}

export interface MemorialEntry {
  id: string;
  unit: UnitInstance;
  diedAt: number;
  killerName?: string;
  battleTurn?: number;
  biomeId?: string;
  epitaph: string;
  reason: 'killed' | 'released';
}

export interface Settings {
  music: number;
  sfx: number;
  haptics: boolean;
  animSpeed: 1 | 2;
  cinematic: 'always' | 'mine' | 'never';
  autoEndTurn: boolean;
  dangerZoneDefault: boolean;
  blood: 'sea' | 'pools';
  confirmAttack: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  music: 60,
  sfx: 80,
  haptics: true,
  animSpeed: 1,
  cinematic: 'always',
  autoEndTurn: false,
  dangerZoneDefault: false,
  blood: 'sea',
  confirmAttack: true,
};

/* ---------- Бой: состояние, действия, события ---------- */

export interface BattleState {
  id: string;
  seed: number;
  map: MapDef;
  difficulty: Difficulty;
  turn: number;
  phase: Side;
  units: Record<string, BattleUnit>;
  /** Снимок всех персонажей боя (игрок + враги), XP/уровни меняются здесь, затем сливаются в армию. */
  roster: Record<string, UnitInstance>;
  /** HP хлипких стен по ключу "x,y". */
  walls: Record<string, number>;
  decals: Decal[];
  result?: BattleResult;
  stats: BattleStats;
  spawnedWaves: number[];
  /** Порядок хода врагов в текущей фазе (null = не рассчитан). */
  enemyQueue: string[] | null;
  startedAt: number;
}

export type Effect =
  | { type: 'buff'; unitId: string; stats: Partial<Stats> }
  | { type: 'debuff'; unitId: string; stats: Partial<Stats> }
  | { type: 'heal'; unitId: string; amount: number; sourceId?: string }
  | { type: 'damage'; unitId: string; amount: number; sourceId?: string }
  | { type: 'flag'; unitId: string; key: string; value: number };

export type Triangle = 'adv' | 'dis' | 'neutral';

export interface Strike {
  attackerId: string;
  defenderId: string;
  damage: number;
  special?: string;
  defenseSpecial?: string;
  effective: boolean;
  triangle: Triangle;
  healed: number;
  isCounter: boolean;
  range: number;
  attackerHpAfter: number;
  defenderHpAfter: number;
  miracle?: boolean;
}

export type BattleAction =
  | { type: 'attack'; unitId: string; to: Pos; targetId: string; newStance?: Stance }
  | { type: 'attackWall'; unitId: string; to: Pos; wall: Pos; newStance?: Stance }
  | { type: 'assist'; unitId: string; to: Pos; targetId: string; newStance?: Stance }
  | { type: 'wait'; unitId: string; to: Pos; newStance?: Stance }
  | { type: 'endPhase' }
  | { type: 'retreat' };

export type BattleEvent =
  | { type: 'moved'; unitId: string; path: Pos[] }
  | {
      type: 'combat';
      attackerId: string;
      defenderId: string;
      attackerPos: Pos;
      defenderPos: Pos;
      strikes: Strike[];
      attackerHpBefore: number;
      defenderHpBefore: number;
      attackerHpAfter: number;
      defenderHpAfter: number;
    }
  | { type: 'wallHit'; unitId: string; pos: Pos; hpAfter: number }
  | {
      type: 'assist';
      unitId: string;
      targetId: string;
      assistId: string;
      moves: { unitId: string; to: Pos }[];
      heal: number;
      targetHpAfter?: number;
      unitHpAfter?: number;
    }
  | { type: 'effect'; effect: Effect; hpAfter?: number }
  | { type: 'died'; unitId: string; killerId?: string; pos: Pos; side: Side }
  | { type: 'xp'; unitId: string; amount: number; sp: number }
  | { type: 'levelUp'; unitId: string; level: number; gains: Partial<Stats> }
  | { type: 'waited'; unitId: string }
  | { type: 'phaseChanged'; phase: Side; turn: number }
  | { type: 'reinforcements'; unitIds: string[] }
  | { type: 'battleEnded'; result: BattleResult };

export interface ReduceResult {
  state: BattleState;
  events: BattleEvent[];
}

/* ---------- Сейв ---------- */

export interface Profile {
  glory: number;
  treats: number;
  wins: Record<Difficulty, number>;
  armiesCreated: number;
  /** Сколько раз перемешивали текущий ростер (для цены). */
  rosterRerolls: number;
  freeRerolls: number;
}

export interface Shelter {
  candidates: UnitInstance[];
  captive?: UnitInstance;
  seed: number;
}

export interface GlobalStats {
  battles: number;
  wins: number;
  kills: number;
  deaths: number;
  armiesLost: number;
}

export interface LevelUpSummary {
  unitId: string;
  from: number;
  to: number;
  gains: Partial<Stats>;
}

export interface BattleSummary {
  result: BattleResult;
  difficulty: Difficulty;
  biomeId: string;
  turns: number;
  kills: number;
  damage: number;
  fallen: MemorialEntry[];
  xp: Record<string, number>;
  levelUps: LevelUpSummary[];
  rewards: { treats: number; glory: number; flawless: boolean };
  captive?: UnitInstance;
  mvpId?: string;
  survivors: UnitInstance[];
  armyFell: boolean;
}

export interface PendingRoster {
  seed: number;
  rerolls: number;
  /** Куда вернуться после создания армии. */
  returnTo: 'battle' | 'army';
}

export interface SaveGame {
  version: number;
  updatedAt: number;
  profile: Profile;
  army?: Army;
  battle?: BattleState;
  shelter: Shelter;
  memorial: MemorialEntry[];
  achievements: string[];
  settings: Settings;
  stats: GlobalStats;
  pendingRoster?: PendingRoster;
  lastBattle?: BattleSummary;
}
