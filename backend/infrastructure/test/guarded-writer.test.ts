import { access, link, mkdir, mkdtemp, readFile, rename, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { WindowsGuardedWriter } from '../src/index.js';
import { createHash } from 'node:crypto';

function digest(value: string): string {
  return createHash('sha256').update(Buffer.from(value, 'utf8')).digest('hex');
}

async function waitForFile(path: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      await access(path);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw new Error(`Timed out waiting for ${path}`);
}

interface GuardWorkerChildForTest {
  readonly exitCode: number | null;
  readonly signalCode: NodeJS.Signals | null;
  readonly stdout: { readonly destroyed: boolean };
  readonly stderr: { readonly destroyed: boolean };
  once(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
}

interface GuardWorkerForTest {
  readonly child: GuardWorkerChildForTest;
  terminate(): Promise<void>;
}

type GuardForTest = Awaited<ReturnType<WindowsGuardedWriter['open']>>;

function guardWorkerForTest(guard: GuardForTest): GuardWorkerForTest {
  return (guard as unknown as { readonly worker: GuardWorkerForTest }).worker;
}

async function waitForWorkerClose(child: GuardWorkerChildForTest, timeoutMs: number): Promise<boolean> {
  if ((child.exitCode !== null || child.signalCode !== null) && child.stdout.destroyed && child.stderr.destroyed) return true;
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    child.once('close', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

async function closeGuardForTest(guard: GuardForTest, timeoutMs = 2_000): Promise<void> {
  const worker = guardWorkerForTest(guard);
  let closeError: unknown;
  let closeSettled = false;
  const close = guard.close().then(
    () => { closeSettled = true; },
    (error: unknown) => { closeSettled = true; closeError = error; }
  );
  let timer: NodeJS.Timeout | undefined;
  const timedOut = await Promise.race([
    close.then(() => false),
    new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(true), timeoutMs);
    })
  ]);
  if (timer !== undefined) clearTimeout(timer);

  if (timedOut) await worker.terminate();
  let workerClosed = await waitForWorkerClose(worker.child, timeoutMs);
  if (!workerClosed) {
    await worker.terminate();
    workerClosed = await waitForWorkerClose(worker.child, timeoutMs);
  }
  if (!workerClosed) throw new Error('Timed out waiting for the guarded-writer test worker to exit.');
  await close;
  if (timedOut) throw new Error('Timed out waiting for the guarded-writer test worker to close cleanly.');
  if (closeError !== undefined) throw closeError;
  if (!closeSettled) throw new Error('The guarded-writer test worker close did not settle.');
}

async function waitForSettled(promise: Promise<unknown>, timeoutMs: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const settled = await Promise.race([
    promise.then(() => true, () => true),
    new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
    })
  ]);
  if (timer !== undefined) clearTimeout(timer);
  return settled;
}

