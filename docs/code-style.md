# Стиль кода

В репозитории две зоны стиля. Код игры пишется с двойными кавычками и без точек с запятой и Prettier'ом не форматируется. Платформенный код форматирует Prettier (одинарные кавычки, точки с запятой, ширина 110). Комментарии, JSDoc и имена тестов пишутся по-русски, пользовательский текст — через `tr(en, ru)`.

## Зона 1: код игры

Каталоги `src/game`, `src/shared`, `src/model`, `tests/game` перечислены в [.prettierignore](../.prettierignore).

- Двойные кавычки, без `;`, отступ 2 пробела.
- Union-типы начинаются с ведущего `= |`:
  ```ts
  export type UiMode = 'idle' | 'busy';
  ```
- `catch` и `else` переносятся на новую строку после `}`.
- Внутри объектных типов разделитель — запятая: `{ ok: true, save: SaveGame }`.
- Стрелочные функции с одним параметром пишутся без скобок: `s => s.profile`.
- **Не переформатируйте** эти файлы и не запускайте на них `pnpm format`/Prettier.

## Зона 2: платформенный код (Prettier)

`src/host`, `src/main.tsx`, `src/sw.ts`, `tools/*.mjs`, `tests/host`, конфиги (`vite.config.ts`, `vitest.config.ts`, `eslint.config.js`).

- [.prettierrc](../.prettierrc): `singleQuote`, `semi`, `printWidth: 110`, `trailingComma: "all"`, `tabWidth: 2`.
- Форматирование — `pnpm format` (`prettier --write .`). Каталоги игры он пропускает благодаря `.prettierignore`.

## Общее для обеих зон

- ESLint ([eslint.config.js](../eslint.config.js)) — `typescript-eslint` recommended, обязательно с `--max-warnings 0`. Правила:
  - `no-explicit-any: error`;
  - `no-unused-vars` (имена с `_` игнорируются);
  - `consistent-type-imports: error`, то есть типы импортируются через `import type`.
- TypeScript в режиме `strict`, `noFallthroughCasesInSwitch`. Switch по union (`Route`, `BattleEvent`) должен быть исчерпывающим.
- Комментарии и JSDoc по-русски. Объясняют «почему», а не «что».
- Имена тестов (`describe`/`it`) по-русски.
- Пользовательские строки только через `tr(en, ru)` (см. [i18n.md](i18n.md)).
- `core/` и `content/` чистые: без DOM, Phaser, `Date.now()` внутри логики (время передаётся параметром `now`) и `Math.random`. Единственное исключение — `randomSeed()` в [core/rng](../src/game/core/rng/index.ts).
- Импорты игры идут через алиасы `@game/`, `@shared/`, `@model/`.

## Где менять

- Prettier: [.prettierrc](../.prettierrc), исключения — [.prettierignore](../.prettierignore).
- Правила линтера: [eslint.config.js](../eslint.config.js).
- Компилятор: [tsconfig.json](../tsconfig.json), [tsconfig.sw.json](../tsconfig.sw.json).
