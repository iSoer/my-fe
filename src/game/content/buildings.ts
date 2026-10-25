import type { Stat } from "@game/core/types"
import { tr } from "@game/i18n"

// Поселение: здания с уровнями 1–5, каждое открывает свою механику. Логика — `core/settlement`, числа — здесь.

export type BuildingId = "barracks" | "market" | "training" | "hospital" | "canteen" | "fields"

export const BUILDING_IDS: readonly BuildingId[] = ["barracks", "market", "training", "hospital", "canteen", "fields"]

/** Наибольший уровень здания. */
export const MAX_BUILDING_LEVEL = 5

/** Цена и требование одного уровня здания: Вкусняшки, Еда и уровень ростера (`rosterLevel`). */
export interface BuildingLevel {
  treats: number
  food: number
  rosterLevel: number
}

export interface BuildingDef {
  id: BuildingId
  icon: string
  name: string
  desc: string
  /** Уровни 1–5: `levels[0]` — постройка, дальше — улучшения. */
  levels: readonly BuildingLevel[]
  /** Эффект на уровне 1–5 одной строкой (для карточки здания: «сейчас» и «дальше»). */
  effect: (level: number) => string
}

const lv = (treats: number, rosterLevel: number, food = 0): BuildingLevel => ({ treats, food, rosterLevel })

/** Значение таблицы по уровню 1–5 (уровень 0 — здания нет, берётся первое значение). */
export function atLevel<T>(table: readonly T[], level: number): T {
  return table[Math.max(0, Math.min(table.length, level) - 1)] as T
}

/* ---------- Казармы ---------- */

export const BARRACKS = {
  /** Сколько бойцов вмещает ростер на уровнях 1–5. */
  rosterCap: [8, 10, 12, 15, 20] as const
}

/* ---------- Торговая площадка (Лавка) ---------- */

export const MARKET = {
  /** Витрина обновляется раз в реальный час. */
  refreshMs: 60 * 60 * 1000,
  /** Сколько разновидностей оружия и талисманов добавляется к базовой витрине на уровнях 1–5. */
  extraVariants: [0, 1, 2, 3, 4] as const,
  extraTalismans: [0, 0, 1, 1, 2] as const,
  /** Шанс, что оружие витрины придёт усиленным (железо → сталь, сталь → серебро), на уровнях 1–5. */
  upgradeChance: [0, 0.12, 0.22, 0.32, 0.45] as const
}

/* ---------- Тренировочный полигон ---------- */

export const TRAINING = {
  /** Слотов на полигоне. */
  slots: 4,
  /** Опыт каждому бойцу полигона за каждый бой основного отряда, на уровнях 1–5. */
  xpPerBattle: [15, 25, 35, 50, 70] as const,
  /** Опыт в реальный час на полигоне. */
  xpPerHour: [10, 20, 30, 45, 60] as const,
  /** Сколько часов отсутствия засчитывается за раз (офлайн-прогресс). */
  maxHours: [8, 12, 16, 20, 24] as const
}

/* ---------- Усталость и Больница ---------- */

export const FATIGUE = {
  /** Штраф за стак: доля от Str, Mag, Spd, Def и Res (HP не трогает). */
  perStack: 0.03,
  maxStacks: 5,
  stats: ["str", "mag", "spd", "def", "res"] as readonly Stat[]
}

export const HOSPITAL = {
  /** Сколько бойцов Больница вылечит от усталости за раз; заряды восстанавливаются после каждого боя. */
  charges: [1, 2, 3, 4, 6] as const
}

/* ---------- Столовая ---------- */

export interface DishDef {
  id: string
  icon: string
  name: string
  desc: string
  /** Бафф на один бой: доля к статам (0.1 = +10 %, не меньше +1). */
  buff: Partial<Record<Stat, number>>
  food: number
  /** С какого уровня Столовой блюдо в меню. */
  minLevel: number
}

