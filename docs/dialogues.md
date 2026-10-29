# Диалоги, сюжетные факты и болтовня поселения

В поселении говорят тремя способами:

1. Разговор с жителем в духе визуальной новеллы. Игрок тапает по жителю, и снизу открывается окно с портретом; в сцене 2–3 реплики.
2. Бормотание рыбака: случайные реплики в облачке над головой.
3. Сплетники: двое перекидываются настоящими цитатами из `quotes.json`.

Какую сцену показать, решают правила над «фактами» — счётчиками событий в сейве (`story`) и производными значениями из сейва.

## Файлы

| Файл                                                                                                       | Что внутри                                                                                       |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [content/dialogues.ts](../src/game/content/dialogues.ts)                                                   | `SCENES` (сцены жителей), `FISHER_MUTTERS`, типы `DialogueScene`, `DialogueLine`, `Speaker`      |
| [core/story/conditions.ts](../src/game/core/story/conditions.ts)                                           | условия `Cond`, помощники `atLeast`, `atMost`, `seen`, функции `check`, `specificity`            |
| [core/story/facts.ts](../src/game/core/story/facts.ts)                                                     | события `GameEvent`, `eventCounters`, `recordEvent`, `factsOf`                                   |
| [core/story/dialogue.ts](../src/game/core/story/dialogue.ts)                                               | выбор сцены: `pendingStories`, `hasNewStory`, `pickScene`                                        |
| [state/dialogue.ts](../src/game/state/dialogue.ts)                                                         | атом `$dialogue`, `canTalk`, `npcStoryAlerts`, `openDialogue`, `advanceDialogue`, `skipDialogue` |
| [ui/settlement/DialogueBox.tsx](../src/game/ui/settlement/DialogueBox.tsx)                                 | окно разговора                                                                                   |
| [content/quotes.ts](../src/game/content/quotes.ts), [content/quotes.json](../src/game/content/quotes.json) | цитаты сплетников                                                                                |
| [scene/settlement/speech.ts](../src/game/scene/settlement/speech.ts)                                       | облачка реплик (`SpeechBubbles`)                                                                 |
| [scene/settlement/gossips.ts](../src/game/scene/settlement/gossips.ts)                                     | сплетники (`Gossips`)                                                                            |
| [content/settlement.ts](../src/game/content/settlement.ts)                                                 | `NPCS`, `FISHER`, `MUTTER_TIMING`, `GOSSIPS`, `GOSSIP_SPOTS`, `GOSSIP_GAP`, `GOSSIP_TIMING`      |

## Сцены жителей

```ts
interface DialogueScene {
  id: string; // уникальный; по нему пишется seen.<id>
  npc: string; // id из NPCS
  when?: Cond[]; // все условия должны выполняться; нет — сцена фоновая
  once?: boolean; // по умолчанию true для сцен с when; false — повторяемая, пока условие верно
  priority?: number; // по умолчанию 0
  lines: () => DialogueLine[]; // функция: tr() вычисляется на текущем языке
}
interface DialogueLine {
  who: 'npc' | 'hero';
  text: string;
}
```

Сейчас в `SCENES` 19 сцен. У каждого из шести жителей (`sergeant`, `trader`, `coach`, `keeper`, `barkeep`, `scout`) есть 2–3 фоновые. Сюжетных шесть:

| id                     | условие                                                       | особенность    |
| ---------------------- | ------------------------------------------------------------- | -------------- |
| `sergeant.first_win`   | `atLeast("sortie.victory", 1)`                                |                |
| `sergeant.veteran`     | `seen("sergeant.first_win")`, `atLeast("sortie.victory", 25)` | цепочка        |
| `scout.ten_sorties`    | `atLeast("sortie.started", 10)`                               |                |
| `keeper.first_grave`   | `atLeast("memorial", 1)`                                      |                |
| `barkeep.upgraded`     | `atLeast("building.level.tavern", 2)`                         |                |
| `barkeep.pale_ale_100` | `atLeast("drink.drunk.pale_ale", 100)`                        | `priority: 10` |

### Как выбирается сцена (`core/story/dialogue.ts`)

1. **Сюжетная** сцена — та, у которой есть `when` и `once !== false`. Она годится, если ещё не в `story.seen` и `check({ all: when }, factsOf(save))` выполняется.
2. `pendingStories(save, npcId)` сортирует годные сюжетные сцены:
   - по `priority`, больший раньше;
   - по `specificity` — числу простых условий; у `any` берётся максимум, у `not` — специфичность вложенного;
   - по порядку в `SCENES`.
3. `pickScene` берёт первую сюжетную сцену. Если сюжетных нет, берёт фоновую по кругу: `idle[talk.<npcId> % idle.length]`. Сюда же попадают сцены с `when` и `once: false`, пока их условие верно.
4. `hasNewStory` зажигает «!» над жителем: `npcStoryAlerts()` → `opts.npcAlerts` сцены, опрос раз в 0,5 с.

Схема похожа на правила с критериями (Valve) и storylets (Yarn Spinner, Failbetter): контент — данные, а логика о конкретных сценах ничего не знает.

### Поток разговора

