# Бой: редьюсер, состояние, ход

Бой — чистый детерминированный редьюсер: `BattleState` + `BattleAction` → новый `BattleState` и список `BattleEvent`, которые сцена Phaser только проигрывает. Здесь описаны состояние, действия, события, порядок фаз, условия победы и поражения, подкрепления и вылазка в чащу.

## Файлы

| Файл                                             | Что внутри                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| [reducer.ts](../src/game/core/battle/reducer.ts) | `createBattle`, `applyAction`, `forecast`, опыт (`xpForCombat`, `xpForHeal`), `unitStatsInBattle` |
| [assist.ts](../src/game/core/battle/assist.ts)   | `planAssist`, `assistTargetsFrom`: расчёт Поддержки без мутаций                                   |
| [query.ts](../src/game/core/battle/query.ts)     | `unitAt`, `livingUnits`, `alliesWithin`, `foesWithin`, `unitsWithinOf`, `terrainAt`, `hpPct`      |
| [buffs.ts](../src/game/core/battle/buffs.ts)     | бонусы вылазки: `hasBuff`, `buffDamageMult`, `buffMoveBonus`, `buffLootMult`                      |
| [drink.ts](../src/game/core/battle/drink.ts)     | напиток из бара: `drinkBonusOf`, `drinkBonus`                                                     |
| [types.ts](../src/game/core/types.ts)            | `BattleState`, `BattleUnit`, `BattleAction`, `BattleEvent`, `Effect`, `Strike`, `MapDef`          |
| [pathing.ts](../src/game/core/map/pathing.ts)    | `reachableTiles`, `pathTo`, `targetsFrom`, `wallsFrom`, `threatTiles` (используются редьюсером)   |

Редьюсер вызывается из `dispatchBattle` в [state/save.ts](../src/game/state/save.ts). Цикл фазы врага (`runEnemyPhase`) находится в [state/battleUi.ts](../src/game/state/battleUi.ts).

## Состояние

`BattleState` ([types.ts](../src/game/core/types.ts)):

- `id`: `b_<seed36>_<now36>`, `seed`, `startedAt` берутся из `CreateBattleOptions`, поэтому внутри редьюсера нет `Date.now()`.
- `map: MapDef`: клетки `tiles`, `playerSpawns`, `enemies` (`EnemyPlacement`: позиция, стойка, `post`/`leash` у стражей), `reinforcements`, `objective`, `mode`, `expedition`.
- `turn` (с 1) и `phase: "player" | "enemy"`.
- `units: Record<id, BattleUnit>`: состояние бойца в бою. `roster: Record<id, UnitInstance>`: снимок персонажей. XP, уровни, `history` и `skillXp` меняются в `roster`, а после боя сливаются в армию.
- `walls`: HP хлипких стен по `posKey`. В `createBattle` каждая `wall_breakable` получает `BATTLE.wallHp = 2` HP. Стена с 0 HP читается в `terrainAt` как `plain`.
- `decals`: лужи крови на местах гибели.
- `stats: BattleStats`: `kills`, `damage` (урон только от бойцов игрока), `deaths`, `xpGained`, `loot`.
- `spawnedWaves`: номера ходов уже пришедших волн подкреплений.
- `result?: "victory" | "defeat" | "retreat"` и `timeUp?`.
- `expedition?: ExpeditionState` и `drink?: BattleDrink`.

`BattleUnit`:

- `hp` и `maxHp` (из `visibleStats(unit).hp`, плюс бонус напитка к HP при старте).
- `specialCd`: стартует с `specialMaxCd(unit)`, а без спецприёма равен 0.
- `acted` и `alive`.
- `bonuses` и `penalties`: временные баффы и дебаффы. Значения не складываются: берётся максимум бонуса и минимум штрафа.
- `stance: "hold" | "advance" | "guard"`, используется ИИ.
- `flags`: например, `barrier_used`.
- `turnStart?`: клетка начала хода, если боец уже переставлялся.

