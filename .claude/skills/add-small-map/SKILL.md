---
name: add-small-map
description: Рецепт добавления нового варианта малой карты — раскладки (MapLayout/LayoutDef) обычной схватки 6×8, а также нового типа местности или биома для малых карт. Использовать, когда просят новую карту боя, раскладку поля, вариант схватки, новый террейн или биом.
---

# Новый вариант малой карты (схватка 6×8)

Малая карта — поле обычной схватки размером `MAP_W × MAP_H` (6×8, `src/game/core/types.ts`). Его строит `generateMap` (`src/game/core/map/generate.ts`). Каркас поля задаёт **раскладка** (`LayoutDef` в `src/game/core/map/layouts.ts`): сейчас их 8 — `glade`, `forestEdge`, `riverBridge`, `crossroads`, `pass`, `lake`, `fort`, `ruins`. Генератор выбирает раскладку по весам биома, строит её, раскидывает врагов и проверяет карту через `validate`. Если проверка не прошла, делается новая попытка, а после 30 неудачных попыток берётся `glade`.

Подробности в `docs/maps.md`, `docs/terrain-and-biomes.md` и `docs/map-rendering.md`.

## 0. Перед началом

- Стиль: двойные кавычки, без `;`. Вся случайность идёт только через переданный `rng: Rng` (`core/rng`): `rng.int`, `rng.pick`, `rng.weighted`, `rng.fork("метка")`. `Math.random` и `Date` в `core/` запрещены.
- Карта боя целиком лежит в сейве (`pendingBattle.map`, `battle.map`). Поэтому изменения генератора не ломают уже начатые бои, но меняют карты будущих seed.

## 1. Раскладка

1. Добавь id в union `MapLayout` в `src/game/core/types.ts`.
2. Добавь тот же id в `layout: z.enum([...])` схемы `mapSchema` в `src/game/core/save/index.ts`. Это только расширение, `SAVE_VERSION` поднимать не нужно. Подъём и миграция нужны при переименовании или удалении id.
3. В `src/game/core/map/layouts.ts` опиши раскладку:
   ```ts
   const crossroads: LayoutDef = {
     id: 'crossroads',
     maxBlocked: TERRAIN_SHARE.maxBlocked, // предел непроходимых для пехоты клеток
     // needsWater: true,                   // если нужна сплошная вода (не выпадет в биомах с «лужами»)
     build(d, rng, env) {
       const y = rng.int(3, 4);
       carvePath(d, rng, { x: 0, y }, { x: MAP_W - 1, y });
       mainPath(d, rng);
       groves(d, rng, 0.22 + env.forestBias);
     },
   };
   ```
   Затем добавь её в `LAYOUTS`.
   - Пользуйся готовыми примитивами файла: `carvePath`, `mainPath`, `groves`, `setT`/`getT`, `free`, `around`, `allCells`. Изучи, как устроены соседние раскладки.
   - **Не трогай клетки `d.reserved`**: это зоны расстановки игрока и врагов.
   - Держи число непроходимых клеток (стены, горы, вода) в пределах `maxBlocked`. Иначе `validate` отбракует карту.
   - **Никогда не вызывай `rng.pick` на массиве, который может оказаться пустым**: `pick` бросает исключение. Сначала проверь длину. Известный баг: `groves` падает на редких seed именно так, и чаще всего на `fort`.
   - Тропинки и мосты задаются через `d.decor` (`"path"` / `"bridge"`), а рисуются автотайлами сами.
4. Пропиши вес раскладки в `LAYOUT_WEIGHTS`: в `default` и в тех биомах, где она уместна. Тест требует, чтобы в каждом биоме было не меньше 3 разных раскладок.
5. i18n и новый арт не нужны: у раскладки нет имени для игрока.

## 2. Тесты

В `tests/game/mapgen.test.ts`:

