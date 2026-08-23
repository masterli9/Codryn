import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { RunR0Diagnostics } from '@codryn/core';
import { createR0Infrastructure } from '../src/index.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe.skipIf(process.platform !== 'win32')('R0 infrastructure composition', () => {
  it('keeps database, backup and log artifacts below userData', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'codryn-r0-composition-'));
    directories.push(userDataPath);
    const infrastructure = await createR0Infrastructure({
      userDataPath,
      fixtureDirectory: resolve('tests/support/fixtures/process')
    });
    try {
      const report = await new RunR0Diagnostics(infrastructure).execute({
        requestId: '11111111-1111-4111-8111-111111111111',
        requestedAt: new Date().toISOString()
      });
      expect(report.overallStatus, JSON.stringify(report.checks)).toBe('passed');
      expect(await readdir(userDataPath)).toEqual(expect.arrayContaining(['codryn.sqlite', 'backups', 'logs']));
      expect((await readdir(join(userDataPath, 'backups'))).some((name) => name.endsWith('.sqlite'))).toBe(true);
      expect(await readdir(join(userDataPath, 'logs'))).toContain('codryn.log.jsonl');
    } finally {
      infrastructure.close();
      infrastructure.close();
    }
  }, 60_000);
});
