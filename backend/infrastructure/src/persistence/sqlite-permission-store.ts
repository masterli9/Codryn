import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  type Clock,
  type IdGenerator,
  type PermissionStore
} from '@codryn/core';
import {
  isoTimestampSchema,
  permissionDecisionInputSchema,
  permissionViewSchema,
  uuidSchema,
  type PermissionDecisionInput,
  type PermissionView
} from '@codryn/shared';
import { insertEvent } from './sqlite-event-store.js';

interface PermissionRow {
  readonly id: SQLOutputValue;
  readonly call_id: SQLOutputValue;
  readonly digest: SQLOutputValue;
  readonly safe_input_json: SQLOutputValue;
  readonly state: SQLOutputValue;
  readonly claimed: SQLOutputValue;
}

function rollback(database: DatabaseSync, started: boolean): void {
  if (!started) return;
  try { if (database.isTransaction) database.exec('ROLLBACK;'); }
  catch { /* Preserve the original persistence error. */ }
}

function text(value: SQLOutputValue | undefined, code: string): string {
  if (typeof value !== 'string') throw new TypeError(code);
  return value;
}

function rowView(row: PermissionRow): PermissionView {
  const safeInput = JSON.parse(text(row.safe_input_json, 'R2_PERMISSION_ROW_INVALID')) as Record<string, unknown>;
  return permissionViewSchema.parse({
    id: text(row.id, 'R2_PERMISSION_ROW_INVALID'),
    callId: text(row.call_id, 'R2_PERMISSION_ROW_INVALID'),
    digest: text(row.digest, 'R2_PERMISSION_ROW_INVALID'),
    command: safeInput.command,
    reason: safeInput.reason,
    impact: safeInput.impact,
    state: text(row.state, 'R2_PERMISSION_ROW_INVALID')
  });
}

function requestEvent(ids: IdGenerator, clock: Clock, view: PermissionView, eventType: string, payload: Record<string, unknown>) {
  return {
    eventId: ids.next(),
    eventType,
    eventVersion: 1 as const,
    correlationId: uuidSchema.parse(view.callId),
    occurredAt: isoTimestampSchema.parse(clock.now()),
    source: 'core' as const,
    payload: { permissionId: view.id, callId: view.callId, ...payload }
  };
}

