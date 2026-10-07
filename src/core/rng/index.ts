/** Сидированный PRNG (mulberry32) с раздельными стримами. */

export interface Rng {
  readonly seed: number;
  /** [0, 1) */
  next(): number;
  /** Целое в [min, max] включительно. */
  int(min: number, max: number): number;
  pick<T>(arr: readonly T[]): T;
  shuffle<T>(arr: readonly T[]): T[];
  chance(p: number): boolean;
  weighted<T>(items: readonly { item: T; w: number }[]): T;
  /** Производный независимый стрим. */
  fork(label: string | number): Rng;
}

export function hashString(s: string): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mixSeed(seed: number, label: string | number): number {
  const h = typeof label === 'number' ? label >>> 0 : hashString(label);
  let x = (seed ^ h) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x === 0 ? 0x9e3779b9 : x;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    seed: seed >>> 0,
    next,
    int(min, max) {
      if (max < min) [min, max] = [max, min];
      return min + Math.floor(next() * (max - min + 1));
    },
    pick(arr) {
      if (arr.length === 0) throw new Error('pick from empty array');
      return arr[Math.floor(next() * arr.length)] as (typeof arr)[number];
    },
    shuffle(arr) {
      const out = [...arr];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = out[i] as (typeof arr)[number];
        out[i] = out[j] as (typeof arr)[number];
        out[j] = tmp;
      }
      return out;
    },
    chance(p) {
      return next() < p;
    },
    weighted(items) {
      let total = 0;
      for (const it of items) total += Math.max(0, it.w);
      if (total <= 0) throw new Error('weighted: total weight is 0');
      let r = next() * total;
      for (const it of items) {
        r -= Math.max(0, it.w);
        if (r < 0) return it.item;
      }
      return (items[items.length - 1] as (typeof items)[number]).item;
    },
    fork(label) {
      return createRng(mixSeed(seed, label));
    },
  };
  return rng;
}

/** Случайный seed для новых сущностей (из Math.random, единственное место его использования). */
export function randomSeed(): number {
  return (Math.floor(Math.random() * 0xffffffff) ^ (Date.now() & 0xffffffff)) >>> 0;
}

export function makeId(prefix: string, seed: number, extra = ''): string {
  return `${prefix}_${(seed >>> 0).toString(36)}${extra}`;
}
