import type { TerrainId } from "@game/core/types"
import { tr } from "@game/i18n"

export type WeatherKind = "none" | "snow" | "leaves" | "sand" | "petals" | "flies" | "motes" | "embers"

export interface WeatherDef {
  kind: WeatherKind
  colors: number[]
  /** Частиц одновременно на поле (ориентир). */
  density: number
}

export interface BiomeDef {
  id: string
  readonly name: string
  factionId: string
  weather: WeatherDef
  terrainNames: Record<TerrainId, string>
  /** Цвета плейсхолдеров тайлов. */
  colors: Record<TerrainId, number>
  bg: number
  /** Смещения долей местности относительно базовых. */
  bias: { forest: number, walls: number, impassable: number, covers: number, mountainVsWater: number }
}

/** Названия местности: геттеры, чтобы текст брался на текущем языке в момент показа. */
function terrain(pairs: Record<TerrainId, readonly [string, string]>): Record<TerrainId, string> {
  const out = {} as Record<TerrainId, string>
  for (const [id, [en, ru]] of Object.entries(pairs) as [TerrainId, readonly [string, string]][]) {
    Object.defineProperty(out, id, { get: () => tr(en, ru), enumerable: true })
  }
  return out
}

export const BIOMES: readonly BiomeDef[] = [
  {
    id: "yard",
    get name() { return tr("Yard", "Двор") },
    factionId: "yard_pack",
    weather: { kind: "petals", colors: [0xffb7c5, 0xffd1dc, 0xfff0f5], density: 6 },
    terrainNames: terrain({
      plain: ["Lawn", "Газон"],
      forest: ["Bushes", "Кусты"],
      mountain: ["Woodpile", "Поленница"],
      water: ["Puddle", "Лужа"],
      wall: ["Fence", "Забор"],
      wall_breakable: ["Flimsy fence", "Хлипкий забор"],
      cover: ["Cardboard box", "Картонная коробка"]
    }),
    colors: {
      plain: 0x7cb342,
      forest: 0x33691e,
      mountain: 0x8d6e63,
      water: 0x4fc3f7,
      wall: 0x5d4037,
      wall_breakable: 0xa1887f,
      cover: 0xd7ccc8
    },
    bg: 0x9ccc65,
    bias: { forest: 0, walls: 0, impassable: 0, covers: 0, mountainVsWater: 0.5 }
  },
  {
    id: "roofs",
    get name() { return tr("Rooftops", "Крыши") },
    factionId: "chimney_cats",
    weather: { kind: "motes", colors: [0x3b2f4a, 0x5a4a66], density: 5 },
    terrainNames: terrain({
      plain: ["Roof tiles", "Черепица"],
      forest: ["Antennas & pipes", "Антенны и трубы"],
      mountain: ["Vent hut", "Вентиляционная будка"],
      water: ["Hole in the roof", "Провал в крыше"],
      wall: ["Parapet", "Парапет"],
      wall_breakable: ["Flimsy parapet", "Хлипкий парапет"],
      cover: ["AC unit", "Ящик кондиционера"]
    }),
    colors: {
      plain: 0xbf6b3f,
      forest: 0x8e5a3a,
      mountain: 0x9e9e9e,
      water: 0x263238,
      wall: 0x6d4c41,
      wall_breakable: 0xa1887f,
      cover: 0xcfd8dc
    },
    bg: 0xff8a65,
    bias: { forest: -0.05, walls: 0, impassable: 0.03, covers: 0, mountainVsWater: 0.5 }
  },
  {
    id: "basement",
    get name() { return tr("Basement", "Подвал") },
    factionId: "red_dot_cult",
    weather: { kind: "motes", colors: [0xfff2b0, 0xe0d2a0], density: 10 },
    terrainNames: terrain({
      plain: ["Concrete", "Бетон"],
      forest: ["Crate piles", "Груды ящиков"],
      mountain: ["Shelving", "Стеллаж"],
      water: ["Flooded floor", "Затопленный пол"],
      wall: ["Brick wall", "Кирпичная стена"],
      wall_breakable: ["Rotten wall", "Трухлявая стена"],
      cover: ["Barrel", "Бочка"]
    }),
    colors: {
      plain: 0x757575,
      forest: 0x6d4c41,
      mountain: 0x4e342e,
      water: 0x37474f,
      wall: 0x8d4a3c,
      wall_breakable: 0xbf8a7a,
      cover: 0x5d4037
    },
    bg: 0x424242,
    bias: { forest: 0, walls: 0.03, impassable: -0.03, covers: 0, mountainVsWater: 0.6 }
  },
  {
    id: "dump",
    get name() { return tr("Dump", "Свалка") },
    factionId: "scavengers",
    weather: { kind: "flies", colors: [0x2b2b2b, 0x444444], density: 8 },
    terrainNames: terrain({
      plain: ["Packed trash", "Утоптанный мусор"],
      forest: ["Junk heaps", "Кучи хлама"],
      mountain: ["Tire mountain", "Гора покрышек"],
      water: ["Oil puddle", "Лужа мазута"],
      wall: ["Fridge", "Холодильник"],
      wall_breakable: ["Rusty fridge", "Ржавый холодильник"],
      cover: ["Old couch", "Старый диван"]
    }),
    colors: {
      plain: 0x9e9d24,
      forest: 0x827717,
      mountain: 0x212121,
      water: 0x1b1b1b,
      wall: 0xb0bec5,
      wall_breakable: 0xcfd8dc,
      cover: 0x8d6e63
    },
    bg: 0xafb42b,
    bias: { forest: 0.03, walls: 0, impassable: 0, covers: 1, mountainVsWater: 0.5 }
  },
  {
    id: "winter_park",
    get name() { return tr("Winter Park", "Зимний парк") },
    factionId: "snow_strays",
    weather: { kind: "snow", colors: [0xffffff, 0xeaf4ff], density: 24 },
    terrainNames: terrain({
      plain: ["Snow", "Снег"],
      forest: ["Snowdrifts", "Сугробы"],
      mountain: ["Fir tree", "Ель"],
      water: ["Ice hole", "Полынья"],
      wall: ["Snow fort", "Снежная крепость"],
      wall_breakable: ["Crumbly fort", "Рыхлая крепость"],
      cover: ["Snow trench", "Снежный окоп"]
    }),
    colors: {
      plain: 0xeceff1,
      forest: 0xb0bec5,
      mountain: 0x2e7d32,
      water: 0x81d4fa,
      wall: 0x90a4ae,
      wall_breakable: 0xcfd8dc,
      cover: 0xe0e0e0
    },
    bg: 0xe3f2fd,
    bias: { forest: 0.02, walls: 0, impassable: 0.02, covers: 0, mountainVsWater: 0.4 }
  },
  {
    id: "jungle",
    get name() { return tr("Jungle", "Джунгли") },
    factionId: "swamp_cats",
    weather: { kind: "leaves", colors: [0x7bc96f, 0xc9d94a, 0x3f8f45], density: 10 },
    terrainNames: terrain({
      plain: ["Trail", "Тропа"],
      forest: ["Vines & ferns", "Лианы и папоротник"],
      mountain: ["Temple ruins", "Руины храма"],
      water: ["Swamp", "Болото"],
      wall: ["Bamboo wall", "Бамбуковая стена"],
      wall_breakable: ["Rotten bamboo", "Трухлявый бамбук"],
      cover: ["Baobab hollow", "Дупло баобаба"]
    }),
    colors: {
      plain: 0x6cae4a,
      forest: 0x2f7a3a,
      mountain: 0x8c8a6a,
      water: 0x4a7a52,
      wall: 0x9a8b3c,
      wall_breakable: 0xc0b05a,
      cover: 0x7a5a3a
    },
    bg: 0x8fd36a,
    bias: { forest: 0.08, walls: -0.02, impassable: 0.04, covers: 0, mountainVsWater: 0.3 }
  },
  {
    id: "desert",
    get name() { return tr("Desert", "Пустыня") },
    factionId: "sand_dogs",
    weather: { kind: "sand", colors: [0xf3dfae, 0xe8c98a], density: 14 },
    terrainNames: terrain({
      plain: ["Sand", "Песок"],
      forest: ["Cacti", "Кактусы"],
      mountain: ["Dune", "Дюна"],
      water: ["Oasis", "Оазис"],
      wall: ["Clay wall", "Глиняная стена"],
      wall_breakable: ["Cracked clay", "Треснувшая глина"],
      cover: ["Camel skeleton", "Скелет верблюда"]
    }),
    colors: {
      plain: 0xf0d8a0,
      forest: 0x7fb069,
      mountain: 0xe2c17a,
      water: 0x5bc0eb,
      wall: 0xc8956b,
      wall_breakable: 0xdcb08c,
      cover: 0xe8e0c8
    },
    bg: 0xffe8b0,
    bias: { forest: -0.08, walls: -0.02, impassable: 0.02, covers: 0, mountainVsWater: 0.8 }
  },
  {
    id: "glacier",
    get name() { return tr("Glacier", "Ледник") },
    factionId: "polar_mice",
    weather: { kind: "snow", colors: [0xffffff, 0xd8f0ff], density: 18 },
    terrainNames: terrain({
      plain: ["Ice", "Лёд"],
      forest: ["Ice ridges", "Торосы"],
      mountain: ["Iceberg", "Айсберг"],
      water: ["Ice hole", "Полынья"],
      wall: ["Ice wall", "Ледяная стена"],
      wall_breakable: ["Brittle ice", "Хрупкий лёд"],
      cover: ["Snow cave", "Снежная пещера"]
    }),
    colors: {
      plain: 0xd8f0ff,
      forest: 0xbfe3f5,
      mountain: 0xa9d8f0,
      water: 0x3a7fc1,
      wall: 0x8fc4e8,
      wall_breakable: 0xbfe0f4,
      cover: 0xeaf6ff
    },
    bg: 0xcfe9ff,
    bias: { forest: 0, walls: 0.02, impassable: 0.03, covers: 0, mountainVsWater: 0.5 }
  },
  {
    id: "canyon",
    get name() { return tr("Canyon", "Каньон") },
    factionId: "canyon_coyotes",
    weather: { kind: "sand", colors: [0xe6b48c, 0xd99a6c], density: 8 },
    terrainNames: terrain({
      plain: ["Red rock", "Красный камень"],
      forest: ["Thornbush", "Колючий кустарник"],
      mountain: ["Cliff", "Скала"],
      water: ["Creek", "Ручей"],
      wall: ["Rock wall", "Скальная стена"],
      wall_breakable: ["Scree", "Осыпь"],
      cover: ["Crevice", "Расщелина"]
    }),
    colors: {
      plain: 0xd9956a,
      forest: 0xa6803f,
      mountain: 0xb5653a,
      water: 0x4fa3d1,
      wall: 0x8a4a2e,
      wall_breakable: 0xb97a58,
      cover: 0xc47a52
    },
    bg: 0xffb07a,
    bias: { forest: -0.04, walls: 0.03, impassable: 0.02, covers: 0, mountainVsWater: 0.7 }
  },
  {
    id: "deep_forest",
    get name() { return tr("Deep Forest", "Густой лес") },
    factionId: "forest_lynxes",
    weather: { kind: "leaves", colors: [0x8a9a3a, 0xc08a3a, 0x6b8f3a], density: 7 },
    terrainNames: terrain({
      plain: ["Moss", "Мох"],
      forest: ["Thicket", "Чаща"],
      mountain: ["Boulder", "Валун"],
      water: ["Stream", "Ручей"],
      wall: ["Ancient trunk", "Вековой ствол"],
      wall_breakable: ["Rotten log", "Гнилое бревно"],
      cover: ["Stump", "Пень"]
    }),
    colors: {
      plain: 0x4f7a3a,
      forest: 0x1f4a26,
      mountain: 0x7d7f73,
      water: 0x3f8fa6,
      wall: 0x5a3e28,
      wall_breakable: 0x7a5a3a,
      cover: 0x8a6440
    },
    bg: 0x2f5a34,
    bias: { forest: 0.1, walls: 0, impassable: 0, covers: 1, mountainVsWater: 0.5 }
  },
  {
    id: "indoors",
    get name() { return tr("Indoors", "В доме") },
    factionId: "couch_troops",
    weather: { kind: "motes", colors: [0xfff3c0, 0xffffff], density: 5 },
    terrainNames: terrain({
      plain: ["Floorboards", "Паркет"],
      forest: ["Houseplants", "Цветы в горшках"],
      mountain: ["Wardrobe", "Шкаф"],
      water: ["Bathtub", "Ванна"],
      wall: ["Wall", "Стена"],
      wall_breakable: ["Toppled cupboard", "Опрокинутый шкаф"],
      cover: ["Armchair", "Кресло"]
    }),
    colors: {
      plain: 0xb9875a,
      forest: 0x3f8f4a,
      mountain: 0x6b4a32,
      water: 0x8fd3f0,
      wall: 0xd9c7a8,
      wall_breakable: 0xa0703f,
      cover: 0x8a3b4a
    },
    bg: 0xf1e3c8,
    bias: { forest: -0.08, walls: 0.04, impassable: 0, covers: 1, mountainVsWater: 0.8 }
  },
  {
    id: "factory",
    get name() { return tr("Factory", "Завод") },
    factionId: "assembly_dogs",
    weather: { kind: "embers", colors: [0xffb347, 0xff7a29], density: 6 },
    terrainNames: terrain({
      plain: ["Concrete floor", "Бетонный пол"],
      forest: ["Cable tangle", "Клубок кабелей"],
      mountain: ["Machinery", "Станок"],
      water: ["Oil pool", "Масляная лужа"],
      wall: ["Steel wall", "Стальная стена"],
      wall_breakable: ["Rusty grate", "Ржавая решётка"],
      cover: ["Barrels", "Бочки"]
    }),
    colors: {
      plain: 0x8a8d8f,
      forest: 0x3a3f45,
      mountain: 0x5a6670,
      water: 0x2a2630,
      wall: 0x4a5560,
      wall_breakable: 0xa0603a,
      cover: 0xc9a227
    },
    bg: 0x5a5f66,
    bias: { forest: -0.06, walls: 0.03, impassable: 0.01, covers: 1, mountainVsWater: 0.6 }
  },
  {
    id: "infested",
    get name() { return tr("Infested Zone", "Заражённая зона") },
    factionId: "the_horde",
    weather: { kind: "motes", colors: [0x9fff5a, 0xc6ff8a, 0xb07aff], density: 9 },
    terrainNames: terrain({
      plain: ["Blighted ground", "Гниющая земля"],
      forest: ["Dead brush", "Мёртвый кустарник"],
      mountain: ["Bone pile", "Груда костей"],
      water: ["Toxic ooze", "Ядовитая жижа"],
      wall: ["Barricade", "Баррикада"],
      wall_breakable: ["Broken barricade", "Разбитая баррикада"],
      cover: ["Gravestone", "Надгробие"]
    }),
    colors: {
      plain: 0x5a5e3f,
      forest: 0x3d3a2a,
      mountain: 0xd8d0b8,
      water: 0x7fe04a,
      wall: 0x5a4632,
      wall_breakable: 0x7a6248,
      cover: 0x8a8a8f
    },
    bg: 0x3a3048,
    bias: { forest: 0, walls: 0.02, impassable: 0.02, covers: 1, mountainVsWater: 0.4 }
  }
]

const MAP = new Map(BIOMES.map(b => [b.id, b]))
export function biomeDef(id: string): BiomeDef {
  const b = MAP.get(id)
  if (!b) throw new Error(`unknown biome ${id}`)
  return b
}

/**
 * Вода заливает клетку целиком (а не лежит лужей или предметом на земле): у такой воды есть берега с пеной,
 * из её клеток без швов складываются река и озеро. Ванна в доме — предмет на полу; ручей, масло и жижа — сплошь.
 */
export function waterFillsTile(biomeId: string): boolean {
  return !["roofs", "dump", "desert", "glacier", "canyon", "indoors"].includes(biomeId)
}
