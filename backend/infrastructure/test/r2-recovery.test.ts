import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RecoverMutations, RecoverR2Run, type WriteIntent } from '@codryn/core';
import { openR0Database, runMigrations, SqliteAgentRunStore, SqliteMutationJournal, SqliteChangeSetStore, SqliteToolCallStore, SqliteWorkspaceStore, UuidGenerator } from '../src/index.js';

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

describe('R2 recovery composition', () => {
  it('reopens the durable journal and confirms an already-published intent without replaying a model', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codryn-r2-recovery-'));
    const databasePath = join(directory, 'codryn.sqlite');
    const projectId = randomUUID();
    const runId = randomUUID();
    const callId = randomUUID();
    const commandCallId = randomUUID();
    const requestId = randomUUID();
    const beforeHash = hash('before');
    const afterHash = hash('after');
    const ids = new UuidGenerator();
    let database = openR0Database(databasePath);
    try {
      runMigrations(database, '2026-09-06T10:00:00.000Z');
      const workspaces = new SqliteWorkspaceStore(database);
      await workspaces.observe(projectId, { fingerprint: hash('workspace'), gitIdentity: null, complete: true });
      const agentRuns = new SqliteAgentRunStore(database);
      await agentRuns.createWithInitialEvent({ runId, requestId, state: 'idle', task: 'recovery fixture', maxSteps: 8, stepCount: 0, adapterId: 'test', modelId: 'test', createdAt: '2026-09-06T10:00:00.000Z', updatedAt: '2026-09-06T10:00:00.000Z' }, { eventId: randomUUID(), eventType: 'agent_run.created', eventVersion: 1, correlationId: requestId, occurredAt: '2026-09-06T10:00:00.000Z', source: 'core', sessionId: runId, payload: { runId, maxSteps: 8 } });
      const changeSets = new SqliteChangeSetStore(database, { now: () => '2026-09-06T10:00:00.000Z' }, ids);
      const setId = await changeSets.open(projectId, runId);
      const toolCalls = new SqliteToolCallStore(database);
      await toolCalls.createWithInitialEvent({ callId, runId, projectId, toolId: 'file.patch', toolVersion: 1, state: 'running', arguments: {}, createdAt: '2026-09-06T10:00:00.000Z', updatedAt: '2026-09-06T10:00:00.000Z' }, { eventId: randomUUID(), eventType: 'tool_call.started', eventVersion: 1, correlationId: requestId, occurredAt: '2026-09-06T10:00:00.000Z', source: 'core', sessionId: runId, payload: { callId, toolId: 'file.patch', toolVersion: 1 } });
      await toolCalls.createWithInitialEvent({
        callId: commandCallId,
        runId,
        projectId,
        toolId: 'command.run',
        toolVersion: 1,
        state: 'running',
        arguments: {},
        createdAt: '2026-09-06T10:00:00.000Z',
        updatedAt: '2026-09-06T10:00:00.000Z'
      }, { eventId: randomUUID(), eventType: 'tool_call.started', eventVersion: 1, correlationId: requestId, occurredAt: '2026-09-06T10:00:00.000Z', source: 'core', sessionId: runId, payload: { callId: commandCallId, toolId: 'command.run', toolVersion: 1 } });
      const journal = new SqliteMutationJournal(database, { now: () => '2026-09-06T10:00:00.000Z' }, ids);
      const intent: WriteIntent = { operationId: randomUUID(), state: 'prepared', entry: { id: randomUUID(), setId, projectId, runId, callId, sequence: 1, path: 'sum.mjs', beforeHash, afterHash, beforeBlob: beforeHash, afterBlob: afterHash, kind: 'patch', reversesId: null } };
      await journal.prepare(intent);
    } finally {
      database.close();
    }

    try {
      database = openR0Database(databasePath);
      runMigrations(database, '2026-09-06T10:00:01.000Z');
      const journal = new SqliteMutationJournal(database, { now: () => '2026-09-06T10:00:01.000Z' }, ids);
      const recover = new RecoverR2Run({
        mutations: new RecoverMutations({ journal, files: { readHash: async () => afterHash } }),
        toolCalls: new SqliteToolCallStore(database, { clock: { now: () => '2026-09-06T10:00:01.000Z' }, ids })
      });
      await expect(recover.execute(projectId, new AbortController().signal)).resolves.toMatchObject({ recoveredToolCalls: 1 });
      expect(await journal.pending(projectId)).toHaveLength(0);
      expect(database.prepare('SELECT state, error_code FROM tool_calls WHERE tool_id = ?').get('command.run'))
        .toEqual({ state: 'failed', error_code: 'R2_RECOVERY_UNKNOWN_EFFECT' });
      expect(database.prepare('SELECT safe_result_json FROM tool_calls WHERE call_id = ?').get(commandCallId))
        .toEqual({ safe_result_json: JSON.stringify({ ok: false, code: 'R2_RECOVERY_UNKNOWN_EFFECT' }) });
    } finally {
      database.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
