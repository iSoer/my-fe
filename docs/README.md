# Документация Cat Emblem (pawfield)

Пошаговая тактика в духе Fire Emblem Heroes с котами, псами и мышами: Telegram Mini App + PWA, только фронтенд. Здесь описано, как игра устроена **сейчас**. Документы поддерживаются вместе с кодом (скил `update-docs` в `.claude/skills/`).

## Устройство проекта

- [architecture.md](architecture.md) — слои (core / content / state / scene / ui / platform / host), поток данных, алиасы
- [code-style.md](code-style.md) — две зоны стиля, Prettier, ESLint, язык комментариев
- [saves.md](saves.md) — схема сейва, версии и миграции, localStorage, CloudStorage, конфликты
- [ui-and-routing.md](ui-and-routing.md) — маршруты и экраны, сторы, машина состояний боевого UI, `window.__pf`
- [rendering-and-fx.md](rendering-and-fx.md) — презентер событий боя, сцены Phaser, эффекты, звук
- [platform.md](platform.md) — Telegram, PWA/Service Worker, хост-хук, сборка, CI и деплой
- [i18n.md](i18n.md) — `tr(en, ru)` и правила локализации
- [testing.md](testing.md) — Vitest, fast-check, smoke-тесты, что гонять перед коммитом

## Бой

- [battle.md](battle.md) — редьюсер, состояние, действия, события, фазы, подкрепления
- [combat.md](combat.md) — формула урона, треугольник оружия, атаки вдогонку, спецприёмы, местность
- [skills.md](skills.md) — движок навыков, хуки, таблицы пассивок, спецприёмов и ассистов
- [ai.md](ai.md) — решения врага, веса, профили сложности
- [items.md](items.md) — оружие, талисманы, инвентарь, Лавка

## Бойцы

- [units.md](units.md) — боец, генерация, виды, породы, фракции, имена, смерть, мемориал, перерождение
- [classes.md](classes.md) — все классы, требования, модификаторы, смена класса
- [progression.md](progression.md) — опыт, уровни, рост характеристик, владение оружием
- [art-characters.md](art-characters.md) — процедурный арт бойцов и героя, галерея

## Карты

- [maps.md](maps.md) — малые карты: схватка 6×8, раскладки, генерация
- [expedition.md](expedition.md) — большая карта: «Мрачная чаща» 30×30
- [terrain-and-biomes.md](terrain-and-biomes.md) — типы местности и биомы
- [map-rendering.md](map-rendering.md) — отрисовка поля, тайлы, фон, масштабирование

## Поселение

- [settlement.md](settlement.md) — здания, экономика, карта деревни, жители, сцена
- [dialogues.md](dialogues.md) — диалоги, сюжетные факты, сплетни, цитаты

## Скилы для расширения контента

Рецепты лежат в `.claude/skills/`:

| Скил            | Что добавляет                                                 |
| --------------- | ------------------------------------------------------------- |
| `add-character` | класс, порода, фракция, NPC, имена, вид, вариант героя        |
| `add-small-map` | раскладка схватки 6×8, новая местность, биом                  |
| `add-big-map`   | форма чащи 30×30 или новый режим большой карты                |
| `add-building`  | постройка в поселении                                         |
| `update-docs`   | обязательная правка этой документации после сильных изменений |
