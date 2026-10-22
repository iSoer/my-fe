import type { Species } from "@game/core/types"
import { tr } from "@game/i18n"

/**
 * Формы ушей миниатюры. Коты: pointy — острые, tufted — с кисточками, round — маленькие закруглённые,
 * folded — вислоухие, big — большие (ориенталы). Псы: floppy — висячие, erect — стоячие, semi — полустоячие
 * (кончик загнут), long — длинные висячие, button — маленькие «пуговки», big — огромные стоячие.
 * Мыши: round — круглые, big — большие, small — маленькие.
 */
export type EarShape = "pointy" | "tufted" | "round" | "folded" | "big" | "floppy" | "erect" | "semi" | "long" | "button" | "small"
/**
 * Формы хвоста. long — обычный, fluffy — пушистый, thin — тонкий, stub — обрубок, curl — кольцом,
 * sickle — серпом вверх, plume — пушистый опущенный, pom — с помпоном (пудель), tufted — с кисточкой,
 * bare — голый розовый (мышь), ringed — толстый кольчатый (крыса).
 */
export type TailShape = "long" | "fluffy" | "thin" | "stub" | "curl" | "sickle" | "plume" | "pom" | "tufted" | "bare" | "ringed"
/**
 * Отметины породы поверх окраса: point — тёмные «пойнты» (сиамский), mask — светлая маска хаски,
 * muzzle — тёмная морда (мопс, овчарка), tan — подпалины (ротвейлер), blaze — белая проточина,
 * calico — рыжие и чёрные пятна, eyepatch — пятно вокруг глаза.
 */
export type Marking = "none" | "point" | "mask" | "muzzle" | "tan" | "blaze" | "calico" | "eyepatch"

/** Внешность породы для генератора миниатюр: допустимые варианты, конкретный выбирается по seed бойца. */
export interface BreedLook {
  ears: readonly EarShape[]
  tails: readonly TailShape[]
  /** Длина морды (собаки): 0 короткая (мопс), 1 средняя, 2 длинная. */
  muzzle?: readonly (0 | 1 | 2)[]
  /** Пушистая порода: пух на щеках и грудке. */
  fluffy?: boolean
  marking?: Marking
}

export interface BreedDef {
  id: string
  species: Species
  readonly name: string
  /** Подсказка комплекции для внешности: 0 худой, 1 обычный, 2 крупный. */
  build: 0 | 1 | 2
  look: BreedLook
}

const breed = (id: string, species: Species, en: string, ru: string, build: 0 | 1 | 2, look: BreedLook): BreedDef => ({
  id,
  species,
  get name() { return tr(en, ru) },
  build,
  look
})

const l = (ears: EarShape[], tails: TailShape[], extra: Omit<BreedLook, "ears" | "tails"> = {}): BreedLook => ({ ears, tails, ...extra })

