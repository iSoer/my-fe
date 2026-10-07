import { chunkString, hashSave } from '@core/save';
import { cloudAvailable, cloudGetItems, cloudGetKeys, cloudRemoveItems, cloudSetItem, userNamespace } from './telegram';
import LZString from 'lz-string';

const LOCAL_PREFIX = 'pawfield:save:';
const CLOUD_META = 'pf_meta';
const CLOUD_CHUNK_PREFIX = 'pf_c_';

export function localKey(): string {
  return `${LOCAL_PREFIX}${userNamespace()}`;
}

export function loadLocal(): string | null {
  try {
    return localStorage.getItem(localKey());
  } catch {
    return null;
  }
}

export function saveLocal(json: string): void {
  try {
    localStorage.setItem(localKey(), json);
  } catch {
    /* quota or private mode */
  }
}

export function clearLocal(): void {
  try {
    localStorage.removeItem(localKey());
  } catch {
    /* ignore */
  }
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

/** Загрузить сейв из Telegram CloudStorage (null, если нет или повреждён). */
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

let cloudBusy = false;
let cloudPending: { json: string; updatedAt: number } | null = null;

/** Сохранить в облако (чанки, затем meta). Последовательно, без гонок. */
export async function cloudStore(json: string, updatedAt: number): Promise<void> {
  if (!cloudAvailable()) return;
  if (cloudBusy) {
    cloudPending = { json, updatedAt };
    return;
  }
  cloudBusy = true;
  try {
    const compressed = LZString.compressToUTF16(json);
    const chunks = chunkString(compressed);
    for (let i = 0; i < chunks.length; i++) await cloudSetItem(`${CLOUD_CHUNK_PREFIX}${i}`, chunks[i] as string);
    const meta: CloudMeta = { version: 1, updatedAt, chunks: chunks.length, hash: hashSave(compressed) };
    await cloudSetItem(CLOUD_META, JSON.stringify(meta));
    // Удалить лишние старые чанки
    const keys = await cloudGetKeys();
    const stale = keys.filter((k) => k.startsWith(CLOUD_CHUNK_PREFIX) && Number(k.slice(CLOUD_CHUNK_PREFIX.length)) >= chunks.length);
    if (stale.length) await cloudRemoveItems(stale);
  } catch {
    /* best effort */
  } finally {
    cloudBusy = false;
    if (cloudPending) {
      const p = cloudPending;
      cloudPending = null;
      void cloudStore(p.json, p.updatedAt);
    }
  }
}

export async function cloudClear(): Promise<void> {
  if (!cloudAvailable()) return;
  try {
    const keys = await cloudGetKeys();
    await cloudRemoveItems(keys.filter((k) => k === CLOUD_META || k.startsWith(CLOUD_CHUNK_PREFIX)));
  } catch {
    /* ignore */
  }
}
