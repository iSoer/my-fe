---
name: add-building
description: Пошаговый рецепт добавления новой постройки в поселение (BuildingId, BUILDINGS, участок на карте SETTLEMENT_TILES/PLOTS, NPC, SVG-арт, BuildingPanel, схема сейва + миграция, тесты). Использовать, когда просят добавить здание/постройку/дом в деревню, поселение или village.
---

# Добавление постройки в поселение

Подробное описание системы лежит в `docs/settlement.md`. Сначала прочитай его, а потом сверяйся с кодом: номера строк ниже ориентировочные.

## 0. Перед началом

- `src/game` синхронизируется из `../next-instapok` (`pnpm sync:game` **удаляет** лишние файлы). Сейчас my-fe опережает next-instapok, и правки обычно идут здесь. Если пользователь не сказал явно, уточни, в каком репозитории править. Никогда не запускай `pnpm sync:game` без явной просьбы.
- Стиль в `src/game`: двойные кавычки, без точек с запятой. Не форматируй Prettier'ом.
- Все строки пишутся через `tr(en, ru)` из `@game/i18n`. Имена в `BUILDINGS` оформляются геттерами (`get name() { return tr(...) }`), чтобы язык переключался на лету.
- Выясни у пользователя или придумай сам: id (латиница, camelCase), назначение, 5 цен `cost`, `requires`, параметры по уровням 1…5 (`BUILDING_MAX_LEVEL`).

## 1. Тип и определение

1. В `src/game/core/types.ts` добавь id в union `BuildingId` (`"barracks" | "training" | "store" | "graveyard" | "tavern"`).
2. В `src/game/content/settlement.ts`:
   - Заведи таблицу уровней по образцу `BARRACKS`, `TRAINING`, `STORE`, `GRAVEYARD`: массивы длиной 5, значение берётся через `atLevel(table, level)`.
   - Добавь запись в `BUILDINGS: Record<BuildingId, BuildingDef>`. TypeScript сам потребует её.
     ```ts
     forge: {
       id: "forge",
       icon: "⚒️",
       get name() { return tr("Forge", "Кузня") },
       get short() { return tr("Forge", "Кузня") },
       get desc() { return tr("…", "…") },
       cost: [200, 300, 600, 1000, 1800],   // [0] постройка, [n] улучшение n→n+1
       requires: { barracks: 2 },
       stats: level => [{ label: tr("Bonus", "Бонус"), value: String(atLevel(FORGE.bonus, level)) }]
     },
     ```

## 2. Место на карте

Всё лежит в `src/game/content/settlement.ts`.

- `SETTLEMENT_TILES` — ASCII-карта 33×15 из трёх экранов по `SCREEN_W = 11` клеток. Легенда: `#` участок, `D` вход на участок, `F` частокол, `T` дерево, `~` пруд, `b` куст, `g` ограда кладбища (всё это непроходимо); `.` трава, `=` тропинка, `*` цветы (проходимо).
- Свободных блоков `#` нет. Вырежи новый прямоугольник `#` с одной `D` в нижнем ряду и подведи к `D` тропинку `=`. Все строки должны остаться одной длины, равной `SETTLEMENT_W`. Если расширяешь карту, обнови `SETTLEMENT_W` и проверь экраны и камеру (тесты `settlementMap`).
- Добавь в `PLOTS` запись `{ id: "plot-forge", building: "forge", x, y, w, h, front: frontOf(x, y, w, h) }`. Координаты и размер должны совпадать с блоком `#`.
- По желанию добавь хозяина в `NPCS` с `place: "plot-forge"`.
- Проверь, что `GOSSIP_SPOTS`, `HERO_START`, `HERO_RETURN` и `FISHER` не попали на непроходимые клетки.

## 3. Логика и состояние

- Правила здания (эффекты уровня, взаимодействие с ростером или сейвом) пиши в `src/game/core/settlement/index.ts`. Побочные эффекты смены уровня добавляй в `afterLevelChange`.
- В `src/game/state/settlement.ts` дополни `placeAlerts(...)`: `Record<SettlementPlace, boolean>` потребует ключ. Если здание даёт игроку действие, добавь его в экшены и в `window.__pf.settlement` (`src/game/GameRoot.tsx`).

## 4. Арт и сцена

- В `src/game/art/village.ts` напиши SVG-функцию `village<Name>Svg(..., wear)` или переиспользуй `villageHouseSvg({ w, h, roof, wall, npc, wear })`, расширив union `HouseArt.npc`. `wear` — степень разрушения из `buildingWear(level)`: целым здание не бывает никогда. Добавь `case` в `villageBuildingSvg(id, w, h, level)` там же (спрайт уровня; его используют и сцена, и галерея).
- В `src/game/scene/settlement/SettlementScene.ts` добавь `case` в `buildingOver` (на сколько клеток спрайт выступает над участком). Обе функции — исчерпывающие `switch`, их проверяет TS.

## 5. UI

- В `src/game/ui/settlement/BuildingPanel.tsx` добавь компонент `<Name>Section` и `case "forge"` в `buildingSection` — это исчерпывающий `switch` с проверкой `never`, без ветки TS не скомпилирует.
- Нижняя панель поселения подстраивается сама: число колонок `--st-buildings` = `BUILDING_IDS.length` (ставит `SettlementScreen`, CSS в `src/game/ui/village.css`). Проверь только, что подписи помещаются на узком экране.

## 6. Сейв (обязательно)

Схема лежит в `src/game/core/save/index.ts`.

- В `settlementSchema.buildings` добавь `forge: buildingSchema.optional()`. **Без этого zod молча выбросит постройку при загрузке**, игрок потеряет купленное здание, и ни один тест этого не заметит.
- Подними `SAVE_VERSION` на 1 и добавь миграцию в таблицу `MIGRATIONS`: `N: (old) => ({ ...old, version: N + 1 })` с комментарием `// vN → vN+1: …` (образец — миграция 9 → 10 для таверны). Если появилось новое обязательное состояние, миграция должна его заполнить.
- Добавь тест миграции в `tests/game/save.test.ts`.

## 7. Тесты

- `tests/game/settlementMap.test.ts`: `ALL_BUILT` строит все `BUILDING_IDS` сам — проверь тесты проходимости и экранов.
- `tests/game/settlement.test.ts`: тесты правил здания, цен и `requires`.
- Запусти:
  ```bash
  pnpm vitest run tests/game/settlement.test.ts tests/game/settlementMap.test.ts tests/game/save.test.ts tests/game/gossips.test.ts
  pnpm typecheck && pnpm lint && pnpm test
  ```

## 8. Визуальная проверка

- Запусти `pnpm dev` и открой `http://localhost:5173/#/village`.
- В консоли:
  - выдай вкусняшки через `__pf.save`;
  - построй здание: `__pf.settlement.build("forge")`;
  - улучшай его через `__pf.settlement.upgrade("forge")` и проверь все 5 стадий `wear`;
  - подойди к участку: `__pf.settlement.teleport("plot-forge")`.
- Все уровни спрайта разом — в галерее: `http://localhost:5173/tools/gallery/index.html`, секция «здание: forge».
- Скрин или полный цикл: `pnpm smoke` (см. `docs/testing.md`).

## 9. Документация

Обнови `docs/settlement.md`: таблицу зданий, карту и раздел «Где менять». Подробнее — в скиле `update-docs`.
