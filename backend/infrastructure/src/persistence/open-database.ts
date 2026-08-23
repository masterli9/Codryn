import { DatabaseSync } from 'node:sqlite';
import { R0DiagnosticFailure } from '@codryn/core';

interface SafetyState {
  readonly journalMode: string | null;
  readonly foreignKeysEnabled: boolean;
  readonly defensiveModeEnabled: boolean;
  readonly extensionsEnabled: boolean;
  readonly busyTimeoutMs: number | null;
  readonly synchronousLevel: number | null;
  readonly quickCheck: string | null;
}

function scalar(database: DatabaseSync, sql: string, column: string): string | number | null {
  const row = database.prepare(sql).get();
  const value = row?.[column];
  return typeof value === 'string' || typeof value === 'number' ? value : null;
}

function textScalar(database: DatabaseSync, sql: string, column: string): string | null {
  const value = scalar(database, sql, column);
  return typeof value === 'string' ? value : null;
}

function numberScalar(database: DatabaseSync, sql: string, column: string): number | null {
  const value = scalar(database, sql, column);
  return typeof value === 'number' ? value : null;
}

function extensionsAreDisabled(database: DatabaseSync): boolean {
  try {
    database.prepare("SELECT load_extension('__codryn_extension_probe__') AS extension_probe").get();
    return false;
  } catch (error) {
    return error instanceof Error && error.message === 'not authorized';
  }
}

export function inspectDatabaseSafety(database: DatabaseSync): SafetyState {
  database.exec('PRAGMA writable_schema = ON;');
  try {
    return {
      journalMode: textScalar(database, 'PRAGMA journal_mode', 'journal_mode'),
      foreignKeysEnabled: scalar(database, 'PRAGMA foreign_keys', 'foreign_keys') === 1,
      defensiveModeEnabled: scalar(database, 'PRAGMA writable_schema', 'writable_schema') === 0,
      extensionsEnabled: !extensionsAreDisabled(database),
      busyTimeoutMs: numberScalar(database, 'PRAGMA busy_timeout', 'timeout'),
      synchronousLevel: numberScalar(database, 'PRAGMA synchronous', 'synchronous'),
      quickCheck: textScalar(database, 'PRAGMA quick_check', 'quick_check')
    };
  } finally {
    database.exec('PRAGMA writable_schema = OFF;');
  }
}

export function openR0Database(filename: string): DatabaseSync {
  let database: DatabaseSync | undefined;

  try {
    database = new DatabaseSync(filename, {
      open: true,
      readOnly: false,
      enableForeignKeyConstraints: true,
      allowExtension: false,
      timeout: 5_000
    });
    database.enableDefensive(true);
    database.exec('PRAGMA journal_mode = WAL;');
    database.exec('PRAGMA foreign_keys = ON;');
    database.exec('PRAGMA busy_timeout = 5000;');
    database.exec('PRAGMA synchronous = NORMAL;');

    const safety = inspectDatabaseSafety(database);
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
    return database;
  } catch (error) {
    database?.close();
    if (error instanceof R0DiagnosticFailure) throw error;
    throw new R0DiagnosticFailure('R0_DB_OPEN_FAILED', 'DATABASE_OPEN_FAILED');
  }
}