## Действия (`BattleAction`)

| Действие                                      | Что делает                                                                                                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `move { unitId, to }`                         | Переставляет бойца, не завершая ход. Дальность всегда считается от `moveOrigin` (`turnStart ?? pos`), поэтому переставлять можно сколько угодно раз, в том числе обратно |
| `wait { unitId, to, newStance? }`             | Ход на клетку и конец действия                                                                                                                                           |
| `attack { unitId, to, targetId, newStance? }` | Ход, затем `resolveCombat`. Цель должна быть в `targetsFrom` с клетки `to`, то есть ровно на дистанции оружия                                                            |
| `attackWall { unitId, to, wall, newStance? }` | Ход, затем −1 HP стене из `wallsFrom`                                                                                                                                    |
| `assist { unitId, to, targetId, newStance? }` | Ход, затем `planAssist`; при `!valid` бросается `Error(reason)`                                                                                                          |
| `endPhase`                                    | Конец фазы (см. ниже)                                                                                                                                                    |
| `retreat`                                     | Сразу `result = "retreat"`                                                                                                                                               |

Общие правила `applyAction`:

- Если `prev.result` задан, возвращается `prev` без событий. Иначе работа идёт на копии `structuredClone(prev)`.
- `validateActor` бросает исключение, если юнит мёртв, ходит не в свою фазу или уже действовал. Недостижимая клетка в `moveUnit` тоже даёт исключение.
- `finishAction` выполняет следующее:
  - ставит `acted = true` и удаляет `turnStart`;
  - **сбрасывает `penalties`**, поэтому дебафф живёт до следующего действия бойца;
  - меняет стойку;
  - начисляет опыт навыков передвижения (`SKILL_XP.move = 2.5` каждому из `MOVEMENT_SKILLS`).
- После действия срабатывает вылазка: `move` вызывает `expeditionStepOn`, а остальные действия бойца вызывают `expeditionStep`. Союзник, которого сдвинула Поддержка (`swap`, `reposition`, `drawBack`, `shove`, `smite`), тоже встаёт на новую клетку через `expeditionStepOn`: подбирает ключ, сердечко, бонус, открывает сундук (но не уходит через выход). Затем всегда вызывается `checkEnd`.
- `stats.turns` — номер текущего хода: 1 с начала боя, растёт вместе с `turn`.
- `killUnit` помечает павшего флагом `killer:<id убийцы>` = 1 (`KILLER_FLAG` в `battle/query.ts`). Лог событий не хранится, а флаги сохраняются вместе с боем; по флагу Мемориал называет убийцу (`findKiller` в [core/progression](../src/game/core/progression/index.ts): флаг, а без него — ближайший к телу **живой** враг).

## События (`BattleEvent`)

| Событие                                                                         | Когда                                            |
| ------------------------------------------------------------------------------- | ------------------------------------------------ |
| `moved`                                                                         | Ход: путь для анимации                           |
| `combat`                                                                        | Схватка: `strikes: Strike[]` и HP до и после     |
| `wallHit`                                                                       | Удар по стене                                    |
| `assist`                                                                        | Поддержка: `moves`, `heal`, HP после             |
| `effect`                                                                        | Применённый `Effect`: buff, debuff, heal, damage |
| `died`, `loot`                                                                  | Гибель бойца и выпавшие Вкусняшки                |
| `xp`, `levelUp`, `rankUp`                                                       | Опыт, уровень, ранг навыка                       |
| `waited`                                                                        | Боец ждёт                                        |
| `phaseChanged`                                                                  | Смена фазы                                       |
| `reinforcements`                                                                | Пришло подкрепление                              |
| `battleEnded`                                                                   | Бой окончен                                      |
| `keyTaken`, `keyDropped`, `chestOpened`, `pickup`, `pickupDropped`, `extracted` | Вылазка в чащу                                   |

`GamePresenter` ([scene/presenter.ts](../src/game/scene/presenter.ts)) проигрывает их по порядку.

## Порядок хода и фаз

