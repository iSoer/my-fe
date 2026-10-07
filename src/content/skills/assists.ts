import type { AssistDef } from '@core/skills/types';

export const ASSISTS: readonly AssistDef[] = [
  { id: 'as_rally_atk', name: 'Подбодрить: атака', desc: '+4 Atk союзнику до начала вашей следующей фазы.', kind: 'rally', spCost: 150, stage: 'mvp', stats: { atk: 4 } },
  { id: 'as_rally_spd', name: 'Подбодрить: скорость', desc: '+4 Spd союзнику до начала вашей следующей фазы.', kind: 'rally', spCost: 150, stage: 'v1', stats: { spd: 4 } },
  { id: 'as_rally_def', name: 'Подбодрить: защита', desc: '+4 Def союзнику до начала вашей следующей фазы.', kind: 'rally', spCost: 150, stage: 'mvp', stats: { def: 4 } },
  { id: 'as_rally_res', name: 'Подбодрить: сопротивление', desc: '+4 Res союзнику до начала вашей следующей фазы.', kind: 'rally', spCost: 150, stage: 'v1', stats: { res: 4 } },
  { id: 'as_swap', name: 'Поменяться', desc: 'Поменяться местами с союзником.', kind: 'swap', spCost: 150, stage: 'mvp' },
  { id: 'as_reposition', name: 'Перестановка', desc: 'Переставить союзника на клетку позади себя.', kind: 'reposition', spCost: 150, stage: 'mvp' },
  { id: 'as_drawback', name: 'Оттащить', desc: 'Отступить на клетку назад и утащить союзника за собой.', kind: 'drawBack', spCost: 150, stage: 'v1' },
  { id: 'as_pivot', name: 'Пируэт', desc: 'Перепрыгнуть на клетку за союзником.', kind: 'pivot', spCost: 150, stage: 'v1' },
  { id: 'as_shove', name: 'Толкнуть', desc: 'Сдвинуть союзника на 1 клетку от себя.', kind: 'shove', spCost: 150, stage: 'v1' },
  { id: 'as_smite', name: 'Пнуть', desc: 'Сдвинуть союзника на 2 клетки от себя.', kind: 'smite', spCost: 150, stage: 'v1' },
  { id: 'as_heal', name: 'Перевязать', desc: 'Вылечить союзника на 5 HP.', kind: 'heal', spCost: 0, stage: 'mvp', heal: 5, staffOnly: true },
  { id: 'as_mend', name: 'Зализать', desc: 'Вылечить союзника на 7 HP.', kind: 'heal', spCost: 150, stage: 'v1', heal: 7, staffOnly: true },
  { id: 'as_recover', name: 'Залатать', desc: 'Вылечить союзника на 15 HP.', kind: 'heal', spCost: 300, stage: 'v1', heal: 15, staffOnly: true },
  { id: 'as_purr', name: 'Мурлыканье', desc: 'Союзник может действовать ещё раз.', kind: 'refresh', spCost: 0, stage: 'v1', purrOnly: true },
  { id: 'as_ardent', name: 'Отдать вкусняшку', desc: '−10 HP себе, +10 HP союзнику.', kind: 'sacrifice', spCost: 150, stage: 'v1', heal: 10 },
  { id: 'as_reciprocal', name: 'Поменяться шкурой', desc: 'Обменяться HP с союзником.', kind: 'reciprocal', spCost: 150, stage: 'v1.1' },
];

const MAP = new Map(ASSISTS.map((s) => [s.id, s]));
export function assistDef(id: string): AssistDef {
  const s = MAP.get(id);
  if (!s) throw new Error(`unknown assist ${id}`);
  return s;
}
