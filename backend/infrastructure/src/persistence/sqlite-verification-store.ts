import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import { verificationRecordSchema, uuidSchema, type VerificationRecord } from '@codryn/shared';
import type { VerificationStore, WorkspaceSnapshot } from '@codryn/core';
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

  async append(recordInput: VerificationRecord): Promise<void> {
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
}
