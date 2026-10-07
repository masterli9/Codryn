import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLInputValue, SQLOutputValue } from 'node:sqlite';
import {
  R1PersistenceFailure,
  type Clock,
  type IdGenerator,
  type ToolCallBinding,
  type ToolCallRecord,
  type ToolCallState,
  type ToolCallStore
} from '@codryn/core';
import { isoTimestampSchema, uuidSchema, type JsonValue } from '@codryn/shared';
import {
  canonicalizeJsonValue,
  insertEvent,
  validateEvent
} from './sqlite-event-store.js';

type ToolCallTransition = Parameters<ToolCallStore['transitionWithEvent']>[0];

const toolCallStates = new Set<ToolCallState>([
  'received',
  'schema_validated',
  'waiting_for_approval',
  'permission_decided',
  'queued',
  'running',
  'succeeded',
  'failed',
  'denied',
  'timed_out',
  'cancelled'
]);

function isPlainRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object'
    && input !== null
    && Object.getPrototypeOf(input) === Object.prototype;
}

function requireExactKeys(record: Record<string, unknown>, required: readonly string[], optional: readonly string[]): void {
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !Object.prototype.hasOwnProperty.call(record, key))
    || Object.keys(record).some((key) => !allowed.has(key))) {
    throw new TypeError('TOOL_CALL_INVALID');
  }
}

function parseState(value: unknown): ToolCallState {
  if (typeof value !== 'string' || !toolCallStates.has(value as ToolCallState)) {
    throw new TypeError('TOOL_CALL_STATE_INVALID');
  }
  return value as ToolCallState;
}

function parseToolId(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError('TOOL_CALL_ID_INVALID');
  return value;
}

function parseToolVersion(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new TypeError('TOOL_CALL_VERSION_INVALID');
  }
  return value;
}

function parsePermissionResult(value: unknown): 'allowed_by_rule' | 'allowed_once' | 'denied' {
  if (value !== 'allowed_by_rule' && value !== 'allowed_once' && value !== 'denied') {
    throw new TypeError('TOOL_CALL_PERMISSION_RESULT_INVALID');
  }
  return value;
}

function parseErrorCode(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError('TOOL_CALL_ERROR_CODE_INVALID');
  return value;
}

function parseAuditText(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError('TOOL_CALL_AUDIT_TEXT_INVALID');
  return value;
}

function validateToolCall(input: unknown): ToolCallRecord {
  if (!isPlainRecord(input)) throw new TypeError('TOOL_CALL_INVALID');
  requireExactKeys(
    input,
    [
      'callId', 'runId', 'toolId', 'toolVersion', 'state', 'arguments',
      'createdAt', 'updatedAt'
    ],
    ['projectId', 'parentCallId', 'permissionResult', 'permissionRuleId', 'permissionReason', 'safeResult', 'errorCode']
  );

  const base = {
    callId: uuidSchema.parse(input.callId),
    runId: uuidSchema.parse(input.runId),
    toolId: parseToolId(input.toolId),
    toolVersion: parseToolVersion(input.toolVersion),
    state: parseState(input.state),
    arguments: validatedJson(input.arguments),
    createdAt: isoTimestampSchema.parse(input.createdAt),
    updatedAt: isoTimestampSchema.parse(input.updatedAt)
  };
  const projectId = Object.prototype.hasOwnProperty.call(input, 'projectId')
    ? { projectId: uuidSchema.parse(input.projectId) }
    : {};
  const parentCallId = Object.prototype.hasOwnProperty.call(input, 'parentCallId')
    ? { parentCallId: uuidSchema.parse(input.parentCallId) }
    : {};
  const permissionResult = Object.prototype.hasOwnProperty.call(input, 'permissionResult')
    ? { permissionResult: parsePermissionResult(input.permissionResult) }
    : {};
  const permissionRuleId = Object.prototype.hasOwnProperty.call(input, 'permissionRuleId')
    ? { permissionRuleId: parseAuditText(input.permissionRuleId) }
    : {};
  const permissionReason = Object.prototype.hasOwnProperty.call(input, 'permissionReason')
    ? { permissionReason: parseAuditText(input.permissionReason) }
    : {};
  const safeResult = Object.prototype.hasOwnProperty.call(input, 'safeResult')
    ? { safeResult: validatedJson(input.safeResult) }
    : {};
  const errorCode = Object.prototype.hasOwnProperty.call(input, 'errorCode')
    ? { errorCode: parseErrorCode(input.errorCode) }
    : {};
  return { ...base, ...projectId, ...parentCallId, ...permissionResult, ...permissionRuleId, ...permissionReason, ...safeResult, ...errorCode };
}

