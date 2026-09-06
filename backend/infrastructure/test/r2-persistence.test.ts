import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { MutationJournal, WriteIntent } from '@codryn/core';
import {
  SqliteAgentRunStore,
  SqliteChangeSetStore,
  SqliteMutationJournal,
  SqliteToolCallStore,
  SqliteWorkspaceStore,
  SqliteProjectBaselineStore,
  ContentBlobStore,
  openR0Database,
  runMigrations
} from '../src/index.js';

const timestamp = '2026-09-06T09:30:00.000Z';
const projectId = '40000000-0000-4000-8000-000000000001';
const runId = '40000000-0000-4000-8000-000000000002';
const callId = '40000000-0000-4000-8000-000000000003';

async function createChangeStoreFixture(): Promise<{
  journal: MutationJournal;
  intent: WriteIntent;
  database: DatabaseSync;
  revision(): number;
  eventCount(): number;
  close(): Promise<void>;
}> {
  const directory = await mkdtemp(join(tmpdir(), 'codryn-r2-persistence-'));
  const database = openR0Database(join(directory, 'codryn.sqlite'));
  runMigrations(database, timestamp);

  const agentRuns = new SqliteAgentRunStore(database);
  await agentRuns.createWithInitialEvent({
    runId,
    requestId: '40000000-0000-4000-8000-000000000004',
    state: 'idle',
    task: 'R2 persistence fixture',
    maxSteps: 8,
    stepCount: 0,
    adapterId: 'fixture',
    modelId: 'fixture',
    createdAt: timestamp,
    updatedAt: timestamp
  }, {
    eventId: '40000000-0000-4000-8000-000000000005',
    eventType: 'agent_run.created',
    eventVersion: 1,
    correlationId: '40000000-0000-4000-8000-000000000004',
    occurredAt: timestamp,
    source: 'core',
    sessionId: runId,
    payload: { state: 'idle' }
  });
  await new SqliteToolCallStore(database).createWithInitialEvent({
    callId,
    runId,
    toolId: 'file.patch',
    toolVersion: 1,
    state: 'received',
    arguments: { path: 'src/example.ts' },
    createdAt: timestamp,
    updatedAt: timestamp
  }, {
    eventId: '40000000-0000-4000-8000-000000000006',
    eventType: 'tool_call.received',
    eventVersion: 1,
    correlationId: '40000000-0000-4000-8000-000000000004',
    occurredAt: timestamp,
    source: 'core',
    sessionId: runId,
    payload: { callId, toolId: 'file.patch' }
  });

  const workspace = new SqliteWorkspaceStore(database);
  await workspace.observe(projectId, { fingerprint: 'fixture-fingerprint', gitIdentity: null, complete: true });
  const ids = {
    values: [
      '40000000-0000-4000-8000-000000000007',
      '40000000-0000-4000-8000-000000000008',
      '40000000-0000-4000-8000-000000000009'
    ],
    next() {
      const value = this.values.shift();
      if (value === undefined) throw new Error('fixture id exhausted');
      return value as `${string}-${string}-${string}-${string}-${string}`;
    }
  };
  const changeSets = new SqliteChangeSetStore(database, { now: () => timestamp }, ids);
  const setId = await changeSets.open(projectId, runId);
  const sequence = await changeSets.reserveSequence(setId);
  const intent: WriteIntent = {
    operationId: '40000000-0000-4000-8000-00000000000a',
    state: 'prepared',
    entry: {
      id: '40000000-0000-4000-8000-00000000000b',
      setId,
      projectId,
      runId,
      callId,
      sequence,
      path: 'src/example.ts',
      beforeHash: 'a'.repeat(64),
      afterHash: 'b'.repeat(64),
      beforeBlob: 'a'.repeat(64),
      afterBlob: 'b'.repeat(64),
      kind: 'patch',
      reversesId: null
    }
  };
  const journal = new SqliteMutationJournal(database, { now: () => timestamp }, ids);
  return {
    journal,
    intent,
    database,
    revision: () => database.prepare('SELECT revision FROM workspaces WHERE id = ?').get(projectId)?.revision as number,
    eventCount: () => database.prepare('SELECT COUNT(*) AS count FROM events').get()?.count as number,
    close: async () => {
      database.close();
      await rm(directory, { recursive: true, force: true });
    }
  };
}

