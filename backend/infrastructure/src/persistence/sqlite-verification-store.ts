import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import { r4ReferencePathSchema, verificationRecordSchema, uuidSchema, type VerificationRecord } from '@codryn/shared';
import { sameCheckInputs } from '@codryn/core';
import type { ProfiledVerificationRecord, VerificationCoverage, VerificationStore, WorkspaceSnapshot } from '@codryn/core';
import { isAbsolute } from 'node:path';
import { insertEvent } from './sqlite-event-store.js';

interface VerificationRow {
  readonly record_json: SQLOutputValue;
}

function rowRecord(row: VerificationRow): VerificationRecord {
  if (typeof row.record_json !== 'string') throw new TypeError('R2_VERIFICATION_ROW_INVALID');
  try { return verificationRecordSchema.parse(JSON.parse(row.record_json)); }
  catch { throw new TypeError('R2_VERIFICATION_ROW_INVALID'); }
}

export class SqliteVerificationStore implements VerificationStore {
  constructor(private readonly database: DatabaseSync) {}

  async append(recordInput: VerificationRecord, coverage?: VerificationCoverage): Promise<void> {
    const record = verificationRecordSchema.parse(recordInput);
    let started = false;
    try {
      this.database.exec('BEGIN IMMEDIATE;');
      started = true;
      this.database.prepare(`INSERT INTO verification_records
        (id, run_id, call_id, project_id, revision, record_json, occurred_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        record.id, record.runId, record.callId, record.projectId, record.revision,
        JSON.stringify(record), record.occurredAt
      );
      if(coverage) {
        if (coverage.profileId === 'r2-sum-v1') {
          if (record.kind !== 'test' || coverage.coveredPaths.some(path => path !== 'sum.mjs')) throw new TypeError('R3_COVERAGE_INVALID');
        } else if (coverage.profileId === 'r4-ts-v1') {
          validateEvidence(coverage);
          this.database.prepare('INSERT INTO r4_verification_inputs VALUES(?,?,?)').run(record.id, JSON.stringify(coverage.inputHashes), JSON.stringify(coverage.toolPaths));
        } else throw new TypeError('R3_COVERAGE_INVALID');
        this.database.prepare('INSERT INTO desktop_verification_coverage VALUES(?,?,?)').run(record.id,coverage.profileId,JSON.stringify(coverage.coveredPaths));
      }
      insertEvent(this.database, {
        eventId: record.id,
        eventType: 'verification.recorded',
        eventVersion: 1,
        correlationId: record.callId,
        occurredAt: record.occurredAt,
        source: 'core',
        sessionId: record.runId,
        payload: {
          recordId: record.id,
          projectId: record.projectId,
          revision: record.revision,
          result: record.result,
          stale: record.stale,
          exitCode: record.exitCode
        }
      });
      this.database.exec('COMMIT;');
      started = false;
    } catch (error) {
      if (started) {
        try { if (this.database.isTransaction) this.database.exec('ROLLBACK;'); } catch { /* Preserve primary error. */ }
      }
      throw error;
    }
  }

  async current(runIdInput: string, snapshot: WorkspaceSnapshot): Promise<VerificationRecord | null> {
    const runId = uuidSchema.parse(runIdInput);
    const row = this.database.prepare(`SELECT record_json
      FROM verification_records WHERE run_id = ? ORDER BY occurred_at DESC, id DESC LIMIT 1`).get(runId) as VerificationRow | undefined;
    if (row === undefined) return null;
    const record = rowRecord(row);
    return verificationRecordSchema.parse({
      ...record,
      stale: record.stale || !snapshot.complete
        || record.revision !== snapshot.revision
        || record.fingerprint !== snapshot.fingerprint
    });
  }

  list(runIdInput: string, snapshot: WorkspaceSnapshot, currentInputs: Readonly<Record<string, string>> = {}): ProfiledVerificationRecord[] {
    const rows = this.database.prepare(`SELECT v.record_json, c.profile_id, c.covered_paths_json, e.input_hashes_json, e.tool_paths_json
      FROM verification_records v LEFT JOIN desktop_verification_coverage c ON c.record_id=v.id
      LEFT JOIN r4_verification_inputs e ON e.record_id=v.id WHERE v.run_id=? ORDER BY v.rowid DESC LIMIT 96`).all(uuidSchema.parse(runIdInput));
    return rows.map(row => {
      const record = rowRecord({ record_json: row.record_json ?? null });
      const profileId = typeof row.profile_id === 'string' ? row.profile_id : '';
      const paths: unknown = typeof row.covered_paths_json === 'string' ? JSON.parse(row.covered_paths_json) : [];
      if (!Array.isArray(paths) || !paths.every(path => typeof path === 'string')) throw new TypeError('R3_COVERAGE_INVALID');
      if (profileId === 'r4-ts-v1') {
        const evidence = { profileId, coveredPaths: paths as string[],
          inputHashes: parseStringRecord(row.input_hashes_json), toolPaths: parseStringRecord(row.tool_paths_json) };
        validateEvidence(evidence);
        const stale = record.stale || !snapshot.complete || !sameCheckInputs(evidence.inputHashes, currentInputs);
        return { ...evidence, record: { ...record, stale } };
      }
      const stale = record.stale || !snapshot.complete || record.revision !== snapshot.revision || record.fingerprint !== snapshot.fingerprint;
      return { profileId, coveredPaths: paths as string[], record: { ...record, stale } };
    });
  }

  toolPaths(projectIdInput: string): readonly Readonly<Record<string, string>>[] {
    const rows = this.database.prepare(`SELECT DISTINCT i.tool_paths_json FROM r4_verification_inputs i
      JOIN verification_records v ON v.id=i.record_id WHERE v.project_id=? ORDER BY v.rowid DESC LIMIT 64`).all(uuidSchema.parse(projectIdInput));
    return rows.map(row => parseStringRecord(row.tool_paths_json));
  }
}

function parseStringRecord(raw: SQLOutputValue | undefined): Record<string, string> {
  const value: unknown = typeof raw === 'string' ? JSON.parse(raw) : null;
  if (value === null || typeof value !== 'object' || Array.isArray(value) || !Object.values(value).every(item => typeof item === 'string')) throw new TypeError('R3_COVERAGE_INVALID');
  return value as Record<string, string>;
}

function validateEvidence(evidence: VerificationCoverage): void {
  const hashes = evidence.inputHashes, tools = evidence.toolPaths;
  const invalid = () => { throw new TypeError('R3_COVERAGE_INVALID'); };
  if (!hashes || !tools) return invalid();
  const inputs = Object.keys(hashes), covered = evidence.coveredPaths;
  const toolName = /^@(node|tsc|tsc-runtime|tsc-libs|vitest)$/u;
  if (!Object.hasOwn(hashes, '@policy') || !Object.hasOwn(tools, '@node') || inputs.length > 5006 ||
    !inputs.every(path => (path === '@policy' || (toolName.test(path) && Object.hasOwn(tools, path)) || r4ReferencePathSchema.safeParse(path).success)
      && /^[a-f0-9]{64}$/u.test(hashes[path] ?? '')) ||
    !Object.entries(tools).every(([name, path]) => toolName.test(name) && isAbsolute(path) && path.length <= 4096 && Object.hasOwn(hashes, name)) ||
    covered.length > 5000 || new Set(covered).size !== covered.length ||
    !covered.every(path => r4ReferencePathSchema.safeParse(path).success && /\.tsx?$/iu.test(path) && Object.hasOwn(hashes, path))) invalid();
}
