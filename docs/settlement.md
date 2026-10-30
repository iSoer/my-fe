# Поселение

Поселение (деревня, база) — это экран `#/village`. Герой ходит по Phaser-карте шириной в три экрана, строит и улучшает здания, оставляет бойцов на полигоне, покупает снаряжение в Лавке, заказывает кружку в баре, воскрешает павших и уходит через ворота на вылазку. Логика поселения — чистые функции над `SaveGame` без DOM и Phaser. Сцена только рисует то, что лежит в сейве.

> Код поселения лежит в `src/game/**`. Эти папки синхронизируются из `next-instapok` (см. [CLAUDE.md](../CLAUDE.md)). Правки, которые не перенесены туда, пропадут при следующем `pnpm sync:game`.

## Слои и файлы

| Слой           | Файл                                                                                                                                                                                                                                                                               | Что внутри                                                                                                                                                                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Данные         | [content/settlement.ts](../src/game/content/settlement.ts)                                                                                                                                                                                                                         | `BUILDINGS`, таблицы уровней (`BARRACKS`, `TRAINING`, `STORE`, `TAVERN_MENU`, `GRAVEYARD`), `GAME_DAY`, карта `SETTLEMENT_TILES`, `PLOTS`, `SORTIE_GATE`, жители `NPCS`, `FISHER`, `GOSSIPS`, `GOSSIP_SPOTS`, дождь `SETTLEMENT_RAIN`, константы героя |
| Данные бара    | [content/tavern.ts](../src/game/content/tavern.ts)                                                                                                                                                                                                                                 | `TAVERN.power`, `DRINKS`                                                                                                                                                                                                                               |
| Логика         | [core/settlement/index.ts](../src/game/core/settlement/index.ts)                                                                                                                                                                                                                   | постройка и улучшение, Казармы, полигон, Лавка, Кладбище, игровой день                                                                                                                                                                                 |
| Логика бара    | [core/settlement/tavern.ts](../src/game/core/settlement/tavern.ts)                                                                                                                                                                                                                 | `drinkPct`, `drinksAt`, `canOrderDrink`, `orderDrink`, `drinkForBattle`                                                                                                                                                                                |
| Ходьба         | [core/settlement/walk.ts](../src/game/core/settlement/walk.ts)                                                                                                                                                                                                                     | тайлы, коллизии, A*-путь, `placeInReach`                                                                                                                                                                                                               |
| Дождь          | [core/settlement/rain.ts](../src/game/core/settlement/rain.ts)                                                                                                                                                                                                                     | `rainyCycle`, `rainAt`: детерминированно по часам                                                                                                                                                                                                      |
| Состояние UI   | [state/settlement.ts](../src/game/state/settlement.ts)                                                                                                                                                                                                                             | действия `buildAction` / `upgradeAction` / `trainAction` / …, `tickSettlement`, атомы `$settlementPanel` и `$settlementNear`, `placeAlerts`, `settlementGuide`, `placeSigns`, `SettlementControl`                                                      |
| Арт            | [art/village.ts](../src/game/art/village.ts)                                                                                                                                                                                                                                       | процедурные SVG: земля, частокол, деревья, домики, полигон, Кладбище, ворота, пустой участок, `buildingWear`                                                                                                                                           |
| Сцена          | [scene/settlement/SettlementScene.ts](../src/game/scene/settlement/SettlementScene.ts)                                                                                                                                                                                             | мир, камера, ввод, герой, жители, вывески                                                                                                                                                                                                              |
| Сцена (прочее) | [scene/settlement/index.ts](../src/game/scene/settlement/index.ts), [rain.ts](../src/game/scene/settlement/rain.ts), [speech.ts](../src/game/scene/settlement/speech.ts), [gossips.ts](../src/game/scene/settlement/gossips.ts)                                                    | монтаж `Phaser.Game`, погода, облачка реплик, сплетники                                                                                                                                                                                                |
| Экраны         | [ui/screens/SettlementScreen.tsx](../src/game/ui/screens/SettlementScreen.tsx), [ui/settlement/BuildingPanel.tsx](../src/game/ui/settlement/BuildingPanel.tsx), [ui/screens/StoreScreen.tsx](../src/game/ui/screens/StoreScreen.tsx), [ui/village.css](../src/game/ui/village.css) | HUD, нижняя панель (dock), карточки мест, Лавка                                                                                                                                                                                                        |
| Сейв           | [core/save/index.ts](../src/game/core/save/index.ts)                                                                                                                                                                                                                               | `settlementSchema`, `story`, миграции v8→v9, v9→v10, v10→v11                                                                                                                                                                                           |

