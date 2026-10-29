import { tr } from "@game/i18n"
import { EYE_ART, FUR_ART } from "@game/art/palettes"

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

/** "#rrggbb" → 0xrrggbb. */
const num = (color: string): number => parseInt(color.slice(1), 16)
/** Основной цвет шерсти палитры `i` — тот же, что рисует арт (`FUR_ART[i].fur`): заглушки и эффекты не расходятся со спрайтом. */
const furColor = (i: number): number => num(FUR_ART[i]?.fur ?? "#cccccc")
const eyeColor = (i: number): number => num(EYE_ART[i] ?? "#cccccc")

/** Палитры шерсти (плейсхолдеры: основной цвет из `FUR_ART`), узоры, глаза, аксессуары. Индексы — как у `FUR_ART`. */
export const FUR_PALETTES: readonly { readonly name: string, color: number }[] = [
  palette("Ginger", "Рыжий", furColor(0)),
  palette("Gray", "Серый", furColor(1)),
  palette("White", "Белый", furColor(2)),
  palette("Black", "Чёрный", furColor(3)),
  palette("Beige", "Бежевый", furColor(4)),
  palette("Chocolate", "Шоколадный", furColor(5)),
  palette("Sandy", "Песочный", furColor(6)),
  palette("Smoky", "Дымчатый", furColor(7)),
  palette("Blue", "Голубой", furColor(8)),
  palette("Cream", "Кремовый", furColor(9)),
  palette("Tabby", "Табби", furColor(10)),
  palette("Charcoal", "Угольный", furColor(11))
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
  palette("Green", "Зелёные", eyeColor(0)),
  palette("Yellow", "Жёлтые", eyeColor(1)),
  palette("Blue", "Голубые", eyeColor(2)),
  palette("Brown", "Карие", eyeColor(3)),
  palette("Red", "Красные", eyeColor(4))
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