function validateTransition(input: unknown): ToolCallTransition {
  if (!isPlainRecord(input)) throw new TypeError('TOOL_CALL_TRANSITION_INVALID');
  requireExactKeys(
    input,
    ['callId', 'from', 'to', 'updatedAt', 'event'],
    ['permissionResult', 'permissionRuleId', 'permissionReason', 'safeResult', 'errorCode']
  );

  const base = {
    callId: uuidSchema.parse(input.callId),
    from: parseState(input.from),
    to: parseState(input.to),
    updatedAt: isoTimestampSchema.parse(input.updatedAt),
    event: validateEvent(input.event)
  };
  const permissionResult = Object.prototype.hasOwnProperty.call(input, 'permissionResult')
    ? { permissionResult: parsePermissionResult(input.permissionResult) }
    : {};
  const permissionRuleId = Object.prototype.hasOwnProperty.call(input, 'permissionRuleId')
    ? { permissionRuleId: parseAuditText(input.permissionRuleId) }
    : {};
  const permissionReason = Object.prototype.hasOwnProperty.call(input, 'permissionReason')
    ? { permissionReason: parseAuditText(input.permissionReason) }
    : {};
  const safeResult = Object.prototype.hasOwnProperty.call(input, 'safeResult')
    ? { safeResult: validatedJson(input.safeResult) }
    : {};
  const errorCode = Object.prototype.hasOwnProperty.call(input, 'errorCode')
    ? { errorCode: parseErrorCode(input.errorCode) }
    : {};
  return { ...base, ...permissionResult, ...permissionRuleId, ...permissionReason, ...safeResult, ...errorCode };
}

function validatedJson(value: unknown): JsonValue {
  return canonicalizeJsonValue(value);
}

function serializeOptionalJson(record: ToolCallRecord): string | null {
  return Object.prototype.hasOwnProperty.call(record, 'safeResult')
    ? JSON.stringify(record.safeResult)
    : null;
}

function toolCallRunIdFromRow(row: Record<string, SQLOutputValue>): string {
  if (Object.keys(row).length !== 1 || typeof row.run_id !== 'string') {
    throw new TypeError('TOOL_CALL_ROW_INVALID');
  }
  return uuidSchema.parse(row.run_id);
}

export class SqliteToolCallStore implements ToolCallStore {
  constructor(
    private readonly database: DatabaseSync,
    private readonly options: { readonly clock?: Clock; readonly ids?: IdGenerator } = {}
  ) {}

