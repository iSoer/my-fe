# Навыки: движок и таблица

Навыки бойца — это пассивки трёх слотов (A, B, C), спецприём (Special), Поддержка (Assist) и талисман. Все они сводятся к набору хуков `SkillHooks`, которые бой вызывает в нужные моменты. Ниже описаны движок и полный список существующих навыков.

## Файлы

| Файл                                                                 | Что внутри                                                                                                                                                                              |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [core/skills/types.ts](../src/game/core/skills/types.ts)             | `SkillHooks`, `CombatCtx`, `StrikeInfo`, `PassiveDef`, `SpecialDef`, `AssistDef`, `AssistKind`, `TalismanDef`, `WeaponDef`                                                              |
| [core/skills/engine.ts](../src/game/core/skills/engine.ts)           | `unitKit`, `permanentBonus`, `moveRange`, `specialMaxCd`, `counterAnyRange`, `hasPassThrough`, `wrathfulStaff`, `negatesEffective`, `xpMultiplier`, `treatsMultiplier`, `invalidateKit` |
| [content/skills/passives.ts](../src/game/content/skills/passives.ts) | `PASSIVES`, `passiveDef`                                                                                                                                                                |
| [content/skills/specials.ts](../src/game/content/skills/specials.ts) | `SPECIALS`, `specialDef`                                                                                                                                                                |
| [content/skills/assists.ts](../src/game/content/skills/assists.ts)   | `ASSISTS`, `assistDef`                                                                                                                                                                  |
| [content/items.ts](../src/game/content/items.ts)                     | `TALISMANS` (тоже `SkillHooks`)                                                                                                                                                         |
| [core/units/index.ts](../src/game/core/units/index.ts)               | пулы и изучение: `allowedSkillIds`, `COMMON_SKILLS`, `slotOf`, `skillCost`, `learnableNow`, `learnSkill`, `equipSkill`, выдача навыков в `generateUnit`                                 |

## Движок

`unitKit(unit)` собирает `UnitKit { cls, weapon, passives, talisman, special, assist, hooks }`. В `hooks` попадают хуки пассивок слотов a, b, c и талисмана, а у оружия хуков нет: его свойства задают поля `WeaponDef` (`spdMod`, `cdMod`, `effectiveAgainst`, `variant`). Кит кэшируется в `WeakMap` по ссылке на `UnitInstance`. Код, который меняет юнита на месте, должен вызывать `invalidateKit`. Обычно юнит пересоздаётся, и кэш сам промахивается: например, редьюсер клонирует состояние на каждом действии.

### Хуки `SkillHooks`

| Хук                                      | Где вызывается                    | Смысл                                         |
| ---------------------------------------- | --------------------------------- | --------------------------------------------- |
| `statBonus`                              | `permanentBonus` → `visibleStats` | Постоянная прибавка к статам (видна вне боя)  |
| `combatStatMod(ctx)`                     | `applyCombatMods`                 | Прибавка в этой схватке                       |
| `allyCombatStatMod {range, stats}`       | `applyCombatMods`                 | Прибавка союзникам в радиусе                  |
| `onTurnStart(state, self)`               | `startPhase`                      | `Effect[]` в начале фазы своей стороны        |
| `afterCombat(ctx, info)`                 | конец `simulateCombat`            | `Effect[]` после схватки (только у выжившего) |
| `counterAnyRange`                        | `simulateCombat`                  | Контратака на любой дистанции                 |
| `followUp(ctx)`                          | `simulateCombat`                  | `{selfGuaranteed?, foeDenied?}`               |
| `desperation(ctx)`                       | `simulateCombat`                  | Двойная атака сразу за первой                 |
| `vantage(ctx)`                           | `simulateCombat`                  | Защитник бьёт первым                          |
| `damageReduction(ctx, strike)`           | `doStrike`                        | Доля снижения урона (0…1)                     |
| `damageImmune(ctx, strike, dmg)`         | `doStrike`, последним             | Удар не ранит                                 |
| `flatDamage(ctx, strike)`                | `doStrike`                        | +N урона                                      |
| `damageMultiplier(ctx)`                  | `doStrike`                        | ×урон                                         |
| `survive(ctx)`                           | `doStrike`                        | Пережить смертельный удар с 1 HP              |
| `passThrough`                            | `reachableTiles`                  | Проход сквозь врагов                          |
| `moveBonus`                              | `moveRange`                       | +клетки хода                                  |
| `cdMod`                                  | `specialMaxCd`                    | ±кулдаун спецприёма                           |
| `wrathfulStaff`                          | `doStrike`                        | Посох без ×0.5                                |
| `xpMultiplier`                           | `grantXp`                         | ×опыт                                         |
| `treatsMultiplier`                       | `core/progression`                | ×Вкусняшки за бой (выжившему)                 |
| `negateEffective`                        | `simulateCombat`                  | Оружие врага не эффективно                    |
| `onAllyDeath(state, self, dead, killer)` | `killUnit`                        | `Effect[]` при гибели союзника                |

