# UI и маршрутизация

Интерфейс — React 19 поверх nanostores. Маршрут берётся из `location.hash` (хеш-роутер [state/router.ts](../src/game/state/router.ts)), экран выбирает [ui/App.tsx](../src/game/ui/App.tsx). Бой управляется отдельной машиной состояний [state/battleUi.ts](../src/game/state/battleUi.ts). Для консоли и смоук-тестов есть отладочный объект `window.__pf`.

## Маршруты

Тип `Route` и функции `parseRoute(hash)`, `routePath(route)`, `navigate(path, replace?)`, `go(route, replace?)`, `back()`, `initRouter()`.

| Хеш                                              | `Route.name`   | Экран ([ui/screens](../src/game/ui/screens))              |
| ------------------------------------------------ | -------------- | --------------------------------------------------------- |
| `#/` (пусто)                                     | `menu`         | `MenuScreen`                                              |
| `#/village`                                      | `village`      | `SettlementScreen` (Phaser-поселение, ленивый чанк)       |
| `#/store`                                        | `store`        | `StoreScreen`                                             |
| `#/army`                                         | `army`         | `ArmyScreen`                                              |
| `#/army/create`                                  | `armyCreate`   | `ArmyScreen`                                              |
| `#/army/recruit`                                 | `recruit`      | `ArmyScreen`                                              |
| `#/army/<unitId>`                                | `unit`         | `UnitScreen unitId`                                       |
| `#/battle/setup`                                 | `battleSetup`  | `BattleSetupScreen` (шаг 1: режим и сложность)            |
| `#/battle/enemy/<easy\|normal\|hard\|nightmare>` | `battleEnemy`  | `EnemyTeamScreen difficulty` (из `BattleSetupScreen.tsx`) |
| `#/battle/squad`                                 | `battleSquad`  | `SquadScreen`                                             |
| `#/battle`                                       | `battle`       | `BattleScreen` (Phaser-бой, ленивый чанк)                 |
| `#/battle/result`                                | `battleResult` | `BattleResultScreen`                                      |
| `#/memorial`                                     | `memorial`     | `MemorialScreen` (Кладбище)                               |
| `#/settings`                                     | `settings`     | `SettingsScreen`                                          |
| всё прочее                                       | `notFound`     | `MenuScreen` (маршрут остаётся `notFound`)                |

Как устроено:

- Контейнер `.route` в `Router` получает `key = "<lang>:<routeKey>"`. Смена маршрута или языка пересоздаёт экран и проигрывает CSS-переход.
- Пока `$saveStatus !== "ready"` или игрок не тапнул заставку, показывается `Splash`. Тост `$saveError` сообщает, что сейв повреждён.
- Глубина истории `depth` хранится в `history.state.pfDepth` каждой записи: `navigate` без `replace` кладёт `depth + 1`, с `replace` — текущую. На `popstate`/`hashchange` `depth` берётся из записи (`syncDepth`), так что системная кнопка «назад» её корректно уменьшает; запись без метки (ссылка, ручная правка хеша) считается новым шагом. `initRouter` помечает стартовую запись.
- `back()` идёт по истории, если `depth > 0`, иначе — `go(parentRoute(текущий), true)`: с глубокого экрана, открытого по ссылке или после перезагрузки, — на родительский, а не из приложения.
- Хеш с параметрами запуска Telegram без слеша (`#tgWebAppData=…`, всё, что начинается с `tgWeb`) — это `menu`, а не `notFound`.
- Кнопка «Назад» Telegram настраивается в `syncBackButton()` ([main.tsx](../src/main.tsx)):
  - `menu` и `battleResult` — кнопка скрыта;
  - `battle` — переключает паузу `$pauseOpen`;
  - `village` — закрывает диалог (`skipDialogue`) или ведёт в меню;
  - остальные маршруты — `back()`.

## Сторы

