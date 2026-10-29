# Отрисовка поля боя

Поле рисует Phaser-сцена `MapScene` ([scene/MapScene.ts](../src/game/scene/MapScene.ts)).

- Сцена читает `$save.battle` и `$battleUi`, раскладывает поле через `computeLayout` или `computeWorldLayout`
  ([scene/layout.ts](../src/game/scene/layout.ts)) и публикует экранную раскладку в `$boardLayout`
  ([state/boardLayout.ts](../src/game/state/boardLayout.ts)). По ней DOM-накладки HUD совмещаются с клетками.
- Тайлы — это SVG из `art/tile.ts`, растеризованные в текстуры 128×128 (`ensureEnvTileTextures`).
- Своей логики у сцены нет. События боя проигрывает `GamePresenter` ([scene/presenter.ts](../src/game/scene/presenter.ts)).

## Раскладка и масштаб

`computeLayout(width, height, insets = { top: 84, bottom: 150 })`:

- Свободная высота: `avail = height − top − bottom`.
- Если `avail / 8 < LAYOUT_BIAS.minTile` (36 px), отступы пропорционально ужимаются.
- `tile = max(12, floor(min(width / 6, avail / 8)))`.
- По горизонтали поле стоит по центру. По вертикали оно прижато к нижней панели (`LAYOUT_BIAS.ratio = 1`):
  лишняя высота уходит панели сведений сверху.
- Расчёт всегда идёт от `MAP_W × MAP_H` (6×8), даже на большом поле.

`computeWorldLayout(...)` для чащи:

- Клетка того же размера, что и в обычном бою (6 колонок на ширину экрана).
- `world = { ...screen, ox: 0, oy: 0, cols: board.w, rows: board.h }`: поле живёт в мировых координатах.
- Камера двигается по полю (`setupCamera`, `updateBounds`), границы — поле плюс отступы под шапку и панель.
- Зум: `$boardZoom`, шаги `ZOOM_LEVELS = [0.25, 0.35, 0.5, 0.7, 1, 1.25, 1.5]`, управление через
  `zoomBoard(±1)`, колесо мыши или кнопки HUD.
- При входе в бой камера встаёт на первого живого бойца игрока.

`$boardInsets` выставляет `BattleScreen` (`setBoardInsets`) по реальной высоте шапки и нижней карточки.
`MapScene` подписан на это значение и пересчитывает раскладку.

`publishBoardLayout({ tile, ox, oy, width, height })` публикует **экранную** раскладку (на большом поле — как у
обычного) и не меняет значение, если оно совпадает. `tileCenterPx` переводит клетку в CSS-пиксели для DOM.
Хелперы `tileCenter`, `tileOrigin`, `pixelToGrid` работают в координатах сцены; на большом поле
указатель сначала переводится через `worldAt`.

## Слои (depth)

| depth       | Что                                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------------------- |
| −2          | `groundBg`: бесшовная земля биома (`groundKey`) под полем, затемнённая; на большом поле занимает весь мир |
| −1          | тень под доской (`AmbientLayer`)                                                                          |
| 0           | `tileLayer`: тайлы, накладки тропинок и мостов, пена у берега, тени, обломки                              |
| 0.2         | `tilesG`: цветные плейсхолдеры (если текстуры нет) и сетка с рамкой                                       |
| 0.5–0.6     | глифы плейсхолдеров (`TERRAIN_GLYPH`), HP хлипких стен                                                    |
| 1           | декали (кровь)                                                                                            |
| 1.6         | `expLayer`: выходы, сундуки, ключи, сердечки и бонусы чащи                                                |
| 1.8–1.85    | зона опасности и угрозы                                                                                   |
| 2–3         | подсветка хода, стрелка пути                                                                              |
| 4           | погода (`WeatherLayer`)                                                                                   |
| 10 + y·0.01 | бойцы (`UnitView`)                                                                                        |
| 11          | метки целей                                                                                               |

## Как рисуются клетки (`drawTiles`)

`syncFromState` перерисовывает поле, только если сменилась ссылка `st.map`. В остальных случаях обновляются
стены (`updateWalls`), декали и юниты. Для каждой клетки:

