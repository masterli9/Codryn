import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { createR2Infrastructure, ProjectGitState } from '@codryn/infrastructure';
import { createR2Project } from '@codryn/test-support';
import { changeVerifyReturnScenario } from '../src/scenarios/change-verify-return.js';

const execFileAsync = promisify(execFile);

async function gitOutput(root: string, args: readonly string[]): Promise<string> {
  const result = await execFileAsync('git', [...args], {
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
  return String(result.stdout);
}

async function hash(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function runR2Fixture(mode: 'git' | 'non-git') {
  const fixture = await createR2Project(mode);
  const sumPath = `${fixture.root}\\sum.mjs`;
  const before = await readFile(sumPath);
  const expectedHash = createHash('sha256').update(before).digest('hex');
  const git = new ProjectGitState(fixture.root);
  const baseline = await git.inspect(new AbortController().signal);
  const infrastructure = await createR2Infrastructure({
    projectRoot: fixture.root,
    userDataPath: fixture.userData,
    scenario: changeVerifyReturnScenario({ expectedHash, projectRoot: fixture.root }),
    permissionResponder: async (request) => {
      expect(request.state).toBe('pending');
      expect(request.command.executable).toBe(process.execPath);
      expect(request.command.args).toEqual(['--test', 'sum.test.mjs']);
      expect(request.command.cwd).toBe(fixture.root);
      expect(request.digest).toMatch(/^[a-f0-9]{64}$/);
      return 'allow_once';
    }
  });
  try {
    const requestId = randomUUID();
    const result = await infrastructure.agentLoop.executeR2({
      requestId,
      projectRoot: fixture.root,
      task: 'Oprav sum a ověř opravu cíleným testem.',
      contextReferences: [],
      maxSteps: 8
    }, new AbortController().signal);
    expect(result.status, JSON.stringify(result)).toBe('completed');
    expect(result.verification.status).toBe('verified');
    expect(result.changeSetId).not.toBeNull();
    const setId = result.changeSetId as string;
    const diff = await infrastructure.changes.diff.execute(setId, new AbortController().signal);
    expect(diff).toHaveLength(1);
    expect(diff[0]?.status).toBe('changed');
    expect(diff[0]?.lines.some((line) => line.kind === 'added' && line.text.includes('a + b'))).toBe(true);
    const after = await readFile(sumPath);
    const afterGit = await git.inspect(new AbortController().signal);
    const revert = await infrastructure.changes.revert.execute({ setId, requestId: randomUUID() }, new AbortController().signal);
    const restored = await readFile(sumPath);
    const restoredGit = await git.inspect(new AbortController().signal);
    return {
      status: result.status,
      verification: result.verification.status,
      readCalls: infrastructure.readCalls(),
      returnedToBaseline: Buffer.compare(before, restored) === 0 && (await hash(sumPath)) === expectedHash,
      indexPreserved: baseline.mode !== 'git' || (afterGit.mode === 'git' && restoredGit.mode === 'git' && afterGit.indexHash === baseline.indexHash && restoredGit.indexHash === baseline.indexHash),
      revertStatus: revert.status,
      changedBytes: Buffer.compare(before, after) !== 0
    };
  } finally {
    infrastructure.close();
    await fixture.close();
  }
}

describe('R2 change-verify-return composition', () => {
  it.each(['git', 'non-git'] as const)('completes the full cycle in %s mode', async (mode) => {
    const result = await runR2Fixture(mode);
    expect(result).toMatchObject({ status: 'completed', verification: 'verified', revertStatus: 'reverted', changedBytes: true });
    expect(result.readCalls).toBeGreaterThanOrEqual(2);
    expect(result.returnedToBaseline).toBe(true);
    expect(result.indexPreserved).toBe(true);
  });

  it('preserves a dirty Git baseline and exact index bytes through agent change, diff, and revert', async () => {
    const fixture = await createR2Project('git');
    try {
      const readmePath = join(fixture.root, 'README.md');
      const notesPath = join(fixture.root, 'user-notes.txt');
      const testPath = join(fixture.root, 'sum.test.mjs');
      const sumPath = join(fixture.root, 'sum.mjs');

      expect((await gitOutput(fixture.root, ['rev-parse', '--verify', 'HEAD'])).trim()).toMatch(/^[a-f0-9]{40,64}$/);
      await writeFile(notesPath, 'Committed baseline note.\n', 'utf8');
      await gitOutput(fixture.root, ['add', 'user-notes.txt']);
      await gitOutput(fixture.root, ['commit', '-m', 'Add user notes baseline']);
      await writeFile(readmePath, '# R2 fixture\n# User staged change\n', 'utf8');
      await gitOutput(fixture.root, ['add', 'README.md']);
      await writeFile(notesPath, 'Committed baseline note.\nUser unstaged change.\n', 'utf8');
      await appendFile(join(fixture.root, '.git', 'info', 'exclude'), '\n/user-data/\n', 'utf8');

      const infrastructure = await createR2Infrastructure({
        projectRoot: fixture.root,
        userDataPath: fixture.userData,
        scenario: changeVerifyReturnScenario({ expectedHash: await hash(sumPath), projectRoot: fixture.root }),
        permissionResponder: async (request) => {
          expect(request.state).toBe('pending');
          expect(request.command.executable).toBe(process.execPath);
          expect(request.command.args).toEqual(['--test', 'sum.test.mjs']);
          expect(request.command.cwd).toBe(fixture.root);
          expect(request.digest).toMatch(/^[a-f0-9]{64}$/);
          return 'allow_once';
        }
      });

      try {
        const filesBefore = new Map([
          ['README.md', await readFile(readmePath)],
          ['user-notes.txt', await readFile(notesPath)],
          ['sum.test.mjs', await readFile(testPath)],
          ['sum.mjs', await readFile(sumPath)]
        ]);
        const statusBefore = await gitOutput(fixture.root, ['status', '--porcelain']);
        expect(statusBefore).toContain('M  README.md');
        expect(statusBefore).toContain(' M user-notes.txt');

        const indexPath = resolve(fixture.root, (await gitOutput(fixture.root, ['rev-parse', '--git-path', 'index'])).trim());
        const indexBefore = await readFile(indexPath);
        const indexHashBefore = createHash('sha256').update(indexBefore).digest('hex');

        const result = await infrastructure.agentLoop.executeR2({
          requestId: randomUUID(),
          projectRoot: fixture.root,
          task: 'Oprav sum a ověř opravu cíleným testem.',
          contextReferences: [],
          maxSteps: 8
        }, new AbortController().signal);
        expect(result.status, JSON.stringify(result)).toBe('completed');
        expect(result.verification.status).toBe('verified');
        expect(result.changeSetId).not.toBeNull();

        const setId = result.changeSetId as string;
        const diff = await infrastructure.changes.diff.execute(setId, new AbortController().signal);
        expect(diff).toHaveLength(1);
        expect(diff[0]?.status).toBe('changed');
        expect(diff[0]?.lines.some((line) => line.kind === 'added' && line.text.includes('return a + b'))).toBe(true);
        expect(await readFile(sumPath)).not.toEqual(filesBefore.get('sum.mjs'));

        const reverted = await infrastructure.changes.revert.execute({ setId, requestId: randomUUID() }, new AbortController().signal);
        expect(reverted.status).toBe('reverted');
        expect(await readFile(sumPath)).toEqual(filesBefore.get('sum.mjs'));
        expect(await readFile(readmePath)).toEqual(filesBefore.get('README.md'));
        expect(await readFile(notesPath)).toEqual(filesBefore.get('user-notes.txt'));
        expect(await readFile(testPath)).toEqual(filesBefore.get('sum.test.mjs'));

        const indexAfter = await readFile(indexPath);
        expect(indexAfter).toEqual(indexBefore);
        expect(createHash('sha256').update(indexAfter).digest('hex')).toBe(indexHashBefore);
        expect(await gitOutput(fixture.root, ['status', '--porcelain'])).toBe(statusBefore);
      } finally {
        infrastructure.close();
      }
    } finally {
      await fixture.close();
    }
  }, 60_000);

  it('proves the negative fixture test fails before the model run', async () => {
    const fixture = await createR2Project('non-git');
    try {
      await expect(execFileAsync(process.execPath, ['--test', 'sum.test.mjs'], { cwd: fixture.root, shell: false })).rejects.toBeDefined();
    } finally { await fixture.close(); }
  });
});
