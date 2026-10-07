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
  'backend/infrastructure/test/project-git-state.test.ts',
  'backend/infrastructure/test/r2-process-probe.test.ts',
  'backend/infrastructure/test/r2-command-runner.test.ts',
  'backend/infrastructure/test/r2-model-injection.test.ts',
  'apps/cli/test/change-verify-return.test.ts',
  'backend/infrastructure/test/r2-recovery.test.ts',
  'tests/packaged/r0-smoke.test.ts',
  'tests/packaged/r2-smoke.test.ts'
];

const writeProbeTests = [
  'backend/infrastructure/test/windows-write-probe.test.ts'
];

const guardedWriterTests = [
  'backend/infrastructure/test/guarded-writer.test.ts'
];

const commonTestOptions = {
  environment: 'node' as const,
  coverage: { enabled: false },
  testTimeout: 15_000,
  hookTimeout: 15_000
};

const hostIntegrationTestOptions = {
  ...commonTestOptions,
  testTimeout: 60_000,
  hookTimeout: 60_000
};

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'write-probe',
          ...hostIntegrationTestOptions,
          maxWorkers: 1,
          sequence: { groupOrder: 1 },
          include: writeProbeTests,
          fileParallelism: false
        }
      },
      {
        test: {
          name: 'guarded-writer',
          ...hostIntegrationTestOptions,
          maxWorkers: 1,
          sequence: { groupOrder: 2 },
          include: guardedWriterTests,
          fileParallelism: false
        }
      },
      {
        test: {
          name: 'host-integration',
          ...hostIntegrationTestOptions,
          maxWorkers: 1,
          sequence: { groupOrder: 3 },
          include: hostIntegrationTests,
          fileParallelism: false
        }
      },
      {
        test: {
          name: 'parallel',
          ...commonTestOptions,
          sequence: { groupOrder: 4 },
          include: allTests,
          exclude: [...hostIntegrationTests, ...writeProbeTests, ...guardedWriterTests]
        }
      }
    ]
  }
});
