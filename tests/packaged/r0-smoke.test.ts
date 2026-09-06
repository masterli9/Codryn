import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { r0DiagnosticReportSchema } from '@codryn/shared';

const directories: string[] = [];
afterEach(async () => Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

describe.skipIf(process.env.CODRYN_PACKAGED_EXE === undefined)('packaged R0 smoke', () => {
  it('writes a valid public report under the supplied userData directory', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codryn-r0-packaged-'));
    directories.push(directory);
    const executable = process.env.CODRYN_PACKAGED_EXE;
    if (executable === undefined) throw new Error('CODRYN_PACKAGED_EXE missing');
    const code = await new Promise<number | null>((resolve, reject) => {
      const child = spawn(executable, ['--disable-gpu', '--r0-smoke', `--r0-user-data-dir=${directory}`], { shell: false, windowsHide: true });
      const timer = setTimeout(() => { child.kill(); reject(new Error('Packaged smoke timed out')); }, 60_000);
      child.once('error', reject);
      child.once('exit', (exitCode) => { clearTimeout(timer); resolve(exitCode); });
    });
    expect(code).toBe(0);
    const report = r0DiagnosticReportSchema.parse(JSON.parse(await readFile(join(directory, 'r0-report.json'), 'utf8')));
    expect(report.checks).toHaveLength(11);
  }, 70_000);
});
