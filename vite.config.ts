import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { serwist } from '@serwist/vite';
import { fileURLToPath, URL } from 'node:url';

const base = process.env.VITE_BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    preact(),
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
    alias: {
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
      '@content': fileURLToPath(new URL('./src/content', import.meta.url)),
      '@ui': fileURLToPath(new URL('./src/ui', import.meta.url)),
      '@game': fileURLToPath(new URL('./src/game', import.meta.url)),
      '@state': fileURLToPath(new URL('./src/state', import.meta.url)),
      '@platform': fileURLToPath(new URL('./src/platform', import.meta.url)),
      '@i18n': fileURLToPath(new URL('./src/i18n', import.meta.url)),
      '@art': fileURLToPath(new URL('./src/art', import.meta.url)),
    },
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
