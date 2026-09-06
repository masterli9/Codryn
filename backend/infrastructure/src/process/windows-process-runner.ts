import { spawn } from 'node:child_process';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { isAbsolute, win32 } from 'node:path';
import type { ProcessResult, ProcessRunner, ProcessSpec } from '@codryn/core';
import { BoundedOutput } from './bounded-output.js';

type ForcedTermination = 'timed_out' | 'output_limit_exceeded';
type SpawnProcess = (
  executable: string,
  args: readonly string[],
  options: SpawnOptions
) => ChildProcess;

interface WindowsProcessRunnerInternalOptions {
  readonly spawnProcess: SpawnProcess;
  readonly terminationGraceMs: number;
  readonly fallbackSpawnProcess?: SpawnProcess;
}

const defaultTerminationGraceMs = 1_000;
const defaultSpawnProcess: SpawnProcess = (executable, args, options) => (
  spawn(executable, [...args], options)
);

function fallbackTerminationArgs(pid: number): readonly string[] {
  const script = [
    `$rootId = ${String(pid)}`,
    '$processes = @(Get-Process -ErrorAction Stop)',
    '$ids = [System.Collections.Generic.List[int]]::new()',
    'function Add-Descendant([int] $parentId) { foreach ($process in $processes) { try { $parent = $process.Parent; $childId = [int]$process.Id; if ($null -ne $parent -and [int]$parent.Id -eq $parentId -and -not $ids.Contains($childId)) { $null = $ids.Add($childId); Add-Descendant $childId } } catch { } } }',
    '$null = $ids.Add($rootId)',
    'Add-Descendant $rootId',
    'foreach ($id in @($ids.ToArray() | Sort-Object -Descending)) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }',
    'Start-Sleep -Milliseconds 100',
    '$remaining = @(Get-Process -ErrorAction Stop | Where-Object { $ids.Contains([int]$_.Id) })',
    'if ($remaining.Count -eq 0) { exit 0 } else { exit 1 }'
  ].join('; ');
  return ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script];
}

function requireSystemRoot(env: ProcessSpec['env']): string {
  const configured = Object.entries(env).find(([key]) => key.toLowerCase() === 'systemroot')?.[1];
  if (configured === undefined || configured.trim().length === 0 || !win32.isAbsolute(configured)) {
    throw new Error('Process env SystemRoot must be a nonempty absolute Windows path.');
  }
  return configured;
}

function validateSpec(spec: ProcessSpec): string {
  if (!isAbsolute(spec.cwd)) throw new Error('Process cwd must be absolute.');
  if (!Number.isFinite(spec.timeoutMs) || spec.timeoutMs <= 0) {
    throw new Error('Process timeout must be positive.');
  }
  if (!Number.isFinite(spec.maxOutputBytes) || spec.maxOutputBytes <= 0) {
    throw new Error('Process output limit must be positive.');
  }
  return requireSystemRoot(spec.env);
}

function elapsedSince(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}

class WindowsProcessRunnerLifecycle implements ProcessRunner {
  private readonly spawnProcess: SpawnProcess;
  private readonly terminationGraceMs: number;
  private readonly fallbackSpawnProcess: SpawnProcess | undefined;

  constructor(options: WindowsProcessRunnerInternalOptions) {
    this.spawnProcess = options.spawnProcess;
    this.terminationGraceMs = options.terminationGraceMs;
    this.fallbackSpawnProcess = options.fallbackSpawnProcess;
    if (!Number.isFinite(this.terminationGraceMs) || this.terminationGraceMs <= 0) {
      throw new Error('Process termination grace must be positive.');
    }
  }

