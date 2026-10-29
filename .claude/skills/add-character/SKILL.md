---
name: add-character
description: Рецепты добавления новых персонажей — класса бойца, породы (кот/пёс/мышь), вражеской фракции, NPC поселения, имён/эпитетов/эпитафий/характеров, нового вида или варианта героя-котика. Использовать, когда просят добавить персонажа, класс, породу, врагов, NPC, жителя деревни или новый вид зверя.
---

# Добавление персонажей

Все бойцы процедурные. Готовых именных героев нет: юнит собирается в `generateUnit` (`src/game/core/units/index.ts`) из вида, породы, класса, внешности, имени и seed. Поэтому «новый персонаж» — это новый элемент одной из таблиц ниже. Сначала уточни у пользователя, какой именно, если из запроса неясно. Подробности: `docs/units.md`, `docs/classes.md`, `docs/art-characters.md`, `docs/progression.md`.

## 0. Перед началом

- `src/game`, `src/shared` и `src/model` синхронизируются из `../next-instapok`, а `pnpm sync:game` **удаляет** лишнее. Сейчас my-fe опережает next-instapok (там `SAVE_VERSION` 6, здесь 11), поэтому правим здесь. Если пользователь не просил иного, синхронизацию не запускай никогда.
- Стиль в синхронизируемых папках: двойные кавычки, без `;`, без Prettier. Тексты — через `tr(en, ru)`, имена и описания в таблицах — геттерами.

## A. Новый класс

1. В `src/shared/character/classes.ts` добавь запись в нужный `tier(...)` массива `CHARACTER_CLASSES` в формате `[id, "English Name", { требования: ранг }, { таланты: ранг }?]`.
   - Если классу нужно больше `MAX_TALENTS` (3) талантов, он не генерируется и доступен только через смену класса.
   - Летающему классу обязательно добавь запись в `FLIER_MOUNTS` (экспортирована из `src/shared/character/classes.ts`). Тест в `content.test.ts` проверяет, что у каждого летуна она есть и лишних нет.
   - `classId` должен существовать: модель отвергает неизвестный класс (`validateCharacterRequest` → `unknown class`), `generateUnit` бросает ошибку.
   - Название класса пишется только по-английски, так принято в проекте.
2. В `src/game/content/classStats.ts` добавь модификаторы `CLASS_STAT_MODS[id]`.
3. В `src/game/art/outfits.ts` добавь `CLASS_OUTFITS[id]` с узнаваемым силуэтом. Новый `HatKind` нужно нарисовать в `outfitHead` и добавить в `hatLift`.
4. Особое поведение (как у танцора: `DANCER_CLASS`, `withClassAssist`, `allowedSkillIds`, `classRole`) подключается вручную.
5. Сейв: `classIdSchema = z.enum(CLASS_IDS)`, поэтому добавление класса совместимо со старыми сейвами. **Переименование или удаление** ломает сейвы: нужен подъём `SAVE_VERSION` и миграция, которая обходит все юниты сейва (образец — v6→v7 в `src/game/core/save/index.ts`).
6. Тесты: `tests/game/content.test.ts`, `art.test.ts` (ключи outfit должны совпадать с `CLASS_IDS`), `units.test.ts`, `proficiency.test.ts`.
7. Не передавай в `generateUnit` несуществующий `classId`: валидатор (`validateCharacterRequest`) молча его игнорирует, и класс выпадет случайным. Так уже сломано демо в `MenuScreen.tsx`.

## B. Новая порода

1. В `src/game/content/breeds.ts` добавь в `BREEDS`:
   ```ts
   breed("cat_bengal", "cat", "Bengal", "Бенгальская", 1, l(["pointy"], ["long"], { marking: "calico" })),
   ```
   Аргументы: id `<вид>_<порода>`, вид, en, ru, телосложение `0|1|2`, внешность `l(ears, tails, {muzzle?, fluffy?, marking?})`.
2. Бери только те формы ушей (`EarShape`) и хвостов (`TailShape`), которые этот вид умеет рисовать: таблицы `DRAWABLE_EARS`/`DRAWABLE_TAILS` в `src/game/art/look.ts` (их сверяет тест в `art.test.ts`). Новая форма требует отрисовки в `catEar`/`dogEar`/`mouseEar` или функции хвоста в `src/game/art/critter.ts` и записи в таблицу.
3. Сейв: `breedId` — это `z.string()`, подъём версии не нужен. **Удалять породу нельзя**: `breedDef` бросает исключение в `UnitScreen` и `UnitDetails` для старых бойцов.
4. Тесты: `content.test.ts` (уникальность id), `art.test.ts` («облик бойца»).

