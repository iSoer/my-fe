# Бойцы

Боец (`UnitInstance`) — это персонаж модели (звезда, склонности, статы 1-го и 80-го уровня, класс FW) плюс звериное оформление: вид, порода, кличка, характер и внешность. Всё генерируется детерминированно по `seed` в [core/units](../src/game/core/units/index.ts). Смерть необратима (permadeath): павший уходит на Кладбище с эпитафией, вернуть его можно только воскрешением раз в игровой день. Боец 80-го уровня может переродиться: он возвращается на 1-й уровень и получает +1★.

Классы описаны в [classes.md](classes.md), опыт и рост — в [progression.md](progression.md), рисунок бойца — в [art-characters.md](art-characters.md).

## Тип `UnitInstance`

Он объявлен в [core/types.ts](../src/game/core/types.ts) (`interface UnitInstance`), а в сейве его проверяет `unitSchema` из [core/save/index.ts](../src/game/core/save/index.ts).

| Поле                                | Что это                                                                                                                                         | Откуда                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `id`                                | `makeId("u" \| "e", seed)`                                                                                                                      | `generateUnit`                                                         |
| `seed`                              | зерно бойца: от него зависят рост по уровням, облик, пул навыков при перерождении                                                               | вызывающий код                                                         |
| `name`, `epithet?`, `gender`        | кличка, прозвище и пол                                                                                                                          | [content/names.ts](../src/game/content/names.ts)                       |
| `species`                           | `"cat" \| "dog" \| "mouse"` (`Species`)                                                                                                         | веса вида или фракции                                                  |
| `breedId`                           | id из `BREEDS`                                                                                                                                  | [content/breeds.ts](../src/game/content/breeds.ts)                     |
| `personalityId`                     | `p1`…`p30`                                                                                                                                      | [content/personalities.ts](../src/game/content/personalities.ts)       |
| `classId`                           | id класса FW (`CHARACTER_CLASSES`)                                                                                                              | модель или опция `classId`                                             |
| `weaponSkill`                       | оружейный навык, которым боец сейчас сражается; его задаёт оружие в лапах                                                                       | `bestWeapon` / `equipWeapon`                                           |
| `rarity`                            | 1…5★                                                                                                                                            | `recruitRarityWeights` или опция                                       |
| `level`, `xp`, `sp`                 | уровень 1…80 (`MAX_LEVEL`), опыт внутри уровня, очки навыков                                                                                    | —                                                                      |
| `aptitudes`                         | склонность к каждому из 10 навыков: `weak` / `normal` / `talent`                                                                                | модель персонажа                                                       |
| `skillXp`                           | опыт владения каждым навыком: из него выводится ранг E…S                                                                                        | `presetSkillXp`, бой                                                   |
| `baseStats`, `maxStats`             | собственные статы модели на 1-м и 80-м уровне (шкала модели, без класса)                                                                        | модель или пресет класса                                               |
| `archetype`                         | `physical`/`special`/`tank`/`fast`/`hpWall`/`balanced`                                                                                          | модель                                                                 |
| `weaponTier`                        | заточка 0…3                                                                                                                                     | `sharpenWeapon` ([progression](../src/game/core/progression/index.ts)) |
| `accessory?`                        | талисман                                                                                                                                        | инвентарь                                                              |
| `skills`, `learned`, `learnable`    | экипированные навыки по слотам, изученные навыки и пул изучаемых                                                                                | `generateUnit`                                                         |
| `appearance`                        | `build`, `furPalette`, `pattern`, `eyes`, `eyeColor`, `accessory`: индексы таблиц из [content/appearance.ts](../src/game/content/appearance.ts) | `pickAppearance`                                                       |
| `history`                           | боёв, убийств, нанесённого и полученного урона, «был на волоске» (`closestCall`)                                                                | итоги боя                                                              |
| `isEnemy?`, `isBoss?`, `factionId?` | признаки врага                                                                                                                                  | генератор карты                                                        |

## Статы

