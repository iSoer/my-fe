# Сейвы

Весь прогресс — один объект `SaveGame`. Его тип задан в [core/types.ts](../src/game/core/types.ts), zod-схема `saveSchema` — в [core/save/index.ts](../src/game/core/save/index.ts). Сейв версионируется (`SAVE_VERSION = 15`), старые версии мигрируются по шагам. Хранится в `localStorage`, в Telegram дополнительно зеркалится в CloudStorage. Игра пишет сейв после каждого действия.

## Схема

`saveSchema` в [core/save/index.ts](../src/game/core/save/index.ts). Поля верхнего уровня:

| Поле                                          | Содержимое                                                                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `version`, `updatedAt`                        | Версия формата и время последнего изменения (`updatedAt` ставит `updateSave`)                                                              |
| `profile`                                     | `glory`, `treats`, `wins` по сложностям, `armiesCreated`, `startedAt?` (признак начатой игры, `gameStarted`), `maxRarity` (по умолчанию 1) |
| `army?`                                       | Ростер: `units[]` (`unitSchema`), `squadIds`, счётчики                                                                                     |
| `battle?`                                     | Идущий бой `BattleState` (`battleSchema`, внутри `mapSchema`, `battleUnitSchema`, `roster`)                                                |
| `shelter`                                     | Витрина найма: `candidates[]`, `seed`                                                                                                      |
| `inventory`                                   | `Record<itemId, count>`                                                                                                                    |
| `store`                                       | Витрина Лавки: `seed`, `weapons`, `talismans`, `fresh`, `period`, `salt`                                                                   |
| `settlement`                                  | Здания (`barracks`, `training`, `store`, `graveyard`, `tavern`), тренировки, `hero?`, `drink?`, `lastReviveAt?`                            |
| `memorial`                                    | Кладбище (`memorialSchema`: юнит, причина `killed`/`released`, `revivedAt?`)                                                               |
| `achievements`, `stats`                       | Достижения и общая статистика                                                                                                              |
| `settings`                                    | `settingsSchema`; поля `endTurnConfirm`, `dialogues`, `lang`, `graphics` (качество графики Phaser-сцен, `"auto"`) берут значение через `.default()`                                             |
| `story`                                       | Сюжетные факты: `counters`, `seen`                                                                                                         |
| `pendingBattle?`                              | Разведанный бой: `seed`, `difficulty`, `biomeId`, `team` (по умолчанию 0), `map`                                                           |
| `sortieSeed?`, `rewardChoice?`, `lastBattle?` | Сид вражеских команд вылазки, выбор награды-персонажа, итоги прошлого боя                                                                  |

Внутри схем есть совместимость без смены версии:

- `partialStats` раскладывает старый `atk` на `str` и `mag`.
- `withSkillXp` достраивает `skillXp` бойцам без него.
- `expedition` превращает старое поле `exit` в массив `exits`.
- `.default(...)` у полей, добавленных позже.

`createEmptySave(now)` создаёт новый сейв.

## Версии и миграции

`MIGRATIONS[v]` переводит сейв из версии `v` в `v + 1`. `migrate()` применяет шаги, пока `version < SAVE_VERSION`. `MIN_SAVE_VERSION = 4`: версии 1–3 `parseSave` отклоняет с понятной ошибкой.

| Шаг     | Что делает                                                                                                                                                                                                                                                                                                        |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4 → 5   | Армия становится ростером. Из `profile` убираются `rosterRerolls`, `freeRerolls`, `hiresSinceBattle`. `shelter` очищается. Удаляются `pendingRoster`, `battle`, `lastBattle`                                                                                                                                      |
| 5 → 6   | Оружие из навыков: изученные, но не экипированные варианты оружия уходят в `inventory`, id оружия вычищаются из `learned` и `learnable` у всех бойцов. Ставится `profile.startedAt`, если есть армия или бои. Создаются `store = EMPTY_STORE` и `village`. Бой получает `pack: {}`, `lastBattle.rewards.lost = 0` |
| 6 → 7   | Классы `commoner`, `noble`, `diviner` везде (рекурсивный обход) заменяются стартовым классом по `weaponSkill`: healer, mage, hunter, soldier, иначе gladiator                                                                                                                                                     |
| 7 → 8   | Предметы `itm_*` удаляются из инвентаря, `pack` — из `battle` и `pendingBattle`, `consumables` — из `store`                                                                                                                                                                                                       |
| 8 → 9   | Деревня становится поселением (`defaultSettlement`). Казармы получают уровень `barracksLevelFor(units.length)`. В начатой игре Лавка и Кладбище строятся на уровне 1. В `store` добавляются `period` и `salt`. Удаляется `village`                                                                                |
| 9 → 10  | Только номер версии: бар (`tavern`) и напитки необязательны                                                                                                                                                                                                                                                       |
| 10 → 11 | `story.counters` заполняются из `stats`: `sortie.started`, `sortie.finished`, `sortie.victory`, `kills`, `fallen`. `seen = []`                                                                                                                                                                                    |
| 11 → 12 | В `store` добавляются `rerolls = 0` и `variant = 0`: обновление витрины Лавки за Вкусняшки. Текущая витрина остаётся плановой выкладкой своего периода |
| 12 → 13 | Убран бонус чащи «Живица» (`regen`): в идущей вылазке он пропадает у отряда и с земли, одиночка с ним оставит «Удачу» (`dropRegen`). В бою появилось необязательное `explore` (разведка); старый бой без него продолжается пошагово |
| 13 → 14 | Туман войны в чаще: необязательное `battle.revealed` (разведанные клетки). Миграция меняет только номер версии: в идущей вылазке из старого сейва тумана нет — видно всё поле. Версия поднята, чтобы старый клиент не прочитал новый сейв и не потерял разведанное |
| 14 → 15 | Настройка крови получила вариант «Выкл.» (`settings.blood: "off" | "pools" | "sea"`), он же по умолчанию; миграция выключает кровь и в старых сейвах |

