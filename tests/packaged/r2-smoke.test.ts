import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';

interface R2SmokeReport {
  schemaVersion: number;
  database: string;
  guardedWrite: string;
  processTree: string;
  returnedToBaseline: boolean;
}

async function runPackagedR2Smoke(): Promise<R2SmokeReport> {
  const executable = resolve(process.env.CODRYN_PACKAGED_EXE ?? 'apps/desktop/out/Codryn-win32-x64/Codryn.exe');
  if (!existsSync(executable)) throw new Error('Packaged Codryn.exe is missing.');
  const directory = await mkdtemp(join(resolve('.r2-test-artifacts'), 'packaged-'));
  try {
    const exitCode = await new Promise<number | null>((resolveExit, reject) => {
      const child = spawn(executable, ['--disable-gpu', '--r2-smoke', `--r2-user-data-dir=${directory}`], { shell: false, windowsHide: true });
      const timer = setTimeout(() => { child.kill(); reject(new Error('Packaged R2 smoke timed out')); }, 60_000);
      child.once('error', reject);
      child.once('exit', (code) => { clearTimeout(timer); resolveExit(code); });
    });
    if (exitCode !== 0) throw new Error(`Packaged R2 smoke exited ${String(exitCode)}.`);
    return JSON.parse(await readFile(join(directory, 'r2-report.json'), 'utf8')) as R2SmokeReport;
  } finally { await rm(directory, { recursive: true, force: true }); }
}

describe.skipIf(process.env.CODRYN_PACKAGED_EXE === undefined)('packaged R2 smoke', () => {
  it('keeps native R2 boundaries operational', async () => {
    await expect(runPackagedR2Smoke()).resolves.toMatchObject({ schemaVersion: 1, database: 'pass', guardedWrite: 'pass', processTree: 'pass', returnedToBaseline: true });
  }, 30_000);
});

export { runPackagedR2Smoke };
