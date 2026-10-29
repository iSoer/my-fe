# Боевые карты («малые карты»): схватка 6×8

Обычный бой (режим `skirmish`) идёт на поле **6×8 клеток**. Поле собирается по одной из восьми **раскладок**
(`MapLayout`: опушка, переправа, ущелье и т. д.). Раскладка задаёт узнаваемый каркас, а детали случайны.
Генератор проверяет связность и при неудаче повторяет попытку. Весь код детерминирован по `seed` и не
обращается к DOM и Phaser.

> «Малая карта» в разговоре — это схватка 6×8, её создаёт `generateMap`. «Большая карта» — вылазка в мрачную
> чащу 30×30, её создаёт `generateExpedition` (см. [expedition.md](expedition.md)). Общей «карты мира» с узлами
> в игре нет. Поселение (деревня) — отдельная сцена, этот документ её не описывает.

## Файлы

| Файл                                                     | Что внутри                                                                                                                                                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [core/map/layouts.ts](../src/game/core/map/layouts.ts)   | `LayoutDef`, восемь раскладок, `LAYOUTS`, `LAYOUT_WEIGHTS`, `pickLayout`, примитивы черновика (`carvePath`, `groves`, `smooth`, `seed`, `banks`), автотайл тропинок `decorMask`, `bridgeVertical` |
| [core/map/generate.ts](../src/game/core/map/generate.ts) | `generateMap`: биом, раскладка, укрытия, спавны, `validate`, враги, босс, подкрепления; `pickEnemyLoadout` и `makeEnemy` (их же использует чаща)                                                  |
| [core/map/pathing.ts](../src/game/core/map/pathing.ts)   | `moveCost`, `isPassable`, `reachableTiles` (Дейкстра), зоны угрозы, `distanceField`                                                                                                               |
| [core/types.ts](../src/game/core/types.ts)               | `MAP_W = 6`, `MAP_H = 8`, `TerrainId`, `MapLayout`, `MapDecor`, `MapDef`, `BoardSize`, `inBounds`, `inMap`, `mapSize`                                                                             |
| [content/balance.ts](../src/game/content/balance.ts)     | `TERRAIN_SHARE`, `DIFFICULTIES` (число врагов, укрытия у врагов, подкрепления, босс), `teamLevels`, `teamTreats`, `BATTLE.turnLimit = 20`                                                         |

## Формат карты (`MapDef`)

```ts
{
  seed, biomeId, factionId, difficulty,
  objective: "rout" | "killBoss" | "extract",
  layout?: MapLayout,                  // в схватке есть всегда; в старых сейвах и в чаще его нет
  mode?: "skirmish" | "expedition",    // поле не задано = схватка
  decor?: Record<"x,y", "path" | "bridge">,
  tiles: TerrainId[][],                // tiles[y][x], y = 0 — сторона врага (верх)
  playerSpawns: Pos[], enemies: EnemyPlacement[], reinforcements: ReinforcementWave[],
  rewards: { treats, glory }
}
```

Размер поля берётся из самой карты через `mapSize(map)` (`tiles[0].length × tiles.length`). Генератор схватки
и функция `inBounds` рассчитаны только на 6×8. Боевая логика, поиск пути и сцена работают через `inMap(size, p)`.

`decor` — чисто визуальный слой: тропинка лежит на проходимой клетке, мост — на клетке `plain` поверх воды.
На правила он не влияет. Единственное исключение — справка о клетке: для моста она показывает «Мост».

## Формат раскладки (`LayoutDef`)

Раскладка — это **код, а не данные**. У неё есть идентификатор, лимит непроходимых клеток, флаг «нужна
сплошная вода» и функция `build`, которая рисует местность в черновике. Реальный пример
([layouts.ts](../src/game/core/map/layouts.ts), `crossroads`):

```ts
/** Перекрёсток: дорога поперёк поля и тропинка вдоль, по углам — рощи и укрытия у развилки. */
const crossroads: LayoutDef = {
  id: 'crossroads',
  maxBlocked: TERRAIN_SHARE.maxBlocked,
  build(d, rng, env) {
    const y = rng.int(3, 4);
    carvePath(d, rng, { x: 0, y }, { x: MAP_W - 1, y });
    mainPath(d, rng);
    groves(d, rng, 0.22 + env.forestBias);
  },
};
```

- `Draft = { g: Grid, decor: Map<string, MapDecor>, reserved: Set<string> }`. В `reserved` лежат клетки спавнов
  игрока, ставить на них местность нельзя (это проверяют `free` и `put`).
