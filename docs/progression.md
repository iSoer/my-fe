# Прокачка

Боец растёт по трём независимым осям:

- **уровень** 1…80 — от опыта (XP) за действия в бою и тренировок;
- **статы** — растут с уровнем по фиксированной таблице в духе FEH: проценты роста задают итог к 80-му уровню, а прибавки разбросаны по уровням по `seed`;
- **владение навыками** (ранги E…S) — от использования оружия и передвижения в бою, от уровня оно не зависит.

Вдобавок перерождение на 80-м уровне сбрасывает уровень и даёт +1★ (см. [units.md](units.md#перерождение)).

## Опыт и уровень

Константы `XP` лежат в [content/balance.ts](../src/game/content/balance.ts):

| Параметр                         | Значение                                              |
| -------------------------------- | ----------------------------------------------------- |
| `perLevel` — опыта на уровень    | 50                                                    |
| Схватка с уроном                 | `20 + 2 × (уровень врага − свой)`, в пределах [1, 40] |
| Схватка без урона                | 1                                                     |
| Добивание                        | ещё `30 + 2 × разница`, вожак — ещё 20                |
| Боец выше врага                  | −10 % за каждый уровень разницы (не меньше 1)         |
| Лечение                          | `10 + 0.5 × вылечено HP`, не больше 25                |
| Танец / прочие Поддержки / Rally | 10 / 10 / 8                                           |
| Победа                           | каждый выживший получает не меньше `victoryMin` = 1   |

- В бою опыт считает `xpForCombat` / `xpForHeal`, а начисляет `grantXp` в [core/battle/reducer.ts](../src/game/core/battle/reducer.ts). У `grantXp` свой цикл повышения уровня.
- Вне боя опыт начисляет `gainXp(unit, xp)` из [core/progression/index.ts](../src/game/core/progression/index.ts). Каждые 50 XP дают уровень, а на 80-м уровне `xp` обнуляется.
- `trainUnit` даёт ровно +1 уровень за `trainCost(level) = 40 + 6 × уровень` Вкусняшек.
- Тренировочный полигон ([content/settlement.ts](../src/game/content/settlement.ts), `TRAINING`) даёт XP в час и XP после вылазки.
- Очки навыков `SP`: 4 за схватку, 8 за добивание, 4 за Поддержку. Цены навыков: Поддержка 150, Special 200, пассивки 120 / 200 / 300.
- Сводки о росте — `LevelUpSummary { unitId, from, to, gains }`, где `gains = levelGains(unit, from, to)`.

## Рост статов: `statTable`

Код: [core/units/index.ts](../src/game/core/units/index.ts) (`growthRates`, `statTable`, `statsAtLevel`, `levelGains`). Параметры `LEVEL_UP`:

| Параметр       | Значение                                                        |
| -------------- | --------------------------------------------------------------- |
| `growthTotal`  | сумма процентов роста = `250 + 25 × ★` (1★ — 275 %, 5★ — 375 %) |
| `maxRate`      | 100 % на стат (за уровень не больше +1)                         |
| `attackWeight` | 1.3 — вес стата, которым бьёт оружие (Str или Mag)              |
| `minStats`     | 2 — каждый уровень растит хотя бы два разных стата              |

1. **Проценты роста** (`growthRates`): пропорции берутся из собственного роста модели `maxStats − baseStats` в боевой шкале (стат оружия × 1.3) и нормируются на `growthTotal`. Затем каждый умножается на `1 + CLASS_STAT_MODS[stat] / 100` и обрезается до `[0, 100]`.
2. **1-й уровень**: `combatStats(baseStats) × (1 + mod / 100)`, каждый стат не меньше 1.
3. **Уровни прибавок**: за 79 шагов стат `s` растёт `round(rate × 79 / 100)` раз. Уровни для каждого стата перемешиваются форком `createRng(seed).fork("growth").fork(s)`.
4. **Гарантия `minStats`**: если на уровне меньше двух прибавок, одна переносится с самого «бедного» из уровней, где прибавок в избытке. Если переносить неоткуда, прибавка добавляется стату с самым высоким ростом.
5. Таблица кэшируется в `WeakMap` и пересчитывается при смене `classId`, `weaponSkill`, `rarity`, `seed`, `baseStats` или `maxStats`.

Таблица зависит от класса, поэтому смена класса пересчитывает все уровни. Уровень от этого не меняется, а статы на нём становятся статами нового класса.

### Модель персонажа

- [src/model/character-model/model.ts](../src/model/character-model/model.ts) выводит из подогнанной статистической модели ([stat-model/model.json](../src/model/stat-model/model.json), проверяется `statModelSchema`):
  - `growth` — отношение 80-го уровня к 1-му для каждого стата;
  - `rarities[★]`: `baseMultiplier = 1 − 0.015 × (5 − ★)`, `growthMultiplier = (0.79 + 0.07★) / 1.14` и бюджет суммы статов (BST).
- [src/shared/character/leveling.ts](../src/shared/character/leveling.ts): `levelOneStats`, `statAtLevel` (линейный рост модели — в бою он не используется), `CHARACTER_STAT_LABELS`.
- Генератор модели использует собственный зерновой ГПСЧ mulberry32 ([stat-model/random.ts](../src/model/stat-model/random.ts)). Зерно ему передаёт `generateUnit` из `core/rng`, так что результат детерминирован.

## Владение навыками (proficiency)

Код: [core/units/proficiency.ts](../src/game/core/units/proficiency.ts). Константы `SKILL_XP`, `CLASS_AFFINITY`, `APTITUDE_RATE` — в [balance.ts](../src/game/content/balance.ts).

- 10 навыков (`SKILLS` в [shared/character/skills.ts](../src/shared/character/skills.ts)): 7 оружейных (`sword`, `axe`, `spear`, `bow`, `gauntlet`, `whiteMagic`, `blackMagic`) и 3 навыка передвижения (`riding`, `flying`, `heavyArmor`).
- Пороги рангов `SKILL_XP.ranks` для E, E+, D, D+, C, C+, B, B+, A, A+, S: `0, 15, 60, 120, 200, 300, 420, 570, 750, 950, 1190`. `rankOfXp` и `xpOfRank` переводят опыт в ранг и обратно. Опыт сверх S не копится.
- Старт (`startingSkillXp`): 15 (E+), у слабого навыка (`weak`) — 0 (E).
- Бой (`grantSkillXp` в редьюсере): оружию в лапах +3 за урон, ещё +3 за добивание, +1 без урона. Посоху +4 за лечение. Всем трём навыкам передвижения +2.5 за действие. Врагам опыт навыков не начисляется.
- Множитель: `gainSkillXp` умножает базу на `classAffinity × APTITUDE_RATE[aptitude]` (`talent 1.5`, `normal 1`, `weak 0.5`) и округляет до 0.1.
- Ранг добавляет Mt (`rankMt = floor(индекс ранга / 3)`: E, E+, D → 0; D+, C, C+ → +1; B, B+, A → +2; A+, S → +3) и открывает классы. Перерождение ранги не сбрасывает.
- Новобранцы (`presetSkillXp`): к стартовому опыту добавляется `(уровень − 1) × 7 × rate` оружию класса и `× 5 × rate` передвижению. Результат ограничен A+ (`presetCapRank` = 9), но требования класса выполняются всегда.

У модели есть и свои кривые рангов по уровню (`APTITUDE_CURVES`, `rankAtLevel`). Игра использует их только для `reachable`, для генерации персонажа и для миграции старых сейвов (`withSkillXp` в [core/save/index.ts](../src/game/core/save/index.ts)). Ранг бойца в игре всегда считается из `skillXp`.

## Где менять

| Что                                                       | Файл                                                                                                                                                                                                 |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| XP, SP, пороги рангов, рост статов, перевод статов модели | `XP`, `SP`, `SKILL_XP`, `CLASS_AFFINITY`, `APTITUDE_RATE`, `LEVEL_UP`, `MODEL_SCALE` в [content/balance.ts](../src/game/content/balance.ts)                                                          |
| Начисление в бою                                          | [core/battle/reducer.ts](../src/game/core/battle/reducer.ts) (`grantXp`, `grantSkillXp`, `xpForCombat`)                                                                                              |
| Вне боя, тренировка, цены                                 | [core/progression/index.ts](../src/game/core/progression/index.ts), `PRICES` в [balance.ts](../src/game/content/balance.ts), `TRAINING` в [content/settlement.ts](../src/game/content/settlement.ts) |
| Таблица статов                                            | `growthRates` / `statTable` в [core/units/index.ts](../src/game/core/units/index.ts)                                                                                                                 |
| Ранги и пресеты                                           | [core/units/proficiency.ts](../src/game/core/units/proficiency.ts)                                                                                                                                   |
| Модель персонажа                                          | [src/model/character-model](../src/model/character-model/model.ts), [src/shared/character](../src/shared/character/leveling.ts)                                                                      |
| Тесты                                                     | [units](../tests/game/units.test.ts) (рост), [proficiency](../tests/game/proficiency.test.ts), [rebirth](../tests/game/rebirth.test.ts), [battle](../tests/game/battle.test.ts)                      |