## Здания

Общие правила:

- У каждого здания 5 уровней (`BUILDING_MAX_LEVEL = 5`). Построенное здание начинается с 1-го уровня. Уровень 0 значит «не построено» (`buildingLevel`).
- Цена хранится в `BuildingDef.cost` как кортеж из 5 чисел. `cost[0]` — постройка, `cost[n]` — улучшение с уровня n на n+1. `levelCost(id, level)` возвращает `null` на уровне 5.
- Параметр уровня читается через `atLevel(table, level)`: индекс `level - 1` прижимается к границам таблицы.
- Валюта одна: Вкусняшки 🦴 (`profile.treats`). Других ресурсов у зданий нет.
- `BuildingDef.requires` задаёт минимальные уровни других зданий. Сейчас ни у одного здания его нет, но `missingRequirements` и статус `locked` это поддерживают.
- Здания не сносятся и не понижаются.

| id          | Название (en / ru)                         | Значок | Назначение                                                                | Цена: постройка · 1→2 · 2→3 · 3→4 · 4→5 | Всего | Параметры по уровням 1…5                                                                                                                        |
| ----------- | ------------------------------------------ | ------ | ------------------------------------------------------------------------- | --------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `barracks`  | Barracks / Казармы                         | 🛡️     | Ростер бойцов. Стоит с начала игры (`defaultSettlement`) | 0 · 150 · 350 · 700 · 1400              | 2600  | `BARRACKS.capacity` = 8, 11, 14, 17, 20 бойцов в ростере                                                                                        |
| `training`  | Training Ground / Тренировочный полигон    | 🎯     | Бойцы получают опыт со временем и за каждую вылазку, но в бой не идут     | 120 · 200 · 400 · 800 · 1500            | 3020  | `TRAINING.capacity` = 1, 2, 4, 6, 8 мест; `xpPerHour` = 10, 12, 14, 17, 20; `sortieXp` = 10, 12, 15, 18, 20                                     |
| `store`     | Trading Post / Торговая лавка              | 🛒     | Оружие и талисманы, витрина меняется по времени                           | 80 · 180 · 380 · 750 · 1400             | 2790  | `STORE.offers` = 6, 8, 10, 12, 14 позиций; `discount` = 0, 5, 10, 15, 20 %; `refreshHours = 4`; каждая 3-я позиция — талисман (`talismanEvery`) |
| `graveyard` | Graveyard / Кладбище                       | 🪦     | Хранит имена павших; с 5-го уровня воскрешает одного бойца в игровой день | 60 · 150 · 350 · 800 · 2000             | 3360  | `GRAVEYARD.reviveLevel = 5`                                                                                                                     |
| `tavern`    | The Last Stand Bar / Бар «Последний рубеж» | 🍺     | Кружка на одну вылазку: процентная прибавка к статам отряда               | 150 · 250 · 500 · 900 · 1600            | 3400  | `TAVERN_MENU` = 3, 5, 7, 9, 10 сортов; `TAVERN.power` = ×1, ×1.3, ×1.6, ×1.9, ×2.25                                                             |

Комментарий в `content/settlement.ts` прямо говорит, что эти числа — параметры конфигурации, а не утверждённый баланс. Ориентир — бой на «Нормально» приносит около 125 🦴.

### Постройка и улучшение

- `canBuild` проверяет три условия: место свободно, требования выполнены, хватает 🦴. `build` списывает `cost[0]` и ставит `{ level: 1, builtAt: now }`.
- `canUpgrade` и `upgrade` списывают `cost[level]` и повышают уровень на 1. `builtAt` сохраняется.
- Перед улучшением полигона сначала начисляется опыт по старой скорости (`settleTraining`).
- `afterLevelChange` выкладывает витрину заново (`restockStore`) после любого изменения уровня Лавки.
- `state/settlement.ts` оборачивает `build` и `upgrade` в `withEvent`, поэтому в `story.counters` попадают события `built` и `upgraded` (см. [dialogues.md](./dialogues.md)).
- Статус участка `PlotStatus` вычисляет `plotStatus`:
  - `occupied` — здание построено;
  - `available` — можно строить;
  - `free` — не хватает 🦴;
  - `locked` — требования не выполнены или у участка нет `building` (резерв).
