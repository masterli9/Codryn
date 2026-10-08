import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  R1PersistenceFailure,
  type AgentRunRecord,
  type AgentRunState,
  type AgentRunStore
} from '@codryn/core';
import {
  agentRunFailureCodeSchema,
  isoTimestampSchema,
  uuidSchema,
  type AgentRunFailureCode,
  type JsonValue,
  type Uuid
} from '@codryn/shared';
import { insertEvent, validateEvent, validateJsonValue } from './sqlite-event-store.js';

type AgentRunTransition = Parameters<AgentRunStore['transitionWithEvent']>[0];

const agentRunStates = new Set<AgentRunState>([
  'idle',
  'preparing_context',
  'waiting_for_model',
  'waiting_for_user_input',
  'waiting_for_approval',
  'executing_tool',
  'verifying',
  'completed',
  'cancelled',
  'failed'
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
    throw new TypeError('AGENT_RUN_INVALID');
  }
}

function parseState(value: unknown): AgentRunState {
  if (typeof value !== 'string' || !agentRunStates.has(value as AgentRunState)) {
    throw new TypeError('AGENT_RUN_STATE_INVALID');
  }
  return value as AgentRunState;
}

function parseStepCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new TypeError('AGENT_RUN_STEP_COUNT_INVALID');
  }
  return value;
}

function parseMaxSteps(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 32) {
    throw new TypeError('AGENT_RUN_MAX_STEPS_INVALID');
  }
  return value;
}

function parseNonEmptyString(value: unknown, code: string, maxLength?: number): string {
  if (typeof value !== 'string' || value.trim().length === 0
    || (maxLength !== undefined && value.length > maxLength)) {
    throw new TypeError(code);
  }
  return value;
}

function validateAgentRun(input: unknown): AgentRunRecord {
  if (!isPlainRecord(input)) throw new TypeError('AGENT_RUN_INVALID');
  requireExactKeys(
    input,
    [
      'runId', 'requestId', 'state', 'task', 'maxSteps', 'stepCount',
      'adapterId', 'modelId', 'createdAt', 'updatedAt'
    ],
    ['failureCode']
  );

  const base = {
    runId: uuidSchema.parse(input.runId),
    requestId: uuidSchema.parse(input.requestId),
    state: parseState(input.state),
    task: parseNonEmptyString(input.task, 'AGENT_RUN_TASK_INVALID', 16_384),
    maxSteps: parseMaxSteps(input.maxSteps),
    stepCount: parseStepCount(input.stepCount),
    adapterId: parseNonEmptyString(input.adapterId, 'AGENT_RUN_ADAPTER_INVALID'),
    modelId: parseNonEmptyString(input.modelId, 'AGENT_RUN_MODEL_INVALID'),
    createdAt: isoTimestampSchema.parse(input.createdAt),
    updatedAt: isoTimestampSchema.parse(input.updatedAt)
  };
  if (!Object.prototype.hasOwnProperty.call(input, 'failureCode')) return base;
  return { ...base, failureCode: agentRunFailureCodeSchema.parse(input.failureCode) };
}

function validateTransition(input: unknown): AgentRunTransition {
  if (!isPlainRecord(input)) throw new TypeError('AGENT_RUN_TRANSITION_INVALID');
  requireExactKeys(
    input,
    ['runId', 'from', 'to', 'stepCount', 'updatedAt', 'event'],
    ['failureCode']
  );

  const base = {
    runId: uuidSchema.parse(input.runId),
    from: parseState(input.from),
    to: parseState(input.to),
    stepCount: parseStepCount(input.stepCount),
    updatedAt: isoTimestampSchema.parse(input.updatedAt),
    event: validateEvent(input.event)
  };
  if (!Object.prototype.hasOwnProperty.call(input, 'failureCode')) return base;
  return { ...base, failureCode: agentRunFailureCodeSchema.parse(input.failureCode) };
}

function requireString(value: SQLOutputValue | undefined): string {
  if (typeof value !== 'string') throw new TypeError('AGENT_RUN_ROW_INVALID');
  return value;
}

function requireNumber(value: SQLOutputValue | undefined): number {
  if (typeof value !== 'number') throw new TypeError('AGENT_RUN_ROW_INVALID');
  return value;
}

function agentRunFromRow(row: Record<string, SQLOutputValue>): AgentRunRecord {
  const failureCode = row.failure_code;
  if (failureCode !== null && typeof failureCode !== 'string') {
    throw new TypeError('AGENT_RUN_ROW_INVALID');
  }
  return validateAgentRun({
    runId: requireString(row.run_id),
    requestId: requireString(row.request_id),
    state: requireString(row.state),
    task: requireString(row.task),
    maxSteps: requireNumber(row.max_steps),
    stepCount: requireNumber(row.step_count),
    adapterId: requireString(row.adapter_id),
    modelId: requireString(row.model_id),
    ...(typeof failureCode === 'string' ? { failureCode } : {}),
    createdAt: requireString(row.created_at),
    updatedAt: requireString(row.updated_at)
  });
}

