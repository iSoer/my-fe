# Рендер и эффекты

Бой рисует Phaser 3: сцены `MapScene` (поле) и `CinematicScene` (крупный план дуэли). `GamePresenter` по очереди проигрывает `BattleEvent[]` из редьюсера и логики не содержит. Эффекты процедурные: текстуры генерируются в рантайме, звук синтезируется на Web Audio без файлов.

## Монтирование

- [BattleScreen.tsx](../src/game/ui/screens/BattleScreen.tsx) загружает `import("@game/scene/index")` и вызывает `mountBattleGame(el)`, затем `enterBattleScreen()`. При размонтировании сначала вызывается `leaveBattleScreen()` (циклы контроллера боя прерываются, см. [ui-and-routing.md](ui-and-routing.md)), затем `handle.destroy()`: `setPresenter(null)` и `game.destroy(true)`.
- [scene/index.ts](../src/game/scene/index.ts) создаёт `Phaser.Game` с `Scale.RESIZE`, сценами `[MapScene, CinematicScene]` и `audio.noAudio`, потому что звук свой. Затем `new GamePresenter(game)` и `setPresenter`.
- `MapScene` ([MapScene.ts](../src/game/scene/MapScene.ts)) подписывается на `$save`, `$battleUi`, `$boardZoom`, `$boardInsets` и вешает `pointerdown` на canvas. Всё снимается в `cleanup` по событиям `SHUTDOWN` и `DESTROY`. Ввод передаётся в `tapTile`, `beginDrag`, `dragHover`, `endDrag`. Геометрия поля публикуется в `$boardLayout`.
- Поселение — отдельная Phaser-игра в [scene/settlement](../src/game/scene/settlement), её монтирует `SettlementScreen`.

## Проигрывание событий (`GamePresenter.play`)

[scene/presenter.ts](../src/game/scene/presenter.ts):

1. Ждёт `map.ready`, но не дольше 1500 мс.
2. Если все события фазы врага — `waited`, сразу делает `syncFromState(after)`.
3. `map.beginPlayback()` и `syncFromState(before, skip)`. В фазе врага камера наезжает на того, кто ходит (`focusOn`, `flashActor`).
4. События обрабатываются по очереди через `await this.handle(ev)`:

| Событие                                                                               | Что происходит                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `moved`                                                                               | Пробежка по пути, `stepFx`, звуки шагов                                                                                                                                                                                                                 |
| `combat`                                                                              | Заранее растеризуются части тела тех, кто погибнет (`preloadDeathParts`). Дальше `useCinematic` решает: `runCinematic` (запуск `CinematicScene`) или `quickStrike` на карте с `playQuickAttackFx`, `hitGore`, `bigNumber`, `strikeHaptic` и `strikeSfx` |
| `died`                                                                                | `pickDeathVariant`, затем `playDeathMap`, `ghostRise`                                                                                                                                                                                                   |
| `effect`                                                                              | Лечение, урон, бафф, дебафф, флаг                                                                                                                                                                                                                       |
| `assist`                                                                              | Танец, лечение, перемещение                                                                                                                                                                                                                             |
| `wallHit`                                                                             | Удар по хлипкой стене                                                                                                                                                                                                                                   |
| `phaseChanged`, `reinforcements` (`portalSpawn`), `levelUp`, `rankUp`, `xp`           | Соответствующие эффекты                                                                                                                                                                                                                                 |
| `keyTaken`/`keyDropped`, `chestOpened`, `pickup`/`pickupDropped`, `extracted`, `loot` | Эффекты вылазки                                                                                                                                                                                                                                         |
| `battleEnded`                                                                         | Баннер, звук, вибрация                                                                                                                                                                                                                                  |

5. В `finally` выполняется `syncFromState(after)` и `map.playing = false`.

Скорость: `settings.animSpeed` × 3 при `$battleUi.fastForward`. Все длительности делятся на неё.

`CinematicScene` ([CinematicScene.ts](../src/game/scene/CinematicScene.ts)) запускается через `scene.launch(CINEMATIC_SCENE_KEY, { event, before, after, speed, resolve })`. Тап ускоряет время в 40 раз (`skip`). В `finish()` вызывается `scene.stop()`, а уборка (таймеры моргания, погода, `skip`) и `resolve()` выполняются в `onEnd`. `onEnd` висит и на `SHUTDOWN`/`DESTROY` сцены, поэтому презентер отпускается, даже если кинематику остановили снаружи или `run()` упал. `resolve` вызывается один раз (флаг `settled`). `runCinematic` дополнительно отпускает ожидание, если до запуска кинематики остановили `MapScene`. Режим кинематика задаёт настройка `settings.cinematic`: `always`, `mine` или `never`.

