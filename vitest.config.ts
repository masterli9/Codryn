import { defineConfig } from 'vitest/config';

const allTests = [
  'shared/test/**/*.test.ts',
  'backend/**/test/**/*.test.ts',
  'tests/**/*.test.ts',
  'apps/**/test/**/*.test.ts'
];

const hostIntegrationTests = [
  'apps/cli/test/index.test.ts',
  'backend/infrastructure/test/composition.test.ts',
  'backend/infrastructure/test/git-probe.test.ts',
  'backend/infrastructure/test/process-runner.test.ts',
  'backend/infrastructure/test/windows-write-probe.test.ts',
  'backend/infrastructure/test/guarded-writer.test.ts',
  'backend/infrastructure/test/project-git-state.test.ts',
  'tests/packaged/r0-smoke.test.ts'
];

const commonTestOptions = {
  environment: 'node' as const,
  coverage: { enabled: false },
  testTimeout: 15_000,
  hookTimeout: 15_000
};

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'parallel',
          ...commonTestOptions,
          include: allTests,
          exclude: hostIntegrationTests
        }
      },
      {
        test: {
          name: 'host-integration',
          ...commonTestOptions,
          include: hostIntegrationTests,
          fileParallelism: false
        }
      }
    ]
  }
});
