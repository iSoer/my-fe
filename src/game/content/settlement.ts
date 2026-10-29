import type { BuildingId, Pos, Species } from "@game/core/types"
import { tr } from "@game/i18n"
import { TAVERN } from "./tavern"

// Поселение: здания, их уровни и места на карте. Логика — `core/settlement`, движение героя — `core/settlement/walk`,
// сцена — `scene/settlement`, экран — `ui/screens/SettlementScreen`.
// Все числа ниже — параметры конфигурации, а не утверждённый баланс: цены строительства и улучшений, вместимость,
// скорость тренировки, скидки и интервалы подобраны под текущую экономику (бой на «Нормально» ≈ 125 🦴) и ждут
// отдельного решения по балансу.

/** Уровней у каждого здания; построенное начинает с 1-го. */
export const BUILDING_MAX_LEVEL = 5

/** Значение параметра на уровне здания 1…5 (вне диапазона — ближайший край). */
export function atLevel<T>(table: readonly T[], level: number): T {
  return table[Math.max(0, Math.min(table.length - 1, level - 1))] as T
}

/** Казармы: сколько бойцов можно держать в ростере (тренирующиеся тоже занимают места, павшие — нет). */
export const BARRACKS = {
  capacity: [8, 11, 14, 17, 20] as const
}

/** Тренировочный полигон: мест, опыта в час на бойца и опыта каждому тренирующемуся после вылазки. */
export const TRAINING = {
  capacity: [1, 2, 4, 6, 8] as const,
  xpPerHour: [10, 12, 14, 17, 20] as const,
  sortieXp: [10, 12, 15, 18, 20] as const
}

/** Торговая лавка: позиций на витрине (Слава ≥ 150 — на одну больше), скидка на всё и период смены ассортимента. */
export const STORE = {
  offers: [6, 8, 10, 12, 14] as const,
  discount: [0, 0.05, 0.1, 0.15, 0.2] as const,
  refreshHours: 4,
  /** Каждая третья позиция витрины — талисман (если талисманов хватает). */
  talismanEvery: 3
}

/** Бар: сколько сортов в меню (сами напитки и их сила — `content/tavern`). */
export const TAVERN_MENU = [3, 5, 7, 9, 10] as const

/** Кладбище: с этого уровня открывается воскрешение (одно за игровой день). */
export const GRAVEYARD = {
  reviveLevel: 5
}

/**
 * Игровой день (воскрешение раз в день): сутки начинаются в `resetHour` по часовому поясу UTC+`utcOffsetMinutes`.
 * Своего правила дня в игре не было — это первое, все суточные механики должны брать его отсюда.
 */
export const GAME_DAY = {
  utcOffsetMinutes: 0,
  resetHour: 0
}

export interface StatLine {
  label: string
  value: string
}

export interface BuildingDef {
  id: BuildingId
  icon: string
  name: string
  /** Короткое имя для кнопок нижней панели. */
  short: string
  /** Назначение здания одной-двумя фразами. */
  desc: string
  /** Цена в Вкусняшках: `[0]` — постройка, `[n]` — улучшение с уровня n на n+1. */
  cost: readonly [number, number, number, number, number]
  /** Что нужно для постройки: минимальные уровни других зданий (нет — строится сразу). */
  requires?: Partial<Record<BuildingId, number>>
  /** Характеристики уровня — для карточки здания (текущий и следующий уровень). */
  stats(level: number): StatLine[]
}