`parseSave(json)` работает так: `JSON.parse`, затем проверка `MIN_SAVE_VERSION`, затем `migrate`, затем `saveSchema.safeParse`. Результат — `{ ok, save }` или `{ ok: false, error }`, в ошибке не больше 5 первых проблем zod. Сейв **новее** `SAVE_VERSION` отклоняется с `{ ok: false, newer: true, error }` (иначе zod молча отбросил бы незнакомые поля и сейв обрезался бы при первой записи). Результат `parseSave` возвращается без каста: если схема и тип `SaveGame` разойдутся, это ошибка компиляции.

Тесты миграций: 4→5, 5→6, 6→7, 7→8, 8→9, 9→10, 11→12, цепочка 4→12 целиком и отказ от сейва новой версии — [save.test.ts](../tests/game/save.test.ts); 10→11 — [dialogue.test.ts](../tests/game/dialogue.test.ts); 12→13 и 13→14 — [explore.test.ts](../tests/game/explore.test.ts); 14→15 — [save.test.ts](../tests/game/save.test.ts).

## Хранение

- Ключ `localStorage` — `pawfield:save:<namespace>` (`localKey()` в [platform/storage.ts](../src/game/platform/storage.ts)). Namespace задаёт `setStorageNamespace(userNamespace())` в [main.tsx](../src/main.tsx): id пользователя из `tg.initDataUnsafe.user.id` или `local`.
- `updateSave(fn)` ставит `updatedAt = Date.now()`, вызывает `$save.set` и `persist()` (сериализация и запись через 100 мс после последнего изменения).
- `flushPersist()` пишет сразу. Вызывается при `visibilitychange → hidden` (подписка в `initSave`), перед перезагрузкой обновления PWA (`beforeReload`) и в `resetProgress`/`importSaveCode`.
- `initSave()` загружает сейв. Если сейв повреждён, сырой JSON сначала копируется в `pawfield:backup:<namespace>` (`backupRawSave`; одна, последняя копия), ошибка с пометкой «копия сохранена» уходит в `$saveError` (тост на заставке), и начинается новая игра. `exportBackupCode()` отдаёт копию кодом для импорта (как `exportSaveCode`); в настройках ([SettingsScreen](../src/game/ui/screens/SettingsScreen.tsx)) есть кнопка «Показать копию повреждённого сейва», пока копия существует.
- Сейв более новой версии игры `initSave` не трогает: `$saveNewer = true`, `$saveStatus = "error"`, запись выключена (ни локально, ни в облако — зеркало пишет только в статусе `ready`).
- Экспорт и импорт — `exportSaveCode()` / `importSaveCode(code)`: base64 от UTF-8 JSON, экран [SettingsScreen](../src/game/ui/screens/SettingsScreen.tsx). Импорт ставит `updatedAt = Date.now()` (иначе более новый сейв другого устройства выиграл бы конфликт с облаком) и применяет настройку вибрации.

## Облако Telegram

[host/cloud.ts](../src/host/cloud.ts) и [host/sync.ts](../src/host/sync.ts):

