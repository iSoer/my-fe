# Местность и биомы

На поле семь типов местности (`TerrainId`) и тринадцать биомов (`BIOMES`).

- Местность задаёт правила: проходимость, бонус стоящему, разрушаемость.
- Биом задаёт названия клеток, цвета, фракцию врагов, погоду и атмосферу, а ещё то, какие раскладки
  выпадают и как выглядит вода.
- Сами правила местности от биома не зависят: «Лужа» во дворе и «Ручей» в лесу — одна и та же `water`.

## Файлы

| Файл                                                                                               | Что внутри                                                                                               |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [core/types.ts](../src/game/core/types.ts)                                                         | `TerrainId`                                                                                              |
| [core/map/pathing.ts](../src/game/core/map/pathing.ts)                                             | `moveCost`, `isPassable`                                                                                 |
| [core/battle/query.ts](../src/game/core/battle/query.ts)                                           | `terrainAt`: за краем поля `wall`, сломанная `wall_breakable` считается `plain`                          |
| [content/terrain.ts](../src/game/content/terrain.ts)                                               | `terrainInfo` (справка о клетке), `ICON`, тексты бонусов                                                 |
| [content/balance.ts](../src/game/content/balance.ts)                                               | `TERRAIN_BONUS`, `COMBAT.coverBonus`, `TERRAIN_SHARE`                                                    |
| [content/biomes.ts](../src/game/content/biomes.ts)                                                 | `BiomeDef`, `BIOMES`, `biomeDef` (на неизвестный id бросает исключение), `waterFillsTile`, `WeatherKind` |
| [scene/weather.ts](../src/game/scene/weather.ts), [scene/ambient.ts](../src/game/scene/ambient.ts) | частицы погоды и атмосферный слой                                                                        |

## Типы местности

| `TerrainId`      | Ход: пехота / броня / конница | Летун | Эффект на стоящего                                                                          | Прочее                                                                                                                   |
| ---------------- | ----------------------------- | ----- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `plain`          | 1                             | 1     | —                                                                                           | «Без эффектов»                                                                                                           |
| `forest`         | 1                             | 1     | `TERRAIN_BONUS.forest = { def: +1, res: +1 }` (`combat/index.ts`, модификатор статов)       | ИИ: +3/+2/+1 к оценке клетки; автовыбор клетки игрока: +4                                                                |
| `cover`          | 1                             | 1     | Def/Res защитника +`floor(×0.3)` против ударов (`COMBAT.coverBonus`, `combat/index.ts:198`) | ИИ: +8/+6/+3; автовыбор: +10                                                                                             |
| `mountain`       | —                             | 1     | —                                                                                           | высокий объект, отбрасывает тень                                                                                         |
| `water`          | —                             | 1     | —                                                                                           | `bridge` в `decor` — это клетка `plain`, нарисованная водой с настилом                                                   |
| `wall`           | —                             | —     | —                                                                                           | непроходима для всех                                                                                                     |
| `wall_breakable` | —                             | —     | —                                                                                           | 2 HP (`reducer.ts:85`, число задано прямо в коде); удар снимает 1; сломанная превращается в `plain` и рисуется обломками |

Стоимость хода — **1 или непроходимо**, других значений нет. Дальность хода: пехота 3, конница 4, броня 2
(см. `pathing.test.ts`). «Непроходимое» для генератора — то, что не проходит пехота.

## Биомы

`waterFillsTile = false` для `roofs`, `dump`, `desert`, `glacier`, `canyon`, `indoors`. В этих биомах вода
выглядит лужей или предметом, раскладки `riverBridge` и `lake` не выпадают, у воды нет берегов с пеной.

| id            | Название        | Фракция          | Погода (kind, density) | Сплошная вода | `bias.forest` | `bias.covers` |
| ------------- | --------------- | ---------------- | ---------------------- | ------------- | ------------- | ------------- |
| `yard`        | Двор            | `yard_pack`      | petals, 6              | да            | 0             | 0             |
| `roofs`       | Крыши           | `chimney_cats`   | motes, 5               | нет           | −0.05         | 0             |
| `basement`    | Подвал          | `red_dot_cult`   | motes, 10              | да            | 0             | 0             |
| `dump`        | Свалка          | `scavengers`     | flies, 8               | нет           | +0.03         | +1            |
| `winter_park` | Зимний парк     | `snow_strays`    | snow, 24               | да            | +0.02         | 0             |
| `jungle`      | Джунгли         | `swamp_cats`     | leaves, 10             | да            | +0.08         | 0             |
| `desert`      | Пустыня         | `sand_dogs`      | sand, 14               | нет           | −0.08         | 0             |
| `glacier`     | Ледник          | `polar_mice`     | snow, 18               | нет           | 0             | 0             |
| `canyon`      | Каньон          | `canyon_coyotes` | sand, 8                | нет           | −0.04         | 0             |
| `deep_forest` | Густой лес      | `forest_lynxes`  | leaves, 7              | да            | +0.1          | +1            |
| `indoors`     | В доме          | `couch_troops`   | motes, 5               | нет           | −0.08         | +1            |
| `factory`     | Завод           | `assembly_dogs`  | embers, 6              | да            | −0.06         | +1            |
| `infested`    | Заражённая зона | `the_horde`      | motes, 9               | да            | 0             | +1            |

