import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30_000,
    // Concurrency tests share one database: run test files one at a time.
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgres://teamup:teamup@localhost:5432/teamup_test',
      JWT_SECRET: 'test-secret-test-secret-test-secret-test-secret',
      RATE_LIMIT_DISABLED: 'true',
    },
  },
});
