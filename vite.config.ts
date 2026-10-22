import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { serwist } from '@serwist/vite';
import { fileURLToPath, URL } from 'node:url';

const base = process.env.VITE_BASE_PATH ?? '/';

const src = (dir: string) => fileURLToPath(new URL(`./src/${dir}`, import.meta.url));

/**
 * Алиасы как в next-instapok, чтобы синхронизированный код игры собирался без правок:
 * @game → src/game, @shared → src/shared, @/server → src/model (генератор персонажа — чистый, работает в браузере).
 */
export const ALIASES = [
  { find: /^@game\//, replacement: `${src('game')}/` },
  { find: /^@shared\//, replacement: `${src('shared')}/` },
  { find: /^@\/server\//, replacement: `${src('model')}/` },
  { find: /^@host\//, replacement: `${src('host')}/` },
];

export default defineConfig({
  base,
  plugins: [
    react(),
    // base и scope плагин берёт из base Vite (VITE_BASE_PATH).
    serwist({
      swSrc: 'src/sw.ts',
      swDest: 'sw.js',
      globDirectory: 'dist',
      globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,json}'],
      globIgnores: ['404.html'],
      injectionPoint: 'self.__SW_MANIFEST',
      rollupFormat: 'iife',
      // phaser-*.js ~1,2 МБ — с запасом на рост.
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      disable: process.env.NODE_ENV === 'development',
    }),
  ],
  resolve: {
    alias: ALIASES,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // Phaser — отдельный ленивый чанк. CJS-хелперы Rollup выносим в крошечный общий чанк,
        // иначе они попадают в чанк Phaser и основной бандл начинает тянуть его статически.
        manualChunks: (id) => {
          if (id.includes('commonjsHelpers')) return 'helpers';
          if (id.includes('node_modules/phaser/')) return 'phaser';
          return undefined;
        },
      },
    },
  },
});