Хранятся статы модели (`StatValues`: `hp`, `attack`, `defense`, `specialAttack`, `specialDefense`, `speed`, шкала примерно 25–180 на 80-м уровне). Боевые статы (`Stats`: `hp`, `str`, `mag`, `spd`, `def`, `res`) из них вычисляются, в сейв они не пишутся.

- `combatStats(model)` переводит статы модели по `MODEL_SCALE` из [balance.ts](../src/game/content/balance.ts): `HP = round(hp × 0.33) + 5`, остальные статы `= round((стат − 15) × 0.22)`, каждый не меньше 1. Пример: медиана 1-го уровня (≈45) даёт HP 19 и стат 7.
- `statsAtLevel(unit, level)` берёт строку из таблицы статов на уровнях 1…80 (`statTable`, кэш в `WeakMap`). Устройство таблицы описано в [progression.md](progression.md).
- `visibleStats(unit)` складывает статы уровня, Mt оружия (`weaponMt`), постоянные бонусы навыков и талисмана (`permanentBonus`), а вожаку добавляет `COMBAT.bossBonus` = +3 ко всем статам.
- `weaponMt` складывается так: Mt оружия + `weaponTier × 2` + `rankMt` = `floor(индекс ранга / 3)` (от E до S это +0…+3) − `2 ×` число недостающих ступеней ранга.

## Генерация бойца: `generateUnit(opts)`

Код: [core/units/index.ts](../src/game/core/units/index.ts). Все случайные решения идут через `createRng(seed)` из [core/rng](../src/game/core/rng/index.ts). Для каждой части свой форк: `species`, `name`, `character`, `rarity`, `weapon`, `skills`, `look`, поэтому изменение одной части не сдвигает остальные.

1. **Вид.** Берётся `opts.species`. Если его нет, вид выбирается по весам `opts.speciesWeights ?? DEFAULT_SPECIES_WEIGHTS` (`cat: 45, dog: 45, mouse: 10`). Затем тем же форком выбирается порода — равновероятно среди `BREEDS` этого вида.
2. **Имя.** Запись выбирается из `NAMES[species]`, вместе с ней приходит пол. Вожак получает титул из `BOSS_TITLES`. Остальные с вероятностью 0.6 получают прозвище из `EPITHETS` (пары вида `[м, ж]`).
3. **Звезда.** Берётся `opts.rarity`. Если её нет, звезда выбирается по `opts.rarityWeights ?? recruitRarityWeights(1)`.
4. **Персонаж модели.** `generateCharacter(loadCharacterModel(), { rarity, level, class? }, seed')` из [src/model/character-model/generate.ts](../src/model/character-model/generate.ts) выдаёт склонности, статы, архетип и класс. Если класс не задан, модель выбирает открытый класс с весом `(ярус + 1)²`.
5. **Владение навыками.** `presetSkillXp(classId, aptitudes, level)` даёт такой опыт, будто боец всю жизнь воевал в этом классе (подробности — в [progression.md](progression.md)).
6. **Оружие.** `bestWeapon` берёт `opts.weaponSkill`, если класс так сражается, а иначе выбирает лучшее по рангу оружие класса. Оружие в лапах — `gradeWeaponId(skill, opts.weaponGrade ?? "wood")`.
7. **Статы.** С `preset: true` (так генерируются все бойцы игрока) статы берутся из `classPresetStats(classId, rarity, seed)`: это «идеальный» профиль класса с личным разбросом ±8 %. Враги получают статы модели.
8. **Навыки.** Healer и прочие бойцы с White Magic получают `as_heal`, Dancer — `as_dance`. Каждый получает случайный Special из разрешённых. Звезды ★3–4 дают ещё 1 навык, ★5 — 2 (Поддержка с шансом 0.4, иначе пассивка в свободный слот). Пул `learnable` — `RARITY_SKILL_POOL[rarity]` (`1:3, 2:3, 3:4, 4:4, 5:5`) случайных навыков из `allowedSkillIds(cls, species)`.
9. **Внешность.** `pickAppearance`: если у фракции есть свои палитры (`factionDef(id).palettes`), шерсть берётся из них, остальные индексы случайны. Тем же форком `look` выбирается характер.

