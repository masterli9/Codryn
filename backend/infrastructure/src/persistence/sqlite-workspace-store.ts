import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import type { WorkspaceObservation, WorkspaceSnapshot, WorkspaceStore } from '@codryn/core';
import { uuidSchema, workspaceChangeSourceSchema } from '@codryn/shared';
import { transaction } from './r3-sqlite-helpers.js';

interface WorkspaceRow {
  readonly id: SQLOutputValue;
  readonly revision: SQLOutputValue;
  readonly fingerprint: SQLOutputValue;
  readonly git_identity: SQLOutputValue;
  readonly observation_complete: SQLOutputValue;
  readonly observed_at: SQLOutputValue;
  readonly change_source: SQLOutputValue;
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
    complete: complete === 1,
    observedAt: row.observed_at === null ? null : requireText(row.observed_at, 'R2_WORKSPACE_ROW_INVALID'),
    changeSource: workspaceChangeSourceSchema.parse(row.change_source)
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
  private readonly watcherGenerations = new Map<string, string>();
  constructor(private readonly database: DatabaseSync, private readonly now: () => string = () => new Date().toISOString()) {}

  open(rootIdentity: string, proposedId: string): string {
    const id = uuidSchema.parse(proposedId);
    this.database.prepare(`INSERT INTO workspaces
      (id, root_identity, revision, fingerprint, git_identity, observation_complete)
      VALUES (?, ?, 0, 'unobserved', NULL, 0) ON CONFLICT(root_identity) DO NOTHING`).run(id, rootIdentity);
    const row = this.database.prepare('SELECT id FROM workspaces WHERE root_identity = ?').get(rootIdentity);
    return uuidSchema.parse(row?.id);
  }

  async observe(projectIdInput: string, observationInput: WorkspaceObservation): Promise<WorkspaceSnapshot> {
    const projectId = uuidSchema.parse(projectIdInput);
    const observation = validateObservation(observationInput);
    let transactionStarted = false;
    try {
      this.database.exec('BEGIN IMMEDIATE;');
      transactionStarted = true;
      const existing = this.database.prepare(`SELECT
        id, revision, fingerprint, git_identity, observation_complete, observed_at, change_source
        FROM workspaces WHERE id = ?`).get(projectId) as WorkspaceRow | undefined;
      if (existing === undefined) {
        const observedAt = this.now();
        this.database.prepare(`INSERT INTO workspaces (
          id, root_identity, revision, fingerprint, git_identity, observation_complete, observed_at, change_source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'opened')`).run(
          projectId,
          projectId,
          0,
          observation.fingerprint,
          observation.gitIdentity,
          observation.complete ? 1 : 0, observedAt
        );
        this.database.exec('COMMIT;');
        transactionStarted = false;
        if (observation.watcherGeneration !== undefined) this.watcherGenerations.set(projectId, observation.watcherGeneration);
        return { ...observation, revision: 0, observedAt, changeSource: 'opened' };
      }

      const current = snapshotFromRow(existing);
      const changed = current.fingerprint !== observation.fingerprint
        || current.gitIdentity !== observation.gitIdentity
        || current.complete !== observation.complete
        || (observation.watcherGeneration !== undefined && this.watcherGenerations.has(projectId) && this.watcherGenerations.get(projectId) !== observation.watcherGeneration);
      const revision = current.revision + (changed ? 1 : 0);
      const observedAt = this.now();
      const pendingMutation = !current.complete && current.gitIdentity === observation.gitIdentity && ['patch', 'revert', 'git'].includes(current.changeSource ?? '');
      const changeSource = current.fingerprint === 'unobserved' ? 'opened' : pendingMutation ? current.changeSource ?? 'unknown'
        : changed ? current.gitIdentity !== observation.gitIdentity ? 'git_external' : 'external' : current.changeSource ?? 'unknown';
      this.database.prepare(`UPDATE workspaces SET
        revision = ?, fingerprint = ?, git_identity = ?, observation_complete = ?, observed_at=?, change_source=?
        WHERE id = ?`).run(
        pendingMutation ? current.revision : revision,
        observation.fingerprint,
        observation.gitIdentity,
        observation.complete ? 1 : 0, observedAt, changeSource,
        projectId
      );
      this.database.exec('COMMIT;');
      transactionStarted = false;
      if (observation.watcherGeneration !== undefined) this.watcherGenerations.set(projectId, observation.watcherGeneration);
      return { ...observation, revision: pendingMutation ? current.revision : revision, observedAt, changeSource };
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
      id, revision, fingerprint, git_identity, observation_complete, observed_at, change_source
      FROM workspaces WHERE id = ?`).get(projectId) as WorkspaceRow | undefined;
    if (row === undefined) throw new Error('R2_WORKSPACE_NOT_FOUND');
    return snapshotFromRow(row);
  }

  async advance(projectId: string, source: { changeSource: 'git' | 'patch' | 'revert'; mutationId: string }, expectedRevision?: number, observation?: WorkspaceObservation): Promise<WorkspaceSnapshot> {
    uuidSchema.parse(projectId);
    uuidSchema.parse(source.mutationId);
    workspaceChangeSourceSchema.parse(source.changeSource);
    return transaction(this.database, () => {
      const row = this.database.prepare('SELECT * FROM workspaces WHERE id=?').get(projectId) as WorkspaceRow | undefined;
      if (!row) throw new Error('R2_WORKSPACE_NOT_FOUND');
      const current = snapshotFromRow(row);
      const done = this.database.prepare('SELECT revision, change_source, occurred_at FROM workspace_mutations WHERE project_id=? AND mutation_id=?').get(projectId, source.mutationId);
      if (done) {
        if (done.change_source !== source.changeSource) throw new Error('R3_REQUEST_MISMATCH');
        return { ...current, revision: requireNumber(done.revision, 'R2_WORKSPACE_ROW_INVALID'), observedAt: requireText(done.occurred_at, 'R2_WORKSPACE_ROW_INVALID'), changeSource: source.changeSource, complete: false };
      }
      if (expectedRevision !== undefined && current.revision !== expectedRevision) throw new Error('R3_STALE_VIEW');
      const next = observation ? validateObservation(observation) : { ...current, complete: false };
      const revision = current.revision + 1, observedAt = this.now();
      this.database.prepare('UPDATE workspaces SET revision=?, observation_complete=?, fingerprint=?, git_identity=?, observed_at=?, change_source=? WHERE id=?')
        .run(revision, next.complete ? 1 : 0, next.fingerprint, next.gitIdentity, observedAt, source.changeSource, projectId);
      this.database.prepare('INSERT INTO workspace_mutations VALUES (?,?,?,?,?)').run(projectId, source.mutationId, revision, source.changeSource, observedAt);
      return { ...next, revision, observedAt, changeSource: source.changeSource };
    });
  }
}
