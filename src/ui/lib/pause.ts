import { atom } from 'nanostores';

/** Открыта ли пауза боя (переключается и кнопкой «Назад» Telegram). */
export const $pauseOpen = atom<boolean>(false);