| Стор                                                                                                                                           | Файл                                                     | Что хранит                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------- |
| `$save`, `$saveStatus`, `$saveError`                                                                                                           | [state/save.ts](../src/game/state/save.ts)               | Весь сейв, состояние загрузки, ошибка разбора |
| `$profile`, `$army`, `$battle`, `$settings`, `$shelter`, `$memorial`, `$lastBattle`, `$pendingBattle`, `$rewardChoice`, `$inventory`, `$store` | state/save.ts                                            | `computed` от `$save`                         |
| `$sortieMode`                                                                                                                                  | state/save.ts                                            | Режим вылазки `skirmish`/`expedition`         |
| `$route`                                                                                                                                       | [state/router.ts](../src/game/state/router.ts)           | Текущий `Route`                               |
| `$battleUi`                                                                                                                                    | [state/battleUi.ts](../src/game/state/battleUi.ts)       | Состояние управления в бою                    |
| `$dialogue`                                                                                                                                    | [state/dialogue.ts](../src/game/state/dialogue.ts)       | Идущий разговор с жителем                     |
| `$boardLayout`, `$boardInsets`, `$boardZoom`                                                                                                   | [state/boardLayout.ts](../src/game/state/boardLayout.ts) | Геометрия поля боя                            |
| `$settlementPanel`, `$settlementNear`                                                                                                          | [state/settlement.ts](../src/game/state/settlement.ts)   | Открытая карточка места, место рядом с героем |
| `$pauseOpen`                                                                                                                                   | [ui/lib/pause.ts](../src/game/ui/lib/pause.ts)           | Открыта ли пауза боя                          |
| `$lang`                                                                                                                                        | [i18n](../src/game/i18n/index.ts)                        | Язык, зеркало `settings.lang`                 |
| `$updateReady`, `$offlineReady`, `$installPrompt`, `$isStandalone`, `$online`                                                                  | [host/pwa.ts](../src/host/pwa.ts)                        | Состояние PWA (хост)                          |

[state/sound.ts](../src/game/state/sound.ts) (`initSound`) подписывает звук на `$settings` (громкость) и `$route` (тема музыки) и озвучивает нажатия кнопок.

## Машина состояний боя (`battleUi`)

`UiMode`: `idle`, `unitSelected`, `forecast`, `assistPreview`, `wallPreview`, `enemyInfo`, `tileInfo`, `busy`, `ended`.

```
idle ──тап по своему бойцу──▶ unitSelected ──тап по клетке──▶ moveTo (dispatch move) ──▶ unitSelected
                                │ тап по врагу / союзнику / хлипкой стене
                                ▼
                 forecast / assistPreview / wallPreview ──повторный тап или confirm()──▶ commit()
                                │ cancel()                                             │
                                ▼                                                      ▼
                           unitSelected                          busy (playEvents) ──▶ afterAction
idle ──тап по врагу──▶ enemyInfo     idle ──тап по пустой клетке──▶ tileInfo
afterAction: result → ended (+ onEnded) | idle (+ refreshDanger, autoEndTurn → endTurn)
endTurn(): dispatch endPhase → playEvents → runEnemyPhase(): цикл nextEnemyAction → dispatch → playEvents
```

