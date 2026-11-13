import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { searchReferences } from '../src/context/reference-search.js';
import { ContextPathPolicy } from '../src/filesystem/context-path-policy.js';
import { readReferenceIdentity } from '../src/context/reference-identity.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'codryn-reference-')));
  roots.push(root);
  return root;
}
const signal = () => AbortSignal.timeout(10000);

it('returns paginated file and directory references with shared identities and no file body', async () => {
  const root = await fixture();
  await mkdir(join(root, 'src'));
  await writeFile(join(root, 'src', 'název s mezerou.ts'), 'export const test = 1;');
  await writeFile(join(root, 'src', 'embedded.bin'), Buffer.from([0, 255]));
  const first = await searchReferences(root, { query: 'src', limit: 1 }, signal());
  expect(first).toMatchObject({ items: [{ path: 'src', kind: 'directory' }], nextOffset: 1, limited: false });
  const second = await searchReferences(root, { query: 'src', limit: 1, offset: 1 }, signal());
  expect(second).toMatchObject({ items: [{
    path: 'src/název s mezerou.ts', kind: 'file', contentHash: createHash('sha256').update('export const test = 1;').digest('hex')
  }], nextOffset: null, limited: false });
  expect(JSON.stringify(second)).not.toContain('export const');
  const policy = await ContextPathPolicy.fromProjectRoot(root);
  expect(await readReferenceIdentity(root, 'src', policy, 'context', signal())).toMatchObject({
    status: 'ready', reference: first.items[0], children: [{ path: 'src/název s mezerou.ts', kind: 'file' }]
  });
  await writeFile(join(root, 'src', 'new.ts'), '');
  const changed = await readReferenceIdentity(root, 'src', policy, 'context', signal());
  expect(changed.status === 'ready' && changed.reference.contentHash).not.toBe(first.items[0]?.contentHash);
});

it('filters ignored, sensitive, binary and over-limit files before returning results', async () => {
  const root = await fixture();
  await writeFile(join(root, '.codrynignore'), 'ignored.txt\nprivate/\n');
  await mkdir(join(root, 'private'));
  await writeFile(join(root, 'private', 'nested.txt'), 'hidden');
  await writeFile(join(root, 'ignored.txt'), 'hidden');
  await writeFile(join(root, '.env.local'), 'hidden');
  await writeFile(join(root, 'binary.bin'), Buffer.from([0, 255]));
  await writeFile(join(root, 'oversize.txt'), Buffer.alloc(1024 * 1024 + 1, 65));
  await writeFile(join(root, 'safe.txt'), 'safe');
  const page = await searchReferences(root, { query: '' }, signal());
  expect(page.items.map(item => item.path)).toEqual(expect.arrayContaining(['safe.txt']));
  expect(page.items.map(item => item.path)).not.toEqual(expect.arrayContaining(['private', 'ignored.txt']));
  for (const path of ['private', 'private/nested.txt', 'ignored.txt', '.env.local', 'binary.bin', 'oversize.txt']) {
    expect(page.items.some(item => item.path === path)).toBe(false);
  }
});

it('does not enumerate a project junction or disclose its outside children', async () => {
  const root = await fixture(), outside = await fixture();
  await writeFile(join(outside, 'outside.txt'), 'outside data');
  await symlink(outside, join(root, 'alias'), 'junction');
  const page = await searchReferences(root, { query: '' }, signal());
  expect(page.items).toEqual([]);
  const policy = await ContextPathPolicy.fromProjectRoot(root);
  expect(await readReferenceIdentity(root, 'alias/outside.txt', policy, 'context', signal())).toMatchObject({ status: 'outside_root' });
});

it('reports invalid ignore rules without enumerating files', async () => {
  const root = await fixture();
  await writeFile(join(root, '.codrynignore'), '# ignore\n[bad]\n');
  await writeFile(join(root, 'safe.txt'), 'safe');
  await expect(searchReferences(root, { query: '' }, signal())).resolves.toMatchObject({ items: [], nextOffset: null, limited: true, reason: expect.stringContaining('2') });
});
