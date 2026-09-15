import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const probeTimeoutMs = 5 * 60_000;
const terminationTimeoutMs = 5_000;
const taskkillExecutable = join(
  process.env.SystemRoot ?? 'C:\\Windows',
  'System32',
  'taskkill.exe'
);

type WriteProbeReport = {
  supported: boolean;
  partialPublications: number;
  overwrittenExternalWrites: number;
  escapedPaths: number;
  cases: { name: string; passed: boolean }[];
};

type BoundedProcessResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

function killProcessTree(child: ChildProcess): Promise<void> {
  if (process.platform !== 'win32' || child.pid === undefined) {
    child.kill();
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const killer = spawn(taskkillExecutable, ['/PID', String(child.pid), '/T', '/F'], {
      shell: false,
      windowsHide: true,
      stdio: 'ignore'
    });
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      try {
        killer.kill();
      } catch {
        // The taskkill helper may already have exited.
      }
      finish();
    }, terminationTimeoutMs);
    killer.once('error', finish);
    killer.once('close', finish);
  });
}

function runBoundedProcess(executable: string, args: string[], timeoutMs: number): Promise<BoundedProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: process.cwd(),
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const stdout: string[] = [];
    const stderr: string[] = [];
    let timedOut = false;
    let terminating = false;
    let settled = false;
    const timer = setTimeout(() => {
      timedOut = true;
      void terminate().then(() => {
        settle({ code: null, signal: null, stdout: stdout.join(''), stderr: stderr.join(''), timedOut });
      });
    }, timeoutMs);

    const settle = (result: BoundedProcessResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const terminate = async () => {
      if (terminating) return;
      terminating = true;
      child.stdout?.destroy();
      child.stderr?.destroy();
      await killProcessTree(child);
      try {
        child.kill();
      } catch {
        // The tree kill already ended the process in the normal case.
      }
    };

    child.once('error', (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    });
    child.stdout?.on('data', (chunk: Buffer) => stdout.push(chunk.toString('utf8')));
    child.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk.toString('utf8')));
    child.once('close', (code, signal) => {
      if (terminating) return;
      settle({ code, signal, stdout: stdout.join(''), stderr: stderr.join(''), timedOut });
    });
  });
}

describe('R2 guarded publication probe', () => {
  it('write probe never overwrites a competing editor', async () => {
    const result = await runBoundedProcess(
      process.execPath,
      ['scripts/spikes/r2-write-probe.mjs', '--iterations', '100'],
      probeTimeoutMs
    );
    expect(result.timedOut, `${result.stderr}\n${result.stdout}`).toBe(false);
    expect(result.code, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout) as WriteProbeReport;

    expect(report.supported).toBe(true);
    expect(report.partialPublications).toBe(0);
    expect(report.overwrittenExternalWrites).toBe(0);
    expect(report.escapedPaths).toBe(0);
    expect(report.cases.length).toBeGreaterThanOrEqual(8);
    expect(report.cases.every((testCase) => testCase.passed)).toBe(true);
  }, probeTimeoutMs + terminationTimeoutMs + 5_000);

  it.skipIf(process.platform !== 'win32')('kills a hanging probe process tree within the hard timeout', async () => {
    const childCode = [
      "const { spawn } = require('node:child_process');",
      "const grandchild = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
      "process.stdout.write(String(grandchild.pid));",
      "setInterval(() => {}, 1000);"
    ].join('');
    const result = await runBoundedProcess(process.execPath, ['-e', childCode], 5_000);

    expect(result.timedOut).toBe(true);
    const grandchildPid = Number.parseInt(result.stdout, 10);
    expect(Number.isSafeInteger(grandchildPid)).toBe(true);
    expect(() => process.kill(grandchildPid, 0)).toThrow();
  }, 20_000);
});
