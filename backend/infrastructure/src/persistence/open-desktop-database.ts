import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { openR0Database } from './open-database.js';
import { runMigrations } from './run-migrations.js';
import { migrations } from './migrations.js';
export async function openDesktopDatabase(userDataPath: string): Promise<{ database: DatabaseSync; close(): void }> {
  await mkdir(userDataPath, { recursive: true });
  const filename = join(userDataPath, 'codryn.sqlite');
  const exists = await stat(filename).then(() => true, (error: unknown) => { if (error instanceof Error && Reflect.get(error, 'code') === 'ENOENT') return false; throw error; });
  const database = openR0Database(filename);
  try {
    if (exists) {
      const version = database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()?.version;
      if (typeof version !== 'number') throw new Error('R3_RECOVERY_REQUIRED');
      if (version < (migrations.at(-1)?.version ?? 0)) {
        const directory = join(userDataPath, 'backups'); await mkdir(directory, { recursive: true });
        const destination = join(directory, `before-r3-${randomUUID()}.sqlite`);
        await backup(database, destination);
        const copy = new DatabaseSync(destination, { readOnly: true, allowExtension: false });
        try { if (copy.prepare('PRAGMA integrity_check').get()?.integrity_check !== 'ok' || copy.prepare('PRAGMA foreign_key_check').all().length) throw new Error('R3_RECOVERY_REQUIRED'); } finally { copy.close(); }
      }
    }
    runMigrations(database, new Date().toISOString());
    return { database, close: () => { if (database.isOpen) database.close(); } };
  } catch (error) { database.close(); throw error; }
}