  async createWithInitialEvent(callInput: ToolCallRecord, eventInput: Parameters<ToolCallStore['createWithInitialEvent']>[1]): Promise<void> {
    let transactionStarted = false;
    try {
      const call = validateToolCall(callInput);
      const event = validateEvent(eventInput);
      if (event.sessionId !== call.runId) throw new TypeError('TOOL_CALL_EVENT_SESSION_MISMATCH');

      this.database.exec('BEGIN IMMEDIATE;');
      transactionStarted = true;
      this.database.prepare(`INSERT INTO tool_calls (
        call_id, run_id, project_id, parent_call_id, tool_id, tool_version, state, arguments_json,
        permission_result, permission_rule_id, permission_reason, safe_result_json, error_code, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        call.callId,
        call.runId,
        call.projectId ?? null,
        call.parentCallId ?? null,
        call.toolId,
        call.toolVersion,
        call.state,
        JSON.stringify(call.arguments),
        call.permissionResult ?? null,
        call.permissionRuleId ?? null,
        call.permissionReason ?? null,
        serializeOptionalJson(call),
        call.errorCode ?? null,
        call.createdAt,
        call.updatedAt
      );
      insertEvent(this.database, event);
      this.database.exec('COMMIT;');
      transactionStarted = false;
    } catch {
      if (transactionStarted) {
        try {
          if (this.database.isTransaction) this.database.exec('ROLLBACK;');
        } catch {
          // Keep the stable persistence error even if rollback itself fails.
        }
      }
      throw new R1PersistenceFailure('TOOL_CALL_WRITE_FAILED');
    }
  }

  async findBinding(callIdInput: string): Promise<ToolCallBinding | null> {
    const callId = uuidSchema.parse(callIdInput);
    const row = this.database.prepare(
      'SELECT call_id, run_id, project_id FROM tool_calls WHERE call_id = ?'
    ).get(callId) as { call_id?: SQLOutputValue; run_id?: SQLOutputValue; project_id?: SQLOutputValue } | undefined;
    if (row === undefined || row.project_id === null || row.project_id === undefined) return null;
    if (typeof row.call_id !== 'string' || typeof row.run_id !== 'string' || typeof row.project_id !== 'string') {
      throw new TypeError('TOOL_CALL_ROW_INVALID');
    }
    return {
      callId: uuidSchema.parse(row.call_id),
      runId: uuidSchema.parse(row.run_id),
      projectId: uuidSchema.parse(row.project_id)
    };
  }

  async transitionWithEvent(input: ToolCallTransition): Promise<void> {
    let transactionStarted = false;
    try {
      const transition = validateTransition(input);

      this.database.exec('BEGIN IMMEDIATE;');
      transactionStarted = true;
      const runRow = this.database.prepare(
        'SELECT run_id FROM tool_calls WHERE call_id = ?'
      ).get(transition.callId);
      if (runRow === undefined || transition.event.sessionId !== toolCallRunIdFromRow(runRow)) {
        throw new TypeError('TOOL_CALL_EVENT_SESSION_MISMATCH');
      }

      const assignments = ['state = ?', 'updated_at = ?'];
      const values: SQLInputValue[] = [transition.to, transition.updatedAt];
      if (Object.prototype.hasOwnProperty.call(transition, 'permissionResult')) {
        assignments.push('permission_result = ?');
        values.push(transition.permissionResult ?? null);
      }
      if (Object.prototype.hasOwnProperty.call(transition, 'permissionRuleId')) {
        assignments.push('permission_rule_id = ?');
        values.push(transition.permissionRuleId ?? null);
      }
      if (Object.prototype.hasOwnProperty.call(transition, 'permissionReason')) {
        assignments.push('permission_reason = ?');
        values.push(transition.permissionReason ?? null);
      }
      if (Object.prototype.hasOwnProperty.call(transition, 'safeResult')) {
        assignments.push('safe_result_json = ?');
        values.push(JSON.stringify(transition.safeResult));
      }
      if (Object.prototype.hasOwnProperty.call(transition, 'errorCode')) {
        assignments.push('error_code = ?');
        values.push(transition.errorCode ?? null);
      }

      const result = this.database.prepare(`UPDATE tool_calls
        SET ${assignments.join(', ')}
        WHERE call_id = ? AND state = ?`).run(...values, transition.callId, transition.from);
      if (result.changes !== 1) throw new TypeError('TOOL_CALL_STATE_MISMATCH');
      insertEvent(this.database, transition.event);
      this.database.exec('COMMIT;');
      transactionStarted = false;
    } catch {
      if (transactionStarted) {
        try {
          if (this.database.isTransaction) this.database.exec('ROLLBACK;');
        } catch {
          // Keep the stable persistence error even if rollback itself fails.
        }
      }
      throw new R1PersistenceFailure('TOOL_CALL_WRITE_FAILED');
    }
  }

  async recoverInFlight(projectIdInput: string): Promise<number> {
    const projectId = uuidSchema.parse(projectIdInput);
    let transactionStarted = false;
    try {
      this.database.exec('BEGIN IMMEDIATE;');
      transactionStarted = true;
      const rows = this.database.prepare(`SELECT call_id, run_id, state
        FROM tool_calls
        WHERE project_id = ? AND tool_id = 'command.run' AND (
          state IN ('permission_decided', 'queued', 'running')
          OR (state = 'waiting_for_approval' AND EXISTS (
            SELECT 1 FROM permission_requests
            WHERE permission_requests.call_id = tool_calls.call_id
              AND permission_requests.state = 'allowed_once'
              AND permission_requests.claimed = 1
          ))
        )
        ORDER BY created_at ASC, call_id ASC`).all(projectId) as Array<Record<string, SQLOutputValue>>;
      for (const row of rows) {
        const callId = row.call_id;
        const runId = row.run_id;
        const from = row.state;
        if (typeof callId !== 'string' || typeof runId !== 'string' || typeof from !== 'string') throw new TypeError('TOOL_CALL_ROW_INVALID');
        const update = this.database.prepare(`UPDATE tool_calls
          SET state = 'failed', error_code = 'R2_RECOVERY_UNKNOWN_EFFECT',
              safe_result_json = ?
          WHERE call_id = ? AND state = ?`).run(
          JSON.stringify({ ok: false, code: 'R2_RECOVERY_UNKNOWN_EFFECT' }), callId, from
        );
        if (update.changes !== 1) throw new Error('R2_TOOL_CALL_RECOVERY_RACE');
        insertEvent(this.database, {
          eventId: this.options.ids?.next() ?? uuidSchema.parse(randomUUID()),
          eventType: 'tool_call.recovered',
          eventVersion: 1,
          correlationId: uuidSchema.parse(callId),
          occurredAt: isoTimestampSchema.parse(this.options.clock?.now() ?? new Date().toISOString()),
          source: 'core',
          sessionId: uuidSchema.parse(runId),
          payload: { callId: uuidSchema.parse(callId), from, to: 'failed', errorCode: 'R2_RECOVERY_UNKNOWN_EFFECT' }
        });
      }
      this.database.exec('COMMIT;');
      transactionStarted = false;
      return rows.length;
    } catch (error) {
      if (transactionStarted) {
        try { if (this.database.isTransaction) this.database.exec('ROLLBACK;'); } catch { /* Preserve recovery failure. */ }
      }
      throw error;
    }
  }
}
