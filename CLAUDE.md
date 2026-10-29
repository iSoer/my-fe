# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Cat Emblem (pawfield)** is a turn-based tactics game in the spirit of Fire Emblem Heroes, with cats and dogs. It ships as a Telegram Mini App and a PWA, frontend only, deployed to GitHub Pages. Stack: Vite 7, TypeScript (strict), React 19 + nanostores, Phaser 3.90, zod, lz-string, Serwist (PWA), Vitest + fast-check, pnpm (Node ≥ 20.19).

UI strings, code comments, and test names are in Russian. User-facing text is bilingual through `tr(en, ru)` from `@game/i18n`.

## Commands

```bash
pnpm dev                 # dev server at http://localhost:5173 (works outside Telegram; the SW is disabled in dev)
pnpm test                # vitest run: tests/**/*.test.ts and tests/**/*.spec.ts
pnpm vitest run tests/game/battle.test.ts      # one file
pnpm vitest run -t "редьюсер боя"              # filter by test name
pnpm test:coverage       # coverage covers only src/game/core and src/game/content
pnpm typecheck           # tsc for the app (tsconfig.json) and for the Service Worker (tsconfig.sw.json)
pnpm lint                # eslint with --max-warnings 0
pnpm build               # typecheck, vite build, copy dist/404.html, then tools/check-sw.mjs (verifies the precache)
pnpm sync:game [path]    # pull the game in from ../next-instapok (see below)
pnpm icons               # regenerate the PWA icons in public/ from the procedural art
```

CI (`.github/workflows/deploy.yml`) runs lint, test, and `build` with `VITE_BASE_PATH=/<repo>/` on every push to `main`, then deploys to Pages.

Browser smoke tests use playwright-core and need a built preview at the `/my-fe/` base:

```bash
VITE_BASE_PATH=/my-fe/ pnpm build && VITE_BASE_PATH=/my-fe/ pnpm preview   # in one shell
pnpm smoke               # full game loop: menu → settlement → shop → sortie → battle → results → reload
pnpm smoke:tg            # Telegram layer with a mocked WebApp (per-user save, cloud, Back button, save conflict)
pnpm smoke:pwa           # offline PWA check (starts its own preview)
# Set CHROMIUM_PATH=/path/to/chrome to use your own Chromium. On failure the smoke saves a screenshot to /tmp/smoke-fail.png.
```

The art gallery lives at `pnpm dev`, then http://localhost:5173/tools/gallery/index.html.

## Docs and skills

- `docs/` holds the project documentation in Russian, one file per topic; the index is `docs/README.md`. Read the relevant file before working on a subsystem.
- Project skills in `.claude/skills/`: `add-character`, `add-small-map`, `add-big-map`, `add-building` (recipes for content), and `update-docs`. After any significant change to behavior or structure described in `docs/`, follow `update-docs` and update the affected documents before finishing.
- `docs/game.md` is overwritten by `pnpm sync:game`; don't create or edit it here.

## Game code vs. platform code

The game itself is developed in the sibling project `next-instapok`, where it is the `/game` route. `tools/sync-game.mjs` copies it here and **deletes any extra files** in the folders it writes to:

| next-instapok                     | here         | alias        |
| --------------------------------- | ------------ | ------------ |
| `src/client/game/**`              | `src/game/`  | `@game/*`    |
| `src/shared/**` (what the game uses) | `src/shared/` | `@shared/*` |
| `src/server/**` (what the game uses) | `src/model/`  | `@/server/*` |
| `tests/unit/game/**`              | `tests/game/`| —            |

