import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ProcessSpec } from '@codryn/core';
import { afterEach, describe, expect, it } from 'vitest';
import { BoundedOutput } from '../src/process/bounded-output.js';
import { WindowsProcessRunner } from '../src/index.js';

const systemRoot = process.env.SystemRoot ?? 'C:\\Windows';
const powershell = join(
  systemRoot,
  'System32',
  'WindowsPowerShell',
  'v1.0',
  'powershell.exe'
);
const taskkill = join(systemRoot, 'System32', 'taskkill.exe');
const baseArgs = ['-NoLogo', '-NoProfile', '-NonInteractive', '-File'];
const fixtureDirectory = fileURLToPath(
  new URL('../../../tests/support/fixtures/process/', import.meta.url)
);

interface OwnedFixture {
  readonly directory: string;
  childPidFile?: string;
}

const ownedFixtures: OwnedFixture[] = [];
const temporaryRoot = resolve(tmpdir());

async function createOwnedFixture(): Promise<OwnedFixture> {
  const directory = resolve(await mkdtemp(join(temporaryRoot, 'codryn-r0-process-')));
  assertOwnedTempDirectory(directory);
  const ownedFixture = {
    directory
  };
  ownedFixtures.push(ownedFixture);
  return ownedFixture;
}

function assertOwnedTempDirectory(directory: string): void {
  const relativePath = relative(temporaryRoot, resolve(directory));
  if (
    relativePath.length === 0 ||
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath) ||
    !relativePath.startsWith('codryn-r0-process-')
  ) {
    throw new Error('Refusing to operate on a non-fixture temporary directory.');
  }
}

async function eventually(
  assertion: () => void | Promise<void>,
  options: { readonly timeoutMs: number; readonly intervalMs: number }
): Promise<void> {
  const deadline = Date.now() + options.timeoutMs;
  let lastError: unknown;
  while (Date.now() <= deadline) {
    try {
      await assertion();
      return;
    } catch (error: unknown) {
      lastError = error;
    }
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    await new Promise<void>((resolveDelay) => {
      setTimeout(resolveDelay, Math.min(options.intervalMs, remainingMs));
    });
  }
  throw lastError;
}

function fixture(name: string): string {
  return join(fixtureDirectory, name);
}

