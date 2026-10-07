import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileWorkspaceObserver } from '../src/filesystem/workspace-observer.js';

describe('FileWorkspaceObserver', () => {
  it('retains watcher evidence of an A to B to A edit between scans', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codryn-r2-aba-'));
    const observer = new FileWorkspaceObserver(root);
    try {
      await writeFile(join(root, 'file.txt'), 'A');
      const before = await observer.inspect(new AbortController().signal);
      await writeFile(join(root, 'file.txt'), 'B');
      await writeFile(join(root, 'file.txt'), 'A');
      const after = await observer.inspect(new AbortController().signal);
      expect(after.fingerprint).toBe(before.fingerprint);
      expect(after.watcherGeneration).not.toBe(before.watcherGeneration);
    } finally { observer.close(); await rm(root, { recursive: true, force: true }); }
  });

  it.each(['head', 'branch', 'indexHash', 'conflicts'] as const)('includes Git %s in verification identity', async (field) => {
    const root = await mkdtemp(join(tmpdir(), 'codryn-r2-git-identity-'));
    const baseline = { mode: 'git' as const, head: 'head', branch: 'main', indexHash: 'index', conflicts: [] as string[], status: [], worktreeIdentity: root };
    const observer = new FileWorkspaceObserver(root, { git: { inspect: async () => baseline } });
    try {
      const before = await observer.inspect(new AbortController().signal);
      if (field === 'conflicts') baseline.conflicts = ['file.txt'];
      else baseline[field] = 'changed';
      const after = await observer.inspect(new AbortController().signal);
      expect(after.gitIdentity).not.toBe(before.gitIdentity);
    } finally { observer.close(); await rm(root, { recursive: true, force: true }); }
  });
  it('hashes project files while excluding sensitive and runtime directories', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codryn-r2-observer-'));
    try {
      await writeFile(join(root, 'README.md'), 'fixture\n', 'utf8');
      await writeFile(join(root, '.env'), 'CANARY\n', 'utf8');
      await mkdir(join(root, 'user-data'));
      await writeFile(join(root, 'user-data', 'ignored.txt'), 'ignored\n', 'utf8');
      const observer = new FileWorkspaceObserver(root);
      try {
        const first = await observer.inspect(new AbortController().signal);
        expect(first.complete).toBe(true);
        expect(first.fingerprint).toMatch(/^[a-f0-9]{64}$/);
        const before = await readFile(join(root, 'README.md'), 'utf8');
        expect(before).toBe('fixture\n');
      } finally { observer.close(); }
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('marks a scan incomplete when the watcher observed a concurrent change', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codryn-r2-observer-'));
    const observer = new FileWorkspaceObserver(root);
    try {
      await writeFile(join(root, 'README.md'), 'one\n', 'utf8');
      const first = await observer.inspect(new AbortController().signal);
      expect(first.complete).toBe(true);
      await writeFile(join(root, 'README.md'), 'two\n', 'utf8');
      await new Promise((resolve) => setTimeout(resolve, 100));
      const second = await observer.inspect(new AbortController().signal);
      expect(second.complete).toBe(true);
      expect(second.fingerprint).not.toBe(first.fingerprint);
    } finally {
      observer.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