Поля `BiomeDef`:

- `id`, `name` — геттер `tr(en, ru)`;
- `factionId` — враги берутся из `FACTIONS` в [content/factions.ts](../src/game/content/factions.ts);
- `weather`;
- `terrainNames` — `Record<TerrainId, string>` через `terrain()` с геттерами `tr`;
- `colors` — `Record<TerrainId, number>`, плейсхолдеры и палитра арта;
- `bg` — цвет фона камеры;
- `bias` — `{ forest, covers }`.

### Как биом влияет на генерацию

- `LAYOUT_WEIGHTS[biome]` — какие раскладки выпадают, см. [maps.md](maps.md).
- `waterFillsTile(biome)` → `LayoutEnv.waterOk`.
- `bias.forest` → `LayoutEnv.forestBias`. Добавляется к плотности `seed` и `groves` в раскладках `glade`,
  `forestEdge`, `crossroads`, `fort`.
- `bias.covers` добавляется к числу укрытий игрока (`TERRAIN_SHARE.covers` 2–4).
- `factionId` — фракция врагов.
- Чаща всегда использует `deep_forest` (`EXPEDITION_BIOME`).

**Мёртвые поля**: `TERRAIN_SHARE.forest`, `.walls`, `.impassable` объявлены, но нигде не читаются.

### Как биом влияет на вид

Почти весь арт ветвится по `biomeId` через `switch` и словари:

- [art/tile.ts](../src/game/art/tile.ts):
  - `plainDeco`, `forestDeco`, `mountainDeco`, `waterDeco`, `wallDeco`, `barricadeDeco`, `coverDeco`;
  - `groundTexture`, `tileEdgeSvg` (пена, тень, обломки);
  - `PATH_STYLE` (тропинки), `wallOnGround`.
- [art/backdrop.ts](../src/game/art/backdrop.ts): фон кинематика. Там `defs` (градиент неба), `sky`, `ground`,
  `bushes`, `tallProp`, `puddle`, `wall`, `cover`, `distant`, `farRays`, `foreground`, `SKY_BOTTOM`.
- [scene/ambient.ts](../src/game/scene/ambient.ts) `AMBIENT[biome]`: облака-тени, лучи, лампы, светлячки,
  блики, цветокоррекция, виньетка. Неизвестный биом получает `DEFAULT`.
- [scene/weather.ts](../src/game/scene/weather.ts) `WeatherLayer`:
  - частицы по `weather.kind` (`KIND_TEX`: flake, leaf, petal, streak, dot);
  - не больше 40 частиц;
  - светлячки и мухи кружат у кустов и укрытий (`anchors`);
  - на большом поле частицы закреплены за экраном (`fixed`).
- [scene/motionFx.ts](../src/game/scene/motionFx.ts): `SNOWY` и `SANDY` — следы на снегу и песке.
- `MapScene.drawTiles`: светлые биомы (`winter_park`, `glacier`, `desert`) затемняют фон вокруг поля мягче.
- `BIOME_ICON` в [BattleSetupScreen.tsx](../src/game/ui/screens/BattleSetupScreen.tsx) — значок биома на
  карточке команды.

Погода и атмосфера используют `Math.random`. Это допустимо: они чисто косметические и в `core` не попадают.
Детерминированы только расположение и выбор вариантов (`seed` карты).

## Тесты

- [tests/game/terrain.test.ts](../tests/game/terrain.test.ts): справка о клетке — бонусы, проходимость, HP
  хлипкой стены.
- [tests/game/pathing.test.ts](../tests/game/pathing.test.ts): `moveCost`.
- [tests/game/mapgen.test.ts](../tests/game/mapgen.test.ts): по всем `BIOMES` — не меньше 3 раскладок в каждом;
  вода только там, где `waterFillsTile`; «случайный биом» выдаёт все биомы.

## Где менять

**Рецепт: новый тип местности** (пусть это `"swamp"`: ход для всех, кроме летунов, стоит 1, Res −1):

1. [core/types.ts](../src/game/core/types.ts): добавить `"swamp"` в `TerrainId`.
2. [core/save/index.ts](../src/game/core/save/index.ts): добавить `"swamp"` в `const terrain = z.enum([...])`.
   Значение только расширяет схему, `SAVE_VERSION` поднимать не нужно. При удалении или переименовании
   местности нужна миграция и повышение версии.
3. [core/map/pathing.ts](../src/game/core/map/pathing.ts): добавить ветку в `moveCost`. `switch` исчерпывающий,
   TS сам укажет на пропуск.
4. Правила:
   - бонус или штраф — `TERRAIN_BONUS` в [balance.ts](../src/game/content/balance.ts);
   - особая защита, как у `cover`, — в [core/combat/index.ts](../src/game/core/combat/index.ts);
   - оценка клетки для ИИ — `core/ai/index.ts`, строки с `"cover"` и `"forest"`;
   - автовыбор клетки игроком — `state/battleUi.ts:218`.