- Перетаскивание: `setPressed`, `beginDrag`, `dragHover`, `endDrag`, `cancelDrag`.
- Зона опасности: `toggleDanger`, `refreshDanger`. Ускорение `setFastForward` (×3 к скорости анимаций) осталось в `battleUi`, но кнопки для него в интерфейсе нет.
- Presenter регистрируется через `setPresenter`. Колбэк конца боя — `setOnBattleEnded`: `BattleScreen` вызывает `finishBattle()` и переходит на `/battle/result`.
- `enterBattleScreen()` сбрасывает UI и начинает новый сеанс. Если загрузился бой в фазе врага, она возобновляется.
- `leaveBattleScreen()` вызывает `BattleScreen` при размонтировании (до `handle.destroy()`). Он меняет номер сеанса и отпускает все ожидания `presenter.play`. Циклы `moveTo`, `commit`, `endTurn`, `runEnemyPhase` и `retreat` после `await playEvents` видят, что сеанс сменился (`playEvents` вернул `false`), и выходят, ничего не меняя. Состояние боя при этом цело: каждое действие уже применено редьюсером и сохранено, остановилось только проигрывание. При возврате на экран `enterBattleScreen` доигрывает ход врага с того же места. `setPresenter` с другим презентером тоже отпускает ожидания старого.
- Раскладка `BattleScreen`: сверху тонкая полоса хода во всю ширину (`TopHud`: ход N/лимит, фаза, цель вылазки, добыча, биом; высота `HUD_H`), под полем — панель кнопок (`BattleBar`). Панель сведений (`BottomBand` и `ForecastCard`: боец, враг, клетка, прогноз) открывается от верха экрана поверх полосы хода (полоса прячется через `.bf-overlay:has(.bf-info > *)`) и заканчивается над полем. Панель отступает от верха на 12px. Прокрутки у неё нет: карточки рассчитаны на эту высоту, а на низкой панели (`.bf-info.compact`, ниже `INFO_COMPACT`) карточка бойца плотнее — без строки роли и подписи про зону угрозы. Карточка бойца (`UnitCard`) всегда развёрнута; аватар в полный рост на всю высоту карточки, центр — на её левом краю (видна правая половина бойца, левая обрезана); в статах название сверху, значение под ним; под статами одним рядом — спецприём и сроки временных изменений статов (сами изменения видны цветом на плашках статов). Бонус клетки под бойцом — отдельной тонкой полосой `.bf-terrain` под карточкой. В полосе хода добыча за бой — «Собрано: N 🦴» (сколько из неё достанется при поражении и отступлении — в подсказке). Отступ поля сверху — `HUD_H + INFO_MIN`.
- `runEnemyPhase` ограничен предохранителем `100 + units * 3` итераций. Когда он срабатывает, фаза врага завершается принудительно (`endPhase`), и ход переходит к игроку. Шаг ИИ не бросает исключений: упавшее действие заменяется на `wait` тем же врагом, затем на `endPhase`. Если не сработало и это, показывается тост «Ход врага застрял», а UI возвращается в `idle`.
- `retreat()` и `endTurn()` ничего не делают, пока `ui.busy` (идёт ход врага или анимация). Кнопка «Отступить» в `PauseModal` в это время неактивна.

## `window.__pf`

Создаётся в `useEffect` [GameRoot.tsx](../src/game/GameRoot.tsx). Он доступен и в продакшене: игра одиночная, секретов в нём нет.

| Путь                                                                        | Значение                                                                                                      |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `save`                                                                      | `$save` (`get`/`set`)                                                                                         |
| `ui`                                                                        | `$battleUi`                                                                                                   |
| `layout`                                                                    | `$boardLayout`                                                                                                |
| `battle.tapTile(pos)`, `battle.confirm()`, `battle.endTurn()`               | Действия игрока в бою                                                                                         |
| `settlement.panel`, `settlement.near`                                       | `$settlementPanel`, `$settlementNear`                                                                         |
| `settlement.teleport(id)`, `settlement.walkTo(id)`                          | Через `settlementControl()` сцены поселения                                                                   |
| `settlement.open`, `build`, `upgrade`, `train`, `collect`, `revive`, `tick` | `openPanel`, `buildAction`, `upgradeAction`, `trainAction`, `collectAction`, `reviveAction`, `tickSettlement` |

Им пользуются [tools/smoke.mjs](../tools/smoke.mjs), [smoke-telegram.mjs](../tools/smoke-telegram.mjs) и [smoke-pwa.mjs](../tools/smoke-pwa.mjs). Если переименовываете действие, обновите и `__pf`, и смоуки.

## Как добавить маршрут или экран (рецепт)

1. В [state/router.ts](../src/game/state/router.ts):
   - добавьте вариант в union `Route`;
   - разберите хеш в `parseRoute`, до финального `notFound`;
   - добавьте `case` в `routePath`. Switch исчерпывающий, без него не пройдёт typecheck;
   - при необходимости добавьте `case` в `parentRoute`.
