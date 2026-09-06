import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function git(root: string, args: readonly string[]): Promise<void> {
  await execFileAsync('git', [...args], {
    cwd: root,
    shell: false,
    timeout: 10_000,
    maxBuffer: 64 * 1024,
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_OPTIONAL_LOCKS: '0',
      GIT_TERMINAL_PROMPT: '0'
    }
  });
}

export async function createR2Project(mode: 'git' | 'non-git'): Promise<{
  root: string;
  userData: string;
  close(): Promise<void>;
}> {
  const root = await mkdtemp(join(tmpdir(), 'codryn-r2-project-'));
  const userData = join(root, 'user-data');
  await mkdir(userData);
  await writeFile(join(root, 'README.md'), '# R2 fixture\n', 'utf8');
  await writeFile(join(root, 'sum.mjs'), 'export function sum(a, b) { return a - b; }\n', 'utf8');
  await writeFile(join(root, 'sum.test.mjs'), "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { sum } from './sum.mjs';\n\ntest('sum adds both operands', () => assert.equal(sum(2, 3), 5));\n", 'utf8');
  if (mode === 'git') {
    await git(root, ['init', '-b', 'main']);
    await git(root, ['config', '--local', 'user.name', 'Codryn R2 Fixture']);
    await git(root, ['config', '--local', 'user.email', 'r2-fixture@invalid.local']);
    await git(root, ['add', 'README.md', 'sum.mjs', 'sum.test.mjs']);
    await git(root, ['commit', '-m', 'R2 fixture']);
  }
  return {
    root,
    userData,
    close: async () => rm(root, { recursive: true, force: true })
  };
}