- `upgradable(save)` — здания, которые можно улучшить прямо сейчас. Для них на вывеске рисуется значок ⬆.

### Казармы

- `rosterCapacity` — вместимость по уровню. Если в сейве Казарм нет (сейв битый), считается 1-й уровень.
- `freeRosterSlots` = вместимость минус `army.units.length`. Тренирующиеся занимают места, павшие — нет.
- `barracksLevelFor(units)` — наименьший уровень, который вмещает ростер. Используется в миграции v8→v9.

### Тренировочный полигон

- `startTraining` создаёт слот `TrainingSlot { unitId, since, lastTick, carryMs, xp }` и убирает бойца из `squadIds`. Отказ в четырёх случаях: полигон не построен, мест нет, боец уже тренируется, боец в идущем бою.
- `settleTraining(save, now)` начисляет опыт за прошедшее время:
  - каждая единица опыта стоит `3 600 000 / xpPerHour` мс;
  - дробный остаток копится в `carryMs`;
  - если часы переведены назад, отсчёт начинается заново без опыта;
  - опыт идёт через `gainXp`, поэтому на максимальном уровне он не копится. В счётчик слота `TrainingSlot.xp` (строка «+N опыта» на панели) попадает только реально полученный опыт: на максимуме он не растёт.
- `applySortieTraining(save, battleId, now)` начисляет бонус `sortieXp` каждому тренирующемуся один раз за бой. Последние 20 id боёв хранятся в `sortiesTrained` (`SORTIES_REMEMBERED`). Вызывается из `finishBattle` в [state/save.ts](../src/game/state/save.ts).
- `pruneTraining` снимает с полигона тех, кого больше нет в ростере.
- `stopTraining` и `collectAction` сначала начисляют опыт, потом освобождают слот.

### Торговая лавка

- `storePeriod(now) = floor(now / (4 ч))` считается от эпохи Unix, поэтому период одинаков при любом перезапуске. `nextStoreRefresh` — начало следующего периода.
- `restockStore` берёт зерно `createRng(store.salt).fork("period:N")` и вызывает `generateStore(seed, army, glory, offers)`. Период только растёт: `max(storePeriod(now), store.period)`.
- `settleStore` меняет витрину только тогда, когда период прошёл или витрина пуста.
- `storePrice` = `max(1, round(itemPrice × (1 − discount)))`.
- Обновление витрины за Вкусняшки — `rerollStore(save, now)` (кнопка «🎲 Обновить товар» в Лавке, действие `rerollStoreAction(period)` в `state/save.ts`). Цена `storeRerollCost` = `STORE.reroll.base + step × store.rerolls` = 20, 40, 60… Каждое обновление увеличивает `store.rerolls` (цену) и `store.variant` (номер выкладки внутри периода). `finishBattle` сбрасывает `rerolls` в 0 после каждой вылазки, витрина при этом остаётся. Если период успел смениться, обновление отклоняется с `restocked: true` без списания.
- Зерно выкладки — `period:N`, а для `variant > 0` — `period:N:vK`, поэтому `restockStore` при смене уровня Лавки не откатывает обновлённую витрину. В новом периоде `variant` снова 0 (плановая выкладка), `rerolls` не сбрасывается.
- Покупка — `buyItemAction(itemId, period)` в `state/save.ts`. Если витрина сменилась, покупка отклоняется с `restocked: true`.
- Экран Лавки — [StoreScreen.tsx](../src/game/ui/screens/StoreScreen.tsx) (`#/store`). Открыть его можно только при построенной Лавке.

### Кладбище и игровой день

- Игровой день задаёт `GAME_DAY = { utcOffsetMinutes: 0, resetHour: 0 }`: сутки по UTC от полуночи. `gameDay(now)` — номер дня, `nextDayStart(now)` — начало следующего.
- `reviveStatus` возвращает `{ unlocked, readyToday, nextAt }`:
  - `unlocked` — Кладбище 5-го уровня;
  - `readyToday` — номер дня `now` больше, чем у `lastReviveAt`; если часы переведены назад, новое воскрешение не открывается.
