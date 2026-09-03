import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    // Removed in step 3, when the engine's tests land.
    passWithNoTests: true,
  },
});
