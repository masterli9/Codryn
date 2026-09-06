import { execFile, spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = resolve('.');
const loader = pathToFileURL(resolve('apps/cli/src/typescript-resolution-loader.mjs')).href;
const entry = resolve('apps/cli/src/index.ts');

async function git(root, args) {
  await execFileAsync('git', args, {
    cwd: root,
    shell: false,
    timeout: 10_000,
    maxBuffer: 64 * 1024,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' }
  });
}

function runCli(root, userData) {
  return new Promise((resolveResult, rejectResult) => {
    const child = spawn(process.execPath, [
      '--no-warnings', '--experimental-loader', loader, '--experimental-transform-types', entry,
      '--user-data', userData, '--project', root, '--task', 'Oprav sum a ověř opravu.',
      '--scenario', 'change-verify-return', '--provider', 'fake', '--max-steps', '8'
    ], { cwd: repoRoot, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', rejectResult);
    child.once('close', (code) => resolveResult({ code, stdout, stderr }));
    child.stdin.end('y\n');
  });
}

async function one(mode, index) {
  const root = await mkdtemp(join(tmpdir(), `codryn-r2-repeat-${mode}-${index}-`));
  try {
    const userData = join(root, 'user-data');
    await mkdir(userData);
    await writeFile(join(root, 'sum.mjs'), 'export function sum(a, b) { return a - b; }\n', 'utf8');
    await writeFile(join(root, 'sum.test.mjs'), "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { sum } from './sum.mjs';\n\ntest('sum adds both operands', () => assert.equal(sum(2, 3), 5));\n", 'utf8');
    if (mode === 'git') {
      await git(root, ['init', '-b', 'main']);
      await git(root, ['config', '--local', 'user.name', 'Codryn R2 Repeatability']);
      await git(root, ['config', '--local', 'user.email', 'r2-repeatability@invalid.local']);
      await git(root, ['add', 'sum.mjs', 'sum.test.mjs']);
      await git(root, ['commit', '-m', 'R2 repeatability fixture']);
    }
    const result = await runCli(root, userData);
    if (result.code !== 0) throw new Error(`${mode} run ${index} failed: ${result.stderr}${result.stdout}`);
    const output = JSON.parse(result.stdout);
    if (output.status !== 'completed' || output.verification?.status !== 'verified') throw new Error(`${mode} run ${index} was not verified`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

if (process.platform !== 'win32') {
  console.error('R2 repeatability requires the Windows process-tree runner.');
  process.exitCode = 2;
} else {
  for (const mode of ['git', 'non-git']) for (let index = 1; index <= 10; index += 1) await one(mode, index);
  process.stdout.write(JSON.stringify({ supported: true, runs: 20, modes: ['git', 'non-git'] }) + '\n');
}
