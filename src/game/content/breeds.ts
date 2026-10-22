import type { Species } from "@game/core/types"
import { tr } from "@game/i18n"

export interface BreedDef {
  id: string
  species: Species
  readonly name: string
  /** Подсказка комплекции для внешности: 0 худой, 1 обычный, 2 крупный. */
  build: 0 | 1 | 2
}

const breed = (id: string, species: Species, en: string, ru: string, build: 0 | 1 | 2): BreedDef => ({
  id,
  species,
  get name() { return tr(en, ru) },
  build
})

export const BREEDS: readonly BreedDef[] = [
  breed("cat_yard", "cat", "Alley cat", "Дворовый", 1),
  breed("cat_siamese", "cat", "Siamese", "Сиамский", 0),
  breed("cat_mainecoon", "cat", "Maine Coon", "Мейн-кун", 2),
  breed("cat_sphynx", "cat", "Sphynx", "Сфинкс", 0),
  breed("cat_british", "cat", "British", "Британец", 2),
  breed("cat_persian", "cat", "Persian", "Персидский", 2),
  breed("cat_bengal", "cat", "Bengal", "Бенгальский", 1),
  breed("cat_ginger", "cat", "Ginger tabby", "Рыжий полосатый", 1),
  breed("cat_calico", "cat", "Calico", "Трёхцветный", 1),
  breed("cat_black", "cat", "Black cat", "Чёрный", 1),
  breed("cat_ragdoll", "cat", "Ragdoll", "Рэгдолл", 2),
  breed("cat_scottish", "cat", "Scottish Fold", "Шотландский вислоухий", 1),
  breed("cat_abyssinian", "cat", "Abyssinian", "Абиссинский", 0),
  breed("cat_norwegian", "cat", "Norwegian Forest", "Норвежский лесной", 2),
  breed("cat_munchkin", "cat", "Munchkin", "Манчкин", 0),
  breed("dog_mutt", "dog", "Mutt", "Дворняга", 1),
  breed("dog_dachshund", "dog", "Dachshund", "Такса", 0),
  breed("dog_corgi", "dog", "Corgi", "Корги", 1),
  breed("dog_shepherd", "dog", "Shepherd", "Овчарка", 2),
  breed("dog_husky", "dog", "Husky", "Хаски", 2),
  breed("dog_chihuahua", "dog", "Chihuahua", "Чихуахуа", 0),
  breed("dog_pug", "dog", "Pug", "Мопс", 1),
  breed("dog_bulldog", "dog", "Bulldog", "Бульдог", 2),
  breed("dog_labrador", "dog", "Labrador", "Лабрадор", 2),
  breed("dog_poodle", "dog", "Poodle", "Пудель", 1),
  breed("dog_spitz", "dog", "Spitz", "Шпиц", 0),
  breed("dog_rottweiler", "dog", "Rottweiler", "Ротвейлер", 2),
  breed("dog_jackrussell", "dog", "Jack Russell", "Джек-рассел", 0),
  breed("dog_beagle", "dog", "Beagle", "Бигль", 1),
  breed("dog_doberman", "dog", "Doberman", "Доберман", 2),
  breed("mouse_house", "mouse", "House mouse", "Домовая мышь", 0),
  breed("mouse_field", "mouse", "Field vole", "Полёвка", 1),
  breed("mouse_wood", "mouse", "Wood mouse", "Лесная мышь", 0),
  breed("mouse_lab", "mouse", "White lab mouse", "Белая лабораторная", 0),
  breed("mouse_rat", "mouse", "Rat", "Крыса", 2),
  breed("mouse_hamster", "mouse", "Hamster", "Хомяк", 2),
  breed("mouse_gerbil", "mouse", "Gerbil", "Песчанка", 1),
  breed("mouse_dormouse", "mouse", "Dormouse", "Соня", 1),
  breed("mouse_jerboa", "mouse", "Jerboa", "Тушканчик", 0),
  breed("mouse_harvest", "mouse", "Harvest mouse", "Мышь-малютка", 0)
]

const MAP = new Map(BREEDS.map(b => [b.id, b]))
export function breedDef(id: string): BreedDef {
  const b = MAP.get(id)
  if (!b) throw new Error(`unknown breed ${id}`)
  return b
}
