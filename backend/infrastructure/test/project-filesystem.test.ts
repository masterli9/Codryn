import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectFilesystem } from '../src/index.js';

const roots: string[] = [];

async function fixture(): Promise<{ root: string; outside: string }> {
  const base = await mkdtemp(join(tmpdir(), 'codryn-r1-files-'));
  roots.push(base);
  const root = join(base, 'project');
  const outside = join(base, 'outside');
  await Promise.all([mkdir(root), mkdir(outside)]);
  return { root, outside };
}

async function createLink(target: string, path: string, type?: 'file' | 'dir' | 'junction'): Promise<boolean> {
  try {
    await symlink(target, path, type);
    return true;
  } catch (error: unknown) {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? (error as { code?: string }).code
      : undefined;
    if (code === 'EPERM' || code === 'EACCES') {
      return false;
    }
    throw error;
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('ProjectFilesystem', () => {
  it('reads UTF-8 line ranges, hashes the full file, and truncates by requested lines', async () => {
    const { root } = await fixture();
    await writeFile(join(root, 'notes.txt'), 'first\nsecond\nthird\n', 'utf8');
    const filesystem = new ProjectFilesystem(root);

    await expect(filesystem.readFile({ path: 'notes.txt', startLine: 2, maxLines: 1 }, new AbortController().signal))
      .resolves.toMatchObject({ path: 'notes.txt', content: 'second', startLine: 2, endLine: 2, totalLines: 4, truncated: true });
  });

  it('rejects invalid, absent, directory, binary, invalid UTF-8, sensitive, and escaped reads', async () => {
    const { root, outside } = await fixture();
    await Promise.all([
      mkdir(join(root, 'folder')),
      mkdir(join(root, '.git')),
      writeFile(join(root, 'binary.bin'), Buffer.from([0x61, 0, 0x62])),
      writeFile(join(root, 'invalid.txt'), Buffer.from([0xc3, 0x28])),
      writeFile(join(root, '.env'), 'SECRET=value'),
      writeFile(join(root, '.git', 'config'), 'secret'),
      writeFile(join(outside, 'secret.txt'), 'outside')
    ]);
    const filesystem = new ProjectFilesystem(root);
    const signal = new AbortController().signal;

    for (const path of ['/absolute.txt', '..\\outside\\secret.txt', 'bad\0path', 'missing.txt', 'folder', 'binary.bin', 'invalid.txt', '.env', '.git/config']) {
      await expect(filesystem.readFile({ path }, signal)).rejects.toMatchObject({ code: expect.any(String) });
    }
  });

  it('allows a symlink whose canonical target remains inside root and rejects external symlink and Windows junction escapes', async (context) => {
    const { root, outside } = await fixture();
    await writeFile(join(root, 'inside.txt'), 'inside');
    await writeFile(join(outside, 'secret.txt'), 'outside');
    const insideLink = await createLink(join(root, 'inside.txt'), join(root, 'inside-link.txt'), 'file');
    const outsideLink = await createLink(join(outside, 'secret.txt'), join(root, 'outside-link.txt'), 'file');
    await symlink(outside, join(root, 'outside-junction'), 'junction');
    if (!insideLink || !outsideLink) context.skip('Windows denied fixture symlink privilege; this is not a product pass.');
    const filesystem = new ProjectFilesystem(root);
    const signal = new AbortController().signal;

    await expect(filesystem.readFile({ path: 'inside-link.txt' }, signal)).resolves.toMatchObject({ content: 'inside' });
    await expect(filesystem.readFile({ path: 'outside-link.txt' }, signal)).rejects.toMatchObject({ code: 'R1_PATH_OUTSIDE_ROOT' });
    await expect(filesystem.readFile({ path: 'outside-junction/secret.txt' }, signal)).rejects.toMatchObject({ code: 'R1_PATH_OUTSIDE_ROOT' });
  });

  it('searches literal text in lexicographic path order with case-sensitive columns and bounded previews', async () => {
    const { root } = await fixture();
    await mkdir(join(root, 'nested'));
    await Promise.all([
      writeFile(join(root, 'z.txt'), 'Needle z'),
      writeFile(join(root, 'a.txt'), `prefix Needle ${'x'.repeat(500)}`),
      writeFile(join(root, 'nested', 'b.txt'), 'needle Needle')
    ]);
    const filesystem = new ProjectFilesystem(root);

    const result = await filesystem.searchText({ query: 'Needle' }, new AbortController().signal);
    expect(result.matches.map(({ path, line, column }) => ({ path, line, column }))).toEqual([
      { path: 'a.txt', line: 1, column: 8 },
      { path: 'nested/b.txt', line: 1, column: 8 },
      { path: 'z.txt', line: 1, column: 1 }
    ]);
    expect(result.matches[0]?.preview.length).toBeLessThanOrEqual(400);
    expect(result.filesSearched).toBe(3);
  });

  it('does not follow symlink directories, skips fixed ignored directories and binary files, observes limits, and aborts', async () => {
    const { root, outside } = await fixture();
    await mkdir(join(root, 'node_modules'));
    await Promise.all([
      writeFile(join(root, 'node_modules', 'hidden.txt'), 'Needle'),
      writeFile(join(root, 'binary.bin'), Buffer.from([0, 1])),
      writeFile(join(outside, 'outside.txt'), 'Needle'),
      writeFile(join(root, 'one.txt'), 'Needle\nNeedle\nNeedle')
    ]);
    await symlink(outside, join(root, 'linked-dir'), 'junction');
    const filesystem = new ProjectFilesystem(root);
    const result = await filesystem.searchText({ query: 'Needle', maxResults: 2 }, new AbortController().signal);
    expect(result.matches).toHaveLength(2);
    expect(result.matches.every((match) => match.path === 'one.txt')).toBe(true);
    const controller = new AbortController();
    controller.abort();
    await expect(filesystem.searchText({ query: 'Needle' }, controller.signal)).rejects.toMatchObject({ code: 'R1_CANCELLED' });
  });
});