Хуки `flatDamage`, `damageMultiplier`, `survive`, `moveBonus`, `cdMod` (как хук), `wrathfulStaff` и `onAllyDeath` движок поддерживает, но ни один навык или талисман их пока не использует.

### Эффекты (`Effect`) и `applyEffects`

- `buff`: в `bonuses[stat]` записывается `max(старое, новое)`. Баффы не складываются, держатся до начала следующей фазы своей стороны.
- `debuff`: в `penalties[stat]` записывается `min(...)`. Держится до конца следующего действия бойца (`finishAction`) или до конца его фазы.
- `heal`: HP растёт, но не выше `maxHp`.
- `damage`: HP падает, но не ниже 1, так что эффекты не убивают.
- `flag`: `flags[key] = value`.

Эффект для мёртвого юнита пропускается.

### Ограничения и пулы

- `PassiveDef.allow { moveTypes?, weaponSkills? }` проверяет `passiveAllowed` по `ClassDef` бойца. Его `weaponSkill` — навык оружия в лапах (`unitClass({classId, weaponSkill})`).
- `SpecialDef.onlySpecies` и `staffOnly`, `AssistDef.staffOnly` и `dancerOnly` проверяет `allowedSkillIds`. У спецприёма `staffOnly` должен совпадать с «лекарь или нет»: лечебные спецприёмы только у White Magic, у остальных только боевые.
- Навыки со `stage: "v1.1"` в пулы не попадают. Сейчас это только `as_reciprocal`. Стадии `mvp` и `v1` ничем не отличаются.
- `COMMON_SKILLS` (`a_atk3`, `a_spd3`, `a_def3`, `a_res3`, `a_hp5`, `as_rally_atk`, `as_rally_def`) доступны всем без пула.
- Выдача при генерации (`generateUnit`):
  - White Magic получает `as_heal`, Dancer получает `as_dance`;
  - случайный доступный спецприём;
  - ★3–4 получают 1 доп. навык, ★5 — 2 (Поддержка с шансом 0.4, иначе пассивка в свободный слот);
  - пул изучения: `RARITY_SKILL_POOL[rarity]`.
- Цена изучения — `spCost` из таблицы (`skillCost`).
- `learnSkill` учит только навык из `learnableNow` (пул бойца ∩ `allowedSkillIds` или `COMMON_SKILLS`), иначе бросает `Error`.
- `equipSkill` бросает `Error`, если навык не изучен, не для этого слота (`slotOf`) или недоступен бойцу сейчас (`skillUsable`: общий, из `allowedSkillIds` по нынешним классу, оружию и виду, или `as_dance` у танцора).
- После смены класса (`reclassUnit`) или оружия (`equipWeapon`) `withClassSkills` снимает из слотов навыки, которые больше не `skillUsable` (пассивки латника, посох-спецприёмы, контрудары не той дальности и т. п.). Изученными они остаются и вернутся в слот, когда снова станут доступны. Затем выдаются `as_heal` / `as_dance`.

## Пассивки (`PASSIVES`)