Модель персонажа сама генерирует ещё имя, рост, вес, `baseExperience` и `explain`, но `generateUnit` эти поля отбрасывает.

### Кто вызывает генерацию

| Где              | Функция                                                                | Особенности                                                                                                                                                                                                                                                                                                                                                            |
| ---------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Стартовый ростер | `generateRoster` ([units](../src/game/core/units/index.ts))            | `ROSTER.size` = 6 бойцов (7 со Славой ≥ 25), уровень 5 (10 со Славой ≥ 75), только стартовые классы (`STARTER_CLASSES`), сначала по одному каждого. До 200 попыток найти состав, где есть лекарь, ≥2 ближника, дальник, все три цвета треугольника, кот и пёс. Если не вышло, состав берётся из `FALLBACK_ROSTER`. Со Славой ≥ 300 гарантирован боец высшей открытой ★ |
| Витрина Казарм   | `generateShop` ([progression](../src/game/core/progression/index.ts))  | `SHOP.size` = 4 кандидата (5 со Славой ≥ 150), обновляется после каждого боя. Уровень — `recruitLevel(army, rarity) + rng.int(-2, 1)`, класс — `loadoutsAt(level)` (без божественных)                                                                                                                                                                                  |
| Награда за бой   | `generateRewardChoice`                                                 | 3 кандидата (`REWARDS.rewardChoices`). После победы вес высшей открытой ★ удваивается                                                                                                                                                                                                                                                                                  |
| Пополнение       | `reinforcements`                                                       | если бойцов в армии меньше `SQUAD_SIZE` = 4, недостающие приходят бесплатно под нехватку ролей (`neededWeapons`)                                                                                                                                                                                                                                                       |
| Враги            | `makeEnemy` ([core/map/generate.ts](../src/game/core/map/generate.ts)) | вид — по `faction.species`, `isEnemy`, `factionId`, грейд оружия по уровню. Вожак получает +1★, статы модели умножаются на `enemyStatMult` сложности                                                                                                                                                                                                                   |

Цена кандидата в Казармах — `unitPrice` = `(40 + 8 × уровень) × SHOP.rarityMult[★]`, множители `0.8 / 1.1 / 1.6 / 2.4 / 3.6`.

## Вид, породы, фракции

- **Виды** (`Species`): кот, пёс и мышь. От вида зависят клички, набор пород, видовой Special (`onlySpecies` в [skills/specials.ts](../src/game/content/skills/specials.ts)), геометрия рисунка и эмодзи-заглушка в [UnitView](../src/game/scene/UnitView.ts).
- **Породы** (`BREEDS`, 40 штук: 15 котов, 15 псов, 10 мышей) лежат в [content/breeds.ts](../src/game/content/breeds.ts). Каждая запись — `breed(id, species, en, ru, build, look)`: `build` 0/1/2 становится подсказкой `appearance.build`, а `look` (`BreedLook`) задаёт допустимые формы ушей и хвоста, длину морды, пух и отметину. На механику боя порода не влияет, она отвечает только за облик и подпись.
- **Фракции** (`FACTIONS`, 13 штук) лежат в [content/factions.ts](../src/game/content/factions.ts) и задают врагов биома: `palettes` (индексы `FUR_PALETTES`) и `species` (веса видов). К фракции биом ведёт полем `factionId` в [content/biomes.ts](../src/game/content/biomes.ts), а `makeEnemy` берёт из фракции вид и палитру. Все враги рисуются зомби (`art.zombie`).

## Имена, прозвища, характеры

[content/names.ts](../src/game/content/names.ts):

- `NAMES_RU` и `NAMES_EN` содержат по 60 кличек на вид (30 мужских и 30 женских, в одинаковом порядке). Наружу они видны как `NAMES[species]` — это геттер на текущем языке. Имя выбирается по индексу и сохраняется в сейв на языке, который был активен в момент генерации.
- `EPITHETS` (40 пар `[м, ж]`) и `BOSS_TITLES` (8 пар) собираются через `langArray(en, ru)`. Если длины списков не совпадают, `langArray` бросает ошибку уже при загрузке модуля.
- Характеры — 30 строк `PERSONALITIES` в [content/personalities.ts](../src/game/content/personalities.ts) с id `p1…p30`. `personalityText` для неизвестного id возвращает `""`.

