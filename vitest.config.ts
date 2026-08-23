import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'shared/test/**/*.test.ts',
      'backend/**/test/**/*.test.ts',
      'tests/**/*.test.ts',
      'apps/**/test/**/*.test.ts'
    ],
    coverage: { enabled: false },
    testTimeout: 15_000,
    hookTimeout: 15_000
  }
});
