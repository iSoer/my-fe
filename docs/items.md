# Предметы: оружие, талисманы, инвентарь, Лавка

Предметы в игре бывают двух категорий (`ItemCategory`): оружие и талисманы. Оружие строится программно из оружейных навыков модели, талисманы задаются таблицей. И то и другое хранится в общем `Inventory` армии и продаётся в Лавке поселения.

## Файлы

| Файл                                                       | Что внутри                                                                                                                                                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [content/weapons.ts](../src/game/content/weapons.ts)       | `WEAPONS`, `weaponDef`, `WEAPON_COLOR`, `SPECS`, `GRADES`, `VARIANT_RANK`; id-хелперы `basicWeaponId`, `woodWeaponId`, `gradeWeaponId`, `isWeaponId`, `weaponsForSkill`, `isMagicWeapon`, `weaponRange` |
| [content/items.ts](../src/game/content/items.ts)           | `TALISMANS`, `talismanDef`, `isTalismanId`                                                                                                                                                              |
| [core/items/index.ts](../src/game/core/items/index.ts)     | каталог (`itemCategory`, `itemInfo`, `itemPrice`, `isWoodWeapon`), инвентарь (`addItem`, `removeItem`, `addAll`, `unitGear`), Лавка (`generateStore`, `inStore`, `EMPTY_STORE`), `enemyWeaponGrade`     |
| [content/balance.ts](../src/game/content/balance.ts)       | `WEAPON_PRICES`, `ITEMS`, `PRICES.sharpen`, `COMBAT.weaponTierMt`, `rankMt`, `rankShortMt`                                                                                                              |
| [content/settlement.ts](../src/game/content/settlement.ts) | `STORE`: позиции, скидки, период смены витрины                                                                                                                                                          |
| [core/skills/types.ts](../src/game/core/skills/types.ts)   | `WeaponDef`, `WeaponVariant`, `TalismanDef`                                                                                                                                                             |
| [core/units/index.ts](../src/game/core/units/index.ts)     | `equipWeapon`, `weaponMt`, `weaponShortfall`, `rankMt`                                                                                                                                                  |
| [state/save.ts](../src/game/state/save.ts)                 | действия `buyItemAction`, `equipWeaponAction`, `equipTalismanAction`, `sharpenAction`                                                                                                                   |

## Оружие

Оружейные навыки модели (`WEAPON_SKILLS`) и их свойства задаёт `SPECS`:

| Навык        | Цвет      | Дальность | Mt (железо) | Магическое     | Посох                            | Разновидности                                | Эффективно против |
| ------------ | --------- | --------- | ----------- | -------------- | -------------------------------- | -------------------------------------------- | ----------------- |
| `sword`      | red       | 1         | 6           | —              | —                                | basic, brave, killer, armorslayer, cavslayer | —                 |
| `spear`      | blue      | 1         | 6           | —              | —                                | то же                                        | —                 |
| `axe`        | green     | 1         | 6           | —              | —                                | то же                                        | —                 |
| `gauntlet`   | colorless | 1         | 5           | —              | —                                | basic, brave, killer                         | —                 |
| `bow`        | colorless | 2         | 5           | —              | —                                | basic, brave, killer                         | `flier`           |
| `blackMagic` | colorless | 2         | 5           | да (Mag → Res) | —                                | basic, killer                                | —                 |
| `whiteMagic` | colorless | 2         | 4           | да             | да (урон ×0.5, лечит Поддержкой) | basic, killer                                | —                 |

`build()` создаёт для каждого навыка базовое оружие четырёх грейдов (`GRADES`) и разновидности железного грейда. Всего получается 46 предметов.

| Грейд  | id               | Mt  | Требуемый ранг | Цена                                      |
| ------ | ---------------- | --- | -------------- | ----------------------------------------- |
| wood   | `<skill>_wood`   | −2  | E              | 0 (не продаётся, в инвентаре не хранится) |
| iron   | `<skill>_basic`  | ±0  | E              | 60                                        |
| steel  | `<skill>_steel`  | +2  | D              | 160                                       |
| silver | `<skill>_silver` | +4  | B              | 420                                       |

| Разновидность | id                    | Изменения                                  | Ранг | Цена |
| ------------- | --------------------- | ------------------------------------------ | ---- | ---- |
| brave         | `<skill>_brave`       | Mt −2, `spdMod −5`, 2 удара при инициативе | C    | 320  |
| killer        | `<skill>_killer`      | Mt −1, `cdMod −1`                          | D    | 220  |
| armorslayer   | `<skill>_armorslayer` | `effectiveAgainst: ["armored"]`            | D    | 200  |
| cavslayer     | `<skill>_cavslayer`   | `effectiveAgainst: ["cavalry"]`            | D    | 200  |

