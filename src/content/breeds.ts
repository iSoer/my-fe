import type { Species } from '@core/types';

export interface BreedDef {
  id: string;
  species: Species;
  name: string;
  /** Подсказка комплекции для внешности: 0 худой, 1 обычный, 2 крупный. */
  build: 0 | 1 | 2;
}

export const BREEDS: readonly BreedDef[] = [
  { id: 'cat_yard', species: 'cat', name: 'Дворовый', build: 1 },
  { id: 'cat_siamese', species: 'cat', name: 'Сиамский', build: 0 },
  { id: 'cat_mainecoon', species: 'cat', name: 'Мейн-кун', build: 2 },
  { id: 'cat_sphynx', species: 'cat', name: 'Сфинкс', build: 0 },
  { id: 'cat_british', species: 'cat', name: 'Британец', build: 2 },
  { id: 'cat_persian', species: 'cat', name: 'Персидский', build: 2 },
  { id: 'cat_bengal', species: 'cat', name: 'Бенгальский', build: 1 },
  { id: 'cat_ginger', species: 'cat', name: 'Рыжий полосатый', build: 1 },
  { id: 'cat_calico', species: 'cat', name: 'Трёхцветный', build: 1 },
  { id: 'cat_black', species: 'cat', name: 'Чёрный', build: 1 },
  { id: 'cat_ragdoll', species: 'cat', name: 'Рэгдолл', build: 2 },
  { id: 'cat_scottish', species: 'cat', name: 'Шотландский вислоухий', build: 1 },
  { id: 'cat_abyssinian', species: 'cat', name: 'Абиссинский', build: 0 },
  { id: 'cat_norwegian', species: 'cat', name: 'Норвежский лесной', build: 2 },
  { id: 'cat_munchkin', species: 'cat', name: 'Манчкин', build: 0 },
  { id: 'dog_mutt', species: 'dog', name: 'Дворняга', build: 1 },
  { id: 'dog_dachshund', species: 'dog', name: 'Такса', build: 0 },
  { id: 'dog_corgi', species: 'dog', name: 'Корги', build: 1 },
  { id: 'dog_shepherd', species: 'dog', name: 'Овчарка', build: 2 },
  { id: 'dog_husky', species: 'dog', name: 'Хаски', build: 2 },
  { id: 'dog_chihuahua', species: 'dog', name: 'Чихуахуа', build: 0 },
  { id: 'dog_pug', species: 'dog', name: 'Мопс', build: 1 },
  { id: 'dog_bulldog', species: 'dog', name: 'Бульдог', build: 2 },
  { id: 'dog_labrador', species: 'dog', name: 'Лабрадор', build: 2 },
  { id: 'dog_poodle', species: 'dog', name: 'Пудель', build: 1 },
  { id: 'dog_spitz', species: 'dog', name: 'Шпиц', build: 0 },
  { id: 'dog_rottweiler', species: 'dog', name: 'Ротвейлер', build: 2 },
  { id: 'dog_jackrussell', species: 'dog', name: 'Джек-рассел', build: 0 },
  { id: 'dog_beagle', species: 'dog', name: 'Бигль', build: 1 },
  { id: 'dog_doberman', species: 'dog', name: 'Доберман', build: 2 },
];

const MAP = new Map(BREEDS.map((b) => [b.id, b]));
export function breedDef(id: string): BreedDef {
  const b = MAP.get(id);
  if (!b) throw new Error(`unknown breed ${id}`);
  return b;
}