export const CANTEEN = {
  /** Скольких бойцов отряда можно накормить перед вылазкой на уровнях 1–5 (5 — весь отряд). */
  fed: [1, 2, 2, 3, 4] as const
}

export const DISHES: readonly DishDef[] = [
  {
    id: "fish_soup",
    icon: "🍲",
    get name() { return tr("Fish Soup", "Рыбная похлёбка") },
    get desc() { return tr("+10% HP and Def for the battle.", "+10 % HP и Def на бой.") },
    buff: { hp: 0.1, def: 0.1 },
    food: 8,
    minLevel: 1
  },
  {
    id: "meat_pie",
    icon: "🥧",
    get name() { return tr("Meat Pie", "Мясной пирог") },
    get desc() { return tr("+10% Str and Mag for the battle.", "+10 % Str и Mag на бой.") },
    buff: { str: 0.1, mag: 0.1 },
    food: 12,
    minLevel: 2
  },
  {
    id: "cheese_plate",
    icon: "🧀",
    get name() { return tr("Cheese Plate", "Сырная тарелка") },
    get desc() { return tr("+12% Spd for the battle.", "+12 % Spd на бой.") },
    buff: { spd: 0.12 },
    food: 12,
    minLevel: 3
  },
  {
    id: "honey_cake",
    icon: "🍯",
    get name() { return tr("Honey Cake", "Медовик") },
    get desc() { return tr("+10% Def and Res for the battle.", "+10 % Def и Res на бой.") },
    buff: { def: 0.1, res: 0.1 },
    food: 15,
    minLevel: 4
  },
  {
    id: "feast",
    icon: "🍗",
    get name() { return tr("Hero's Feast", "Пир героя") },
    get desc() { return tr("+8% to every stat for the battle.", "+8 % ко всем статам на бой.") },
    buff: { hp: 0.08, str: 0.08, mag: 0.08, spd: 0.08, def: 0.08, res: 0.08 },
    food: 25,
    minLevel: 5
  }
]

export function dishDef(id: string): DishDef | undefined {
  return DISHES.find(d => d.id === id)
}

/* ---------- Поля и Еда ---------- */

export const FIELDS = {
  /** Еды в реальный час и вместимость амбара на уровнях 1–5. */
  perHour: [6, 10, 15, 22, 30] as const,
  storage: [60, 120, 200, 320, 480] as const
}

export const FOOD = {
  /** Вкусняшек за единицу проданной Еды. */
  sellPrice: 2
}

/* ---------- Здания ---------- */

const pct = (x: number) => `${Math.round(x * 100)} %`

