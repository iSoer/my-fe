import type { SaveGame } from '@game/core/types';
import { SAVE_VERSION, parseSave, serializeSave } from '@game/core/save';
import { loadLocal, saveLocal } from '@game/platform/storage';
import { $saveStatus, $save, backupRawSave } from '@game/state/save';
import { cloudLoad, cloudStore } from './cloud';

/** Облачный сейв новее локального больше чем на минуту — спросить игрока, какой оставить. */
const CONFLICT_GAP_MS = 60_000;
/** Обычные изменения уходят в облако с задержкой, начало и конец боя — сразу. */
const CLOUD_DEBOUNCE_MS = 3000;
/** Облако Telegram может не ответить — не держим загрузку игры дольше. */
const CLOUD_TIMEOUT_MS = 4000;

export interface SaveConflict {
  local: SaveGame;
  cloud: SaveGame;
  cloudJson: string;
}

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);

export type ReconcileResult =
  | { kind: 'ok' }
  | { kind: 'conflict'; conflict: SaveConflict }
  /** Локальный или облачный сейв записан более новой версией игры — эту версию запускать нельзя. */
  | { kind: 'newer' };

/** Локальный сейв записан более новой версией игры (без облака: вызывается и вне Telegram). */
export function localSaveIsNewer(): boolean {
  const json = loadLocal();
  if (!json) return false;
  const r = parseSave(json);
  return !r.ok && r.newer === true;
}

/**
 * До монтирования игры: сравнить локальный сейв с облачным. Если локального нет или он нечитаем — облачный кладётся
 * в localStorage (игра прочитает его в initSave; нечитаемый локальный уходит в резервную копию); если облачный
 * заметно новее — вернуть конфликт для выбора игроком. Сейв более новой версии игры (локальный или облачный) — `newer`:
 * старый клиент не должен его ни читать, ни перезаписывать.
 */
export async function reconcileCloudSave(): Promise<ReconcileResult> {
  if (localSaveIsNewer()) return { kind: 'newer' };
  const remote = await withTimeout(cloudLoad(), CLOUD_TIMEOUT_MS);
  if (!remote) return { kind: 'ok' };
  const cloud = parseSave(remote.json);
  if (!cloud.ok) return cloud.newer ? { kind: 'newer' } : { kind: 'ok' };
  const localJson = loadLocal();
  const local = localJson ? parseSave(localJson) : null;
  if (!local || !local.ok) {
    if (localJson) backupRawSave(localJson);
    saveLocal(remote.json);
    return { kind: 'ok' };
  }
  if (
    cloud.save.updatedAt > local.save.updatedAt + CONFLICT_GAP_MS &&
    serializeSave(cloud.save) !== serializeSave(local.save)
  )
    return { kind: 'conflict', conflict: { local: local.save, cloud: cloud.save, cloudJson: remote.json } };
  return { kind: 'ok' };
}

/** Выбор игрока в конфликте: облачный сейв записывается локально до старта игры. */
export function chooseCloud(conflict: SaveConflict): void {
  saveLocal(conflict.cloudJson);
}

/** После старта игры: зеркалить сейв в облако (с задержкой, а при начале и конце боя — сразу). */
export function startCloudMirror(): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastAt = 0;
  let lastBattle = '';
  $save.subscribe((s) => {
    if ($saveStatus.get() !== 'ready' || s.updatedAt === lastAt) return;
    lastAt = s.updatedAt;
    const battleKey = s.battle ? `${s.battle.id}:${s.battle.result ?? ''}` : '';
    const immediate = battleKey !== lastBattle;
    lastBattle = battleKey;
    if (timer) clearTimeout(timer);
    timer = setTimeout(
      () => void cloudStore(serializeSave($save.get()), $save.get().updatedAt, SAVE_VERSION),
      immediate ? 0 : CLOUD_DEBOUNCE_MS,
    );
  });
  // Свернули Mini App — отправить немедленно
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden' || $saveStatus.get() !== 'ready') return;
    if (timer) clearTimeout(timer);
    void cloudStore(serializeSave($save.get()), $save.get().updatedAt, SAVE_VERSION);
  });
}
