import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildCommandEnvironment } from '../src/process/command-environment.js';
import { R2CommandRunner } from '../src/process/r2-command-runner.js';

describe('R2 command environment', () => {
  it('provider secrets never reach a child process environment', () => {
    const env = buildCommandEnvironment({
      PATH: 'bin',
      SystemRoot: 'C:\\Windows',
      OPENAI_API_KEY: 'CANARY',
      GEMINI_API_KEY: 'CANARY',
      PRIVATE_TOKEN: 'CANARY'
    });
    expect(JSON.stringify(env)).not.toContain('CANARY');
    expect(env.PATH).toBe('bin');
  });
});

describe('R2 command runner', () => {
  it('runs an absolute executable inside the exact project directory', async () => {
    if (process.platform !== 'win32') return;
    const root = await mkdtemp(join(tmpdir(), 'codryn-r2-command-'));
    try {
      const runner = new R2CommandRunner(root);
      const result = await runner.run({
        executable: process.execPath,
        args: ['-e', 'process.stdout.write("r2-command-ok")'],
        cwd: root,
        timeoutMs: 5_000,
        maxOutputBytes: 256
      }, new AbortController().signal);
      expect(result).toMatchObject({
        status: 'succeeded',
        exitCode: 0,
        stdout: 'r2-command-ok',
        stderr: '',
        truncated: false,
        treeStopped: true
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it('reports a bounded output limit as an unverified failure', async () => {
    if (process.platform !== 'win32') return;
    const root = await mkdtemp(join(tmpdir(), 'codryn-r2-command-'));
    try {
      const runner = new R2CommandRunner(root);
      const result = await runner.run({
        executable: process.execPath,
        args: ['-e', 'process.stdout.write("0123456789")'],
        cwd: root,
        timeoutMs: 5_000,
        maxOutputBytes: 4
      }, new AbortController().signal);
      expect(result.status).toBe('failed');
      expect(result.truncated).toBe(true);
      expect(result.treeStopped).toBe(true);
      expect(result.stdout.length).toBeLessThanOrEqual(4);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
});
