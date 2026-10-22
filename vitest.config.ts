import { defineConfig } from 'vitest/config';
import { ALIASES } from './vite.config';

export default defineConfig({
  resolve: { alias: ALIASES },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/game/core/**', 'src/game/content/**'],
      reporter: ['text', 'html'],
    },
  },
});