Названия на английском: `WEAPON_GRADE_LABELS` + `SKILL_LABELS` или `VARIANT_PREFIX` + навык. Формат названий проверяет `content.test.ts`. Описание (`desc`) — геттер с `tr`.

**Владение.** Оружие может взять любой боец. `equipWeapon` ставит `unit.weaponSkill = weapon.kind`, а `withClassSkills` снимает ставшие недоступными навыки (см. [skills](skills.md)) и при необходимости выдаёт `as_heal` и `as_dance`.

`weaponMt = max(0, mt + weaponTier·2 + floor(rankIndex/3) − shortfall·2)`, где `shortfall = max(0, rankIndex(requiredRank) − rankIndex(ранг навыка))`. Заточка (`weaponTier` 0–3, цены `PRICES.sharpen = [200, 500, 1000]`) принадлежит **бойцу**, а не оружию, и сохраняется при смене оружия.

**Враги** получают оружие по уровню (`enemyWeaponGrade`): до 8-го — wood, до 25-го — iron, до 45-го — steel, дальше silver.

## Талисманы (`TALISMANS`)

Один слот на бойца (`UnitInstance.accessory`). Свойства задают `SkillHooks`, поэтому талисманы видны в прогнозе боя ([skills.md](skills.md)).

| id           | Название (RU)       | Иконка | Цена | Условие              | Эффект                                             |
| ------------ | ------------------- | ------ | ---- | -------------------- | -------------------------------------------------- |
| `tal_fang`   | Клык на шнурке      | 🦷     | 140  | —                    | +3 Str/Mag                                         |
| `tal_bell`   | Бубенчик            | 🔔     | 140  | —                    | +3 Spd                                             |
| `tal_collar` | Шипастый ошейник    | ⛓️     | 140  | —                    | +3 Def                                             |
| `tal_ribbon` | Атласная ленточка   | 🎀     | 140  | —                    | +3 Res                                             |
| `tal_heart`  | Сердечко из фетра   | ❤️     | 120  | —                    | +6 HP                                              |
| `tal_claw`   | Коготь вожака       | 🐾     | 320  | уровень ростера ≥ 20 | +2 Str/Mag, +2 Spd, +2 Def                         |
| `tal_book`   | Потрёпанный букварь | 📖     | 180  | —                    | `xpMultiplier: 1.5`                                |
| `tal_coin`   | Монетка-копилка     | 🪙     | 220  | —                    | `treatsMultiplier: 1.15`, если боец вернулся живым |
| `tal_mint`   | Листик мяты         | 🍃     | 240  | уровень ростера ≥ 10 | `onTurnStart`: +4 HP                               |
| `tal_foil`   | Плащ из фольги      | 🛡️     | 200  | —                    | `negateEffective`                                  |

Фабрика `statTalisman` строит `desc` из `statText`, используя подписи статов модели. Поле `TalismanDef.minGlory` поддерживается функцией `available`, но ни у одного талисмана не задано.

## Инвентарь

`Inventory = Record<itemId, count>` лежит в `SaveGame.inventory`.

- `addItem` не кладёт деревянное оружие и количество не ограничивает: возврат снаряжения и находки из сундуков не теряются. `ITEMS.stackCap = 99` ограничивает только покупку в Лавке (`buyItemAction`).
- `removeItem` бросает исключение, если предметов не хватает.
- `unitGear(unit)`: что возвращается в инвентарь, когда бойца отпускают (купленное оружие и талисман).
- При смене оружия или талисмана прежний предмет возвращается в инвентарь (`equipWeaponAction`, `equipTalismanAction`).

## Лавка

`generateStore(seed, army, glory, count)` детерминирован по `seed`.

- **Пул оружия:**
  - железо всех 7 навыков;
  - сталь 3 случайных навыков с уровня ростера 10 (`ITEMS.steelFromLevel`/`steelOffers`);
  - серебро 2 навыков с уровня 30;
  - 2 случайные разновидности (`variantOffers`).