describe('WindowsGuardedWriter', () => {
  it.runIf(process.platform === 'win32')('reads and publishes through the native guard', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codryn-r2-guarded-writer-'));
    try {
      await writeFile(join(directory, 'example.ts'), 'before\r\n', 'utf8');
      const writer = new WindowsGuardedWriter(directory);
      const guard = await writer.open('example.ts', digest('before\r\n'), new AbortController().signal);
      expect(new TextDecoder().decode(guard.bytes)).toBe('before\r\n');
      await guard.publish(new TextEncoder().encode('after\r\n'));
      await guard.close();
      await expect(readFile(join(directory, 'example.ts'), 'utf8')).resolves.toBe('after\r\n');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.runIf(process.platform === 'win32')('rejects a multiply-linked temporary source before publishing it', async () => {
    const enclosing = await mkdtemp(join(tmpdir(), 'codryn-r2-guarded-writer-source-link-'));
    const directory = join(enclosing, 'project');
    const target = join(directory, 'example.ts');
    const outside = join(enclosing, 'outside.txt');
    const workerPath = join(enclosing, 'hooked-worker.ps1');
    const candidatePathFile = join(enclosing, 'candidate-path.txt');
    const continuePublish = join(enclosing, 'continue-publish');
    const publishFinished = join(enclosing, 'publish-finished');
    const shellPath = join(
      process.env.SystemRoot ?? 'C:\\Windows',
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe'
    );
    const realWorker = fileURLToPath(new URL('../src/filesystem/windows-guarded-worker.ps1', import.meta.url));
    const psQuote = (value: string) => `'${value.replaceAll("'", "''")}'`;
    let guard: Awaited<ReturnType<WindowsGuardedWriter['open']>> | undefined;
    let publish: Promise<void> | undefined;
    try {
      await mkdir(directory);
      await writeFile(target, 'before\r\n', 'utf8');
      await writeFile(outside, 'outside-secret\r\n', 'utf8');

      const workerSource = await readFile(realWorker, 'utf8');
      const publishLine = '            $guard.Publish($temporary)';
      const endPublishLine = '              $guard.EndPublish()';
      if (workerSource.split(publishLine).length !== 2 || workerSource.split(endPublishLine).length !== 2) {
        throw new Error('Expected exactly one native publish and EndPublish call in worker');
      }
      const publishBarrier = [
        `            [System.IO.File]::WriteAllText(${psQuote(candidatePathFile)}, $temporary)`,
        `            while (-not [System.IO.File]::Exists(${psQuote(continuePublish)})) { Start-Sleep -Milliseconds 5 }`,
        publishLine
      ].join('\r\n');
      const workerWithBarrier = workerSource.replace(publishLine, publishBarrier);
      const publishFinishedSignal = `${endPublishLine}\r\n              [System.IO.File]::WriteAllText(${psQuote(publishFinished)}, 'done')`;
      await writeFile(workerPath, workerWithBarrier.replace(endPublishLine, publishFinishedSignal), 'utf8');

      guard = await new WindowsGuardedWriter(directory, { workerPath, shellPath }).open(
        'example.ts',
        digest('before\r\n'),
        new AbortController().signal
      );
      publish = guard.publish(new TextEncoder().encode('after\r\n'));
      await waitForFile(candidatePathFile);

      const candidate = await readFile(candidatePathFile, 'utf8');
      await unlink(candidate);
      await link(outside, candidate);
      await writeFile(continuePublish, 'continue', 'utf8');

      await expect(publish).rejects.toThrow('R2_PATH_HARDLINK');
      await waitForFile(publishFinished);
      await closeGuardForTest(guard);
      guard = undefined;
      await expect(readFile(target, 'utf8')).resolves.toBe('before\r\n');
      await expect(readFile(outside, 'utf8')).resolves.toBe('outside-secret\r\n');
    } finally {
      await writeFile(continuePublish, 'continue', 'utf8').catch(() => {});
      const publishSettled = publish === undefined || await waitForSettled(publish, 3_000);
      if (publish !== undefined && publishSettled) await waitForFile(publishFinished).catch(() => {});
      if (guard !== undefined) {
        const opened = guard;
        try {
          await closeGuardForTest(opened);
        } finally {
          guard = undefined;
        }
      }
      await publish?.catch(() => {});
      await rm(enclosing, { recursive: true, force: true });
    }
  }, 15_000);

  it.runIf(process.platform === 'win32')('publishes when an unrelated sibling changes in the enclosing temporary directory', async () => {
    const enclosing = await mkdtemp(join(tmpdir(), 'codryn-r2-guarded-writer-parent-'));
    const directory = join(enclosing, 'project');
    const target = join(directory, 'example.ts');
    let close: (() => Promise<void>) | undefined;
    try {
      await mkdir(directory);
      await writeFile(target, 'before\r\n', 'utf8');
      const guard = await new WindowsGuardedWriter(directory).open(
        'example.ts',
        digest('before\r\n'),
        new AbortController().signal
      );
      close = () => guard.close();

      await writeFile(join(enclosing, 'unrelated.txt'), 'unrelated sibling', 'utf8');
      await guard.publish(new TextEncoder().encode('after\r\n'));

      await expect(readFile(target, 'utf8')).resolves.toBe('after\r\n');
    } finally {
      await close?.();
      await rm(enclosing, { recursive: true, force: true });
    }
  });

  it.runIf(process.platform === 'win32')('rejects a parent junction introduced after path validation', async () => {
    const enclosing = await mkdtemp(join(tmpdir(), 'codryn-r2-guarded-writer-junction-swap-'));
    const directory = join(enclosing, 'project');
    const moved = join(enclosing, 'project-original');
    const outside = join(enclosing, 'outside');
    const target = join(directory, 'example.ts');
    const wrapper = join(enclosing, 'delayed-worker.ps1');
    const workerStarted = join(enclosing, 'worker-started');
    const continueWorker = join(enclosing, 'continue-worker');
    const shellPath = join(
      process.env.SystemRoot ?? 'C:\\Windows',
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe'
    );
    const realWorker = fileURLToPath(new URL('../src/filesystem/windows-guarded-worker.ps1', import.meta.url));
    const psQuote = (value: string) => `'${value.replaceAll("'", "''")}'`;
    let opening: ReturnType<WindowsGuardedWriter['open']> | undefined;
    try {
      await Promise.all([mkdir(directory), mkdir(outside)]);
      await writeFile(target, 'before\r\n', 'utf8');
      await writeFile(join(outside, 'example.ts'), 'outside\r\n', 'utf8');
      await writeFile(wrapper, [
        'param([string]$NativeGuardPath, [string]$Target, [string]$Root, [uint32]$RootVolumeSerialNumber, [uint64]$RootFileIndex)',
        `[System.IO.File]::WriteAllText(${psQuote(workerStarted)}, 'ready')`,
        `while (-not [System.IO.File]::Exists(${psQuote(continueWorker)})) { Start-Sleep -Milliseconds 5 }`,
        `& ${psQuote(realWorker)} -NativeGuardPath $NativeGuardPath -Target $Target -Root $Root -RootVolumeSerialNumber $RootVolumeSerialNumber -RootFileIndex $RootFileIndex`,
        'exit $LASTEXITCODE'
      ].join('\r\n'), 'utf8');

      opening = new WindowsGuardedWriter(directory, { workerPath: wrapper, shellPath }).open(
        'example.ts',
        digest('before\r\n'),
        new AbortController().signal
      );
      await waitForFile(workerStarted);

      await rename(directory, moved);
      await symlink(outside, directory, 'junction');
      await writeFile(continueWorker, 'continue', 'utf8');

      await expect(opening).rejects.toThrow('R2_PATH_REPARSE');
      await expect(readFile(join(moved, 'example.ts'), 'utf8')).resolves.toBe('before\r\n');
      await expect(readFile(join(outside, 'example.ts'), 'utf8')).resolves.toBe('outside\r\n');
    } finally {
      await writeFile(continueWorker, 'continue', 'utf8').catch(() => {});
      const opened = await opening?.catch(() => undefined);
      await opened?.close();
      await rm(enclosing, { recursive: true, force: true });
    }
  });

  it.runIf(process.platform === 'win32')('rejects a parent directory replaced after path validation', async () => {
    const enclosing = await mkdtemp(join(tmpdir(), 'codryn-r2-guarded-writer-parent-swap-'));
    const directory = join(enclosing, 'project');
    const moved = join(enclosing, 'project-original');
    const target = join(directory, 'example.ts');
    const wrapper = join(enclosing, 'delayed-worker.ps1');
    const workerStarted = join(enclosing, 'worker-started');
    const continueWorker = join(enclosing, 'continue-worker');
    const shellPath = join(
      process.env.SystemRoot ?? 'C:\\Windows',
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe'
    );
    const realWorker = fileURLToPath(new URL('../src/filesystem/windows-guarded-worker.ps1', import.meta.url));
    const psQuote = (value: string) => `'${value.replaceAll("'", "''")}'`;
    let opening: ReturnType<WindowsGuardedWriter['open']> | undefined;
    try {
      await mkdir(directory);
      await writeFile(target, 'before\r\n', 'utf8');
      await writeFile(wrapper, [
        'param([string]$NativeGuardPath, [string]$Target, [string]$Root, [uint32]$RootVolumeSerialNumber, [uint64]$RootFileIndex)',
        `[System.IO.File]::WriteAllText(${psQuote(workerStarted)}, 'ready')`,
        `while (-not [System.IO.File]::Exists(${psQuote(continueWorker)})) { Start-Sleep -Milliseconds 5 }`,
        `& ${psQuote(realWorker)} -NativeGuardPath $NativeGuardPath -Target $Target -Root $Root -RootVolumeSerialNumber $RootVolumeSerialNumber -RootFileIndex $RootFileIndex`,
        'exit $LASTEXITCODE'
      ].join('\r\n'), 'utf8');

      opening = new WindowsGuardedWriter(directory, { workerPath: wrapper, shellPath }).open(
        'example.ts',
        digest('before\r\n'),
        new AbortController().signal
      );
      await waitForFile(workerStarted);

      await rename(directory, moved);
      await mkdir(directory);
      await writeFile(target, 'before\r\n', 'utf8');
      await writeFile(continueWorker, 'continue', 'utf8');

      await expect(opening).rejects.toThrow('R2_GUARD_PARENT_CHANGED');
      await expect(readFile(join(moved, 'example.ts'), 'utf8')).resolves.toBe('before\r\n');
      await expect(readFile(target, 'utf8')).resolves.toBe('before\r\n');
    } finally {
      await writeFile(continueWorker, 'continue', 'utf8').catch(() => {});
      const opened = await opening?.catch(() => undefined);
      await opened?.close();
      await rm(enclosing, { recursive: true, force: true });
    }
  });

  it.runIf(process.platform === 'win32')('rejects a junction in an ancestor of the target parent', async () => {
    const enclosing = await mkdtemp(join(tmpdir(), 'codryn-r2-guarded-writer-ancestor-junction-'));
    const root = join(enclosing, 'project');
    const subdirectory = join(root, 'subdir');
    const moved = join(root, 'subdir-original');
    const outside = join(enclosing, 'outside');
    const originalTarget = join(subdirectory, 'child', 'example.ts');
    const outsideTarget = join(outside, 'child', 'example.ts');
    const wrapper = join(enclosing, 'delayed-worker.ps1');
    const workerStarted = join(enclosing, 'worker-started');
    const continueWorker = join(enclosing, 'continue-worker');
    const shellPath = join(
      process.env.SystemRoot ?? 'C:\\Windows',
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe'
    );
    const realWorker = fileURLToPath(new URL('../src/filesystem/windows-guarded-worker.ps1', import.meta.url));
    const psQuote = (value: string) => `'${value.replaceAll("'", "''")}'`;
    let opening: ReturnType<WindowsGuardedWriter['open']> | undefined;
    try {
      await Promise.all([mkdir(join(subdirectory, 'child'), { recursive: true }), mkdir(join(outside, 'child'), { recursive: true })]);
      await writeFile(originalTarget, 'before\r\n', 'utf8');
      await writeFile(outsideTarget, 'before\r\n', 'utf8');
      await writeFile(wrapper, [
        'param([string]$NativeGuardPath, [string]$Target, [string]$Root, [uint32]$RootVolumeSerialNumber, [uint64]$RootFileIndex)',
        `[System.IO.File]::WriteAllText(${psQuote(workerStarted)}, 'ready')`,
        `while (-not [System.IO.File]::Exists(${psQuote(continueWorker)})) { Start-Sleep -Milliseconds 5 }`,
        `& ${psQuote(realWorker)} -NativeGuardPath $NativeGuardPath -Target $Target -Root $Root -RootVolumeSerialNumber $RootVolumeSerialNumber -RootFileIndex $RootFileIndex`,
        'exit $LASTEXITCODE'
      ].join('\r\n'), 'utf8');

      opening = new WindowsGuardedWriter(root, { workerPath: wrapper, shellPath }).open(
        'subdir/child/example.ts',
        digest('before\r\n'),
        new AbortController().signal
      );
      await waitForFile(workerStarted);

      await rename(subdirectory, moved);
      await symlink(outside, subdirectory, 'junction');
      await writeFile(continueWorker, 'continue', 'utf8');

      await expect(opening).rejects.toThrow('R2_PATH_REPARSE');
      await expect(readFile(join(moved, 'child', 'example.ts'), 'utf8')).resolves.toBe('before\r\n');
      await expect(readFile(outsideTarget, 'utf8')).resolves.toBe('before\r\n');
    } finally {
      await writeFile(continueWorker, 'continue', 'utf8').catch(() => {});
      const opened = await opening?.catch(() => undefined);
      await opened?.close();
      await rm(enclosing, { recursive: true, force: true });
    }
  });

  it('fails closed outside Windows instead of using an unsafe fallback', async () => {
    if (process.platform === 'win32') return;
    const writer = new WindowsGuardedWriter(process.cwd());
    await expect(writer.open('package.json', 'a'.repeat(64), new AbortController().signal))
      .rejects.toThrow('R2_GUARD_UNSUPPORTED');
  });
});
