# Тестирование

Юнит- и property-тесты пишутся на Vitest и fast-check и запускаются в окружении `node`. Браузерные смоуки на playwright-core гоняют полный цикл игры по собранному preview. Тесты игры синхронизируются из next-instapok (`tests/unit/game` → `tests/game`), тесты платформы лежат в `tests/host`.

## Vitest

[vitest.config.ts](../vitest.config.ts):

- `include`: `tests/**/*.test.ts`, `tests/**/*.spec.ts`;
- `environment: "node"`, DOM нет;
- `testTimeout: 20_000` — на медленных раннерах CI генерация карт и property-тесты идут в 3–4 раза дольше;
- алиасы — `ALIASES` из `vite.config.ts`;
- покрытие (`pnpm test:coverage`, v8) считается только по `src/game/core/**` и `src/game/content/**`.

Команды:

```bash
pnpm test                                        # все
pnpm vitest run tests/game/save.test.ts          # один файл
pnpm vitest run -t "редьюсер боя"                # по имени теста
pnpm test:watch
pnpm test:coverage
```

## Что где

- [tests/game/helpers.ts](../tests/game/helpers.ts) — фабрики боя:
  - `TestUnitSpec` (`classId` вида `infantry_sword`, `armored_spear`, `flier_bow`, `dancer_sword`; `pos`, `baseStats` в шкале FEH и т.п.);
  - подбор статов модели под нужные боевые (`pinnedModelStats` через `MODEL_SCALE`);
  - сборка `BattleState` через `createBattle`.
- Сейв: [save.test.ts](../tests/game/save.test.ts). Проверяются round-trip, битый JSON, миграции 6→7 и 7→8, настройка `endTurnConfirm`. Миграция 10→11 — в [dialogue.test.ts](../tests/game/dialogue.test.ts).
- Роутер: [router.test.ts](../tests/game/router.test.ts) (шаги вылазки, неизвестная сложность).
- i18n: [i18n.test.ts](../tests/game/i18n.test.ts) (`tr`, `plural`, `lang` по умолчанию в старом сейве).
- Управление боем: [battleUi.test.ts](../tests/game/battleUi.test.ts) (выбор, хлипкие стены, перетаскивание, справка о клетке, союзники).
- PWA: [tests/host/pwa.spec.ts](../tests/host/pwa.spec.ts) (`isIosDevice`, `installModeFor`, `shouldCheckUpdate`).
- Остальное (бой, ИИ, карты, юниты, поселение, кровь, варианты смерти) покрывают параллельные документы по ядру.

Имена `describe`/`it` пишутся по-русски.

## Смоук-тесты

Нужен собранный preview с base `/my-fe/`:

```bash
VITE_BASE_PATH=/my-fe/ pnpm build && VITE_BASE_PATH=/my-fe/ pnpm preview   # в одном терминале
pnpm smoke        # tools/smoke.mjs: меню → новая игра → поселение → Лавка → вылазка → бой → сдача → итоги → перезагрузка
pnpm smoke:tg     # tools/smoke-telegram.mjs: мок window.Telegram.WebApp — сейв по user id, CloudStorage, «Назад», конфликт
pnpm smoke:pwa    # tools/smoke-pwa.mjs: сам поднимает preview; SW → офлайн → перезагрузка → бой из кэша
```

- Свой Chromium задаётся через `CHROMIUM_PATH=/path/to/chrome`. При падении `smoke.mjs` сохраняет скриншот в `/tmp/smoke-fail.png`.
- Смоуки управляют игрой через `window.__pf` (см. [ui-and-routing.md](ui-and-routing.md)) и ищут кнопки по английским подписям: язык по умолчанию — `en`.

## Перед коммитом

```bash
pnpm lint && pnpm test && pnpm typecheck
```

CI делает то же (`lint`, `test`, `build` с typecheck и `check-sw`). Если меняли платформу, роутинг, сейв или `__pf`, прогоните ещё `pnpm build` и смоуки: в CI их нет.

## Где менять

- Конфиг: [vitest.config.ts](../vitest.config.ts).
- Тесты игры: [tests/game](../tests/game). Их перезаписывает синхронизация, поэтому дублируйте их в next-instapok.
- Тесты платформы: [tests/host](../tests/host).
- Смоуки: [tools/smoke.mjs](../tools/smoke.mjs), [tools/smoke-telegram.mjs](../tools/smoke-telegram.mjs), [tools/smoke-pwa.mjs](../tools/smoke-pwa.mjs).