## C. Новая вражеская фракция

1. В `src/game/content/factions.ts` добавь в `FACTIONS`: `id`, `get name()` и `get desc()` через `tr`, `palettes` (индексы `FUR_PALETTES`, 0–11; диапазон проверяет тест) и `species: { cat, dog, mouse }`. Веса указываются для всех трёх видов.
2. Привяжи фракцию к биому: `factionId` в `src/game/content/biomes.ts`. См. также `add-small-map` и `add-big-map`.
3. Сейв: id хранится строкой, подъём версии не нужен. **Удалять фракцию нельзя**: `factionDef` бросает исключение на сохранённых картах.

## D. NPC поселения

1. В `NPCS` в `src/game/content/settlement.ts` укажи `place` (id участка или `"gate"`), `fur`, `eyes` и аксессуар.
2. Добавь хотя бы одну фоновую сцену с этим `npc` в `SCENES` в `src/game/content/dialogues.ts`. Это проверяет `dialogue.test.ts`. Подробнее в `docs/dialogues.md`.
3. Текстуры и портрет генерируются сами. Если NPC нужен костюм класса или облик породы, правь и `SettlementScene.ts`, и `ui/settlement/DialogueBox.tsx`: код арта NPC там продублирован.
4. Тесты: `settlementMap.test.ts` (проходимость, размещение). На сейв не влияет.

## E. Имена, эпитеты, эпитафии, характеры

Всё лежит в `src/game/content/names.ts`, `epitaphs.ts` и `personalities.ts`. На сейв не влияет, кроме характеров.

- Имена: `NAMES_RU` и `NAMES_EN` заполняются **под одним индексом** с одинаковым полом (`m()` / `f()`) — это проверяет тест в `content.test.ts` (длины, пол по индексу, не меньше 60 мышиных).
- Эпитеты и титулы боссов — пары `[м, ж]`. Длины массивов в обоих языках должны совпадать, иначе `langArray` бросит исключение при загрузке.
- `EPITAPHS`: `(c) => tr(...)`.
- `PERSONALITIES` добавляй **только в конец**: id `p<n>` хранится в сейвах.

## F. Новый вид (кроме кота, пса и мыши)

Это крупная задача, сначала согласуй её с пользователем.

1. Расширь `Species` и `species: z.enum([...])` в `unitSchema`, подними `SAVE_VERSION`, добавь сквозную миграцию.
2. Заполни:
   - `DEFAULT_SPECIES_WEIGHTS` (`src/game/core/units/index.ts`);
   - `species` во всех фракциях;
   - `NAMES_*` и геттеры `NAMES`;
   - `SPECIES_LABEL` (`src/game/ui/lib/format.ts`) и `SPECIES_ORDER`.
3. Добавь минимум одну породу, иначе `rng.pick` упадёт на пустом списке.
4. Арт:
   - `ArtSpecies`;
   - геометрия вида в `critter.ts` и `outfits.ts`;
   - `DEFAULT_LOOK`;
   - emoji-фолбэк в `scene/UnitView.ts`.

## G. Вариант героя-котика (поселение)

1. Добавь поле в `HeroArt` и обработай его в `heroSvg` и `heroArtKey` (`src/game/art/hero.ts`).
2. Подгрузи кадры в `SettlementScene`.
3. Покрой вариант тестом в `tests/game/hero.test.ts`.

## Проверка

```bash
pnpm vitest run tests/game/content.test.ts tests/game/art.test.ts tests/game/units.test.ts
pnpm typecheck && pnpm lint && pnpm test
```

Визуально:

- запусти `pnpm dev`;
- открой армию (`#/army`) или магазин казарм и посмотри бойцов;
- сгенерировать бойца нужного класса можно через `generateUnit({ seed, level, species, classId })` и `__pf.save` (см. `docs/ui-and-routing.md`).

Галерея: `pnpm dev` → `http://localhost:5173/tools/gallery/index.html`. В ней все классы (секция «классы»), оружие, типы движения, окрасы и герой. Она входит в `pnpm typecheck`; если менял API арта — поправь `tools/gallery/main.ts`.

## Документация

Обнови таблицы в `docs/classes.md`, `docs/units.md` и `docs/art-characters.md`, см. скил `update-docs`.
