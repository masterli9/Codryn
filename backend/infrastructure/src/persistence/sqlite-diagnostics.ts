import { mkdir, open as openFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { backup, DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { R0DiagnosticFailure } from '@codryn/core';
import type { BackupEvidence, DatabaseDiagnostics, DatabaseEvidence } from '@codryn/core';
import type { Uuid } from '@codryn/shared';
import { migrations } from './migrations.js';
import { inspectDatabaseSafety } from './open-database.js';

function requireNumber(value: SQLOutputValue | undefined): number {
  if (typeof value !== 'number') throw new TypeError('DATABASE_ROW_INVALID');
  return value;
}

function requireString(value: SQLOutputValue | undefined): string {
  if (typeof value !== 'string') throw new TypeError('DATABASE_ROW_INVALID');
  return value;
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === 'object' && error !== null && Reflect.get(error, 'code') === 'EEXIST';
}

async function reserveBackupPath(backupDirectory: string, initialTimestamp: number): Promise<string> {
  let timestamp = initialTimestamp;
  while (Number.isSafeInteger(timestamp)) {
    const candidate = join(backupDirectory, `r0-${timestamp}.sqlite`);
    try {
      const reservation = await openFile(candidate, 'wx');
      await reservation.close();
      return candidate;
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
      timestamp += 1;
    }
  }
  throw new Error('BACKUP_TIMESTAMP_EXHAUSTED');
}

async function removeFailedBackup(path: string): Promise<void> {
  await Promise.all([
    rm(path, { force: true }),
    rm(`${path}-wal`, { force: true }),
    rm(`${path}-shm`, { force: true })
  ]).catch(() => undefined);
}

export class SqliteDiagnostics implements DatabaseDiagnostics {
  constructor(
    private readonly database: DatabaseSync,
    private readonly filename: string
  ) {}

  async inspect(): Promise<DatabaseEvidence> {
    try {
      const safety = inspectDatabaseSafety(this.database);
      const migrationVersions = this.database.prepare(
        'SELECT version FROM schema_migrations ORDER BY version ASC'
      ).all().map((row) => requireNumber(row.version));
      const expectedVersions = migrations.map((migration) => migration.version);

      if (safety.journalMode !== 'wal'
        || !safety.foreignKeysEnabled
        || !safety.defensiveModeEnabled
        || safety.extensionsEnabled
        || safety.busyTimeoutMs !== 5_000
        || safety.synchronousLevel !== 1) {
        throw new R0DiagnosticFailure('R0_DB_OPEN_FAILED', 'DATABASE_SAFETY_BASELINE_MISMATCH');
      }
      if (safety.quickCheck !== 'ok') {
        throw new R0DiagnosticFailure('R0_DB_INTEGRITY_FAILED', 'DATABASE_QUICK_CHECK_FAILED');
      }
      if (migrationVersions.length !== expectedVersions.length
        || migrationVersions.some((version, index) => version !== expectedVersions[index])) {
        throw new R0DiagnosticFailure('R0_DB_MIGRATION_FAILED', 'MIGRATION_VERSIONS_INVALID');
      }

      return {
        journalMode: 'wal',
        foreignKeysEnabled: true,
        defensiveModeEnabled: true,
        extensionsEnabled: false,
        quickCheck: 'ok',
        migrationVersions
      };
    } catch (error) {
      if (error instanceof R0DiagnosticFailure) throw error;
      throw new R0DiagnosticFailure('R0_DB_OPEN_FAILED', 'DATABASE_INSPECTION_FAILED');
    }
  }

  async backupAndVerify(sessionId: Uuid): Promise<BackupEvidence> {
    const backupDirectory = join(dirname(this.filename), 'backups');
    let backupPath: string | undefined;
    let backupCompleted = false;
    let copy: DatabaseSync | undefined;

    try {
      await mkdir(backupDirectory, { recursive: true });
      backupPath = await reserveBackupPath(backupDirectory, Date.now());
      if (!this.database.isOpen) throw new Error('SOURCE_DATABASE_CLOSED');
      await backup(this.database, backupPath);
      backupCompleted = true;
      if (!this.database.isOpen) throw new Error('SOURCE_DATABASE_CLOSED');

      copy = new DatabaseSync(backupPath, {
        open: true,
        readOnly: true,
        enableForeignKeyConstraints: true,
        allowExtension: false,
        timeout: 5_000
      });
      const integrityCheck = requireString(copy.prepare('PRAGMA integrity_check').get()?.integrity_check);
      if (integrityCheck !== 'ok') {
        throw new R0DiagnosticFailure('R0_DB_BACKUP_FAILED', 'BACKUP_INTEGRITY_CHECK_FAILED');
      }
      const sessionFound = copy.prepare(
        'SELECT 1 AS found FROM diagnostic_sessions WHERE id = ? LIMIT 1'
      ).get(sessionId)?.found === 1;
      const eventFound = copy.prepare(
        'SELECT 1 AS found FROM events WHERE session_id = ? ORDER BY sequence ASC LIMIT 1'
      ).get(sessionId)?.found === 1;

      return { integrityCheck: 'ok', sessionFound, eventFound };
    } catch (error) {
      if (error instanceof R0DiagnosticFailure) throw error;
      throw new R0DiagnosticFailure('R0_DB_BACKUP_FAILED', 'BACKUP_VERIFICATION_FAILED');
    } finally {
      copy?.close();
      if (!backupCompleted && backupPath !== undefined) await removeFailedBackup(backupPath);
    }
  }
}
