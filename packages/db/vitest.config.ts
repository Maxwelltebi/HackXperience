import { defineConfig } from 'vitest/config';

const LOCAL_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

export default defineConfig({
  test: {
    // Small pools: many test files connect at once, and new connections are slow on Windows.
    env: { DATABASE_URL: process.env.DATABASE_URL ?? LOCAL_DATABASE_URL, DATABASE_POOL_MAX: '3' },
    // One file at a time: they share one database, and parallel files mostly add connection churn.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