export class SqlitePermissionStore implements PermissionStore {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: Clock,
    private readonly ids: IdGenerator
  ) {}

  async create(input: PermissionView): Promise<void> {
    const view = permissionViewSchema.parse(input);
    if (view.state !== 'pending') throw new Error('R2_PERMISSION_CREATE_STATE_INVALID');
    let transactionStarted = false;
    try {
      this.database.exec('BEGIN IMMEDIATE;');
      transactionStarted = true;
      const call = this.database.prepare(
        'SELECT call_id, run_id, project_id FROM tool_calls WHERE call_id = ?'
      ).get(view.callId) as { call_id?: SQLOutputValue; run_id?: SQLOutputValue; project_id?: SQLOutputValue } | undefined;
      if (call === undefined || typeof call.run_id !== 'string' || typeof call.project_id !== 'string') {
        throw new Error('R2_PERMISSION_CALL_BINDING_MISSING');
      }
      this.database.prepare(`INSERT INTO permission_requests (
        id, call_id, digest, safe_input_json, state, claimed, created_at
      ) VALUES (?, ?, ?, ?, 'pending', 0, ?)`).run(
        view.id,
        view.callId,
        view.digest,
        JSON.stringify({ command: view.command, reason: view.reason, impact: view.impact }),
        isoTimestampSchema.parse(this.clock.now())
      );
      insertEvent(this.database, requestEvent(this.ids, this.clock, view, 'permission.requested', {
        state: 'pending',
        digest: view.digest,
        command: view.command,
        reason: view.reason,
        impact: view.impact
      }));
      this.database.exec('COMMIT;');
      transactionStarted = false;
    } catch (error) {
      rollback(this.database, transactionStarted);
      throw error;
    }
  }

  async get(idInput: string): Promise<PermissionView | null> {
    const id = uuidSchema.parse(idInput);
    const row = this.database.prepare(`SELECT
      id, call_id, digest, safe_input_json, state, claimed
      FROM permission_requests WHERE id = ?`).get(id) as PermissionRow | undefined;
    return row === undefined ? null : rowView(row);
  }

  async decide(input: PermissionDecisionInput): Promise<'accepted' | 'duplicate' | 'rejected'> {
    const decision = permissionDecisionInputSchema.parse(input);
    let transactionStarted = false;
    try {
      this.database.exec('BEGIN IMMEDIATE;');
      transactionStarted = true;
      const row = this.database.prepare(`SELECT
        id, call_id, digest, safe_input_json, state, claimed
        FROM permission_requests WHERE id = ?`).get(decision.id) as PermissionRow | undefined;
      if (row === undefined || row.digest !== decision.digest) {
        this.database.exec('ROLLBACK;');
        transactionStarted = false;
        return 'rejected';
      }
      const desired = decision.decision === 'allow_once' ? 'allowed_once' : 'denied';
      const current = text(row.state, 'R2_PERMISSION_ROW_INVALID');
      if (current !== 'pending') {
        this.database.exec('ROLLBACK;');
        transactionStarted = false;
        return current === desired ? 'duplicate' : 'rejected';
      }
      const update = this.database.prepare(
        'UPDATE permission_requests SET state = ? WHERE id = ? AND digest = ? AND state = ?'
      ).run(desired, decision.id, decision.digest, 'pending');
      if (update.changes !== 1) throw new Error('R2_PERMISSION_DECISION_RACE');
      this.database.prepare(
        'UPDATE tool_calls SET permission_result = ? WHERE call_id = ?'
      ).run(desired, text(row.call_id, 'R2_PERMISSION_ROW_INVALID'));
      const view = rowView({ ...row, state: desired });
      insertEvent(this.database, requestEvent(this.ids, this.clock, view, 'permission.decided', {
        state: desired,
        decision: decision.decision
      }));
      this.database.exec('COMMIT;');
      transactionStarted = false;
      return 'accepted';
    } catch (error) {
      rollback(this.database, transactionStarted);
      throw error;
    }
  }

  async claim(idInput: string, digestInput: string): Promise<boolean> {
    const id = uuidSchema.parse(idInput);
    const digest = permissionDecisionInputSchema.shape.digest.parse(digestInput);
    let transactionStarted = false;
    try {
      this.database.exec('BEGIN IMMEDIATE;');
      transactionStarted = true;
      const update = this.database.prepare(`UPDATE permission_requests
        SET claimed = 1
        WHERE id = ? AND digest = ? AND state = 'allowed_once' AND claimed = 0`).run(id, digest);
      if (update.changes !== 1) {
        this.database.exec('ROLLBACK;');
        transactionStarted = false;
        return false;
      }
      const row = this.database.prepare(`SELECT
        id, call_id, digest, safe_input_json, state, claimed
        FROM permission_requests WHERE id = ?`).get(id) as PermissionRow | undefined;
      if (row === undefined) throw new Error('R2_PERMISSION_ROW_INVALID');
      insertEvent(this.database, requestEvent(this.ids, this.clock, rowView(row), 'permission.claimed', { state: 'allowed_once' }));
      this.database.exec('COMMIT;');
      transactionStarted = false;
      return true;
    } catch (error) {
      rollback(this.database, transactionStarted);
      throw error;
    }
  }

  async closePending(idInput: string, state: 'expired' | 'cancelled'): Promise<boolean> {
    const id = uuidSchema.parse(idInput);
    let transactionStarted = false;
    try {
      this.database.exec('BEGIN IMMEDIATE;');
      transactionStarted = true;
      const update = this.database.prepare(
        'UPDATE permission_requests SET state = ? WHERE id = ? AND state = ?'
      ).run(state, id, 'pending');
      if (update.changes !== 1) {
        this.database.exec('ROLLBACK;');
        transactionStarted = false;
        return false;
      }
      const row = this.database.prepare(`SELECT
        id, call_id, digest, safe_input_json, state, claimed
        FROM permission_requests WHERE id = ?`).get(id) as PermissionRow | undefined;
      if (row === undefined) throw new Error('R2_PERMISSION_ROW_INVALID');
      insertEvent(this.database, requestEvent(this.ids, this.clock, rowView(row), 'permission.closed', { state }));
      this.database.exec('COMMIT;');
      transactionStarted = false;
      return true;
    } catch (error) {
      rollback(this.database, transactionStarted);
      throw error;
    }
  }
}
