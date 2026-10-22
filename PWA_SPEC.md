# ТЗ: PWA и полное офлайн-кэширование на Serwist

| Параметр | Значение |
|---|---|
| Версия документа | 1.1 (реализовано) |
| Дата | 2026-10-19 |
| Связанный документ | `SPEC.md` (§1.2 п.5 «Офлайн-устойчивость», §2.6 «Деплой») |
| Инструмент | [Serwist](https://serwist.pages.dev) — `@serwist/vite` + `serwist` + `@serwist/window` |
| Пакетный менеджер | **pnpm** (npm в проекте не используется) |

**MUST** — обязательно, **SHOULD** — желательно, **MAY** — опционально.

---

## 1. Цель

1. Игру можно **установить на телефон** как приложение (Android/Chrome — нативный промпт установки, iOS/Safari — «На экран Домой»), запуск в полноэкранном портретном режиме без адресной строки.
2. После первого открытия игра **целиком кэшируется** и работает **полностью без сети**: запуск, меню, бой (включая ленивый чанк Phaser), сохранения.
3. Обновления доставляются предсказуемо: новая версия скачивается в фоне и применяется без потери прогресса и **никогда не перезагружает страницу посреди боя**.
4. Поведение внутри Telegram Mini App не ломается.

## 2. Исходное состояние (на 2026-10-19)

- Vite 7 + Preact + Phaser 3, hash-роутинг (`src/state/router.ts`), бэкенда нет.
- Деплой на GitHub Pages в подпуть: `VITE_BASE_PATH=/<repo-name>/` (`.github/workflows/deploy.yml`), локально `base = '/'`.
- `pnpm build` = `tsc --noEmit` → `vite build` → `cp dist/index.html dist/404.html`.
- Сборка: `index.html`, 1 CSS, 3 JS-чанка + `phaser-*.js` (~1,2 МБ, грузится лениво). Итого ~1,7 МБ.
- `public/` пуст. Графика процедурная (`src/art`), внешних шрифтов и картинок нет.
- Единственный внешний ресурс — `https://telegram.org/js/telegram-web-app.js?58` в `index.html`.
- Сейв — `localStorage` (`src/platform/storage.ts`) + best-effort Telegram CloudStorage.
- В `index.html` уже есть `theme-color`, `viewport-fit=cover`; safe-area обрабатывается.
- Ни манифеста, ни Service Worker, ни иконок нет.

## 3. Объём работ (чек-лист)

- [x] 4.1 Зависимости
- [x] 4.2 Иконки и ассеты для установки
- [x] 4.3 Web App Manifest
- [x] 4.4 Мета-теги в `index.html`
- [x] 4.5 Service Worker `src/sw.ts`
- [x] 4.6 Плагин Serwist в `vite.config.ts`
- [x] 4.7 TypeScript / ESLint
- [x] 4.8 Регистрация SW и поток обновления
- [x] 4.9 UI: установка и «доступна новая версия»
- [x] 4.10 Устойчивость хранилища
- [x] 4.11 Сборка и CI
- [x] 4.12 Документация
- [ ] 5. Тестирование и критерии приёмки (автоматические — да; ручные 5, 6, 10 на устройствах — нет, см. §6)

---

## 4. Шаги реализации

### 4.1 Зависимости

```bash
pnpm add -D @serwist/vite serwist @serwist/window
```

Все три пакета попадают только в бандл (SW собирается на этапе сборки), поэтому достаточно `devDependencies`.

- MUST: проверить, что `pnpm install --frozen-lockfile` проходит, `pnpm-lock.yaml` закоммичен.
- MUST: если pnpm попросит разрешить build-скрипты новых пакетов — не разрешать без необходимости (`pnpm-workspace.yaml` сейчас разрешает только `esbuild`).
- MUST: перед реализацией свериться с актуальной документацией `@serwist/vite` (API плагина менялся между мажорными версиями).

### 4.2 Иконки и ассеты для установки

Положить в `public/` (Vite копирует их в корень `dist/` с учётом `base`):

| Файл | Размер | Назначение |
|---|---|---|
| `public/icons/icon-192.png` | 192×192 | manifest, `purpose: "any"` |
| `public/icons/icon-512.png` | 512×512 | manifest, `purpose: "any"`, splash Android |
| `public/icons/icon-maskable-512.png` | 512×512 | manifest, `purpose: "maskable"` (важное в центральных 80%, фон до краёв) |
| `public/icons/apple-touch-icon.png` | 180×180 | iOS, без прозрачности |
| `public/favicon.svg` (или `.ico`) | — | вкладка браузера |

- SHOULD: иконки генерировать из процедурного арта (морда котика/собачки на фоне `#0d0b10`) скриптом `tools/gen-icons.mjs` на `playwright-core` (уже в зависимостях) — рендер канваса в PNG. Скрипт запускается вручную, результат коммитится.
- MAY: скриншоты для расширенного промпта установки Android (`public/screenshots/*.png`, 1080×1920, `form_factor: "narrow"`).
- MAY: стартовые splash-экраны iOS (`apple-touch-startup-image`) — без них iOS показывает белый/цвет фона экран, это допустимо.

### 4.3 Web App Manifest

Файл `public/manifest.webmanifest`. **Все пути — относительные**, чтобы работать и при `base = '/'`, и при `/<repo-name>/` (относительные URL в манифесте резолвятся от URL самого манифеста):

```json
{
  "id": "./",
  "name": "Пушистая Резня",
  "short_name": "Пушистая Резня",
  "description": "Тактическая игра про котиков и собачек",
  "lang": "ru",
  "dir": "ltr",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "display_override": ["fullscreen", "standalone"],
  "orientation": "portrait",
  "background_color": "#0d0b10",
  "theme_color": "#0d0b10",
  "categories": ["games"],
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- MUST: `short_name` ≤ 12 символов, если финальное название длиннее — сократить (иначе обрезается под иконкой). Решение по названию — см. `SPEC.md` §0.
- MUST: `start_url` ведёт на главную (hash-роутер сам откроет меню).
- MUST: цвета совпадают с `theme-color` в `index.html` и фоном `body`.

### 4.4 Мета-теги в `index.html`

Добавить в `<head>` (пути без ведущего `/`, Vite подставит `base` при сборке — проверить в `dist/index.html`; при необходимости использовать `%BASE_URL%`):

```html
<link rel="manifest" href="%BASE_URL%manifest.webmanifest" />
<link rel="icon" href="%BASE_URL%favicon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="%BASE_URL%icons/apple-touch-icon.png" />
<meta name="description" content="Тактическая игра про котиков и собачек" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="Пушистая Резня" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="format-detection" content="telephone=no" />
```

- MUST: `black-translucent` + уже имеющийся `viewport-fit=cover` → проверить, что верхний UI не залезает под чёлку в standalone-режиме iOS (safe-area insets уже используются; вне Telegram они должны браться из `env(safe-area-inset-*)`).
- MUST: скрипт `telegram-web-app.js` остаётся, но не должен блокировать запуск офлайн (см. 4.5, правило для `telegram.org`). SHOULD: добавить ему `async` нельзя (адаптер читает `window.Telegram` синхронно при импорте) — оставить синхронным, но обеспечить кэш.

### 4.5 Service Worker `src/sw.ts`

Стратегия: **всё приложение — в precache** (полный офлайн с первого визита), рантайм-кэш только для внешнего скрипта Telegram.

```ts
/// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { CacheableResponsePlugin, ExpirationPlugin, Serwist, StaleWhileRevalidate } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: {
    cleanupOutdatedCaches: true,
    // hash-роутинг: любая навигация в scope отдаётся index.html из precache
    navigateFallback: 'index.html',
    ignoreURLParametersMatching: [/^tgWebApp/, /^utm_/],
  },
  // обновление применяется только по команде клиента (см. 4.8)
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: false,
  disableDevLogs: true,
  runtimeCaching: [
    {
      matcher: ({ url }) => url.origin === 'https://telegram.org' && url.pathname.startsWith('/js/'),
      handler: new StaleWhileRevalidate({
        cacheName: 'tg-sdk',
        plugins: [
          // <script> без crossorigin даёт opaque-ответ (status 0)
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          new ExpirationPlugin({ maxEntries: 4, maxAgeSeconds: 30 * 24 * 60 * 60 }),
        ],
      }),
    },
  ],
});

