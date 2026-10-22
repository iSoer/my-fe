import type { Species } from "@game/core/types"
import { tr } from "@game/i18n"

export interface FactionDef {
  id: string
  readonly name: string
  readonly desc: string
  /** Индексы палитр шерсти, характерных для фракции. */
  palettes: number[]
  /** Веса видов среди бойцов фракции. */
  species: Record<Species, number>
}

export const FACTIONS: readonly FactionDef[] = [
  {
    id: "yard_pack",
    get name() { return tr("Yard Pack", "Дворовая Стая") },
    get desc() { return tr("Stray cats and dogs who didn't like the look of your face.", "Бродячие коты и псы, которым не понравилась ваша морда.") },
    palettes: [0, 1, 2, 5],
    species: { cat: 45, dog: 45, mouse: 10 }
  },
  {
    id: "chimney_cats",
    get name() { return tr("Chimney Sweep Cats", "Коты-Трубочисты") },
    get desc() { return tr("Black from soot, mean from the altitude.", "Чёрные от сажи, злые от высоты.") },
    palettes: [7, 8, 11],
    species: { cat: 80, dog: 10, mouse: 10 }
  },
  {
    id: "red_dot_cult",
    get name() { return tr("Cult of the Red Dot", "Культ Красной Точки") },
    get desc() { return tr("They saw the dot. Now all they see is blood. Mice are their flock.", "Они видели точку. Теперь видят только кровь. Мыши — их паства.") },
    palettes: [3, 7, 9],
    species: { cat: 40, dog: 10, mouse: 50 }
  },
  {
    id: "scavengers",
    get name() { return tr("Scavengers", "Помоечники") },
    get desc() { return tr("They live at the dump and fight over every bone.", "Живут на свалке и дерутся за каждую кость.") },
    palettes: [1, 4, 6, 10],
    species: { cat: 25, dog: 35, mouse: 40 }
  },
  {
    id: "snow_strays",
    get name() { return tr("Snow Mutts", "Снежные Дворняги") },
    get desc() { return tr("Fluffy, hungry and very fast.", "Пушистые, голодные и очень быстрые.") },
    palettes: [8, 9, 11],
    species: { cat: 15, dog: 70, mouse: 15 }
  },
  {
    id: "swamp_cats",
    get name() { return tr("Swamp Cats", "Болотные Коты") },
    get desc() { return tr("They sit in the vines and wait. Then they don't.", "Сидят в лианах и ждут. Потом не ждут.") },
    palettes: [3, 5, 10, 11],
    species: { cat: 70, dog: 10, mouse: 20 }
  },
  {
    id: "sand_dogs",
    get name() { return tr("Sand Dogs", "Песчаные Псы") },
    get desc() { return tr("They'll rob the caravan, then scratch it for good measure.", "Караван ограбят, а потом ещё и поцарапают.") },
    palettes: [4, 6, 9, 0],
    species: { cat: 10, dog: 60, mouse: 30 }
  },
  {
    id: "polar_mice",
    get name() { return tr("Polar Mice", "Полярные Мыши") },
    get desc() { return tr("Small, white and incredibly cranky from the cold.", "Маленькие, белые и невероятно злые от холода.") },
    palettes: [2, 8, 1],
    species: { cat: 15, dog: 30, mouse: 55 }
  },
  {
    id: "canyon_coyotes",
    get name() { return tr("Canyon Coyotes", "Каньонные Койоты") },
    get desc() { return tr("They howl at the sunset and bite anything that doesn't howl.", "Воют на закат и кусают всё, что не воет.") },
    palettes: [4, 5, 0, 7],
    species: { cat: 20, dog: 70, mouse: 10 }
  },
  {
    id: "forest_lynxes",
    get name() { return tr("Forest Lynxes", "Лесные Рыси") },
    get desc() { return tr("They drop from the branches without a sound. The sound comes later.", "Падают с веток беззвучно. Звук бывает потом.") },
    palettes: [0, 4, 5],
    species: { cat: 60, dog: 20, mouse: 20 }
  },
  {
    id: "couch_troops",
    get name() { return tr("Couch Troops", "Диванные Войска") },
    get desc() { return tr("Pampered house pets defending their sofa to the last pillow.", "Домашние любимцы, которые защищают диван до последней подушки.") },
    palettes: [2, 3, 6, 8],
    species: { cat: 50, dog: 35, mouse: 15 }
  },
  {
    id: "assembly_dogs",
    get name() { return tr("Assembly Dogs", "Цеховые Псы") },
    get desc() { return tr("Grease on the fur, wrenches in the paws, overtime in the eyes.", "Мазут на шерсти, ключи в лапах, переработка в глазах.") },
    palettes: [1, 7, 10],
    species: { cat: 20, dog: 65, mouse: 15 }
  },
  {
    id: "the_horde",
    get name() { return tr("The Horde", "Орда") },
    get desc() { return tr("Where the infection began. Everything here bites, and nothing here stays dead.", "Здесь началась зараза. Здесь кусается всё, и ничто не остаётся мёртвым.") },
    palettes: [7, 9, 11],
    species: { cat: 34, dog: 33, mouse: 33 }
  }
]

const MAP = new Map(FACTIONS.map(f => [f.id, f]))
export function factionDef(id: string): FactionDef {
  const f = MAP.get(id)
  if (!f) throw new Error(`unknown faction ${id}`)
  return f
}
