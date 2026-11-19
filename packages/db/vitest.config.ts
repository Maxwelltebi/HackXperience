import { defineConfig } from 'vitest/config';

const LOCAL_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

export default defineConfig({
  test: {
    env: { DATABASE_URL: process.env.DATABASE_URL ?? LOCAL_DATABASE_URL },
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
