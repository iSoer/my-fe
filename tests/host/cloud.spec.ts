import { beforeEach, describe, expect, it, vi } from 'vitest';
import LZString from 'lz-string';

// CloudStorage Telegram в памяти; `failAfter` — сколько записей пройдёт до «обрыва» соединения.
const store = new Map<string, string>();
let failAfter = Infinity;

vi.mock('@host/telegram', () => ({
  cloudAvailable: () => true,
  cloudGetItems: async (keys: string[]) =>
    Object.fromEntries(keys.filter((k) => store.has(k)).map((k) => [k, store.get(k) as string])),
  cloudSetItem: async (k: string, v: string) => {
    if (failAfter-- <= 0) throw new Error('обрыв');
    store.set(k, v);
  },
  cloudRemoveItems: async (keys: string[]) => keys.forEach((k) => store.delete(k)),
  cloudGetKeys: async () => [...store.keys()],
}));

const { cloudLoad, cloudStore, hashSave, chunkString, staleChunkKeys, CLOUD_CHUNK } =
  await import('@host/cloud');

/** Длинный сейв, чтобы чанков было несколько. */
const bigJson = (tag: string) =>
  JSON.stringify({ tag, junk: Array.from({ length: 6000 }, (_, i) => `${tag}${i * 7919}`) });

describe('облачный сейв', () => {
  beforeEach(() => {
    store.clear();
    failAfter = Infinity;
  });

  it('запись и чтение: несколько чанков нового поколения, старые удалены', async () => {
    await cloudStore(bigJson('a'), 1, 11);
    await cloudStore(bigJson('b'), 2, 11);
    const loaded = await cloudLoad();
    expect(loaded).toEqual({ json: bigJson('b'), updatedAt: 2 });
    const meta = JSON.parse(store.get('pf_meta') as string) as { chunks: number; gen: string };
    expect(meta.chunks).toBeGreaterThan(1);
    const chunkKeys = [...store.keys()].filter((k) => k !== 'pf_meta');
    expect(chunkKeys).toHaveLength(meta.chunks);
    expect(chunkKeys.every((k) => k.startsWith(`pf_s_${meta.gen}_`))).toBe(true);
  });

  it('прерванная запись не портит прошлую копию', async () => {
    await cloudStore(bigJson('a'), 1, 11);
    failAfter = 1;
    await cloudStore(bigJson('b'), 2, 11);
    expect(await cloudLoad()).toEqual({ json: bigJson('a'), updatedAt: 1 });
    // Следующая успешная запись подчищает недописанное поколение
    failAfter = Infinity;
    await cloudStore(bigJson('c'), 3, 11);
    const meta = JSON.parse(store.get('pf_meta') as string) as { chunks: number };
    expect(store.size).toBe(meta.chunks + 1);
    expect((await cloudLoad())?.json).toBe(bigJson('c'));
  });

  it('старый формат (meta v1, чанки pf_c_<i>) читается и вычищается при записи', async () => {
    const compressed = LZString.compressToUTF16(bigJson('old'));
    const chunks = chunkString(compressed, CLOUD_CHUNK);
    chunks.forEach((c, i) => store.set(`pf_c_${i}`, c));
    store.set(
      'pf_meta',
      JSON.stringify({ version: 1, updatedAt: 7, chunks: chunks.length, hash: hashSave(compressed) }),
    );
    expect(await cloudLoad()).toEqual({ json: bigJson('old'), updatedAt: 7 });
    await cloudStore(bigJson('new'), 8, 11);
    expect([...store.keys()].some((k) => k.startsWith('pf_c_'))).toBe(false);
    expect((await cloudLoad())?.json).toBe(bigJson('new'));
  });

  it('облачную копию более новой версии игры не перезаписывает', async () => {
    await cloudStore(bigJson('future'), 5, 12);
    await cloudStore(bigJson('past'), 6, 11);
    expect((await cloudLoad())?.json).toBe(bigJson('future'));
  });

  it('лишние ключи — только чанки чужих поколений и старого формата', () => {
    const keys = ['pf_meta', 'pf_c_0', 'pf_s_x_0', 'pf_s_y_0', 'pf_s_y_1', 'other'];
    expect(staleChunkKeys(keys, { chunks: 2, gen: 'y' })).toEqual(['pf_c_0', 'pf_s_x_0']);
  });
});