export class SqliteAgentRunStore implements AgentRunStore {
  constructor(private readonly database: DatabaseSync) {}

  async createWithInitialEvent(runInput: AgentRunRecord, eventInput: Parameters<AgentRunStore['createWithInitialEvent']>[1]): Promise<void> {
    let transactionStarted = false;
    try {
      const run = validateAgentRun(runInput);
      const event = validateEvent(eventInput);
      if (event.sessionId !== run.runId) throw new TypeError('AGENT_RUN_EVENT_SESSION_MISMATCH');

      this.database.exec('BEGIN IMMEDIATE;');
      transactionStarted = true;
      this.database.prepare(`INSERT INTO sessions (
        id, kind, created_at, updated_at
      ) VALUES (?, ?, ?, ?)`).run(run.runId, 'agent', run.createdAt, run.updatedAt);
      this.database.prepare(`INSERT INTO agent_runs (
        run_id, request_id, state, task, max_steps, step_count,
        adapter_id, model_id, failure_code
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        run.runId,
        run.requestId,
        run.state,
        run.task,
        run.maxSteps,
        run.stepCount,
        run.adapterId,
        run.modelId,
        run.failureCode ?? null
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
      throw new R1PersistenceFailure('AGENT_RUN_WRITE_FAILED');
    }
  }

  async transitionWithEvent(input: AgentRunTransition): Promise<void> {
    let transactionStarted = false;
    try {
      const transition = validateTransition(input);
      if (transition.event.sessionId !== transition.runId) {
        throw new TypeError('AGENT_RUN_EVENT_SESSION_MISMATCH');
      }

      this.database.exec('BEGIN IMMEDIATE;');
      transactionStarted = true;
      const result = this.database.prepare(`UPDATE agent_runs
        SET state = ?, step_count = ?, failure_code = ?
        WHERE run_id = ? AND state = ?`).run(
        transition.to,
        transition.stepCount,
        transition.failureCode ?? null,
        transition.runId,
        transition.from
      );
      if (result.changes !== 1) throw new TypeError('AGENT_RUN_STATE_MISMATCH');
      const sessionResult = this.database.prepare(`UPDATE sessions
        SET updated_at = ? WHERE id = ? AND kind = ?`).run(
        transition.updatedAt,
        transition.runId,
        'agent'
      );
      if (sessionResult.changes !== 1) throw new TypeError('AGENT_RUN_SESSION_MISMATCH');
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
      throw new R1PersistenceFailure('AGENT_RUN_WRITE_FAILED');
    }
  }

  async saveR2Detail(runId: Uuid, detail: {
    readonly failureCode?: AgentRunFailureCode;
    readonly result: JsonValue;
  }): Promise<void> {
    let transactionStarted = false;
    try {
      const validRunId = uuidSchema.parse(runId);
      if (!isPlainRecord(detail)) throw new TypeError('R2_DETAIL_INVALID');
      requireExactKeys(detail, ['result'], ['failureCode']);
      validateJsonValue(detail.result);
      const failureCode = Object.prototype.hasOwnProperty.call(detail, 'failureCode')
        ? agentRunFailureCodeSchema.parse(detail.failureCode)
        : null;
      const resultJson = JSON.stringify(detail.result);

      this.database.exec('BEGIN IMMEDIATE;');
      transactionStarted = true;
      const existing = this.database.prepare(`SELECT failure_code, result_json
        FROM agent_run_details WHERE run_id = ?`).get(validRunId) as Record<string, SQLOutputValue> | undefined;
      if (existing !== undefined) {
        if (existing.failure_code !== failureCode || existing.result_json !== resultJson) {
          throw new TypeError('R2_DETAIL_CONFLICT');
        }
      } else {
        this.database.prepare(`INSERT INTO agent_run_details (
          run_id, failure_code, result_json
        ) VALUES (?, ?, ?)`).run(validRunId, failureCode, resultJson);
      }
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
      throw new R1PersistenceFailure('AGENT_RUN_WRITE_FAILED');
    }
  }

  async findById(runId: Parameters<AgentRunStore['findById']>[0]): Promise<AgentRunRecord | null> {
    try {
      const validRunId = uuidSchema.parse(runId);
      const row = this.database.prepare(`SELECT
        agent_runs.run_id, agent_runs.request_id, agent_runs.state, agent_runs.task,
        agent_runs.max_steps, agent_runs.step_count, agent_runs.adapter_id,
        agent_runs.model_id, agent_runs.failure_code,
        sessions.created_at, sessions.updated_at
        FROM agent_runs
        INNER JOIN sessions ON sessions.id = agent_runs.run_id AND sessions.kind = 'agent'
        WHERE agent_runs.run_id = ?`).get(validRunId);
      return row === undefined ? null : agentRunFromRow(row);
    } catch {
      throw new R1PersistenceFailure('AGENT_RUN_READ_FAILED');
    }
  }
}
