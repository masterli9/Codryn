import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PermissionService } from '@codryn/core';
import {
  SqliteAgentRunStore,
  SqlitePermissionStore,
  SqliteToolCallStore,
  SqliteWorkspaceStore,
  UuidGenerator,
  openR0Database,
  runMigrations
} from '../src/index.js';

const timestamp = '2026-09-06T12:00:00.000Z';
const projectId = '40000000-0000-4000-8000-000000000301';
const runId = '40000000-0000-4000-8000-000000000302';
const requestId = '40000000-0000-4000-8000-000000000303';
const callId = '40000000-0000-4000-8000-000000000304';

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

describe('R2 SQLite permission persistence', () => {
  it('persists an audited approval and consumes its claim exactly once', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codryn-r2-permission-'));
    const database = openR0Database(join(directory, 'codryn.sqlite'));
    try {
      runMigrations(database, timestamp);
      const eventIds = new UuidGenerator();
      await new SqliteAgentRunStore(database).createWithInitialEvent({
        runId: runId as `${string}-${string}-${string}-${string}-${string}`,
        requestId: requestId as `${string}-${string}-${string}-${string}-${string}`,
        state: 'idle',
        task: 'R2 permission persistence',
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
      await new SqliteWorkspaceStore(database).observe(projectId, {
        fingerprint: 'permission-fixture',
        gitIdentity: null,
        complete: true
      });
      const calls = new SqliteToolCallStore(database);
      await calls.createWithInitialEvent({
        callId: callId as `${string}-${string}-${string}-${string}-${string}`,
        runId: runId as `${string}-${string}-${string}-${string}-${string}`,
        projectId: projectId as `${string}-${string}-${string}-${string}-${string}`,
        toolId: 'command.run',
        toolVersion: 1,
        state: 'schema_validated',
        arguments: { executable: 'node', args: ['--version'] },
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
        payload: { callId, toolId: 'command.run' }
      });

      const permissionStore = new SqlitePermissionStore(database, { now: () => timestamp }, eventIds);
      const service = new PermissionService({
        store: permissionStore,
        calls,
        ids: eventIds,
        clock: { now: () => timestamp },
        digest
      });
      const request = await service.request({
        callId,
        command: {
          executable: 'node',
          args: ['--version'],
          cwd: 'C:\\project',
          timeoutMs: 30_000,
          maxOutputBytes: 256 * 1024
        },
        reason: 'Run the project test.',
        impact: 'The command may read project files.'
      });

      await expect(permissionStore.get(request.id)).resolves.toEqual(request);
      await expect(service.decide({ id: request.id, digest: request.digest, decision: 'allow_once' })).resolves.toBe('accepted');
      await expect(service.decide({ id: request.id, digest: request.digest, decision: 'allow_once' })).resolves.toBe('duplicate');
      await expect(service.claim(request.id, request.digest)).resolves.toBe(true);
      await expect(service.claim(request.id, request.digest)).resolves.toBe(false);
      expect(database.prepare('SELECT permission_result FROM tool_calls WHERE call_id = ?').get(callId))
        .toEqual({ permission_result: 'allowed_once' });
      expect(database.prepare('SELECT claimed FROM permission_requests WHERE id = ?').get(request.id))
        .toEqual({ claimed: 1 });
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      database.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