2. Создайте экран `src/game/ui/screens/<Name>Screen.tsx` (тексты через `tr()`).
3. В [ui/App.tsx](../src/game/ui/App.tsx) импортируйте экран и добавьте `case` в `Screen`. Если у маршрута есть параметр, учтите его в `routeKey`, чтобы экран пересоздавался при смене параметра.
4. Ведите на экран через `navigate("/path")` или `go({ name })`.
5. Кнопка «Назад» Telegram: если поведение отличается от `back()` (скрыть, закрыть оверлей), добавьте ветку в `syncBackButton` в [src/main.tsx](../src/main.tsx). Если экран — это бой или итоги, проверьте ещё `NO_RELOAD_ROUTES` в [host/PwaBanners.tsx](../src/host/PwaBanners.tsx) и музыку в [state/sound.ts](../src/game/state/sound.ts).
6. Если смоуки будут управлять экраном напрямую, добавьте действия в `window.__pf` ([GameRoot.tsx](../src/game/GameRoot.tsx)).
7. Тест разбора в [tests/game/router.test.ts](../tests/game/router.test.ts): `parseRoute(routePath(r))` возвращает `r`, неверный параметр даёт не этот экран.
8. `pnpm typecheck && pnpm test && pnpm lint`. При желании — `pnpm smoke` и `pnpm smoke:tg`.

## Где менять

- Маршруты: [state/router.ts](../src/game/state/router.ts), [ui/App.tsx](../src/game/ui/App.tsx).
- Кнопка «Назад» и подтверждение закрытия Telegram: `syncBackButton` и подписка на `$battle` в [main.tsx](../src/main.tsx).
- Управление боем: [state/battleUi.ts](../src/game/state/battleUi.ts). Тесты — [tests/game/battleUi.test.ts](../tests/game/battleUi.test.ts).
- Отладочный API: [GameRoot.tsx](../src/game/GameRoot.tsx).

## Иконки вместо эмодзи

- Все эмодзи в интерфейсе и на канвасе рисуются иконками-штампами из [art/icons.ts](../src/game/art/icons.ts): белый силуэт, чернильный контур, жёсткая красная тень и наклон −10°, как у кнопок меню. У иконки задана только геометрия (силуэт `b` и линии `d` в поле 64×64), тень, контур и заливку добавляет `iconSvg`.
- Тона: `light` (белая заливка, для тёмного фона) и `dark` (чернильная заливка и белые линии деталей, для светлого). Контур чернильный в обоих.
- Эмодзи остаются в данных и строках: они ключ иконки (`EMOJI_ICON`, `iconOfEmoji`) и запасной текст для тостов, `aria-label` и тестов.
- Интерфейс: [components/Icon.tsx](../src/game/ui/components/Icon.tsx) — `<Icon emoji="🦴" />` и `<IconText text={…} />` (меняет все известные эмодзи в строке). Уже подключено в `Button` (`icon`), тосте, заголовках шторок и модалок. Размер — 1.25em от шрифта. Везде в игре светлый тон; цвета — CSS-переменные `--ic-fill`, `--ic-line`, `--ic-det`, `--ic-sh` в `styles.css` (их переопределение на контейнере включает другой тон).
- Phaser: [scene/iconText.ts](../src/game/scene/iconText.ts) — `richText` (надпись «текст + иконки», ею пользуются `floatText` и вывески поселения) и `iconImage`. Текстуры `ic:<id>:<тон>`: `MAP_ICONS` предзагружаются в бою и кинематике, `SIGN_ICONS` — в поселении (тоже светлый тон), остальные по требованию (до загрузки виден эмодзи).
- Символы шрифта (★ ♥ ♪ ♫ ♣ ✦ ✓ ✕) остаются текстом.
- Новый эмодзи: добавьте геометрию в `ICONS` и строку в `EMOJI_ICON`. Тест [icons.test.ts](../tests/game/icons.test.ts) падает, если в коде есть эмодзи без иконки.
- `Modal` (и `ConfirmModal`) рендерится порталом в корень `.pawfield`: у шторки `.sheet` есть `transform`, и fixed-окно внутри неё оказалось бы под её затемнением.