| id                                    | Название (RU)                            | Слот | Тир | SP  | Ограничение                | Эффект                                                                                               |
| ------------------------------------- | ---------------------------------------- | ---- | --- | --- | -------------------------- | ---------------------------------------------------------------------------------------------------- |
| `a_atk3`                              | Острый коготь                            | A    | 1   | 120 | —                          | +3 Str/Mag (`statBonus`)                                                                             |
| `a_spd3`                              | Быстрые лапы                             | A    | 1   | 120 | —                          | +3 Spd                                                                                               |
| `a_def3`                              | Крепкая шкура                            | A    | 1   | 120 | —                          | +3 Def                                                                                               |
| `a_res3`                              | Толстый мех                              | A    | 1   | 120 | —                          | +3 Res                                                                                               |
| `a_hp5`                               | Жирок                                    | A    | 1   | 120 | —                          | +5 HP                                                                                                |
| `a_fury`                              | Ярость                                   | A    | 2   | 200 | —                          | +3 ко всем статам, кроме HP; после боя 6 урона себе                                                  |
| `a_death_blow`                        | Злобный бросок                           | A    | 2   | 200 | —                          | +6 Str/Mag при инициативе                                                                            |
| `a_life_death`                        | Жизнь и смерть                           | A    | 2   | 200 | —                          | +5 Str/Mag/Spd, −5 Def/Res                                                                           |
| `a_close_counter`                     | Ближний контрудар                        | A    | 3   | 300 | оружие дальности 2         | `counterAnyRange`                                                                                    |
| `a_distant_counter`                   | Дальний контрудар                        | A    | 3   | 300 | оружие дальности 1         | `counterAnyRange`                                                                                    |
| `b_desperation`                       | Отчаяние                                 | B    | 2   | 200 | —                          | Инициатива и HP ≤ 75 %: двойная сразу за первой                                                      |
| `b_vantage`                           | Первым бью                               | B    | 2   | 200 | —                          | Оборона и HP ≤ 75 %: бьёт первым                                                                     |
| `b_quick_riposte`                     | Ответка                                  | B    | 2   | 200 | —                          | Оборона и HP ≥ 70 %: гарантированная двойная                                                         |
| `b_pass`                              | Проскользнуть                            | B    | 2   | 200 | —                          | Проходит сквозь врагов                                                                               |
| `b_breaker_sword` / `_spear` / `_axe` | Swordbreaker / Spearbreaker / Axebreaker (рус.: «Гроза: Sword» и т. д.) | B    | 2   | 200 | —                          | Против этого оружия и HP ≥ 50 %: своя двойная гарантирована, у врага двойной нет (фабрика `breaker`) |
| `b_seal_atk`                          | Метка когтя                              | B    | 1   | 120 | —                          | После боя −7 Str/Mag выжившему врагу                                                                 |
| `b_renewal`                           | Передышка                                | B    | 2   | 200 | —                          | +10 HP в начале фазы на нечётном ходу                                                                |
| `b_iron_hide`                         | Железная шкура                           | B    | 2   | 200 | `armored`                  | Ходы 1–2: урон 0 (`damageImmune`)                                                                    |
| `b_barrier`                           | Барьер                                   | B    | 2   | 200 | —                          | Раз за бой гасит ранящий удар (флаг `barrier_used`)                                                  |
| `b_evasion`                           | Неуловимость                             | B    | 3   | 300 | `infantry`, `flier`        | Каждый 3-й ход урон 0                                                                                |
| `b_stand_firm`                        | Стойкость                                | B    | 3   | 300 | `cavalry`                  | Когда его атакуют, первый удар врага не ранит                                                        |
| `b_spell_ward`                        | Чародейский щит                          | B    | 1   | 120 | `blackMagic`, `whiteMagic` | Ходы 1–3: −50 % урона от магии                                                                       |
| `c_hone_atk`                          | Вой атаки                                | C    | 1   | 120 | —                          | Начало фазы: соседним союзникам +4 Str/Mag                                                           |
| `c_hone_spd`                          | Вой скорости                             | C    | 1   | 120 | —                          | Соседним +4 Spd                                                                                      |
| `c_hone_def`                          | Вой защиты                               | C    | 1   | 120 | —                          | Соседним +4 Def                                                                                      |
| `c_threaten_def`                      | Угроза защите                            | C    | 2   | 200 | —                          | Начало фазы: врагам в 2 клетках −5 Def                                                               |
| `c_threaten_atk`                      | Угроза атаке                             | C    | 2   | 200 | —                          | Врагам в 2 клетках −5 Str/Mag                                                                        |
| `c_spur_atk`                          | Шерсть к шерсти                          | C    | 1   | 120 | —                          | Соседним союзникам +3 Str/Mag в бою                                                                  |
| `c_drive_spd`                         | Стая                                     | C    | 2   | 200 | —                          | Союзникам в 2 клетках +3 Spd в бою                                                                   |
| `c_savage_blow`                       | Запах крови                              | C    | 2   | 200 | —                          | При инициативе после боя 7 урона врагам в 2 клетках от цели (не убивает)                             |
| `c_breath_of_life`                    | Дыхание стаи                             | C    | 2   | 200 | —                          | При инициативе после боя +7 HP соседним союзникам                                                    |