- Общие инварианты (детерминизм, достижимость, доля непроходимого, раскладки по биомам) проверяются автоматически.
- **Добавь тест формы** новой раскладки по образцу «переправа» или «опушка»: найди seed, на которых выпадает твоя раскладка (`m.layout === "<id>"`), и проверь её характерные признаки.
- Прогони генерацию на большом числе seed во всех биомах и проверь, что она не бросает исключений. Property-тест на 200 прогонов редкие падения не ловит. Пример одноразовой проверки (в scratchpad или временным тестом):
  ```ts
  for (const biomeId of BIOMES.map((b) => b.id))
    for (let seed = 0; seed < 5000; seed++)
      generateMap({ seed, biomeId, difficulty: 'normal', team: 0, squadSize: 4 });
  ```

Затем:

```bash
pnpm vitest run tests/game/mapgen.test.ts tests/game/pathing.test.ts tests/game/terrain.test.ts
pnpm typecheck && pnpm lint && pnpm test
```

## 3. Визуальная проверка

1. Запусти `pnpm dev` и открой консоль на `http://localhost:5173/`.
2. Найди seed с нужной раскладкой и подложи карту в сейв:
   ```js
   const { generateMap } = await import('/src/game/core/map/generate.ts');
   let seed = 0,
     map;
   do map = generateMap({ seed: ++seed, biomeId: 'yard', difficulty: 'normal', team: 0, squadSize: 4 });
   while (map.layout !== '<id>');
   const s = __pf.save.get();
   __pf.save.set({ ...s, pendingBattle: { seed, difficulty: 'normal', biomeId: map.biomeId, team: 0, map } });
   location.hash = '#/battle/squad';
   ```
   Сверь поля `pendingBattle` с текущим типом в `core/types.ts`.
3. Проверь карту на узком (телефон) и широком экране.

## 4. Новый тип местности (если раскладке он нужен)

1. Добавь id в `TerrainId` (`core/types.ts`) и в `const terrain = z.enum` (`core/save/index.ts`).
2. Стоимость движения: `moveCost` (`core/map/pathing.ts`) и `blocksFoot`.
3. Бой:
   - бонусы в `TERRAIN_BONUS` или в `core/combat/index.ts`;
   - веса ИИ в `core/ai/index.ts`;
   - автовыбор клетки в `state/battleUi.ts`.
4. Контент:
   - `ICON` в `content/terrain.ts`;
   - `terrainNames` (`tr`) и `colors` во **всех** биомах `content/biomes.ts`.
5. Арт:
   - ветка в `tileSvg` (`art/tile.ts`), `TILE_VARIANTS` и `TILE_FRAME_COUNT`, `isTallTerrain`;
   - `TERRAINS` в `scene/svgTextures.ts`;
   - `TERRAIN_GLYPH`;
   - `prop()` в `art/backdrop.ts`;
   - `ui/components/ClassInfo.tsx`.
6. Тесты: `pathing`, `terrain`, `mapgen`.

## 5. Новый биом

1. Заведи фракцию врагов в `content/factions.ts` (см. скил `add-character`, раздел C).
2. Добавь запись в `BIOMES` (`content/biomes.ts`): `id`, `name` и `terrainNames` через `tr`, `colors`, `weather`, `bias`, `bg`, `factionId`. Если вода в биоме заливает клетку целиком, добавь id в `waterFillsTile`.
3. Добавь строку в `LAYOUT_WEIGHTS` (минимум 3 раскладки).
4. Арт:
   - ветки по биому в `art/tile.ts` и `PATH_STYLE`;
   - `art/backdrop.ts`;
   - `AMBIENT` (`scene/ambient.ts`);
   - `BIOME_ICON`;
   - по желанию `SNOWY` и `SANDY`.
5. Сейв: `biomeId` хранится строкой. Удалять или переименовывать биом нельзя без миграции: `biomeDef` бросает исключение на неизвестный id.
6. Биом начнёт выпадать автоматически через `biomeId: "random"`.

## 6. Документация

Обнови таблицу раскладок в `docs/maps.md`, а при новых террейне или биоме — `docs/terrain-and-biomes.md`. См. скил `update-docs`.
