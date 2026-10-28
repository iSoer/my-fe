import type { Stat } from "@game/core/types"
import { tr } from "@game/i18n"

// Бар «Последний рубеж»: хмельное на дорожку. Кружка заказывается в баре и действует одну следующую вылазку: бойцы
// отряда получают прибавку к статам в процентах. Чем выше уровень бара, тем крепче налито (`TAVERN.power`) и тем
// больше сортов в меню (`DrinkDef.minLevel`). Логика — `core/settlement/tavern`, бой — `core/battle/drink`.
// Числа — параметры конфигурации, а не утверждённый баланс (бой на «Нормально» ≈ 125 🦴).

/** Бар: множитель силы напитка на уровне 1…5 (к процентам `DrinkDef.pct`). */
export const TAVERN = {
  power: [1, 1.3, 1.6, 1.9, 2.25] as const
}

export interface DrinkDef {
  id: string
  icon: string
  name: string
  /** Пара слов о вкусе — для меню. */
  desc: string
  /** Прибавка к статам на 1-м уровне бара, в процентах. */
  pct: Partial<Record<Stat, number>>
  /** С какого уровня бара сорт есть в меню. */
  minLevel: number
  /** Цена кружки в Вкусняшках. */
  price: number
}

export const DRINKS: readonly DrinkDef[] = [
  {
    id: "pale_ale",
    icon: "🍺",
    get name() { return tr("Pale Ale", "Светлый эль") },
    get desc() { return tr("Light and honest. Puts some meat on your bones.", "Лёгкий и честный. Прибавляет жизни.") },
    pct: { hp: 8 },
    minLevel: 1,
    price: 20
  },
  {
    id: "stoker_porter",
    icon: "🍻",
    get name() { return tr("Stoker Porter", "Портер «Кочегар»") },
    get desc() { return tr("Dark, smoky, heavy-handed.", "Тёмный, дымный, бьёт наотмашь.") },
    pct: { str: 8 },
    minLevel: 1,
    price: 25
  },
  {
    id: "oak_stout",
    icon: "🛢️",
    get name() { return tr("Oak Stout", "Дубовый стаут") },
    get desc() { return tr("Thick as a barricade plank.", "Густой, как доска с баррикады.") },
    pct: { def: 8 },
    minLevel: 1,
    price: 25
  },
  {
    id: "apple_cider",
    icon: "🍏",
    get name() { return tr("Rotten-Orchard Cider", "Сидр «Гнилой сад»") },
    get desc() { return tr("Sour and fizzy — your paws itch to run.", "Кислый и шипучий — лапы сами бегут.") },
    pct: { spd: 8 },
    minLevel: 2,
    price: 25
  },
  {
    id: "witch_grog",
    icon: "🧪",
    get name() { return tr("Witch’s Grog", "Ведьмин грог") },
    get desc() { return tr("Glows faintly green. Sharpens the spells.", "Слегка светится зелёным. Заостряет чары.") },
    pct: { mag: 8 },
    minLevel: 2,
    price: 30
  },
  {
    id: "honey_mead",
    icon: "🍯",
    get name() { return tr("Honey Mead", "Медовуха") },
    get desc() { return tr("Warms the belly and the spirit.", "Греет и брюхо, и душу.") },
    pct: { hp: 5, res: 6 },
    minLevel: 3,
    price: 35
  },
  {
    id: "pepper_brew",
    icon: "🌶️",
    get name() { return tr("Pepper Brew", "Перцовое") },
    get desc() { return tr("Burns going down. Burns coming out too.", "Жжёт, пока пьёшь. И потом, в драке, тоже.") },
    pct: { str: 6, def: 5 },
    minLevel: 3,
    price: 40
  },
  {
    id: "wormwood_ale",
    icon: "🌿",
    get name() { return tr("Wormwood Ale", "Полынный эль") },
    get desc() { return tr("Bitter, clears the head. Quick to strike.", "Горький, проясняет голову. Рука быстрее.") },
    pct: { spd: 5, str: 5 },
    minLevel: 4,
    price: 40
  },
  {
    id: "berry_liqueur",
    icon: "🍒",
    get name() { return tr("Graveberry Liqueur", "Кладбищенская наливка") },
    get desc() { return tr("Berries from behind the fence. Better not ask.", "Ягоды из-за ограды. Лучше не спрашивать.") },
    pct: { mag: 6, res: 6 },
    minLevel: 4,
    price: 45
  },
  {
    id: "last_stand",
    icon: "🏰",
    get name() { return tr("Last Stand Barrel", "Бочковое «Последний рубеж»") },
    get desc() { return tr("The house special. A little of everything.", "Фирменное. Всего понемногу.") },
    pct: { hp: 4, str: 4, mag: 4, spd: 4, def: 4, res: 4 },
    minLevel: 5,
    price: 60
  }
]

export function drinkDef(id: string): DrinkDef | undefined {
  return DRINKS.find(d => d.id === id)
}
