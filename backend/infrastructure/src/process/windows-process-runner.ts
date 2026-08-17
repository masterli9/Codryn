import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { isAbsolute, join } from 'node:path';
import type { ProcessResult, ProcessRunner, ProcessSpec } from '@codryn/core';
import { BoundedOutput } from './bounded-output.js';

type ForcedTermination = 'timed_out' | 'output_limit_exceeded';

function validateSpec(spec: ProcessSpec): void {
  if (!isAbsolute(spec.cwd)) throw new Error('Process cwd must be absolute.');
  if (!Number.isFinite(spec.timeoutMs) || spec.timeoutMs <= 0) {
    throw new Error('Process timeout must be positive.');
  }
  if (!Number.isFinite(spec.maxOutputBytes) || spec.maxOutputBytes <= 0) {
    throw new Error('Process output limit must be positive.');
  }
}

function selectedSystemRoot(env: ProcessSpec['env']): string {
  const configured = Object.entries(env).find(([key]) => key.toLowerCase() === 'systemroot')?.[1];
  return configured ?? process.env.SystemRoot ?? 'C:\\Windows';
}

function elapsedSince(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}

export class WindowsProcessRunner implements ProcessRunner {
  async run(spec: ProcessSpec): Promise<ProcessResult> {
    validateSpec(spec);
    const startedAt = Date.now();
    let child: ChildProcess;

    try {
      child = spawn(spec.executable, [...spec.args], {
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

    return new Promise<ProcessResult>((resolve) => {
      let settled = false;
      let forcedTermination: ForcedTermination | null = null;
      let timeout: NodeJS.Timeout | null = null;
      let taskkillProcess: ChildProcess | null = null;

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
        if (forcedTermination === null) settle('spawn_failed', null, null, false);
      };
      const onChildClose = (code: number | null, signal: NodeJS.Signals | null): void => {
        if (forcedTermination === null) settle('exited', code, signal, false);
      };
      const onTaskkillError = (): void => {
        finishTermination(false);
      };
      const onTaskkillClose = (code: number | null): void => {
        finishTermination(code === 0);
      };

      function cleanup(): void {
        if (timeout !== null) {
          clearTimeout(timeout);
          timeout = null;
        }
        child.stdout?.off('data', onStdout);
        child.stderr?.off('data', onStderr);
        child.off('error', onChildError);
        child.off('close', onChildClose);
        taskkillProcess?.off('error', onTaskkillError);
        taskkillProcess?.off('close', onTaskkillClose);
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

      function finishTermination(treeTerminated: boolean): void {
        if (forcedTermination === null) return;
        settle(forcedTermination, null, null, treeTerminated);
      }

      function requestTermination(reason: ForcedTermination): void {
        if (settled || forcedTermination !== null) return;
        forcedTermination = reason;
        if (reason === 'output_limit_exceeded') {
          child.stdout?.pause();
          child.stderr?.pause();
        }
        if (timeout !== null) {
          clearTimeout(timeout);
          timeout = null;
        }

        if (child.pid === undefined) {
          finishTermination(false);
          return;
        }

        try {
          taskkillProcess = spawn(
            join(selectedSystemRoot(spec.env), 'System32', 'taskkill.exe'),
            ['/PID', String(child.pid), '/T', '/F'],
            {
              cwd: spec.cwd,
              env: { ...spec.env },
              shell: false,
              windowsHide: true,
              stdio: 'ignore'
            }
          );
          taskkillProcess.once('error', onTaskkillError);
          taskkillProcess.once('close', onTaskkillClose);
        } catch {
          finishTermination(false);
        }
      }

      child.stdout?.on('data', onStdout);
      child.stderr?.on('data', onStderr);
      child.once('error', onChildError);
      child.once('close', onChildClose);
      timeout = setTimeout(() => {
        requestTermination('timed_out');
      }, spec.timeoutMs);
    });
  }
}