## Внешность (`appearance`)

[content/appearance.ts](../src/game/content/appearance.ts) содержит подписи и плейсхолдер-цвета: `FUR_PALETTES` (12), `PATTERNS` (4), `EYES` (6), `EYE_COLORS` (5), `ACCESSORIES` (8). В сейве хранятся только индексы, а рисунок берёт цвета из [art/palettes.ts](../src/game/art/palettes.ts) (`FUR_ART`, `EYE_ART`), индексы там те же. Мелкие детали облика (уши, хвост, веснушки и т. п.) в сейв не пишутся: `critterLook` выводит их из породы и `seed`.

## Ростер и отряд

- Армия (`Army`) — это ростер `units` и отряд `squadIds` (до `SQUAD_SIZE` = 4). Вместимость ростера задают Казармы: `BARRACKS.capacity` = `8 / 11 / 14 / 17 / 20` по уровням ([content/settlement.ts](../src/game/content/settlement.ts), `rosterCapacity`).
- Действия лежат в [state/save.ts](../src/game/state/save.ts): `buyAction` (покупка из `shelter.candidates`), `claimRewardAction`, `releaseUnit` (отпущенный уходит на Кладбище с `reason: "released"`), `reclassAction`, `rebirthAction`, `trainUnitAction`.
- `rosterLevel(army)` — средний уровень 4 сильнейших бойцов, под него подбираются враги и витрина. `recruitLevel(army, rarity)` считает то же самое, но только по бойцам этой звезды и выше.

## Бар («таверна»)

Файл [content/tavern.ts](../src/game/content/tavern.ts) описывает не найм, а напитки бара «Последний рубеж» (`DRINKS`, 10 сортов, `TAVERN.power` = `1 / 1.3 / 1.6 / 1.9 / 2.25` по уровню бара). Кружка даёт отряду прибавку к статам в процентах на одну вылазку; логика — в `core/settlement/tavern.ts` и `core/battle/drink`. Новые бойцы приходят только через Казармы (`generateShop`), награду за бой и пополнение.

## Смерть, Кладбище, эпитафии

- В итогах боя (`resolveBattle` в [core/progression](../src/game/core/progression/index.ts)) каждый павший боец игрока превращается в `memorialEntry(unit, "killed", now, { killerName, turn, biomeId })` и уходит в `save.memorial`. Снаряжение пропадает вместе с ним, а `REWARDS.gloryPerDeath` даёт +1 Славы за смерть. Если пала вся армия, Слава вырастает на `max(5, Σуровней / 4)`, а игра начинается с нового стартового ростера.
- Эпитафия: `epitaphFor` выбирает один из 16 шаблонов `EPITAPHS` ([content/epitaphs.ts](../src/game/content/epitaphs.ts)) по `createRng(unit.seed ^ now).fork("epitaph")`. Текст строится на текущем языке и сохраняется готовой строкой. Шаблон получает `EpitaphCtx`: имя, пол, убийцу, класс, ход и характер.
- Убийцу ищет `findKiller`: это ближайший к телу боец противоположной стороны.
- Воскрешение (`revive` в [core/settlement](../src/game/core/settlement/index.ts)) доступно с 5-го уровня Кладбища, одно за игровой день. Павший возвращается без снаряжения (`strippedUnit`: деревянное оружие своего навыка, без талисмана), а записи ставится `revivedAt`.

## Перерождение

`canRebirth`: уровень 80 и меньше 5★. `rebirthUnit` ([core/units](../src/game/core/units/index.ts)) работает так:

1. `rescaleRarity(maxStats, from, to)` восстанавливает 5★-версию того же персонажа через `model.growth` и множители звёзд и строит из неё статы следующей звезды. Максимум кратен 5 и не ниже прежнего.
2. Уровень сбрасывается на 1, `xp` на 0. Класс, оружие, навыки, SP, история и `skillXp` (ранги) сохраняются.
3. Пул `learnable` растёт на разницу `RARITY_SKILL_POOL`, кандидаты берутся из `fork("rebirth:<★>")`.
4. Пока какой-то стат 80-го уровня ниже прежнего, максимум модели этого стата растёт на +5 (до 100 итераций).

