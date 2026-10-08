import type { TerrainId } from '@core/types';

export type WeatherKind = 'none' | 'snow' | 'leaves' | 'sand' | 'petals' | 'flies' | 'motes' | 'embers';

export interface WeatherDef {
  kind: WeatherKind;
  colors: number[];
  /** Частиц одновременно на поле (ориентир). */
  density: number;
}

export interface BiomeDef {
  id: string;
  name: string;
  unlockWins: number;
  factionId: string;
  weather: WeatherDef;
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
    id: 'yard', name: 'Двор', unlockWins: 0, factionId: 'yard_pack', weather: { kind: 'petals', colors: [0xffb7c5, 0xffd1dc, 0xfff0f5], density: 6 },
    terrainNames: { ...base, plain: 'Газон', forest: 'Кусты', mountain: 'Поленница', water: 'Лужа', wall: 'Забор', wall_breakable: 'Хлипкий забор', cover: 'Картонная коробка' },
    colors: { plain: 0x7cb342, forest: 0x33691e, mountain: 0x8d6e63, water: 0x4fc3f7, wall: 0x5d4037, wall_breakable: 0xa1887f, cover: 0xd7ccc8 },
    bg: 0x9ccc65,
    bias: { forest: 0, walls: 0, impassable: 0, covers: 0, mountainVsWater: 0.5 },
  },
  {
    id: 'roofs', name: 'Крыши', unlockWins: 3, factionId: 'chimney_cats', weather: { kind: 'motes', colors: [0x3b2f4a, 0x5a4a66], density: 5 },
    terrainNames: { ...base, plain: 'Черепица', forest: 'Антенны и трубы', mountain: 'Вентиляционная будка', water: 'Провал в крыше', wall: 'Парапет', wall_breakable: 'Хлипкий парапет', cover: 'Ящик кондиционера' },
    colors: { plain: 0xbf6b3f, forest: 0x8e5a3a, mountain: 0x9e9e9e, water: 0x263238, wall: 0x6d4c41, wall_breakable: 0xa1887f, cover: 0xcfd8dc },
    bg: 0xff8a65,
    bias: { forest: -0.05, walls: 0, impassable: 0.06, covers: 0, mountainVsWater: 0.5 },
  },
  {
    id: 'basement', name: 'Подвал', unlockWins: 9, factionId: 'red_dot_cult', weather: { kind: 'motes', colors: [0xfff2b0, 0xe0d2a0], density: 10 },
    terrainNames: { ...base, plain: 'Бетон', forest: 'Груды ящиков', mountain: 'Стеллаж', water: 'Затопленный пол', wall: 'Кирпичная стена', wall_breakable: 'Трухлявая стена', cover: 'Бочка' },
    colors: { plain: 0x757575, forest: 0x6d4c41, mountain: 0x4e342e, water: 0x37474f, wall: 0x8d4a3c, wall_breakable: 0xbf8a7a, cover: 0x5d4037 },
    bg: 0x424242,
    bias: { forest: 0, walls: 0.05, impassable: -0.03, covers: 0, mountainVsWater: 0.6 },
  },
  {
    id: 'dump', name: 'Свалка', unlockWins: 15, factionId: 'scavengers', weather: { kind: 'flies', colors: [0x2b2b2b, 0x444444], density: 8 },
    terrainNames: { ...base, plain: 'Утоптанный мусор', forest: 'Кучи хлама', mountain: 'Гора покрышек', water: 'Лужа мазута', wall: 'Холодильник', wall_breakable: 'Ржавый холодильник', cover: 'Старый диван' },
    colors: { plain: 0x9e9d24, forest: 0x827717, mountain: 0x212121, water: 0x1b1b1b, wall: 0xb0bec5, wall_breakable: 0xcfd8dc, cover: 0x8d6e63 },
    bg: 0xafb42b,
    bias: { forest: 0.03, walls: 0, impassable: 0, covers: 1, mountainVsWater: 0.5 },
  },
  {
    id: 'winter_park', name: 'Зимний парк', unlockWins: 24, factionId: 'snow_strays', weather: { kind: 'snow', colors: [0xffffff, 0xeaf4ff], density: 24 },
    terrainNames: { ...base, plain: 'Снег', forest: 'Сугробы', mountain: 'Ель', water: 'Полынья', wall: 'Снежная крепость', wall_breakable: 'Рыхлая крепость', cover: 'Снежный окоп' },
    colors: { plain: 0xeceff1, forest: 0xb0bec5, mountain: 0x2e7d32, water: 0x81d4fa, wall: 0x90a4ae, wall_breakable: 0xcfd8dc, cover: 0xe0e0e0 },
    bg: 0xe3f2fd,
    bias: { forest: 0.02, walls: 0, impassable: 0.02, covers: 0, mountainVsWater: 0.4 },
  },
  {
    id: 'jungle', name: 'Джунгли', unlockWins: 6, factionId: 'swamp_cats', weather: { kind: 'leaves', colors: [0x7bc96f, 0xc9d94a, 0x3f8f45], density: 10 },
    terrainNames: { ...base, plain: 'Тропа', forest: 'Лианы и папоротник', mountain: 'Руины храма', water: 'Болото', wall: 'Бамбуковая стена', wall_breakable: 'Трухлявый бамбук', cover: 'Дупло баобаба' },
    colors: { plain: 0x6cae4a, forest: 0x2f7a3a, mountain: 0x8c8a6a, water: 0x4a7a52, wall: 0x9a8b3c, wall_breakable: 0xc0b05a, cover: 0x7a5a3a },
    bg: 0x8fd36a,
    bias: { forest: 0.08, walls: -0.02, impassable: 0.04, covers: 0, mountainVsWater: 0.3 },
  },
  {
    id: 'desert', name: 'Пустыня', unlockWins: 12, factionId: 'sand_dogs', weather: { kind: 'sand', colors: [0xf3dfae, 0xe8c98a], density: 14 },
    terrainNames: { ...base, plain: 'Песок', forest: 'Кактусы', mountain: 'Дюна', water: 'Оазис', wall: 'Глиняная стена', wall_breakable: 'Треснувшая глина', cover: 'Скелет верблюда' },
    colors: { plain: 0xf0d8a0, forest: 0x7fb069, mountain: 0xe2c17a, water: 0x5bc0eb, wall: 0xc8956b, wall_breakable: 0xdcb08c, cover: 0xe8e0c8 },
    bg: 0xffe8b0,
    bias: { forest: -0.08, walls: -0.02, impassable: 0.02, covers: 0, mountainVsWater: 0.8 },
  },
  {
    id: 'glacier', name: 'Ледник', unlockWins: 18, factionId: 'polar_mice', weather: { kind: 'snow', colors: [0xffffff, 0xd8f0ff], density: 18 },
    terrainNames: { ...base, plain: 'Лёд', forest: 'Торосы', mountain: 'Айсберг', water: 'Полынья', wall: 'Ледяная стена', wall_breakable: 'Хрупкий лёд', cover: 'Снежная пещера' },
    colors: { plain: 0xd8f0ff, forest: 0xbfe3f5, mountain: 0xa9d8f0, water: 0x3a7fc1, wall: 0x8fc4e8, wall_breakable: 0xbfe0f4, cover: 0xeaf6ff },
    bg: 0xcfe9ff,
    bias: { forest: 0, walls: 0.02, impassable: 0.06, covers: 0, mountainVsWater: 0.5 },
  },
  {
    id: 'canyon', name: 'Каньон', unlockWins: 21, factionId: 'canyon_coyotes', weather: { kind: 'sand', colors: [0xe6b48c, 0xd99a6c], density: 8 },
    terrainNames: { ...base, plain: 'Красный камень', forest: 'Колючий кустарник', mountain: 'Скала', water: 'Ручей', wall: 'Скальная стена', wall_breakable: 'Осыпь', cover: 'Расщелина' },
    colors: { plain: 0xd9956a, forest: 0xa6803f, mountain: 0xb5653a, water: 0x4fa3d1, wall: 0x8a4a2e, wall_breakable: 0xb97a58, cover: 0xc47a52 },
    bg: 0xffb07a,
    bias: { forest: -0.04, walls: 0.06, impassable: 0.02, covers: 0, mountainVsWater: 0.7 },
  },
];

const MAP = new Map(BIOMES.map((b) => [b.id, b]));
export function biomeDef(id: string): BiomeDef {
  const b = MAP.get(id);
  if (!b) throw new Error(`unknown biome ${id}`);
  return b;
}
