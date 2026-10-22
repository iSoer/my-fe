import { tr } from "@game/i18n"

/**
 * Список подписей, элементы которого переводятся в момент чтения (`PATTERNS[i]`).
 * Длина и индексы не зависят от языка — в сейве хранятся индексы.
 */
function labels(pairs: readonly (readonly [string, string])[]): readonly string[] {
  const out: string[] = []
  pairs.forEach(([en, ru], i) => {
    Object.defineProperty(out, i, { get: () => tr(en, ru), enumerable: true })
  })
  return out
}

const palette = (en: string, ru: string, color: number): { readonly name: string, color: number } => ({
  get name() { return tr(en, ru) },
  color
})

/** Палитры шерсти (плейсхолдеры: основной цвет), узоры, глаза, аксессуары. */
export const FUR_PALETTES: readonly { readonly name: string, color: number }[] = [
  palette("Ginger", "Рыжий", 0xf0932b),
  palette("Gray", "Серый", 0x95a5a6),
  palette("White", "Белый", 0xf5f6fa),
  palette("Black", "Чёрный", 0x2d3436),
  palette("Beige", "Бежевый", 0xe1b382),
  palette("Chocolate", "Шоколадный", 0x6d4c41),
  palette("Sandy", "Песочный", 0xf7d794),
  palette("Smoky", "Дымчатый", 0x636e72),
  palette("Blue", "Голубой", 0xa4b0be),
  palette("Cream", "Кремовый", 0xffeaa7),
  palette("Tabby", "Табби", 0xcc8e35),
  palette("Charcoal", "Угольный", 0x1e272e)
]
export const PATTERNS = labels([
  ["Solid", "Однотонный"],
  ["Striped", "Полосатый"],
  ["Spotted", "Пятнистый"],
  ["Tuxedo", "Смокинг"]
])
export const EYES = labels([
  ["Round", "Круглые"],
  ["Almond", "Миндалевидные"],
  ["Sleepy", "Сонные"],
  ["Angry", "Злые"],
  ["Huge", "Огромные"],
  ["Cross-eyed", "Косые"]
])
export const EYE_COLORS: readonly { readonly name: string, color: number }[] = [
  palette("Green", "Зелёные", 0x2ecc71),
  palette("Yellow", "Жёлтые", 0xf1c40f),
  palette("Blue", "Голубые", 0x3498db),
  palette("Brown", "Карие", 0x8e5a2a),
  palette("Red", "Красные", 0xe74c3c)
]
export const ACCESSORIES = labels([
  ["No accessory", "Без аксессуара"],
  ["Red collar", "Красный ошейник"],
  ["Blue collar", "Синий ошейник"],
  ["Bandana", "Бандана"],
  ["Eye patch", "Повязка на глаз"],
  ["Scar", "Шрам"],
  ["Bow", "Бантик"],
  ["Bell", "Колокольчик"]
])
