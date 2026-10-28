import { defineConfig } from 'vitest/config';
import { ALIASES } from './vite.config';

export default defineConfig({
  resolve: { alias: ALIASES },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts'],
    environment: 'node',
    // Генерация карт и property-тесты на медленных раннерах CI идут в 3–4 раза дольше, чем локально
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      include: ['src/game/core/**', 'src/game/content/**'],
      reporter: ['text', 'html'],
    },
  },
});