1. Определяется вид клетки: `look` = `terrainAt`, а клетка моста (`decor = "bridge"`) рисуется как `water`.
   Вариант: `tileVariantAt(look, x, y, seed)`. Это детерминированный хеш координат и seed по числу
   `TILE_VARIANTS` (plain 3; forest, mountain, cover, wall, wall_breakable по 2).
2. Текстура: `envTileKey(biome, look, frame, variant)` = `tilev:<biome>:<terrain>:<frame>:<variant>`.
   - Кусты (и ели `winter_park`) качаются твином. На большом поле качание выключено ради производительности.
   - Вода (4 кадра) и листва (2 кадра) анимируются таймером `startTileAnimations` с шагом 110 мс.
3. Накладки:
   - тропинка: `pathKey(biome, decorMask(decor, pos, size))`, 16 автотайлов по маске соседей N=1, E=2, S=4, W=8.
     Тупик у края поля продолжается за край;
   - мост: `bridgeKey(biome, bridgeVertical(...))`;
   - обломки сломанной хлипкой стены: `edgeKey(biome, "rubble")`;
   - пена у сплошной воды (`waterFillsTile`): `edgeKey(biome, "shore", f)`, 2 кадра;
   - тень от высокого соседа сверху или слева: `edgeKey(biome, "shade")`, `isTallTerrain`.
4. Если текстуры нет, рисуется заливка `biome.colors[terrain]` и глиф `TERRAIN_GLYPH`.
5. Рамка поля. В режиме `expedition` на всё поле накладывается оттенок `EXPEDITION_GLOOM = 0x9aa595`.
6. Фон вокруг поля, погода (`ensureWeather`) и атмосфера. `AmbientLayer` (облака-тени, лучи, лампы, светлячки,
   блики, цветокоррекция, виньетка) создаётся **только на обычном поле**.

Текстуры биома растеризуются один раз в `preloadArt`, ожидание ограничено `withTimeout` в 2500 мс. В них входят:

- все варианты и кадры 7 типов местности (`TERRAINS` из `svgTextures.ts`);
- 2 кадра пены, тень, обломки, фон;
- 16 тропинок и 2 моста;
- для чащи — `chestSvg`, `keySvg`, `heartSvg`.

Тайлы растеризуются из SVG 64×64 (`TILE_SIZE`) в 128×128 (`TILE_TEX_PX`).

## Фон кинематика

`CinematicScene.drawBackdrop` берёт `backdropLayersSvg(biomeId, terrain, side)` из
[art/backdrop.ts](../src/game/art/backdrop.ts). Это 3 слоя для параллакса (`far`, `mid`, `near`) размером
200×300, где `HORIZON = 156`, `FEET = 186`. Предмет переднего плана выбирает `prop(ctx)` по местности под
бойцом: кусты, валун, лужа, стена, укрытие. `backdropTexKey` = `bd:<biome>:<terrain>:<side>:<w>x<h>`.

## Где менять

- Размер клетки и отступы: `LAYOUT_BIAS`, значения по умолчанию в `computeLayout` и `$boardInsets`.
- Зум большого поля: `ZOOM_LEVELS` в [state/boardLayout.ts](../src/game/state/boardLayout.ts).
- Новая накладка поверх клетки: ключ в [scene/env.ts](../src/game/scene/env.ts) (`*Key`), растеризация в
  `ensureEnvTileTextures`, SVG в [art/tile.ts](../src/game/art/tile.ts), вывод в `MapScene.drawTiles`.
- Число вариантов и кадров тайла: `TILE_VARIANTS` и `TILE_FRAME_COUNT` в `art/tile.ts`. Последовательности кадров:
  `WATER_SEQ` и `FOREST_SEQ` в `MapScene.startTileAnimations`.
- Атмосфера биома: `AMBIENT` в [scene/ambient.ts](../src/game/scene/ambient.ts). Погода: `BiomeDef.weather`
  и [scene/weather.ts](../src/game/scene/weather.ts).
- Арт чащи: [art/expedition.ts](../src/game/art/expedition.ts), разметка в `MapScene.syncExpedition`.
- Визуальная проверка:
  - `pnpm dev`, галерея `http://localhost:5173/tools/gallery/index.html`. В ней только базовый тайл
    (`tileSvg(b, t)`, вариант 0) и фон кинематика каждого биома, без тропинок, мостов и вариантов;
  - в бою: `__pf.layout.get()` (раскладка), `__pf.battle.tapTile({x,y})`.
