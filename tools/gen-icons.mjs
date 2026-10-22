// Генерация иконок PWA из процедурного арта: pnpm icons (результат коммитится в public/).
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const INK = '#0d0b10';
const RED = '#e63946';

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: [] },
});
const art = await vite.ssrLoadModule('/src/game/art/index.ts');
await vite.close();

const cat = art.critterSvg({
  species: 'cat',
  fur: art.furArt(0),
  iris: '#2ecc71',
  pattern: 1,
  eyes: 0,
  accessory: 1,
  weapon: 'claw',
  weaponColor: RED,
  pose: 'happy',
});

/**
 * Квадратная иконка: чернильный фон, красный косой «шрам», котик по центру.
 * pad — доля стороны под поля (maskable требует, чтобы важное было в центральных 80%).
 */
function iconSvg(pad) {
  const inner = 1 - pad * 2;
  // Видимый контур котика (уши → лапы) занимает примерно y 11…101 в координатах VIEW — центрируем по нему.
  const critter = cat.replace('<svg ', `<svg x="${pad * 100}" y="${pad * 100}" width="${inner * 100}" height="${inner * 100}" `).replace(`viewBox="${art.VIEW_BOX}"`, 'viewBox="0 -4 120 120"');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
  <rect width="100" height="100" fill="${INK}" />
  <path d="M-10 78 L110 30 L110 46 L-10 94 Z" fill="${RED}" />
  ${critter}
</svg>`;
}

const targets = [
  { file: 'public/icons/icon-192.png', size: 192, pad: 0.06 },
  { file: 'public/icons/icon-512.png', size: 512, pad: 0.06 },
  { file: 'public/icons/icon-maskable-512.png', size: 512, pad: 0.16 },
  { file: 'public/icons/apple-touch-icon.png', size: 180, pad: 0.08 },
];

await mkdir('public/icons', { recursive: true });
await writeFile('public/favicon.svg', iconSvg(0.04).replace('width="100%" height="100%"', 'width="64" height="64"'));

const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(`<html><body style="margin:0;background:${INK}"><div style="width:${t.size}px;height:${t.size}px">${iconSvg(t.pad)}</div></body></html>`);
  await page.screenshot({ path: t.file, clip: { x: 0, y: 0, width: t.size, height: t.size }, omitBackground: false });
  console.log('✓', t.file);
}
await browser.close();