export const BREEDS: readonly BreedDef[] = [
  breed("cat_yard", "cat", "Alley cat", "Дворовый", 1, l(["pointy", "pointy", "big"], ["long", "long", "stub"])),
  breed("cat_siamese", "cat", "Siamese", "Сиамский", 0, l(["big"], ["thin"], { marking: "point" })),
  breed("cat_mainecoon", "cat", "Maine Coon", "Мейн-кун", 2, l(["tufted"], ["fluffy"], { fluffy: true })),
  breed("cat_sphynx", "cat", "Sphynx", "Сфинкс", 0, l(["big"], ["thin"])),
  breed("cat_british", "cat", "British", "Британец", 2, l(["round"], ["long"], { fluffy: true })),
  breed("cat_persian", "cat", "Persian", "Персидский", 2, l(["round"], ["fluffy"], { fluffy: true })),
  breed("cat_bengal", "cat", "Bengal", "Бенгальский", 1, l(["pointy"], ["long"])),
  breed("cat_ginger", "cat", "Ginger tabby", "Рыжий полосатый", 1, l(["pointy"], ["long", "fluffy"])),
  breed("cat_calico", "cat", "Calico", "Трёхцветный", 1, l(["pointy"], ["long", "stub"], { marking: "calico" })),
  breed("cat_black", "cat", "Black cat", "Чёрный", 1, l(["pointy", "big"], ["long", "thin"])),
  breed("cat_ragdoll", "cat", "Ragdoll", "Рэгдолл", 2, l(["pointy", "round"], ["fluffy"], { fluffy: true, marking: "point" })),
  breed("cat_scottish", "cat", "Scottish Fold", "Шотландский вислоухий", 1, l(["folded"], ["long"])),
  breed("cat_abyssinian", "cat", "Abyssinian", "Абиссинский", 0, l(["big"], ["long", "thin"])),
  breed("cat_norwegian", "cat", "Norwegian Forest", "Норвежский лесной", 2, l(["tufted"], ["fluffy"], { fluffy: true })),
  breed("cat_munchkin", "cat", "Munchkin", "Манчкин", 0, l(["pointy", "round"], ["long", "fluffy"])),
  breed("dog_mutt", "dog", "Mutt", "Дворняга", 1, l(["floppy", "semi", "erect"], ["sickle", "curl", "long"], { muzzle: [1, 2] })),
  breed("dog_dachshund", "dog", "Dachshund", "Такса", 0, l(["long"], ["thin"], { muzzle: [2] })),
  breed("dog_corgi", "dog", "Corgi", "Корги", 1, l(["erect"], ["stub", "plume"], { muzzle: [1], marking: "blaze" })),
  breed("dog_shepherd", "dog", "Shepherd", "Овчарка", 2, l(["erect"], ["plume"], { muzzle: [2], marking: "muzzle" })),
  breed("dog_husky", "dog", "Husky", "Хаски", 2, l(["erect"], ["curl", "plume"], { muzzle: [1], fluffy: true, marking: "mask" })),
  breed("dog_chihuahua", "dog", "Chihuahua", "Чихуахуа", 0, l(["big"], ["sickle", "thin"], { muzzle: [0] })),
  breed("dog_pug", "dog", "Pug", "Мопс", 1, l(["button"], ["curl"], { muzzle: [0], marking: "muzzle" })),
  breed("dog_bulldog", "dog", "Bulldog", "Бульдог", 2, l(["button"], ["stub"], { muzzle: [0] })),
  breed("dog_labrador", "dog", "Labrador", "Лабрадор", 2, l(["floppy"], ["long"], { muzzle: [1, 2] })),
  breed("dog_poodle", "dog", "Poodle", "Пудель", 1, l(["long"], ["pom"], { muzzle: [2], fluffy: true })),
  breed("dog_spitz", "dog", "Spitz", "Шпиц", 0, l(["erect"], ["curl"], { muzzle: [0], fluffy: true })),
  breed("dog_rottweiler", "dog", "Rottweiler", "Ротвейлер", 2, l(["floppy", "button"], ["stub"], { muzzle: [1], marking: "tan" })),
  breed("dog_jackrussell", "dog", "Jack Russell", "Джек-рассел", 0, l(["semi"], ["sickle", "stub"], { muzzle: [1], marking: "eyepatch" })),
  breed("dog_beagle", "dog", "Beagle", "Бигль", 1, l(["long"], ["sickle"], { muzzle: [1], marking: "blaze" })),
  breed("dog_doberman", "dog", "Doberman", "Доберман", 2, l(["erect"], ["stub"], { muzzle: [2], marking: "tan" })),
  breed("mouse_house", "mouse", "House mouse", "Домовая мышь", 0, l(["round", "big"], ["bare"])),
  breed("mouse_field", "mouse", "Field vole", "Полёвка", 1, l(["small"], ["stub"], { fluffy: true })),
  breed("mouse_wood", "mouse", "Wood mouse", "Лесная мышь", 0, l(["big"], ["bare"])),
  breed("mouse_lab", "mouse", "White lab mouse", "Белая лабораторная", 0, l(["big", "round"], ["bare"])),
  breed("mouse_rat", "mouse", "Rat", "Крыса", 2, l(["round", "small"], ["ringed"])),
  breed("mouse_hamster", "mouse", "Hamster", "Хомяк", 2, l(["small"], ["stub"], { fluffy: true })),
  breed("mouse_gerbil", "mouse", "Gerbil", "Песчанка", 1, l(["round"], ["tufted"])),
  breed("mouse_dormouse", "mouse", "Dormouse", "Соня", 1, l(["round"], ["fluffy"], { fluffy: true })),
  breed("mouse_jerboa", "mouse", "Jerboa", "Тушканчик", 0, l(["big"], ["tufted"])),
  breed("mouse_harvest", "mouse", "Harvest mouse", "Мышь-малютка", 0, l(["round", "small"], ["curl", "bare"]))
]

const MAP = new Map(BREEDS.map(b => [b.id, b]))
export function breedDef(id: string): BreedDef {
  const b = MAP.get(id)
  if (!b) throw new Error(`unknown breed ${id}`)
  return b
}
