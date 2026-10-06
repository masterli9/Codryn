import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { BlobStore, ChangeEntry, FileHashReader, MutationJournal } from '../src/index.js';
import { buildFileDiff, GetChangeDiff } from '../src/changes/get-change-diff.js';

function digest(text: string): string {
  return createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

const entry: ChangeEntry = {
  id: '40000000-0000-4000-8000-000000000001',
  setId: '40000000-0000-4000-8000-000000000002',
  projectId: '40000000-0000-4000-8000-000000000003',
  runId: '40000000-0000-4000-8000-000000000004',
  callId: '40000000-0000-4000-8000-000000000005',
  sequence: 1,
  path: 'src/a.ts',
  beforeHash: digest('// user\nconst a = 1;\n'),
  afterHash: digest('// user\nconst a = 2;\n'),
  beforeBlob: digest('// user\nconst a = 1;\n'),
  afterBlob: digest('// user\nconst a = 2;\n'),
  kind: 'patch',
  reversesId: null
};

describe('buildFileDiff', () => {
  it('keeps pre-existing user text as context', () => {
    const diff = buildFileDiff(
      'src/a.ts',
      '// user\nconst a = 1;\n',
      '// user\nconst a = 2;\n',
      'a'.repeat(64),
      'b'.repeat(64)
    );
    expect(diff.lines).toContainEqual({ kind: 'context', text: '// user' });
    expect(diff.lines).toContainEqual({ kind: 'removed', text: 'const a = 1;' });
    expect(diff.lines).toContainEqual({ kind: 'added', text: 'const a = 2;' });
    expect(diff.truncated).toBe(false);
  });

  it('preserves CRLF/BOM text and truncates oversized output deterministically', () => {
    const diff = buildFileDiff('src/a.ts', '\uFEFFone\r\ntwo\r\n', '\uFEFFone\r\nthree\r\n', 'a'.repeat(64), 'b'.repeat(64));
    expect(diff.lines).toContainEqual({ kind: 'removed', text: 'two\r' });
    expect(diff.lines).toContainEqual({ kind: 'added', text: 'three\r' });
    const many = Array.from({ length: 1_100 }, (_, index) => `line-${index}`).join('\n');
    expect(buildFileDiff('src/a.ts', many, '', 'a'.repeat(64), 'b'.repeat(64)).truncated).toBe(true);
  });
});

describe('GetChangeDiff', () => {
  it.each([false, true])('reports remaining changes after a multi-patch revert (complete=%s)', async (complete) => {
    const contents = ['A\n', 'B\n', 'C\n'];
    const hashes = contents.map(digest);
    const makeEntry = (sequence: number, before: number, after: number, kind: ChangeEntry['kind']): ChangeEntry => {
      const beforeHash = hashes[before];
      const afterHash = hashes[after];
      if (beforeHash === undefined || afterHash === undefined) throw new Error('Invalid fixture index');
      return { ...entry, id: randomUUID(), sequence, beforeHash, afterHash, beforeBlob: beforeHash, afterBlob: afterHash, kind };
    };
    const first = makeEntry(1, 0, 1, 'patch');
    const second = makeEntry(2, 1, 2, 'patch');
    const entries = [first, second, { ...makeEntry(3, 2, 1, 'revert'), reversesId: second.id }];
    if (complete) entries.push({ ...makeEntry(4, 1, 0, 'revert'), reversesId: first.id });
    const journal: MutationJournal = {
      async entries() { return entries; }, async pending() { return []; },
      async prepare() {}, async confirm() { return 1; }, async resolve() {}
    };
    const blobs: BlobStore = {
      async get(hash) { return new TextEncoder().encode(contents[hashes.indexOf(hash)]); },
      async put(bytes) { return digest(new TextDecoder().decode(bytes)); }
    };
    const files: FileHashReader = { async readHash() { return digest(complete ? 'A\n' : 'B\n'); } };
    const [diff] = await new GetChangeDiff({ journal, blobs, files }).execute(entry.setId, new AbortController().signal);
    expect(diff?.status).toBe(complete ? 'reverted' : 'changed');
    if (!complete) expect(diff?.lines).toContainEqual({ kind: 'added', text: 'B' });
  });

  it('builds the diff from journaled blobs and marks a newer file as conflicted', async () => {
    const blobs = new Map<string, Uint8Array>([
      [entry.beforeBlob, new TextEncoder().encode('// user\nconst a = 1;\n')],
      [entry.afterBlob, new TextEncoder().encode('// user\nconst a = 2;\n')]
    ]);
    const journal: MutationJournal = {
      async entries() { return [entry]; },
      async pending() { return []; },
      async prepare() {},
      async confirm() { return 1; },
      async resolve() {}
    };
    const blobStore: BlobStore = {
      async get(hash) { return blobs.get(hash) ?? new Uint8Array(); },
      async put(bytes) { return digest(new TextDecoder().decode(bytes)); }
    };
    const files: FileHashReader = { async readHash() { return digest('// user\nconst a = 3;\n'); } };
    const result = await new GetChangeDiff({ journal, blobs: blobStore, files }).execute(entry.setId, new AbortController().signal);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ path: 'src/a.ts', status: 'conflicted' });
  });

  it('groups a patch and its inverse and reports the file as reverted', async () => {
    const reverse: ChangeEntry = {
      ...entry,
      id: '40000000-0000-4000-8000-000000000006',
      sequence: 2,
      beforeHash: entry.afterHash,
      afterHash: entry.beforeHash,
      beforeBlob: entry.afterBlob,
      afterBlob: entry.beforeBlob,
      kind: 'revert',
      reversesId: entry.id
    };
    const journal: MutationJournal = {
      async entries() { return [entry, reverse]; },
      async pending() { return []; },
      async prepare() {},
      async confirm() { return 1; },
      async resolve() {}
    };
    const text = new TextEncoder().encode('// user\nconst a = 1;\n');
    const changed = new TextEncoder().encode('// user\nconst a = 2;\n');
    const blobStore: BlobStore = {
      async get(hash) {
        if (hash === entry.beforeBlob) return text;
        if (hash === entry.afterBlob) return changed;
        throw new Error('missing blob');
      },
      async put(bytes) { return digest(new TextDecoder().decode(bytes)); }
    };
    const files: FileHashReader = { async readHash() { return entry.beforeHash; } };
    const result = await new GetChangeDiff({ journal, blobs: blobStore, files }).execute(entry.setId, new AbortController().signal);
    expect(result[0]).toMatchObject({ status: 'reverted', beforeHash: entry.beforeHash, afterHash: entry.beforeHash });
  });
});
