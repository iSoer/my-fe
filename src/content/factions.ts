export interface FactionDef {
  id: string;
  name: string;
  desc: string;
  /** Индексы палитр шерсти, характерных для фракции. */
  palettes: number[];
  /** Доля котов (остальное — псы). */
  catRatio: number;
}

export const FACTIONS: readonly FactionDef[] = [
  { id: 'yard_pack', name: 'Дворовая Стая', desc: 'Бродячие коты и псы, которым не понравилась ваша морда.', palettes: [0, 1, 2, 5], catRatio: 0.5 },
  { id: 'chimney_cats', name: 'Коты-Трубочисты', desc: 'Чёрные от сажи, злые от высоты.', palettes: [7, 8, 11], catRatio: 0.85 },
  { id: 'red_dot_cult', name: 'Культ Красной Точки', desc: 'Они видели точку. Теперь видят только кровь.', palettes: [3, 7, 9], catRatio: 0.7 },
  { id: 'scavengers', name: 'Помоечники', desc: 'Живут на свалке и дерутся за каждую кость.', palettes: [1, 4, 6, 10], catRatio: 0.35 },
  { id: 'snow_strays', name: 'Снежные Дворняги', desc: 'Пушистые, голодные и очень быстрые.', palettes: [8, 9, 11], catRatio: 0.25 },
];

const MAP = new Map(FACTIONS.map((f) => [f.id, f]));
export function factionDef(id: string): FactionDef {
  const f = MAP.get(id);
  if (!f) throw new Error(`unknown faction ${id}`);
  return f;
}
