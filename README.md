# Пушистая Резня (pawfield)

Тактическая пошаговая игра в духе Fire Emblem Heroes про котиков и собачек — Telegram Mini App на чистом frontend. Полное техническое задание — в [SPEC.md](./SPEC.md).

## Стек

Vite 7 · TypeScript 5 (strict) · Preact 10 + nanostores · Phaser 3.90 · zod · lz-string · Serwist (PWA) · Vitest + fast-check · pnpm.

## Команды

```bash
pnpm install          # зависимости
pnpm dev              # dev-сервер (http://localhost:5173, работает и вне Telegram с моком)
pnpm test             # тесты ядра
pnpm typecheck        # tsc --noEmit (приложение + Service Worker)
pnpm lint             # eslint
pnpm build            # сборка в dist/ (+ 404.html, sw.js, проверка precache)
pnpm smoke:pwa        # офлайн-смоук PWA поверх собранного dist (сам поднимает preview)
pnpm icons            # перегенерировать иконки PWA в public/ из процедурного арта
pnpm smoke            # headless-смоук (Playwright): нужен запущенный `VITE_BASE_PATH=/my-fe/ pnpm preview`
# галерея арта: pnpm dev → http://localhost:5173/tools/gallery/index.html
```

Для сборки под GitHub Pages задайте базовый путь: `VITE_BASE_PATH=/<repo>/ pnpm build`. Workflow `.github/workflows/deploy.yml` делает это автоматически при push в `main`.

## Структура

```
src/core      — чистое игровое ядро (RNG, персонажи, карты, бой, ИИ, прогрессия, сейв)
src/content   — декларативный контент: классы, оружие, навыки, черты, имена, биомы, баланс
src/state     — nanostores: сейв и действия, hash-роутер, контроллер боя
src/platform  — Telegram WebApp адаптер, haptics, localStorage + CloudStorage, PWA (Serwist)
src/sw.ts     — Service Worker (precache всего приложения)
src/art       — SVG-арт: миниатюры котов/псов/мышей, фоны кинематика и тайлы по биому и клетке
src/game      — Phaser: сцена карты, кинематик атаки, презентер событий
src/ui        — Preact: экраны и HUD
tests         — Vitest
```

## Настройка Telegram-бота

1. В [@BotFather](https://t.me/BotFather): `/newbot` → затем `/mybots` → Bot Settings → Menu Button (или `/newapp`) и укажите URL GitHub Pages, например `https://<user>.github.io/<repo>/`.
2. В репозитории включите Pages: Settings → Pages → Source: **GitHub Actions**.
3. После первого успешного workflow откройте бота и нажмите кнопку меню.

Вне Telegram игра тоже работает (сейв в localStorage под ключом `local`).

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

Сейв хранится в `localStorage` и дублируется в Telegram CloudStorage (сжатие lz-string, чанки по 4000 символов). Автосохранение после каждого действия в бою — переигрывать нельзя, permadeath настоящий. В настройках есть экспорт/импорт кода сейва.

## Статус реализации (2026-10-08)

Готово (этапы M0 и M1 из SPEC.md, частично M2):

- Ядро целиком: генерация персонажей и ростера, карты по seed, бой по правилам FEH (треугольник, двойные атаки, контрудары, спецприёмы, Укрытия, эффективность), Поддержки, фазы, подкрепления, босс и цель «Убить вожака», ИИ по стойкам и 4 сложности, XP/SP/уровни, permadeath, Кладбище с эпитафиями, Слава, Приют и пленники.
- Контент: 24 класса, оружие всех типов, 14 спецприёмов, 16 Поддержек, 28 пассивок, 18 Особенностей, 9 биомов (двор, крыши, джунгли, подвал, пустыня, свалка, ледник, каньон, зимний парк) с мотивами раскладки, погодой и живыми тайлами, 9 фракций врагов.
- UI: все экраны из раздела 5 ТЗ, HUD боя с прогнозом, пауза, итоги, настройки, экспорт/импорт сейва.
- Phaser: карта, подсветки, зона опасности, кинематик атак и смерти с кровью, быстрый режим, ускорение.
- Сейвы: localStorage + Telegram CloudStorage, автосейв после каждого действия, восстановление боя.
- Проверки: 55 тестов ядра (включая property-based и автобои), typecheck, lint, два headless-смоука.

Не сделано (дальше по SPEC.md): звук, финальный арт вместо плейсхолдеров (эмодзи и плашки), Дружба бойцов, цели «Выжить»/«Защитить тайник», достижения, английская локализация, балансовый прогон.
