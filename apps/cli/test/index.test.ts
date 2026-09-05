import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { RunAgentRequest, RunAgentResult } from '@codryn/shared';
import { runCli, type CliDependencies } from '../src/index.js';

const result: RunAgentResult = { schemaVersion: 1, status: 'completed', runId: '11111111-1111-4111-8111-111111111111', stepCount: 3, finalText: 'Hotovo.', verification: { status: 'not_applicable', reason: 'R1_READ_ONLY_RUN' } };

function dependencies(overrides: Partial<CliDependencies> = {}): CliDependencies & { requests: RunAgentRequest[]; output: string[]; errors: string[] } {
  const requests: RunAgentRequest[] = [];
  const output: string[] = [];
  const errors: string[] = [];
  return {
    async createInfrastructure() { return { agentLoop: { async execute(request: RunAgentRequest) { requests.push(request); return result; } }, close() {} }; },
    writeStdout(line) { output.push(line); }, writeStderr(line) { errors.push(line); }, createAbortController: () => new AbortController(),
    requests, output, errors, ...overrides
  };
}

const argv = ['--user-data', 'E:\\data', '--project', 'E:\\project', '--task', 'Summarize'];

describe('runCli', () => {
  it('executes one request and writes exactly one validated JSON line', async () => {
    const deps = dependencies();
    await expect(runCli(deps, argv)).resolves.toBe(0);
    expect(deps.requests).toHaveLength(1);
    expect(deps.output).toHaveLength(1);
    expect(JSON.parse(deps.output[0] ?? '')).toEqual(result);
    expect(deps.errors).toEqual([]);
  });

  it('returns a safe error and no stdout for invalid input', async () => {
    const deps = dependencies();
    await expect(runCli(deps, ['--bad'])).resolves.toBe(2);
    expect([deps.output, deps.errors]).toEqual([[], ['Invalid R1 CLI arguments.\n']]);
  });

  it('maps operational failure to exit code 1 without paths or stacks', async () => {
    const deps = dependencies({ async createInfrastructure() { throw new Error('E:\\private\\secret'); } });
    await expect(runCli(deps, argv)).resolves.toBe(1);
    expect([deps.output, deps.errors]).toEqual([[], ['R1 CLI execution failed.\n']]);
  });

  it('aborts the supplied controller once for SIGINT', async () => {
    let controller: AbortController | undefined;
    const deps = dependencies({ createAbortController() { controller = new AbortController(); return controller; }, onSigint(listener) { listener(); return () => {}; } });
    await expect(runCli(deps, argv)).resolves.toBe(0);
    expect(controller?.signal.aborted).toBe(true);
  });

  it('runs the real process twice against one database with safe JSON output', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codryn-r1-cli-'));
    try {
      await mkdir(join(root, 'src'));
      await writeFile(join(root, 'README.md'), '# R1 fixture\n\nMalý TypeScriptový projekt pro ověření čtení zdrojů a hledání symbolů.\n');
      await writeFile(join(root, 'src', 'greeting.ts'), 'export function formatGreeting(name: string): string {\n  return `Ahoj, ${name}!`;\n}\n');
      await writeFile(join(root, 'src', 'index.ts'), "import { formatGreeting as greeting } from './greeting.js';\ngreeting('A');");
      await writeFile(join(root, 'src', 'preview.ts'), "import { formatGreeting as greeting } from './greeting.js';\ngreeting('B');");
      for (let run = 0; run < 2; run += 1) {
        const child = spawn(process.execPath, ['--no-warnings', '--experimental-loader', pathToFileURL(resolve('apps/cli/src/typescript-resolution-loader.mjs')).href, '--experimental-transform-types', 'apps/cli/src/index.ts', '--user-data', join(root, 'data'), '--project', root, '--task', 'Summarize', '--context', 'README.md'], { cwd: resolve('.'), shell: false });
        let stdout = ''; let stderr = '';
        child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
        child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
        const exitCode = await new Promise<number | null>((done) => child.once('exit', done));
        expect(exitCode, `run ${run + 1}: ${stderr}\n${stdout}`).toBe(0);
        expect(stdout.trim().split('\n')).toHaveLength(1);
        expect(JSON.parse(stdout)).toMatchObject({ status: 'completed', stepCount: 3 });
        expect(stdout).not.toContain(root);
        expect(stderr).not.toContain(root);
        expect(stderr).toBe('');
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
