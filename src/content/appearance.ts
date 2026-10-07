/** Палитры шерсти (плейсхолдеры: основной цвет), узоры, глаза, аксессуары. */
export const FUR_PALETTES: readonly { name: string; color: number }[] = [
  { name: 'Рыжий', color: 0xf0932b },
  { name: 'Серый', color: 0x95a5a6 },
  { name: 'Белый', color: 0xf5f6fa },
  { name: 'Чёрный', color: 0x2d3436 },
  { name: 'Бежевый', color: 0xe1b382 },
  { name: 'Шоколадный', color: 0x6d4c41 },
  { name: 'Песочный', color: 0xf7d794 },
  { name: 'Дымчатый', color: 0x636e72 },
  { name: 'Голубой', color: 0xa4b0be },
  { name: 'Кремовый', color: 0xffeaa7 },
  { name: 'Табби', color: 0xcc8e35 },
  { name: 'Угольный', color: 0x1e272e },
];
export const PATTERNS = ['Однотонный', 'Полосатый', 'Пятнистый', 'Смокинг'] as const;
export const EYES = ['Круглые', 'Миндалевидные', 'Сонные', 'Злые', 'Огромные', 'Косые'] as const;
export const EYE_COLORS: readonly { name: string; color: number }[] = [
  { name: 'Зелёные', color: 0x2ecc71 },
  { name: 'Жёлтые', color: 0xf1c40f },
  { name: 'Голубые', color: 0x3498db },
  { name: 'Карие', color: 0x8e5a2a },
  { name: 'Красные', color: 0xe74c3c },
];
export const ACCESSORIES = ['Без аксессуара', 'Красный ошейник', 'Синий ошейник', 'Бандана', 'Повязка на глаз', 'Шрам', 'Бантик', 'Колокольчик'] as const;