const pct = (v: number) => `${Math.round(v * 100)}%`

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  barracks: {
    id: "barracks",
    icon: "🛡️",
    get name() { return tr("Barracks", "Казармы") },
    get short() { return tr("Barracks", "Казармы") },
    get desc() { return tr("Home of your roster. The higher the level, the more fighters you can keep.", "Дом ростера бойцов. Чем выше уровень, тем больше бойцов можно содержать.") },
    cost: [0, 150, 350, 700, 1400],
    stats: level => [{ label: tr("Roster capacity", "Вместимость ростера"), value: String(atLevel(BARRACKS.capacity, level)) }]
  },
  training: {
    id: "training",
    icon: "🎯",
    get name() { return tr("Training Ground", "Тренировочный полигон") },
    get short() { return tr("Training", "Полигон") },
    get desc() { return tr("Fighters left here gain experience over time and after every sortie. They stay on the roster but don’t go into battle.", "Оставленные здесь бойцы получают опыт со временем и после каждой вылазки. Они остаются в ростере, но в бой не идут.") },
    cost: [120, 200, 400, 800, 1500],
    stats: level => [
      { label: tr("Training slots", "Мест для тренировки"), value: String(atLevel(TRAINING.capacity, level)) },
      { label: tr("XP per hour", "Опыт в час"), value: `+${atLevel(TRAINING.xpPerHour, level)}` },
      { label: tr("XP after a sortie", "Опыт после вылазки"), value: `+${atLevel(TRAINING.sortieXp, level)}` }
    ]
  },
  store: {
    id: "store",
    icon: "🛒",
    get name() { return tr("Trading Post", "Торговая лавка") },
    get short() { return tr("Shop", "Лавка") },
    get desc() { return tr(`Weapons and talismans. Stock changes every ${STORE.refreshHours} hours; higher levels bring more goods and lower prices.`, `Оружие и талисманы. Ассортимент меняется каждые ${STORE.refreshHours} ч; с уровнем товаров больше, а цены ниже.`) },
    cost: [80, 180, 380, 750, 1400],
    stats: level => [
      { label: tr("Goods on display", "Товаров на витрине"), value: String(atLevel(STORE.offers, level)) },
      { label: tr("Discount", "Скидка"), value: pct(atLevel(STORE.discount, level)) }
    ]
  },
  graveyard: {
    id: "graveyard",
    icon: "🪦",
    get name() { return tr("Graveyard", "Кладбище") },
    get short() { return tr("Graveyard", "Кладбище") },
    get desc() { return tr(`Keeps the names of the fallen. At level ${GRAVEYARD.reviveLevel} it can bring one fighter back per day — without their gear.`, `Хранит имена павших. На ${GRAVEYARD.reviveLevel}-м уровне может вернуть одного бойца в день — без снаряжения.`) },
    cost: [60, 150, 350, 800, 2000],
    stats: level => [{
      label: tr("Resurrection", "Воскрешение"),
      value: level >= GRAVEYARD.reviveLevel ? tr("1 per day", "1 в день") : tr(`from level ${GRAVEYARD.reviveLevel}`, `с ${GRAVEYARD.reviveLevel}-го уровня`)
    }]
  },
  tavern: {
    id: "tavern",
    icon: "🍺",
    get name() { return tr("The Last Stand Bar", "Бар «Последний рубеж»") },
    get short() { return tr("Bar", "Бар") },
    get desc() { return tr("A mug before the sortie: the squad gets a boost to some stats for one sortie. Higher levels pour stronger and offer more brews.", "Кружка перед вылазкой: отряд получает прибавку к статам на одну вылазку. С уровнем наливают крепче и сортов больше.") },
    cost: [150, 250, 500, 900, 1600],
    stats: level => [
      { label: tr("Brews on the menu", "Сортов в меню"), value: String(atLevel(TAVERN_MENU, level)) },
      { label: tr("Drink strength", "Крепость напитков"), value: `×${atLevel(TAVERN.power, level)}` }
    ]
  }
}

export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[]

export function buildingDef(id: BuildingId): BuildingDef {
  return BUILDINGS[id]
}

/* ---------- Карта ---------- */

/**
 * Поселение — Phaser-локация сверху (`scene/settlement`), по которой ходит герой. Карта в три экрана шириной: экран —
 * `SCREEN_W` клеток, камера вписывает его в ширину телефона и идёт за героем вбок. Первый экран — Казармы и Лавка,
 * второй — полигон, бар и ворота на вылазку, третий — роща и Кладбище.
 * Поселение — деревня выживших за частоколом: снаружи бродят зомби, внутрь — только через ворота.
 * Легенда: `F` частокол, `T` дерево, `#` участок под здание, `D` вход на участок, `G` ворота на выход из поселения, `~` пруд,
 * `b` куст, `g` ограда Кладбища — непроходимо; `.` трава, `=` тропинка, `*` цветы — проходимо.
 */
export const SETTLEMENT_TILES: readonly string[] = [
  "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF",
  "F.*........*.......*......T.....F",
  "F####.####..#####.####.T.....T.TF",
  "F##D#.##D#..##D##.##D#..T...T...F",
  "F..=....=.....=.....=...........F",
  "F.=============================.F",
  "F....=....*.....=.......=......*F",
  "F.**.=...b...*..=...*.T.=gggg...F",
  "F.**.=.~~.......=....b..=gggg.*.F",
  "F....=.~~..b....=.......=gggg...F",
  "F*...=..........============...bF",
  "F..===...*.T.*..=...............F",
  "F...............=....*.*..b..~~TF",
  "Fb.T..b..b..T.b.=...T........~~.F",
  "FFFFFFFFFFFFFFFGGGFFFFFFFFFFFFFFF"
]

