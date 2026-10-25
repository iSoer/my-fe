import type { Facing, Pos, Species } from "@game/core/types"
import type { BuildingId } from "@game/content/buildings"
import { tr } from "@game/i18n"

// Лагерь-хаб между боями: карта клетками за частоколом, постройки игрока, декор и жители.
// Логика движения и расстановки — `core/village`, отрисовка — `scene/village`.

/**
 * Местность лагеря. Постройки игрока на карте не нарисованы — они ставятся поверх травы (`core/village`).
 * Легенда: `T` дерево, `f` частокол, `#` стена Ратуши, `D` её дверь, `G` ворота, `~` пруд, `b` куст,
 * `g` ограда Кладбища — непроходимо; `.` трава, `*` цветы — проходимо, на них можно строить;
 * `=` тропинка — проходима, строить нельзя.
 */
export const VILLAGE_MAP: readonly string[] = [
  "TTTTTTTTTTTTTTTTTTTTTT",
  "TbTTTTTTTTTTTTTTTTTTbT",
  "TTffffffffffffffffffTT",
  ...[
    ".....b......*..*",
    "gggg.......~~~.*",
    "gggg....*..~~~..",
    "gggg...........b",
    "..=.............",
    "..=......*......",
    "..=...####......",
    "..=...##D#......",
    "..=..=====......",
    "================",
    "........=.......",
    "........=.......",
    "*.......=......*",
    "........=.......",
    "........=.......",
    "........=.......",
    ".b......=.......",
    "........=.......",
    "........=.......",
    "........=.....b.",
    "........=.......",
    "*.......=......*",
    "........=......."
  ].map(row => `TTf${row}fTT`),
  "TTffffffffGGGfffffffTT"
]

export const VILLAGE_W = 22
export const VILLAGE_H = VILLAGE_MAP.length

export type VillageTile = "tree" | "fence" | "wall" | "door" | "gate" | "water" | "bush" | "grave" | "grass" | "path" | "flowers"