- `revivable(save)` — записи `memorial` с `reason === "killed"`, без `revivedAt`, которых нет в ростере.
- `revive`:
  - через `strippedUnit` возвращает бойца с деревянным оружием своего навыка и без талисмана;
  - добавляет его в отряд, если там меньше `SQUAD_SIZE` бойцов;
  - ставит записи `revivedAt` и запоминает `settlement.lastReviveAt`.

  Если в Казармах нет мест, сейв не меняется. Божественный класс — один на армию (`isUniqueClassId`): пока такой же божественный класс у живого бойца, `canRevive` отказывает.

### Бар

- `DRINKS` — 10 сортов. У каждого есть `pct` (проценты к статам на 1-м уровне), `minLevel` и `price` от 20 до 60 🦴.
- `drinksAt(level)` — сорта, у которых `minLevel ≤ level`.
- `orderDrink` сразу списывает цену и запоминает `settlement.drink = { id, level }`. Сила фиксируется по уровню бара на момент заказа. Кружка одна на вылазку, во время боя заказать нельзя.
- `startBattle` (`state/save.ts`) превращает заказ в `BattleDrink` через `drinkForBattle`, записывает события `sortieStarted` и `drinkDrunk` и удаляет `settlement.drink`.
- `drinkPct` = `round(pct × TAVERN.power[level])`.

## Сейв поселения

`SaveGame.settlement` (`SettlementState` в [core/types.ts](../src/game/core/types.ts), схема `settlementSchema` в [core/save/index.ts](../src/game/core/save/index.ts)):

```ts
{
  buildings: Partial<Record<BuildingId, { level: 1..5, builtAt: number }>>,
  training: TrainingSlot[],
  sortiesTrained: string[],      // последние 20 id боёв
  lastReviveAt?: number,
  hero?: { pos: Pos, facing },   // где стоит герой (setHeroSpot)
  drink?: { id, level }          // заказанная кружка
}
```

Сейв также хранит `store: StoreStock` (`weapons`, `talismans`, `period`, `salt`, `fresh`, `rerolls`, `variant`) и `story` (см. [dialogues.md](./dialogues.md)).

- В `settlementSchema.buildings` каждый id здания перечислен явно. zod по умолчанию молча отбрасывает неизвестные ключи, поэтому здание, которое не перечислено в схеме, исчезнет после перезагрузки.
- Текущая версия сейва — `SAVE_VERSION = 11`. Бар появился как пустая миграция `9: old => ({ ...old, version: 10 })`.

## Экономика

- Источники 🦴: награды за бой (`resolveBattle`) и бонус +500 за новую армию при Славе ≥ 600 (`state/save.ts`).
- Расходы:
  - постройки и улучшения: полный набор пяти зданий до 5-го уровня стоит 15 170 🦴;
  - покупки в Лавке;
  - кружки в баре.
- Пассивного дохода нет. Время работает только на полигон (опыт) и на смену витрины Лавки.
- `tickSettlement(now)` «догоняет время» (опыт и витрину) и пишет сейв, только если что-то изменилось. `SettlementScreen` вызывает его при открытии и затем каждые 15 с (`TICK_MS`). `StoreScreen` вызывает его при входе и при истечении периода.

## Карта

`SETTLEMENT_TILES` — 15 строк по 33 символа (`SETTLEMENT_W = 33`, `SETTLEMENT_H = 15`). Карта состоит из трёх экранов по `SCREEN_W = 11` клеток:

- 1-й экран — Казармы и Лавка;
- 2-й — полигон, бар и ворота;
- 3-й — роща и Кладбище.

```
FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF
F.*........*.......*......T.....F
F####.####..#####.####.T.....T.TF
F##D#.##D#..##D##.##D#..T...T...F
F..=....=.....=.....=...........F
F.=============================.F
F....=....*.....=.......=......*F
F.**.=...b...*..=...*.T.=gggg...F
F.**.=.~~.......=....b..=gggg.*.F
F....=.~~..b....=.......=gggg...F
F*...=..........============...bF
F..===...*.T.*..=...............F
F...............=....*.*..b..~~TF
Fb.T..b..b..T.b.=...T........~~.F
FFFFFFFFFFFFFFFGGGFFFFFFFFFFFFFFF
```