## Модули эффектов

| Модуль                                                 | Содержимое                                                                                                                                                                                                                    |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [fx.ts](../src/game/scene/fx.ts)                       | Базовые примитивы: `sceneAlive`, `onSceneEnd(scene, cb)`, промисы `wait(scene, ms)` и `tween(scene, cfg)`, `floatText`, `banner`, `stamp`, `ghostRise`, `healSparkles`, `confettiRain`, `debrisBurst` и др.                                            |
| [attackFx.ts](../src/game/scene/attackFx.ts)           | Атаки по виду оружия: `playAttackFx` (кинематик), `playQuickAttackFx` (карта), `impactFeel`, `zoomPunch`, `shakePx`, `weaponLookOfUnit`, `magicElement`                                                                       |
| [motionFx.ts](../src/game/scene/motionFx.ts)           | Движение и действия: текстуры `MTEX`, `stepFx`, следы оружия, снаряды, `hitStop`, `afterImages`, `healPillar`, `buffRunes`, `danceFx`, `levelUpFx`, `portalSpawn`, `specialCutIn`, `bigNumber`, `shakeCam`, `reducedMotion()` |
| [epicFx.ts](../src/game/scene/epicFx.ts)               | Зрелищные приёмы: `fireball`, `lightningStrike`, `holyPillar`, `specialAura`, `finisherBurst`                                                                                                                                 |
| [gore.ts](../src/game/scene/gore.ts)                   | Кровь «cute & gory»: `ensureGoreTextures`, `hitGore`, `bloodFountain`, `bloodTrail`, `screenBloodSplat`, `groundStain`, бюджет частиц. Уровень задаёт `settings.blood` (`sea`/`pools`, `goreEnabled`)                         |
| [deathVariants.ts](../src/game/scene/deathVariants.ts) | Без Phaser, покрыт тестами: `DeathVariant` (21 вариант), детерминированный выбор `deathSeed(unitId, turn)` и `pickDeathVariant`, чтобы карта и кинематик показывали одно и то же                                              |
| [deathFx.ts](../src/game/scene/deathFx.ts)             | Анимации гибели: `preloadDeathParts`, `playDeathMap`, `playDeathCine`                                                                                                                                                         |

Ещё в каталоге: `UnitView.ts` (вид юнита), `svgTextures.ts`/`textures.ts` (растеризация процедурного SVG-арта из [src/game/art](../src/game/art)), `env.ts`, `ambient.ts`, `weather.ts`, `layout.ts`, `style.ts`.

## Звук и вибрация

- [platform/audio.ts](../src/game/platform/audio.ts) — 8-битный синтез. `AudioContext` создаётся по первому жесту (`unlock`, слушатели `pointerdown`/`keydown`/`touchend`), до этого вызовы молчат. При скрытии страницы контекст приостанавливается. API: `initAudio`, `setAudioVolumes`, `sfx(kind: SfxKind)`, `swingSfx`, `strikeSfx`, `deathSfx`, `playMusic("main" | "battle")`, `stopMusic`.
- [platform/haptics.ts](../src/game/platform/haptics.ts) — `haptic(kind)`: сначала `gameHost().haptic` (Telegram `tgHaptic`), иначе `navigator.vibrate(PATTERNS[kind])`. Отключается через `setHapticsEnabled`.

## Известные особенности

- Промисы `wait` и `tween` из `fx.ts` разрешаются и при остановке или уничтожении сцены (`onSceneEnd` слушает `SHUTDOWN`/`DESTROY`), а `tween` — ещё и по `onStop`. Так же устроены `MapScene.focusOn` и ожидание кинематики в `runCinematic`. Свои промисы в эффектах заводите через `wait`/`tween` или `onSceneEnd`, иначе `await` повиснет при уходе с экрана.
- Даже если Phaser не дошёл до `SHUTDOWN` (например, кадр не наступил во фоновой вкладке), контроллер боя не висит: `leaveBattleScreen` и `setPresenter(null)` отпускают ожидание `presenter.play` сами.

## Где менять

- Как проигрывается событие: `GamePresenter.handle` в [presenter.ts](../src/game/scene/presenter.ts). Новый тип события начинается в `core/types.ts`, затем отражается здесь.
- Эффекты: модули из таблицы выше. Длительности делите на `speed`, объекты убирайте сами.
- Звук: [platform/audio.ts](../src/game/platform/audio.ts), привязка к экранам — [state/sound.ts](../src/game/state/sound.ts).
- Конфигурация Phaser: [scene/index.ts](../src/game/scene/index.ts).