- `LayoutEnv = { waterOk, forestBias }`. `waterOk = waterFillsTile(biome)`, `forestBias = biome.bias.forest`.
- `needsWater: true` — раскладка не выпадает в биомах, где вода выглядит лужей или предметом (`riverBridge`, `lake`).

### Восемь раскладок

| id            | Суть                                                                                                                                                | `maxBlocked` | Вода  |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ----- |
| `glade`       | Открытое поле, рощи (`groves` 0.2 + bias); тропинка с вероятностью 50 %, валун с вероятностью 40 %                                                  | 6            | —     |
| `forestEdge`  | Густой лес у одного края (плотность по столбцам 0.92/0.7/0.3/0.08/0.04/0.04), сглаживание, валун в чаще (55 %), тропинка                            | 6            | —     |
| `riverBridge` | Река в ряду 3 или 4, может изогнуться на соседний ряд; мост в x = 2 или 3; без изгиба обязательно есть брод у края                                  | 6            | нужна |
| `crossroads`  | Дорога поперёк (ряд 3–4) и тропинка вдоль, рощи 0.22                                                                                                | 6            | —     |
| `pass`        | Ущелье: скалы с боков в рядах 2–5, не больше 8 гор, тропинка, кусты у подножия                                                                      | **8**        | —     |
| `lake`        | Озеро из 3–4 клеток в x 2–3, y 3–4; тропинка огибает его; заросли на берегах (45 %)                                                                 | 6            | нужна |
| `fort`        | Стена в ряду 2–3: ворота в `gate`, проёмы на расстоянии 3 от ворот; на чётном расстоянии `wall_breakable`, на нечётном `wall`; два укрытия во дворе | 6            | —     |
| `ruins`       | 2–3 обломка стен буквой «Г» или «I» в рядах 2–5 (30 % из них хлипкие), рядом укрытия и кусты; дорога с вероятностью 50 %                            | 6            | —     |

`TERRAIN_SHARE.maxBlocked = 6`. «Непроходимыми» считаются клетки, которые не может пройти пехота: `mountain`,
`water`, `wall`, `wall_breakable`.

### Веса раскладок по биомам (`LAYOUT_WEIGHTS`)

| Биом                 | Веса                                                                                |
| -------------------- | ----------------------------------------------------------------------------------- |
| `default` (запасной) | glade 3, forestEdge 2, crossroads 2, riverBridge 2, ruins 1, fort 1, lake 1, pass 1 |
| `yard`               | glade 3, forestEdge 3, riverBridge 2, crossroads 2, fort 2, lake 1, ruins 1         |
| `roofs`              | glade 3, crossroads 3, pass 2, ruins 2, fort 1                                      |
| `basement`           | crossroads 3, ruins 3, fort 2, pass 2, riverBridge 1                                |
| `dump`               | ruins 3, glade 2, forestEdge 2, crossroads 2, pass 1                                |
| `winter_park`        | forestEdge 3, riverBridge 2, glade 2, lake 2, crossroads 1                          |
| `jungle`             | forestEdge 4, riverBridge 3, lake 2, ruins 2, glade 1                               |
| `desert`             | glade 3, ruins 3, pass 2, crossroads 2                                              |
| `glacier`            | pass 3, glade 2, crossroads 2, ruins 1                                              |
| `canyon`             | pass 5, crossroads 2, fort 1, ruins 1                                               |
| `deep_forest`        | forestEdge 5, riverBridge 3, glade 2, lake 1                                        |
| `indoors`            | crossroads 3, fort 2, ruins 2, glade 2                                              |
| `factory`            | crossroads 3, pass 2, fort 2, riverBridge 1, ruins 1                                |
| `infested`           | ruins 3, lake 2, forestEdge 2, riverBridge 1, glade 1                               |

`pickLayout` отбрасывает раскладки с `needsWater`, если в биоме `waterOk = false`. Если не осталось ни одной,
возвращает `glade`. Выборка на 6000 картах (1500 seed × 4 сложности, случайный биом): crossroads 972,
ruins 1008, glade 904, forestEdge 856, pass 824, riverBridge 572, fort 484, lake 380.

## Алгоритм `generateMap`

1. `root = createRng(seed)`. Каждая подзадача берёт своё ответвление (`fork`): `"biome"`, `"count"`, `"layout"`,
   `"terrain:N"`, `"enemies"`, `"reinforcements"`. Поэтому изменение в одном шаге не сдвигает случайность в остальных.
2. Биом. Если передано `"random"`, он выбирается из всех `BIOMES` (так всегда в игре, см. `enemyTeams`).
3. Спавны игрока берутся из `playerSpawnsFor(squadSize)` по порядку: (1,7), (4,7), (2,7), (3,7), (2,6), (3,6).
   Это первые `min(squadSize, 6)` клеток (в игре `SQUAD_SIZE = 4`).