serwist.addEventListeners();
```

Требования:

- MUST: `skipWaiting: false` — иначе новая версия может подхватиться посреди боя и подгрузить несовместимый ленивый чанк. При `skipWaiting: false` Serwist сам обрабатывает сообщение `SKIP_WAITING` от клиента.
- MUST: `navigateFallback` резолвится относительно scope SW; проверить, что при `base=/<repo-name>/` фолбэк находит precache-запись `index.html` (при необходимости передать полный путь через `self.registration.scope`).
- MUST: `navigationPreload: false` — навигации обслуживаются из precache, preload не нужен.
- MUST NOT: кэшировать ответы с `t.me` / CloudStorage-запросы — их делает Telegram-клиент, не fetch страницы.
- SHOULD: имя кэшей с префиксом проекта (`cacheId: 'pawfield'`), чтобы не конфликтовать с другими приложениями на том же `*.github.io`-origin (все Pages пользователя делят один origin!).
- MUST: `cleanupOutdatedCaches: true` — старые ревизии precache удаляются при активации.

### 4.6 Плагин Serwist в `vite.config.ts`

```ts
import { serwist } from '@serwist/vite';

export default defineConfig({
  base,
  plugins: [
    preact(),
    serwist({
      swSrc: 'src/sw.ts',
      swDest: 'sw.js',
      globDirectory: 'dist',
      globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,json}'],
      globIgnores: ['404.html'],
      injectionPoint: 'self.__SW_MANIFEST',
      rollupFormat: 'iife',
      base,
      scope: base,
      // phaser-*.js ~1,2 МБ; запас на рост
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      disable: process.env.NODE_ENV === 'development',
    }),
  ],
  // ...остальное без изменений
});
```

- MUST: `phaser-*.js` обязательно попадает в precache (проверить в собранном `dist/sw.js`). Без этого бой офлайн не запустится, т.к. чанк ленивый.
- MUST: `base`/`scope` берутся из того же `VITE_BASE_PATH`, что и Vite. SW лежит в `dist/sw.js` → на Pages это `/<repo-name>/sw.js`, scope `/<repo-name>/`.
- MUST: хэшированные файлы `assets/*` precache-ятся по URL с хэшем (ревизия не нужна), `index.html`/`manifest`/иконки — с ревизией (Serwist вычисляет сам).
- MUST: `404.html` в precache не нужен (`globIgnores`), учесть, что `cp` в `pnpm build` выполняется **после** `vite build`, т.е. на момент генерации манифеста его ещё нет — это ожидаемо.
- SHOULD: в dev SW выключен (`disable`), чтобы не мешать HMR. Для отладки SW использовать `pnpm build && pnpm preview`.

### 4.7 TypeScript / ESLint

- MUST: `src/sw.ts` компилируется с `lib: ["ES2022", "WebWorker"]`, а не `DOM`. Варианты:
  - исключить `src/sw.ts` из основного `tsconfig.json` (`"exclude": ["src/sw.ts"]`) и создать `tsconfig.sw.json` с `lib: ["ES2022", "WebWorker"]`, `types: []`, `include: ["src/sw.ts"]`;
  - скрипт `typecheck` и шаг `tsc` в `build` прогоняют оба конфига: `tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.sw.json`.
- MUST: в основной `tsconfig.json` в `types` добавить `@serwist/vite/typings` (типы для `virtual:serwist`).
- MUST: `pnpm lint` проходит с `--max-warnings 0` (правило `consistent-type-imports` — импорт типов через `import type`).

### 4.8 Регистрация SW и поток обновления

Новый модуль `src/platform/pwa.ts` (по аналогии с `telegram.ts` — тонкий адаптер, без UI):

- MUST: регистрация через `getSerwist()` из `virtual:serwist` (он знает `swDest`/`scope` из конфига), только если `'serviceWorker' in navigator` и `import.meta.env.PROD`.
- MUST: регистрировать после `window.load`, чтобы не конкурировать с загрузкой игры.
- MUST: экспортировать nanostores-атомы (стейт проекта на nanostores):
  - `$updateReady: boolean` — выставляется по событию `waiting` (в т.ч. при `wasWaitingBeforeRegister`);
  - `$offlineReady: boolean` — по событию `installed` при первой установке (`!event.isUpdate`);
  - `$installPrompt` — сохранённое событие `beforeinstallprompt` (с `preventDefault()`), сбрасывается по `appinstalled`;
  - `$isStandalone` — `matchMedia('(display-mode: standalone)').matches || navigator.standalone === true`.
- MUST: функция `applyUpdate()`: подписка на `controlling` → `location.reload()`, затем `serwist.messageSkipWaiting()`. Перед reload — принудительно сохранить сейв (`saveLocal`).
- MUST: **не применять обновление во время боя.** Автоприменение допустимо только когда `$route` ≠ `battle`; иначе показывать плашку и ждать выхода из боя/согласия игрока.
- SHOULD: периодическая проверка обновлений — `registration.update()` при `visibilitychange → visible` и не чаще раза в 30 минут (PWA на телефоне может жить в фоне сутками).
- MUST: вызов инициализации из `src/main.tsx` рядом с `initTelegram()`.

### 4.9 UI: установка и обновление

Компоненты в `src/ui` в стилистике проекта, тексты через i18n (`src/i18n`):

1. **Плашка «Доступна новая версия»** (toast снизу, с учётом safe-area): кнопки «Обновить» / «Позже». В бою не показывается; показывается в меню/казарме.
2. **«Игра доступна офлайн»** — одноразовый короткий toast после первой успешной установки SW.
3. **Кнопка «Установить приложение»** в меню/настройках:
   - Android/Chromium: видна, если есть `$installPrompt`; по клику `prompt()`, по результату скрыть.
   - iOS Safari (не standalone): показывает мини-инструкцию «Поделиться → На экран Домой».
   - MUST NOT показываться внутри Telegram (`isTelegram === true`) и в standalone-режиме.
   - MAY внутри Telegram (Bot API 8.0+) использовать `tg.addToHomeScreen()` / `checkHomeScreenStatus()` — это ярлык Mini App, а не PWA; отдельная задача.
4. SHOULD: индикатор офлайна (`navigator.onLine` + события `online/offline`) — только информационный; игра не должна ничего блокировать офлайн. Синхронизация CloudStorage при офлайне молча пропускается (уже best effort).

### 4.10 Устойчивость хранилища

- SHOULD: после первого запуска в standalone вызвать `navigator.storage.persist()` — снижает риск, что ОС вычистит кэш и `localStorage` (критично для permadeath-сейва).
- SHOULD: в настройках/дебаг-экране показывать `navigator.storage.estimate()` (занято/квота).
- MUST: учесть, что на iOS PWA, установленная на экран «Домой», имеет **отдельное** хранилище от Safari — сейв из браузера туда не переносится. Упомянуть в README; MAY — экспорт/импорт сейва (уже в бэклоге `SPEC.md`).

### 4.11 Сборка и CI

- MUST: `pnpm build` генерирует `dist/sw.js` и `dist/manifest.webmanifest`; `dist/sw.js` содержит записи для всех `assets/*` (включая `phaser-*`), `index.html`, манифеста, иконок.
- MUST: workflow `.github/workflows/deploy.yml` остаётся на pnpm; дополнительных шагов не требуется, т.к. `VITE_BASE_PATH` уже передаётся в `pnpm build`.
- SHOULD: добавить проверочный скрипт `tools/check-sw.mjs` (запуск в CI после build): парсит `dist/sw.js` и падает, если в precache нет `index.html`, `phaser-*.js` или суммарный размер > 10 МБ.
- MUST: GitHub Pages отдаёт файлы с `Cache-Control: max-age=600` — это нормально, SW-скрипт браузер всё равно перепроверяет (`updateViaCache: 'none'` по умолчанию для скрипта SW). Не переименовывать `sw.js` между релизами.

### 4.12 Документация

- MUST: в `SPEC.md` §2.6 заменить пункт «MAY [v1.1]: Service Worker (vite-plugin-pwa)» на ссылку на этот документ (Serwist, реализовано).
- MUST: в `README.md` — раздел «PWA»: как установить на Android/iOS, как проверить офлайн, как сбросить SW при отладке (DevTools → Application → Unregister + Clear storage), заметка про общий origin `*.github.io`.

---

## 5. Тестирование и критерии приёмки

### 5.1 Автоматические

- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` — зелёные.
- [x] Юнит-тесты `src/platform/pwa.ts` (vitest): определение iOS, режим установки, интервал проверки обновлений. Логика «не обновлять в бою» живёт в `PwaBanners` и проверена e2e-имитацией деплоя (см. §6).
- [x] SHOULD: smoke `tools/smoke-pwa.mjs` на `playwright-core` поверх `pnpm preview`: открыть → дождаться `navigator.serviceWorker.controller` → `context.setOffline(true)` → reload → меню отрисовалось → начать бой → канвас Phaser отрисовался.

### 5.2 Ручные

| # | Сценарий | Ожидаемый результат |
|---|---|---|
| 1 | Chrome DevTools → Lighthouse / Application → Manifest | Манифест валиден, иконки (включая maskable) распознаны, «Installable» без ошибок |
| 2 | Первый визит → DevTools Application → Cache Storage | В precache все файлы из `dist/` (кроме `404.html`) |
| 3 | Первый визит, затем режим Offline, перезагрузка | Игра запускается, меню работает |
| 4 | Офлайн: начать новый бой | Phaser-чанк грузится из кэша, бой играбелен, сейв сохраняется |
| 5 | Android Chrome: установка | Появляется кнопка/промпт, иконка на рабочем столе, запуск без адресной строки, портрет |
| 6 | iOS Safari: «На экран Домой» | Корректная иконка и название, standalone, чёлка не перекрывает UI |
| 7 | Установленная PWA в авиарежиме (холодный старт) | Запускается и играбельна |
| 8 | Деплой новой версии, открыта PWA в меню | Через ≤ 30 мин/при возврате в приложение появляется «Доступна новая версия», «Обновить» → перезагрузка, сейв цел |
| 9 | Деплой новой версии во время боя | Бой не прерывается, плашка появляется после выхода из боя |
| 10 | Открытие внутри Telegram (iOS/Android/Desktop) | Игра работает как раньше, кнопка установки PWA скрыта, повторный запуск в Telegram без сети — работает, если WebView поддерживает SW |
| 11 | Деплой с `VITE_BASE_PATH=/<repo-name>/` | SW зарегистрирован со scope `/<repo-name>/`, не затрагивает другие Pages на том же origin |

### 5.3 Definition of Done

- Все MUST-пункты разделов 4.1–4.12 выполнены.
- Сценарии 1–11 пройдены на реальных устройствах: минимум один Android (Chrome) и один iPhone (Safari, iOS 17+).
- Размер precache ≤ 5 МБ; время первой загрузки не ухудшилось более чем на 5% (регистрация SW после `load`).

## 6. Статус реализации (2026-10-19)

Реализовано по разделам 4.1–4.12. Отличия от исходного текста ТЗ, принятые по ходу:

| Пункт | Как сделано | Почему |
|---|---|---|
| 4.3 `short_name` | «Резня» | «Пушистая Резня» не влезает в 12 символов под иконкой |
| 4.4 скрипт Telegram | `crossorigin="anonymous"` | telegram.org отдаёт `Access-Control-Allow-Origin: *`; CORS-ответ кэшируется без opaque-раздувания квоты (~7 МБ на ответ в Chrome) |
| 4.5 кэш SDK Telegram | кэш прогревается в `install` SW + StaleWhileRevalidate | при первом визите скрипт грузится до того, как SW взял управление, и иначе в кэш не попадал бы |
| 4.5 `navigateFallback` | абсолютный URL от `self.registration.scope` | корректно при любом `base` |
| 4.6 `base`/`scope` | не передаются явно | `@serwist/vite` берёт их из `base` Vite (`VITE_BASE_PATH`) |
| 4.8 автоприменение обновления | не делается, только по кнопке | перезагрузка без согласия игрока не нужна; плашка скрыта на `battle` и `battleResult` |
| 4.8 зависимость от `virtual:serwist` | `getSerwist` передаётся в `initPwa()` из `main.tsx` | `src/platform/pwa.ts` тестируется в Vitest без плагина |
| 4.9 кнопка установки | в Настройках, карточка «📲 Приложение» (статус офлайна, сети, занятого места, кнопка обновления) | — |

Файлы: `src/sw.ts`, `src/platform/pwa.ts`, `src/ui/components/PwaBanners.tsx`, `public/manifest.webmanifest`, `public/icons/*`, `public/favicon.svg`, `tsconfig.sw.json`, `tools/gen-icons.mjs` (`pnpm icons`), `tools/check-sw.mjs` (в `pnpm build`), `tools/smoke-pwa.mjs` (`pnpm smoke:pwa`), `tests/pwa.spec.ts`.

Проверено автоматически (headless Chromium, `base=/my-fe/`): сценарии 1–4, 7 (холодный офлайн-старт), 8–9 (имитация деплоя: в бою плашки и перезагрузки нет, в меню плашка → «Обновить» → новый SW активен, бой в сейве цел), 11 (scope). **Остаются ручными:** 5, 6 и 10 — установка на реальном Android/iPhone и запуск внутри Telegram.

## 7. Риски и примечания

- **Telegram WebView** поддерживает Service Worker не везде (особенно старые iOS-клиенты). Игра MUST оставаться работоспособной без SW — регистрация строго опциональна, ошибки регистрации глотаются и логируются.
- **Общий origin `*.github.io`**: все проекты пользователя на Pages делят `localStorage` и Cache Storage. Отсюда — `cacheId`, префиксы ключей (уже есть `pawfield:save:`) и строгий scope.
- **Ленивый чанк после деплоя**: без SW старая вкладка, запрошенная после деплоя, получит 404 на старый `phaser-<hash>.js`. С precache и `skipWaiting: false` эта проблема уходит — старая версия целиком обслуживается из своего кэша до обновления.
- **Сломанный SW** — аварийный выход: задеплоить `sw.js`, который вызывает `self.registration.unregister()` и чистит кэши (держать шаблон в `tools/`, MAY).
