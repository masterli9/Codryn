import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import type {
  ChangeEntry,
  Clock,
  IdGenerator,
  MutationJournal,
  WriteIntent
} from '@codryn/core';
import { isoTimestampSchema, uuidSchema, type EventEnvelope } from '@codryn/shared';
import { insertEvent } from './sqlite-event-store.js';

interface EntryRow extends Record<string, SQLOutputValue> {
  id: SQLOutputValue;
  set_id: SQLOutputValue;
  project_id: SQLOutputValue;
  run_id: SQLOutputValue;
  call_id: SQLOutputValue;
  sequence: SQLOutputValue;
  path: SQLOutputValue;
  before_hash: SQLOutputValue;
  after_hash: SQLOutputValue;
  before_blob: SQLOutputValue;
  after_blob: SQLOutputValue;
  kind: SQLOutputValue;
  reverses_id: SQLOutputValue;
}

interface IntentRow extends EntryRow {
  operation_id: SQLOutputValue;
  intent_state: SQLOutputValue;
  confirmed_revision: SQLOutputValue;
}

function requireText(value: SQLOutputValue | undefined, code: string): string {
  if (typeof value !== 'string') throw new TypeError(code);
  return value;
}

function requireInteger(value: SQLOutputValue | undefined, code: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new TypeError(code);
  return value;
}

function parseHash(value: string): string {
  if (!/^[0-9a-f]{64}$/.test(value)) throw new TypeError('R2_MUTATION_HASH_INVALID');
  return value;
}

function parseEntry(input: ChangeEntry): ChangeEntry {
  if (typeof input.path !== 'string' || input.path.length === 0 || input.path.length > 1024 || input.path.includes('\0')) {
    throw new TypeError('R2_MUTATION_PATH_INVALID');
  }
  if (!Number.isSafeInteger(input.sequence) || input.sequence < 1) throw new TypeError('R2_MUTATION_SEQUENCE_INVALID');
  return {
    id: uuidSchema.parse(input.id),
    setId: uuidSchema.parse(input.setId),
    projectId: uuidSchema.parse(input.projectId),
    runId: uuidSchema.parse(input.runId),
    callId: uuidSchema.parse(input.callId),
    sequence: input.sequence,
    path: input.path,
    beforeHash: parseHash(input.beforeHash),
    afterHash: parseHash(input.afterHash),
    beforeBlob: parseHash(input.beforeBlob),
    afterBlob: parseHash(input.afterBlob),
    kind: input.kind === 'patch' || input.kind === 'revert' ? input.kind : (() => { throw new TypeError('R2_MUTATION_KIND_INVALID'); })(),
    reversesId: input.reversesId === null ? null : uuidSchema.parse(input.reversesId)
  };
}

function entryFromRow(row: EntryRow): ChangeEntry {
  const reversesId = row.reverses_id;
  if (reversesId !== null && typeof reversesId !== 'string') throw new TypeError('R2_MUTATION_ROW_INVALID');
  return parseEntry({
    id: requireText(row.id, 'R2_MUTATION_ROW_INVALID'),
    setId: requireText(row.set_id, 'R2_MUTATION_ROW_INVALID'),
    projectId: requireText(row.project_id, 'R2_MUTATION_ROW_INVALID'),
    runId: requireText(row.run_id, 'R2_MUTATION_ROW_INVALID'),
    callId: requireText(row.call_id, 'R2_MUTATION_ROW_INVALID'),
    sequence: requireInteger(row.sequence, 'R2_MUTATION_ROW_INVALID'),
    path: requireText(row.path, 'R2_MUTATION_ROW_INVALID'),
    beforeHash: requireText(row.before_hash, 'R2_MUTATION_ROW_INVALID'),
    afterHash: requireText(row.after_hash, 'R2_MUTATION_ROW_INVALID'),
    beforeBlob: requireText(row.before_blob, 'R2_MUTATION_ROW_INVALID'),
    afterBlob: requireText(row.after_blob, 'R2_MUTATION_ROW_INVALID'),
    kind: requireText(row.kind, 'R2_MUTATION_ROW_INVALID') as ChangeEntry['kind'],
    reversesId
  });
}

function intentFromRow(row: IntentRow): WriteIntent {
  const state = requireText(row.intent_state, 'R2_MUTATION_ROW_INVALID');
  if (!['prepared', 'applied', 'not_applied', 'conflicted'].includes(state)) {
    throw new TypeError('R2_MUTATION_STATE_INVALID');
  }
  return {
    operationId: uuidSchema.parse(requireText(row.operation_id, 'R2_MUTATION_ROW_INVALID')),
    entry: entryFromRow(row),
    state: state as WriteIntent['state']
  };
}