- **Пул талисманов:** доступные по `minRosterLevel` и `minGlory`.
- Позиций `count + 1`, если Слава ≥ 150. Каждая `STORE.talismanEvery = 3`-я позиция — талисман, пока талисманы не кончатся.
- `STORE.offers = [6, 8, 10, 12, 14]` и `STORE.discount = [0, 5, 10, 15, 20 %]` зависят от уровня Лавки. Витрина меняется раз в `STORE.refreshHours = 4` часа. Зерно периода — `salt + period` (`restockStore` в [core/settlement](../src/game/core/settlement/index.ts)).
- Цена: `storePrice = max(1, round(price × (1 − discount)))`.
- Покупка (`buyItemAction`) проверяет по порядку:
  1. что Лавка построена;
  2. что витрина не сменилась (`period`);
  3. что предмет есть в ассортименте;
  4. что хватает Вкусняшек;
  5. что не превышен `stackCap`.

Сундуки вылазки берут предметы из ценового коридора `EXPEDITION.itemBand` ([core/map/expedition.ts](../src/game/core/map/expedition.ts)). Армия получает их только при уходе через выход (`ExpeditionState.found`).

## Рецепт: новое оружие или талисман

**Новая разновидность оружия:**

1. Добавить вариант в union `WeaponVariant` ([core/skills/types.ts](../src/game/core/skills/types.ts)).
2. В [content/weapons.ts](../src/game/content/weapons.ts) заполнить четыре записи, иначе не скомпилируется: `VARIANT_PREFIX`, `VARIANT_RANK`, ветку в `weaponNote` (описание через `tr`) и ветку в `switch` внутри `build()`.
3. Добавить вариант в `variants` нужных навыков в `SPECS`.
4. Добавить цену в `WEAPON_PRICES.variant` ([balance.ts](../src/game/content/balance.ts)).
5. Если нужна новая боевая механика: поле в `WeaponDef` и его обработка в `simulateCombat` ([core/combat](../src/game/core/combat/index.ts)). Хуков у оружия нет.

**Новый грейд:** union `WeaponGrade` и `WEAPON_GRADE_LABELS` в `src/shared/character/skills.ts`, затем `GRADES`, `WEAPON_PRICES.grade`, пул `generateStore` и `enemyWeaponGrade`.

**Новый оружейный навык** (`WeaponSkill` в `@shared`): `WEAPON_COLOR` и `SPECS` в weapons.ts имеют тип `Record<WeaponSkill, …>`, и TypeScript потребует запись. Ещё навык нужно добавить в классы ([content/classes.ts](../src/game/content/classes.ts)).

**Новый талисман:** запись в `TALISMANS` ([content/items.ts](../src/game/content/items.ts)):

- для простой прибавки к статам — `statTalisman(id, [en, ru], icon, price, stats, minRosterLevel?)`;
- для остальных — объект `TalismanDef` с `get name()`/`get desc()` через `tr` и `hooks`. Если нужного хука нет, порядок описан в [skills.md](skills.md#рецепт-новый-навык).

**Общее:**

- id предметов уникальны. `content.test.ts` проверяет уникальность только оружия и навыков, талисманы туда не входят, так что за уникальностью id талисманов нужно следить самому.
- Переименование или удаление id требует миграции сейва: id хранятся в `inventory`, `skills.weapon` и `accessory`. Нужно поднять `SAVE_VERSION` в [core/save/index.ts](../src/game/core/save/index.ts).
- Тесты: [tests/game/items.test.ts](../tests/game/items.test.ts) (Лавка, снаряжение, талисман в прогнозе), [tests/game/content.test.ts](../tests/game/content.test.ts) (у каждого оружия класса есть `_wood` и `_basic`, у `_wood` цена 0).

## Где менять

- Числа оружия: `SPECS`, `GRADES`, `VARIANT_RANK`, `build()` в [content/weapons.ts](../src/game/content/weapons.ts).
- Цены: `WEAPON_PRICES`, `PRICES.sharpen` в [balance.ts](../src/game/content/balance.ts). Талисманы — поле `price` в [content/items.ts](../src/game/content/items.ts).
- Состав и правила Лавки: `ITEMS` в [balance.ts](../src/game/content/balance.ts), `STORE` в [content/settlement.ts](../src/game/content/settlement.ts), `generateStore` в [core/items/index.ts](../src/game/core/items/index.ts).
- Влияние на бой: `weaponMt` в [core/units/index.ts](../src/game/core/units/index.ts), `COMBAT` в [balance.ts](../src/game/content/balance.ts), [core/combat/index.ts](../src/game/core/combat/index.ts).
- Действия UI: [state/save.ts](../src/game/state/save.ts).
