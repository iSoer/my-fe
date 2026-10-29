# Платформа

my-fe — хост игры: Telegram Mini App и PWA на GitHub Pages. Платформенный код лежит в [src/host](../src/host), [src/main.tsx](../src/main.tsx) и [src/sw.ts](../src/sw.ts). Игра подключается к хосту через хук `setGameHost` и через свои публичные сторы.

## Порядок запуска (`boot` в main.tsx)

1. Глобальные обработчики `error` и `unhandledrejection` вызывают `showFatal`: экран ошибки с кнопками «Перезапустить» и «Скопировать».
2. `initTelegram()` — только внутри Telegram (`isTelegram`). Вызывает `ready`, `expand`, `disableVerticalSwipes` (≥ 7.7), `requestFullscreen` (≥ 8.0, iOS/Android) и выставляет safe-area в CSS-переменные `--host-safe-top`/`--host-safe-bottom` и `--tg-viewport`.
3. `setStorageNamespace(userNamespace())`: ключ сейва зависит от пользователя Telegram.
4. Только в продакшене: `initPwa({ getSerwist, beforeReload: flushPersist })`.
5. `setGameHost({ Overlay: PwaBanners, SettingsSection: AppCard, haptic: tgHaptic })`.
6. `await reconcileCloudSave()`. Если есть конфликт, показывается `ConflictScreen`, иначе сразу `start()`.
7. `start()`:
   - `root.render(<GameRoot />)`;
   - `startCloudMirror()`;
   - `$route.subscribe(syncBackButton)`;
   - `$battle.subscribe(b => setClosingConfirmation(!!b && !b.result))` — подтверждение закрытия Mini App во время боя.

## Хук хоста

[platform/host.ts](../src/game/platform/host.ts), интерфейс `GameHost`:

- `Overlay` — слой поверх экранов ([PwaBanners](../src/host/PwaBanners.tsx): «работает офлайн», «новая версия»). Его рендерит `App`.
- `SettingsSection` — секция в начале Настроек ([AppCard](../src/host/AppCard.tsx): установка, `storageEstimate`, `persist`).
- `haptic(kind)` возвращает `true`, если хост обработал вибрацию.

## Telegram

[host/telegram.ts](../src/host/telegram.ts) — типизированный адаптер над `window.Telegram.WebApp`. SDK подключается синхронно в [index.html](../index.html) (`telegram-web-app.js?58`). Тот же URL задан в `TG_SDK_URL` в `sw.ts`, менять оба вместе.

- `isTelegram` проверяет `initDataUnsafe`, `version` и `platform !== "unknown"`. Вне Telegram объект WebApp тоже существует.
- `userNamespace()` берёт `initDataUnsafe.user.id`. Подпись `initData` не проверяется: бэкенда нет, id используется только чтобы разделить сейвы на устройстве, а не для авторизации.
- `setBackButton(visible, onClick)` хранит один колбэк и снимает предыдущий через `offClick`.
- `setClosingConfirmation`, `tgHaptic` (серии импульсов для `block`, `crit`, `kill`), `shareText`.
- CloudStorage: `cloudAvailable()` (≥ 6.9), `cloudGetItems`, `cloudSetItem`, `cloudRemoveItems`, `cloudGetKeys`. Формат облачного сейва описан в [saves.md](saves.md).

## PWA

- [vite.config.ts](../vite.config.ts) использует плагин `@serwist/vite`: `swSrc: src/sw.ts`, `swDest: sw.js`, glob `**/*.{js,css,html,svg,png,ico,webmanifest,json}` без `404.html`, `maximumFileSizeToCacheInBytes = 5 МБ`. В dev SW отключён.
- [src/sw.ts](../src/sw.ts):
  - `cacheId: "pawfield"` — все Pages одного пользователя делят origin `*.github.io`;
  - `cleanupOutdatedCaches`;
  - `navigateFallback` на `index.html` из scope;
  - игнорируются параметры `tgWebApp*` и `utm_*`;
  - `skipWaiting: false` (активация только по `SKIP_WAITING` от клиента), `clientsClaim: true`;
  - SDK Telegram кэшируется по StaleWhileRevalidate в `pawfield-tg-sdk`, а при `install` кладётся в кэш явно.
- [host/pwa.ts](../src/host/pwa.ts):
  - SW регистрируется после `load`;
  - сторы `$updateReady`, `$offlineReady`, `$installPrompt`, `$isStandalone`, `$online`;
  - обновления проверяются раз в `UPDATE_CHECK_INTERVAL_MS = 30 мин` и при возврате на вкладку;
  - `applyUpdate()` вызывает `beforeReload()` (`flushPersist`) и `messageSkipWaiting()`, перезагружается по событию `controlling` или через 4 с;
  - `promptInstall()`, `requestPersistence()` (в установленном приложении), `storageEstimate()`.
- Баннер обновления не показывается на маршрутах `NO_RELOAD_ROUTES = {battle, battleResult}`.
- Манифест и иконки лежат в [public](../public). Иконки генерирует `pnpm icons` ([tools/gen-icons.mjs](../tools/gen-icons.mjs)) из процедурного арта, результат коммитится.

## Сборка и деплой

- `pnpm build` = `pnpm typecheck` (два tsconfig: приложение и SW) → `vite build` → `cp dist/index.html dist/404.html` → `node tools/check-sw.mjs`.
- [tools/check-sw.mjs](../tools/check-sw.mjs) проверяет:
  - в precache есть `index.html`, `manifest.webmanifest`, `assets/phaser-*.js`, `icons/icon-512.png`;
  - все файлы `dist` (кроме `sw.js` и `404.html`) попали в precache;
  - общий размер не больше 10 МБ.
- `VITE_BASE_PATH` задаёт `base` Vite и scope SW. Для Pages это `/<repo>/`, для локальных смоуков — `/my-fe/`.
- CI в [.github/workflows/deploy.yml](../.github/workflows/deploy.yml): на push в `main` и вручную. Шаги: Node 22, `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm test`, `pnpm build` с `VITE_BASE_PATH=/${repo}/`, затем `upload-pages-artifact` и `deploy-pages`. Смоуки в CI не запускаются. `concurrency: pages` с `cancel-in-progress: true`.

## Где менять

- Порядок запуска и связка с игрой: [src/main.tsx](../src/main.tsx).
- Telegram: [host/telegram.ts](../src/host/telegram.ts). URL SDK — в `index.html` и `TG_SDK_URL` в `sw.ts`.
- Облако и конфликт: [host/sync.ts](../src/host/sync.ts), [host/cloud.ts](../src/host/cloud.ts).
- PWA: [host/pwa.ts](../src/host/pwa.ts), [host/PwaBanners.tsx](../src/host/PwaBanners.tsx), [host/AppCard.tsx](../src/host/AppCard.tsx), [src/sw.ts](../src/sw.ts), блок `serwist(...)` в [vite.config.ts](../vite.config.ts).
- CI: [.github/workflows/deploy.yml](../.github/workflows/deploy.yml).
