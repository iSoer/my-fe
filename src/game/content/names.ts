import type { Gender, Species } from "@game/core/types"
import { lang } from "@game/i18n"

export interface NameEntry {
  name: string
  gender: Gender
}

const m = (names: string): NameEntry[] => names.split(/,\s*/).map(name => ({ name, gender: "m" as const }))
const f = (names: string): NameEntry[] => names.split(/,\s*/).map(name => ({ name, gender: "f" as const }))

/**
 * Массив, элементы которого читаются на текущем языке в момент обращения.
 * Длины en/ru обязаны совпадать — индекс выбора по seed не зависит от языка.
 */
function langArray<T>(en: readonly T[], ru: readonly T[]): readonly T[] {
  if (en.length !== ru.length) throw new Error(`langArray: length mismatch ${en.length} != ${ru.length}`)
  const out: T[] = []
  for (let i = 0; i < en.length; i++) {
    Object.defineProperty(out, i, { get: () => (lang() === "ru" ? ru[i] : en[i]), enumerable: true })
  }
  return out
}

const NAMES_RU: Record<Species, NameEntry[]> = {
  cat: [
    ...m(
      "Барсик, Васька, Мурзик, Рыжик, Том, Кузя, Пушок, Семён, Маркиз, Феликс, Тимофей, Гарфилд, Бегемот, "
      + "Леопольд, Матроскин, Боня, Симба, Лаки, Оскар, Персик, Снежок, Умка, Яшка, Филя, Бакс, Зевс, Тигр, "
      + "Чижик, Мотя, Батон"
    ),
    ...f(
      "Мурка, Муся, Багира, Соня, Ася, Маруся, Нюша, Клёпа, Буся, Дуся, Люся, Марфа, Плюша, Бусинка, "
      + "Ириска, Кнопка, Матильда, Пуговка, Сима, Фрося, Шуня, Злата, Китти, Лапка, Мия, Нюра, Ряба, Тучка, "
      + "Фиса, Чуня"
    )
  ],
  dog: [
    ...m(
      "Шарик, Бобик, Тузик, Рекс, Джек, Барон, Полкан, Дружок, Арчи, Бим, Граф, Джим, Лорд, Макс, Мухтар, "
      + "Пират, Рич, Тайсон, Хан, Цезарь, Чак, Бублик, Зефир, Кекс, Пончик, Сникерс, Умник, Фунтик, Чаппи, "
      + "Атос"
    ),
    ...f(
      "Жужа, Жучка, Найда, Альма, Белка, Стрелка, Герда, Дина, Джесси, Лайма, Лада, Моська, Пальма, Рада, "
      + "Рокси, Сара, Таша, Тори, Чапа, Эльза, Веста, Грета, Кира, Лола, Мира, Пума, Руна, Сильва, Шельма, "
      + "Юта"
    )
  ],
  mouse: [
    ...m(
      "Пик, Шуршик, Пискун, Крош, Сырок, Грызлик, Хвостик, Шмыг, Тишка, Норик, Пончик-младший, Сухарик, "
      + "Джерри, Стюарт, Реми, Микки, Фунт, Писк, Усик, Зёрнышко, Шнырь, Кроха, Серый, Плюш, Орешек, "
      + "Шустрик, Прошка, Гаврош, Клык-младший, Цап"
    ),
    ...f(
      "Пискля, Шуша, Крошка, Мышель, Сырка, Норка, Тиша, Пипа, Шуня-мышь, Зерна, Мята, Фенька, Писклявка, "
      + "Минни, Соня-мышь, Люська, Муська-мышь, Хвостя, Пуша, Серка, Дуся-мышь, Нюша-мышь, Крупинка, Ушка, "
      + "Чуча, Шмыга, Бусинка-мышь, Пампушка, Ириска-мышь, Фифа"
    )
  ]
}

