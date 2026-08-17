import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SqliteDiagnostics,
  SqliteEventStore,
  SqliteSessionRepository,
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

  it('applies migrations exactly once after reopen', async () => {
    const filename = await createDatabasePath();
    const firstConnection = openR0Database(filename);
    runMigrations(firstConnection, firstTimestamp);
    await new SqliteSessionRepository(firstConnection).createWithInitialEvent(session, initialEvent);
    firstConnection.close();

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

      const diagnostics = new SqliteDiagnostics(database, filename);
      const evidence = await diagnostics.backupAndVerify(session.id);
      const secondEvidence = await diagnostics.backupAndVerify(session.id);

      expect(evidence).toEqual({ integrityCheck: 'ok', sessionFound: true, eventFound: true });
      expect(secondEvidence).toEqual(evidence);
      expect(database.isOpen).toBe(true);
      const backupFiles = await readdir(join(filename, '..', 'backups'));
      expect(backupFiles.filter((entry) => entry.endsWith('.sqlite'))).toHaveLength(2);
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
