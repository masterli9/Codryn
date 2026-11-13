import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { ReferenceResolver } from '../src/context/reference-resolver.js';
import { searchReferences } from '../src/context/reference-search.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
const signal = () => AbortSignal.timeout(5000);
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'codryn-r4-resolver-')));
  roots.push(root);
  await writeFile(join(root, 'current.txt'), 'version 1');
  const [reference] = (await searchReferences(root, { query: 'current.txt' }, signal())).items;
  if (!reference) throw new Error('Missing search fixture.');
  return { root, reference, resolver: new ReferenceResolver() };
}

it('distinguishes changed content, missing path and changed policy from a current file', async () => {
  const { root, reference, resolver } = await fixture();
  const request = { requestId: randomUUID(), references: [reference] };
  expect((await resolver.resolve(root, request, signal())).results[0]).toMatchObject({ status: 'ready', reference });
  await writeFile(join(root, 'current.txt'), 'version 2');
  expect((await resolver.resolve(root, request, signal())).results[0]).toMatchObject({ status: 'changed' });
  await writeFile(join(root, '.codrynignore'), 'current.txt\n');
  expect((await resolver.resolve(root, request, signal())).results[0]).toMatchObject({ status: 'ignored' });
  await writeFile(join(root, '.codrynignore'), 'other.txt\n');
  await rm(join(root, 'current.txt'));
  expect((await resolver.resolve(root, request, signal())).results[0]).toMatchObject({ status: 'missing' });
});

it('only consumes a confirmed exception for the bound request, file and content', async () => {
  const { root, resolver } = await fixture();
  await writeFile(join(root, '.codrynignore'), '*.txt\n');
  const requestId = randomUUID(), chatId = randomUUID();
  const reference = await resolver.grant(root, { requestId, chatId, path: 'current.txt', kind: 'ignored' }, signal());
  const request = { requestId, chatId, references: [reference] };
  expect((await resolver.resolve(root, { ...request, requestId: randomUUID() }, signal(), true)).results[0]).toMatchObject({ status: 'ignored' });
  expect((await resolver.resolve(root, request, signal())).results[0]).toMatchObject({ status: 'ready' });
  expect((await resolver.resolve(root, request, signal(), true)).results[0]).toMatchObject({ status: 'ready' });
  expect((await resolver.resolve(root, request, signal(), true)).results[0]).toMatchObject({ status: 'ignored' });
  const replacement = await resolver.grant(root, { requestId, chatId, path: 'current.txt', kind: 'ignored' }, signal());
  await writeFile(join(root, 'current.txt'), 'version 2');
  expect((await resolver.resolve(root, { ...request, references: [replacement] }, signal(), true)).results[0]).toMatchObject({ status: 'changed' });
});

it('requires the sensitive confirmation for a known secret', async () => {
  const { root, resolver } = await fixture();
  await writeFile(join(root, '.env.local'), 'test_secret_value');
  const input = { requestId: randomUUID(), chatId: randomUUID(), path: '.env.local' };
  await expect(resolver.grant(root, { ...input, kind: 'ignored' }, signal())).rejects.toThrow();
  await expect(resolver.grant(root, { ...input, kind: 'sensitive' }, signal())).resolves.toMatchObject({ path: '.env.local', kind: 'file' });
});
