import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type {
  BlobStore,
  ChangeActor,
  GuardedFile,
  GuardedWriter,
  IdGenerator,
  MutationJournal,
  WriteIntent
} from '../src/index.js';
import { ApplyPatch } from '../src/changes/apply-patch.js';
import { RecoverMutations } from '../src/changes/recover-mutations.js';

const projectId = '40000000-0000-4000-8000-000000000001';
const runId = '40000000-0000-4000-8000-000000000002';
const callId = '40000000-0000-4000-8000-000000000003';
const setId = '40000000-0000-4000-8000-000000000004';
const operationId = '40000000-0000-4000-8000-000000000005';
const entryId = '40000000-0000-4000-8000-000000000006';

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function ids(): IdGenerator {
  const values = [operationId, entryId];
  return { next: () => values.shift() as `${string}-${string}-${string}-${string}-${string}` };
}

class FakeBlobStore implements BlobStore {
  readonly values = new Map<string, Uint8Array>();

  async put(bytes: Uint8Array): Promise<string> {
    const value = new Uint8Array(bytes);
    const hash = digest(value);
    this.values.set(hash, value);
    return hash;
  }

  async get(hash: string): Promise<Uint8Array> {
    const value = this.values.get(hash);
    if (value === undefined) throw new Error('missing blob');
    return new Uint8Array(value);
  }
}

class FakeJournal implements MutationJournal {
  pendingIntents: WriteIntent[] = [];
  applied = 0;
  prepareCalls = 0;
  confirmCalls = 0;
  failConfirm = true;

  async prepare(intent: WriteIntent): Promise<void> {
    this.prepareCalls += 1;
    this.pendingIntents.push(intent);
  }

  async confirm(operationIdInput: string): Promise<number> {
    this.confirmCalls += 1;
    if (this.failConfirm) {
      this.failConfirm = false;
      throw new Error('simulated SQLite confirmation failure');
    }
    const index = this.pendingIntents.findIndex((intent) => intent.operationId === operationIdInput);
    if (index >= 0) this.pendingIntents.splice(index, 1);
    this.applied += 1;
    return 7;
  }

  async resolve(operationIdInput: string, state: 'not_applied' | 'conflicted'): Promise<void> {
    const intent = this.pendingIntents.find((candidate) => candidate.operationId === operationIdInput);
    if (intent !== undefined) intent.state = state;
  }

  async pending(): Promise<readonly WriteIntent[]> {
    return this.pendingIntents.filter((intent) => intent.state === 'prepared');
  }

  async entries(): Promise<readonly never[]> {
    return [];
  }
}

class FakeGuardedFile implements GuardedFile {
  readonly bytes: Uint8Array;
  publishCalls = 0;
  closeCalls = 0;
  published: Uint8Array | undefined;

  constructor(bytes: Uint8Array, private readonly failConfirmTarget: { value: Uint8Array | undefined }) {
    this.bytes = new Uint8Array(bytes);
    this.failConfirmTarget.value = undefined;
  }

  async publish(bytes: Uint8Array): Promise<void> {
    this.publishCalls += 1;
    this.published = new Uint8Array(bytes);
    this.failConfirmTarget.value = this.published;
  }

  async close(): Promise<void> {
    this.closeCalls += 1;
  }
}

function fixture(bytes = new TextEncoder().encode('before\n')): {
  writer: GuardedWriter;
  guard: FakeGuardedFile;
  blobs: FakeBlobStore;
  journal: FakeJournal;
  actor: ChangeActor;
} {
  const published = { value: undefined as Uint8Array | undefined };
  const guard = new FakeGuardedFile(bytes, published);
  const writer: GuardedWriter = { open: async () => guard };
  return {
    writer,
    guard,
    blobs: new FakeBlobStore(),
    journal: new FakeJournal(),
    actor: { projectId, runId, callId }
  };
}