/** Английские клички: та же длина и тот же порядок полов (30 м + 30 ж), что у русских. */
const NAMES_EN: Record<Species, NameEntry[]> = {
  cat: [
    ...m(
      "Whiskers, Felix, Tom, Garfield, Simba, Oscar, Lucky, Zeus, Tiger, Oliver, Milo, Leo, Smokey, Jasper, "
      + "Toby, Gizmo, Puss, Hobbes, Behemoth, Marmalade, Pumpkin, Socks, Biscuit, Nacho, Waffles, Pickles, "
      + "Meatball, Snowball, Mr. Fluff, Bagel"
    ),
    ...f(
      "Kitty, Luna, Bella, Cleo, Nala, Lily, Daisy, Chloe, Sophie, Mittens, Button, Pearl, Toffee, Caramel, "
      + "Cupcake, Matilda, Pixie, Lulu, Coco, Misty, Willow, Hazel, Ginny, Poppy, Bagheera, Princess, Duchess, "
      + "Clementine, Cookie, Mochi"
    )
  ],
  dog: [
    ...m(
      "Rex, Buddy, Max, Jack, Rocky, Duke, Baron, Archie, Charlie, Cooper, Bear, Tucker, Bruno, Rusty, Spot, "
      + "Fido, Scooby, Snoopy, Pirate, Tyson, Caesar, Chuck, Donut, Nugget, Pretzel, Bacon, Noodle, Professor, "
      + "Kibble, Athos"
    ),
    ...f(
      "Lassie, Molly, Sadie, Rosie, Ruby, Roxy, Lola, Stella, Penny, Maggie, Gracie, Ellie, Zoe, Dixie, Laika, "
      + "Belka, Strelka, Greta, Elsa, Kira, Lady, Puma, Honey, Peanut, Jellybean, Biscotti, Pebbles, Trixie, "
      + "Rascal, Juno"
    )
  ],
  mouse: [
    ...m(
      "Pip, Squeaky, Rustle, Nibbles, Crumb, Cheddar, Gnawly, Twitch, Scurry, Hush, Burrow, Donut Jr., "
      + "Crouton, Jerry, Stuart, Remy, Mickey, Squeak, Whisker, Kernel, Sneak, Tiny, Gray, Plush, Acorn, "
      + "Zippy, Gus, Dodger, Fang Jr., Snap"
    ),
    ...f(
      "Squeakers, Shushu, Crumbs, Mousette, Brie, Nook, Hushie, Pippa, Lulu-mouse, Barley, Mint, Fennel, "
      + "Squeakerella, Minnie, Mittens-mouse, Sleepy, Daisy-mouse, Tailey, Fluff, Dusty, Button-mouse, Clover, "
      + "Sprinkle, Velvet, Bonbon, Scamper, Toffee-mouse, Dumpling, Cookie-mouse, Fifi"
    )
  ]
}

/** Клички по виду — на языке, активном в момент генерации бойца (имя затем сохраняется в сейв). */
export const NAMES: Record<Species, NameEntry[]> = {
  get cat() { return lang() === "ru" ? NAMES_RU.cat : NAMES_EN.cat },
  get dog() { return lang() === "ru" ? NAMES_RU.dog : NAMES_EN.dog },
  get mouse() { return lang() === "ru" ? NAMES_RU.mouse : NAMES_EN.mouse }
}

/** Эпитеты: [мужская форма, женская форма]. */
const EPITHETS_RU: readonly [string, string][] = [
  ["Кровавый Коготь", "Кровавая Лапка"],
  ["Костолом", "Костоломка"],
  ["Тихая Смерть", "Тихая Смерть"],
  ["Пухлый", "Пухлая"],
  ["Беспощадный", "Беспощадная"],
  ["Гроза Помойки", "Гроза Помойки"],
  ["Трёхлапый", "Трёхлапая"],
  ["Одноглазый", "Одноглазая"],
  ["Злой", "Злая"],
  ["Великолепный", "Великолепная"],
  ["Ужас Подвала", "Ужас Подвала"],
  ["Голодный", "Голодная"],
  ["Лысый", "Лысая"],
  ["Мокрый", "Мокрая"],
  ["Рваное Ухо", "Рваное Ухо"],
  ["Бешеный", "Бешеная"],
  ["Кусь", "Кусь"],
  ["Когтеточка", "Когтеточка"],
  ["Сын Помойки", "Дочь Помойки"],
  ["Железная Челюсть", "Железная Челюсть"],
  ["Хвостокрут", "Хвостокрутка"],
  ["Любимец Бабушек", "Любимица Бабушек"],
  ["Ночной Кошмар", "Ночной Кошмар"],
  ["Сытый", "Сытая"],
  ["Непобедимый", "Непобедимая"],
  ["Полосатый", "Полосатая"],
  ["Пятнистый", "Пятнистая"],
  ["Рыжая Смерть", "Рыжая Смерть"],
  ["Почтальонов Ужас", "Почтальонов Ужас"],
  ["Съевший Тапок", "Съевшая Тапок"],
  ["Громкий", "Громкая"],
  ["Шерстяной Ураган", "Шерстяной Ураган"],
  ["Царапка", "Царапка"],
  ["Хруст", "Хруст"],
  ["Погрызенный", "Погрызенная"],
  ["Из Коробки", "Из Коробки"],
  ["Девятижильный", "Девятижильная"],
  ["Чёрный", "Чёрная"],
  ["Белый", "Белая"],
  ["Старший", "Старшая"]
]