`rebirthAction` открывает новую звезду в `profile.maxRarity`, и с этого момента её бойцы появляются в витрине, награде и стартовом ростере.

## Как добавить персонажа

Именованных персонажей-бойцов в игре нет: все бойцы процедурные. «Новый персонаж» поэтому означает одно из шести действий ниже. Все упомянутые файлы, кроме `docs/`, синхронизируются из next-instapok, поэтому правку нужно делать там и затем запускать `pnpm sync:game`. Если в сейве появляется новое значение enum, повышайте `SAVE_VERSION` в [core/save/index.ts](../src/game/core/save/index.ts) и добавляйте тождественную миграцию по образцу `9: (old) => ({ ...old, version: 10 })`, иначе старая сборка молча отклонит новый сейв.

### Новый класс

1. [shared/character/classes.ts](../src/shared/character/classes.ts): добавьте строку `[id, "Name", all, any?]` в нужный `tier(...)` в `CHARACTER_CLASSES`. Оружие и тип движения выводятся из требований. Летуну нужна запись в `FLIER_MOUNTS`, иначе `mountOf` вернёт `undefined` и животного на рисунке не будет. Если классу нужно больше трёх талантов на его ярусе (`MAX_TALENTS`), модель не будет его генерировать, и взять его можно будет только сменой класса.
2. [content/classStats.ts](../src/game/content/classStats.ts): добавьте запись `CLASS_STAT_MODS[id]`. Тест требует её наличия, хотя бы одного положительного значения и модулей не больше 50.
3. [art/outfits.ts](../src/game/art/outfits.ts): добавьте `CLASS_OUTFITS[id] = o(hat, hatColor, garb, color, accent, emblem, extra)`. Набор признаков должен быть уникальным. Новый `HatKind` нужно отрисовать в `outfitHead` и учесть в `hatLift`.
4. Особое поведение, как у Dancer, задаётся вручную: `DANCER_CLASS` и ветки в `withClassAssist`, `allowedSkillIds`, `classRole`.
5. Оружие класса должно иметь `${skill}_wood` и `${skill}_basic` в [content/weapons.ts](../src/game/content/weapons.ts). Для всех 7 навыков они уже есть.
6. Сейв: `classIdSchema = z.enum(CLASS_IDS)` расширяется сам, поэтому добавление класса совместимо со старыми сейвами (повышение версии нужно только ради старых сборок). Если класс **переименовать или удалить**, сейв с ним перестанет проходить схему целиком. Тогда нужны `SAVE_VERSION`+1 и миграция-обход по образцу v6→v7 (`6: (old) => …`), которая переводит `classId` во всём сейве.
7. i18n: название класса остаётся английским (`CharacterClass.name`). Роль и движение переводятся автоматически.
8. Тесты: [content.test.ts](../tests/game/content.test.ts) («пояснения классов»), [art.test.ts](../tests/game/art.test.ts) (ключи `CLASS_OUTFITS` равны `CLASS_IDS`, силуэты уникальны, все позы дают корректный SVG), [units.test.ts](../tests/game/units.test.ts) («у каждого класса есть изучаемые навыки»), [proficiency.test.ts](../tests/game/proficiency.test.ts) (пресетов столько же, сколько классов).

### Новая порода

