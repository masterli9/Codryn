import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type {
  BlobStore,
  ChangeEntry,
  ChangeSetStore,
  GuardedFile,
  GuardedWriter,
  IdGenerator,
  MutationJournal,
  WriteIntent
} from '../src/index.js';
import { RevertChanges, returnOrder } from '../src/changes/revert-changes.js';

const projectId = '40000000-0000-4000-8000-000000000001';
const runId = '40000000-0000-4000-8000-000000000002';
const setId = '40000000-0000-4000-8000-000000000003';

function hash(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function entry(id: string, sequence: number, before: Uint8Array, after: Uint8Array): ChangeEntry {
  return {
    id,
    setId,
    projectId,
    runId,
    callId: '40000000-0000-4000-8000-000000000010',
    sequence,
    path: 'src/example.ts',
    beforeHash: hash(before),
    afterHash: hash(after),
    beforeBlob: hash(before),
    afterBlob: hash(after),
    kind: 'patch',
    reversesId: null
  };
}

class FixtureBlobs implements BlobStore {
  readonly values = new Map<string, Uint8Array>();

  async put(bytes: Uint8Array): Promise<string> {
    const value = new Uint8Array(bytes);
    const digest = hash(value);
    this.values.set(digest, value);
    return digest;
  }

  async get(digest: string): Promise<Uint8Array> {
    const value = this.values.get(digest);
    if (value === undefined) throw new Error('missing blob');
    return new Uint8Array(value);
  }
}

class FixtureJournal implements MutationJournal {
  constructor(readonly appliedEntries: ChangeEntry[]) {}

  readonly intents: WriteIntent[] = [];

  async prepare(intent: WriteIntent): Promise<void> {
    this.intents.push(intent);
  }

  async confirm(operationId: string): Promise<number> {
    const intent = this.intents.find((candidate) => candidate.operationId === operationId);
    if (intent === undefined) throw new Error('missing intent');
    intent.state = 'applied';
    this.appliedEntries.push(intent.entry);
    return this.appliedEntries.length;
  }

  async resolve(operationId: string, state: 'not_applied' | 'conflicted'): Promise<void> {
    const intent = this.intents.find((candidate) => candidate.operationId === operationId);
    if (intent !== undefined) intent.state = state;
  }

  async pending(): Promise<readonly WriteIntent[]> {
    return this.intents.filter((intent) => intent.state === 'prepared');
  }

  async entries(): Promise<readonly ChangeEntry[]> {
    return this.appliedEntries;
  }
}

class FixtureGuard implements GuardedFile {
  publishCalls = 0;

  constructor(private readonly state: { bytes: Uint8Array }) {}

  get bytes(): Uint8Array {
    return new Uint8Array(this.state.bytes);
  }

  async publish(bytes: Uint8Array): Promise<void> {
    this.publishCalls += 1;
    this.state.bytes = new Uint8Array(bytes);
  }

  async close(): Promise<void> {}
}

function fixture(initialEntries: ChangeEntry[], currentBytes: Uint8Array) {
  const state = { bytes: new Uint8Array(currentBytes) };
  const guards: FixtureGuard[] = [];
  const writer: GuardedWriter = {
    open: async (_path, expectedHash) => {
      if (hash(state.bytes) !== expectedHash) throw new Error('R2_PATCH_STALE');
      const guard = new FixtureGuard(state);
      guards.push(guard);
      return guard;
    }
  };
  const journal = new FixtureJournal(initialEntries);
  const blobs = new FixtureBlobs();
  const transitions: string[] = [];
  const changeSets: ChangeSetStore = {
    open: async () => setId,
    reserveSequence: async () => 3,
    seal: async () => undefined,
    transition: async (_id, from, to) => { transitions.push(`${from}->${to}`); }
  };
  const idValues = [
    '40000000-0000-4000-8000-000000000020',
    '40000000-0000-4000-8000-000000000021',
    '40000000-0000-4000-8000-000000000022',
    '40000000-0000-4000-8000-000000000023',
    '40000000-0000-4000-8000-000000000024',
    '40000000-0000-4000-8000-000000000025'
  ];
  const ids: IdGenerator = { next: () => idValues.shift() as `${string}-${string}-${string}-${string}-${string}` };
  return { state, guards, writer, journal, blobs, transitions, changeSets, ids };
}

describe('returnOrder', () => {
  it('processes newest changes first', () => {
    const actor = { projectId: 'p', runId: 'r', callId: 'c' };
    const entry = (id: string, sequence: number) => ({
      ...actor,
      id,
      sequence,
      setId: 's',
      path: 'a.ts',
      beforeHash: 'a',
      afterHash: 'b',
      beforeBlob: 'a',
      afterBlob: 'b',
      kind: 'patch' as const,
      reversesId: null
    });
    expect(returnOrder([entry('old', 1), entry('new', 2)]).map((value) => value.id)).toEqual(['new', 'old']);
  });
});

describe('RevertChanges', () => {
  it('returns a same-file chain from newest to oldest without blocking the older entry', async () => {
    const a = new TextEncoder().encode('A\n');
    const b = new TextEncoder().encode('B\n');
    const c = new TextEncoder().encode('C\n');
    const first = entry('40000000-0000-4000-8000-000000000011', 1, a, b);
    const second = entry('40000000-0000-4000-8000-000000000012', 2, b, c);
    const f = fixture([first, second], c);
    f.blobs.values.set(hash(a), a);
    f.blobs.values.set(hash(b), b);
    f.blobs.values.set(hash(c), c);
    const actor = {
      projectId,
      runId,
      callId: '40000000-0000-4000-8000-000000000013'
    };
    const result = await new RevertChanges({
      writer: f.writer,
      blobs: f.blobs,
      journal: f.journal,
      ids: f.ids,
      setId,
      nextSequence: async () => 3,
      hash,
      files: { readHash: async () => hash(f.state.bytes) },
      changeSets: f.changeSets,
      createAuditCall: async () => undefined
    }).execute({ setId, requestId: '40000000-0000-4000-8000-000000000014' }, new AbortController().signal);

    expect(result).toEqual({ status: 'reverted', revertedIds: [second.id, first.id], blockedIds: [] });
    expect(new TextDecoder().decode(f.state.bytes)).toBe('A\n');
    expect(f.guards.reduce((sum, guard) => sum + guard.publishCalls, 0)).toBe(2);
    expect(f.transitions).toEqual(['sealed->reverting', 'reverting->reverted']);
    expect(actor.projectId).toBe(projectId);
  });

  it('rejects a manual edit during preflight without publishing or changing its bytes', async () => {
    const expected = new TextEncoder().encode('agent\n');
    const manual = new TextEncoder().encode('user\n');
    const original = entry('40000000-0000-4000-8000-000000000015', 1, new TextEncoder().encode('before\n'), expected);
    const f = fixture([original], manual);
    const result = await new RevertChanges({
      writer: f.writer,
      blobs: f.blobs,
      journal: f.journal,
      ids: f.ids,
      setId,
      nextSequence: async () => 2,
      hash,
      files: { readHash: async () => hash(f.state.bytes) },
      changeSets: f.changeSets
    }).execute({ setId, entryId: original.id, requestId: '40000000-0000-4000-8000-000000000016' }, new AbortController().signal);

    expect(result).toEqual({ status: 'conflicted', revertedIds: [], blockedIds: [original.id] });
    expect(new TextDecoder().decode(f.state.bytes)).toBe('user\n');
    expect(f.guards).toHaveLength(0);
    expect(f.transitions).toEqual(['sealed->conflicted']);
  });
});