1. Игрок тапает по жителю. `SettlementScene.tapAt` спрашивает `opts.canTalk(npcId)`: включены ли диалоги в настройках (`settings.dialogues`, по умолчанию `true`) и есть ли сцена. Если говорить нечего, тап ведёт героя к месту жителя и открывает карточку.
2. Герой подходит ближе чем на 2,4 клетки (`closeTo`), поворачивается к жителю и вызывает `onTalk`. Затем `closePanel()` и `openDialogue(npcId)`.
3. `openDialogue`:
   - вызывает `recordEvent(save, { type: "talked", npcId, sceneId })`. Это добавляет к `talk` и `talk.<npcId>` по единице и сразу помечает сцену увиденной: если игрок её пропустит, сюжет не застрянет;
   - кладёт `{ npcId, sceneId, lines, index: 0 }` в `$dialogue`. Строки вычисляются один раз, на текущем языке.
4. `DialogueBox`:
   - портрет жителя (`critterPortraitSvg`) слева, героя (`heroPortraitSvg`) справа;
   - текст печатается со скоростью 45 символов в секунду; с `prefers-reduced-motion` появляется сразу;
   - тап или Пробел/Enter допечатывает реплику, повторное нажатие — следующая (`advanceDialogue`); Esc или «Пропустить» закрывают (`skipDialogue`).

   Пока `$dialogue` не пуст, сцена на паузе.

## Факты (`core/story/facts.ts`)

Игра сообщает о событиях через `recordEvent(save, GameEvent)`. Это чистая функция, она возвращает новый сейв. Счётчики иерархические: общий плюс уточнённые.

| Событие          | Где пишется                                                                 | Счётчики                                                                                                                                                                  |
| ---------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sortieStarted`  | `startBattle` ([state/save.ts](../src/game/state/save.ts))                  | `sortie.started`, `sortie.started.<mode>`, `sortie.started.<difficulty>`                                                                                                  |
| `sortieFinished` | `finishBattle`                                                              | `sortie.finished`, `sortie.<result>`, `sortie.<result>.<mode>`, `sortie.<result>.<difficulty>`, `kills` (+N), `fallen` (+N). `result` — `victory`, `defeat` или `retreat` |
| `drinkOrdered`   | `orderDrinkAction` ([state/settlement.ts](../src/game/state/settlement.ts)) | `drink.ordered`, `drink.ordered.<id>`                                                                                                                                     |
| `drinkDrunk`     | `startBattle`, если была заказана кружка                                    | `drink.drunk`, `drink.drunk.<id>`                                                                                                                                         |
| `built`          | `buildAction`                                                               | `building.built`, `building.built.<id>`                                                                                                                                   |
| `upgraded`       | `upgradeAction`                                                             | `building.upgraded`, `building.upgraded.<id>`                                                                                                                             |
| `talked`         | `openDialogue`                                                              | `talk`, `talk.<npcId>`, и `sceneId` добавляется в `story.seen`                                                                                                            |

`factsOf(save)` складывает счётчики с производными фактами. Производные не копируются в счётчики — у правды один источник:

- `building.level.<id>`;
- `glory`, `treats`;
- `army.size`, `army.maxLevel`;
- `memorial` — сколько бойцов погибло (записи `save.memorial` с `reason: "killed"`; отпущенные не в счёт);
- `seen.<sceneId>` = 1.

Если факта нет, он равен 0.

Условия (`Cond`) — данные, а не функции. Простое условие — `{ fact, gte?, lte?, eq? }`. Есть составные `{ all }`, `{ any }`, `{ not }`. Помощники:

- `atLeast(fact, n)`;
- `atMost(fact, n)`;
- `seen(sceneId)` — то же, что `{ fact: "seen.<id>", gte: 1 }`.

Сейв: `story: { counters: Record<string, number>, seen: string[] }`, схема в [core/save/index.ts](../src/game/core/save/index.ts). Миграция v10→v11 восстанавливает `sortie.started`, `sortie.finished`, `sortie.victory`, `kills` и `fallen` из `stats`.

## Облачка реплик (`SpeechBubbles`)

- Облачка общие для рыбака и сплетников. `show(owner, head, text, hold, { fill, italic, caption })`:
  - у владельца одно облачко, новое сменяет старое;
  - размер экранный: масштаб `1/zoom` на момент показа;
  - перенос по ширине 190 px;
  - плашка прижимается внутрь экрана (`fit` в каждом кадре), хвостик остаётся над головой.
- Тап по облачку закрывает его (`tap`).
- `has(owner)` и `clear(owner)` использует сплетник.

## Рыбак

`FISHER_MUTTERS()` — 12 строк через `tr`, у каждой ≤ 70 символов на обоих языках (тест в `settlementMap.test.ts`).

`SettlementScene.mutter()` перемешивает номера реплик (`Phaser.Utils.Array.Shuffle`) и выдаёт их без повторов, пока не кончится круг. Новый круг не начинается с последней показанной.

Тайминг `MUTTER_TIMING`:

- первая реплика через 3 с;
- облачко держится `3.5 + 0.045 × длина` с;
- пауза 7–13 с.

В паузе сцены бормотание откладывается на 1 с. Тап по рыбаку сразу вызывает следующую реплику.

## Сплетники и цитаты

`GOSSIPS`:

- `elman` — «Гламурная Киса Эльман», облачко `0xffd9e8`;
- `vanya` — «Рыжий пёс Ваня», облачко `0xffe6c8`.

Класс `Gossips` ([gossips.ts](../src/game/scene/settlement/gossips.ts)) управляет ими так:

- **Место.** `pickSpot` выбирает из `GOSSIP_SPOTS` место, где оба стоят дальше 2 клеток от героя и которое не совпадает с текущим. Раз в `GOSSIP_TIMING.move` = 70–110 с, когда оба молчат, пара растворяется в дымке и появляется на другом месте (`relocate`).
- **Речь.** Цитаты загружаются отдельным чанком (`loadQuotes()` → `import("./quotes.json")`). Говорят по очереди (`turn`):
  - первая реплика через 4 с;
  - облачко держится `3 + 0.05 × длина` с;
  - пауза 0,8–2,2 с.

  Цитата берётся из перемешанного «мешка» индексов: повторов нет, пока не прозвучат все. Говорят только вдвоём.

- **Тапы.** Тап подбрасывает сплетника, на 4-м он краснеет, на 5-м (`GOSSIP_TIMING.taps`) взрывается: вспышка, клочья шерсти, дым, подпалина, `deathSfx("explosion")`, тряска камеры. Взорвавшийся пропадает до следующего захода в поселение, второй замолкает.
- Сплетники блокируют героя (`blockers()`). Тап по облачку и по сплетнику обрабатывается раньше тапа по жителю или зданию.

### Формат `quotes.json`

Файл — массив объектов `Quote` ([quotes.ts](../src/game/content/quotes.ts)):

```json
{
  "id": "waters-001",
  "ru": "Я не влюблялась целых три дня!",
  "en": "I haven't fallen in love for three whole days!",
  "original": "en",
  "source": { "ru": "Джон Уотерс — Pink Flamingos (1972)", "en": "John Waters — Pink Flamingos (1972)" },
  "speaker": "Divine",
  "context": null,
  "url": "https://en.wikiquote.org/wiki/Pink_Flamingos"
}
```

- `original` — язык оригинала; второй язык — перевод.
- `speaker` — персонаж, если это реплика из фильма.
- `context` — передача, интервью, год.
- `url` — где цитата найдена дословно. Правило файла: только настоящие цитаты.

Сейчас в файле 389 цитат. По префиксу `id`: `waters-` — 251, `letuchaya-` — 98, `piskun-` — 34, `lalki-` — 6. Оригиналов на английском 251, на русском 138. Самая длинная цитата — 105 символов.

`quoteLine(q)` возвращает текст и подпись источника на текущем языке (`lang()`). Подпись показывается мелким курсивом под репликой: «— источник».

Тесты ([gossips.test.ts](../tests/game/gossips.test.ts)) требуют:

- уникальные `id`;
- непустые `ru` и `en`;
- `original` ∈ {`ru`, `en`};
- источник на обоих языках;
- `url` вида `http(s)://`;
- длину ≤ 160 символов;
- отсутствие дубликатов текста оригинала после нормализации (регистр, пунктуация).

