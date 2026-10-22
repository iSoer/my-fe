#!/usr/bin/env node
// Синхронизация игры из next-instapok (там игра — маршрут /game): копирует код игры, её зависимости из модели персонажа
// и тесты. Каталоги-назначения целиком принадлежат синхронизации — лишние файлы в них удаляются.
//
//   node tools/sync-game.mjs [путь к next-instapok]   (по умолчанию ../next-instapok)
//
// Соответствие путей:
//   src/client/game/**              → src/game/**        (алиас @game/*)
//   src/shared/** (что нужно игре)   → src/shared/**      (алиас @shared/*)
//   src/server/** (что нужно игре)   → src/model/**       (алиас @/server/* → src/model/*)
//   tests/unit/game/**              → tests/game/**
//   docs/game.md                    → docs/game.md
// Всё платформенное (Telegram, PWA, облачный сейв) живёт в src/host и сюда не входит.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = path.resolve(process.argv[2] ?? path.join(root, '../next-instapok'));
if (!fs.existsSync(path.join(src, 'src/client/game/GameRoot.tsx'))) {
  console.error(`Не похоже на next-instapok: ${src}`);
  process.exit(1);
}

const ALIASES = [
  ['@game/', 'src/client/game/'],
  ['@shared/', 'src/shared/'],
  ['@/', 'src/'],
];
const MAP = [
  ['src/client/game/', 'src/game/'],
  ['src/shared/', 'src/shared/'],
  ['src/server/', 'src/model/'],
  ['tests/unit/game/', 'tests/game/'],
];
const OWNED = ['src/game', 'src/shared', 'src/model', 'tests/game'];

const resolveFile = (p) => {
  for (const e of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
    const f = p + e;
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  }
  return null;
};
const walk = (dir, out = []) => {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};

// Замыкание зависимостей: весь каталог игры и тестов + всё, что они импортируют внутри проекта
const files = new Set();
const queue = [...walk(path.join(src, 'src/client/game')), ...walk(path.join(src, 'tests/unit/game'))];
while (queue.length > 0) {
  const f = queue.pop();
  if (files.has(f)) continue;
  files.add(f);
  if (!/\.(ts|tsx)$/.test(f)) continue;
  const code = fs.readFileSync(f, 'utf8');
  for (const m of code.matchAll(/(?:from|import)\s*\(?\s*"([^"]+)"/g)) {
    const spec = m[1];
    let target = null;
    if (spec.startsWith('.')) target = path.resolve(path.dirname(f), spec);
    else {
      const alias = ALIASES.find(([a]) => spec.startsWith(a));
      if (alias) target = path.join(src, alias[1] + spec.slice(alias[0].length));
    }
    const resolved = target && resolveFile(target);
    if (resolved) queue.push(resolved);
  }
}

const written = new Set();
for (const f of files) {
  const rel = path.relative(src, f).split(path.sep).join('/');
  const map = MAP.find(([from]) => rel.startsWith(from));
  if (!map) throw new Error(`Нет соответствия для ${rel}`);
  const dest = path.join(root, map[1] + rel.slice(map[0].length));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(f, dest);
  written.add(dest);
}

let removed = 0;
for (const dir of OWNED) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) continue;
  for (const f of walk(abs)) {
    if (!written.has(f)) {
      fs.rmSync(f);
      removed++;
    }
  }
}

fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
fs.copyFileSync(path.join(src, 'docs/game.md'), path.join(root, 'docs/game.md'));
console.log(`Скопировано ${written.size} файлов из ${src}, удалено устаревших: ${removed}`);
