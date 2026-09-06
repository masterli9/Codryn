import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GuardedFile, GuardedWriter, IdGenerator, MutationJournal, WriteIntent } from '@codryn/core';
import { RevertChanges, type ChangeEntry } from '@codryn/core';
import {
  ContentBlobStore,
  openR0Database,
  SqliteAgentRunStore,
  SqliteChangeSetStore,
  SqliteMutationJournal,
  SqliteToolCallStore,
  SqliteWorkspaceStore,
  UuidGenerator,
  runMigrations
} from '../src/index.js';
import { describe, expect, it } from 'vitest';

const timestamp = '2026-09-06T10:00:00.000Z';
const projectId = '40000000-0000-4000-8000-000000000101';
const runId = '40000000-0000-4000-8000-000000000102';
const requestId = '40000000-0000-4000-8000-000000000103';
const patchCallId = '40000000-0000-4000-8000-000000000104';
const path = 'src/example.txt';

function hash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function changeEntry(
  setId: string,
  id: string,
  sequence: number,
  before: Uint8Array,
  after: Uint8Array
): ChangeEntry {
  return {
    id,
    setId,
    projectId,
    runId,
    callId: patchCallId,
    sequence,
    path,
    beforeHash: hash(before),
    afterHash: hash(after),
    beforeBlob: hash(before),
    afterBlob: hash(after),
    kind: 'patch',
    reversesId: null
  };
}

class DiskGuard implements GuardedFile {
  readonly bytes: Uint8Array;

  constructor(private readonly filename: string, bytes: Uint8Array) {
    this.bytes = new Uint8Array(bytes);
  }

  async publish(bytes: Uint8Array): Promise<void> {
    await writeFile(this.filename, bytes);
  }

  async close(): Promise<void> {}
}

function createDiskWriter(root: string): GuardedWriter {
  return {
    open: async (relativePath, expectedHash) => {
      const filename = join(root, relativePath);
      const bytes = new Uint8Array(await readFile(filename));
      if (hash(bytes) !== expectedHash) throw new Error('R2_PATCH_STALE');
      return new DiskGuard(filename, bytes);
    }
  };
}

async function addToolCall(
  store: SqliteToolCallStore,
  callId: string,
  eventIds: IdGenerator,
  args: Record<string, string>,
  toolId = 'file.patch'
): Promise<void> {
  await store.createWithInitialEvent({
    callId: callId as `${string}-${string}-${string}-${string}-${string}`,
    runId: runId as `${string}-${string}-${string}-${string}-${string}`,
    toolId,
    toolVersion: 1,
    state: 'received',
    arguments: args,
    createdAt: timestamp,
    updatedAt: timestamp
  }, {
    eventId: eventIds.next(),
    eventType: 'tool_call.received',
    eventVersion: 1,
    correlationId: requestId,
    occurredAt: timestamp,
    source: 'core',
    sessionId: runId,
    payload: { callId, toolId }
  });
}

describe('R2 revert SQLite integration', () => {
  it('reverts a same-file chain through the real journal and preserves recorded bytes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codryn-r2-revert-integration-'));
    const projectRoot = join(directory, 'project');
    const database = openR0Database(join(directory, 'codryn.sqlite'));
    const eventIds = new UuidGenerator();
    const changeIds = [
      '40000000-0000-4000-8000-000000000120',
      '40000000-0000-4000-8000-000000000121',
      '40000000-0000-4000-8000-000000000122',
      '40000000-0000-4000-8000-000000000123',
      '40000000-0000-4000-8000-000000000124',
      '40000000-0000-4000-8000-000000000125'
    ];
    const ids: IdGenerator = {
      next: () => changeIds.shift() as `${string}-${string}-${string}-${string}-${string}`
    };

    try {
      runMigrations(database, timestamp);
      await new SqliteAgentRunStore(database).createWithInitialEvent({
        runId: runId as `${string}-${string}-${string}-${string}-${string}`,
        requestId: requestId as `${string}-${string}-${string}-${string}-${string}`,
        state: 'idle',
        task: 'R2 revert integration',
        maxSteps: 8,
        stepCount: 0,
        adapterId: 'fixture',
        modelId: 'fixture',
        createdAt: timestamp,
        updatedAt: timestamp
      }, {
        eventId: eventIds.next(),
        eventType: 'agent_run.created',
        eventVersion: 1,
        correlationId: requestId,
        occurredAt: timestamp,
        source: 'core',
        sessionId: runId,
        payload: { state: 'idle' }
      });
      const toolCalls = new SqliteToolCallStore(database);
      await addToolCall(toolCalls, patchCallId, eventIds, { path });
      const workspace = new SqliteWorkspaceStore(database);
      await workspace.observe(projectId, { fingerprint: 'integration', gitIdentity: null, complete: true });

      await mkdir(join(projectRoot, 'src'), { recursive: true });
      const a = new TextEncoder().encode('A\n');
      const b = new TextEncoder().encode('B\n');
      const c = new TextEncoder().encode('C\n');
      await writeFile(join(projectRoot, path), c);

      const changeSets = new SqliteChangeSetStore(database, { now: () => timestamp }, new UuidGenerator());
      const setId = await changeSets.open(projectId, runId);
      const journal: MutationJournal = new SqliteMutationJournal(database, { now: () => timestamp }, eventIds);
      const blobs = new ContentBlobStore(directory);
      const first = changeEntry(setId, '40000000-0000-4000-8000-000000000130', await changeSets.reserveSequence(setId), a, b);
      const second = changeEntry(setId, '40000000-0000-4000-8000-000000000131', await changeSets.reserveSequence(setId), b, c);
      for (const [operationId, entry, before, after] of [
        ['40000000-0000-4000-8000-000000000140', first, a, b],
        ['40000000-0000-4000-8000-000000000141', second, b, c]
      ] as const) {
        await blobs.put(before);
        await blobs.put(after);
        const intent: WriteIntent = { operationId, entry, state: 'prepared' };
        await journal.prepare(intent);
        await journal.confirm(operationId);
      }
      await changeSets.seal(setId);

      const result = await new RevertChanges({
        writer: createDiskWriter(projectRoot),
        blobs,
        journal,
        ids,
        setId,
        nextSequence: () => changeSets.reserveSequence(setId),
        hash,
        files: { readHash: async (relativePath) => hash(new Uint8Array(await readFile(join(projectRoot, relativePath)))) },
        changeSets,
        createAuditCall: async ({ callId }) => addToolCall(toolCalls, callId, eventIds, { setId }, 'change.revert')
      }).execute({ setId, requestId }, new AbortController().signal);

      expect(result).toMatchObject({ status: 'reverted', revertedIds: [second.id, first.id] });
      expect(new Uint8Array(await readFile(join(projectRoot, path)))).toEqual(a);
      expect(database.prepare('SELECT state FROM change_sets WHERE id = ?').get(setId)).toEqual({ state: 'reverted' });
      expect(await journal.entries(setId)).toHaveLength(4);
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      database.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
