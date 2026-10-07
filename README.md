# Пушистая Резня (pawfield)

Тактическая пошаговая игра в духе Fire Emblem Heroes про котиков и собачек — Telegram Mini App на чистом frontend. Полное техническое задание — в [SPEC.md](./SPEC.md).

## Стек

Vite 7 · TypeScript 5 (strict) · Preact 10 + nanostores · Phaser 3.90 · zod · lz-string · Vitest + fast-check · pnpm.

## Команды

```bash
pnpm install          # зависимости
pnpm dev              # dev-сервер (http://localhost:5173, работает и вне Telegram с моком)
pnpm test             # тесты ядра
pnpm typecheck        # tsc --noEmit
pnpm lint             # eslint
pnpm build            # сборка в dist/ (+ 404.html)
```

Для сборки под GitHub Pages задайте базовый путь: `VITE_BASE_PATH=/<repo>/ pnpm build`. Workflow `.github/workflows/deploy.yml` делает это автоматически при push в `main`.

## Структура

```
src/core      — чистое игровое ядро (RNG, персонажи, карты, бой, ИИ, прогрессия, сейв)
src/content   — декларативный контент: классы, оружие, навыки, черты, имена, биомы, баланс
src/state     — nanostores: сейв и действия, hash-роутер, контроллер боя
src/platform  — Telegram WebApp адаптер, haptics, localStorage + CloudStorage
src/game      — Phaser: сцена карты, кинематик атаки, презентер событий
src/ui        — Preact: экраны и HUD
tests         — Vitest
```

## Настройка Telegram-бота

1. В [@BotFather](https://t.me/BotFather): `/newbot` → затем `/mybots` → Bot Settings → Menu Button (или `/newapp`) и укажите URL GitHub Pages, например `https://<user>.github.io/<repo>/`.
2. В репозитории включите Pages: Settings → Pages → Source: **GitHub Actions**.
3. После первого успешного workflow откройте бота и нажмите кнопку меню.

Вне Telegram игра тоже работает (сейв в localStorage под ключом `local`).

## Сейвы

Сейв хранится в `localStorage` и дублируется в Telegram CloudStorage (сжатие lz-string, чанки по 4000 символов). Автосохранение после каждого действия в бою — переигрывать нельзя, permadeath настоящий. В настройках есть экспорт/импорт кода сейва.
