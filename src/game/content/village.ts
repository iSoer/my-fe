import type { Facing, Pos, Species } from "@game/core/types"
import { tr } from "@game/i18n"

// Деревня-хаб между боями: карта клетками, домики и NPC. Логика движения — `core/village`, отрисовка — `scene/village`.

/**
 * Город как меню: вертикальная карта целиком помещается на экран телефона, каждое место — здание с вывеской.
 * Легенда: `T` дерево, `#` стена домика, `D` дверь, `G` ворота на выход из поселения, `~` пруд, `b` куст,
 * `g` ограда Кладбища — непроходимо; `.` трава, `=` тропинка, `*` цветы — проходимо.
 */
export const VILLAGE_MAP: readonly string[] = [
  "TTTTTTTTTTT",
  "T.........T",
  "T####.####T",
  "T##D#.##D#T",
  "T..=...=..T",
  "T..======.T",
  "T*...=...*T",
  "Tgggg=.~~.T",
  "Tgggg=.~~bT",
  "Tgggg=....T",
  "T*..==...*T",
  "T....=....T",
  "Tb...=....T",
  "T....=...bT",
  "TTTTGGGTTTT"
]

export const VILLAGE_W = 11
export const VILLAGE_H = VILLAGE_MAP.length

export type VillageTile = "tree" | "wall" | "door" | "gate" | "water" | "bush" | "grave" | "grass" | "path" | "flowers"

export const VILLAGE_LEGEND: Record<string, VillageTile> = {
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

export const WALKABLE_TILES: ReadonlySet<VillageTile> = new Set(["grass", "path", "flowers"])

export type NpcId = "barracks" | "store" | "graveyard" | "sorties"

export interface HouseDef {
  npc: "barracks" | "store"
  /** Прямоугольник стен в клетках (дверь — в середине нижнего ряда). */
  x: number
  y: number
  w: number
  h: number
  sign: string
  roof: string
  wall: string
}

export interface NpcDef {
  id: NpcId
  name: string
  /** Роль над головой. */
  title: string
  species: Species
  /** Центр NPC в клетках (дробные координаты, как у героя). */
  pos: Pos
  facing: Facing
  greeting: string
  /** Шерсть и глаза для арта (`furArt`, `eyeArt`), оружие в лапах — только украшение. */
  fur: number
  eyes: number
  accessory: number
}

export const HOUSES: readonly HouseDef[] = [
  { npc: "barracks", x: 1, y: 2, w: 4, h: 2, get sign() { return tr("Barracks", "Казарма") }, roof: "#8c3b2e", wall: "#d9b48a" },
  { npc: "store", x: 6, y: 2, w: 4, h: 2, get sign() { return tr("Shop", "Лавка") }, roof: "#2f6b4f", wall: "#e3c89b" }
]

/** Кладбище: огороженный участок `g` с надгробиями, у калитки снизу — Смотритель. */
export const GRAVEYARD = { x: 1, y: 7, w: 4, h: 3 } as const

/** Ворота на выход из поселения: клетки `G` в нижнем ряду, тропинка уходит в середину; у ворот — Разведчик Шрам. */
export const GATE = { x: 4, y: 14, w: 3, get sign() { return tr("Beyond the Fence", "За околицу") } } as const

/**
 * Места города — пункты меню: иконка, название и что внутри (вывеска над зданием и кнопка нижней панели),
 * `rect` — здание целиком в клетках, включая крышу: по нему ловится тап и ставится вывеска.
 */
export interface PlaceDef {
  id: NpcId
  icon: string
  name: string
  hint: string
  rect: { x: number, y: number, w: number, h: number }
}

/** Сколько клеток крыша домика выступает над прямоугольником стен (то же, что `HOUSE_ROOF_OVER` арта). */
const ROOF = 1.4
const houseRect = (h: HouseDef) => ({ x: h.x, y: h.y - ROOF, w: h.w, h: h.h + ROOF })

export const PLACES: readonly PlaceDef[] = [
  {
    id: "barracks",
    icon: "🛡️",
    get name() { return tr("Barracks", "Казарма") },
    get hint() { return tr("Army · recruits", "Армия · набор") },
    rect: houseRect(HOUSES[0] as HouseDef)
  },
  {
    id: "store",
    icon: "🛒",
    get name() { return tr("Shop", "Лавка") },
    get hint() { return tr("Weapons · talismans", "Оружие · талисманы") },
    rect: houseRect(HOUSES[1] as HouseDef)
  },
  {
    id: "graveyard",
    icon: "🪦",
    get name() { return tr("Graveyard", "Кладбище") },
    get hint() { return tr("The fallen", "Павшие") },
    rect: { ...GRAVEYARD, y: GRAVEYARD.y - 0.5, h: GRAVEYARD.h + 0.5 }
  },
  {
    id: "sorties",
    icon: "⚔️",
    get name() { return tr("Sortie", "Вылазка") },
    get hint() { return tr("To battle", "В бой") },
    rect: { x: GATE.x, y: GATE.y - 1.3, w: GATE.w, h: 2.3 }
  }
]

export function placeDef(id: NpcId): PlaceDef {
  return PLACES.find(p => p.id === id) as PlaceDef
}

export const NPCS: readonly NpcDef[] = [
  {
    id: "barracks",
    get name() { return tr("Sergeant Barkley", "Сержант Барбос") },
    get title() { return tr("Army & Recruits", "Армия и набор") },
    species: "dog",
    pos: { x: 1.9, y: 4.6 },
    facing: "down",
    get greeting() { return tr("Ten-hut! Who's joining the squad, who are we hiring?", "Смирно! Кого берём в отряд, кого нанимаем?") },
    fur: 4,
    eyes: 4,
    accessory: 3
  },
  {
    id: "store",
    get name() { return tr("Auntie Brie", "Тётушка Сырница") },
    get title() { return tr("Gear", "Снаряжение") },
    species: "mouse",
    pos: { x: 9.2, y: 4.6 },
    facing: "down",
    get greeting() { return tr("Come on in, dearie! Weapons and talismans — all at honest prices.", "Заходи, милок! Оружие и талисманы — всё по честной цене.") },
    fur: 1,
    eyes: 0,
    accessory: 6
  },
  {
    id: "graveyard",
    get name() { return tr("Keeper Moss", "Смотритель Мох") },
    get title() { return tr("Graveyard", "Кладбище") },
    species: "dog",
    pos: { x: 2.9, y: 10.6 },
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
    pos: { x: 7.6, y: 13.4 },
    facing: "down",
    get greeting() { return tr("Trouble beyond the gate again. Gather a squad and I'll take you past the fence, show you where the pickings are.", "За воротами опять неспокойно. Соберёшь отряд — выведу за околицу, покажу, где поживиться.") },
    fur: 0,
    eyes: 0,
    accessory: 1
  }
]

/** Где герой появляется в новой игре (на площади) и после боя (у ворот: вернулся из-за околицы). */
export const HERO_START: Pos = { x: 5.5, y: 6.5 }
export const HERO_RETURN: Pos = { x: 5.5, y: 13.2 }

/** Скорость героя (клеток в секунду), радиусы столкновений и разговора (в клетках). */
export const HERO_SPEED = 3.4
export const HERO_RADIUS = 0.3
export const NPC_RADIUS = 0.35
export const TALK_RADIUS = 1.35
