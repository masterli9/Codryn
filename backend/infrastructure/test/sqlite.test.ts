import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SqliteDiagnostics,
  SqliteEventStore,
  SqliteSessionRepository,
  migrations,
  openR0Database,
  runMigrations
} from '../src/index.js';

const firstTimestamp = '2026-08-17T08:00:00.000Z';
const secondTimestamp = '2026-08-17T08:00:01.000Z';

const session = {
  id: '00000000-0000-4000-8000-000000000001',
  status: 'created' as const,
  createdAt: firstTimestamp,
  updatedAt: firstTimestamp
};

const initialEvent = {
  eventId: '00000000-0000-4000-8000-000000000002',
  eventType: 'diagnostics.started',
  eventVersion: 1 as const,
  correlationId: '00000000-0000-4000-8000-000000000003',
  occurredAt: firstTimestamp,
  source: 'core' as const,
  sessionId: session.id,
  payload: { requestId: '00000000-0000-4000-8000-000000000004' }
};

const temporaryDirectories: string[] = [];

async function createDatabasePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'codryn-r0-sqlite-'));
  temporaryDirectories.push(directory);
  return join(directory, 'r0.sqlite');
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => {
    await rm(directory, { recursive: true, force: true });
  }));
});

describe('R0 SQLite persistence', () => {
  it('maps database construction failures to a stable open failure', async () => {
    const filename = await createDatabasePath();
    const blockingFile = join(filename, '..', 'not-a-directory');
    await writeFile(blockingFile, 'block database parent directory');

    expect(() => openR0Database(join(blockingFile, 'r0.sqlite'))).toThrowError(
      expect.objectContaining({ code: 'R0_DB_OPEN_FAILED', message: 'DATABASE_OPEN_FAILED' })
    );
  });

  it('enables WAL, foreign keys, defensive mode and disables extensions', async () => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);

    try {
      runMigrations(database, firstTimestamp);
      const evidence = await new SqliteDiagnostics(database, filename).inspect();

      expect(evidence).toEqual({
        journalMode: 'wal',
        foreignKeysEnabled: true,
        defensiveModeEnabled: true,
        extensionsEnabled: false,
        quickCheck: 'ok',
        migrationVersions: [0, 1]
      });
    } finally {
      database.close();
    }
  });

  it.each([
    ['busy timeout', 'PRAGMA busy_timeout = 0;', 'PRAGMA busy_timeout', { timeout: 0 }],
    ['synchronous mode', 'PRAGMA synchronous = FULL;', 'PRAGMA synchronous', { synchronous: 2 }]
  ])('rejects drifted %s without changing public evidence', async (_label, driftSql, readSql, driftedRow) => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);

    try {
      runMigrations(database, firstTimestamp);
      database.exec(driftSql);
      expect(database.prepare(readSql).get()).toEqual(driftedRow);

      await expect(new SqliteDiagnostics(database, filename).inspect()).rejects.toMatchObject({
        code: 'R0_DB_OPEN_FAILED',
        message: 'DATABASE_SAFETY_BASELINE_MISMATCH'
      });
    } finally {
      database.close();
    }
  });

  it('restores writable_schema after detecting disabled defensive mode', async () => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);

    try {
      runMigrations(database, firstTimestamp);
      database.enableDefensive(false);

      await expect(new SqliteDiagnostics(database, filename).inspect()).rejects.toMatchObject({
        code: 'R0_DB_OPEN_FAILED',
        message: 'DATABASE_SAFETY_BASELINE_MISMATCH'
      });
      expect(database.prepare('PRAGMA writable_schema').get()).toEqual({ writable_schema: 0 });
    } finally {
      database.exec('PRAGMA writable_schema = OFF;');
      database.close();
    }
  });

  it('applies migrations exactly once after reopen', async () => {
    const filename = await createDatabasePath();
    const firstConnection = openR0Database(filename);
    try {
      runMigrations(firstConnection, firstTimestamp);
      await new SqliteSessionRepository(firstConnection).createWithInitialEvent(session, initialEvent);
    } finally {
      firstConnection.close();
    }

    const secondConnection = openR0Database(filename);
    try {
      runMigrations(secondConnection, secondTimestamp);
      const rows = secondConnection.prepare(
        'SELECT version, name, applied_at FROM schema_migrations ORDER BY version ASC'
      ).all();

      expect(rows).toEqual([
        { version: 0, name: 'schema_migrations', applied_at: firstTimestamp },
        { version: 1, name: 'r0_diagnostic_data', applied_at: firstTimestamp }
      ]);
      expect(secondConnection.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
      await expect(new SqliteSessionRepository(secondConnection).findById(session.id)).resolves.toEqual(session);
      await expect(new SqliteEventStore(secondConnection).findBySessionId(session.id)).resolves.toEqual([initialEvent]);
    } finally {
      secondConnection.close();
    }
  });

  it('fails hard when a stored migration checksum differs', async () => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);

    try {
      runMigrations(database, firstTimestamp);
      database.prepare('UPDATE schema_migrations SET checksum = ? WHERE version = 1').run('tampered');

      expect(() => runMigrations(database, secondTimestamp)).toThrowError(
        expect.objectContaining({
          code: 'R0_DB_MIGRATION_FAILED',
          message: 'MIGRATION_CHECKSUM_MISMATCH'
        })
      );
      expect(database.isTransaction).toBe(false);
      expect(database.prepare(
        'SELECT version, checksum, applied_at FROM schema_migrations ORDER BY version ASC'
      ).all()).toEqual([
        expect.objectContaining({ version: 0, applied_at: firstTimestamp }),
        { version: 1, checksum: 'tampered', applied_at: firstTimestamp }
      ]);
    } finally {
      database.close();
    }
  });

  it.each([
    ['name', 'tampered-name', undefined],
    ['checksum', undefined, 'tampered-checksum']
  ])('rejects a migration %s mismatch before applying a missing later migration', async (_label, name, checksum) => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);
    const ledger = migrations[0];
    if (ledger === undefined) throw new Error('Migration 0 fixture is missing.');

    try {
      database.exec(ledger.sql);
      database.prepare(
        'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)'
      ).run(ledger.version, name ?? ledger.name, checksum ?? ledger.checksum, firstTimestamp);
      const createdTables: string[] = [];
      database.setAuthorizer((_actionCode, firstArgument) => {
        if (firstArgument === 'diagnostic_sessions') createdTables.push(firstArgument);
        return 0;
      });

      try {
        expect(() => runMigrations(database, secondTimestamp)).toThrowError(
          expect.objectContaining({
            code: 'R0_DB_MIGRATION_FAILED',
            message: 'MIGRATION_CHECKSUM_MISMATCH'
          })
        );
      } finally {
        database.setAuthorizer(null);
      }

      expect(createdTables).toEqual([]);
      expect(database.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'diagnostic_sessions'"
      ).get()).toBeUndefined();
    } finally {
      database.close();
    }
  });

  it('maps migration transaction-entry failure without rolling back the caller transaction', async () => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);

    try {
      runMigrations(database, firstTimestamp);
      database.exec('BEGIN IMMEDIATE;');

      expect(() => runMigrations(database, secondTimestamp)).toThrowError(
        expect.objectContaining({
          code: 'R0_DB_MIGRATION_FAILED',
          message: 'MIGRATION_APPLY_FAILED'
        })
      );
      expect(database.isTransaction).toBe(true);
    } finally {
      if (database.isTransaction) database.exec('ROLLBACK;');
      database.close();
    }
  });

  it('atomically creates a diagnostic session with its initial event', async () => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);

    try {
      runMigrations(database, firstTimestamp);
      const sessions = new SqliteSessionRepository(database);
      const events = new SqliteEventStore(database);

      await sessions.createWithInitialEvent(session, initialEvent);

      await expect(sessions.findById(session.id)).resolves.toEqual(session);
      await expect(events.findBySessionId(session.id)).resolves.toEqual([initialEvent]);
    } finally {
      database.close();
    }
  });

  it('maps session transaction-entry failure without rolling back the caller transaction', async () => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);

    try {
      runMigrations(database, firstTimestamp);
      database.exec('BEGIN IMMEDIATE;');

      await expect(new SqliteSessionRepository(database).createWithInitialEvent(session, initialEvent)).rejects.toMatchObject({
        code: 'R0_DB_OPEN_FAILED',
        message: 'SESSION_EVENT_WRITE_FAILED'
      });
      expect(database.isTransaction).toBe(true);
    } finally {
      if (database.isTransaction) database.exec('ROLLBACK;');
      database.close();
    }
  });

  it('rolls back a new session when its valid initial event violates a database constraint', async () => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);

    try {
      runMigrations(database, firstTimestamp);
      const sessions = new SqliteSessionRepository(database);
      const events = new SqliteEventStore(database);
      const secondSession = {
        id: '00000000-0000-4000-8000-000000000006',
        status: 'created' as const,
        createdAt: secondTimestamp,
        updatedAt: secondTimestamp
      };
      const duplicateIdentityEvent = {
        ...initialEvent,
        sessionId: secondSession.id,
        occurredAt: secondTimestamp
      };

      await sessions.createWithInitialEvent(session, initialEvent);
      await expect(sessions.createWithInitialEvent(secondSession, duplicateIdentityEvent)).rejects.toThrow();

      await expect(sessions.findById(secondSession.id)).resolves.toBeNull();
      await expect(events.findBySessionId(secondSession.id)).resolves.toEqual([]);
      await expect(events.findBySessionId(session.id)).resolves.toEqual([initialEvent]);
    } finally {
      database.close();
    }
  });

  it('round-trips a strict v1 JSON event', async () => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);

    try {
      runMigrations(database, firstTimestamp);
      const sessions = new SqliteSessionRepository(database);
      const events = new SqliteEventStore(database);
      const event = {
        eventId: '00000000-0000-4000-8000-000000000005',
        eventType: 'database.roundtrip',
        eventVersion: 1 as const,
        correlationId: initialEvent.correlationId,
        occurredAt: secondTimestamp,
        source: 'database' as const,
        sessionId: session.id,
        payload: {
          passed: true,
          count: 2,
          nullable: null,
          nested: ['one', { two: 2 }]
        }
      };

      await sessions.createWithInitialEvent(session, initialEvent);
      await events.append(event);

      await expect(events.findBySessionId(session.id)).resolves.toEqual([initialEvent, event]);
    } finally {
      database.close();
    }
  });

  it.each([
    ['envelope', 'UPDATE events SET event_type = ?', ''],
    ['payload', 'UPDATE events SET payload_json = ?', '{"value":1e400}']
  ])('rejects an invalid persisted %s during event reconstruction', async (_label, updateSql, invalidValue) => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);

    try {
      runMigrations(database, firstTimestamp);
      await new SqliteSessionRepository(database).createWithInitialEvent(session, initialEvent);
      database.prepare(updateSql).run(invalidValue);

      await expect(new SqliteEventStore(database).findBySessionId(session.id)).rejects.toMatchObject({
        code: 'R0_DB_OPEN_FAILED',
        message: 'EVENT_READ_FAILED'
      });
    } finally {
      database.close();
    }
  });

  it.each([
    ['undefined', { value: undefined }],
    ['BigInt', { value: 1n }],
    ['function', { value: () => 'not JSON' }],
    ['raw Error', new Error('not JSON')]
  ])('rejects %s event payloads before persistence', async (_label, payload) => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);

    try {
      runMigrations(database, firstTimestamp);
      const events = new SqliteEventStore(database);
      const event = {
        eventId: initialEvent.eventId,
        eventType: initialEvent.eventType,
        eventVersion: initialEvent.eventVersion,
        correlationId: initialEvent.correlationId,
        occurredAt: initialEvent.occurredAt,
        source: initialEvent.source,
        payload
      };

      await expect(events.append(event as never)).rejects.toThrow();
      expect(database.prepare('SELECT COUNT(*) AS count FROM events').get()).toEqual({ count: 0 });
    } finally {
      database.close();
    }
  });

  it('backs up, opens and integrity-checks the copied database', async () => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);

    try {
      runMigrations(database, firstTimestamp);
      await new SqliteSessionRepository(database).createWithInitialEvent(session, initialEvent);

      vi.spyOn(Date, 'now').mockReturnValue(1_786_971_192_243);
      const evidence = await new SqliteDiagnostics(database, filename).backupAndVerify(session.id);
      const secondEvidence = await new SqliteDiagnostics(database, filename).backupAndVerify(session.id);

      expect(evidence).toEqual({ integrityCheck: 'ok', sessionFound: true, eventFound: true });
      expect(secondEvidence).toEqual(evidence);
      expect(database.isOpen).toBe(true);
      const backupFiles = await readdir(join(filename, '..', 'backups'));
      expect(backupFiles.filter((entry) => entry.endsWith('.sqlite')).sort()).toEqual([
        'r0-1786971192243.sqlite',
        'r0-1786971192244.sqlite'
      ]);
    } finally {
      database.close();
    }
  });

  it('never overwrites a pre-existing backup candidate after restart', async () => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);
    const backupDirectory = join(filename, '..', 'backups');
    const existingBackup = join(backupDirectory, 'r0-1786971192243.sqlite');

    try {
      runMigrations(database, firstTimestamp);
      await new SqliteSessionRepository(database).createWithInitialEvent(session, initialEvent);
      await mkdir(backupDirectory, { recursive: true });
      await writeFile(existingBackup, 'must-not-be-overwritten');
      vi.spyOn(Date, 'now').mockReturnValue(1_786_971_192_243);

      await expect(new SqliteDiagnostics(database, filename).backupAndVerify(session.id)).resolves.toEqual({
        integrityCheck: 'ok',
        sessionFound: true,
        eventFound: true
      });
      await expect(readFile(existingBackup, 'utf8')).resolves.toBe('must-not-be-overwritten');
      const backupFiles = await readdir(backupDirectory);
      expect(backupFiles.filter((entry) => entry.endsWith('.sqlite')).sort()).toEqual([
        'r0-1786971192243.sqlite',
        'r0-1786971192244.sqlite'
      ]);
    } finally {
      database.close();
    }
  });

  it('maps backup directory failures to a stable backup failure', async () => {
    const filename = await createDatabasePath();
    const database = openR0Database(filename);

    try {
      runMigrations(database, firstTimestamp);
      await writeFile(join(filename, '..', 'backups'), 'block backup directory');

      await expect(new SqliteDiagnostics(database, filename).backupAndVerify(session.id)).rejects.toMatchObject({
        code: 'R0_DB_BACKUP_FAILED',
        message: 'BACKUP_VERIFICATION_FAILED'
      });
    } finally {
      database.close();
    }
  });
});
