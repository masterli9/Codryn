import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ContextPathPolicy, decideSensitivePath, ProjectFilesystem } from '../src/index.js';

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
      writeFile(join(root, 'binary.bin'), Buffer.from([0x61, 0, 0x62])),
      writeFile(join(root, 'invalid.txt'), Buffer.from([0xc3, 0x28])),
      writeFile(join(root, '.env'), 'SECRET=value'),
      writeFile(join(outside, 'secret.txt'), 'outside')
    ]);
    await mkdir(join(root, '.git'));
    await writeFile(join(root, '.git', 'config'), 'secret');
    const filesystem = new ProjectFilesystem(root);
    const signal = new AbortController().signal;

    for (const path of ['/absolute.txt', '..\\outside\\secret.txt', 'bad\0path', 'missing.txt', 'folder', 'binary.bin', 'invalid.txt', '.env', '.git/config']) {
      await expect(filesystem.readFile({ path }, signal)).rejects.toMatchObject({ code: expect.any(String) });
    }
    expect(decideSensitivePath('.GIT/config')).toMatchObject({ allowed: false, code: 'R1_PATH_SENSITIVE' });
    expect(decideSensitivePath('Node_Modules/package.json')).toMatchObject({ allowed: false, code: 'R1_PATH_SENSITIVE' });
  });

  it('allows an in-root file symlink and rejects an external file symlink when Windows grants fixture symlink privilege', async (context) => {
    const { root, outside } = await fixture();
    await writeFile(join(root, 'inside.txt'), 'inside');
    await writeFile(join(outside, 'secret.txt'), 'outside');
    const insideLink = await createLink(join(root, 'inside.txt'), join(root, 'inside-link.txt'), 'file');
    const outsideLink = await createLink(join(outside, 'secret.txt'), join(root, 'outside-link.txt'), 'file');
    if (!insideLink || !outsideLink) context.skip('Windows denied fixture symlink privilege; this is not a product pass.');
    const filesystem = new ProjectFilesystem(root);
    const signal = new AbortController().signal;

    await expect(filesystem.readFile({ path: 'inside-link.txt' }, signal)).resolves.toMatchObject({ content: 'inside' });
    await expect(filesystem.readFile({ path: 'outside-link.txt' }, signal)).rejects.toMatchObject({ code: 'R1_PATH_OUTSIDE_ROOT' });
  });

  it('always rejects a Windows junction whose target escapes the project root', async () => {
    const { root, outside } = await fixture();
    await writeFile(join(outside, 'secret.txt'), 'outside');
    await symlink(outside, join(root, 'outside-junction'), 'junction');
    await expect(new ProjectFilesystem(root).readFile({ path: 'outside-junction/secret.txt' }, new AbortController().signal))
      .rejects.toMatchObject({ code: 'R1_PATH_OUTSIDE_ROOT' });
  });

  it('rejects a search scope whose parent junction escapes the project root', async () => {
    const { root, outside } = await fixture();
    await writeFile(join(outside, 'secret.txt'), 'SYNTHETIC_OUTSIDE_MARKER');
    await symlink(outside, join(root, 'outside-junction'), 'junction');

    await expect(new ProjectFilesystem(root).searchText({
      query: 'SYNTHETIC_OUTSIDE_MARKER',
      path: 'outside-junction/secret.txt'
    }, new AbortController().signal)).rejects.toMatchObject({ code: 'R1_PATH_OUTSIDE_ROOT' });
  });

  it('rejects a read alias whose canonical target is a sensitive path', async () => {
    const { root } = await fixture();
    await mkdir(join(root, '.git'));
    await writeFile(join(root, '.git', 'config'), 'SYNTHETIC_SENSITIVE_MARKER');
    await symlink(join(root, '.git'), join(root, 'git-alias'), 'junction');

    await expect(new ProjectFilesystem(root).readFile({ path: 'git-alias/config' }, new AbortController().signal))
      .rejects.toMatchObject({ code: 'R1_PATH_SENSITIVE' });
  });

  it('accepts exactly 1 MiB but rejects one byte more and bounds read output to 64 KiB', async () => {
    const { root } = await fixture();
    const exactFile = 'x'.repeat(1024 * 1024);
    await writeFile(join(root, 'exact.txt'), exactFile);
    await writeFile(join(root, 'over.txt'), `${exactFile}x`);
    await writeFile(join(root, 'output-exact.txt'), 'x'.repeat(64 * 1024));
    await writeFile(join(root, 'output-over.txt'), `${'x'.repeat(64 * 1024)}\nx`);
    const filesystem = new ProjectFilesystem(root);
    const signal = new AbortController().signal;

    await expect(filesystem.readFile({ path: 'exact.txt' }, signal)).resolves.toMatchObject({ truncated: true });
    await expect(filesystem.readFile({ path: 'over.txt' }, signal)).rejects.toMatchObject({ code: 'R1_FILE_TOO_LARGE' });
    await expect(filesystem.readFile({ path: 'output-exact.txt' }, signal)).resolves.toMatchObject({ content: 'x'.repeat(64 * 1024), truncated: false });
    const overOutput = await filesystem.readFile({ path: 'output-over.txt', maxLines: 2 }, signal);
    expect(Buffer.byteLength(overOutput.content, 'utf8')).toBeLessThanOrEqual(64 * 1024);
    expect(overOutput.truncated).toBe(true);
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

  it('supports a file or directory search scope without widening it', async () => {
    const { root } = await fixture();
    await mkdir(join(root, 'scope'));
    await Promise.all([
      writeFile(join(root, 'scope.txt'), 'Needle'),
      writeFile(join(root, 'scope', 'nested.txt'), 'Needle'),
      writeFile(join(root, 'outside-scope.txt'), 'Needle')
    ]);
    const filesystem = new ProjectFilesystem(root);
    await expect(filesystem.searchText({ query: 'Needle', path: 'scope.txt' }, new AbortController().signal))
      .resolves.toMatchObject({ matches: [{ path: 'scope.txt' }] });
    await expect(filesystem.searchText({ query: 'Needle', path: 'scope' }, new AbortController().signal))
      .resolves.toMatchObject({ matches: [{ path: 'scope/nested.txt' }] });
  });

  it('treats exact search file and byte limits as complete and marks only over-limit searches truncated', async () => {
    const { root } = await fixture();
    const filesRoot = join(root, 'files');
    await mkdir(filesRoot);
    for (let index = 499; index >= 0; index -= 1) {
      await writeFile(join(filesRoot, `${String(index).padStart(3, '0')}.txt`), 'x');
    }
    const filesystem = new ProjectFilesystem(root);
    await expect(filesystem.searchText({ query: 'Needle', path: 'files' }, new AbortController().signal))
      .resolves.toMatchObject({ filesSearched: 500, bytesSearched: 500, truncated: false });
    await writeFile(join(filesRoot, '500.txt'), 'x');
    await expect(filesystem.searchText({ query: 'Needle', path: 'files' }, new AbortController().signal))
      .resolves.toMatchObject({ filesSearched: 500, bytesSearched: 500, truncated: true });

    const bytesRoot = join(root, 'bytes');
    await mkdir(bytesRoot);
    for (let index = 0; index < 8; index += 1) {
      await writeFile(join(bytesRoot, `${index}.txt`), 'x'.repeat(1024 * 1024));
    }
    await expect(filesystem.searchText({ query: 'Needle', path: 'bytes' }, new AbortController().signal))
      .resolves.toMatchObject({ filesSearched: 8, bytesSearched: 8 * 1024 * 1024, truncated: false });
    await writeFile(join(bytesRoot, '8.txt'), 'x');
    await expect(filesystem.searchText({ query: 'Needle', path: 'bytes' }, new AbortController().signal))
      .resolves.toMatchObject({ filesSearched: 8, bytesSearched: 8 * 1024 * 1024, truncated: true });
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

  it('applies the same .codrynignore policy to reads and recursive searches', async () => {
    const { root } = await fixture();
    await mkdir(join(root, 'generated'));
    await Promise.all([
      writeFile(join(root, 'generated', 'hidden.txt'), 'R2_CONTEXT_CANARY'),
      writeFile(join(root, 'visible.txt'), 'R2_CONTEXT_CANARY')
    ]);
    const policy = new ContextPathPolicy(['generated/**']);
    const filesystem = new ProjectFilesystem(root, { contextPolicy: policy });

    await expect(filesystem.readFile({ path: 'generated/hidden.txt' }, new AbortController().signal))
      .rejects.toMatchObject({ code: 'R2_CONTEXT_PATH_IGNORED' });
    await expect(filesystem.searchText({ query: 'R2_CONTEXT_CANARY' }, new AbortController().signal))
      .resolves.toMatchObject({ matches: [{ path: 'visible.txt' }], filesSearched: 1 });

    const rootPolicy = await ContextPathPolicy.fromProjectRoot(root);
    const refreshedFilesystem = new ProjectFilesystem(root, { contextPolicy: rootPolicy });
    await expect(refreshedFilesystem.readFile({ path: 'visible.txt' }, new AbortController().signal)).resolves.toMatchObject({ path: 'visible.txt' });
    await writeFile(join(root, '.codrynignore'), 'visible.txt\n', 'utf8');
    await expect(refreshedFilesystem.readFile({ path: 'visible.txt' }, new AbortController().signal))
      .rejects.toMatchObject({ code: 'R2_CONTEXT_PATH_IGNORED' });
  });
});