## Локализация

- Все строки контента идут через `tr(en, ru)` из [@game/i18n](../src/game/i18n/index.ts).
- Поля с текстом — геттеры (`get name()`) или функции (`lines: () => …`, `FISHER_MUTTERS()`). Так текст вычисляется на языке, который выбран сейчас, а не при загрузке модуля.
- Цитаты двуязычны в самих данных (`ru` и `en`), язык выбирает `quoteLine`.
- Язык хранится в `settings.lang` (`en` или `ru`).

## Где менять

- **Новая или изменённая сцена жителя** — `SCENES` в [content/dialogues.ts](../src/game/content/dialogues.ts). Новые факты и события — `GameEvent` и `eventCounters`, а также `factsOf` в [core/story/facts.ts](../src/game/core/story/facts.ts). Событие должно записываться через `recordEvent` в месте, где оно происходит (`state/save.ts`, `state/settlement.ts`).
- **Правила выбора** — [core/story/dialogue.ts](../src/game/core/story/dialogue.ts). Условия — [core/story/conditions.ts](../src/game/core/story/conditions.ts).
- **Окно разговора** — [DialogueBox.tsx](../src/game/ui/settlement/DialogueBox.tsx). Стили `.dlg-*` — [village.css](../src/game/ui/village.css).
- **Бормотание рыбака** — `FISHER_MUTTERS` и `MUTTER_TIMING`.
- **Цитаты** — [quotes.json](../src/game/content/quotes.json). Ритм, места и тапы сплетников — `GOSSIP_TIMING` и `GOSSIP_SPOTS`; поведение — [gossips.ts](../src/game/scene/settlement/gossips.ts).
- **Проверка** — `pnpm vitest run tests/game/dialogue.test.ts tests/game/gossips.test.ts tests/game/settlementMap.test.ts`.
- Всё это лежит в `src/game` и синхронизируется из `next-instapok`.