4. Число врагов: `diff.enemies` — easy 3–4, normal 4–5, hard 5–7, nightmare 6–8.
5. Раскладка выбирается через `pickLayout`.
6. До **50 попыток** (`terrain:${attempt}`). На попытке 30 раскладка сменяется на `glade`.
   - `emptyDraft(reserved)`, затем `def.build(draft, rng.fork("layout"), env)`.
   - Укрытия для игрока: `TERRAIN_SHARE.covers` 2–4 плюс `biome.bias.covers`, ставятся в рядах 3–5 у края
     зарослей или стен, два укрытия рядом не встают. Укрытия для врага: `diff.enemyCovers` (0/1/2/2) в рядах 0–2.
     Хлипкие препятствия: `TERRAIN_SHARE.breakable` 0–1 в рядах 2–5. Всё это ставит `scatter`, не больше 400 бросков.
   - Спавны игрока принудительно делаются `plain`.
   - Спавны врагов: случайные проходимые для пехоты клетки в рядах 0–2.
   - `validate(g, playerSpawns, enemySpawns, def.maxBlocked)`.
7. Если все 50 попыток не прошли, используется жёстко заданная поляна (4 куста, 2 укрытия, 8 фиксированных
   точек врагов). На 6000 проверенных картах этот вариант не выпал ни разу.
8. Враги (`erng`):
   - Уровни берутся из `teamLevels(diff, team)`. Комплект выбирает `pickEnemyLoadout`, он учитывает роли
     отряда: ближний бой, дальний бой, лекарь, танцор, тяжёлые.
   - Одного оружия не больше 60 %.
   - Ближники ставятся ближе к игроку.
   - Первые `round(n × holdRatio)` врагов получают стойку `hold`, остальные `advance`. Босс получает `guard` и
     встаёт на самую дальнюю клетку ближе к центру — из тех, до которых пехота игрока может дойти от первого
     спавна (проверка карты допускает до 20 % отрезанных спавнов, а цель «Победить вожака» должна быть выполнима).
   - Если клетка под врагом непроходима для его типа движения, она становится `plain`.
9. Подкрепления по `diff.reinforcements` (hard: ход 3, 2 врага; nightmare: две волны) появляются на проходимых
   клетках ряда 0, в одной волне — на разных клетках. Если волна больше свободного ряда 0, остаток уходит в ряды
   1–2 (ближе к центру — первыми, без случайности); больше, чем клеток в рядах 0–2, врагов в волне не будет.
10. `rewards = { treats: teamTreats(diff, team), glory: diff.glory }`.

### Проверка карты (`validate`)

- Непроходимых для пехоты клеток не больше `maxBlocked`.
- В каждом ряду проходимы хотя бы 2 клетки.
- Все спавны игрока достижимы из первого спавна (BFS пехотой). `wall_breakable` при этом считается стеной.
- Не меньше **80 %** спавнов врагов достижимы. Босс после расстановки встаёт только на достижимый спавн.
- У каждого спавна, своего и вражеского, не больше 2 закрытых сторон (непроходимые соседи плюс край поля).

### Зоны развёртывания

Игрок стоит в рядах 6–7 (низ поля), враги в рядах 0–2, подкрепления в ряду 0. Отдельного экрана расстановки
нет: бойцы встают в `playerSpawns[i]` в порядке отряда (`createBattle`,
[reducer.ts](../src/game/core/battle/reducer.ts)).

## Детерминизм

- В `core/map/*` вся случайность идёт через `Rng`. `Math.random` и `Date.now` там нет.
- `opts.now` передаётся только в `generateUnit` для `createdAt`, на расстановку он не влияет.
- Одинаковый seed даёт одинаковую карту: это проверяет `mapgen.test.ts` («детерминирована по seed»).
- В игре seed карты берётся так: `createRng(sortieSeed).fork("${difficulty}:${team}")`. `sortieSeed` хранится
  в сейве и сбрасывается после боя.

## Откуда берётся бой

`BattleSetupScreen` ([ui/screens/BattleSetupScreen.tsx](../src/game/ui/screens/BattleSetupScreen.tsx)) ведёт
игрока по шагам:

1. Маршрут `#/battle/setup`: выбор режима (`$sortieMode`: «Схватка» или «Мрачная чаща») и сложности.
2. Маршрут `#/battle/enemy/<difficulty>`: `enemyTeams(difficulty, mode)` создаёт 4 команды (`ENEMY_TEAMS = 4`)
   с готовыми картами. Каждой показывается биом (`BIOME_ICON` и `biomeDef().name`), уровни, число врагов и награда.
   Результат кешируется в `offerCache`.
