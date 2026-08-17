import { spawn } from 'node:child_process';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import type { ProcessSpec } from '@codryn/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
const taskkillExecutable = join(systemRoot, 'System32', 'taskkill.exe');
const baseArgs = [
  '-NoLogo',
  '-NoProfile',
  '-NonInteractive',
  '-ExecutionPolicy',
  'Bypass',
  '-File'
];
const fixtureDirectory = fileURLToPath(
  new URL('../../../tests/support/fixtures/process/', import.meta.url)
);

interface OwnedFixture {
  readonly directory: string;
  identityFile?: string;
}

interface RecordedProcessIdentity {
  readonly pid: number;
  readonly processName: string;
  readonly startTimeUtcTicks: string;
}

interface FixtureProcessIdentity {
  readonly parent: RecordedProcessIdentity;
  readonly child?: RecordedProcessIdentity;
}

interface SpawnCall {
  readonly executable: string;
  readonly args: readonly string[];
  readonly options: SpawnOptions;
}

const ownedFixtures: OwnedFixture[] = [];
const temporaryRoot = resolve(tmpdir());
const inspectProcessCommand = [
  '$target = Get-Process -Id ([int]$args[0]) -ErrorAction SilentlyContinue',
  'if ($null -ne $target) {',
  "[Console]::Out.Write($target.ProcessName + '|' + $target.StartTime.ToUniversalTime().Ticks)",
  '}'
].join('; ');

class ControlledChild extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly pid: number | undefined;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  killCalls = 0;

  constructor(pid: number | undefined) {
    super();
    this.pid = pid;
  }

  kill(): boolean {
    this.killCalls += 1;
    return true;
  }

  emitExit(code: number | null, signal: NodeJS.Signals | null = null): void {
    this.exitCode = code;
    this.signalCode = signal;
    this.emit('exit', code, signal);
  }

  emitClose(code: number | null, signal: NodeJS.Signals | null = null): void {
    this.stdout.end();
    this.stderr.end();
    this.emit('close', code, signal);
  }
}

type ControlledSpawn = (
  executable: string,
  args: readonly string[],
  options: SpawnOptions
) => ChildProcess;

function controlledRunner(
  main: ControlledChild,
  taskkill: ControlledChild | Error,
  terminationGraceMs = 20
): { readonly runner: WindowsProcessRunner; readonly calls: SpawnCall[] } {
  const calls: SpawnCall[] = [];
  const spawnProcess: ControlledSpawn = (executable, args, options) => {
    calls.push({ executable, args: [...args], options });
    if (calls.length === 1) return main as unknown as ChildProcess;
    if (taskkill instanceof Error) throw taskkill;
    return taskkill as unknown as ChildProcess;
  };
  const RunnerWithOptions = WindowsProcessRunner as unknown as new (options: {
    readonly spawnProcess: ControlledSpawn;
    readonly terminationGraceMs: number;
  }) => WindowsProcessRunner;
  return {
    runner: new RunnerWithOptions({ spawnProcess, terminationGraceMs }),
    calls
  };
}

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
      TEMP: cwd,
      TMP: cwd
    }
  };
}

function controlledProcessSpec(options: {
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
} = {}): ProcessSpec {
  return {
    ...processSpec(fixtureDirectory, 'emit-output.ps1'),
    executable: join(fixtureDirectory, 'controlled-missing.exe'),
    args: [],
    timeoutMs: options.timeoutMs ?? 10,
    maxOutputBytes: options.maxOutputBytes ?? 1_024
  };
}