describe('R2 SQLite mutation persistence', () => {
  it('confirm is idempotent for audit and revision', async () => {
    const fixture = await createChangeStoreFixture();
    try {
      await fixture.journal.prepare(fixture.intent);
      const beforeEvents = fixture.eventCount();
      const first = await fixture.journal.confirm(fixture.intent.operationId);
      const second = await fixture.journal.confirm(fixture.intent.operationId);
      expect(second).toBe(first);
      expect(fixture.revision()).toBe(first);
      expect(fixture.eventCount()).toBe(beforeEvents + 1);
    } finally {
      await fixture.close();
    }
  });

  it('keeps a prepared operation pending until it is explicitly resolved', async () => {
    const fixture = await createChangeStoreFixture();
    try {
      await fixture.journal.prepare(fixture.intent);
      await fixture.journal.prepare(fixture.intent);
      await expect(fixture.journal.pending(projectId)).resolves.toHaveLength(1);
      await fixture.journal.resolve(fixture.intent.operationId, 'conflicted');
      await expect(fixture.journal.pending(projectId)).resolves.toEqual([]);
      await expect(fixture.journal.entries(fixture.intent.entry.setId)).resolves.toEqual([]);
      await expect(fixture.journal.confirm(fixture.intent.operationId))
        .rejects.toThrow('R2_MUTATION_NOT_PREPARED');
    } finally {
      await fixture.close();
    }
  });

  it('rejects a duplicate operation with different meaning and preserves foreign-key integrity', async () => {
    const fixture = await createChangeStoreFixture();
    try {
      await fixture.journal.prepare(fixture.intent);
      await expect(fixture.journal.prepare({
        ...fixture.intent,
        entry: { ...fixture.intent.entry, afterHash: 'c'.repeat(64), afterBlob: 'c'.repeat(64) }
      })).rejects.toThrow('R2_MUTATION_ID_CONFLICT');
      await expect(fixture.journal.prepare({
        ...fixture.intent,
        operationId: '40000000-0000-4000-8000-00000000000c',
        entry: {
          ...fixture.intent.entry,
          id: '40000000-0000-4000-8000-00000000000d',
          callId: '40000000-0000-4000-8000-00000000000e'
        }
      })).rejects.toThrow();
      expect(fixture.database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(fixture.database.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
    } finally {
      await fixture.close();
    }
  });

  it('increments workspace revision only when an observation changes and reserves sequences atomically', async () => {
    const fixture = await createChangeStoreFixture();
    try {
      const workspace = new SqliteWorkspaceStore(fixture.database);
      await expect(workspace.observe(projectId, {
        fingerprint: 'fixture-fingerprint',
        gitIdentity: null,
        complete: true
      })).resolves.toMatchObject({ revision: 0 });
      await expect(workspace.observe(projectId, {
        fingerprint: 'changed-fingerprint',
        gitIdentity: null,
        complete: true
      })).resolves.toMatchObject({ revision: 1 });
      const sequences = new SqliteChangeSetStore(
        fixture.database,
        { now: () => timestamp },
        { next: () => '40000000-0000-4000-8000-00000000000f' }
      );
      await expect(sequences.reserveSequence(fixture.intent.entry.setId)).resolves.toBe(2);
      await expect(sequences.reserveSequence(fixture.intent.entry.setId)).resolves.toBe(3);
    } finally {
      await fixture.close();
    }
  });

  it('stores content under its hash and refuses corruption or over-limit writes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codryn-r2-blobs-'));
    try {
      const store = new ContentBlobStore(directory, { maxBytes: 3 });
      const content = new TextEncoder().encode('abc');
      const hash = await store.put(content);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      await expect(store.get(hash)).resolves.toEqual(content);
      await writeFile(join(directory, 'change-blobs', hash), 'bad', 'utf8');
      await expect(store.get(hash)).rejects.toThrow('R2_BLOB_HASH_MISMATCH');
      await expect(store.put(new TextEncoder().encode('abcd')))
        .rejects.toThrow('R2_BLOB_RETENTION_LIMIT');
      expect(await readFile(join(directory, 'change-blobs', hash), 'utf8')).toBe('bad');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('stores one immutable baseline per change set', async () => {
    const fixture = await createChangeStoreFixture();
    try {
      const baseline = {
        mode: 'non-git' as const,
        reason: 'not_repository' as const
      };
      const store = new SqliteProjectBaselineStore(fixture.database);
      await store.saveOnce(fixture.intent.entry.setId, baseline);
      await store.saveOnce(fixture.intent.entry.setId, baseline);
      await expect(store.get(fixture.intent.entry.setId)).resolves.toEqual(baseline);
      await expect(store.saveOnce(fixture.intent.entry.setId, {
        mode: 'non-git', reason: 'git_unavailable'
      })).rejects.toThrow('R2_BASELINE_CONFLICT');
    } finally {
      await fixture.close();
    }
  });
});