export const SETTLEMENT_W = 33
export const SETTLEMENT_H = SETTLEMENT_TILES.length
/** Ширина одного экрана в клетках: карта — три таких экрана. */
export const SCREEN_W = 11

export type SettlementTile = "fence" | "tree" | "wall" | "door" | "gate" | "water" | "bush" | "grave" | "grass" | "path" | "flowers"

export const TILE_LEGEND: Record<string, SettlementTile> = {
  "F": "fence",
  "T": "tree",
  "#": "wall",
  "D": "door",
  "G": "gate",
  "~": "water",
  "b": "bush",
  "g": "grave",
  ".": "grass",
  "=": "path",
  "*": "flowers"
}

export const WALKABLE_TILES: ReadonlySet<SettlementTile> = new Set(["grass", "path", "flowers"])

/**
 * Место под строительство: прямоугольник участка в клетках (непроходим, построено здание или нет) и `front` — точка
 * у входа, откуда герой открывает карточку места. Здание у места своё (`building`); место без здания — резерв под
 * будущие постройки, на нём пока ничего не строится.
 */
export interface PlotDef {
  id: string
  building?: BuildingId
  x: number
  y: number
  w: number
  h: number
  front: Pos
}

/** Точка у входа на участок: под клеткой `D` в середине нижнего ряда. */
const frontOf = (x: number, y: number, w: number, h: number): Pos => ({ x: x + Math.floor(w / 2) + 0.5, y: y + h + 0.5 })

export const PLOTS: readonly PlotDef[] = [
  { id: "plot-barracks", building: "barracks", x: 1, y: 2, w: 4, h: 2, front: frontOf(1, 2, 4, 2) },
  { id: "plot-store", building: "store", x: 6, y: 2, w: 4, h: 2, front: frontOf(6, 2, 4, 2) },
  { id: "plot-training", building: "training", x: 12, y: 2, w: 5, h: 2, front: frontOf(12, 2, 5, 2) },
  { id: "plot-tavern", building: "tavern", x: 18, y: 2, w: 4, h: 2, front: frontOf(18, 2, 4, 2) },
  // Кладбище огорожено со всех сторон: подходят снизу, по тропинке вдоль ограды
  { id: "plot-graveyard", building: "graveyard", x: 25, y: 7, w: 4, h: 3, front: { x: 27, y: 10.5 } }
]

/** Ворота на вылазку — не здание: стоят всегда (клетки `G` в нижнем ряду), ведут к выбору боя. */
export const SORTIE_GATE = { x: 15, y: 14, w: 3, front: { x: 16.5, y: 13.4 } } as const

export function plotOf(id: BuildingId): PlotDef {
  return PLOTS.find(p => p.building === id) as PlotDef
}

/** Место на карте, у которого открывается карточка: участок (`plot-…`) или ворота (`gate`). */
export type PlaceId = string

export function placeFront(id: PlaceId): Pos | undefined {
  return id === "gate" ? SORTIE_GATE.front : PLOTS.find(p => p.id === id)?.front
}

/** Житель у места: стоит, пока здание построено (у ворот — всегда). Шерсть и глаза — для арта (`furArt`, `eyeArt`). */
export interface NpcDef {
  id: string
  place: PlaceId
  /** Нет — житель есть всегда. */
  building?: BuildingId
  name: string
  species: Species
  /** Центр в клетках (дробные координаты, как у героя). */
  pos: Pos
  fur: number
  eyes: number
  accessory: number
}

export const NPCS: readonly NpcDef[] = [
  {
    id: "sergeant",
    place: "plot-barracks",
    building: "barracks",
    get name() { return tr("Sergeant Barkley", "Сержант Барбос") },
    species: "dog",
    pos: { x: 1.9, y: 4.6 },
    fur: 4,
    eyes: 4,
    accessory: 3
  },
  {
    id: "trader",
    place: "plot-store",
    building: "store",
    get name() { return tr("Auntie Brie", "Тётушка Сырница") },
    species: "mouse",
    pos: { x: 9.9, y: 4.6 },
    fur: 1,
    eyes: 0,
    accessory: 6
  },
  {
    id: "coach",
    place: "plot-training",
    building: "training",
    get name() { return tr("Coach Whisker", "Тренер Ус") },
    species: "cat",
    pos: { x: 16.4, y: 4.6 },
    fur: 3,
    eyes: 2,
    accessory: 2
  },
  {
    id: "keeper",
    place: "plot-graveyard",
    building: "graveyard",
    get name() { return tr("Keeper Moss", "Смотритель Мох") },
    species: "dog",
    pos: { x: 28.4, y: 10.6 },
    fur: 2,
    eyes: 1,
    accessory: 0
  },
  {
    id: "barkeep",
    place: "plot-tavern",
    building: "tavern",
    get name() { return tr("Barkeep Hops", "Трактирщица Хмель") },
    species: "mouse",
    pos: { x: 21.9, y: 4.6 },
    fur: 3,
    eyes: 2,
    accessory: 4
  },
  {
    id: "scout",
    place: "gate",
    get name() { return tr("Scout Scar", "Разведчик Шрам") },
    species: "cat",
    pos: { x: 18.1, y: 13.4 },
    fur: 0,
    eyes: 0,
    accessory: 1
  }
]

