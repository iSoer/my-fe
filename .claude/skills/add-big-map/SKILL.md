---
name: add-big-map
description: Рецепт добавления нового варианта большой карты — формы вылазки «Мрачная чаща» (поле 30×30, generateExpedition) или целого нового режима большой карты в меню вылазки (BattleMode). Использовать, когда просят новую большую карту, вариант чащи, экспедиции, новый режим вылазки, сундуки, бонусы или выходы большой карты.
---

# Новый вариант большой карты (вылазка, 30×30)

Большая карта — это одно тактическое поле режима `mode: "expedition"` («Мрачная чаща»), а не карта мира из узлов. Его строит `generateExpedition` (`src/game/core/map/expedition.ts`) с размерами `EXPEDITION.w × EXPEDITION.h` (30×30, `src/game/content/balance.ts`).

Схема сейчас одна и захардкожена, «как в Dota»:

- старт в левом нижнем углу, три выхода в остальных углах (главный — правый верхний);
- три дороги и ручей с мостами и бродами;
- лагеря стражей с сундуками, ключ у одного из стражей;
- элитные одиночки, сердечки, стражи выходов.

Каждая попытка `terrainAttempt` проверяется на связность. Если за 30 попыток связная карта не сложилась, срабатывает запасной вариант: голая поляна.

Подробности в `docs/expedition.md`, `docs/maps.md`, `docs/map-rendering.md`.

Режим выбирается на `#/battle/setup` (`MODES` в `BattleSetupScreen.tsx`, карточки друг под другом), сложность — на `#/battle/difficulty` (`DifficultyScreen`). Дальше путь общий:

1. `enemyTeams(difficulty, mode)` в `src/game/state/save.ts` генерирует карты;
2. `scoutBattle`;
3. `pendingBattle`;
4. `startBattle`.

## 0. Перед началом

- Стиль: двойные кавычки, без `;`. Случайность берётся только из `Rng`.
- **Не сдвигай существующие форки `rng`**. Для нового выбора заводи новую метку, например `root.fork("shape")`. Тогда карты прежних seed и тесты, привязанные к seed, не изменятся.
- Карта целиком хранится в сейве, поэтому изменения генератора не ломают начатые бои.

## Вариант A. Новая форма чащи внутри режима `expedition`

1. Опиши параметры формы в `EXPEDITION` (`content/balance.ts`): размеры, число дорог, долю препятствий и т. п. Не захардкоживай их в генераторе.
2. Заведи тип формы, например `type ExpeditionShape = "dota" | "<new>"`, в `core/types.ts` или локально в `expedition.ts`.
3. В `generateExpedition` выбери форму через `root.fork("shape")` (или прими её через `GenerateExpeditionOptions.shape`).
4. Положение старта, выходов и `spawnOrder` сейчас вычисляется прямо в `generateExpedition`. Вынеси его в описание формы.
5. Ветвь `terrainAttempt` по форме. Обязательно сохрани проверку достижимости (`reach`) для выходов, лагерей и спавнов. Возвращай `null` при неудаче, чтобы сработала следующая попытка.
6. Запасной вариант (`fallback`) тоже должен работать для новой формы. Сейчас он не проверяет связность, а `pickCamps` может вернуть `[]`: тогда сундуков нет и победить через `extract` нельзя. Проверь, что он даёт хотя бы один лагерь.
7. `river()` рассчитан только на квадратное поле. Для неквадратной формы его нужно переписать.
8. Если форму нужно показывать игроку (имя в бою, иконка), сохрани её в `MapDef.expedition` (тип `ExpeditionDef`) и в схеме сейва `expedition` (`core/save/index.ts`) как `.optional()`. `SAVE_VERSION` поднимать не нужно, пока поле необязательное.

## Вариант B. Новый режим большой карты в меню

1. Добавь значение в `BattleMode = "skirmish" | "expedition"` (`core/types.ts`) и в `mode: z.enum([...])` в `core/save/index.ts`. Это расширение схемы, подъём версии не нужен.
2. В `MODES` (`ui/screens/BattleSetupScreen.tsx`) добавь `{ id, icon, name: () => tr(...), desc: () => tr(...) }`.
3. В `enemyTeams` (`state/save.ts`) добавь ветку генерации и **свою метку форка**, по образцу `":expedition"` у seed команды.
4. Найди все места, где проверяется режим, и реши, как себя вести в каждом:
   ```bash
   grep -rn 'mode === "expedition"\|"expedition"' src/game
   ```
   Известные места:
   - `turnLimitOf` (`balance.ts`, в чаще лимита нет);
   - разведка: `createBattle`/`endPhase` (`state.expedition` → `isCalm`/`enterExplore`) в `reducer.ts`, зоны тревоги в `core/battle/explore.ts`;
   - `BattleBar.tsx` (`big`);
   - `BattleSetupScreen.tsx`;
   - `MapScene.ts` (`relayout`, камера и прокрутка большого поля, `EXPEDITION_GLOOM`);
   - `enemyTeams`.
5. Если нужны новые сундуки или бонусы:
   - `ChestKind` или `BuffKind` в `core/types.ts`;
   - их `z.enum` в схеме сейва;
   - `CHEST_MARK` и `BUFFS` в `content/expedition.ts`, числа `BUFF` в `balance.ts`;
   - обработка подбора или эффекта в `core/battle/reducer.ts`.
6. Если в режиме свой биом, заведи его по скилу `add-small-map`, раздел 5. Сейчас чаща всегда использует `EXPEDITION_BIOME = "deep_forest"`.

## Тесты

Защитные тесты лежат в `tests/game/expedition.test.ts`:

- property «всё достижимо»;
- три выхода;
- дороги и лагеря;
- лимит ходов (в чаще — `Infinity`);
- разведка и туман войны — `tests/game/explore.test.ts`;
- скорость < 400 мс;
- автотайлы за пределами 6×8.

Что сделать:

- Повтори property-тесты для новой формы или режима.
- Добавь проверку достижимости одиночек, сердечек и стражей выходов: сейчас её нет.
- Прогони генерацию на сотнях seed для каждой сложности и проверь, что она не бросает исключений и укладывается во время.

```bash
pnpm vitest run tests/game/expedition.test.ts tests/game/mapgen.test.ts tests/game/reinforce.test.ts
pnpm typecheck && pnpm lint && pnpm test
```

## Визуальная проверка

1. Запусти `pnpm dev`.
2. Открой `#/battle/setup`, выбери режим, затем сложность и посмотри превью команд.
3. Начни бой. Проверь:
   - прокрутку и камеру большого поля на телефоне и на широком экране;
   - туман/мрак;
   - сундуки, ключ и выходы.
4. Конкретный seed можно подложить через `__pf.save` в `pendingBattle` с картой из `generateExpedition({ seed, difficulty, team: 0, squadSize: 4 })` и открыть `#/battle/squad` (см. скил `add-small-map`, раздел 3).
5. Полный цикл: `pnpm smoke` (см. `docs/testing.md`).

## Документация

Обнови `docs/expedition.md` (форма, параметры, режимы), а при изменении отрисовки — `docs/map-rendering.md`. См. скил `update-docs`.
