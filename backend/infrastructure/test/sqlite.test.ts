import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SqliteAgentRunStore,
  SqliteDiagnostics,
  SqliteEventStore,
  SqliteSessionRepository,
  SqliteToolCallStore,
  migrations,
  openR0Database,
  runMigrations
} from '../src/index.js';

const firstTimestamp = '2026-08-17T08:00:00.000Z';
const secondTimestamp = '2026-08-17T08:00:01.000Z';
const thirdTimestamp = '2026-08-17T08:00:02.000Z';

const session = {
  id: '00000000-0000-4000-8000-000000000001',
  status: 'created' as const,
  createdAt: firstTimestamp,
  updatedAt: firstTimestamp
};

const initialEvent = {
  eventId: '00000000-0000-4000-8000-000000000002',
  eventType: 'diagnostics.started',
  eventVersion: 1 as const,
  correlationId: '00000000-0000-4000-8000-000000000003',
  occurredAt: firstTimestamp,
  source: 'core' as const,
  sessionId: session.id,
  payload: { requestId: '00000000-0000-4000-8000-000000000004' }
};

const temporaryDirectories: string[] = [];

function applyVersionOneSchema(database: DatabaseSync): void {
  const ledgerMigration = migrations[0];
  const diagnosticMigration = migrations[1];
  if (ledgerMigration === undefined || diagnosticMigration === undefined) {
    throw new Error('R0 migration fixture is incomplete.');
  }

  database.exec('BEGIN IMMEDIATE;');
  try {
    database.exec(ledgerMigration.sql);
    database.prepare(
      'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)'
    ).run(ledgerMigration.version, ledgerMigration.name, ledgerMigration.checksum, firstTimestamp);
    database.exec(diagnosticMigration.sql);
    database.prepare(
      'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)'
    ).run(diagnosticMigration.version, diagnosticMigration.name, diagnosticMigration.checksum, firstTimestamp);
    database.exec('COMMIT;');
  } catch (error) {
    if (database.isTransaction) database.exec('ROLLBACK;');
    throw error;
  }
}

const run = {
  runId: '10000000-0000-4000-8000-000000000001',
  requestId: '10000000-0000-4000-8000-000000000002',
  state: 'idle' as const,
  task: 'Inspect the referenced project files.',
  maxSteps: 8,
  stepCount: 0,
  adapterId: 'scripted-fake',
  modelId: 'r1-fixture',
  createdAt: firstTimestamp,
  updatedAt: firstTimestamp
};

const runInitialEvent = {
  eventId: '10000000-0000-4000-8000-000000000003',
  eventType: 'agent_run.created',
  eventVersion: 1 as const,
  correlationId: run.requestId,
  occurredAt: firstTimestamp,
  source: 'core' as const,
  sessionId: run.runId,
  payload: { state: 'idle' }
};

const toolCall = {
  callId: '20000000-0000-4000-8000-000000000001',
  runId: run.runId,
  toolId: 'read_file',
  toolVersion: 1,
  state: 'received' as const,
  arguments: { path: 'README.md' },
  createdAt: firstTimestamp,
  updatedAt: firstTimestamp
};

const toolCallInitialEvent = {
  eventId: '20000000-0000-4000-8000-000000000002',
  eventType: 'tool_call.received',
  eventVersion: 1 as const,
  correlationId: run.requestId,
  occurredAt: firstTimestamp,
  source: 'core' as const,
  sessionId: run.runId,
  payload: { callId: toolCall.callId, toolId: toolCall.toolId }
};

async function createDatabasePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'codryn-r0-sqlite-'));
  temporaryDirectories.push(directory);
  return join(directory, 'r0.sqlite');
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => {
    await rm(directory, { recursive: true, force: true });
  }));
});