1. `createBattle(opts)`:
   - ставит бойцов отряда на `map.playerSpawns[i]`; лишние, если спаунов меньше, не выходят;
   - ставит врагов из `map.enemies`;
   - заводит HP стен и состояние вылазки;
   - вызывает `startPhase(state, "player")`.
2. `startPhase(side)`:
   - `phase = side`;
   - у живых бойцов этой стороны `acted = false`, **`bonuses = {}`**, удаляется `turnStart`. Поэтому бафф Ободрения или Воя держится до начала следующей фазы своей стороны;
   - для `enemy` сначала `spawnReinforcements`;
   - событие `phaseChanged`;
   - хуки `onTurnStart` всех бойцов стороны (навыки и талисманы). Эффекты собираются и применяются вместе через `applyEffects`;
   - бафф вылазки `regen` в фазу игрока лечит всех на `max(1, round(maxHp × BUFF.regen))`, где `BUFF.regen = 0.25`.
3. Игрок двигает бойцов. Фаза не кончается сама, её кончает `endPhase` из UI (кнопка или настройка `autoEndTurn`).
4. `endPhase`:
   - у бойцов уходящей стороны, которые не действовали, сбрасываются `penalties`;
   - после фазы игрока вызывается `startPhase("enemy")`;
   - после фазы врага, если `turn >= turnLimitOf(map)`, ставится `result = "retreat"` и `timeUp = true`. Лимит `BATTLE.turnLimit = 20`, в вылазке `EXPEDITION.turnLimit = 200`;
   - иначе `turn++` и `startPhase("player")`.
5. Фаза врага: `runEnemyPhase` в UI в цикле вызывает `nextEnemyAction(state)` ([ai](ai.md)) и `dispatchBattle`. Когда все враги отходили, ИИ возвращает `endPhase`. Если действие ИИ бросило исключение, UI подставляет `wait` на месте.

## Схватка в редьюсере (`resolveCombat`)

1. `simulateCombat(state, attackerId, defenderId, bu.pos)` ([combat](combat.md)). В бойцов переносятся `hp`, `specialCd` и `flags` обеих сторон.
2. В `stats.damage` идёт урон, нанесённый бойцами игрока. В `roster[...].history` обновляются `damageDealt`, `damageTaken` и `closestCall`.
3. Стойки:
   - раненый вожак-враг переходит в `advance`;
   - атаковавший враг, чья цель выжила, переходит в `advance` даже из `guard`: ветка `attack` передаёт эту стойку в `finishAction` вместо `newStance` действия. Если враг цель добил, ставится `newStance` (по умолчанию `advance`).
4. Событие `combat`, затем `killUnit` для погибших (сначала защитник).
5. `afterEffects` из хуков `afterCombat` применяются через `applyEffects`. Эффект `damage` **никогда не убивает**: минимум 1 HP.
6. Опыт выжившим:
   - XP считает `xpForCombat`, SP: `SP.kill = 8` за убийство, `SP.combat = 4` за нанесённый удар;
   - опыт оружейного навыка: `SKILL_XP.hit = 3`, плюс `kill = 3` за добивание, `none = 1` без урона. Защитник получает его, только если сам ударил.

`killUnit`:

- ставит `alive = false`, `hp = 0`, `acted = true`;
- передаёт ключ вылазки (`passKeys`) и кладёт лужу;
- добавляет в `deaths` (если пал боец игрока) и в `kills`/`history.kills` (если убил боец игрока);
- вызывает хуки `onAllyDeath` союзников павшего;
- шлёт событие `died`;
- для врага начисляет Вкусняшки: `round(lootFor(unit, difficulty.treatsMult) × buffLootMult)`.

## Опыт (`XP`, `SP` в [balance.ts](../src/game/content/balance.ts))