function mutationEvent(
  ids: IdGenerator,
  clock: Clock,
  entry: ChangeEntry,
  operationId: string,
  state: 'prepared' | 'applied' | 'not_applied' | 'conflicted'
): EventEnvelope {
  return {
    eventId: ids.next(),
    eventType: `change.mutation_${state}`,
    eventVersion: 1,
    correlationId: uuidSchema.parse(entry.callId),
    occurredAt: isoTimestampSchema.parse(clock.now()),
    source: 'core',
    sessionId: uuidSchema.parse(entry.runId),
    payload: {
      operationId: uuidSchema.parse(operationId),
      changeId: uuidSchema.parse(entry.id),
      setId: uuidSchema.parse(entry.setId),
      path: entry.path,
      sequence: entry.sequence,
      beforeHash: entry.beforeHash,
      afterHash: entry.afterHash,
      state
    }
  };
}

function sameMeaningfulInput(left: WriteIntent, right: WriteIntent): boolean {
  return left.operationId === right.operationId
    && left.state === right.state
    && JSON.stringify(left.entry) === JSON.stringify(right.entry);
}

function rollback(database: DatabaseSync, transactionStarted: boolean): void {
  if (!transactionStarted) return;
  try {
    if (database.isTransaction) database.exec('ROLLBACK;');
  } catch {
    // Preserve the original mutation persistence error.
  }
}

const entryColumns = `
  change_entries.id, change_entries.set_id, change_entries.project_id,
  change_entries.run_id, change_entries.call_id, change_entries.sequence,
  change_entries.path, change_entries.before_hash, change_entries.after_hash,
  change_entries.before_blob, change_entries.after_blob, change_entries.kind,
  change_entries.reverses_id`;

