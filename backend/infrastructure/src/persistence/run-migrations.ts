import type { DatabaseSync } from 'node:sqlite';
import { R0DiagnosticFailure } from '@codryn/core';
import { isoTimestampSchema } from '@codryn/shared';
import { migrations } from './migrations.js';

interface MigrationRow {
  readonly version: number;
  readonly name: string;
  readonly checksum: string;
}

function parseMigrationRows(database: DatabaseSync): readonly MigrationRow[] {
  return database.prepare(
    'SELECT version, name, checksum FROM schema_migrations ORDER BY version ASC'
  ).all().map((row) => {
    if (typeof row.version !== 'number' || typeof row.name !== 'string' || typeof row.checksum !== 'string') {
      throw new R0DiagnosticFailure('R0_DB_MIGRATION_FAILED', 'MIGRATION_LEDGER_INVALID');
    }
    return { version: row.version, name: row.name, checksum: row.checksum };
  });
}

function requireKnownChecksums(rows: readonly MigrationRow[]): void {
  for (const migration of migrations) {
    const row = rows.find((candidate) => candidate.version === migration.version);
    if (row !== undefined && (row.name !== migration.name || row.checksum !== migration.checksum)) {
      throw new R0DiagnosticFailure('R0_DB_MIGRATION_FAILED', 'MIGRATION_CHECKSUM_MISMATCH');
    }
  }
}

export function runMigrations(database: DatabaseSync, now: string): void {
  try {
    isoTimestampSchema.parse(now);
  } catch {
    throw new R0DiagnosticFailure('R0_DB_MIGRATION_FAILED', 'MIGRATION_TIMESTAMP_INVALID');
  }

  database.exec('BEGIN IMMEDIATE;');
  try {
    const ledgerMigration = migrations[0];
    if (ledgerMigration === undefined) {
      throw new R0DiagnosticFailure('R0_DB_MIGRATION_FAILED', 'MIGRATION_LEDGER_MISSING');
    }

    database.exec(ledgerMigration.sql);
    const ledgerRow = database.prepare(
      'SELECT version, name, checksum FROM schema_migrations WHERE version = 0'
    ).get();
    if (ledgerRow === undefined) {
      database.prepare(
        'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)'
      ).run(ledgerMigration.version, ledgerMigration.name, ledgerMigration.checksum, now);
    }

    const recordedRows = parseMigrationRows(database);
    requireKnownChecksums(recordedRows);

    const recordedVersions = new Set(recordedRows.map((row) => row.version));
    for (const migration of migrations) {
      if (recordedVersions.has(migration.version)) continue;
      database.exec(migration.sql);
      database.prepare(
        'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)'
      ).run(migration.version, migration.name, migration.checksum, now);
    }
    database.exec('COMMIT;');
  } catch (error) {
    if (database.isTransaction) database.exec('ROLLBACK;');
    if (error instanceof R0DiagnosticFailure) throw error;
    throw new R0DiagnosticFailure('R0_DB_MIGRATION_FAILED', 'MIGRATION_APPLY_FAILED');
  }
}
