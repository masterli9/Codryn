import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import { R0DiagnosticFailure } from '@codryn/core';
import type { DiagnosticSession, InitialEvent, SessionRepository } from '@codryn/core';
import { isoTimestampSchema, uuidSchema, type Uuid } from '@codryn/shared';
import { insertEvent, validateEvent } from './sqlite-event-store.js';

function validateSession(input: unknown): DiagnosticSession {
  if (typeof input !== 'object' || input === null || Object.getPrototypeOf(input) !== Object.prototype) {
    throw new TypeError('DIAGNOSTIC_SESSION_INVALID');
  }
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.join(',') !== 'createdAt,id,status,updatedAt') throw new TypeError('DIAGNOSTIC_SESSION_INVALID');
  if (record.status !== 'created') throw new TypeError('DIAGNOSTIC_SESSION_INVALID');
  return {
    id: uuidSchema.parse(record.id),
    status: record.status,
    createdAt: isoTimestampSchema.parse(record.createdAt),
    updatedAt: isoTimestampSchema.parse(record.updatedAt)
  };
}

function requireString(value: SQLOutputValue | undefined): string {
  if (typeof value !== 'string') throw new TypeError('DIAGNOSTIC_SESSION_ROW_INVALID');
  return value;
}

export class SqliteSessionRepository implements SessionRepository {
  constructor(private readonly database: DatabaseSync) {}

  async createWithInitialEvent(sessionInput: DiagnosticSession, eventInput: InitialEvent): Promise<void> {
    const session = validateSession(sessionInput);
    const event = validateEvent(eventInput);
    if (event.sessionId !== session.id) throw new TypeError('INITIAL_EVENT_SESSION_MISMATCH');

    let transactionStarted = false;
    try {
      this.database.exec('BEGIN IMMEDIATE;');
      transactionStarted = true;
      this.database.prepare(`INSERT INTO diagnostic_sessions (
        id, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?)`).run(session.id, session.status, session.createdAt, session.updatedAt);
      insertEvent(this.database, event);
      this.database.exec('COMMIT;');
    } catch {
      if (transactionStarted) {
        try {
          if (this.database.isTransaction) this.database.exec('ROLLBACK;');
        } catch {
          // Preserve the stable repository failure below even if rollback itself fails.
        }
      }
      throw new R0DiagnosticFailure('R0_DB_OPEN_FAILED', 'SESSION_EVENT_WRITE_FAILED');
    }
  }

  async findById(id: Uuid): Promise<DiagnosticSession | null> {
    const validId = uuidSchema.parse(id);
    try {
      const row = this.database.prepare(`SELECT id, status, created_at, updated_at
        FROM diagnostic_sessions WHERE id = ?`).get(validId);
      if (row === undefined) return null;
      return validateSession({
        id: requireString(row.id),
        status: requireString(row.status),
        createdAt: requireString(row.created_at),
        updatedAt: requireString(row.updated_at)
      });
    } catch (error) {
      if (error instanceof R0DiagnosticFailure) throw error;
      throw new R0DiagnosticFailure('R0_DB_OPEN_FAILED', 'SESSION_READ_FAILED');
    }
  }
}