  async run(spec: ProcessSpec): Promise<ProcessResult> {
    const systemRoot = validateSpec(spec);
    const startedAt = Date.now();
    let child: ChildProcess;

    try {
      child = this.spawnProcess(spec.executable, [...spec.args], {
        cwd: spec.cwd,
        env: { ...spec.env },
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch {
      return {
        termination: 'spawn_failed',
        exitCode: null,
        signal: null,
        stdout: '',
        stderr: '',
        durationMs: elapsedSince(startedAt),
        stdoutTruncated: false,
        stderrTruncated: false,
        treeTerminated: false
      };
    }

    // Node/libuv owns the native Windows process handle through its exit callback.
    // Node initiates handle release immediately before emitting `exit`; keeping
    // this ChildProcess lifecycle referenced until settlement and blocking
    // taskkill after `exit` prevents the numeric PID from being reused at launch.
    const retainedChild = child;

    const spawnProcess = this.spawnProcess;
    const terminationGraceMs = this.terminationGraceMs;
    const fallbackSpawnProcess = this.fallbackSpawnProcess;

    return new Promise<ProcessResult>((resolve) => {
      let settled = false;
      let childExited = retainedChild.exitCode !== null || retainedChild.signalCode !== null;
      let childClosed = false;
      let childExitCode = retainedChild.exitCode;
      let childSignal: string | null = retainedChild.signalCode;
      let spawnFailed = false;
      let forcedTermination: ForcedTermination | null = null;
      let fallbackAttempted = false;
      let taskkillProcess: ChildProcess | null = null;
      let taskkillClosed = false;
      let taskkillOutcome: boolean | null = null;
      let fallbackProcess: ChildProcess | null = null;
      let fallbackClosed = false;
      let processTimeout: NodeJS.Timeout | null = null;
      let taskkillTimeout: NodeJS.Timeout | null = null;
      let childCloseTimeout: NodeJS.Timeout | null = null;

      const output = new BoundedOutput(spec.maxOutputBytes, () => {
        requestTermination('output_limit_exceeded');
      });

      const onStdout = (chunk: Buffer): void => {
        output.appendStdout(chunk);
      };
      const onStderr = (chunk: Buffer): void => {
        output.appendStderr(chunk);
      };
      const onChildError = (): void => {
        if (settled || forcedTermination !== null || childExited) return;
        if (retainedChild.pid === undefined) {
          spawnFailed = true;
          clearProcessTimeout();
          armChildCloseTimeout();
        }
      };
      const onChildExit = (code: number | null, signal: NodeJS.Signals | null): void => {
        childExited = true;
        childExitCode = code;
        childSignal = signal;
        clearProcessTimeout();
        completeIfReady();
      };
      const onChildClose = (code: number | null, signal: NodeJS.Signals | null): void => {
        childClosed = true;
        if (!childExited) {
          childExitCode = code;
          childSignal = signal;
        }
        clearChildCloseTimeout();
        completeIfReady();
      };
      const onTaskkillError = (): void => {
        recordTaskkillOutcome(false);
      };
      const onTaskkillClose = (code: number | null): void => {
        taskkillClosed = true;
        recordTaskkillOutcome(code === 0);
      };
      const onFallbackError = (): void => {
        recordFallbackOutcome(false);
      };
      const onFallbackClose = (code: number | null): void => {
        fallbackClosed = true;
        recordFallbackOutcome(code === 0);
      };
      const ignoreLateChildError = (): void => undefined;
      const ignoreLateTaskkillError = (): void => undefined;

      function processHasExited(): boolean {
        return childExited || retainedChild.exitCode !== null || retainedChild.signalCode !== null;
      }

      function clearProcessTimeout(): void {
        if (processTimeout === null) return;
        clearTimeout(processTimeout);
        processTimeout = null;
      }

      function clearTaskkillTimeout(): void {
        if (taskkillTimeout === null) return;
        clearTimeout(taskkillTimeout);
        taskkillTimeout = null;
      }

      function clearChildCloseTimeout(): void {
        if (childCloseTimeout === null) return;
        clearTimeout(childCloseTimeout);
        childCloseTimeout = null;
      }

      function releaseOutput(): void {
        retainedChild.stdout?.resume();
        retainedChild.stderr?.resume();
      }

      function destroyOutput(): void {
        retainedChild.stdout?.destroy();
        retainedChild.stderr?.destroy();
      }

      function bestEffortParentFallback(): void {
        if (fallbackAttempted || processHasExited() || retainedChild.pid === undefined) return;
        fallbackAttempted = true;
        if (fallbackSpawnProcess === undefined) {
          try {
            retainedChild.kill();
          } catch {
            // The stable result records unconfirmed tree termination below.
          }
          return;
        }
        try {
          fallbackProcess = fallbackSpawnProcess(
            win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
            fallbackTerminationArgs(retainedChild.pid),
            {
              cwd: spec.cwd,
              env: { ...spec.env },
              shell: false,
              windowsHide: true,
              stdio: 'ignore'
            }
          );
          fallbackProcess.once('error', onFallbackError);
          fallbackProcess.once('close', onFallbackClose);
          taskkillTimeout = setTimeout(() => {
            taskkillTimeout = null;
            try { fallbackProcess?.kill(); } catch { /* The result remains unconfirmed. */ }
            recordFallbackOutcome(false);
          }, terminationGraceMs);
        } catch {
          // The stable result records unconfirmed tree termination below.
          try { retainedChild.kill(); } catch { /* The result remains unconfirmed. */ }
        }
      }

      function recordFallbackOutcome(succeeded: boolean): void {
        if (settled || taskkillOutcome !== null) return;
        if (!succeeded) {
          try { retainedChild.kill(); } catch { /* The result remains unconfirmed. */ }
        }
        taskkillOutcome = succeeded;
        clearTaskkillTimeout();
        releaseOutput();
        completeIfReady();
        if (!settled) armChildCloseTimeout();
      }

      function guardLateErrors(): void {
        retainedChild.off('error', onChildError);
        if (!childClosed) {
          retainedChild.on('error', ignoreLateChildError);
          retainedChild.once('close', () => {
            retainedChild.off('error', ignoreLateChildError);
          });
        }

        taskkillProcess?.off('error', onTaskkillError);
        if (taskkillProcess !== null && !taskkillClosed) {
          const pendingTaskkill = taskkillProcess;
          pendingTaskkill.on('error', ignoreLateTaskkillError);
          pendingTaskkill.once('close', () => {
            pendingTaskkill.off('error', ignoreLateTaskkillError);
          });
        }

        fallbackProcess?.off('error', onFallbackError);
        if (fallbackProcess !== null && !fallbackClosed) {
          const pendingFallback = fallbackProcess;
          pendingFallback.on('error', ignoreLateTaskkillError);
          pendingFallback.once('close', () => {
            pendingFallback.off('error', ignoreLateTaskkillError);
          });
        }
      }

      function cleanup(): void {
        clearProcessTimeout();
        clearTaskkillTimeout();
        clearChildCloseTimeout();
        retainedChild.stdout?.off('data', onStdout);
        retainedChild.stderr?.off('data', onStderr);
        retainedChild.off('exit', onChildExit);
        retainedChild.off('close', onChildClose);
        taskkillProcess?.off('close', onTaskkillClose);
        guardLateErrors();
      }

      function settle(
        termination: ProcessResult['termination'],
        exitCode: number | null,
        signal: string | null,
        treeTerminated: boolean
      ): void {
        if (settled) return;
        settled = true;
        cleanup();
        resolve({
          termination,
          exitCode,
          signal,
          ...output.snapshot(),
          durationMs: elapsedSince(startedAt),
          treeTerminated
        });
      }

      function completeIfReady(): void {
        if (settled) return;
        if (forcedTermination !== null) {
          if (taskkillOutcome !== null && childClosed) {
            settle(forcedTermination, null, null, taskkillOutcome);
          }
          return;
        }
        if (!childClosed) return;
        if (spawnFailed) settle('spawn_failed', null, null, false);
        else settle('exited', childExitCode, childSignal, false);
      }

      function armChildCloseTimeout(): void {
        completeIfReady();
        if (settled || childClosed || childCloseTimeout !== null) return;
        childCloseTimeout = setTimeout(() => {
          childCloseTimeout = null;
          releaseOutput();
          if (forcedTermination !== null && taskkillOutcome !== true) bestEffortParentFallback();
          destroyOutput();
          if (forcedTermination !== null) {
            settle(forcedTermination, null, null, taskkillOutcome === true);
          } else if (spawnFailed) {
            settle('spawn_failed', null, null, false);
          }
        }, terminationGraceMs);
      }

      function recordTaskkillOutcome(succeeded: boolean): void {
        if (settled || taskkillOutcome !== null) return;
        if (!succeeded && fallbackSpawnProcess !== undefined && retainedChild.pid !== undefined) {
          bestEffortParentFallback();
          if (fallbackProcess !== null) return;
        }
        taskkillOutcome = succeeded;
        clearTaskkillTimeout();
        releaseOutput();
        if (!succeeded) bestEffortParentFallback();
        completeIfReady();
        if (!settled) armChildCloseTimeout();
      }

      function armTaskkillTimeout(): void {
        taskkillTimeout = setTimeout(() => {
          taskkillTimeout = null;
          if (taskkillOutcome !== null) return;
          try {
            taskkillProcess?.kill();
          } catch {
            // The taskkill outcome remains unconfirmed.
          }
          recordTaskkillOutcome(false);
        }, terminationGraceMs);
      }

      function requestTermination(reason: ForcedTermination): void {
        if (settled || forcedTermination !== null || processHasExited()) return;
        forcedTermination = reason;
        clearProcessTimeout();
        if (reason === 'output_limit_exceeded') {
          retainedChild.stdout?.pause();
          retainedChild.stderr?.pause();
        }

        if (processHasExited()) {
          forcedTermination = null;
          releaseOutput();
          return;
        }

        if (retainedChild.pid === undefined) {
          taskkillOutcome = false;
          releaseOutput();
          armChildCloseTimeout();
          return;
        }

        if (fallbackSpawnProcess !== undefined) {
          bestEffortParentFallback();
          if (fallbackProcess !== null) return;
        }

        try {
          const spawnedTaskkill = spawnProcess(
            win32.join(systemRoot, 'System32', 'taskkill.exe'),
            ['/PID', String(retainedChild.pid), '/T', '/F'],
            {
              cwd: spec.cwd,
              env: { ...spec.env },
              shell: false,
              windowsHide: true,
              stdio: 'ignore'
            }
          );
          taskkillProcess = spawnedTaskkill;
          spawnedTaskkill.once('error', onTaskkillError);
          spawnedTaskkill.once('close', onTaskkillClose);
          armTaskkillTimeout();
        } catch {
          recordTaskkillOutcome(false);
        }
      }

      retainedChild.stdout?.on('data', onStdout);
      retainedChild.stderr?.on('data', onStderr);
      retainedChild.on('error', onChildError);
      retainedChild.once('exit', onChildExit);
      retainedChild.once('close', onChildClose);
      if (!childExited) {
        processTimeout = setTimeout(() => {
          requestTermination('timed_out');
        }, spec.timeoutMs);
      }
    });
  }
}

export function createWindowsProcessRunnerInternal(
  options: WindowsProcessRunnerInternalOptions
): ProcessRunner {
  return new WindowsProcessRunnerLifecycle(options);
}

export class WindowsProcessRunner implements ProcessRunner {
  private readonly lifecycle: ProcessRunner;

  constructor() {
    this.lifecycle = createWindowsProcessRunnerInternal({
      spawnProcess: defaultSpawnProcess,
      terminationGraceMs: defaultTerminationGraceMs,
      fallbackSpawnProcess: defaultSpawnProcess
    });
  }

  run(spec: ProcessSpec): Promise<ProcessResult> {
    return this.lifecycle.run(spec);
  }
}
