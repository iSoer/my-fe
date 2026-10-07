import type { TerrainId } from '@core/types';

export interface BiomeDef {
  id: string;
  name: string;
  unlockWins: number;
  factionId: string;
  terrainNames: Record<TerrainId, string>;
  /** Цвета плейсхолдеров тайлов. */
  colors: Record<TerrainId, number>;
  bg: number;
  /** Смещения долей местности относительно базовых. */
  bias: { forest: number; walls: number; impassable: number; covers: number; mountainVsWater: number };
}

const base: Record<TerrainId, string> = {
  plain: 'Равнина',
  forest: 'Заросли',
  mountain: 'Возвышенность',
  water: 'Вода',
  wall: 'Стена',
  wall_breakable: 'Хлипкая стена',
  cover: 'Укрытие',
};

export const BIOMES: readonly BiomeDef[] = [
  {
    id: 'yard', name: 'Двор', unlockWins: 0, factionId: 'yard_pack',
    terrainNames: { ...base, plain: 'Газон', forest: 'Кусты', mountain: 'Поленница', water: 'Лужа', wall: 'Забор', wall_breakable: 'Хлипкий забор', cover: 'Картонная коробка' },
    colors: { plain: 0x7cb342, forest: 0x33691e, mountain: 0x8d6e63, water: 0x4fc3f7, wall: 0x5d4037, wall_breakable: 0xa1887f, cover: 0xd7ccc8 },
    bg: 0x9ccc65,
    bias: { forest: 0, walls: 0, impassable: 0, covers: 0, mountainVsWater: 0.5 },
  },
  {
    id: 'roofs', name: 'Крыши', unlockWins: 5, factionId: 'chimney_cats',
    terrainNames: { ...base, plain: 'Черепица', forest: 'Антенны и трубы', mountain: 'Вентиляционная будка', water: 'Провал в крыше', wall: 'Парапет', wall_breakable: 'Хлипкий парапет', cover: 'Ящик кондиционера' },
    colors: { plain: 0xbf6b3f, forest: 0x8e5a3a, mountain: 0x9e9e9e, water: 0x263238, wall: 0x6d4c41, wall_breakable: 0xa1887f, cover: 0xcfd8dc },
    bg: 0xff8a65,
    bias: { forest: -0.05, walls: 0, impassable: 0.06, covers: 0, mountainVsWater: 0.5 },
  },
  {
    id: 'basement', name: 'Подвал', unlockWins: 10, factionId: 'red_dot_cult',
    terrainNames: { ...base, plain: 'Бетон', forest: 'Груды ящиков', mountain: 'Стеллаж', water: 'Затопленный пол', wall: 'Кирпичная стена', wall_breakable: 'Трухлявая стена', cover: 'Бочка' },
    colors: { plain: 0x757575, forest: 0x6d4c41, mountain: 0x4e342e, water: 0x37474f, wall: 0x8d4a3c, wall_breakable: 0xbf8a7a, cover: 0x5d4037 },
    bg: 0x424242,
    bias: { forest: 0, walls: 0.05, impassable: -0.03, covers: 0, mountainVsWater: 0.6 },
  },
  {
    id: 'dump', name: 'Свалка', unlockWins: 15, factionId: 'scavengers',
    terrainNames: { ...base, plain: 'Утоптанный мусор', forest: 'Кучи хлама', mountain: 'Гора покрышек', water: 'Лужа мазута', wall: 'Холодильник', wall_breakable: 'Ржавый холодильник', cover: 'Старый диван' },
    colors: { plain: 0x9e9d24, forest: 0x827717, mountain: 0x212121, water: 0x1b1b1b, wall: 0xb0bec5, wall_breakable: 0xcfd8dc, cover: 0x8d6e63 },
    bg: 0xafb42b,
    bias: { forest: 0.03, walls: 0, impassable: 0, covers: 1, mountainVsWater: 0.5 },
  },
  {
    id: 'winter_park', name: 'Зимний парк', unlockWins: 25, factionId: 'snow_strays',
    terrainNames: { ...base, plain: 'Снег', forest: 'Сугробы', mountain: 'Ель', water: 'Полынья', wall: 'Снежная крепость', wall_breakable: 'Рыхлая крепость', cover: 'Снежный окоп' },
    colors: { plain: 0xeceff1, forest: 0xb0bec5, mountain: 0x2e7d32, water: 0x81d4fa, wall: 0x90a4ae, wall_breakable: 0xcfd8dc, cover: 0xe0e0e0 },
    bg: 0xe3f2fd,
    bias: { forest: 0.02, walls: 0, impassable: 0.02, covers: 0, mountainVsWater: 0.4 },
  },
];

const MAP = new Map(BIOMES.map((b) => [b.id, b]));
export function biomeDef(id: string): BiomeDef {
  const b = MAP.get(id);
  if (!b) throw new Error(`unknown biome ${id}`);
  return b;
}
