import { atom } from 'nanostores';

/** Ключ «бой:ход», для которого игрок отклонил предложение завершить ход. */
export const $endPromptDismissed = atom<string>('');

export function endPromptKey(battleId: string, turn: number): string {
  return `${battleId}:${turn}`;
}