describe('R1 SQLite persistence', () => {
  it('migrates a version-1 diagnostic session and event without changing their identity or payload', async () => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);

    try {
      applyVersionOneSchema(database);
      database.prepare(`INSERT INTO diagnostic_sessions (
        id, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?)`).run(session.id, session.status, session.createdAt, session.updatedAt);
      database.prepare(`INSERT INTO events (
        event_id, event_type, event_version, correlation_id, occurred_at, source, session_id, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        initialEvent.eventId,
        initialEvent.eventType,
        initialEvent.eventVersion,
        initialEvent.correlationId,
        initialEvent.occurredAt,
        initialEvent.source,
        initialEvent.sessionId,
        JSON.stringify(initialEvent.payload)
      );
      const eventBeforeMigration = database.prepare(`SELECT
        sequence, event_id, event_type, event_version, correlation_id,
        occurred_at, source, session_id, payload_json
        FROM events`).get();

      runMigrations(database, secondTimestamp);

      expect(database.prepare('SELECT id, kind FROM sessions').all()).toEqual([
        { id: session.id, kind: 'diagnostic' }
      ]);
      expect(database.prepare('SELECT id, created_at, updated_at FROM sessions').all()).toEqual([
        { id: session.id, created_at: session.createdAt, updated_at: session.updatedAt }
      ]);
      await expect(new SqliteSessionRepository(database).findById(session.id)).resolves.toEqual(session);
      await expect(new SqliteEventStore(database).findBySessionId(session.id)).resolves.toEqual([initialEvent]);
      expect(database.prepare(`SELECT
        sequence, event_id, event_type, event_version, correlation_id,
        occurred_at, source, session_id, payload_json
        FROM events`).get()).toEqual(eventBeforeMigration);
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);

      const migrationRows = database.prepare(
        'SELECT version, name, applied_at FROM schema_migrations ORDER BY version ASC'
      ).all();
      expect(migrationRows).toEqual([
        { version: 0, name: 'schema_migrations', applied_at: firstTimestamp },
        { version: 1, name: 'r0_diagnostic_data', applied_at: firstTimestamp },
        { version: 2, name: 'generic_agent_sessions', applied_at: secondTimestamp },
        { version: 3, name: 'tool_call_permission_audit', applied_at: secondTimestamp }
      ]);

      runMigrations(database, thirdTimestamp);

      expect(database.prepare(
        'SELECT version, name, applied_at FROM schema_migrations ORDER BY version ASC'
      ).all()).toEqual(migrationRows);
      expect(database.prepare('SELECT COUNT(*) AS count FROM sessions').get()).toEqual({ count: 1 });
      expect(database.prepare('SELECT COUNT(*) AS count FROM events').get()).toEqual({ count: 1 });
    } finally {
      database.close();
    }
  });

  it('atomically creates and transitions an agent run while rolling back failed event writes', async () => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);

    try {
      runMigrations(database, firstTimestamp);
      const runs = new SqliteAgentRunStore(database);
      const events = new SqliteEventStore(database);
      await runs.createWithInitialEvent(run, runInitialEvent);

      await expect(runs.findById(run.runId)).resolves.toEqual(run);

      const preparingEvent = {
        ...runInitialEvent,
        eventId: '10000000-0000-4000-8000-000000000004',
        eventType: 'agent_run.preparing_context',
        occurredAt: secondTimestamp,
        payload: { from: 'idle', to: 'preparing_context' }
      };
      await runs.transitionWithEvent({
        runId: run.runId,
        from: 'idle',
        to: 'preparing_context',
        stepCount: 1,
        updatedAt: secondTimestamp,
        event: preparingEvent
      });
      const preparedRun = { ...run, state: 'preparing_context' as const, stepCount: 1, updatedAt: secondTimestamp };
      await expect(runs.findById(run.runId)).resolves.toEqual(preparedRun);

      await expect(runs.transitionWithEvent({
        runId: run.runId,
        from: 'preparing_context',
        to: 'waiting_for_model',
        stepCount: 2,
        updatedAt: thirdTimestamp,
        event: { ...preparingEvent, eventType: 'agent_run.waiting_for_model', occurredAt: thirdTimestamp }
      })).rejects.toMatchObject({ code: 'R1_PERSISTENCE_FAILED' });

      await expect(runs.findById(run.runId)).resolves.toEqual(preparedRun);
      await expect(events.findBySessionId(run.runId)).resolves.toEqual([runInitialEvent, preparingEvent]);

      const mismatchedFromEvent = {
        ...preparingEvent,
        eventId: '10000000-0000-4000-8000-000000000005',
        eventType: 'agent_run.waiting_for_model',
        occurredAt: thirdTimestamp
      };
      await expect(runs.transitionWithEvent({
        runId: run.runId,
        from: 'idle',
        to: 'preparing_context',
        stepCount: 2,
        updatedAt: thirdTimestamp,
        event: mismatchedFromEvent
      })).rejects.toMatchObject({ code: 'R1_PERSISTENCE_FAILED' });
      await expect(events.findBySessionId(run.runId)).resolves.toEqual([runInitialEvent, preparingEvent]);

      const secondRun = {
        ...run,
        runId: '10000000-0000-4000-8000-000000000006',
        requestId: '10000000-0000-4000-8000-000000000007'
      };
      await expect(runs.createWithInitialEvent(secondRun, {
        ...runInitialEvent,
        sessionId: secondRun.runId,
        correlationId: secondRun.requestId
      })).rejects.toMatchObject({ code: 'R1_PERSISTENCE_FAILED' });
      await expect(runs.findById(secondRun.runId)).resolves.toBeNull();
      expect(database.prepare('SELECT id FROM sessions WHERE id = ?').get(secondRun.runId)).toBeUndefined();
    } finally {
      database.close();
    }
  });

  it('does not roll back a caller-owned transaction when an agent run store cannot begin', async () => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);

    try {
      runMigrations(database, firstTimestamp);
      database.exec('BEGIN IMMEDIATE;');

      await expect(new SqliteAgentRunStore(database).createWithInitialEvent(run, runInitialEvent))
        .rejects.toMatchObject({ code: 'R1_PERSISTENCE_FAILED' });
      expect(database.isTransaction).toBe(true);
    } finally {
      if (database.isTransaction) database.exec('ROLLBACK;');
      database.close();
    }
  });

  it('rejects an invalid persisted agent run row through a stable persistence failure', async () => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);

    try {
      runMigrations(database, firstTimestamp);
      const runs = new SqliteAgentRunStore(database);
      await runs.createWithInitialEvent(run, runInitialEvent);
      database.prepare('UPDATE agent_runs SET request_id = ? WHERE run_id = ?').run('not-a-uuid', run.runId);

      await expect(runs.findById(run.runId)).rejects.toMatchObject({ code: 'R1_PERSISTENCE_FAILED' });
    } finally {
      database.close();
    }
  });

  it('atomically creates and transitions a tool call while preserving SQL NULL versus JSON null', async () => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);

    try {
      runMigrations(database, firstTimestamp);
      await new SqliteAgentRunStore(database).createWithInitialEvent(run, runInitialEvent);
      const calls = new SqliteToolCallStore(database);
      const events = new SqliteEventStore(database);

      await calls.createWithInitialEvent(toolCall, toolCallInitialEvent);
      expect(database.prepare(`SELECT
        call_id, run_id, parent_call_id, tool_id, tool_version, state, arguments_json,
        permission_result, safe_result_json, error_code, created_at, updated_at
        FROM tool_calls WHERE call_id = ?`).get(toolCall.callId)).toEqual({
        call_id: toolCall.callId,
        run_id: toolCall.runId,
        parent_call_id: null,
        tool_id: toolCall.toolId,
        tool_version: toolCall.toolVersion,
        state: 'received',
        arguments_json: JSON.stringify(toolCall.arguments),
        permission_result: null,
        safe_result_json: null,
        error_code: null,
        created_at: toolCall.createdAt,
        updated_at: toolCall.updatedAt
      });

      const validatedEvent = {
        ...toolCallInitialEvent,
        eventId: '20000000-0000-4000-8000-000000000003',
        eventType: 'tool_call.schema_validated',
        occurredAt: secondTimestamp,
        payload: { from: 'received', to: 'schema_validated' }
      };
      await calls.transitionWithEvent({
        callId: toolCall.callId,
        from: 'received',
        to: 'schema_validated',
        safeResult: null,
        updatedAt: secondTimestamp,
        event: validatedEvent
      });
      expect(database.prepare(
        `SELECT state, permission_result, safe_result_json, error_code, updated_at
        FROM tool_calls WHERE call_id = ?`
      ).get(toolCall.callId)).toEqual({
        state: 'schema_validated',
        permission_result: null,
        safe_result_json: 'null',
        error_code: null,
        updated_at: secondTimestamp
      });

      await expect(calls.transitionWithEvent({
        callId: toolCall.callId,
        from: 'schema_validated',
        to: 'permission_decided',
        permissionResult: 'allowed_by_rule',
        updatedAt: thirdTimestamp,
        event: { ...validatedEvent, eventType: 'tool_call.permission_decided', occurredAt: thirdTimestamp }
      })).rejects.toMatchObject({ code: 'R1_PERSISTENCE_FAILED' });
      expect(database.prepare(
        `SELECT state, permission_result, safe_result_json, error_code, updated_at
        FROM tool_calls WHERE call_id = ?`
      ).get(toolCall.callId)).toEqual({
        state: 'schema_validated',
        permission_result: null,
        safe_result_json: 'null',
        error_code: null,
        updated_at: secondTimestamp
      });
      await expect(events.findBySessionId(run.runId)).resolves.toEqual([
        runInitialEvent,
        toolCallInitialEvent,
        validatedEvent
      ]);

      const mismatchedFromEvent = {
        ...validatedEvent,
        eventId: '20000000-0000-4000-8000-000000000004',
        eventType: 'tool_call.permission_decided',
        occurredAt: thirdTimestamp
      };
      await expect(calls.transitionWithEvent({
        callId: toolCall.callId,
        from: 'received',
        to: 'schema_validated',
        permissionResult: 'allowed_by_rule',
        updatedAt: thirdTimestamp,
        event: mismatchedFromEvent
      })).rejects.toMatchObject({ code: 'R1_PERSISTENCE_FAILED' });
      await expect(events.findBySessionId(run.runId)).resolves.toHaveLength(3);

      const childCall = {
        ...toolCall,
        callId: '20000000-0000-4000-8000-000000000005',
        parentCallId: toolCall.callId
      };
      const childEvent = {
        ...toolCallInitialEvent,
        eventId: '20000000-0000-4000-8000-000000000006',
        occurredAt: thirdTimestamp,
        payload: { callId: childCall.callId, toolId: childCall.toolId }
      };
      await calls.createWithInitialEvent(childCall, childEvent);
      expect(database.prepare(
        'SELECT parent_call_id, tool_id, tool_version, arguments_json FROM tool_calls WHERE call_id = ?'
      ).get(childCall.callId)).toEqual({
        parent_call_id: toolCall.callId,
        tool_id: childCall.toolId,
        tool_version: childCall.toolVersion,
        arguments_json: JSON.stringify(childCall.arguments)
      });

      const failedCall = {
        ...childCall,
        callId: '20000000-0000-4000-8000-000000000007'
      };
      await expect(calls.createWithInitialEvent(failedCall, {
        ...toolCallInitialEvent,
        payload: { callId: failedCall.callId, toolId: failedCall.toolId }
      })).rejects.toMatchObject({ code: 'R1_PERSISTENCE_FAILED' });
      expect(database.prepare('SELECT call_id FROM tool_calls WHERE call_id = ?').get(failedCall.callId)).toBeUndefined();
    } finally {
      database.close();
    }
  });

  it('persists permission rule and reason in the tool projection and audit event', async () => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);

    try {
      runMigrations(database, firstTimestamp);
      await new SqliteAgentRunStore(database).createWithInitialEvent(run, runInitialEvent);
      const calls = new SqliteToolCallStore(database);
      const events = new SqliteEventStore(database);
      await calls.createWithInitialEvent(toolCall, toolCallInitialEvent);

      await calls.transitionWithEvent({
        callId: toolCall.callId,
        from: 'received',
        to: 'schema_validated',
        updatedAt: secondTimestamp,
        event: {
          ...toolCallInitialEvent,
          eventId: '20000000-0000-4000-8000-000000000003',
          eventType: 'tool_call.schema_validated',
          occurredAt: secondTimestamp,
          payload: { from: 'received', to: 'schema_validated' }
        }
      });
      await calls.transitionWithEvent({
        callId: toolCall.callId,
        from: 'schema_validated',
        to: 'permission_decided',
        permissionResult: 'allowed_by_rule',
        permissionRuleId: 'R1_SAFE_READ_WITHIN_PROJECT',
        permissionReason: 'Validated read-only path is within the open project.',
        updatedAt: thirdTimestamp,
        event: {
          ...toolCallInitialEvent,
          eventId: '20000000-0000-4000-8000-000000000004',
          eventType: 'tool_call.permission_decided',
          occurredAt: thirdTimestamp,
          payload: {
            from: 'schema_validated',
            to: 'permission_decided',
            permissionResult: 'allowed_by_rule',
            permissionRuleId: 'R1_SAFE_READ_WITHIN_PROJECT',
            permissionReason: 'Validated read-only path is within the open project.'
          }
        }
      });

      expect(database.prepare(`SELECT permission_result, permission_rule_id, permission_reason
        FROM tool_calls WHERE call_id = ?`).get(toolCall.callId)).toEqual({
        permission_result: 'allowed_by_rule',
        permission_rule_id: 'R1_SAFE_READ_WITHIN_PROJECT',
        permission_reason: 'Validated read-only path is within the open project.'
      });
      await expect(events.findBySessionId(run.runId)).resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({
          eventType: 'tool_call.permission_decided',
          payload: expect.objectContaining({
            permissionRuleId: 'R1_SAFE_READ_WITHIN_PROJECT',
            permissionReason: 'Validated read-only path is within the open project.'
          })
        })
      ]));
    } finally {
      database.close();
    }
  });

  it('does not roll back a caller-owned transaction when a tool call store cannot begin', async () => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);

    try {
      runMigrations(database, firstTimestamp);
      await new SqliteAgentRunStore(database).createWithInitialEvent(run, runInitialEvent);
      database.exec('BEGIN IMMEDIATE;');

      await expect(new SqliteToolCallStore(database).createWithInitialEvent(toolCall, toolCallInitialEvent))
        .rejects.toMatchObject({ code: 'R1_PERSISTENCE_FAILED' });
      expect(database.isTransaction).toBe(true);
    } finally {
      if (database.isTransaction) database.exec('ROLLBACK;');
      database.close();
    }
  });

  it('rejects tool arguments with a hidden toJSON before persisting the call or event', async () => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);

    try {
      runMigrations(database, firstTimestamp);
      await new SqliteAgentRunStore(database).createWithInitialEvent(run, runInitialEvent);
      const argumentsWithHiddenToJson = { path: 'README.md' };
      Object.defineProperty(argumentsWithHiddenToJson, 'toJSON', {
        enumerable: false,
        value: () => ({ unexpected: 'serialized instead of validated arguments' })
      });

      await expect(new SqliteToolCallStore(database).createWithInitialEvent(
        { ...toolCall, arguments: argumentsWithHiddenToJson },
        toolCallInitialEvent
      )).rejects.toMatchObject({ code: 'R1_PERSISTENCE_FAILED' });

      expect(database.prepare('SELECT COUNT(*) AS count FROM tool_calls').get()).toEqual({ count: 0 });
      await expect(new SqliteEventStore(database).findBySessionId(run.runId)).resolves.toEqual([runInitialEvent]);
    } finally {
      database.close();
    }
  });

  it('rejects an accessor-backed safe result without changing the call projection or event log', async () => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);

    try {
      runMigrations(database, firstTimestamp);
      await new SqliteAgentRunStore(database).createWithInitialEvent(run, runInitialEvent);
      const calls = new SqliteToolCallStore(database);
      await calls.createWithInitialEvent(toolCall, toolCallInitialEvent);
      let reads = 0;
      const changingSafeResult: Array<string | { unexpected: boolean }> = ['validated'];
      Object.defineProperty(changingSafeResult, '0', {
        enumerable: true,
        configurable: true,
        get: () => {
          reads += 1;
          return reads === 1 ? 'validated' : { unexpected: true };
        }
      });
      const transitionEvent = {
        ...toolCallInitialEvent,
        eventId: '50000000-0000-4000-8000-000000000001',
        eventType: 'tool_call.schema_validated',
        occurredAt: secondTimestamp,
        payload: { from: 'received', to: 'schema_validated' }
      };

      await expect(calls.transitionWithEvent({
        callId: toolCall.callId,
        from: 'received',
        to: 'schema_validated',
        safeResult: changingSafeResult,
        updatedAt: secondTimestamp,
        event: transitionEvent
      })).rejects.toMatchObject({ code: 'R1_PERSISTENCE_FAILED' });

      expect(database.prepare(
        'SELECT state, safe_result_json, updated_at FROM tool_calls WHERE call_id = ?'
      ).get(toolCall.callId)).toEqual({
        state: 'received',
        safe_result_json: null,
        updated_at: firstTimestamp
      });
      await expect(new SqliteEventStore(database).findBySessionId(run.runId)).resolves.toEqual([
        runInitialEvent,
        toolCallInitialEvent
      ]);
    } finally {
      database.close();
    }
  });

  it('rolls back a tool call whose parent belongs to another agent run', async () => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);

    try {
      runMigrations(database, firstTimestamp);
      const runs = new SqliteAgentRunStore(database);
      const calls = new SqliteToolCallStore(database);
      const events = new SqliteEventStore(database);
      await runs.createWithInitialEvent(run, runInitialEvent);
      await calls.createWithInitialEvent(toolCall, toolCallInitialEvent);
      const secondRun = {
        ...run,
        runId: '60000000-0000-4000-8000-000000000001',
        requestId: '60000000-0000-4000-8000-000000000002'
      };
      const secondRunEvent = {
        ...runInitialEvent,
        eventId: '60000000-0000-4000-8000-000000000003',
        correlationId: secondRun.requestId,
        sessionId: secondRun.runId
      };
      await runs.createWithInitialEvent(secondRun, secondRunEvent);
      const crossRunCall = {
        ...toolCall,
        callId: '60000000-0000-4000-8000-000000000004',
        runId: secondRun.runId,
        parentCallId: toolCall.callId
      };
      const crossRunEvent = {
        ...toolCallInitialEvent,
        eventId: '60000000-0000-4000-8000-000000000005',
        correlationId: secondRun.requestId,
        sessionId: secondRun.runId,
        payload: { callId: crossRunCall.callId, toolId: crossRunCall.toolId }
      };

      await expect(calls.createWithInitialEvent(crossRunCall, crossRunEvent))
        .rejects.toMatchObject({ code: 'R1_PERSISTENCE_FAILED' });

      expect(database.prepare('SELECT call_id FROM tool_calls WHERE call_id = ?')
        .get(crossRunCall.callId)).toBeUndefined();
      await expect(events.findBySessionId(secondRun.runId)).resolves.toEqual([secondRunEvent]);
    } finally {
      database.close();
    }
  });

  it('rejects a self-parented tool call before persisting its projection or event', async () => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);

    try {
      runMigrations(database, firstTimestamp);
      await new SqliteAgentRunStore(database).createWithInitialEvent(run, runInitialEvent);
      const selfParentedCall = {
        ...toolCall,
        callId: '70000000-0000-4000-8000-000000000001',
        parentCallId: '70000000-0000-4000-8000-000000000001'
      };
      const selfParentedEvent = {
        ...toolCallInitialEvent,
        eventId: '70000000-0000-4000-8000-000000000002',
        payload: { callId: selfParentedCall.callId, toolId: selfParentedCall.toolId }
      };

      await expect(new SqliteToolCallStore(database).createWithInitialEvent(
        selfParentedCall,
        selfParentedEvent
      )).rejects.toMatchObject({ code: 'R1_PERSISTENCE_FAILED' });

      expect(database.prepare('SELECT call_id FROM tool_calls WHERE call_id = ?')
        .get(selfParentedCall.callId)).toBeUndefined();
      await expect(new SqliteEventStore(database).findBySessionId(run.runId)).resolves.toEqual([runInitialEvent]);
    } finally {
      database.close();
    }
  });
});

describe('R0 SQLite persistence', () => {
  it('maps database construction failures to a stable open failure', async () => {
    const filename = await createDatabasePath();
    const blockingFile = join(filename, '..', 'not-a-directory');
    await writeFile(blockingFile, 'block database parent directory');

    expect(() => openR0Database(join(blockingFile, 'r0.sqlite'))).toThrowError(
      expect.objectContaining({ code: 'R0_DB_OPEN_FAILED', message: 'DATABASE_OPEN_FAILED' })
    );
  });

  it('enables WAL, foreign keys, defensive mode and disables extensions', async () => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);

    try {
      runMigrations(database, firstTimestamp);
      const evidence = await new SqliteDiagnostics(database, filename).inspect();

      expect(evidence).toEqual({
        journalMode: 'wal',
        foreignKeysEnabled: true,
        defensiveModeEnabled: true,
        extensionsEnabled: false,
        quickCheck: 'ok',
        migrationVersions: [0, 1, 2, 3]
      });
    } finally {
      database.close();
    }
  });

  it.each([
    ['busy timeout', 'PRAGMA busy_timeout = 0;', 'PRAGMA busy_timeout', { timeout: 0 }],
    ['synchronous mode', 'PRAGMA synchronous = FULL;', 'PRAGMA synchronous', { synchronous: 2 }]
  ])('rejects drifted %s without changing public evidence', async (_label, driftSql, readSql, driftedRow) => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);

    try {
      runMigrations(database, firstTimestamp);
      database.exec(driftSql);
      expect(database.prepare(readSql).get()).toEqual(driftedRow);

      await expect(new SqliteDiagnostics(database, filename).inspect()).rejects.toMatchObject({
        code: 'R0_DB_OPEN_FAILED',
        message: 'DATABASE_SAFETY_BASELINE_MISMATCH'
      });
    } finally {
      database.close();
    }
  });

  it('restores writable_schema after detecting disabled defensive mode', async () => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);

    try {
      runMigrations(database, firstTimestamp);
      database.enableDefensive(false);

      await expect(new SqliteDiagnostics(database, filename).inspect()).rejects.toMatchObject({
        code: 'R0_DB_OPEN_FAILED',
        message: 'DATABASE_SAFETY_BASELINE_MISMATCH'
      });
      expect(database.prepare('PRAGMA writable_schema').get()).toEqual({ writable_schema: 0 });
    } finally {
      database.exec('PRAGMA writable_schema = OFF;');
      database.close();
    }
  });

  it('applies migrations exactly once after reopen', async () => {
    const filename = await createDatabasePath();
    const firstConnection = openR0Database(filename);
    try {
      runMigrations(firstConnection, firstTimestamp);
      await new SqliteSessionRepository(firstConnection).createWithInitialEvent(session, initialEvent);
    } finally {
      firstConnection.close();
    }

    const secondConnection = openR0Database(filename);
    try {
      runMigrations(secondConnection, secondTimestamp);
      const rows = secondConnection.prepare(
        'SELECT version, name, applied_at FROM schema_migrations ORDER BY version ASC'
      ).all();

      expect(rows).toEqual([
        { version: 0, name: 'schema_migrations', applied_at: firstTimestamp },
        { version: 1, name: 'r0_diagnostic_data', applied_at: firstTimestamp },
        { version: 2, name: 'generic_agent_sessions', applied_at: firstTimestamp },
        { version: 3, name: 'tool_call_permission_audit', applied_at: firstTimestamp }
      ]);
      expect(secondConnection.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
      await expect(new SqliteSessionRepository(secondConnection).findById(session.id)).resolves.toEqual(session);
      await expect(new SqliteEventStore(secondConnection).findBySessionId(session.id)).resolves.toEqual([initialEvent]);
    } finally {
      secondConnection.close();
    }
  });

  it('fails hard when a stored migration checksum differs', async () => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);

    try {
      runMigrations(database, firstTimestamp);
      database.prepare('UPDATE schema_migrations SET checksum = ? WHERE version = 1').run('tampered');

      expect(() => runMigrations(database, secondTimestamp)).toThrowError(
        expect.objectContaining({
          code: 'R0_DB_MIGRATION_FAILED',
          message: 'MIGRATION_CHECKSUM_MISMATCH'
        })
      );
      expect(database.isTransaction).toBe(false);
      expect(database.prepare(
        'SELECT version, checksum, applied_at FROM schema_migrations ORDER BY version ASC'
      ).all()).toEqual([
        expect.objectContaining({ version: 0, applied_at: firstTimestamp }),
        { version: 1, checksum: 'tampered', applied_at: firstTimestamp },
        expect.objectContaining({ version: 2, applied_at: firstTimestamp }),
        expect.objectContaining({ version: 3, applied_at: firstTimestamp })
      ]);
    } finally {
      database.close();
    }
  });

  it.each([
    ['name', 'tampered-name', undefined],
    ['checksum', undefined, 'tampered-checksum']
  ])('rejects a migration %s mismatch before applying a missing later migration', async (_label, name, checksum) => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);
    const ledger = migrations[0];
    if (ledger === undefined) throw new Error('Migration 0 fixture is missing.');

    try {
      database.exec(ledger.sql);
      database.prepare(
        'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)'
      ).run(ledger.version, name ?? ledger.name, checksum ?? ledger.checksum, firstTimestamp);
      const createdTables: string[] = [];
      database.setAuthorizer((_actionCode, firstArgument) => {
        if (firstArgument === 'diagnostic_sessions') createdTables.push(firstArgument);
        return 0;
      });

      try {
        expect(() => runMigrations(database, secondTimestamp)).toThrowError(
          expect.objectContaining({
            code: 'R0_DB_MIGRATION_FAILED',
            message: 'MIGRATION_CHECKSUM_MISMATCH'
          })
        );
      } finally {
        database.setAuthorizer(null);
      }

      expect(createdTables).toEqual([]);
      expect(database.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'diagnostic_sessions'"
      ).get()).toBeUndefined();
    } finally {
      database.close();
    }
  });

  it('maps migration transaction-entry failure without rolling back the caller transaction', async () => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);

    try {
      runMigrations(database, firstTimestamp);
      database.exec('BEGIN IMMEDIATE;');

      expect(() => runMigrations(database, secondTimestamp)).toThrowError(
        expect.objectContaining({
          code: 'R0_DB_MIGRATION_FAILED',
          message: 'MIGRATION_APPLY_FAILED'
        })
      );
      expect(database.isTransaction).toBe(true);
    } finally {
      if (database.isTransaction) database.exec('ROLLBACK;');
      database.close();
    }
  });

  it('atomically creates a diagnostic session with its initial event', async () => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);

    try {
      runMigrations(database, firstTimestamp);
      const sessions = new SqliteSessionRepository(database);
      const events = new SqliteEventStore(database);

      await sessions.createWithInitialEvent(session, initialEvent);

      await expect(sessions.findById(session.id)).resolves.toEqual(session);
      await expect(events.findBySessionId(session.id)).resolves.toEqual([initialEvent]);
    } finally {
      database.close();
    }
  });

  it('maps session transaction-entry failure without rolling back the caller transaction', async () => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);

    try {
      runMigrations(database, firstTimestamp);
      database.exec('BEGIN IMMEDIATE;');

      await expect(new SqliteSessionRepository(database).createWithInitialEvent(session, initialEvent)).rejects.toMatchObject({
        code: 'R0_DB_OPEN_FAILED',
        message: 'SESSION_EVENT_WRITE_FAILED'
      });
      expect(database.isTransaction).toBe(true);
    } finally {
      if (database.isTransaction) database.exec('ROLLBACK;');
      database.close();
    }
  });

  it('rolls back a new session when its valid initial event violates a database constraint', async () => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);

    try {
      runMigrations(database, firstTimestamp);
      const sessions = new SqliteSessionRepository(database);
      const events = new SqliteEventStore(database);
      const secondSession = {
        id: '00000000-0000-4000-8000-000000000006',
        status: 'created' as const,
        createdAt: secondTimestamp,
        updatedAt: secondTimestamp
      };
      const duplicateIdentityEvent = {
        ...initialEvent,
        sessionId: secondSession.id,
        occurredAt: secondTimestamp
      };

      await sessions.createWithInitialEvent(session, initialEvent);
      await expect(sessions.createWithInitialEvent(secondSession, duplicateIdentityEvent)).rejects.toThrow();

      await expect(sessions.findById(secondSession.id)).resolves.toBeNull();
      await expect(events.findBySessionId(secondSession.id)).resolves.toEqual([]);
      await expect(events.findBySessionId(session.id)).resolves.toEqual([initialEvent]);
    } finally {
      database.close();
    }
  });

  it('round-trips a strict v1 JSON event', async () => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);

    try {
      runMigrations(database, firstTimestamp);
      const sessions = new SqliteSessionRepository(database);
      const events = new SqliteEventStore(database);
      const event = {
        eventId: '00000000-0000-4000-8000-000000000005',
        eventType: 'database.roundtrip',
        eventVersion: 1 as const,
        correlationId: initialEvent.correlationId,
        occurredAt: secondTimestamp,
        source: 'database' as const,
        sessionId: session.id,
        payload: {
          passed: true,
          count: 2,
          nullable: null,
          nested: ['one', { two: 2 }]
        }
      };

      await sessions.createWithInitialEvent(session, initialEvent);
      await events.append(event);

      await expect(events.findBySessionId(session.id)).resolves.toEqual([initialEvent, event]);
    } finally {
      database.close();
    }
  });

  it.each([
    ['envelope', 'UPDATE events SET event_type = ?', ''],
    ['payload', 'UPDATE events SET payload_json = ?', '{"value":1e400}']
  ])('rejects an invalid persisted %s during event reconstruction', async (_label, updateSql, invalidValue) => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);

    try {
      runMigrations(database, firstTimestamp);
      await new SqliteSessionRepository(database).createWithInitialEvent(session, initialEvent);
      database.prepare(updateSql).run(invalidValue);

      await expect(new SqliteEventStore(database).findBySessionId(session.id)).rejects.toMatchObject({
        code: 'R0_DB_OPEN_FAILED',
        message: 'EVENT_READ_FAILED'
      });
    } finally {
      database.close();
    }
  });

  it.each([
    ['undefined', { value: undefined }],
    ['BigInt', { value: 1n }],
    ['function', { value: () => 'not JSON' }],
    ['raw Error', new Error('not JSON')]
  ])('rejects %s event payloads before persistence', async (_label, payload) => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);

    try {
      runMigrations(database, firstTimestamp);
      const events = new SqliteEventStore(database);
      const event = {
        eventId: initialEvent.eventId,
        eventType: initialEvent.eventType,
        eventVersion: initialEvent.eventVersion,
        correlationId: initialEvent.correlationId,
        occurredAt: initialEvent.occurredAt,
        source: initialEvent.source,
        payload
      };

      await expect(events.append(event as never)).rejects.toThrow();
      expect(database.prepare('SELECT COUNT(*) AS count FROM events').get()).toEqual({ count: 0 });
    } finally {
      database.close();
    }
  });

  it('backs up, opens and integrity-checks the copied database', async () => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);

    try {
      runMigrations(database, firstTimestamp);
      await new SqliteSessionRepository(database).createWithInitialEvent(session, initialEvent);

      vi.spyOn(Date, 'now').mockReturnValue(1_786_971_192_243);
      const evidence = await new SqliteDiagnostics(database, filename).backupAndVerify(session.id);
      const secondEvidence = await new SqliteDiagnostics(database, filename).backupAndVerify(session.id);

      expect(evidence).toEqual({ integrityCheck: 'ok', sessionFound: true, eventFound: true });
      expect(secondEvidence).toEqual(evidence);
      expect(database.isOpen).toBe(true);
      const backupFiles = await readdir(join(filename, '..', 'backups'));
      expect(backupFiles.filter((entry) => entry.endsWith('.sqlite')).sort()).toEqual([
        'r0-1786971192243.sqlite',
        'r0-1786971192244.sqlite'
      ]);
    } finally {
      database.close();
    }
  });

  it('never overwrites a pre-existing backup candidate after restart', async () => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);
    const backupDirectory = join(filename, '..', 'backups');
    const existingBackup = join(backupDirectory, 'r0-1786971192243.sqlite');

    try {
      runMigrations(database, firstTimestamp);
      await new SqliteSessionRepository(database).createWithInitialEvent(session, initialEvent);
      await mkdir(backupDirectory, { recursive: true });
      await writeFile(existingBackup, 'must-not-be-overwritten');
      vi.spyOn(Date, 'now').mockReturnValue(1_786_971_192_243);

      await expect(new SqliteDiagnostics(database, filename).backupAndVerify(session.id)).resolves.toEqual({
        integrityCheck: 'ok',
        sessionFound: true,
        eventFound: true
      });
      await expect(readFile(existingBackup, 'utf8')).resolves.toBe('must-not-be-overwritten');
      const backupFiles = await readdir(backupDirectory);
      expect(backupFiles.filter((entry) => entry.endsWith('.sqlite')).sort()).toEqual([
        'r0-1786971192243.sqlite',
        'r0-1786971192244.sqlite'
      ]);
    } finally {
      database.close();
    }
  });

  it('maps backup directory failures to a stable backup failure', async () => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);

    try {
      runMigrations(database, firstTimestamp);
      await writeFile(join(filename, '..', 'backups'), 'block backup directory');

      await expect(new SqliteDiagnostics(database, filename).backupAndVerify(session.id)).rejects.toMatchObject({
        code: 'R0_DB_BACKUP_FAILED',
        message: 'BACKUP_VERIFICATION_FAILED'
      });
    } finally {
      database.close();
    }
  });
});