- As of 2026-10-29, my-fe is **ahead** of next-instapok: dozens of game files exist only here, and `SAVE_VERSION` is 11 here vs. 6 there. Running `pnpm sync:game` now would wipe that work and reset players' saves, so never run it unless the user explicitly asks.
- `src/game`, `src/shared`, `src/model`, and `tests/game` belong to the sync. Changes made here are lost on the next `pnpm sync:game` unless they are also made in next-instapok. Check with the user which repo is the source of truth before making large edits there.
- These folders use next-instapok's style (double quotes, no semicolons) and are listed in `.prettierignore`, so never reformat them. The platform code (`src/host`, `src/main.tsx`, `tools`, configs) uses Prettier: single quotes, semicolons, width 110.
- Only the platform lives in this repo: `src/host` (Telegram WebApp, CloudStorage sync, PWA banners, save-conflict screen), `src/main.tsx` (boot), and `src/sw.ts` (Service Worker).
- The game is host-agnostic. `main.tsx` plugs the platform in before mounting `GameRoot`, through `setGameHost({ Overlay, SettingsSection, haptic })` (`@game/platform/host`) and `setStorageNamespace(userNamespace())`. It also wires the Telegram Back button and close confirmation to the game's `$route`, `$battle`, and `$pauseOpen` stores. If game routes are renamed, update `syncBackButton` in `main.tsx`.

## Game architecture (`src/game`)

- `core/`: pure, deterministic logic with no DOM or Phaser.
  - The battle is a reducer (`core/battle/reducer.ts`): `BattleState` plus a `BattleAction` gives a new state and a list of `BattleEvent`s.
  - Other modules: combat math (`core/combat`), AI (`core/ai`), pathing and map generation (`core/map`), skills engine, units and progression, items.
  - All randomness goes through the seeded `core/rng`.
  - Shared types live in `core/types.ts`.
- `content/`: data tables, including classes, weapons, skills, biomes, terrain, items, and balance constants in `content/balance.ts`.
- `state/`: nanostores atoms that glue core to the UI.
  - `save.ts` holds `$save`, `$battle`, persistence, and the game actions.
  - `router.ts` is hash-based routing; the `Route` union is parsed from `location.hash`.
  - Other stores: `battleUi.ts`, `boardLayout.ts`, `settlement.ts`.
- `scene/`: Phaser rendering. `presenter.ts` (`GamePresenter`) only *plays back* `BattleEvent`s on `MapScene` and `CinematicScene` and holds no game logic. Phaser is split into its own lazy chunk (`manualChunks` in `vite.config.ts`).
- `art/`: procedural SVG/raster art for critters, gear, tiles, and buildings.
- `ui/`: React screens and components that read the stores.
- `platform/`: storage, audio, haptics, and the host hook.
- `GameRoot.tsx` exposes `window.__pf` (`save`, `ui`, `layout`, `battle.{tapTile,confirm,endTurn}`, `settlement.*`). The smoke tests use it to drive the game and to change the save directly, so keep it in sync when you rename actions.

## Saves

- The save is a zod schema in `core/save/index.ts`, versioned with `SAVE_VERSION`.
- Older saves are migrated step by step up to the current version. Saves below `MIN_SAVE_VERSION` are rejected and a new game starts.
- Bump the version and add a migration whenever you change the save's shape.
- Storage:
  - Saves go to `localStorage` under the key `pawfield:save:<telegram user id | local>`.
  - They are mirrored to Telegram CloudStorage (`src/host/sync.ts`), compressed with lz-string in chunks of 4000 characters. Ordinary changes are debounced by about 3 s; battle start and end and app minimize are flushed right away.
  - When the cloud copy is newer than the local one by more than a minute, `ConflictScreen` is shown before the game boots.
- The game autosaves after every action, so permadeath is real.

## PWA notes

- Serwist precaches the whole app, including the Phaser chunk. `maximumFileSizeToCacheInBytes` is 5 MB.
- The SW scope is `/<repo>/`. Cache names are prefixed with `pawfield`, because every Pages site of a user shares the `*.github.io` origin.
- The "new version available" banner is suppressed during a battle and on the results screen, and the page never reloads there.
- `initPwa` runs only in production builds.
