# ИИ врага

ИИ — чистая детерминированная функция: по `BattleState` она выбирает одно следующее `BattleAction` для одного врага. Вес решений задаёт профиль `AiProfile` сложности, а равные варианты различает детерминированный «шум» `jitter`, построенный на хэше.

Код: [core/ai/index.ts](../src/game/core/ai/index.ts). Профили: `DIFFICULTIES[].ai` в [content/balance.ts](../src/game/content/balance.ts). Вызывает `runEnemyPhase` в [state/battleUi.ts](../src/game/state/battleUi.ts).

## Цикл фазы

- `nextEnemyAction(state)` работает так:
  - не фаза врага или бой окончен: возвращает `endPhase`;
  - иначе берёт первого из `enemyOrder(state)` и вызывает `decideAction`;
  - если очередь пуста, возвращает `endPhase`.
- `enemyOrder` перебирает не действовавших живых врагов в таком порядке:
  1. по расстоянию до ближайшего бойца игрока (по возрастанию);
  2. по `visibleStats().spd` (по убыванию);
  3. по `unitId`.
- Очередь пересчитывается перед каждым действием. Поле `BattleState.enemyQueue` не используется: оно только сбрасывается в `null`.
- UI ограничивает число итераций (`100 + units·3`). Если действие бросило исключение, UI подставляет `wait` на месте.

## `decideAction(state, unitId)`

1. `reach = leashed(bu, reachableTiles(state, bu))`. Страж сундука (`bu.post`) ходит только по клеткам не дальше `leash` (по умолчанию `EXPEDITION.leash = 5`) от поста.
2. `threat = threatCounts(state, "player")`: сколько бойцов игрока могут ударить по каждой клетке.
3. **Стойки:**
   - `hold`: если `shouldWake`, враг переходит в `advance`, иначе ждёт на месте. `shouldWake` срабатывает в одном из случаев:
     - `turn ≥ ai.wakeTurn` (не для стражей);
     - боец игрока ближе `ai.alertRadius` (у стража — `EXPEDITION.alertRadius = 4`);
     - `alarmNearby`: в 3 клетках есть раненый или павший враг;
     - боец игрока стоит в зоне атаки (`threatTiles`).
   - `guard` (вожак): атакует только со своей клетки, если `score ≥ 0`. Добил цель — остаётся в `guard`; цель выжила — редьюсер переводит его в `advance`. Переходит в `advance`, если в 3 клетках шум боя или игрок в ≤ 2 клетках. Иначе ждёт.
4. **Лекарь** (`whiteMagic`): `evaluateHeal` выбирает союзника с HP ≤ 80 % и `planAssist(...).heal > 0`. Счёт `(1 − hpPct)·100 + heal`.
5. **Танцор** (`DANCER_CLASS`): `evaluateRefresh` выбирает уже действовавшего союзника. Счёт: атака союзника + HP/10.
6. **Атака** (`evaluateAttacks`): перебирает клетки `reach` с `canStop`, всех целей из `targetsFrom` и для каждой пары вызывает `simulateCombat`. Счёт складывается так:

   | Слагаемое                              | Вес                            |
   | -------------------------------------- | ------------------------------ |
   | нанесённый урон                        | +1 за HP                       |
   | убийство цели                          | +100                           |
   | цель — лекарь или танцор (`isSupport`) | +15                            |
   | сработал спецприём                     | +10                            |
   | полученный урон                        | −`taken × ai.wTaken`           |
   | гибель атакующего                      | −200                           |
   | клетка `cover` / `forest`              | +8 / +3                        |
   | угроза клетки                          | −`threat × ai.wExposure`       |
   | раненая цель                           | +`(1 − hpPct) × ai.focusLowHp` |
   | преимущество треугольника              | +6                             |
   | цель не может ответить                 | +5                             |
   | `jitter`                               | 0…0.9                          |

   При равном счёте выигрывает вариант с меньшим `taken`. Атака выбирается при `score ≥ 0`.

7. **Страж без целей:**
   - преследует только бойцов в пределах `leash + range` от поста;
   - если таких нет, возвращается к посту и встаёт в `hold`, когда до поста ≤ 2 клеток.
8. **Отступление:** если `ai.retreatHp > 0` и `hpPct < retreatHp`, враг уходит по `retreatMove`. Счёт клетки: `min(d, 5)·10 − threat·12 − 4·dist(до лекаря)`, плюс бонус за укрытие и лес.
9. **Наступление** (`advanceMove`): использует `distanceField` от бойцов игрока с учётом типа движения.
   - Ближник стремится к `d = 1`, дальник к `d = 3`: `|d − 3| + 0.3d`.
   - Штрафы: `threat × wExposure` и `cohesion` за каждую клетку дальше 2 от ближайшего союзника.
   - `isSupport` держится в 4 клетках от игрока и ближе к своим.

ИИ не бьёт хлипкие стены, не использует Поддержки, кроме лечения и танца, и не учитывает бонусы вылазки при выборе цели. `simulateCombat` их учитывает, поэтому они влияют на оценку урона.

## Профили сложности (`AiProfile`)

| Сложность | wTaken | wExposure | focusLowHp | alertRadius | wakeTurn | cohesion | retreatHp | Доля `hold` |
| --------- | ------ | --------- | ---------- | ----------- | -------- | -------- | --------- | ----------- |
| easy      | 0.3    | 0         | 0          | 3           | 6        | 0        | 0         | 1           |
| normal    | 0.7    | 3         | 8          | 4           | 4        | 1.5      | 0.3       | 0.5         |
| hard      | 1.0    | 6         | 14         | 5           | 3        | 2.5      | 0.35      | 0           |
| nightmare | 1.0    | 8         | 20         | 6           | 2        | 3        | 0.4       | 0           |


## Детерминизм

- `jitter = (hashString("unitId:turn:x,y:extra") % 1000) / 1100`, где `hashString` — FNV-1a из [core/rng](../src/game/core/rng/index.ts).
- Порядок перебора задаётся порядком вставки в `state.units` и `ReachMap`, а `structuredClone` его сохраняет.
- `Math.random` и `Date` в ИИ не используются.

## Где менять

- Веса и пороги по сложности: `AiProfile` и `DIFFICULTIES` в [balance.ts](../src/game/content/balance.ts).
- Фиксированные бонусы оценки (+100 за убийство, +15 за лекаря, укрытие, треугольник): `evaluateAttacks`, `retreatMove`, `advanceMove` в [core/ai/index.ts](../src/game/core/ai/index.ts).
- Пробуждение и стойки: `shouldWake`, `alarmNearby` и блок стоек в `decideAction`. Начальная стойка — `holdRatio` и генератор карты в `core/map`.
- Поводок стражей: `EXPEDITION.leash`, `alertRadius`, `eliteLeash`, `exitGuardLeash` в [balance.ts](../src/game/content/balance.ts).
- Новая Поддержка для ИИ: аналог `evaluateHeal` или `evaluateRefresh` и ветка в `decideAction`.
- Тесты: [tests/game/ai.test.ts](../tests/game/ai.test.ts), полные автобои в [tests/game/battle.test.ts](../tests/game/battle.test.ts) (`полные бои: ИИ не падает`).
