import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import type { WorkspaceObservation, WorkspaceSnapshot, WorkspaceStore } from '@codryn/core';
import { uuidSchema } from '@codryn/shared';

interface WorkspaceRow {
  readonly id: SQLOutputValue;
  readonly revision: SQLOutputValue;
  readonly fingerprint: SQLOutputValue;
  readonly git_identity: SQLOutputValue;
  readonly observation_complete: SQLOutputValue;
}

function requireText(value: SQLOutputValue | undefined, code: string): string {
  if (typeof value !== 'string') throw new TypeError(code);
  return value;
}

function requireNumber(value: SQLOutputValue | undefined, code: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new TypeError(code);
  return value;
}

function snapshotFromRow(row: WorkspaceRow): WorkspaceSnapshot {
  const gitIdentity = row.git_identity;
  if (gitIdentity !== null && typeof gitIdentity !== 'string') throw new TypeError('R2_WORKSPACE_ROW_INVALID');
  const complete = row.observation_complete;
  if (complete !== 0 && complete !== 1) throw new TypeError('R2_WORKSPACE_ROW_INVALID');
  return {
    revision: requireNumber(row.revision, 'R2_WORKSPACE_ROW_INVALID'),
    fingerprint: requireText(row.fingerprint, 'R2_WORKSPACE_ROW_INVALID'),
    gitIdentity,
    complete: complete === 1
  };
}

function validateObservation(input: WorkspaceObservation): WorkspaceObservation {
  if (typeof input.fingerprint !== 'string' || input.fingerprint.length === 0
    || input.fingerprint.includes('\0')
    || (input.gitIdentity !== null && (typeof input.gitIdentity !== 'string' || input.gitIdentity.includes('\0')))
    || typeof input.complete !== 'boolean') {
    throw new TypeError('R2_WORKSPACE_OBSERVATION_INVALID');
  }
  return input;
}

export class SqliteWorkspaceStore implements WorkspaceStore {
  constructor(private readonly database: DatabaseSync) {}

  async observe(projectIdInput: string, observationInput: WorkspaceObservation): Promise<WorkspaceSnapshot> {
    const projectId = uuidSchema.parse(projectIdInput);
    const observation = validateObservation(observationInput);
    let transactionStarted = false;
    try {
      this.database.exec('BEGIN IMMEDIATE;');
      transactionStarted = true;
      const existing = this.database.prepare(`SELECT
        id, revision, fingerprint, git_identity, observation_complete
        FROM workspaces WHERE id = ?`).get(projectId) as WorkspaceRow | undefined;
      if (existing === undefined) {
        this.database.prepare(`INSERT INTO workspaces (
          id, root_identity, revision, fingerprint, git_identity, observation_complete
        ) VALUES (?, ?, ?, ?, ?, ?)`).run(
          projectId,
          projectId,
          0,
          observation.fingerprint,
          observation.gitIdentity,
          observation.complete ? 1 : 0
        );
        this.database.exec('COMMIT;');
        transactionStarted = false;
        return { ...observation, revision: 0 };
      }

      const current = snapshotFromRow(existing);
      const changed = current.fingerprint !== observation.fingerprint
        || current.gitIdentity !== observation.gitIdentity
        || current.complete !== observation.complete;
      const revision = current.revision + (changed ? 1 : 0);
      this.database.prepare(`UPDATE workspaces SET
        revision = ?, fingerprint = ?, git_identity = ?, observation_complete = ?
        WHERE id = ?`).run(
        revision,
        observation.fingerprint,
        observation.gitIdentity,
        observation.complete ? 1 : 0,
        projectId
      );
      this.database.exec('COMMIT;');
      transactionStarted = false;
      return { ...observation, revision };
    } catch (error) {
      if (transactionStarted) {
        try {
          if (this.database.isTransaction) this.database.exec('ROLLBACK;');
        } catch {
          // Preserve the original workspace persistence error.
        }
      }
      throw error;
    }
  }

  async current(projectIdInput: string): Promise<WorkspaceSnapshot> {
    const projectId = uuidSchema.parse(projectIdInput);
    const row = this.database.prepare(`SELECT
      id, revision, fingerprint, git_identity, observation_complete
      FROM workspaces WHERE id = ?`).get(projectId) as WorkspaceRow | undefined;
    if (row === undefined) throw new Error('R2_WORKSPACE_NOT_FOUND');
    return snapshotFromRow(row);
  }
}
