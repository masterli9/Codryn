import type { DatabaseSync, SQLInputValue, SQLOutputValue } from 'node:sqlite';
import {
  R1PersistenceFailure,
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

function parsePermissionResult(value: unknown): 'allowed_by_rule' | 'denied' {
  if (value !== 'allowed_by_rule' && value !== 'denied') {
    throw new TypeError('TOOL_CALL_PERMISSION_RESULT_INVALID');
  }
  return value;
}

function parseErrorCode(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError('TOOL_CALL_ERROR_CODE_INVALID');
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
    ['parentCallId', 'permissionResult', 'safeResult', 'errorCode']
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
  const parentCallId = Object.prototype.hasOwnProperty.call(input, 'parentCallId')
    ? { parentCallId: uuidSchema.parse(input.parentCallId) }
    : {};
  const permissionResult = Object.prototype.hasOwnProperty.call(input, 'permissionResult')
    ? { permissionResult: parsePermissionResult(input.permissionResult) }
    : {};
  const safeResult = Object.prototype.hasOwnProperty.call(input, 'safeResult')
    ? { safeResult: validatedJson(input.safeResult) }
    : {};
  const errorCode = Object.prototype.hasOwnProperty.call(input, 'errorCode')
    ? { errorCode: parseErrorCode(input.errorCode) }
    : {};
  return { ...base, ...parentCallId, ...permissionResult, ...safeResult, ...errorCode };
}

function validateTransition(input: unknown): ToolCallTransition {
  if (!isPlainRecord(input)) throw new TypeError('TOOL_CALL_TRANSITION_INVALID');
  requireExactKeys(
    input,
    ['callId', 'from', 'to', 'updatedAt', 'event'],
    ['permissionResult', 'safeResult', 'errorCode']
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
  const safeResult = Object.prototype.hasOwnProperty.call(input, 'safeResult')
    ? { safeResult: validatedJson(input.safeResult) }
    : {};
  const errorCode = Object.prototype.hasOwnProperty.call(input, 'errorCode')
    ? { errorCode: parseErrorCode(input.errorCode) }
    : {};
  return { ...base, ...permissionResult, ...safeResult, ...errorCode };
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
  constructor(private readonly database: DatabaseSync) {}

  async createWithInitialEvent(callInput: ToolCallRecord, eventInput: Parameters<ToolCallStore['createWithInitialEvent']>[1]): Promise<void> {
    let transactionStarted = false;
    try {
      const call = validateToolCall(callInput);
      const event = validateEvent(eventInput);
      if (event.sessionId !== call.runId) throw new TypeError('TOOL_CALL_EVENT_SESSION_MISMATCH');

      this.database.exec('BEGIN IMMEDIATE;');
      transactionStarted = true;
      this.database.prepare(`INSERT INTO tool_calls (
        call_id, run_id, parent_call_id, tool_id, tool_version, state, arguments_json,
        permission_result, safe_result_json, error_code, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        call.callId,
        call.runId,
        call.parentCallId ?? null,
        call.toolId,
        call.toolVersion,
        call.state,
        JSON.stringify(call.arguments),
        call.permissionResult ?? null,
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
}