function processSpec(
  cwd: string,
  scriptName: string,
  options: {
    readonly scriptArgs?: readonly string[];
    readonly timeoutMs?: number;
    readonly maxOutputBytes?: number;
  } = {}
): ProcessSpec {
  return {
    executable: powershell,
    args: [...baseArgs, fixture(scriptName), ...(options.scriptArgs ?? [])],
    cwd,
    timeoutMs: options.timeoutMs ?? 5_000,
    maxOutputBytes: options.maxOutputBytes ?? 16_384,
    env: {
      SystemRoot: systemRoot,
      PATH: process.env.PATH ?? join(systemRoot, 'System32'),
      PSExecutionPolicyPreference: 'Bypass',
      TEMP: cwd,
      TMP: cwd
    }
  };
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readRecordedPid(pidFile: string): Promise<number | null> {
  try {
    const pid = Number.parseInt((await readFile(pidFile, 'ascii')).trim(), 10);
    return Number.isSafeInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

async function terminateRecordedPid(pid: number): Promise<void> {
  if (!isProcessAlive(pid)) return;
  await new Promise<void>((resolve) => {
    const killer = spawn(taskkill, ['/PID', String(pid), '/T', '/F'], {
      shell: false,
      windowsHide: true,
      stdio: 'ignore'
    });
    let finished = false;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      resolve();
    };
    killer.once('error', finish);
    killer.once('close', finish);
  });
}

afterEach(async () => {
  for (const ownedFixture of ownedFixtures.splice(0)) {
    if (ownedFixture.childPidFile !== undefined) {
      const childPid = await readRecordedPid(ownedFixture.childPidFile);
      if (childPid !== null) await terminateRecordedPid(childPid);
    }
    assertOwnedTempDirectory(ownedFixture.directory);
    await rm(ownedFixture.directory, { recursive: true, force: true });
  }
});

const describeWindows = process.platform === 'win32' ? describe : describe.skip;

describeWindows('BoundedOutput', () => {
  it('shares one byte budget across streams and notifies the limit exactly once', () => {
    let limitNotifications = 0;
    const output = new BoundedOutput(5, () => {
      limitNotifications += 1;
    });

    output.appendStdout(Buffer.from('éé', 'utf8'));
    output.appendStderr(Buffer.from('é', 'utf8'));

    expect(output.snapshot()).toEqual({
      stdout: 'éé',
      stderr: '',
      stdoutTruncated: false,
      stderrTruncated: true
    });
    expect(limitNotifications).toBe(1);

    output.appendStdout(Buffer.from('later', 'utf8'));
    expect(output.snapshot()).toEqual({
      stdout: 'éé',
      stderr: '',
      stdoutTruncated: true,
      stderrTruncated: true
    });
    expect(limitNotifications).toBe(1);
  });
});

describeWindows('WindowsProcessRunner', () => {
  it('captures stdout, stderr and exit code separately', async () => {
    const ownedFixture = await createOwnedFixture();

    const result = await new WindowsProcessRunner().run(
      processSpec(ownedFixture.directory, 'emit-output.ps1')
    );

    expect(result).toMatchObject({
      termination: 'exited',
      exitCode: 0,
      signal: null,
      stdoutTruncated: false,
      stderrTruncated: false,
      treeTerminated: false
    });
    expect(result.stdout).toContain('fixture-stdout');
    expect(result.stderr).toContain('fixture-stderr');
  });

  it('returns exit code 7 without converting it to a spawn error', async () => {
    const ownedFixture = await createOwnedFixture();

    const result = await new WindowsProcessRunner().run(
      processSpec(ownedFixture.directory, 'exit-nonzero.ps1')
    );

    expect(result).toMatchObject({
      termination: 'exited',
      exitCode: 7,
      signal: null,
      stdoutTruncated: false,
      stderrTruncated: false,
      treeTerminated: false
    });
    expect(result.stdout).toContain('before-nonzero');
    expect(result.stderr).toContain('expected-exit-seven');
  });

  it('terminates the parent and recorded child after timeout', async () => {
    const ownedFixture = await createOwnedFixture();
    const childPidFile = join(ownedFixture.directory, 'child.pid');
    ownedFixture.childPidFile = childPidFile;

    const run = new WindowsProcessRunner().run(processSpec(
      ownedFixture.directory,
      'spawn-child-tree.ps1',
      { scriptArgs: ['-ChildPidFile', childPidFile], timeoutMs: 1_000 }
    ));

    let childPid: number | null = null;
    await eventually(async () => {
      childPid = await readRecordedPid(childPidFile);
      expect(childPid).not.toBeNull();
    }, { timeoutMs: 3_000, intervalMs: 25 });

    const result = await run;
    expect(result).toMatchObject({
      termination: 'timed_out',
      exitCode: null,
      treeTerminated: true
    });
    expect(childPid).not.toBeNull();
    if (childPid === null) throw new Error('The fixture did not record its child PID.');
    await eventually(() => {
      expect(() => process.kill(childPid as number, 0)).toThrow();
    }, { timeoutMs: 3_000, intervalMs: 25 });
  });

  it('terminates the tree and marks truncation at the output limit', async () => {
    const ownedFixture = await createOwnedFixture();

    const result = await new WindowsProcessRunner().run(processSpec(
      ownedFixture.directory,
      'large-output.ps1',
      { maxOutputBytes: 4_096 }
    ));

    expect(result).toMatchObject({
      termination: 'output_limit_exceeded',
      exitCode: null,
      stdoutTruncated: true,
      stderrTruncated: false,
      treeTerminated: true
    });
    expect(Buffer.byteLength(result.stdout, 'utf8')).toBeLessThanOrEqual(4_096);
    expect(result.stdout).toMatch(/^0123456789/);
  });

  it('reports spawn_failed for a missing executable', async () => {
    const ownedFixture = await createOwnedFixture();
    const missingExecutable = join(ownedFixture.directory, 'missing-process.exe');

    const result = await new WindowsProcessRunner().run({
      ...processSpec(ownedFixture.directory, 'emit-output.ps1'),
      executable: missingExecutable
    });

    expect(result).toEqual({
      termination: 'spawn_failed',
      exitCode: null,
      signal: null,
      stdout: '',
      stderr: '',
      durationMs: expect.any(Number),
      stdoutTruncated: false,
      stderrTruncated: false,
      treeTerminated: false
    });
    expect(JSON.stringify(result)).not.toContain(missingExecutable);
  });

  it('rejects a relative cwd before spawning', async () => {
    const ownedFixture = await createOwnedFixture();

    await expect(new WindowsProcessRunner().run({
      ...processSpec(ownedFixture.directory, 'emit-output.ps1'),
      executable: join(ownedFixture.directory, 'missing-process.exe'),
      cwd: '.'
    })).rejects.toThrow(/cwd.*absolute/i);
  });

  it.each([
    ['timeout', { timeoutMs: 0 }],
    ['output limit', { maxOutputBytes: 0 }]
  ])('rejects a non-positive %s before spawning', async (_label, invalid) => {
    const ownedFixture = await createOwnedFixture();

    await expect(new WindowsProcessRunner().run({
      ...processSpec(ownedFixture.directory, 'emit-output.ps1'),
      executable: join(ownedFixture.directory, 'missing-process.exe'),
      ...invalid
    })).rejects.toThrow(/positive/i);
  });
});