3. `scoutBattle(difficulty, team, mode)` кладёт выбранную карту в `save.pendingBattle`. Маршрут `#/battle/squad`:
   выбор отряда, затем `startBattle(ids)` → `createBattle` → `#/battle`.

## Тесты

- [tests/game/mapgen.test.ts](../tests/game/mapgen.test.ts):
  - детерминизм;
  - property-тест на 200 запусков (размер, число врагов, проходимость клеток под врагами, уникальность позиций,
    не меньше 80 % врагов достижимо, не меньше 65 % клеток проходимо, уровни, босс достижим, позиции волны
    подкреплений не повторяются);
  - «генерация не падает»: регрессия на seed, где `groves` падал на `pick` из пустого списка (572, 1924, 2529 в
    `basement`, 2529 в `yard`, 2786 в `deep_forest`), каждая раскладка на 1500 seed, `generateMap` на 240 seed ×
    все биомы со сменой сложности и размера отряда;
  - в среднем не больше 18 % непроходимых клеток;
  - не больше `maxBlocked`;
  - не меньше 3 раскладок в каждом биоме, `riverBridge` и `lake` только там, где есть сплошная вода;
  - форма каждой раскладки: `riverBridge`, `forestEdge`, `glade`, `crossroads`, `pass`, `lake`, `fort`, `ruins`;
  - связность тропинок;
  - маска `decorMask`.
- [tests/game/pathing.test.ts](../tests/game/pathing.test.ts), [movement.test.ts](../tests/game/movement.test.ts): стоимость
  хода, дальности 3/4/2, проход сквозь союзников, перемещение на сгенерированных картах.

## Где менять

**Рецепт: новая раскладка малой карты** (пусть её id `"orchard"`):

1. Тип: добавить `"orchard"` в объединение `MapLayout` в [core/types.ts](../src/game/core/types.ts).
2. Схема сейва: добавить `"orchard"` в `z.enum([...])` поля `layout` в `mapSchema`
   ([core/save/index.ts](../src/game/core/save/index.ts), строка с `layout: z.enum`). Без этого сейв с
   `pendingBattle` или `battle` на новой раскладке не пройдёт `parseSave`.
   - Новое значение только расширяет схему, старые сейвы остаются валидными. Поднимать `SAVE_VERSION` и
     писать миграцию нужно только при переименовании или удалении раскладки.
   - Ошибку в схеме, скорее всего, поймает и `pnpm typecheck`: `MapDef` присваивается в типизированный сейв.
3. Раскладка: в [core/map/layouts.ts](../src/game/core/map/layouts.ts) написать `const orchard: LayoutDef = { id, maxBlocked, needsWater?, build }`
   из примитивов `seed`, `smooth`, `groves`, `carvePath`, `mainPath`, `banks`, `put`. Затем добавить её в `LAYOUTS`
   (это `Record<MapLayout, …>`, так что TS напомнит).
   - Не трогать `d.reserved`.
   - Не перегораживать ряд целиком.
   - Держать число непроходимых клеток в пределах `maxBlocked`.
   - Не вызывать `rng.pick` на массиве, который может оказаться пустым: `pick` бросает исключение.
4. Веса: прописать `orchard: N` в нужные биомы `LAYOUT_WEIGHTS`, включая `default`.
5. i18n: не нужен. Название раскладки игроку не показывается.
6. Арт: отдельный не нужен. Тропинки и мосты рисуются автотайлами по `decor` (`pathSvg`, `bridgeSvg`). Новый вид
   `MapDecor` потребовал бы правок в `MapDecor`, схеме сейва (`decor: z.enum(["path","bridge"])`), `env.ts`,
   `art/tile.ts` и `MapScene.drawTiles`.
7. Тесты: общие инварианты в `mapgen.test.ts` подхватят раскладку сами. Желательно добавить отдельный тест
   формы по образцу «переправа» или «опушка» (`maps("orchard", [...])`).
8. Визуальная проверка:
   - `pnpm dev` → `#/battle/setup` → сложность → команды. Биом случайный, поэтому нужную раскладку быстрее
     получить вручную.
   - В консоли dev-сервера выполнить
     `const { generateMap } = await import("/src/game/core/map/generate.ts")`.
   - Затем найти seed, на котором `generateMap({seed, biomeId:"yard", difficulty:"normal", team:0, squadSize:4}).layout === "orchard"`.
   - Положить карту в сейв:
     `const s = __pf.save.get(); __pf.save.set({ ...s, pendingBattle: { seed, difficulty: "normal", biomeId: "yard", team: 0, map } })`.
   - Открыть `#/battle/squad` и начать бой.
