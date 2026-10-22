# Пушистая Резня (pawfield)

Тактическая пошаговая игра в духе Fire Emblem Heroes про котиков и собачек — Telegram Mini App и PWA на чистом frontend (GitHub Pages).

**Откуда код игры.** Игра развивается в проекте `next-instapok` (маршрут `/game`) и переносится сюда скриптом `pnpm sync:game` (`tools/sync-game.mjs`): он копирует `src/client/game` → `src/game`, нужные игре модули модели персонажа (`src/server/*` → `src/model/*`, `src/shared/*` → `src/shared/*`), тесты игры → `tests/game` и `docs/game.md`. Эти каталоги целиком принадлежат синхронизации — правки делайте в `next-instapok` и синхронизируйте. Здесь живёт только платформа: `src/host` (Telegram, облачный сейв, PWA) и `src/main.tsx`. Описание игры — [docs/game.md](./docs/game.md); [SPEC.md](./SPEC.md) — исходное ТЗ первой версии.

## Стек

Vite 7 · TypeScript 5 (strict) · React 19 + nanostores · Phaser 3.90 · zod · lz-string · Serwist (PWA) · Vitest + fast-check · pnpm.

## Команды

```bash
pnpm install          # зависимости
pnpm dev              # dev-сервер (http://localhost:5173, работает и вне Telegram с моком)
pnpm sync:game        # подтянуть игру из ../next-instapok (или: node tools/sync-game.mjs <путь>)
pnpm test             # тесты игры (tests/game) и платформы (tests/host)
pnpm typecheck        # tsc --noEmit (приложение + Service Worker)
pnpm lint             # eslint
pnpm build            # сборка в dist/ (+ 404.html, sw.js, проверка precache)
pnpm smoke:pwa        # офлайн-смоук PWA поверх собранного dist (сам поднимает preview)
pnpm icons            # перегенерировать иконки PWA в public/ из процедурного арта
pnpm smoke            # headless-смоук цикла (меню → деревня → Лавка → вылазка → бой → итоги): нужен `VITE_BASE_PATH=/my-fe/ pnpm preview`
pnpm smoke:tg         # смоук Telegram-слоя с моком WebApp (сейв по id, облако, «Назад», конфликт сейвов), тоже поверх preview
# свой Chromium для смоуков: CHROMIUM_PATH=/путь/к/chrome
# галерея арта: pnpm dev → http://localhost:5173/tools/gallery/index.html
```

Для сборки под GitHub Pages задайте базовый путь: `VITE_BASE_PATH=/<repo>/ pnpm build`. Workflow `.github/workflows/deploy.yml` делает это автоматически при push в `main`.

## Структура

```
src/game      — игра (из next-instapok): core, content, art, scene (Phaser), state, ui, GameRoot.tsx
src/model     — генератор персонажа и модель покемонов, на которых он построен (чистый, работает в браузере)
src/shared    — константы и схемы модели персонажа (классы, навыки, ранги)
src/host      — платформа: Telegram WebApp, облачный сейв (CloudStorage), PWA, баннеры и секция «Приложение» в настройках
src/main.tsx  — точка входа: Telegram, сверка облачного сейва, монтирование GameRoot, кнопка «Назад»
src/sw.ts     — Service Worker (precache всего приложения)
tests/game    — тесты игры (из next-instapok), tests/host — тесты платформы
tools         — синхронизация игры, смоуки, иконки, галерея арта
```

Алиасы как в next-instapok: `@game/*` → `src/game/*`, `@shared/*` → `src/shared/*`, `@/server/*` → `src/model/*`; платформа — `@host/*`. Игра подключает платформу через `setGameHost` (слой поверх экранов и секция в настройках) и `setStorageNamespace` (ключ сейва по пользователю Telegram).

## Настройка Telegram-бота

1. В [@BotFather](https://t.me/BotFather): `/newbot` → затем `/mybots` → Bot Settings → Menu Button (или `/newapp`) и укажите URL GitHub Pages, например `https://<user>.github.io/<repo>/`.
2. В репозитории включите Pages: Settings → Pages → Source: **GitHub Actions**.
3. После первого успешного workflow откройте бота и нажмите кнопку меню.

Вне Telegram игра тоже работает (сейв в localStorage под ключом `pawfield:save:local`). В Telegram кнопка «Назад» ведёт по экранам, из деревни — в главное меню, в бою открывает паузу; во время боя включено подтверждение закрытия.

## PWA и офлайн

Игру можно установить на телефон, и после первого открытия она работает без сети: всё приложение, включая ленивый чанк Phaser, лежит в precache Service Worker. Подробности — в [PWA_SPEC.md](./PWA_SPEC.md).

- **Android (Chrome):** Настройки → «📲 Установить на телефон» или пункт «Установить приложение» в меню браузера.
- **iPhone (Safari):** «Поделиться» → «На экран „Домой“». Установленное приложение на iOS хранит данные **отдельно** от Safari, поэтому перенесите прогресс через экспорт/импорт кода сейва в настройках.
- **Обновления:** новая версия скачивается в фоне, затем появляется плашка «Доступна новая версия». В бою и на экране итогов она не показывается, и страница там не перезагружается.
- **Внутри Telegram** кнопки установки нет, SW регистрируется по возможности (если WebView его поддерживает).
- **Проверка офлайна:** `VITE_BASE_PATH=/my-fe/ pnpm build && pnpm smoke:pwa`. Вручную: `pnpm preview`, затем DevTools → Application → Service Workers → Offline и перезагрузка.
- **Сброс при отладке:** DevTools → Application → Storage → Clear site data (снимает SW и кэши). В `pnpm dev` SW отключён.
- Все GitHub Pages пользователя живут на одном origin `*.github.io`, поэтому кэши идут с префиксом `pawfield`, а scope SW ограничен `/<repo>/`.

## Сейвы

Сейв хранится в `localStorage` (ключ `pawfield:save:<id пользователя Telegram | local>`) и зеркалится в Telegram CloudStorage (сжатие lz-string, чанки по 4000 символов): обычные изменения — через 3 секунды, начало и конец боя и сворачивание Mini App — сразу. Если в облаке прогресс новее локального больше чем на минуту, до старта игры предлагается выбрать, какой оставить. Автосохранение после каждого действия — переигрывать нельзя, permadeath настоящий. В настройках есть экспорт/импорт кода сейва.

Версия сейва — 6 (деревня, инвентарь, Лавка). Сейвы первой версии игры (v1–v3) не переводятся: при запуске показывается сообщение, и начинается новая игра.