export const BUILDINGS: readonly BuildingDef[] = [
  {
    id: "barracks",
    icon: "🛡️",
    get name() { return tr("Barracks", "Казармы") },
    get desc() { return tr("How many fighters the roster can hold.", "Сколько бойцов вмещает ростер.") },
    levels: [lv(0, 1), lv(300, 1), lv(900, 10), lv(2000, 20), lv(4000, 35)],
    effect: l => tr(`Roster up to ${atLevel(BARRACKS.rosterCap, l)}`, `Ростер до ${atLevel(BARRACKS.rosterCap, l)}`)
  },
  {
    id: "market",
    icon: "🛒",
    get name() { return tr("Market", "Торговая площадка") },
    get desc() { return tr("Auntie Brie's stall: new stock every real hour.", "Лавка Тётушки Сырницы: новый товар каждый реальный час.") },
    levels: [lv(0, 1), lv(400, 5), lv(1000, 15), lv(2200, 25), lv(4500, 40)],
    effect: l => l <= 1
      ? tr("Basic stock", "Обычная витрина")
      : tr(
        `+${atLevel(MARKET.extraVariants, l) + atLevel(MARKET.extraTalismans, l)} goods, upgraded gear ${pct(atLevel(MARKET.upgradeChance, l))}`,
        `+${atLevel(MARKET.extraVariants, l) + atLevel(MARKET.extraTalismans, l)} товаров, усиленное оружие ${pct(atLevel(MARKET.upgradeChance, l))}`
      )
  },
  {
    id: "training",
    icon: "🎯",
    get name() { return tr("Training Ground", "Тренировочный полигон") },
    get desc() {
      return tr(
        `Up to ${TRAINING.slots} fighters train while the squad fights and while time passes — up to one level below your strongest fighter.`,
        `До ${TRAINING.slots} бойцов тренируются, пока отряд в бою и пока идёт время, — до уровня на 1 ниже сильнейшего бойца.`
      )
    },
    levels: [lv(150, 1), lv(500, 5), lv(1200, 15), lv(2500, 30), lv(5000, 45)],
    effect: l =>
      tr(
        `${atLevel(TRAINING.xpPerBattle, l)} XP per battle, ${atLevel(TRAINING.xpPerHour, l)} XP/h (up to ${atLevel(TRAINING.maxHours, l)} h)`,
        `${atLevel(TRAINING.xpPerBattle, l)} опыта за бой, ${atLevel(TRAINING.xpPerHour, l)} в час (до ${atLevel(TRAINING.maxHours, l)} ч)`
      )
  },
  {
    id: "hospital",
    icon: "🏥",
    get name() { return tr("Hospital", "Больница") },
    get desc() {
      return tr(
        "Fighters come back from every battle more tired. The Hospital cures fatigue; charges refill after each battle.",
        "Из каждого боя бойцы возвращаются всё более уставшими. Больница снимает усталость; заряды восстанавливаются после каждого боя."
      )
    },
    levels: [lv(100, 1), lv(400, 5), lv(1000, 15), lv(2000, 25), lv(4000, 40)],
    effect: l => tr(`Cures ${atLevel(HOSPITAL.charges, l)} per battle`, `Лечит ${atLevel(HOSPITAL.charges, l)} за бой`)
  },
  {
    id: "canteen",
    icon: "🍽️",
    get name() { return tr("Canteen", "Столовая") },
    get desc() { return tr("Feed the squad before a sortie: a meal buffs a fighter for one battle.", "Накормите отряд перед вылазкой: блюдо усиливает бойца на один бой.") },
    levels: [lv(150, 1), lv(450, 5, 40), lv(1000, 15, 80), lv(2200, 25, 120), lv(4500, 40, 200)],
    effect: (l) => {
      const fed = atLevel(CANTEEN.fed, l)
      const dishes = DISHES.filter(d => d.minLevel <= l).length
      return tr(`Feeds ${fed} of the squad, ${dishes} dishes`, `Кормит ${fed} из отряда, блюд: ${dishes}`)
    }
  },
  {
    id: "fields",
    icon: "🌾",
    get name() { return tr("Fields", "Поля") },
    get desc() {
      return tr(
        `Grow Food over real time. Food feeds the Canteen; spare Food sells for ${FOOD.sellPrice} 🦴 each.`,
        `Растят Еду в реальном времени. Еда идёт в Столовую, излишки продаются по ${FOOD.sellPrice} 🦴.`
      )
    },
    levels: [lv(100, 1), lv(350, 5), lv(900, 15), lv(2000, 25), lv(4000, 40)],
    effect: l => tr(`${atLevel(FIELDS.perHour, l)} Food/h, barn ${atLevel(FIELDS.storage, l)}`, `${atLevel(FIELDS.perHour, l)} Еды в час, амбар ${atLevel(FIELDS.storage, l)}`)
  }
]

export function buildingDef(id: BuildingId): BuildingDef {
  return BUILDINGS.find(b => b.id === id) as BuildingDef
}

/** Уровни зданий новой игры: Казармы и Лавка уже стоят, остальное строится. */
export const START_BUILDINGS: Record<BuildingId, number> = {
  barracks: 1,
  market: 1,
  training: 0,
  hospital: 0,
  canteen: 0,
  fields: 0
}