1. [content/breeds.ts](../src/game/content/breeds.ts): добавьте `breed("cat_xxx", "cat", "English", "Русский", build, l(ears, tails, { muzzle?, fluffy?, marking? }))` в `BREEDS`. Формы ушей и хвоста берите из тех, что рисует ветка этого вида в [critter.ts](../src/game/art/critter.ts) (`catEar`/`dogEar`/`mouseEar`, `catTail`/`dogTail`/`mouseTail`): неподходящая форма молча уйдёт в ветку `default`. Новую форму нужно добавить в union `EarShape`/`TailShape`/`Marking` и отрисовать там же.
2. Сейв: `breedId` хранится как `z.string()`, повышать версию не нужно. Породу нельзя удалять или переименовывать: `breedDef` бросает ошибку на неизвестный id в [UnitScreen](../src/game/ui/screens/UnitScreen.tsx) и [UnitDetails](../src/game/ui/components/UnitDetails.tsx).
3. Новая порода меняет выбор породы для тех же seed, но сохранённые бойцы не меняются.
4. Тесты: `uniqueIds(BREEDS)` в [content.test.ts](../tests/game/content.test.ts) и «облик бойца» в [art.test.ts](../tests/game/art.test.ts).

### Новая фракция (тип врагов)

1. [content/factions.ts](../src/game/content/factions.ts): добавьте в `FACTIONS` запись `{ id, get name() { return tr(en, ru) }, get desc() {…}, palettes: [индексы 0–11], species: { cat, dog, mouse } }`.
2. Фракция попадает в игру только через биом: укажите `factionId` в [content/biomes.ts](../src/game/content/biomes.ts) или добавьте новый биом. Новый биом — это отдельная задача: тайлы, фоны, погода.
3. Сейв: `factionId` хранится как `z.string()`. Удалять фракцию нельзя, потому что `factionDef` бросает ошибку на сохранённых картах (`BattleSetupScreen`, `makeEnemy`).
4. Тесты: `uniqueIds(FACTIONS)` и «у каждого биома есть фракция».

### Новые клички, прозвища, титулы, эпитафии, характеры

1. [content/names.ts](../src/game/content/names.ts): добавьте имя **одновременно** в `NAMES_RU` и `NAMES_EN` на одну и ту же позицию, через `m(...)` или `f(...)`. Тогда длины и порядок полов совпадут, и один и тот же seed даст одно имя одного пола на обоих языках. Тест этого не проверяет.
2. `EPITHETS_*` и `BOSS_TITLES_*` — пары `[м, ж]` одинаковой длины на обоих языках, иначе `langArray` бросит ошибку при загрузке модуля.
3. Эпитафии: функция `(c: EpitaphCtx) => tr(en, ru)` в `EPITAPHS` ([content/epitaphs.ts](../src/game/content/epitaphs.ts)). Характеры: пара в `PERSONALITIES`, добавляйте только в конец, потому что id — это `p<index+1>` и он хранится в сейве.
4. Сейв не затрагивается. Тест: минимальные объёмы в [content.test.ts](../tests/game/content.test.ts).

### Новый житель поселения (NPC)

1. [content/settlement.ts](../src/game/content/settlement.ts): добавьте в `NPCS` запись `{ id, place, building?, get name() { return tr(…) }, species, pos, fur, eyes, accessory }`. `place` — id участка из `PLOTS` или `"gate"`. `fur` — индекс `FUR_ART`, `eyes` — одновременно форма глаз (0–5) и цвет радужки (0–4), `accessory` — 0–7.
2. [content/dialogues.ts](../src/game/content/dialogues.ts): нужна хотя бы одна фоновая сцена `{ id, npc: <id>, lines: () => [...] }` с 2–3 репликами на обоих языках. Сюжетные сцены добавляются через `when`.
3. Текстуры (`idle` и `happy`) и портрет создаются автоматически из `NPCS` ([SettlementScene](../src/game/scene/settlement/SettlementScene.ts), [DialogueBox](../src/game/ui/settlement/DialogueBox.tsx)). Чтобы одеть жителя в наряд класса или дать ему облик породы, придётся передать `classId` и `look` в обоих местах: сейчас `CritterArt` собирается там вручную.
4. Сейв не затрагивается (просмотренные сцены хранятся как `seen.<id>`). Тесты: [dialogue.test.ts](../tests/game/dialogue.test.ts) (у каждого жителя есть фоновые сцены) и [settlementMap.test.ts](../tests/game/settlementMap.test.ts) (позиция не перекрывает проходы, житель стоит только у построенного здания).
5. Рыбак (`FISHER`) и сплетники (`GOSSIPS`, жёсткий кортеж из двух) — отдельные типы `AmbientNpcDef` и `GossipDef`, у них свои тесты ([gossips.test.ts](../tests/game/gossips.test.ts)).