## Спецприёмы (`SPECIALS`)

Все стоят 200 SP.

| id              | Название (RU)      | CD  | Вид     | Ограничение | Эффект                                         |
| --------------- | ------------------ | --- | ------- | ----------- | ---------------------------------------------- |
| `sp_glimmer`    | Кровавый блеск     | 2   | offense | —           | Урон +50 % (`damageBonusPct`)                  |
| `sp_moonbow`    | Лунный серп        | 2   | offense | —           | Игнорирует 30 % Def/Res                        |
| `sp_luna`       | Клыкастая луна     | 3   | offense | —           | Игнорирует 50 % Def/Res                        |
| `sp_bonfire`    | Пламя шерсти       | 3   | offense | —           | +50 % своего Def к урону                       |
| `sp_iceberg`    | Ледяная шерсть     | 3   | offense | —           | +50 % своего Res                               |
| `sp_draconic`   | Шквал когтей       | 3   | offense | —           | +30 % своей атаки (Str/Mag)                    |
| `sp_sol`        | Чистая рана        | 3   | offense | —           | Лечит 50 % нанесённого урона                   |
| `sp_escutcheon` | Пушистая стена     | 3   | defense | —           | −30 % от ближних атак                          |
| `sp_cowl`       | Хвост-щит          | 3   | defense | —           | −30 % от дальних атак                          |
| `sp_miracle`    | Девять жизней      | 5   | defense | `cat`       | Пережить смертельный удар с 1 HP (если HP > 1) |
| `sp_loyalty`    | Верность           | 4   | defense | `dog`       | −30 % от любой атаки, лечение на 30 % снятого  |
| `sp_squeak`     | Шмыг               | 3   | defense | `mouse`     | −40 % от любой атаки                           |
| `sp_imbue`      | Мурчание исцеления | 1   | heal    | `staffOnly` | +10 к лечению Поддержкой                       |
| `sp_heavenly`   | Общий лай          | 2   | heal    | `staffOnly` | При лечении +10 HP всем остальным союзникам    |

## Поддержки (`ASSISTS`)

| id                                        | Название (RU)                                         | Вид          | SP  | Ограничение                | Эффект                                             |
| ----------------------------------------- | ----------------------------------------------------- | ------------ | --- | -------------------------- | -------------------------------------------------- |
| `as_rally_atk` / `_spd` / `_def` / `_res` | Подбодрить: атака / скорость / защита / сопротивление | `rally`      | 150 | —                          | +4 к стату союзнику до начала вашей следующей фазы |
| `as_swap`                                 | Поменяться                                            | `swap`       | 150 | —                          | Обмен местами                                      |
| `as_reposition`                           | Перестановка                                          | `reposition` | 150 | —                          | Союзник переходит на клетку позади бойца           |
| `as_drawback`                             | Оттащить                                              | `drawBack`   | 150 | —                          | Шаг назад, союзник следует                         |
| `as_pivot`                                | Пируэт                                                | `pivot`      | 150 | —                          | Прыжок за союзника                                 |
| `as_shove`                                | Толкнуть                                              | `shove`      | 150 | —                          | Союзник сдвигается на 1 клетку                     |
| `as_smite`                                | Пнуть                                                 | `smite`      | 150 | —                          | Союзник сдвигается на 2 клетки                     |
| `as_heal`                                 | Перевязать                                            | `heal`       | 0   | `staffOnly`                | 5 + `healPower`                                    |
| `as_mend`                                 | Зализать                                              | `heal`       | 150 | `staffOnly`                | 7 + `healPower`                                    |
| `as_recover`                              | Залатать                                              | `heal`       | 300 | `staffOnly`                | 15 + `healPower`                                   |
| `as_dance`                                | Мурлыканье                                            | `refresh`    | 0   | `dancerOnly`               | Союзник действует ещё раз                          |
| `as_ardent`                               | Отдать вкусняшку                                      | `sacrifice`  | 150 | —                          | −10 HP себе, +10 союзнику                          |
| `as_reciprocal`                           | Поменяться шкурой                                     | `reciprocal` | 150 | `stage: v1.1` (не в пулах) | Обмен HP                                           |

