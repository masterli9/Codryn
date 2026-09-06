import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { createR2Infrastructure, ProjectGitState } from '@codryn/infrastructure';
import { createR2Project } from '@codryn/test-support';
import { changeVerifyReturnScenario } from '../src/scenarios/change-verify-return.js';

const execFileAsync = promisify(execFile);

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
  }, 30_000);

  it('proves the negative fixture test fails before the model run', async () => {
    const fixture = await createR2Project('non-git');
    try {
      await expect(execFileAsync(process.execPath, ['--test', 'sum.test.mjs'], { cwd: fixture.root, shell: false })).rejects.toBeDefined();
    } finally { await fixture.close(); }
  }, 30_000);
});