export const VILLAGE_LEGEND: Record<string, VillageTile> = {
  "T": "tree",
  "f": "fence",
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

export const WALKABLE_TILES: ReadonlySet<VillageTile> = new Set(["grass", "path", "flowers"])
/** Где можно ставить постройки и декор: трава и цветы (тропинки оставляем для прохода). */
export const BUILDABLE_TILES: ReadonlySet<VillageTile> = new Set(["grass", "flowers"])

/**
 * Места лагеря — то, с чем герой разговаривает: постройки игрока (id здания) и постоянные места —
 * Ратуша, Кладбище и ворота на вылазку.
 */
export type PlaceId = BuildingId | "settlement" | "graveyard" | "sorties"

/** Ратуша Старосты — постоянный домик в центре лагеря (дверь — в середине нижнего ряда). */
export const HALL = { x: 9, y: 9, w: 4, h: 2, roof: "#6b4a8c", wall: "#e8d4b0" } as const

/** Кладбище: огороженный участок `g` с надгробиями, у калитки снизу — Смотритель. */
export const GRAVEYARD = { x: 3, y: 4, w: 4, h: 3 } as const

/** Ворота на выход из лагеря: клетки `G` в нижнем ряду, тропинка уходит в середину; у ворот — Разведчик Шрам. */
export const GATE = { x: 10, y: 26, w: 3 } as const

/** Сколько клеток крыша домика выступает над прямоугольником стен (то же, что `HOUSE_ROOF_OVER` арта). */
export const ROOF = 1.4

/* ---------- Постройки игрока ---------- */

export interface BuildingShape {
  /** Занятые клетки (стены, ограда): ширина и высота. Вход — клетка под серединой нижнего ряда. */
  w: number
  h: number
  /** Сколько клеток спрайт выступает над участком (крыша, чучела, пугало). */
  over: number
  /** Куда здание ставится по умолчанию (новая игра, миграция, постройка без выбора места). */
  pref: Pos
  roof: string
  wall: string
}

export const BUILDING_SHAPES: Record<BuildingId, BuildingShape> = {
  barracks: { w: 4, h: 2, over: ROOF, pref: { x: 4, y: 14 }, roof: "#8c3b2e", wall: "#d9b48a" },
  market: { w: 4, h: 2, over: ROOF, pref: { x: 14, y: 14 }, roof: "#2f6b4f", wall: "#e3c89b" },
  training: { w: 4, h: 3, over: 0.7, pref: { x: 4, y: 20 }, roof: "#8a5a33", wall: "#c9a36b" },
  hospital: { w: 3, h: 2, over: ROOF, pref: { x: 14, y: 8 }, roof: "#3a7ca5", wall: "#f4f1ea" },
  canteen: { w: 3, h: 2, over: ROOF, pref: { x: 6, y: 7 }, roof: "#b5651d", wall: "#e9cf9f" },
  fields: { w: 4, h: 3, over: 0.8, pref: { x: 14, y: 19 }, roof: "#8a5a33", wall: "#c9a36b" }
}

/* ---------- Декор ---------- */

export type DecorId = "path" | "flowers" | "sapling" | "barrels" | "bench" | "lantern" | "campfire" | "banner" | "well"

export interface DecorDef {
  id: DecorId
  icon: string
  name: string
  /** Цена в Вкусняшках; при сносе возвращается половина. */
  cost: number
  /** По декору можно ходить (тропинка, клумба) — он не мешает проходу и рисуется на земле. */
  walkable: boolean
  /** Высота спрайта в клетках (низ — нижний край клетки). */
  h: number
}

export const DECOR: readonly DecorDef[] = [
  { id: "path", icon: "🟫", get name() { return tr("Path", "Тропинка") }, cost: 5, walkable: true, h: 1 },
  { id: "flowers", icon: "🌷", get name() { return tr("Flower bed", "Клумба") }, cost: 10, walkable: true, h: 1 },
  { id: "sapling", icon: "🌳", get name() { return tr("Tree", "Дерево") }, cost: 15, walkable: false, h: 1.75 },
  { id: "barrels", icon: "🛢️", get name() { return tr("Barrels", "Бочки") }, cost: 20, walkable: false, h: 1.1 },
  { id: "bench", icon: "🪑", get name() { return tr("Bench", "Скамейка") }, cost: 20, walkable: false, h: 1 },
  { id: "lantern", icon: "🏮", get name() { return tr("Lantern", "Фонарь") }, cost: 25, walkable: false, h: 1.6 },
  { id: "campfire", icon: "🔥", get name() { return tr("Campfire", "Костёр") }, cost: 40, walkable: false, h: 1.2 },
  { id: "banner", icon: "🚩", get name() { return tr("Banner", "Знамя") }, cost: 50, walkable: false, h: 1.9 },
  { id: "well", icon: "🪣", get name() { return tr("Well", "Колодец") }, cost: 80, walkable: false, h: 1.5 }
]

export const DECOR_IDS: readonly DecorId[] = DECOR.map(d => d.id)

/** Сколько декора всего можно поставить в лагере. */
export const DECOR_LIMIT = 120

export function decorDef(id: DecorId): DecorDef {
  return DECOR.find(d => d.id === id) as DecorDef
}

/* ---------- Жители и места ---------- */

export interface NpcDef {
  /** Место, за которое отвечает житель: разговор с ним открывает это место. */
  id: PlaceId
  name: string
  /** Роль над головой. */
  title: string
  species: Species
  /** Центр NPC в клетках. Нет — житель стоит у входа своей постройки (справа от двери). */
  pos?: Pos
  facing: Facing
  greeting: string
  /** Шерсть и глаза для арта (`furArt`, `eyeArt`), оружие в лапах — только украшение. */
  fur: number
  eyes: number
  accessory: number
}

export const NPCS: readonly NpcDef[] = [
  {
    id: "barracks",
    get name() { return tr("Sergeant Barkley", "Сержант Барбос") },
    get title() { return tr("Army & Recruits", "Армия и набор") },
    species: "dog",
    facing: "down",
    get greeting() { return tr("Ten-hut! Who's joining the squad, who are we hiring?", "Смирно! Кого берём в отряд, кого нанимаем?") },
    fur: 4,
    eyes: 4,
    accessory: 3
  },
  {
    id: "market",
    get name() { return tr("Auntie Brie", "Тётушка Сырница") },
    get title() { return tr("Gear", "Снаряжение") },
    species: "mouse",
    facing: "down",
    get greeting() { return tr("Come on in, dearie! Weapons and talismans — all at honest prices.", "Заходи, милок! Оружие и талисманы — всё по честной цене.") },
    fur: 1,
    eyes: 0,
    accessory: 6
  },
  {
    id: "settlement",
    get name() { return tr("Elder Whiskers", "Староста Ус") },
    get title() { return tr("Camp", "Лагерь") },
    species: "cat",
    pos: { x: 12.4, y: 11.5 },
    facing: "down",
    get greeting() { return tr("Every stake of this camp was carried by paws. Let's build it up — the squad will thank us.", "Каждый кол здесь лапами принесён. Отстроим лагерь — отряд спасибо скажет.") },
    fur: 3,
    eyes: 2,
    accessory: 2
  },
  {
    id: "graveyard",
    get name() { return tr("Keeper Moss", "Смотритель Мох") },
    get title() { return tr("Graveyard", "Кладбище") },
    species: "dog",
    pos: { x: 4.9, y: 7.6 },
    facing: "down",
    get greeting() { return tr("Quiet here. I keep their names, so you don’t have to carry them all.", "Тихо тут. Я храню их имена, чтобы тебе не пришлось нести все самому.") },
    fur: 2,
    eyes: 1,
    accessory: 0
  },
  {
    id: "sorties",
    get name() { return tr("Scout Scar", "Разведчик Шрам") },
    get title() { return tr("Sorties", "Вылазки") },
    species: "cat",
    pos: { x: 12.8, y: 25.2 },
    facing: "down",
    get greeting() { return tr("Trouble beyond the gate again. Gather a squad and I'll take you past the fence, show you where the pickings are.", "За воротами опять неспокойно. Соберёшь отряд — выведу за частокол, покажу, где поживиться.") },
    fur: 0,
    eyes: 0,
    accessory: 1
  }
]

export function npcOf(id: PlaceId): NpcDef | undefined {
  return NPCS.find(n => n.id === id)
}

/** Постоянные места лагеря: иконка, название и что внутри (вывеска и кнопка нижней панели). */
export interface PlaceInfo {
  icon: string
  name: string
  hint: string
}

export const FIXED_PLACES: Record<"settlement" | "graveyard" | "sorties", PlaceInfo> = {
  settlement: {
    icon: "🏛️",
    get name() { return tr("Town Hall", "Ратуша") },
    get hint() { return tr("Camp · buildings", "Лагерь · здания") }
  },
  graveyard: {
    icon: "🪦",
    get name() { return tr("Graveyard", "Кладбище") },
    get hint() { return tr("The fallen", "Павшие") }
  },
  sorties: {
    icon: "⚔️",
    get name() { return tr("Sortie", "Вылазка") },
    get hint() { return tr("To battle", "В бой") }
  }
}

/** Где герой появляется в новой игре (на площади) и после боя (у ворот: вернулся из-за частокола). */
export const HERO_START: Pos = { x: 11.5, y: 13.5 }
export const HERO_RETURN: Pos = { x: 11.5, y: 24.6 }

/** Клетка перед воротами: от неё проверяется, что до каждого входа можно дойти. */
export const GATE_FRONT = { x: GATE.x + Math.floor(GATE.w / 2), y: GATE.y - 1 } as const

/** Скорость героя (клеток в секунду), радиусы столкновений и разговора (в клетках). */
export const HERO_SPEED = 4.2
export const HERO_RADIUS = 0.3
export const NPC_RADIUS = 0.35
export const TALK_RADIUS = 1.35