Легенда (`TILE_LEGEND`):

- непроходимо: `F` частокол, `T` дерево, `#` участок, `D` вход на участок, `G` ворота, `~` пруд, `b` куст, `g` ограда Кладбища;
- проходимо (`WALKABLE_TILES`): `.` трава, `=` тропинка, `*` цветы.

Символ вне легенды и клетка за краем карты считаются деревом (`settlementTile`).

Участки `PLOTS`. `front` — точка у входа, откуда открывается карточка. По умолчанию её считает `frontOf(x, y, w, h) = (x + ⌊w/2⌋ + 0.5, y + h + 0.5)`:

| id участка       | здание      | x, y  | w × h | front                                                |
| ---------------- | ----------- | ----- | ----- | ---------------------------------------------------- |
| `plot-barracks`  | `barracks`  | 1, 2  | 4 × 2 | (3.5, 4.5)                                           |
| `plot-store`     | `store`     | 6, 2  | 4 × 2 | (8.5, 4.5)                                           |
| `plot-training`  | `training`  | 12, 2 | 5 × 2 | (14.5, 4.5)                                          |
| `plot-tavern`    | `tavern`    | 18, 2 | 4 × 2 | (20.5, 4.5)                                          |
| `plot-graveyard` | `graveyard` | 25, 7 | 4 × 3 | (27, 10.5), задан вручную: подход снизу вдоль ограды |

- Ворота `SORTIE_GATE = { x: 15, y: 14, w: 3, front: (16.5, 13.4) }` — не здание. Место `gate` есть всегда.
- `PlaceId` — это `plot-…` или `"gate"`. `placeFront(id)` возвращает точку входа.
- `plotOf(buildingId)` возвращает участок здания.
- Участок без `building` считается резервом. У него табличка с крестом, карточка — «🚧 Пустырь · 🔒 Недоступно», и строить на нём нельзя. Сейчас все участки заняты зданиями, свободных `#` на карте нет.

## Герой и ходьба

[core/settlement/walk.ts](../src/game/core/settlement/walk.ts), константы в `content/settlement.ts`:

- Герой появляется в `HERO_START = (5.5, 6.5)`, после боя — в `HERO_RETURN = (16.5, 13.2)` у ворот (ставит `finishBattle`). Позиция сохраняется в `settlement.hero` при остановке, телепорте и выходе из сцены (`setHeroSpot`).
- Скорость `HERO_SPEED = 3.4` клетки/с. Радиусы: `HERO_RADIUS = 0.3`, `NPC_RADIUS = 0.35`, `REACH_RADIUS = 1.35` (радиус входа в место).
- Движение свободное, в дробных клетках:
  - `moveHero` сначала двигает по x, потом по y и скользит вдоль стен; длинный шаг дробится;
  - `heroFits` проверяет четыре угла квадрата героя по тайлам и расстояние до каждого `Blocker`;
  - ввод — WASD или стрелки, экранный джойстик (тянуть от точки касания больше 16 px) или тап по земле;
  - `normalizeInput` не даёт диагонали быть быстрее прямой; `facingOf` выбирает направление взгляда и при равенстве предпочитает горизонталь.
- Тап по земле прокладывает путь `findPath` — A* по 8 направлениям без срезания углов. Клетка, где стоит житель, непроходима. Если тапнули в препятствие, цель — `nearestPathTile` в радиусе 3 клеток.
- `placeInReach(pos)` — ближайший вход в радиусе `REACH_RADIUS`. Возле входа на клавиатуре работают E, Пробел и Enter. На сенсорном экране подсказки нет, вместо неё — нижняя панель.

### Жители

- `NPCS` — 6 жителей. Каждый стоит у своего места, если здание построено. Разведчик у ворот стоит всегда.

  | id         | Имя (en / ru)                     | место            |
  | ---------- | --------------------------------- | ---------------- |
  | `sergeant` | Sergeant Barkley / Сержант Барбос | `plot-barracks`  |
  | `trader`   | Auntie Brie / Тётушка Сырница     | `plot-store`     |
  | `coach`    | Coach Whisker / Тренер Ус         | `plot-training`  |
  | `keeper`   | Keeper Moss / Смотритель Мох      | `plot-graveyard` |
  | `barkeep`  | Barkeep Hops / Трактирщица Хмель  | `plot-tavern`    |
  | `scout`    | Scout Scar / Разведчик Шрам       | `gate`           |

  Список стоящих на карте возвращает `activeNpcs(save)`. Сцена считает его сама по `PlaceSign.built`.