Механика каждого вида описана в [battle.md](battle.md#поддержка-planassist).

## Рецепт: новый навык

1. **Пассивка.** Добавить объект `PassiveDef` в `PASSIVES` ([passives.ts](../src/game/content/skills/passives.ts)). Нужны:
   - уникальный `id` с префиксом слота: `a_*`, `b_*`, `c_*`;
   - `slot`, `tier` и `spCost` по тиру: 1 → 120, 2 → 200, 3 → 300;
   - `stage: "v1"`, потому что `"v1.1"` скрывает навык из пулов;
   - `hooks`;
   - при необходимости `allow`.
2. **Спецприём.** Объект `SpecialDef` в `SPECIALS` ([specials.ts](../src/game/content/skills/specials.ts)) с `kind` и блоком `offense`, `defense` или `heal`. Лечебному нужен `staffOnly: true`, иначе он попадёт к бойцам без посоха.
3. **Поддержка.** Объект `AssistDef` в `ASSISTS` ([assists.ts](../src/game/content/skills/assists.ts)) с существующим `kind`.
4. **Новая механика.** Если существующих хуков или видов не хватает:
   - добавить поле в `SkillHooks` или вариант в `AssistKind` ([core/skills/types.ts](../src/game/core/skills/types.ts));
   - вызвать его в движке: `simulateCombat` или `applyCombatMods` в [core/combat](../src/game/core/combat/index.ts), `startPhase`, `killUnit` или `applyAction` в [reducer.ts](../src/game/core/battle/reducer.ts), `planAssist` в [assist.ts](../src/game/core/battle/assist.ts) (у `switch` нет `default`, и TypeScript потребует ветку), агрегатор в [engine.ts](../src/game/core/skills/engine.ts);
   - для нового `kind` Поддержки проверить выбор XP в ветке `assist` редьюсера.
5. **i18n.** `name` и `desc` пишутся геттерами: `get name() { return tr("English", "Русский") }`. Только так текст переключается вместе с языком. Обычная строка годится лишь для нейтрального текста вроде `"+3 Spd."`.
6. **ИИ.** Учитывает навык автоматически через `simulateCombat`. Поддержки ИИ применяет только вида `heal` и `refresh` ([ai.md](ai.md)).
7. **Сейвы.** Новый id миграции не требует. **Переименование или удаление id ломает старые сейвы**: `passiveDef`, `specialDef` и `assistDef` бросают `unknown ...`. В этом случае нужна миграция в [core/save/index.ts](../src/game/core/save/index.ts) и повышение `SAVE_VERSION`.
8. **Тесты.** [tests/game/content.test.ts](../tests/game/content.test.ts) проверяет:
   - что id уникальны среди `WEAPONS`, `SPECIALS`, `ASSISTS` и `PASSIVES` вместе;
   - минимальные объёмы: ≥ 12 спецприёмов, ≥ 12 Поддержек, ≥ 8 пассивок на каждый слот;
   - `skillCost` и `slotOf` для `COMMON_SKILLS`.

   Поведение проверяется в [tests/game/combat.test.ts](../tests/game/combat.test.ts) через хелперы [tests/game/helpers.ts](../tests/game/helpers.ts), в которых есть `skills: Partial<UnitSkills>`.

9. **Синхронизация.** `src/game` и `tests/game` синхронизируются из next-instapok, поэтому ту же правку нужно внести и там.

## Где менять

- Таблицы навыков: [passives.ts](../src/game/content/skills/passives.ts), [specials.ts](../src/game/content/skills/specials.ts), [assists.ts](../src/game/content/skills/assists.ts).
- Контракт хуков: [core/skills/types.ts](../src/game/core/skills/types.ts). Сборка и агрегаторы: [core/skills/engine.ts](../src/game/core/skills/engine.ts).
- Вызовы хуков в бою: [core/combat/index.ts](../src/game/core/combat/index.ts), [core/battle/reducer.ts](../src/game/core/battle/reducer.ts), [core/map/pathing.ts](../src/game/core/map/pathing.ts) (`passThrough`, ход).
- Пулы, цены и изучение: `allowedSkillIds`, `COMMON_SKILLS`, `learnSkill`, `equipSkill` в [core/units/index.ts](../src/game/core/units/index.ts). Константы SP: `SP` в [balance.ts](../src/game/content/balance.ts).
- Тесты: [content.test.ts](../tests/game/content.test.ts), [combat.test.ts](../tests/game/combat.test.ts), [battle.test.ts](../tests/game/battle.test.ts).
