import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import type { ChangeSetStore, Clock, IdGenerator } from '@codryn/core';
import { isoTimestampSchema, uuidSchema } from '@codryn/shared';

function requireNumber(value: SQLOutputValue | undefined, code: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new TypeError(code);
  return value;
}

export class SqliteChangeSetStore implements ChangeSetStore {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: Clock,
    private readonly ids: IdGenerator
  ) {}

  async open(projectIdInput: string, runIdInput: string): Promise<string> {
    const projectId = uuidSchema.parse(projectIdInput);
    const runId = uuidSchema.parse(runIdInput);
    const existing = this.database.prepare(
      'SELECT id, project_id FROM change_sets WHERE run_id = ?'
    ).get(runId) as { id?: SQLOutputValue; project_id?: SQLOutputValue } | undefined;
    if (existing !== undefined) {
      if (existing.project_id !== projectId || typeof existing.id !== 'string') {
        throw new Error('R2_CHANGE_SET_RUN_CONFLICT');
      }
      return uuidSchema.parse(existing.id);
    }

    const setId = this.ids.next();
    const createdAt = isoTimestampSchema.parse(this.clock.now());
    let transactionStarted = false;
    try {
      this.database.exec('BEGIN IMMEDIATE;');
      transactionStarted = true;
      const workspace = this.database.prepare('SELECT revision FROM workspaces WHERE id = ?').get(projectId);
      if (workspace === undefined) throw new Error('R2_WORKSPACE_NOT_FOUND');
      const revision = requireNumber(workspace.revision, 'R2_WORKSPACE_ROW_INVALID');
      this.database.prepare(`INSERT INTO change_sets (
        id, project_id, run_id, state, base_revision, next_sequence, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        setId,
        projectId,
        runId,
        'open',
        revision,
        1,
        createdAt
      );
      this.database.exec('COMMIT;');
      transactionStarted = false;
      return setId;
    } catch (error) {
      if (transactionStarted) {
        try {
          if (this.database.isTransaction) this.database.exec('ROLLBACK;');
        } catch {
          // Preserve the original change-set persistence error.
        }
      }
      throw error;
    }
  }

  async reserveSequence(setIdInput: string): Promise<number> {
    const setId = uuidSchema.parse(setIdInput);
    let transactionStarted = false;
    try {
      this.database.exec('BEGIN IMMEDIATE;');
      transactionStarted = true;
      const result = this.database.prepare(`UPDATE change_sets
        SET next_sequence = next_sequence + 1
        WHERE id = ? AND state = 'open'`).run(setId);
      if (result.changes !== 1) throw new Error('R2_CHANGE_SET_NOT_OPEN');
      const row = this.database.prepare(
        'SELECT next_sequence FROM change_sets WHERE id = ?'
      ).get(setId);
      const nextSequence = requireNumber(row?.next_sequence, 'R2_CHANGE_SET_ROW_INVALID');
      this.database.exec('COMMIT;');
      transactionStarted = false;
      return nextSequence - 1;
    } catch (error) {
      if (transactionStarted) {
        try {
          if (this.database.isTransaction) this.database.exec('ROLLBACK;');
        } catch {
          // Preserve the original change-set persistence error.
        }
      }
      throw error;
    }
  }
}