- Формат: `LZString.compressToUTF16(json)` режется на чанки по `CLOUD_CHUNK = 4000` символов. Каждая запись — новое поколение `gen`: ключи `pf_s_<gen>_0`, `pf_s_<gen>_1`, …. Рядом лежит `pf_meta` = `{ version: 2, updatedAt, chunks, hash, gen, saveVersion }`, где `hash` — FNV-1a (`hashSave`) от сжатой строки, `saveVersion` — `SAVE_VERSION` записавшего клиента. Старый формат (meta `version: 1` без `gen`, чанки `pf_c_<i>`) читается и вычищается при следующей записи.
- `cloudStore(json, updatedAt, saveVersion)` пишет чанки нового поколения, затем переключает meta, затем удаляет чанки прочих поколений и старого формата (`staleChunkKeys`) — только если meta всё ещё наша. Прерванная запись или второе устройство не портят копию, на которую указывает meta. Если в облаке meta с `saveVersion` больше нашей, запись пропускается. Вызовы идут последовательно: пока идёт запись, новый вызов запоминается в `pending`, и пишется только последний.
- `cloudLoad` проверяет хэш. Если хэш не совпал, облака как будто нет (`null`).
- `startCloudMirror()` (после монтирования игры): подписка на `$save`. Обычные изменения уходят через `CLOUD_DEBOUNCE_MS = 3000`. Смена ключа боя `battle.id:result` (начало или конец боя) уходит сразу. `visibilitychange → hidden` (сворачивание Mini App) — тоже сразу.

## Конфликт сейвов

`reconcileCloudSave()` выполняется в `boot()` до монтирования игры и возвращает `{ kind: 'ok' | 'conflict' | 'newer' }`. Таймаут облака — `CLOUD_TIMEOUT_MS = 4000`.

0. Локальный или облачный сейв записан более новой версией игры (`newer`) — игра не стартует, показывается [NewerSaveScreen](../src/host/NewerSaveScreen.tsx) с кнопкой «Обновить и перезагрузить» (`updateAndReload` в pwa.ts), зеркало в облако не запускается.
1. В облаке пусто, оно повреждено или недоступно — грузится локальный сейв.
2. Локального нет или он битый — облачный JSON кладётся в `localStorage` (битый локальный сначала уходит в резервную копию), `initSave` его прочитает.
3. Облачный `updatedAt` больше локального больше чем на `CONFLICT_GAP_MS = 60_000` и сейвы различаются — показывается [ConflictScreen](../src/host/ConflictScreen.tsx) на языке локального сейва. Кнопка «Загрузить из облака» вызывает `chooseCloud` (пишет облачный JSON локально), «Оставить этот» ничего не пишет. После выбора игра стартует.
4. В остальных случаях выигрывает локальный сейв, и зеркало перезапишет облако.

Время сравнивается по часам устройств, слияния нет: последний записавший выигрывает.

## Как поменять форму сейва (рецепт)

1. Измените тип в [core/types.ts](../src/game/core/types.ts) (`SaveGame` и вложенные интерфейсы).
2. Измените zod-схему в [core/save/index.ts](../src/game/core/save/index.ts). `parseSave` возвращает `res.data` без каста, так что расхождение схемы и типа — ошибка `pnpm typecheck`.
3. Увеличьте `SAVE_VERSION` на 1 и допишите строку в JSDoc над ним.
4. Добавьте `MIGRATIONS[<старая версия>]`. Функция чистая, на входе `Record<string, unknown>`, не мутирует вход (`{ ...old }`), возвращает `version: <новая>`. Чисто аддитивное необязательное поле можно оформить как `.optional()` или `.default()` в схеме плюс пустую миграцию с номером (как 9→10).
5. Обновите `createEmptySave`, если у поля есть стартовое значение.
6. Тесты в [tests/game/save.test.ts](../tests/game/save.test.ts):
   - сейв прошлой версии (`{ ...JSON.parse(serializeSave(createEmptySave(1))), version: N }` с полями по-старому) проходит `parseSave` и мигрирует как нужно;
   - round-trip `serializeSave` → `parseSave` для нового сейва.
7. Если поле читает UI или хост, обновите [ConflictScreen](../src/host/ConflictScreen.tsx), [tools/smoke.mjs](../tools/smoke.mjs) и `window.__pf` (см. [ui-and-routing.md](ui-and-routing.md)).
8. Повысить `MIN_SAVE_VERSION` можно, только если вы сознательно отказываетесь от старых сейвов. Игроки получат новую игру.
9. `pnpm typecheck && pnpm test && pnpm lint`.

## Где менять

- Схема, версии, миграции, `parseSave`: [core/save/index.ts](../src/game/core/save/index.ts).
- Тип `SaveGame`, `DEFAULT_SETTINGS`: [core/types.ts](../src/game/core/types.ts).
- Загрузка, автосохранение, импорт и экспорт: [state/save.ts](../src/game/state/save.ts).
- Ключ хранилища: [platform/storage.ts](../src/game/platform/storage.ts).
- Облако и конфликт: [host/cloud.ts](../src/host/cloud.ts), [host/sync.ts](../src/host/sync.ts), [host/ConflictScreen.tsx](../src/host/ConflictScreen.tsx), [host/NewerSaveScreen.tsx](../src/host/NewerSaveScreen.tsx).
