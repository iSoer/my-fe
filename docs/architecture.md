# Архитектура

Cat Emblem (pawfield) — фронтенд-only тактика в духе Fire Emblem Heroes. Игра (`src/game`) не знает, где запущена; платформа (`src/host`, `src/main.tsx`, `src/sw.ts`) подключает Telegram Mini App, облачный сейв и PWA. Логика боя — чистый детерминированный редьюсер, Phaser только проигрывает его события.

## Слои

| Слой     | Где                                        | Что делает                                                                                                                          | Зависит от                           |
| -------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| core     | [src/game/core](../src/game/core)          | Чистая логика без DOM/Phaser: редьюсер боя, бой, ИИ, карты, навыки, юниты, предметы, поселение, сюжет, сейв                         | content, `@shared`, `@model`         |
| content  | [src/game/content](../src/game/content)    | Таблицы данных: классы, оружие, навыки, биомы, местность, предметы, баланс ([balance.ts](../src/game/content/balance.ts))           | —                                    |
| state    | [src/game/state](../src/game/state)        | nanostores-атомы, клей между core и UI; все игровые действия (`*Action`)                                                            | core, platform                       |
| scene    | [src/game/scene](../src/game/scene)        | Phaser-рендер: `MapScene`, `CinematicScene`, `GamePresenter`, эффекты; поселение — [scene/settlement](../src/game/scene/settlement) | state (чтение), core (типы)          |
| ui       | [src/game/ui](../src/game/ui)              | React-экраны и компоненты, читают сторы через `useStore`                                                                            | state                                |
| platform | [src/game/platform](../src/game/platform)  | localStorage, синтез звука, вибрация, хук хоста `setGameHost`                                                                       | —                                    |
| i18n     | [src/game/i18n](../src/game/i18n/index.ts) | `tr(en, ru)`, `plural`, `$lang`                                                                                                     | —                                    |
| host     | [src/host](../src/host)                    | Telegram WebApp, CloudStorage, PWA-баннеры, экран конфликта сейвов                                                                  | game (через публичные сторы/функции) |
| boot     | [src/main.tsx](../src/main.tsx)            | Порядок запуска, подключение хоста, кнопка «Назад» Telegram                                                                         | всё                                  |
| SW       | [src/sw.ts](../src/sw.ts)                  | Serwist: precache, офлайн, кэш SDK Telegram                                                                                         | —                                    |

Правило: `core` и `content` не импортируют `state`, `scene`, `ui`, `platform`-аудио и DOM. Это даёт детерминированные тесты и покрытие (`pnpm test:coverage` смотрит только на `core` и `content`).

## Поток данных в бою

```
тап / drag в MapScene или кнопка в UI
  → battleUi.ts (tapTile / confirm / endTurn / retreat) — локальная машина состояний UI
  → save.ts dispatchBattle(action)
      → core/battle/reducer.ts applyAction(BattleState, BattleAction) → { state, events: BattleEvent[] }
      → updateSave(): $save.set(...) + persist() в localStorage (дебаунс 100 мс)
      → host/sync.ts startCloudMirror(): зеркало в Telegram CloudStorage
  → battleUi.playEvents(events, before, after)
      → GamePresenter.play() — анимации на MapScene / CinematicScene, звук, вибрация
  → afterAction(): idle / ended / автозавершение хода / фаза врага (nextEnemyAction из core/ai)
```

- Состояние боя хранится в сейве (`SaveGame.battle`), поэтому каждый шаг автосохраняется — пермадес настоящий.
- Случайность — только через `createRng` из [core/rng](../src/game/core/rng). Сид боя получается из сида разведки: `createRng(pb.seed).fork("battle").seed` в `startBattle`.
- Presenter логики не содержит: финальное состояние всегда приводится к `after` через `map.syncFromState(after)` в `finally`.

## Ленивый Phaser

- Phaser выносится в отдельный чанк `phaser-*.js` через `manualChunks` в [vite.config.ts](../vite.config.ts). CJS-хелперы Rollup уходят в чанк `helpers`, иначе основной бандл тянул бы Phaser статически.
- Бой грузит [scene/index.ts](../src/game/scene/index.ts) (`mountBattleGame`) через `import()` в [BattleScreen.tsx](../src/game/ui/screens/BattleScreen.tsx); поселение — [scene/settlement/index](../src/game/scene/settlement) в [SettlementScreen.tsx](../src/game/ui/screens/SettlementScreen.tsx).
- Precache Serwist включает чанк Phaser, это проверяет [tools/check-sw.mjs](../tools/check-sw.mjs).

## Алиасы

Заданы в `ALIASES` ([vite.config.ts](../vite.config.ts), их же использует [vitest.config.ts](../vitest.config.ts)) и в `paths` [tsconfig.json](../tsconfig.json):

| Алиас       | Каталог        | Что там                                                           |
| ----------- | -------------- | ----------------------------------------------------------------- |
| `@game/*`   | `src/game/*`   | игра: core, content, state, сцены, арт, UI                        |
| `@shared/*` | `src/shared/*` | данные персонажа, общие для игры и модели (классы, статы, навыки) |
| `@model/*`  | `src/model/*`  | генератор персонажа и статов, чистый, работает в браузере         |
| `@host/*`   | `src/host/*`   | платформа: Telegram, облако, PWA                                  |

Каталог `src/i18n` в корне `src` пуст и ни откуда не импортируется. Локализация живёт в `src/game/i18n`.

## Где менять

- Слой и его границы: этот файл и [CLAUDE.md](../CLAUDE.md).
- Алиасы: `ALIASES` в [vite.config.ts](../vite.config.ts) и `paths` в [tsconfig.json](../tsconfig.json), всегда вместе.
- Чанки: `manualChunks` в [vite.config.ts](../vite.config.ts), затем обновить `required` в [tools/check-sw.mjs](../tools/check-sw.mjs).