/** Английские эпитеты идут после имени без запятой («Whiskers the Bloody Claw»), порядок — как у русских. */
const EPITHETS_EN: readonly [string, string][] = [
  ["the Bloody Claw", "the Bloody Paw"],
  ["Bonecrusher", "Bonecrusher"],
  ["the Silent Death", "the Silent Death"],
  ["the Chubby", "the Chubby"],
  ["the Merciless", "the Merciless"],
  ["the Dump Terror", "the Dump Terror"],
  ["Three-Legs", "Three-Legs"],
  ["One-Eye", "One-Eye"],
  ["the Grumpy", "the Grumpy"],
  ["the Magnificent", "the Magnificent"],
  ["the Basement Horror", "the Basement Horror"],
  ["the Hungry", "the Hungry"],
  ["the Bald", "the Bald"],
  ["the Soggy", "the Soggy"],
  ["Torn-Ear", "Torn-Ear"],
  ["the Rabid", "the Rabid"],
  ["Chomp", "Chomp"],
  ["Scratchpost", "Scratchpost"],
  ["Son of the Dump", "Daughter of the Dump"],
  ["Ironjaw", "Ironjaw"],
  ["the Tailspinner", "the Tailspinner"],
  ["the Grannies' Pet", "the Grannies' Pet"],
  ["the Nightmare", "the Nightmare"],
  ["the Well-Fed", "the Well-Fed"],
  ["the Invincible", "the Invincible"],
  ["the Striped", "the Striped"],
  ["the Spotted", "the Spotted"],
  ["the Ginger Death", "the Ginger Death"],
  ["the Mailman's Bane", "the Mailman's Bane"],
  ["the Slipper-Eater", "the Slipper-Eater"],
  ["the Loud", "the Loud"],
  ["the Fur Hurricane", "the Fur Hurricane"],
  ["Scratchy", "Scratchy"],
  ["Crunch", "Crunch"],
  ["the Chewed", "the Chewed"],
  ["from the Box", "from the Box"],
  ["of Nine Lives", "of Nine Lives"],
  ["the Black", "the Black"],
  ["the White", "the White"],
  ["the Elder", "the Elder"]
]

/** Эпитеты: [мужская форма, женская форма] — элемент читается на языке, активном в момент генерации. */
export const EPITHETS: readonly (readonly [string, string])[] = langArray(EPITHETS_EN, EPITHETS_RU)

/** Титулы боссов: [м, ж]. */
const BOSS_TITLES_RU: readonly [string, string][] = [
  ["Барон", "Баронесса"],
  ["Палач", "Палачиха"],
  ["Матёрый", "Матушка"],
  ["Вожак", "Вожачка"],
  ["Король Помойки", "Королева Помойки"],
  ["Пахан", "Мамка"],
  ["Старейшина", "Старейшина"],
  ["Кровавый Пастырь", "Кровавая Пастырша"]
]

const BOSS_TITLES_EN: readonly [string, string][] = [
  ["the Baron", "the Baroness"],
  ["the Executioner", "the Executioner"],
  ["the Grizzled", "the Matriarch"],
  ["the Leader", "the Leader"],
  ["the Dump King", "the Dump Queen"],
  ["the Godfather", "the Godmother"],
  ["the Elder", "the Elder"],
  ["the Bloody Shepherd", "the Bloody Shepherdess"]
]

/** Титулы боссов: [м, ж] — на языке, активном в момент генерации. */
export const BOSS_TITLES: readonly (readonly [string, string])[] = langArray(BOSS_TITLES_EN, BOSS_TITLES_RU)
