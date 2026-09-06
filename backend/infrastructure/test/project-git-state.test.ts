import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createR2Project } from '@codryn/test-support';
import { ProjectGitState } from '../src/git/project-git-state.js';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

describe('ProjectGitState', () => {
  it('observes a dirty repository without changing its index', async () => {
    const fixture = await createR2Project('git');
    try {
      const indexPath = join(fixture.root, '.git', 'index');
      await writeFile(join(fixture.root, 'README.md'), '# staged change\n', 'utf8');
      await execFileAsync('git', ['add', 'README.md'], { cwd: fixture.root, shell: false });
      const stagedIndex = await readFile(indexPath);
      await writeFile(join(fixture.root, 'README.md'), '# unstaged change\n', 'utf8');

      const git = new ProjectGitState(fixture.root);
      const first = await git.inspect(new AbortController().signal);
      await writeFile(join(fixture.root, 'README.md'), '# second unstaged change\n', 'utf8');
      const next = await git.inspect(new AbortController().signal);

      expect(first.mode).toBe('git');
      expect(next.mode).toBe('git');
      if (first.mode !== 'git' || next.mode !== 'git') throw new Error('Expected Git baselines');
      expect(first.status).toEqual(expect.arrayContaining([{ path: 'README.md', xy: 'MM' }]));
      expect(first.indexHash).toBe(next.indexHash);
      expect(next.status).toEqual(expect.arrayContaining([{ path: 'README.md', xy: 'MM' }]));
      expect(await readFile(indexPath)).toEqual(stagedIndex);
    } finally {
      await fixture.close();
    }
  }, 30_000);

  it('distinguishes non-repository roots', async () => {
    const fixture = await createR2Project('non-git');
    try {
      await expect(new ProjectGitState(fixture.root).inspect(new AbortController().signal))
        .resolves.toEqual({ mode: 'non-git', reason: 'not_repository' });
    } finally {
      await fixture.close();
    }
  }, 30_000);

  it('does not inherit a parent repository for a nested non-Git root', async () => {
    const root = await mkdtemp(join(resolve('.'), '.codryn-git-state-'));
    try {
      await mkdir(join(root, 'nested'));
      await expect(new ProjectGitState(join(root, 'nested')).inspect(new AbortController().signal))
        .resolves.toEqual({ mode: 'non-git', reason: 'not_repository' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
});
