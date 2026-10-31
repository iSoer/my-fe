---
name: update-docs
description: Обязательная сверка и правка документации в docs/ после существенных изменений в игре (новые или удалённые механики, здания, классы, карты, навыки, маршруты, изменения сейва, баланса, архитектуры, сборки или платформы). Использовать перед завершением любой задачи, которая меняет поведение или структуру, описанные в docs/, и всегда после скилов add-building, add-character, add-small-map и add-big-map.
---

# Поддержание docs/ в актуальном состоянии

Документация в `docs/` описывает, как устроена игра **сейчас**. Если код и документ расходятся, документ вреднее его отсутствия. Поэтому сильное изменение не считается законченным, пока документация не поправлена.

## Когда документацию нужно править обязательно

- Добавлена, удалена или переименована сущность из таблиц документации: здание, класс, порода, фракция, навык, оружие, талисман, террейн, биом, раскладка карты, тип экспедиции, маршрут, экран, сцена диалога.
- Изменились формулы или числа, которые приведены в документах (баланс, урон, опыт, цены, уровни зданий).
- Изменились форма сейва, `SAVE_VERSION`, миграции или ключи хранилища.
- Изменились архитектура, поток данных, алиасы, сборка, CI, PWA/SW или Telegram-слой.
- Появился новый файл или модуль, на который должны ссылаться разделы «Где менять».

Для мелкого рефакторинга, багфикса без изменения описанного поведения, правки стилей или текстов править документацию не нужно. Но если в документе упоминается исправленный баг или старое поведение, поправь его.

## Карта «код → документ»

| Код                                                                                                                            | Документ                |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| `src/game/core/battle/*`, `content/balance.ts` (бой, XP/SP)                                                                    | `battle.md`             |
| `src/game/core/combat/*`                                                                                                       | `combat.md`             |
| `src/game/core/skills/*`, `content/skills/*`                                                                                   | `skills.md`             |
| `src/game/core/ai/*`, AI-профили сложности                                                                                     | `ai.md`                 |
| `core/items`, `content/items.ts`, `content/weapons.ts`, магазин                                                                | `items.md`              |
| `core/units/*`, `content/{breeds,factions,names,appearance,epitaphs,tavern}.ts`, `src/model/**`, `src/shared/character/*`      | `units.md`              |
| `content/classes.ts`, `content/classStats.ts`, `shared/character/classes.ts`                                                   | `classes.md`            |
| `core/progression/*`, `core/units/proficiency.ts`                                                                              | `progression.md`        |
| `src/game/art/{critter,hero,outfits,look,palettes,gear,held}.ts`, `scene/UnitView.ts`, `tools/gallery`                         | `art-characters.md`     |
| `core/map/{layouts,generate,pathing}.ts`                                                                                       | `maps.md`               |
| `core/map/expedition.ts`, `content/expedition.ts`, `art/expedition.ts`                                                         | `expedition.md`         |
| `content/{terrain,biomes}.ts`, `scene/{weather,ambient,env}.ts`                                                                | `terrain-and-biomes.md` |
| `scene/MapScene.ts`, `art/{tile,backdrop}.ts`, `state/boardLayout.ts`, `scene/layout.ts`                                       | `map-rendering.md`      |
| `core/settlement/*`, `content/settlement.ts`, `state/settlement.ts`, `art/village.ts`, `scene/settlement/*`, `ui/settlement/*` | `settlement.md`         |
| `content/dialogues.ts`, `content/quotes.*`, `core/story/*`, `scene/settlement/{gossips,speech}.ts`                             | `dialogues.md`          |
| `core/save/index.ts`, `state/save.ts`, `src/host/{sync,cloud,ConflictScreen}`                                                  | `saves.md`              |
| `state/router.ts`, `ui/App.tsx`, `ui/screens/*`, `state/battleUi.ts`, `GameRoot.tsx` (`window.__pf`)                           | `ui-and-routing.md`     |
| `scene/presenter.ts`, `scene/CinematicScene.ts`, `scene/*Fx.ts`, `scene/gore.ts`, `platform/audio.ts`                          | `rendering-and-fx.md`   |
| `src/host/*`, `src/main.tsx`, `src/sw.ts`, `vite.config.ts`, `.github/workflows/*`                                             | `platform.md`           |
| `tests/**`, `vitest.config.ts`, `tools/smoke*.mjs`                                                                             | `testing.md`            |
| `src/game/i18n`                                                                                                                | `i18n.md`               |
| Слои, алиасы                                                                                                                   | `architecture.md`       |
| `.prettierrc`, `.prettierignore`, `eslint.config.js`                                                                           | `code-style.md`         |

Оглавление всех документов лежит в `docs/README.md`. Новый документ обязательно добавь туда.

## Порядок действий

1. Получи список изменений: `git diff --stat` и `git diff` (или `git diff main...HEAD` для ветки).
2. По таблице выше определи затронутые документы и найди в них упоминания изменённых символов: `grep -rn "<символ>" docs/`.
3. Обнови:
   - таблицы (строки, числа, id);
   - описания поведения;
   - ссылки на файлы (относительные от `docs/`, например `[reducer](../src/game/core/battle/reducer.ts)`);
   - разделы «Где менять».
4. Проверь, что ссылки на файлы не битые:
   ```bash
   grep -rhoE '\]\(\.\./[^)#]+' docs/ | sed 's/](\.\.\///' | sort -u | while read f; do [ -e "$f" ] || echo "битая ссылка: $f"; done
   ```
5. Если менялся рецепт добавления сущности, поправь и соответствующий скил в `.claude/skills/` (`add-building`, `add-character`, `add-small-map`, `add-big-map`).
6. В итоговом сообщении пользователю перечисли, какие документы обновлены.

## Правила оформления

- Документы пишутся на русском, термины кода (идентификаторы, пути) даются в `code`.
- Каждый документ: H1, краткое резюме в 1–2 предложения, основное содержание, в конце раздел «Где менять».
- Описывай то, что есть в коде, а не планы. Если что-то не реализовано, так и пиши.
- Числа бери из кода (`content/balance.ts` и таблицы контента) и не пересказывай по памяти.
