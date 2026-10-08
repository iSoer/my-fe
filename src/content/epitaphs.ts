import type { Gender } from '@core/types';

export interface EpitaphCtx {
  name: string;
  gender: Gender;
  killer?: string;
  className: string;
  turn?: number;
  personality: string;
}

const g = (gender: Gender, m: string, f: string): string => (gender === 'm' ? m : f);

export const EPITAPHS: readonly ((c: EpitaphCtx) => string)[] = [
  (c) => `Любил${g(c.gender, '', 'а')} коробки. Умер${g(c.gender, '', 'ла')} ${c.killer ? `от лап ${c.killer}` : 'в коробке'}.`,
  (c) => `${c.name} всегда хотел${g(c.gender, '', 'а')} посмотреть, что там за забором. Теперь знает.`,
  (c) => (c.killer ? `${c.killer} не извинил${g(c.gender, 'ся', 'ся')}. ${c.name} не простил${g(c.gender, '', 'а')}.` : `Ушёл${g(c.gender, '', 'а')} тихо. Как и жил${g(c.gender, '', 'а')}.`),
  (c) => `${c.className} до самого конца. Конец наступил${c.turn ? ` на ${c.turn}-м ходу` : ''}.`,
  (c) => `${c.personality} Больше не будет.`,
  (c) => `Здесь лежит ${c.name}. Хотел${g(c.gender, '', 'а')} только вкусняшку.`,
  (c) => `Пал${g(c.gender, '', 'а')} смертью храбрых. Храбрость не помогла.`,
  (c) => (c.killer ? `${c.killer}, если ты это читаешь — мы придём за тобой.` : `Никто не видел, как это случилось. Все видели лужу.`),
  (c) => `Девять жизней закончились раньше, чем ${g(c.gender, 'планировал', 'планировала')}.`,
  (c) => `${c.name} не боял${g(c.gender, 'ся', 'ась')} ничего. Зря.`,
  (_c) => `Последние слова: «Мяу». Или «Гав». Или «Пи». Было плохо слышно.`,
  (c) => `Оставил${g(c.gender, '', 'а')} после себя 143 носка и одну лужу.`,
  (c) => `Спи спокойно, ${c.name}. Миска всегда будет полной.`,
  (c) => `Стоял${g(c.gender, '', 'а')} на Укрытии. Укрытие не помогло.`,
  (_c) => `Красная точка наконец поймана. Ценой всего.`,
  (c) => `Был${g(c.gender, '', 'а')} хорош${g(c.gender, 'им', 'ей')} ${g(c.gender, 'мальчиком', 'девочкой')}. Очень хорош${g(c.gender, 'им', 'ей')}.`,
];