- Жители не ходят. Они «дышат» (tween ±2 px) и поворачиваются к подошедшему герою: текстура меняется на `happy`, спрайт отражается.
- Рыбак `FISHER` («Дед Окунь») стоит у пруда в (9.5, 9.4) и смотрит влево. Он не разговаривает: бормочет `FISHER_MUTTERS` по таймеру `MUTTER_TIMING`, а по тапу — сразу.
- Сплетники `GOSSIPS` — `elman` и `vanya`. Стоят парой на одном из 6 мест `GOSSIP_SPOTS`, второй правее на `GOSSIP_GAP = 2`. Перебираются на другое место раз в 70–110 с. Подробно — в [dialogues.md](./dialogues.md).
- Все они блокируют героя (`SettlementScene.blockers`).

## Рендеринг сцены

[scene/settlement/index.ts](../src/game/scene/settlement/index.ts) создаёт отдельный `Phaser.Game` через `createHiDpiGame` (буфер канваса — CSS-размер × плотность рендера, см. [rendering-and-fx.md](./rendering-and-fx.md#чёткость-на-экранах-с-высокой-плотностью)), `activePointers: 1`, `noAudio`. В нём две сцены:

- `SettlementScene` — мир;
- `SettlementFxScene` (`settlement-fx`) — погода в экранных координатах: палые листья (`WeatherLayer`), дождь и виньетка (`RainLayer`). Сила дождя `rainAt(Date.now())` перечитывается раз в секунду. Камера слоя всегда в покое (`initHiDpiScene(this, { keepAtRest: true })`), размеры — `viewW`/`viewH` в CSS px.

Phaser грузится лениво: `SettlementScreen` вызывает `import("@game/scene/settlement/index")`.

Устройство `SettlementScene`:

- Сначала `loadTextures` растеризует все SVG через `ensureTexture`: клетка `T = 48` мировых (CSS) пикселей, текстуры крупнее в `res` раз: `settlementRes(плотность, зум вида)` — 2 при плотности 1 (как раньше), до 3 на плотных экранах. Затем `build()` собирает мир. Зум вида `view.zoom` (0.55–1.6) задан в CSS-единицах, у камеры он умножен на плотность (`setCssZoom`); джойстик закреплён на экране `pinToScreen`, координаты указателя делятся на плотность.
  - Земля: на каждой клетке травяная подложка и, при нужде, тропинка, сорняки или вода. Вариант выбирается хэшем координат: 4 фактуры земли, 5 вариантов частокола, 4 дерева, 3 куста.
  - Под воротами рисуется ряд «за околицей» (`OUTSIDE_ROWS = 1`), а в нём горящие глаза (`EYES_X`).
  - 8 факелов (`TORCHES`) с аддитивным мерцающим свечением.
  - Для каждого участка — спрайт пустого участка (`villagePlotSvg`) и спрайт здания текущего уровня. Ключ текстуры здания — `st:building:<plotId>:<level>`. Виден один из двух спрайтов.
  - Высота спрайта над участком — `buildingOver`: у домиков `HOUSE_ROOF_OVER = 1.4`, у полигона `TRAINING_H − h`, у Кладбища `GRAVEYARD_H_OVER = 0.5`. Сам SVG — `villageBuildingSvg(id, w, h, level)` в [art/village.ts](../src/game/art/village.ts) (исчерпывающий `switch`): `villageHouseSvg` с цветами крыши и стен, `villageTrainingSvg` или `villageGraveyardSvg`. Его же показывает галерея арта.
  - Вид здания зависит от уровня через `buildingWear(level)`: 1, 0.78, 0.58, 0.4, 0.25. Чем выше уровень, тем меньше разрушений, но совсем целым здание не бывает.
- Глубина — y нижней кромки (`setDepth(bottom)`), так объекты сортируются по y. Глубину героя меняют только когда она изменилась: `setDepth` всегда ставит сортировку всего списка (~1000 тайлов). Подписи — 9000+, вывески — 9500+, облачка — 9600, джойстик — 20000.
- Раз в 0,5 с вызывается `refreshSigns()`. Она запрашивает `opts.signs()` (это `placeSigns($save.get())`) и `opts.npcAlerts()` и делает следующее:
  - показывает или прячет здания и жителей;
  - меняет текстуру при улучшении: нужная догружается, пока висит прежняя (`retryBuilding`: одна попытка за раз, не больше `BUILDING_RETRIES = 3` — если SVG не растеризуется, остаётся прежняя);
  - подсвечивает участки (`available` — тёплый оттенок, `locked` — серый);
  - перерисовывает плашки, только если строка `title|sub|status|guide|built` изменилась;
  - над построенным зданием и воротами — плашка с названием; у непостроенного участка плашки нет, вместо неё у левого края фасада вбита табличка (`villageStakeSignSvg` в [art/village.ts](../src/game/art/village.ts)) со знаком: молоток — можно строить, замок — пока нельзя, крест — резерв (пустырь). Значок «!» и стрелка-подсказка висят над табличкой. Тап по ней (или по стройке) ведёт героя к участку и открывает карточку: что здесь будет, что даст постройка и цена; кнопка «Построить» спрашивает подтверждение (`ConfirmModal`), улучшение — без подтверждения;
  - показывает «!» над местом (`PlaceSign.alert`), стрелку следующего шага (`guide`) и «!» над жителем с новой сюжетной сценой.

  Если новый житель появился там, где стоит герой, герой переносится ко входу.

- Камера: по ширине в кадр помещается `SCREEN_W` клеток, по высоте — вся карта между HUD (`opts.insets()`). Зум 0.55…1.6. Если экран слишком низкий, камера следует за героем и по вертикали. Сглаживание камеры — `dt × 6`.
- Пауза (`opts.paused()`) — пока открыта карточка места или диалог. В паузе ввод выключен, путь сбрасывается, сплетники молчат.
- Герой: кадры ходьбы и покоя по 4 направлениям (`heroSvg`). После `HOOD_OFF_AFTER = 5` с покоя он снимает капюшон, под которым белый котёнок; котёнок моргает раз в 2,5–5 с. Через `HOOD_ON_AFTER = 3` с ходьбы капюшон надевается обратно.
- Игра поселения создаётся с `fps.smoothStep: false`: со сглаживанием Phaser после старта и возврата из фона 120 кадров держит дельту не больше 16.7 мс, и ниже 60 fps камера и герой двигались рывками. Шаг кадра сцена ограничивает сама (50 мс).
- `SettlementControl` (`teleport`, `walkTo`) регистрируется при монтировании. Его используют кнопки нижней панели и `window.__pf.settlement`.

## Экран и панели

- [SettlementScreen.tsx](../src/game/ui/screens/SettlementScreen.tsx):
  - верхняя панель: только `ResourceBar`;
  - нижняя панель `st-dock`: большая кнопка «Вылазка» (ворота) и рядом квадратная кнопка меню ☰. По нажатию она становится крестиком ✕, а над ней столбиком, по одному друг над другом, выезжают сначала «🏠 Главное меню» и «⚙️ Настройки» (тёмные, `SYSTEM_ITEMS`), ниже — кнопки зданий из `BUILDING_IDS` (новое здание попадает в меню само). Кнопка места переносит героя ко входу и открывает карточку, меню при этом закрывается; закрывают его и повторное нажатие, тап мимо, Escape, открытие карточки или начало разговора. Значок «!» и подсветка-подсказка зданий переходят на кнопку меню, пока оно закрыто;
  - `BottomSheet` с `BuildingPanel` или `GatePanel`;
  - `DialogueBox`;
  - тосты о новых уровнях с полигона.
- Подсказки (`state/settlement.ts`):
  - `placeAlerts` — «!» над местом:
    - Казармы — ростер пуст или меньше `SQUAD_SIZE`, отряд неполон, ждёт награда или кому-то хватает SP на навык;
    - Лавка — `store.fresh`;
    - Кладбище — сегодня можно воскресить и есть кого;
    - ворота — идёт бой;
  - `settlementGuide` подсвечивает, куда идти дальше: `gate` или `barracks`.
- [BuildingPanel.tsx](../src/game/ui/settlement/BuildingPanel.tsx):
  - `Header` — значок, имя, `LevelPips`, описание;
  - `Stats` — текущий уровень → следующий, из `def.stats(level)`;
  - `GrowthBlock` — кнопка постройки или улучшения с ценой и причиной отказа;
  - раздел здания: `BarracksSection`, `TrainingSection`, `StoreSection`, `TavernSection`, `GraveyardSection`. Раздел выбирает `buildingSection` — исчерпывающий `switch` по `BuildingId` с проверкой `never`: без раздела новое здание не скомпилируется.
  - `GrowthBlock` защищён от двойного тапа: `useRef`-замок снимается после перерисовки с новым уровнем (или после ошибки); уровень в тосте берётся из нового сейва.
- `GatePanel` показывает одно из трёх: «Вернуться в бой», «В Казармы» (если нет бойцов или отряда) или «Собрать вылазку» → `#/battle/setup`.

## Отладка

`window.__pf.settlement` ([GameRoot.tsx](../src/game/GameRoot.tsx)) содержит:

- `panel`, `near` — атомы;
- `teleport(id)`, `walkTo(id)`, `open(id)`;
- `build(id)`, `upgrade(id)`, `train(unitId)`, `collect(unitId)`, `revive(entryId)`, `tick()`.

`window.__pf.save` — атом `$save`. С ним можно, например, выдать себе 🦴 так:

```js
__pf.save.set({ ...__pf.save.get(), profile: { ...__pf.save.get().profile, treats: 99999 } });
```

## Тесты

- [tests/game/settlement.test.ts](../tests/game/settlement.test.ts) — постройка, улучшение, Казармы, полигон, Лавка (включая обновление витрины за Вкусняшки), Кладбище, игровой день, миграция v8→v9.
- [tests/game/settlementMap.test.ts](../tests/game/settlementMap.test.ts):
  - карта: рамка из частокола, выход только через ворота, участки непроходимы и не пересекаются, распределение мест по экранам;
  - достижимость каждого места при всех жителях;
  - вывески, `buildingWear`, дождь.
- [tests/game/gossips.test.ts](../tests/game/gossips.test.ts) — места сплетников и данные цитат.
- [tests/game/tavern.test.ts](../tests/game/tavern.test.ts) — меню, сила напитков, заказ, напиток в бою.

## Где менять

- **Цены, уровни, параметры зданий** — `BUILDINGS[id].cost` и таблицы `BARRACKS`, `TRAINING`, `STORE`, `TAVERN_MENU`, `GRAVEYARD` в [content/settlement.ts](../src/game/content/settlement.ts). Напитки — [content/tavern.ts](../src/game/content/tavern.ts).
- **Правила** (что можно и когда) — [core/settlement/index.ts](../src/game/core/settlement/index.ts), [core/settlement/tavern.ts](../src/game/core/settlement/tavern.ts).
- **Карта, участки, жители, точки появления** — `SETTLEMENT_TILES`, `PLOTS`, `NPCS`, `FISHER`, `GOSSIP_SPOTS`, `HERO_*` в [content/settlement.ts](../src/game/content/settlement.ts). После правок запустите `pnpm vitest run tests/game/settlementMap.test.ts tests/game/gossips.test.ts`.
- **Вид зданий** — [art/village.ts](../src/game/art/village.ts), а `villageBuildingSvg` там же; `buildingOver` — в [SettlementScene.ts](../src/game/scene/settlement/SettlementScene.ts).
- **Карточка здания** — [BuildingPanel.tsx](../src/game/ui/settlement/BuildingPanel.tsx). Подсказки «!» — `placeAlerts` в [state/settlement.ts](../src/game/state/settlement.ts).
- **Схема сейва** — `settlementSchema`, `SAVE_VERSION`, `MIGRATIONS` в [core/save/index.ts](../src/game/core/save/index.ts).
- **Игровой день** — `GAME_DAY`. **Дождь** — `SETTLEMENT_RAIN`.
- Всё перечисленное лежит в `src/game` и синхронизируется. Сначала правьте в `next-instapok`.
