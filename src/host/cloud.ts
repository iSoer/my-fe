import LZString from 'lz-string';
import { cloudAvailable, cloudGetItems, cloudGetKeys, cloudRemoveItems, cloudSetItem } from './telegram';

// Облачный сейв в Telegram CloudStorage: сжатый JSON сейва игры, порезанный на чанки, + meta с хэшем.
const CLOUD_META = 'pf_meta';
const CLOUD_CHUNK_PREFIX = 'pf_c_';
/** Значение в CloudStorage — до 4096 символов. */
export const CLOUD_CHUNK = 4000;

export function chunkString(s: string, size = CLOUD_CHUNK): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out;
}

/** FNV-1a: проверка целостности склеенных чанков. */
export function hashSave(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

interface CloudMeta {
  version: number;
  updatedAt: number;
  chunks: number;
  hash: string;
}

export interface CloudLoadResult {
  json: string;
  updatedAt: number;
}

/** Загрузить сейв из облака (null — нет, повреждён или облако недоступно). */
export async function cloudLoad(): Promise<CloudLoadResult | null> {
  if (!cloudAvailable()) return null;
  try {
    const metaRaw = (await cloudGetItems([CLOUD_META]))[CLOUD_META];
    if (!metaRaw) return null;
    const meta = JSON.parse(metaRaw) as CloudMeta;
    const keys = Array.from({ length: meta.chunks }, (_, i) => `${CLOUD_CHUNK_PREFIX}${i}`);
    const values = await cloudGetItems(keys);
    const compressed = keys.map((k) => values[k] ?? '').join('');
    if (hashSave(compressed) !== meta.hash) return null;
    const json = LZString.decompressFromUTF16(compressed);
    if (!json) return null;
    return { json, updatedAt: meta.updatedAt };
  } catch {
    return null;
  }
}

let busy = false;
let pending: { json: string; updatedAt: number } | null = null;

/** Сохранить в облако: чанки, затем meta, затем удалить лишние старые чанки. Последовательно, без гонок. */
export async function cloudStore(json: string, updatedAt: number): Promise<void> {
  if (!cloudAvailable()) return;
  if (busy) {
    pending = { json, updatedAt };
    return;
  }
  busy = true;
  try {
    const compressed = LZString.compressToUTF16(json);
    const chunks = chunkString(compressed);
    for (let i = 0; i < chunks.length; i++)
      await cloudSetItem(`${CLOUD_CHUNK_PREFIX}${i}`, chunks[i] as string);
    const meta: CloudMeta = { version: 1, updatedAt, chunks: chunks.length, hash: hashSave(compressed) };
    await cloudSetItem(CLOUD_META, JSON.stringify(meta));
    const keys = await cloudGetKeys();
    const stale = keys.filter(
      (k) => k.startsWith(CLOUD_CHUNK_PREFIX) && Number(k.slice(CLOUD_CHUNK_PREFIX.length)) >= chunks.length,
    );
    if (stale.length) await cloudRemoveItems(stale);
  } catch {
    /* best effort */
  } finally {
    busy = false;
    if (pending) {
      const p = pending;
      pending = null;
      void cloudStore(p.json, p.updatedAt);
    }
  }
}