### Новый вид животного

Это самое крупное изменение:

1. Расширьте `Species` в [core/types.ts](../src/game/core/types.ts), `species: z.enum([...])` в `unitSchema` и повысьте `SAVE_VERSION` с тождественной миграцией.
2. Заполните все `Record<Species, …>`:
   - `DEFAULT_SPECIES_WEIGHTS` ([core/units](../src/game/core/units/index.ts));
   - `species` у каждой из 13 фракций;
   - `NAMES_RU`, `NAMES_EN` и геттеры `NAMES`;
   - `SPECIES_LABEL` и `SPECIES_ORDER` ([ui/lib/format.ts](../src/game/ui/lib/format.ts)).
3. Добавьте хотя бы одну породу вида: иначе `rng.pick` бросит ошибку на пустом списке.
4. Арт: `ArtSpecies`, геометрия по виду в [critter.ts](../src/game/art/critter.ts) (голова, тело, уши, хвост, лапы), такие же ветки в [outfits.ts](../src/game/art/outfits.ts) (`eyeY`, `headGeom`, `bodyGeom` и т. д.), `DEFAULT_LOOK` в [look.ts](../src/game/art/look.ts), эмодзи-заглушка в [UnitView](../src/game/scene/UnitView.ts).
5. По желанию: видовой Special (`onlySpecies`) в [skills/specials.ts](../src/game/content/skills/specials.ts).

### Главный герой

Герой один, его рисунок задан в коде [art/hero.ts](../src/game/art/hero.ts). Новый вариант (например, другой головной убор) добавляется так:

1. Новое поле в `HeroArt` и ветка в `heroSvg`.
2. То же поле в `heroArtKey`, иначе кадры перепутаются в кэше текстур.
3. Загрузка кадров в `preload` [SettlementScene](../src/game/scene/settlement/SettlementScene.ts).
4. Проверка в [hero.test.ts](../tests/game/hero.test.ts).

## Где менять

| Что                                                     | Файл                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Поля бойца                                              | [core/types.ts](../src/game/core/types.ts) `UnitInstance` + `unitSchema` и миграция в [core/save/index.ts](../src/game/core/save/index.ts)                                                                                                                                                         |
| Генерация, ростер, перерождение, пулы навыков           | [core/units/index.ts](../src/game/core/units/index.ts)                                                                                                                                                                                                                                             |
| Витрина, награда, пополнение, эпитафии, итоги боя       | [core/progression/index.ts](../src/game/core/progression/index.ts)                                                                                                                                                                                                                                 |
| Размер ростера, уровни, цены, веса звёзд                | `ROSTER`, `SHOP`, `REWARDS`, `RECRUIT_RARITY_WEIGHTS` в [content/balance.ts](../src/game/content/balance.ts)                                                                                                                                                                                       |
| Породы, фракции, клички, внешность, эпитафии, характеры | [breeds.ts](../src/game/content/breeds.ts), [factions.ts](../src/game/content/factions.ts), [names.ts](../src/game/content/names.ts), [appearance.ts](../src/game/content/appearance.ts), [epitaphs.ts](../src/game/content/epitaphs.ts), [personalities.ts](../src/game/content/personalities.ts) |
| Вместимость Казарм, воскрешение                         | [content/settlement.ts](../src/game/content/settlement.ts), [core/settlement/index.ts](../src/game/core/settlement/index.ts)                                                                                                                                                                       |
| Тесты                                                   | [units](../tests/game/units.test.ts), [roster](../tests/game/roster.test.ts), [rebirth](../tests/game/rebirth.test.ts), [reinforce](../tests/game/reinforce.test.ts), [content](../tests/game/content.test.ts)                                                                                     |

`src/game`, `src/shared`, `src/model` и `tests/game` приходят синхронизацией из next-instapok (`pnpm sync:game`). Правьте их там.
