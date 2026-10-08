import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import type { ProjectBaseline, ProjectBaselineStore } from '@codryn/core';
import { uuidSchema } from '@codryn/shared';

function parseBaseline(input: unknown): ProjectBaseline {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new TypeError('R2_BASELINE_INVALID');
  const value = input as Record<string, unknown>;
  if (value.mode === 'non-git' && (value.reason === 'not_repository' || value.reason === 'git_unavailable')
    && Object.keys(value).length === 2) return { mode: 'non-git', reason: value.reason };
  if (value.mode !== 'git'
    || (value.head !== null && (typeof value.head !== 'string' || !/^[0-9a-f]{40,64}$/i.test(value.head)))
    || (value.branch !== null && (typeof value.branch !== 'string' || value.branch.length === 0 || value.branch.length > 256))
    || typeof value.indexHash !== 'string' || !/^[0-9a-f]{64}$/.test(value.indexHash)
    || !Array.isArray(value.status) || !Array.isArray(value.conflicts)
    || typeof value.worktreeIdentity !== 'string' || value.worktreeIdentity.length === 0
    || Object.keys(value).length !== 7) throw new TypeError('R2_BASELINE_INVALID');
  const status = value.status.map((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) throw new TypeError('R2_BASELINE_INVALID');
    const record = item as Record<string, unknown>;
    if (typeof record.path !== 'string' || record.path.length === 0 || typeof record.xy !== 'string' || record.xy.length !== 2) {
      throw new TypeError('R2_BASELINE_INVALID');
    }
    return { path: record.path, xy: record.xy };
  });
  const conflicts = value.conflicts.map((item) => {
    if (typeof item !== 'string' || item.length === 0) throw new TypeError('R2_BASELINE_INVALID');
    return item;
  });
  return {
    mode: 'git',
    head: value.head as string | null,
    branch: value.branch as string | null,
    indexHash: value.indexHash,
    status,
    conflicts,
    worktreeIdentity: value.worktreeIdentity
  };
}

function serialized(baseline: ProjectBaseline): string {
  return JSON.stringify(parseBaseline(baseline));
}

function rollback(database: DatabaseSync, started: boolean): void {
  if (!started) return;
  try { if (database.isTransaction) database.exec('ROLLBACK;'); } catch { /* preserve original error */ }
}

export class SqliteProjectBaselineStore implements ProjectBaselineStore {
  constructor(private readonly database: DatabaseSync) {}

  async saveOnce(setIdInput: string, baselineInput: ProjectBaseline): Promise<void> {
    const setId = uuidSchema.parse(setIdInput);
    const baseline = parseBaseline(baselineInput);
    const json = serialized(baseline);
    let started = false;
    try {
      this.database.exec('BEGIN IMMEDIATE;');
      started = true;
      const existing = this.database.prepare('SELECT baseline_json FROM project_baselines WHERE set_id = ?').get(setId) as { baseline_json?: SQLOutputValue } | undefined;
      if (existing !== undefined) {
        if (existing.baseline_json !== json) throw new Error('R2_BASELINE_CONFLICT');
        this.database.exec('COMMIT;');
        started = false;
        return;
      }
      this.database.prepare('INSERT INTO project_baselines (set_id, baseline_json) VALUES (?, ?)').run(setId, json);
      this.database.exec('COMMIT;');
      started = false;
    } catch (error) {
      rollback(this.database, started);
      throw error;
    }
  }

  async get(setIdInput: string): Promise<ProjectBaseline> {
    const setId = uuidSchema.parse(setIdInput);
    const row = this.database.prepare('SELECT baseline_json FROM project_baselines WHERE set_id = ?').get(setId) as { baseline_json?: SQLOutputValue } | undefined;
    if (typeof row?.baseline_json !== 'string') throw new Error('R2_BASELINE_NOT_FOUND');
    try { return parseBaseline(JSON.parse(row.baseline_json)); }
    catch { throw new Error('R2_BASELINE_INVALID'); }
  }
}
