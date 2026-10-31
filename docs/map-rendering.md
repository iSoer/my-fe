# Отрисовка поля боя

Поле рисует Phaser-сцена `MapScene` ([scene/MapScene.ts](../src/game/scene/MapScene.ts)).

- Сцена читает `$save.battle` и `$battleUi`, раскладывает поле через `computeLayout` или `computeWorldLayout`
  ([scene/layout.ts](../src/game/scene/layout.ts)) и публикует экранную раскладку в `$boardLayout`
  ([state/boardLayout.ts](../src/game/state/boardLayout.ts)). По ней DOM-накладки HUD совмещаются с клетками.
- Тайлы — это SVG из `art/tile.ts`, растеризованные в квадратные текстуры (`ensureEnvTileTextures`): сторона — ступень 128/192/256 под клетку на экране × плотность рендера.
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
- Зум: `$boardZoom`, шаги `ZOOM_LEVELS = [0.7, 1, 1.25, 1.5]` (дальше 70 % не отдаляется), управление через
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

`syncFromState` перерисовывает поле, только если сменилась ссылка `st.map`. Редьюсер не копирует карту
(`cloneBattle`), так что в пределах боя ссылка одна и та же: поле перерисовывается только при новом бое, смене
раскладки (размер экрана, зум) и разрушении хлипкой стены. В остальных случаях обновляются стены
(`updateWalls`), декали и юниты. Для каждой клетки:

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
5. Сетка — длинными линиями по рядам и столбцам (у каждой клетки тонкий кант внутри неё), а не рамкой на
   клетку: `Graphics` перестраивает геометрию каждый кадр.
6. Рамка поля. В режиме `expedition` на всё поле накладывается оттенок `EXPEDITION_GLOOM = 0x9aa595`.

**Отсечение на большом поле** (`cullTiles`, вызывается из `update`): Phaser рисует каждый объект, даже за краем
экрана, а на поле 30×30 их больше тысячи. Видимы только объекты `tileLayer` в `worldView` камеры с запасом в две
клетки; пересчёт — когда сдвинулся вид или поле перерисовано (`cullKey`). Таймер анимации воды и пены не
переключает кадры у скрытых тайлов.
6. Фон вокруг поля, погода (`ensureWeather`) и атмосфера. `AmbientLayer` (облака-тени, лучи, лампы, светлячки,
   блики, цветокоррекция, виньетка) создаётся **только на обычном поле**.

Текстуры биома растеризуются один раз в `preloadArt`, ожидание ограничено `withTimeout` в 2500 мс. В них входят:

- все варианты и кадры 7 типов местности (`TERRAINS` из `svgTextures.ts`);
- 2 кадра пены, тень, обломки, фон;
- 16 тропинок и 2 моста;
- для чащи — `chestSvg`, `keySvg`, `heartSvg`.

Тайлы растеризуются из SVG 64×64 (`TILE_SIZE`) в квадрат `tileTexSize(scene)`. Сторону выбирает `relayout` через
`setTileTexSize(scene, tile)`: `tileTexPx(tile, плотность)` — наименьшая из `TILE_TEX_BUCKETS = [128, 192, 256]`, не
меньшая `tile × плотность × 1.25` (`TEX_HEADROOM`, запас под наезд камеры). При плотности 1 это прежние 128. Тень
(`shade`) — вдвое меньше, сундук, ключ и сердечко чащи — того же размера. Ключи тайлов размер не содержат: тайлы
растеризуются один раз на игру, а `groundBg` берёт период узора из ширины готовой текстуры.

Миниатюры бойцов: `relayout` вызывает `setUnitTexSize(scene, "map", tile × 1.05)` (высота фигуры в `UnitView`). Если
ступень сменилась (другой размер экрана), каждый `UnitView.retexture()` перепривязывает текущую позу.

## Плотность рендера и ввод

Канвас рисуется в `CSS × плотность` пикселях (`createHiDpiGame`, подробно — в
[rendering-and-fx.md](./rendering-and-fx.md#чёткость-на-экранах-с-высокой-плотностью)), а сцена живёт в CSS-единицах:

- раскладка считается от `viewW(this)`/`viewH(this)`, `$boardLayout` и `$boardInsets` — в CSS px, как и раньше;
- на обычном поле камера в покое (`restCamera`: зум = плотность, мир (0, 0) — в левом верхнем углу); зум большого поля
  `$boardZoom` и наезд перед кинематиком (1.15) задаются относительно базы (`setCssZoom`, `camZoom`), в `focusOn` и
  границах камеры — `cssZoom`;
- `p.worldX/worldY` и `getWorldPoint` Phaser пересчитывает сам; `p.x/p.y`, `downX/upX` — в пикселях буфера, поэтому
  пороги `DRAG_THRESHOLD`/`TAP_SLOP` умножаются на плотность, а сдвиг камеры при перетаскивании (`dx / cam.zoom`)
  остаётся верным без поправок;
- заставка конца боя закреплена на экране `pinToScreen`.

## Фон кинематика

`CinematicScene.drawBackdrop` берёт `backdropLayersSvg(biomeId, terrain, side)` из
[art/backdrop.ts](../src/game/art/backdrop.ts). Это 3 слоя для параллакса (`far`, `mid`, `near`) размером
200×300, где `HORIZON = 156`, `FEET = 186`. Предмет переднего плана выбирает `prop(ctx)` по местности под
бойцом: кусты, валун, лужа, стена, укрытие. `backdropTexKey` = `bd:<biome>:<terrain>:<side>:<w>x<h>`, где `w×h` — размер растра `backdropPx`: экранный размер × плотность рендера, но не больше `BACKDROP_SCALE_CAP = 1.5` (фон мягкий, а растр на весь экран дорог).

## Где менять

- Размер клетки и отступы: `LAYOUT_BIAS`, значения по умолчанию в `computeLayout` и `$boardInsets`.
- Ступени растра тайлов и миниатюр, запас под зум: [scene/renderScale.ts](../src/game/scene/renderScale.ts) (`TILE_TEX_BUCKETS`, `UNIT_TEX_BUCKETS`, `TEX_HEADROOM`).
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
