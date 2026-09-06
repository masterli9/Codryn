import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SqliteAgentRunStore } from '../src/persistence/sqlite-agent-run-store.js';
import { SqliteToolCallStore } from '../src/persistence/sqlite-tool-call-store.js';
import { SqliteVerificationStore } from '../src/persistence/sqlite-verification-store.js';
import { SqliteWorkspaceStore } from '../src/persistence/sqlite-workspace-store.js';
import { openR0Database } from '../src/persistence/open-database.js';
import { runMigrations } from '../src/persistence/run-migrations.js';

const timestamp = '2026-09-06T10:30:00.000Z';
const projectId = '61111111-1111-4111-8111-111111111111';
const runId = '62222222-2222-4222-8222-222222222222';
const callId = '63333333-3333-4333-8333-333333333333';
const requestId = '64444444-4444-4444-8444-444444444444';
const recordId = '65555555-5555-4555-8555-555555555555';

describe('SqliteVerificationStore', () => {
  it('preserves a historical result and derives stale from the current snapshot', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codryn-r2-verification-'));
    const database = openR0Database(join(directory, 'codryn.sqlite'));
    try {
      runMigrations(database, timestamp);
      await new SqliteAgentRunStore(database).createWithInitialEvent({
        runId, requestId, state: 'idle', task: 'verification fixture', maxSteps: 8, stepCount: 0,
        adapterId: 'fixture', modelId: 'fixture', createdAt: timestamp, updatedAt: timestamp
      }, { eventId: '66666666-6666-4666-8666-666666666666', eventType: 'agent_run.created', eventVersion: 1, correlationId: requestId, occurredAt: timestamp, source: 'core', sessionId: runId, payload: { state: 'idle' } });
      const workspace = new SqliteWorkspaceStore(database);
      await workspace.observe(projectId, { fingerprint: 'a'.repeat(64), gitIdentity: null, complete: true });
      await new SqliteToolCallStore(database).createWithInitialEvent({
        callId, runId, projectId, toolId: 'command.run', toolVersion: 1, state: 'received', arguments: { inputRecorded: false }, createdAt: timestamp, updatedAt: timestamp
      }, { eventId: '67777777-7777-4777-8777-777777777777', eventType: 'tool_call.received', eventVersion: 1, correlationId: requestId, occurredAt: timestamp, source: 'core', sessionId: runId, payload: { callId, toolId: 'command.run' } });
      const first = await workspace.current(projectId);
      const store = new SqliteVerificationStore(database);
      const command = { executable: 'node', args: [], cwd: 'E:\\fixture', timeoutMs: 30_000, maxOutputBytes: 1024 };
      await store.append({ id: recordId, runId, callId, projectId, kind: 'test', command, scope: 'project', revision: first.revision, fingerprint: first.fingerprint, occurredAt: timestamp, result: 'passed', stale: false, reason: 'pass', exitCode: 0 });
      await workspace.observe(projectId, { fingerprint: 'b'.repeat(64), gitIdentity: null, complete: true });
      await expect(store.current(runId, await workspace.current(projectId))).resolves.toMatchObject({ id: recordId, result: 'passed', stale: true });
    } finally {
      database.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
