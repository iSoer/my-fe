import LZString from 'lz-string';
import { cloudAvailable, cloudGetItems, cloudGetKeys, cloudRemoveItems, cloudSetItem } from './telegram';

// Облачный сейв в Telegram CloudStorage: сжатый JSON сейва игры, порезанный на чанки, + meta с хэшем.
// Каждая запись идёт в новое поколение чанков (`pf_s_<gen>_<i>`), и только потом meta переключается на него:
// прерванная запись или вторая вкладка/устройство не портят копию, на которую указывает meta.
// Старый формат (meta v1, чанки `pf_c_<i>`) читается и вычищается при следующей записи.
const CLOUD_META = 'pf_meta';
const LEGACY_CHUNK_PREFIX = 'pf_c_';
const CHUNK_PREFIX = 'pf_s_';
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

export interface CloudMeta {
  /** 1 — чанки `pf_c_<i>`; 2 — поколения `pf_s_<gen>_<i>`. */
  version: number;
  updatedAt: number;
  chunks: number;
  hash: string;
  gen?: string;
  /** Версия формата сейва игры (SAVE_VERSION записавшего клиента). */
  saveVersion?: number;
}

export interface CloudLoadResult {
  json: string;
  updatedAt: number;
}

/** Ключи чанков, на которые указывает meta. */
export function chunkKeys(meta: Pick<CloudMeta, 'chunks' | 'gen'>): string[] {
  return Array.from({ length: meta.chunks }, (_, i) =>
    meta.gen ? `${CHUNK_PREFIX}${meta.gen}_${i}` : `${LEGACY_CHUNK_PREFIX}${i}`,
  );
}

/** Ключи чанков, не принадлежащие поколению `keep` (старый формат, прерванные и прошлые записи). */
export function staleChunkKeys(keys: string[], keep: Pick<CloudMeta, 'chunks' | 'gen'>): string[] {
  const live = new Set(chunkKeys(keep));
  return keys.filter(
    (k) => (k.startsWith(CHUNK_PREFIX) || k.startsWith(LEGACY_CHUNK_PREFIX)) && !live.has(k),
  );
}

function newGen(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 36 ** 3).toString(36)}`;
}

async function readMeta(): Promise<CloudMeta | null> {
  const raw = (await cloudGetItems([CLOUD_META]))[CLOUD_META];
  return raw ? (JSON.parse(raw) as CloudMeta) : null;
}

/** Загрузить сейв из облака (null — нет, повреждён или облако недоступно). */
export async function cloudLoad(): Promise<CloudLoadResult | null> {
  if (!cloudAvailable()) return null;
  try {
    const meta = await readMeta();
    if (!meta) return null;
    const keys = chunkKeys(meta);
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
let pending: { json: string; updatedAt: number; saveVersion: number } | null = null;

/**
 * Сохранить в облако: чанки нового поколения, затем meta, затем удалить чанки прочих поколений.
 * Последовательно, без гонок внутри вкладки. Облачную копию более новой версии игры (`saveVersion` в meta больше
 * нашей) не перезаписывает.
 */
export async function cloudStore(json: string, updatedAt: number, saveVersion: number): Promise<void> {
  if (!cloudAvailable()) return;
  if (busy) {
    pending = { json, updatedAt, saveVersion };
    return;
  }
  busy = true;
  try {
    const prev = await readMeta().catch(() => null);
    if (prev?.saveVersion !== undefined && prev.saveVersion > saveVersion) return;
    const compressed = LZString.compressToUTF16(json);
    const chunks = chunkString(compressed);
    const meta: CloudMeta = {
      version: 2,
      updatedAt,
      chunks: chunks.length,
      hash: hashSave(compressed),
      gen: newGen(),
      saveVersion,
    };
    const keys = chunkKeys(meta);
    for (let i = 0; i < chunks.length; i++) await cloudSetItem(keys[i] as string, chunks[i] as string);
    await cloudSetItem(CLOUD_META, JSON.stringify(meta));
    // Пока мы писали, meta мог переключить другой клиент — тогда его чанки не трогаем
    const current = await readMeta();
    if (current?.gen !== meta.gen) return;
    const stale = staleChunkKeys(await cloudGetKeys(), meta);
    if (stale.length) await cloudRemoveItems(stale);
  } catch {
    /* best effort */
  } finally {
    busy = false;
    if (pending) {
      const p = pending;
      pending = null;
      void cloudStore(p.json, p.updatedAt, p.saveVersion);
    }
  }
}