/**
 * Рыбак у пруда: живёт сам по себе — не привязан к месту, не разговаривает, только удит и бубнит под нос про рыбу
 * (облачко над головой, `FISHER_MUTTERS`). Стоит всегда; герой обходит его, как жителя.
 */
export interface AmbientNpcDef {
  id: string
  name: string
  species: Species
  pos: Pos
  fur: number
  eyes: number
  accessory: number
  /** Смотрит влево (к воде). */
  faceLeft: boolean
}

export const FISHER: AmbientNpcDef = {
  id: "fisher",
  get name() { return tr("Old Perch", "Дед Окунь") },
  species: "cat",
  // справа от пруда (клетки `~` x 7–8, y 8–9), лицом к воде
  pos: { x: 9.5, y: 9.4 },
  fur: 2,
  eyes: 3,
  accessory: 2,
  faceLeft: true
}

/** Бубнёж рыбака: первая реплика — через столько секунд, потом пауза между репликами (от и до), с. */
export const MUTTER_TIMING = { first: 3, gap: [7, 13], hold: 3.5, perChar: 0.045 } as const

/**
 * Сплетники: двое стоят где-нибудь на лужайке и перекидываются цитатами (`content/quotes.json`) в облачках.
 * Время от времени переходят на другое место из `GOSSIP_SPOTS`. Пять тапов по одному — он взрывается (до следующего
 * захода в поселение); без собеседника второй замолкает.
 */
export interface GossipDef {
  id: string
  name: string
  species: Species
  fur: number
  eyes: number
  accessory: number
  /** Цвет облачка с его репликами. */
  bubble: number
}

export const GOSSIPS: readonly [GossipDef, GossipDef] = [
  {
    id: "elman",
    get name() { return tr("Glam Kitty Elman", "Гламурная Киса Эльман") },
    species: "cat",
    fur: 9,
    eyes: 2,
    accessory: 6,
    bubble: 0xffd9e8
  },
  {
    id: "vanya",
    get name() { return tr("Ginger Dog Vanya", "Рыжий пёс Ваня") },
    species: "dog",
    fur: 0,
    eyes: 3,
    accessory: 7,
    bubble: 0xffe6c8
  }
]

/** Где сплетники могут стоять: левый (Киса) — в `pos`, правый (Ваня) — правее на `GOSSIP_GAP`, лицом друг к другу. */
export const GOSSIP_SPOTS: readonly Pos[] = [
  { x: 12.6, y: 7.6 },
  { x: 2.5, y: 12.5 },
  { x: 18.0, y: 8.5 },
  { x: 21.5, y: 11.6 },
  { x: 26.3, y: 6.6 },
  { x: 12.4, y: 12.4 }
]
export const GOSSIP_GAP = 2

/** Ритм болтовни (секунды): первая реплика, пауза между репликами, сколько висит облачко, переход на другое место. */
export const GOSSIP_TIMING = {
  first: 4,
  gap: [0.8, 2.2],
  hold: 3,
  perChar: 0.05,
  move: [70, 110],
  /** Тапов до взрыва. */
  taps: 5
} as const

/**
 * Дождь над поселением: время делится на окна по `cycleMs`, в доле `share` окон (выбор детерминирован номером окна)
 * идёт дождь. Чистая презентация — на игру не влияет.
 */
export const SETTLEMENT_RAIN = {
  cycleMs: 4 * 60_000,
  share: 0.4
} as const

/** Где герой появляется в новой игре (между Казармами и Лавкой) и после боя (у ворот: вернулся из-за околицы). */
export const HERO_START: Pos = { x: 5.5, y: 6.5 }
export const HERO_RETURN: Pos = { x: 16.5, y: 13.2 }

/** Скорость героя (клеток в секунду), радиусы столкновений и входа в место (в клетках). */
export const HERO_SPEED = 3.4
export const HERO_RADIUS = 0.3
export const NPC_RADIUS = 0.35
export const REACH_RADIUS = 1.35
