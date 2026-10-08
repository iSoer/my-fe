import type { Species } from '@core/types';

export interface FactionDef {
  id: string;
  name: string;
  desc: string;
  /** Индексы палитр шерсти, характерных для фракции. */
  palettes: number[];
  /** Веса видов среди бойцов фракции. */
  species: Record<Species, number>;
}

export const FACTIONS: readonly FactionDef[] = [
  { id: 'yard_pack', name: 'Дворовая Стая', desc: 'Бродячие коты и псы, которым не понравилась ваша морда.', palettes: [0, 1, 2, 5], species: { cat: 45, dog: 45, mouse: 10 } },
  { id: 'chimney_cats', name: 'Коты-Трубочисты', desc: 'Чёрные от сажи, злые от высоты.', palettes: [7, 8, 11], species: { cat: 80, dog: 10, mouse: 10 } },
  { id: 'red_dot_cult', name: 'Культ Красной Точки', desc: 'Они видели точку. Теперь видят только кровь. Мыши — их паства.', palettes: [3, 7, 9], species: { cat: 40, dog: 10, mouse: 50 } },
  { id: 'scavengers', name: 'Помоечники', desc: 'Живут на свалке и дерутся за каждую кость.', palettes: [1, 4, 6, 10], species: { cat: 25, dog: 35, mouse: 40 } },
  { id: 'snow_strays', name: 'Снежные Дворняги', desc: 'Пушистые, голодные и очень быстрые.', palettes: [8, 9, 11], species: { cat: 15, dog: 70, mouse: 15 } },
];

const MAP = new Map(FACTIONS.map((f) => [f.id, f]));
export function factionDef(id: string): FactionDef {
  const f = MAP.get(id);
  if (!f) throw new Error(`unknown faction ${id}`);
  return f;
}