5. Справка о клетке: значок в `ICON` в [content/terrain.ts](../src/game/content/terrain.ts) (это `Record`, TS
   напомнит). Названия во **всех 13 биомах**: `terrainNames` (`[en, ru]`) и `colors` в
   [content/biomes.ts](../src/game/content/biomes.ts).
6. Генерация: местность сама на карте не появится. Её нужно ставить в раскладках
   ([layouts.ts](../src/game/core/map/layouts.ts)), в `scatter` в `generateMap` или в `terrainAttempt` чащи.
   Если она непроходима для пехоты, учесть `blocksFoot` в `layouts.ts`.
7. Арт и текстуры:
   - [art/tile.ts](../src/game/art/tile.ts): новая ветка в `switch (terrain)` в `tileSvg` и функция `swampDeco`.
     Если нужны варианты или кадры — `TILE_VARIANTS` и `TILE_FRAME_COUNT`. Если объект высокий — `isTallTerrain`.
   - `TERRAINS` в [scene/svgTextures.ts](../src/game/scene/svgTextures.ts): по этому списку
     `ensureEnvTileTextures` растеризует текстуры. Без записи клетка останется цветным плейсхолдером.
   - `TERRAIN_GLYPH` в [scene/style.ts](../src/game/scene/style.ts): глиф плейсхолдера.
   - Ветка в `prop()` в [art/backdrop.ts](../src/game/art/backdrop.ts) для фона кинематика.
   - Если местность анимирована, последовательность кадров в `MapScene.startTileAnimations`.
   - `TERRAINS` и `terrainName` в [ui/components/ClassInfo.tsx](../src/game/ui/components/ClassInfo.tsx)
     (таблица проходимости в карточке класса).
   - Массив `terrains` в [tools/gallery/main.ts](../tools/gallery/main.ts).
8. Тесты: `moveCost` в `pathing.test.ts`, справка в `terrain.test.ts`. Если местность непроходима, проверить, что
   `mapgen.test.ts` (меньше 18 % непроходимых клеток, не больше `maxBlocked`) по-прежнему проходит.
9. Проверка: `pnpm dev` → `http://localhost:5173/tools/gallery/index.html` (тайлы и фоны всех биомов), затем бой
   на карте с этой местностью (подложить карту через `__pf.save`, как описано в [maps.md](maps.md)).

**Рецепт: новый биом** (пусть `"sewer"`):

1. Фракция: новая запись в `FACTIONS` в [content/factions.ts](../src/game/content/factions.ts) (`id`, `name`,
   `desc` через `tr`, `palettes`, `species`) или ссылка на существующую.
2. Биом: запись в `BIOMES` в [content/biomes.ts](../src/game/content/biomes.ts):
   - `id`, `get name() { return tr(...) }`, `factionId`;
   - `weather: { kind, colors, density }`;
   - `terrainNames: terrain({...7 пар [en, ru]...})`;
   - `colors` (все 7);
   - `bg`, `bias`.
   - Если вода здесь — лужа или предмет, добавить id в список `waterFillsTile`.
   - Новый вид погоды требует `WeatherKind`, `KIND_TEX` и ветки появления частиц в `weather.ts`.
3. Раскладки: строка `sewer: {...}` в `LAYOUT_WEIGHTS` ([layouts.ts](../src/game/core/map/layouts.ts)).
   Без неё берётся `default`. Тест требует не меньше 3 разных раскладок в биоме.
4. Арт:
   - ветки `case "sewer"` в функциях [art/tile.ts](../src/game/art/tile.ts) и запись в `PATH_STYLE` (есть
     запасной стиль);
   - [art/backdrop.ts](../src/game/art/backdrop.ts): `defs.grad`, `sky`, `ground`, `distant`, `SKY_BOTTOM` и т. д.
     Без них используется оформление по умолчанию;
   - `AMBIENT` в [scene/ambient.ts](../src/game/scene/ambient.ts);
   - `SNOWY` и `SANDY` в `motionFx.ts`, если нужно;
   - `BIOME_ICON` в [BattleSetupScreen.tsx](../src/game/ui/screens/BattleSetupScreen.tsx) (по умолчанию 🗺️).
5. Сейв: `biomeId` хранится как `z.string()`, поэтому схема и `SAVE_VERSION` не меняются.
   Удалять или переименовывать биом **нельзя без миграции**: `biomeDef` бросает исключение на неизвестный id,
   а id хранится в `battle.map`, `pendingBattle`, `lastBattle` и в мемориале (`MemorialEntry.biomeId`).
6. В игре биом начнёт выпадать сам: `generateMap({ biomeId: "random" })` выбирает из всех `BIOMES`.
7. Тесты: `mapgen.test.ts` проходит по `BIOMES` автоматически. Желательно `pnpm vitest run tests/game/mapgen.test.ts`.
8. Проверка: галерея (`/tools/gallery/index.html`, секции «тайлы: …» и «фоны кинематика: …»), затем бой.
   Чтобы не ждать случайного выпадения, подложить карту из
   `generateMap({ seed, biomeId: "sewer", ... })` через `__pf.save` (см. [maps.md](maps.md)).