- `xpForCombat(self, foe, result, boss)`:
  - без урона: `XP.noDamage = 1`;
  - нанёс урон: `clamp(20 + 2·diff, 1, 40)`, где `diff = foeLevel − selfLevel`;
  - добил: ещё `max(0, 30 + 2·diff)`, а за вожака ещё `+20`;
  - если боец выше врага, итог умножается на `max(0, 1 + diff·0.1)`, но не опускается ниже `combatMin = 1`.
- `xpForHeal(healed) = min(25, 10 + round(healed·0.5))`. Танец даёт `XP.dance = 10`, Ободрение `XP.rally = 8`, прочие Поддержки `XP.assist = 10`. За любую Поддержку `SP.assist = 4`.
- `grantXp`:
  - работает только для живых бойцов игрока;
  - XP умножается на `xpMultiplier` (талисман `tal_book` ×1.5), на `MAX_LEVEL` XP равен 0;
  - уровень стоит `XP.perLevel = 50`;
  - при повышении уровня `maxHp` и `hp` растут на прирост HP.
- Лечение посохом ещё даёт `SKILL_XP.heal = 4` к `whiteMagic`.

## Поддержка (`planAssist`)

Цель — живой союзник, но не сам боец, на соседней клетке (`manhattan == 1`) от клетки `from`. Направление задаётся вектором (dx, dy) от бойца к цели.

| `AssistKind`      | Эффект                                                                | Когда недопустимо                                           |
| ----------------- | --------------------------------------------------------------------- | ----------------------------------------------------------- |
| `rally`           | `buff` цели статами `assist.stats`                                    | всегда допустимо                                            |
| `swap`            | Боец и цель меняются местами                                          | Кто-то не может встать на клетку другого                    |
| `reposition`      | Цель переходит на клетку позади бойца                                 | Клетка занята или непроходима для цели                      |
| `drawBack`        | Боец отходит на клетку назад, цель встаёт на его место                | Некуда отойти                                               |
| `pivot`           | Боец прыгает на клетку за целью                                       | Там нельзя встать                                           |
| `shove` / `smite` | Цель сдвигается на 1 / 2 клетки от бойца                              | Путь перекрыт                                               |
| `heal`            | Лечит на `assist.heal + healPower(unit)`, не больше недостающего HP   | Цель здорова                                                |
| `refresh`         | Цель снова может действовать (`acted = false`, `turnStart` удаляется) | Цель ещё не действовала, или цель — танцор (`DANCER_CLASS`) |
| `sacrifice`       | −`assist.heal` HP себе (10), +min(`heal`, недостающее) цели           | Цель здорова, или у бойца ≤ `heal` HP                       |
| `reciprocal`      | Боец и цель меняются HP, каждый в пределах своего `maxHp`             | Обмен ничего не меняет                                      |

`healPower(unit) = floor(собственный Mag × HEALING.magShare) + weaponMt(unit)`, где `magShare = 1` ([units](../src/game/core/units/index.ts)). Спецприём вида `heal` срабатывает при `specialCd <= 0` и прибавляет `bonusHeal` к лечению цели или `allAlliesHeal` остальным союзникам. Лечение остальных (`sp_heavenly`) идёт через `applyEffects` после события `assist`: на каждого вылеченного — событие `effect` (`heal`, `sourceId` — лекарь); вылеченное суммируется в опыт за лечение. Затем кулдаун сбрасывается на максимум, а если спецприём не сработал, уменьшается на 1.

`canStand` проверяет границы поля, проходимость клетки для типа движения (`isPassable`) и то, что клетка свободна (участники Поддержки не мешают).

## Победа, поражение, отступление (`checkEnd`)

Проверка идёт после каждого действия:

1. Нет живых бойцов игрока: `defeat`.
2. `objective === "extract"` (вылазка): по убийствам победы нет. Победа наступает только в `expeditionStep`: боец игрока завершил действие на клетке из `exits`, и при этом открыт хотя бы один сундук.
3. `objective === "killBoss"`: в `roster` есть вожак (`isBoss`), и среди живых врагов его нет. Это `victory`, даже если остались другие враги.
4. Живых врагов нет **и** все волны из `map.reinforcements` уже пришли: `victory`.
5. Действие `retreat` или лимит ходов: `retreat`.

