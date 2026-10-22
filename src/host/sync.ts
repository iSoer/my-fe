import type { SaveGame } from '@game/core/types';
import { parseSave, serializeSave } from '@game/core/save';
import { loadLocal, saveLocal } from '@game/platform/storage';
import { $saveStatus, $save } from '@game/state/save';
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

/**
 * До монтирования игры: сравнить локальный сейв с облачным. Если локального нет — облачный кладётся в localStorage
 * (игра прочитает его в initSave); если облачный заметно новее — вернуть конфликт для выбора игроком.
 */
export async function reconcileCloudSave(): Promise<SaveConflict | null> {
  const remote = await withTimeout(cloudLoad(), CLOUD_TIMEOUT_MS);
  if (!remote) return null;
  const cloud = parseSave(remote.json);
  if (!cloud.ok) return null;
  const localJson = loadLocal();
  const local = localJson ? parseSave(localJson) : null;
  if (!local || !local.ok) {
    saveLocal(remote.json);
    return null;
  }
  if (
    cloud.save.updatedAt > local.save.updatedAt + CONFLICT_GAP_MS &&
    serializeSave(cloud.save) !== serializeSave(local.save)
  )
    return { local: local.save, cloud: cloud.save, cloudJson: remote.json };
  return null;
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
      () => void cloudStore(serializeSave($save.get()), $save.get().updatedAt),
      immediate ? 0 : CLOUD_DEBOUNCE_MS,
    );
  });
  // Свернули Mini App — отправить немедленно
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden' || $saveStatus.get() !== 'ready') return;
    if (timer) clearTimeout(timer);
    void cloudStore(serializeSave($save.get()), $save.get().updatedAt);
  });
}