async function readRecordedPid(pidFile: string): Promise<number | null> {
  try {
    const pid = Number.parseInt((await readFile(pidFile, 'ascii')).trim(), 10);
    return Number.isSafeInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRecordedProcessIdentity(value: unknown): value is RecordedProcessIdentity {
  return isRecord(value) &&
    typeof value.pid === 'number' &&
    Number.isSafeInteger(value.pid) &&
    value.pid > 0 &&
    typeof value.processName === 'string' &&
    value.processName.length > 0 &&
    typeof value.startTimeUtcTicks === 'string' &&
    /^\d+$/.test(value.startTimeUtcTicks);
}

function isFixtureProcessIdentity(value: unknown): value is FixtureProcessIdentity {
  return isRecord(value) &&
    isRecordedProcessIdentity(value.parent) &&
    (value.child === undefined || isRecordedProcessIdentity(value.child));
}

async function readFixtureProcessIdentity(identityFile: string): Promise<FixtureProcessIdentity | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(identityFile, 'ascii'));
    return isFixtureProcessIdentity(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function inspectProcess(pid: number): Promise<RecordedProcessIdentity | null> {
  return new Promise<RecordedProcessIdentity | null>((resolveInspection) => {
    const inspector = spawn(powershell, [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      inspectProcessCommand,
      String(pid)
    ], {
      cwd: temporaryRoot,
      env: {
        SystemRoot: systemRoot,
        PATH: process.env.PATH ?? join(systemRoot, 'System32'),
        TEMP: temporaryRoot,
        TMP: temporaryRoot
      },
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore']
    });
    const chunks: Buffer[] = [];
    let bytes = 0;
    let settled = false;
    const finish = (identity: RecordedProcessIdentity | null): void => {
      if (settled) return;
      settled = true;
      resolveInspection(identity);
    };
    inspector.stdout.on('data', (chunk: Buffer) => {
      if (bytes >= 512) return;
      const accepted = chunk.subarray(0, 512 - bytes);
      chunks.push(Buffer.from(accepted));
      bytes += accepted.length;
    });
    inspector.once('error', () => finish(null));
    inspector.once('close', (code) => {
      if (code !== 0) {
        finish(null);
        return;
      }
      const [processName, startTimeUtcTicks] = Buffer.concat(chunks).toString('utf8').trim().split('|');
      if (processName === undefined || startTimeUtcTicks === undefined || !/^\d+$/.test(startTimeUtcTicks)) {
        finish(null);
        return;
      }
      finish({ pid, processName, startTimeUtcTicks });
    });
  });
}

async function isSameOwnedProcessAlive(identity: RecordedProcessIdentity): Promise<boolean> {
  const live = await inspectProcess(identity.pid);
  return live !== null &&
    live.processName.toLowerCase() === identity.processName.toLowerCase() &&
    live.startTimeUtcTicks === identity.startTimeUtcTicks;
}

async function terminateOwnedProcess(identity: RecordedProcessIdentity): Promise<void> {
  if (!await isSameOwnedProcessAlive(identity)) return;
  await new Promise<void>((resolve) => {
    const killer = spawn(taskkillExecutable, ['/PID', String(identity.pid), '/T', '/F'], {
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
  vi.useRealTimers();
  for (const ownedFixture of ownedFixtures.splice(0)) {
    if (ownedFixture.identityFile !== undefined) {
      const identity = await readFixtureProcessIdentity(ownedFixture.identityFile);
      if (identity !== null) {
        await terminateOwnedProcess(identity.parent);
        if (identity.child !== undefined) await terminateOwnedProcess(identity.child);
      }
    }
    assertOwnedTempDirectory(ownedFixture.directory);
    await rm(ownedFixture.directory, { recursive: true, force: true });
  }
});

const describeWindows = process.platform === 'win32' ? describe : describe.skip;

describeWindows('BoundedOutput', () => {
  it('slices ASCII at the remaining combined-byte budget and notifies once', () => {
    let limitNotifications = 0;
    const output = new BoundedOutput(5, () => {
      limitNotifications += 1;
    });

    output.appendStdout(Buffer.from('abc', 'utf8'));
    output.appendStderr(Buffer.from('wxyz', 'utf8'));

    expect(output.snapshot()).toEqual({
      stdout: 'abc',
      stderr: 'wx',
      stdoutTruncated: false,
      stderrTruncated: true
    });
    expect(limitNotifications).toBe(1);

    output.appendStdout(Buffer.from('later', 'utf8'));
    expect(output.snapshot()).toEqual({
      stdout: 'abc',
      stderr: 'wx',
      stdoutTruncated: true,
      stderrTruncated: true
    });
    expect(limitNotifications).toBe(1);
  });

  it('reassembles a same-stream UTF-8 sequence split across chunks', () => {
    const output = new BoundedOutput(2, () => {
      throw new Error('The exact budget must not notify.');
    });

    output.appendStdout(Buffer.from([0xc3]));
    output.appendStdout(Buffer.from([0xa9]));

    expect(output.snapshot()).toEqual({
      stdout: 'é',
      stderr: '',
      stdoutTruncated: false,
      stderrTruncated: false
    });
  });

  it('accepts an exact combined budget without truncation or notification', () => {
    let limitNotifications = 0;
    const output = new BoundedOutput(4, () => {
      limitNotifications += 1;
    });

    output.appendStdout(Buffer.from('ab', 'utf8'));
    output.appendStderr(Buffer.from('cd', 'utf8'));

    expect(output.snapshot()).toEqual({
      stdout: 'ab',
      stderr: 'cd',
      stdoutTruncated: false,
      stderrTruncated: false
    });
    expect(limitNotifications).toBe(0);
  });

  it('suppresses a sliced partial UTF-8 sequence only on a truncated stream', () => {
    const output = new BoundedOutput(1, () => undefined);

    output.appendStdout(Buffer.from('é', 'utf8'));

    expect(output.snapshot()).toEqual({
      stdout: '',
      stderr: '',
      stdoutTruncated: true,
      stderrTruncated: false
    });
  });

  it('reports an untruncated terminal incomplete UTF-8 sequence deterministically', () => {
    const output = new BoundedOutput(2, () => undefined);

    output.appendStdout(Buffer.from([0xc3]));

    expect(output.snapshot()).toEqual({
      stdout: '�',
      stderr: '',
      stdoutTruncated: false,
      stderrTruncated: false
    });
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
    const identityFile = join(ownedFixture.directory, 'process-identity.json');
    ownedFixture.identityFile = identityFile;

    const run = new WindowsProcessRunner().run(processSpec(
      ownedFixture.directory,
      'spawn-child-tree.ps1',
      {
        scriptArgs: ['-ChildPidFile', childPidFile, '-IdentityFile', identityFile],
        timeoutMs: 1_000
      }
    ));

    let childPid: number | null = null;
    await eventually(async () => {
      childPid = await readRecordedPid(childPidFile);
      const identity = await readFixtureProcessIdentity(identityFile);
      expect(childPid).not.toBeNull();
      expect(identity?.child).toBeDefined();
    }, { timeoutMs: 3_000, intervalMs: 25 });

    const result = await run;
    expect(result).toMatchObject({
      termination: 'timed_out',
      exitCode: null,
      treeTerminated: true
    });
    expect(childPid).not.toBeNull();
    if (childPid === null) throw new Error('The fixture did not record its child PID.');
    const identity = await readFixtureProcessIdentity(identityFile);
    if (identity === null || identity.child === undefined) {
      throw new Error('The fixture did not record both process identities.');
    }
    expect(identity.child.pid).toBe(childPid);
    await eventually(async () => {
      expect(await isSameOwnedProcessAlive(identity.parent)).toBe(false);
      expect(await isSameOwnedProcessAlive(identity.child as RecordedProcessIdentity)).toBe(false);
    }, { timeoutMs: 3_000, intervalMs: 25 });
  });

  it('terminates the producer and marks truncation at the output limit', async () => {
    const ownedFixture = await createOwnedFixture();
    const identityFile = join(ownedFixture.directory, 'process-identity.json');
    ownedFixture.identityFile = identityFile;

    const result = await new WindowsProcessRunner().run(processSpec(
      ownedFixture.directory,
      'large-output.ps1',
      { scriptArgs: ['-IdentityFile', identityFile], maxOutputBytes: 4_096 }
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
    const identity = await readFixtureProcessIdentity(identityFile);
    expect(identity).not.toBeNull();
    if (identity === null) throw new Error('The output fixture did not record its process identity.');
    await eventually(async () => {
      expect(await isSameOwnedProcessAlive(identity.parent)).toBe(false);
    }, { timeoutMs: 3_000, intervalMs: 25 });
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
    ['missing', undefined],
    ['empty', ''],
    ['relative', 'Windows']
  ])('rejects a %s explicit SystemRoot before spawning', async (_label, invalidSystemRoot) => {
    const ownedFixture = await createOwnedFixture();
    const spec = processSpec(ownedFixture.directory, 'emit-output.ps1');
    const env: Record<string, string> = { ...spec.env };
    if (invalidSystemRoot === undefined) delete env.SystemRoot;
    else env.SystemRoot = invalidSystemRoot;

    await expect(new WindowsProcessRunner().run({
      ...spec,
      executable: join(ownedFixture.directory, 'missing-process.exe'),
      env
    })).rejects.toThrow(/SystemRoot.*absolute/i);
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

  it('does not launch taskkill after exit while waiting for close', async () => {
    vi.useFakeTimers();
    const main = new ControlledChild(4_101);
    const taskkill = new ControlledChild(4_102);
    const { runner, calls } = controlledRunner(main, taskkill);
    const run = runner.run(controlledProcessSpec({ timeoutMs: 10, maxOutputBytes: 1 }));

    main.emitExit(0);
    main.stdout.write('ab');
    await vi.advanceTimersByTimeAsync(20);

    expect(calls).toHaveLength(1);
    main.emitClose(0);
    await expect(run).resolves.toMatchObject({
      termination: 'exited',
      exitCode: 0,
      stdout: 'a',
      stdoutTruncated: true,
      treeTerminated: false
    });
  });

  it('resumes paused output and settles bounded after non-zero taskkill', async () => {
    vi.useFakeTimers();
    const main = new ControlledChild(4_201);
    const taskkill = new ControlledChild(4_202);
    const { runner, calls } = controlledRunner(main, taskkill, 20);
    const run = runner.run(controlledProcessSpec({ timeoutMs: 100, maxOutputBytes: 1 }));

    main.stdout.write('ab');
    expect(calls).toHaveLength(2);
    expect(main.stdout.isPaused()).toBe(true);
    expect(calls[1]).toMatchObject({
      executable: taskkillExecutable,
      args: ['/PID', '4201', '/T', '/F']
    });

    taskkill.emitExit(1);
    taskkill.emitClose(1);
    expect(main.killCalls).toBe(1);
    expect(main.stdout.isPaused()).toBe(false);

    await vi.advanceTimersByTimeAsync(21);
    await expect(run).resolves.toMatchObject({
      termination: 'output_limit_exceeded',
      exitCode: null,
      stdout: 'a',
      stdoutTruncated: true,
      treeTerminated: false
    });
    expect(() => main.emit('error', new Error('late controlled child error'))).not.toThrow();
    main.emitClose(null, 'SIGTERM');
  });

  it('handles an asynchronous taskkill spawn error without unsafe late child errors', async () => {
    vi.useFakeTimers();
    const main = new ControlledChild(4_301);
    const taskkill = new ControlledChild(undefined);
    const { runner, calls } = controlledRunner(main, taskkill, 20);
    const run = runner.run(controlledProcessSpec({ timeoutMs: 10 }));

    await vi.advanceTimersByTimeAsync(10);
    expect(calls).toHaveLength(2);
    taskkill.emit('error', new Error('controlled taskkill spawn error'));
    taskkill.emitClose(null);
    expect(main.killCalls).toBe(1);

    await vi.advanceTimersByTimeAsync(21);
    await expect(run).resolves.toMatchObject({
      termination: 'timed_out',
      exitCode: null,
      treeTerminated: false
    });
    expect(() => main.emit('error', new Error('late controlled child error'))).not.toThrow();
    main.emitClose(null, 'SIGTERM');
  });

  it('waits for taskkill outcome when child close wins the race', async () => {
    vi.useFakeTimers();
    const main = new ControlledChild(4_401);
    const taskkill = new ControlledChild(4_402);
    const { runner, calls } = controlledRunner(main, taskkill, 20);
    const run = runner.run(controlledProcessSpec({ timeoutMs: 10 }));
    let settled = false;
    void run.then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(10);
    expect(calls).toHaveLength(2);
    main.emitExit(null, 'SIGTERM');
    main.emitClose(null, 'SIGTERM');
    await Promise.resolve();
    expect(settled).toBe(false);

    taskkill.emitExit(0);
    taskkill.emitClose(0);
    await expect(run).resolves.toMatchObject({
      termination: 'timed_out',
      exitCode: null,
      treeTerminated: true
    });
  });

  it('retains output delivered after taskkill completes but before child close', async () => {
    vi.useFakeTimers();
    const main = new ControlledChild(4_501);
    const taskkill = new ControlledChild(4_502);
    const { runner, calls } = controlledRunner(main, taskkill, 20);
    const run = runner.run(controlledProcessSpec({ timeoutMs: 10 }));
    let settled = false;
    void run.then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(10);
    expect(calls).toHaveLength(2);
    taskkill.emitExit(0);
    taskkill.emitClose(0);
    await Promise.resolve();
    expect(settled).toBe(false);

    main.stdout.write('pending-before-close');
    main.emitExit(null, 'SIGTERM');
    main.emitClose(null, 'SIGTERM');
    await expect(run).resolves.toMatchObject({
      termination: 'timed_out',
      stdout: 'pending-before-close',
      treeTerminated: true
    });
  });

  it('settles a timeout with no PID and keeps a late error handled', async () => {
    vi.useFakeTimers();
    const main = new ControlledChild(undefined);
    const unusedTaskkill = new ControlledChild(4_602);
    const { runner, calls } = controlledRunner(main, unusedTaskkill, 20);
    const run = runner.run(controlledProcessSpec({ timeoutMs: 10 }));

    await vi.advanceTimersByTimeAsync(31);
    await expect(run).resolves.toMatchObject({
      termination: 'timed_out',
      exitCode: null,
      treeTerminated: false
    });
    expect(calls).toHaveLength(1);
    expect(() => main.emit('error', new Error('late no-PID error'))).not.toThrow();
    main.emitClose(null);
  });

  it('bounds a taskkill process that never reports error or close', async () => {
    vi.useFakeTimers();
    const main = new ControlledChild(4_701);
    const taskkill = new ControlledChild(4_702);
    const { runner, calls } = controlledRunner(main, taskkill, 20);
    const run = runner.run(controlledProcessSpec({ timeoutMs: 10 }));

    await vi.advanceTimersByTimeAsync(10);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(41);

    await expect(run).resolves.toMatchObject({
      termination: 'timed_out',
      exitCode: null,
      treeTerminated: false
    });
    expect(taskkill.killCalls).toBe(1);
    expect(main.killCalls).toBe(1);
    expect(() => taskkill.emit('error', new Error('late taskkill error'))).not.toThrow();
    expect(() => main.emit('error', new Error('late controlled child error'))).not.toThrow();
    taskkill.emitClose(null);
    main.emitClose(null, 'SIGTERM');
  });

  it('bounds the wait for child close after successful taskkill', async () => {
    vi.useFakeTimers();
    const main = new ControlledChild(4_801);
    const taskkill = new ControlledChild(4_802);
    const { runner } = controlledRunner(main, taskkill, 20);
    const run = runner.run(controlledProcessSpec({ timeoutMs: 10 }));

    await vi.advanceTimersByTimeAsync(10);
    taskkill.emitExit(0);
    taskkill.emitClose(0);
    await vi.advanceTimersByTimeAsync(21);

    await expect(run).resolves.toMatchObject({
      termination: 'timed_out',
      exitCode: null,
      treeTerminated: true
    });
    expect(() => main.emit('error', new Error('late controlled child error'))).not.toThrow();
    main.emitClose(null, 'SIGTERM');
  });
});