## Подкрепления

`spawnReinforcements` вызывается в начале каждой фазы врага. Для волны с `wave.turn === state.turn`, которой ещё нет в `spawnedWaves`:

- номер волны записывается в `spawnedWaves`;
- каждый юнит встаёт на `r.pos`. Если клетка занята, `spawnTile` ищет в ширину (соседи в порядке →, ←, ↓, ↑) ближайшую свободную клетку, проходимую для его типа движения; через занятые клетки поиск идёт, через непроходимые — нет. Юнит пропускается, только если такой клетки на поле нет;
- юнит создаётся со стойкой `advance` и `spawnedTurn = turn`, поэтому действует уже в эту же фазу врага;
- шлётся событие `reinforcements`.

Число и ход волн задаёт `DifficultyDef.reinforcements`: Сложно — `{turn: 3, count: 2}`, Кошмар — ходы 2 и 4 по 2 врага. Волны строит генератор карт в `core/map`.

## Вылазка в чащу (кратко)

- Ключи от сундуков (`ExpeditionState.keys`) лежат у стражей. Если стража убил боец игрока, ключ переходит к нему, иначе падает на клетку (`keyDropped`).
- Ступив на клетку, боец подбирает ключ, сердечко (полное HP) или бонус (`BUFFS[kind].scope`: `team` или `unit`), а стоя на сундуке со своим ключом, открывает его. Перестановка (`move`) тоже считается: ход при этом не тратится.
- Когда погибает усиленный одиночка (`expedition.elites`), на его клетке остаётся бонус.
- Значения бонусов `BUFF`: `fury` +20 % урона, `aegis` −20 % урона, `swift` +2 к ходу, `regen` 25 % HP в начале хода, `fortune` ×1.5 добычи.

## Напиток

`state.drink.pct` даёт бойцам игрока прибавку `max(1, round(stat·pct/100))` к каждому стату с ненулевым процентом. Она учитывается в `simulateCombat` и `unitStatsInBattle`, а HP прибавляется к `maxHp` при старте.

## Где менять

- Новое действие: добавить вариант в union `BattleAction` ([types.ts](../src/game/core/types.ts)), ветку в `applyAction` ([reducer.ts](../src/game/core/battle/reducer.ts)), схему в [core/save/index.ts](../src/game/core/save/index.ts) (бой хранится в сейве), вызов в [state/battleUi.ts](../src/game/state/battleUi.ts) и `window.__pf` в `GameRoot.tsx`.
- Новое событие: union `BattleEvent` ([types.ts](../src/game/core/types.ts)) и его проигрывание в [scene/presenter.ts](../src/game/scene/presenter.ts).
- Условия победы и лимит ходов: `checkEnd` и `endPhase` в [reducer.ts](../src/game/core/battle/reducer.ts); `BATTLE`, `EXPEDITION.turnLimit` и `turnLimitOf` в [balance.ts](../src/game/content/balance.ts).
- Опыт и SP: `XP`, `SP`, `SKILL_XP` в [balance.ts](../src/game/content/balance.ts).
- Подкрепления: `DifficultyDef.reinforcements` в [balance.ts](../src/game/content/balance.ts), генератор волн в `core/map`, размещение в `spawnReinforcements`.
- Новый вид Поддержки: `AssistKind` в [skills/types.ts](../src/game/core/skills/types.ts) и ветка в `planAssist` ([assist.ts](../src/game/core/battle/assist.ts)). Подробнее в [skills.md](skills.md).
- Изменение формы `BattleState` требует поднять `SAVE_VERSION` и добавить миграцию в [core/save/index.ts](../src/game/core/save/index.ts).
- Тесты: [tests/game/battle.test.ts](../tests/game/battle.test.ts), [tests/game/movement.test.ts](../tests/game/movement.test.ts), [tests/game/expedition.test.ts](../tests/game/expedition.test.ts).
