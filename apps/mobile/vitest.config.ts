import { defineConfig } from 'vitest/config';

// Unit tests for the app's plain TypeScript helpers. Screens are checked by hand at the phase gate.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