export class SqliteMutationJournal implements MutationJournal {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: Clock,
    private readonly ids: IdGenerator
  ) {}

  async prepare(intentInput: WriteIntent): Promise<void> {
    const intent = {
      operationId: uuidSchema.parse(intentInput.operationId),
      entry: parseEntry(intentInput.entry),
      state: intentInput.state
    } satisfies WriteIntent;
    if (intent.state !== 'prepared') throw new Error('R2_MUTATION_PREPARE_STATE_INVALID');
    const now = isoTimestampSchema.parse(this.clock.now());
    let transactionStarted = false;
    try {
      this.database.exec('BEGIN IMMEDIATE;');
      transactionStarted = true;
      const existing = this.database.prepare(`SELECT
        mutation_intents.operation_id, mutation_intents.state AS intent_state,
        ${entryColumns}, mutation_intents.confirmed_revision
        FROM mutation_intents
        INNER JOIN change_entries ON change_entries.id = mutation_intents.entry_id
        WHERE mutation_intents.operation_id = ?`).get(intent.operationId) as IntentRow | undefined;
      if (existing !== undefined) {
        if (!sameMeaningfulInput(intentFromRow(existing), intent)) throw new Error('R2_MUTATION_ID_CONFLICT');
        this.database.exec('COMMIT;');
        transactionStarted = false;
        return;
      }

      this.database.prepare(`INSERT INTO change_entries (
        id, set_id, project_id, run_id, call_id, sequence, path,
        before_hash, after_hash, before_blob, after_blob, kind, reverses_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        intent.entry.id,
        intent.entry.setId,
        intent.entry.projectId,
        intent.entry.runId,
        intent.entry.callId,
        intent.entry.sequence,
        intent.entry.path,
        intent.entry.beforeHash,
        intent.entry.afterHash,
        intent.entry.beforeBlob,
        intent.entry.afterBlob,
        intent.entry.kind,
        intent.entry.reversesId
      );
      this.database.prepare(`INSERT INTO mutation_intents (
        operation_id, entry_id, state, confirmed_revision, created_at
      ) VALUES (?, ?, ?, ?, ?)`).run(
        intent.operationId,
        intent.entry.id,
        'prepared',
        null,
        now
      );
      insertEvent(this.database, mutationEvent(this.ids, this.clock, intent.entry, intent.operationId, 'prepared'));
      this.database.exec('COMMIT;');
      transactionStarted = false;
    } catch (error) {
      rollback(this.database, transactionStarted);
      throw error;
    }
  }

  async confirm(operationIdInput: string): Promise<number> {
    const operationId = uuidSchema.parse(operationIdInput);
    let transactionStarted = false;
    try {
      this.database.exec('BEGIN IMMEDIATE;');
      transactionStarted = true;
      const row = this.database.prepare(`SELECT
        mutation_intents.operation_id, mutation_intents.state AS intent_state,
        mutation_intents.confirmed_revision, ${entryColumns}
        FROM mutation_intents
        INNER JOIN change_entries ON change_entries.id = mutation_intents.entry_id
        WHERE mutation_intents.operation_id = ?`).get(operationId) as IntentRow | undefined;
      if (row === undefined) throw new Error('R2_MUTATION_NOT_FOUND');
      const intent = intentFromRow(row);
      if (intent.state === 'applied') {
        const revision = requireInteger(row.confirmed_revision, 'R2_MUTATION_REVISION_INVALID');
        this.database.exec('COMMIT;');
        transactionStarted = false;
        return revision;
      }
      if (intent.state !== 'prepared') throw new Error('R2_MUTATION_NOT_PREPARED');

      const update = this.database.prepare(
        'UPDATE workspaces SET revision = revision + 1 WHERE id = ?'
      ).run(intent.entry.projectId);
      if (update.changes !== 1) throw new Error('R2_WORKSPACE_NOT_FOUND');
      const workspace = this.database.prepare(
        'SELECT revision FROM workspaces WHERE id = ?'
      ).get(intent.entry.projectId);
      const revision = requireInteger(workspace?.revision, 'R2_WORKSPACE_REVISION_INVALID');
      this.database.prepare(`UPDATE mutation_intents
        SET state = 'applied', confirmed_revision = ?
        WHERE operation_id = ? AND state = 'prepared'`).run(revision, operationId);
      insertEvent(this.database, mutationEvent(this.ids, this.clock, intent.entry, operationId, 'applied'));
      this.database.exec('COMMIT;');
      transactionStarted = false;
      return revision;
    } catch (error) {
      rollback(this.database, transactionStarted);
      throw error;
    }
  }

  async resolve(operationIdInput: string, state: 'not_applied' | 'conflicted'): Promise<void> {
    const operationId = uuidSchema.parse(operationIdInput);
    if (state !== 'not_applied' && state !== 'conflicted') throw new Error('R2_MUTATION_RESOLUTION_INVALID');
    let transactionStarted = false;
    try {
      this.database.exec('BEGIN IMMEDIATE;');
      transactionStarted = true;
      const row = this.database.prepare(`SELECT
        mutation_intents.operation_id, mutation_intents.state AS intent_state,
        mutation_intents.confirmed_revision, ${entryColumns}
        FROM mutation_intents
        INNER JOIN change_entries ON change_entries.id = mutation_intents.entry_id
        WHERE mutation_intents.operation_id = ?`).get(operationId) as IntentRow | undefined;
      if (row === undefined) throw new Error('R2_MUTATION_NOT_FOUND');
      const intent = intentFromRow(row);
      if (intent.state === state) {
        this.database.exec('COMMIT;');
        transactionStarted = false;
        return;
      }
      if (intent.state !== 'prepared') throw new Error('R2_MUTATION_NOT_PREPARED');
      this.database.prepare(`UPDATE mutation_intents SET state = ?
        WHERE operation_id = ? AND state = 'prepared'`).run(state, operationId);
      insertEvent(this.database, mutationEvent(this.ids, this.clock, intent.entry, operationId, state));
      this.database.exec('COMMIT;');
      transactionStarted = false;
    } catch (error) {
      rollback(this.database, transactionStarted);
      throw error;
    }
  }

  async pending(projectIdInput: string): Promise<readonly WriteIntent[]> {
    const projectId = uuidSchema.parse(projectIdInput);
    const rows = this.database.prepare(`SELECT
      mutation_intents.operation_id, mutation_intents.state AS intent_state,
      mutation_intents.confirmed_revision, ${entryColumns}
      FROM mutation_intents
      INNER JOIN change_entries ON change_entries.id = mutation_intents.entry_id
      WHERE change_entries.project_id = ? AND mutation_intents.state = 'prepared'
      ORDER BY change_entries.sequence ASC`).all(projectId) as IntentRow[];
    return rows.map(intentFromRow);
  }

  async entries(setIdInput: string): Promise<readonly ChangeEntry[]> {
    const setId = uuidSchema.parse(setIdInput);
    const rows = this.database.prepare(`SELECT ${entryColumns}
      FROM change_entries
      INNER JOIN mutation_intents ON mutation_intents.entry_id = change_entries.id
      WHERE change_entries.set_id = ? AND mutation_intents.state = 'applied'
      ORDER BY change_entries.sequence ASC`).all(setId) as EntryRow[];
    return rows.map(entryFromRow);
  }
}
