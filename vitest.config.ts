// ============================================================
// Configuración de Vitest
// ============================================================
// Antes no existía: `npm run test` corría sin environment ni setup, y
// `src/test/setup.ts` quedaba huérfano (nadie lo cargaba). Los alias tienen que
// coincidir con los de vite.config.ts o los imports @shared/@modules fallan.
// ============================================================

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@modules': path.resolve(__dirname, './src/modules'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
