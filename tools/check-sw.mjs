// Проверка precache после сборки: в dist/sw.js должны быть index.html, манифест и ленивый чанк Phaser.
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const MAX_TOTAL = 10 * 1024 * 1024;

const sw = await readFile('dist/sw.js', 'utf8').catch(() => null);
if (!sw) fail('dist/sw.js не найден — плагин Serwist не отработал');

const urls = [...sw.matchAll(/url:\s*"([^"]+)"/g)].map((m) => m[1]);
if (urls.length === 0) fail('в dist/sw.js нет precache-записей');

const required = [/^index\.html$/, /^manifest\.webmanifest$/, /^assets\/phaser-[\w-]+\.js$/, /^icons\/icon-512\.png$/];
for (const re of required) {
  if (!urls.some((u) => re.test(u))) fail(`в precache нет ${re}`);
}

// Всё из dist (кроме sw.js и 404.html) должно быть в precache — иначе офлайн что-то не загрузится.
const files = await walk('dist');
const missing = files.filter((f) => f !== 'sw.js' && f !== '404.html' && !urls.includes(f));
if (missing.length) fail(`не попали в precache: ${missing.join(', ')}`);

let total = 0;
for (const u of urls) total += (await stat(join('dist', u))).size;
if (total > MAX_TOTAL) fail(`precache ${(total / 1024 / 1024).toFixed(2)} МБ > лимита ${MAX_TOTAL / 1024 / 1024} МБ`);

console.log(`✓ precache: ${urls.length} файлов, ${(total / 1024 / 1024).toFixed(2)} МБ`);

async function walk(dir, prefix = '') {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await walk(join(dir, e.name), rel)));
    else out.push(rel);
  }
  return out;
}

function fail(msg) {
  console.error(`✗ check-sw: ${msg}`);
  process.exit(1);
}