describe('ApplyPatch', () => {
  it('publishes once and leaves a recoverable intent when confirmation fails', async () => {
    const f = fixture();
    const input = {
      path: 'src/example.ts',
      expectedHash: digest(new TextEncoder().encode('before\n')),
      edits: [{ oldText: 'before', newText: 'after' }]
    };
    const apply = new ApplyPatch({
      writer: f.writer,
      blobs: f.blobs,
      journal: f.journal,
      ids: ids(),
      setId,
      nextSequence: async () => 1,
      hash: digest
    });

    await expect(apply.execute(input, f.actor, new AbortController().signal)).resolves.toMatchObject({
      status: 'recovery_required',
      operationId
    });
    expect(f.guard.publishCalls).toBe(1);
    expect(f.journal.prepareCalls).toBe(1);
    expect((await f.journal.pending())).toHaveLength(1);

    const recovery = new RecoverMutations({
      journal: f.journal,
      files: { readHash: async () => digest(f.guard.published ?? new Uint8Array()) }
    });
    await recovery.execute(projectId, new AbortController().signal);
    await recovery.execute(projectId, new AbortController().signal);

    expect(f.journal.confirmCalls).toBe(2);
    expect(f.journal.applied).toBe(1);
    expect(await f.journal.pending()).toHaveLength(0);
  });

  it('rejects a stale hash before preparing or publishing', async () => {
    const f = fixture();
    const apply = new ApplyPatch({
      writer: f.writer,
      blobs: f.blobs,
      journal: f.journal,
      ids: ids(),
      setId,
      nextSequence: async () => 1,
      hash: digest
    });

    await expect(apply.execute({
      path: 'src/example.ts',
      expectedHash: 'a'.repeat(64),
      edits: [{ oldText: 'before', newText: 'after' }]
    }, f.actor, new AbortController().signal)).resolves.toEqual({
      status: 'rejected',
      code: 'R2_PATCH_STALE'
    });
    expect(f.guard.publishCalls).toBe(0);
    expect(f.journal.prepareCalls).toBe(0);
  });

  it('preserves a UTF-8 BOM and line endings while applying a text patch', async () => {
    const before = '\uFEFFbefore\r\n';
    const f = fixture(new TextEncoder().encode(before));
    f.journal.failConfirm = false;
    const apply = new ApplyPatch({
      writer: f.writer,
      blobs: f.blobs,
      journal: f.journal,
      ids: ids(),
      setId,
      nextSequence: async () => 1,
      hash: digest
    });

    await expect(apply.execute({
      path: 'src/example.ts',
      expectedHash: digest(new TextEncoder().encode(before)),
      edits: [{ oldText: 'before', newText: 'after' }]
    }, f.actor, new AbortController().signal)).resolves.toMatchObject({ status: 'applied' });
    expect(new TextDecoder('utf-8', { ignoreBOM: true }).decode(f.guard.published)).toBe('\uFEFFafter\r\n');
  });

  it('rejects invalid UTF-8, NUL content, and files over the 1 MiB limit before journaling', async () => {
    const invalid = fixture(new Uint8Array([0xff, 0xfe]));
    const invalidApply = new ApplyPatch({
      writer: invalid.writer,
      blobs: invalid.blobs,
      journal: invalid.journal,
      ids: ids(),
      setId,
      nextSequence: async () => 1,
      hash: digest
    });
    await expect(invalidApply.execute({
      path: 'src/example.ts', expectedHash: digest(new Uint8Array([0xff, 0xfe])),
      edits: [{ oldText: 'x', newText: 'y' }]
    }, invalid.actor, new AbortController().signal)).resolves.toEqual({
      status: 'rejected', code: 'R2_PATCH_INVALID_UTF8'
    });
    expect(invalid.journal.prepareCalls).toBe(0);

    const nulBytes = new TextEncoder().encode('before\0\n');
    const nul = fixture(nulBytes);
    const nulApply = new ApplyPatch({
      writer: nul.writer,
      blobs: nul.blobs,
      journal: nul.journal,
      ids: ids(),
      setId,
      nextSequence: async () => 1,
      hash: digest
    });
    await expect(nulApply.execute({
      path: 'src/example.ts', expectedHash: digest(nulBytes),
      edits: [{ oldText: 'before', newText: 'after' }]
    }, nul.actor, new AbortController().signal)).resolves.toEqual({
      status: 'rejected', code: 'R2_PATCH_NUL'
    });
    expect(nul.journal.prepareCalls).toBe(0);

    const before = `${'a'.repeat(1024 * 1024 - 1)}\n`;
    const tooLarge = fixture(new TextEncoder().encode(before));
    const tooLargeApply = new ApplyPatch({
      writer: tooLarge.writer,
      blobs: tooLarge.blobs,
      journal: tooLarge.journal,
      ids: ids(),
      setId,
      nextSequence: async () => 1,
      hash: digest
    });
    await expect(tooLargeApply.execute({
      path: 'src/example.ts', expectedHash: digest(new TextEncoder().encode(before)),
      edits: [{ oldText: '\n', newText: 'bb' }]
    }, tooLarge.actor, new AbortController().signal)).resolves.toEqual({
      status: 'rejected', code: 'R2_PATCH_FILE_TOO_LARGE'
    });
    expect(tooLarge.journal.prepareCalls).toBe(0);
  });
});
