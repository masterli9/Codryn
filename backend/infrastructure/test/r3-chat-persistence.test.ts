import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, it } from 'vitest';
import { openR0Database, runMigrations, SqliteWorkspaceStore, migrations } from '../src/index.js';
import { SqliteChatStore } from '../src/persistence/sqlite-chat-store.js';
import { SqliteDesktopRequestStore } from '../src/persistence/sqlite-desktop-request-store.js';
import { SqliteDesktopProjectStore } from '../src/persistence/sqlite-desktop-project-store.js';
import { openDesktopDatabase } from '../src/persistence/open-desktop-database.js';
import type { ModelDescriptor, R3SubmitInput } from '@codryn/shared';
const now = '2026-10-11T10:00:00Z';
const clock = { now: () => now }; const ids = { next: () => randomUUID() };
const model: ModelDescriptor = { adapterId: 'demo', modelId: 'demo', capabilities: { streaming: 'supported', toolCalling: 'supported', structuredOutput: 'unsupported', imageInput: 'unsupported', usageMetadata: 'unknown', contextLimit: 'unknown', compaction: 'unsupported' } };
const roots: string[] = []; const databases: DatabaseSync[] = [];
afterEach(async () => { for (const db of databases.splice(0)) if (db.isOpen) db.close(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'codryn-r3-data-')); roots.push(root);
  const db = openR0Database(join(root, 'codryn.sqlite')); databases.push(db); runMigrations(db, now);
  const projectId = new SqliteWorkspaceStore(db).open(root, randomUUID());
  const projects = new SqliteDesktopProjectStore(db, clock); await projects.remember(projectId, root, 'Fixture');
  const chats = new SqliteChatStore(db, clock, ids); const chat = await chats.create(projectId, 'Chat');
  const requests = new SqliteDesktopRequestStore(db, clock, ids);
  const input: R3SubmitInput = { requestId: randomUUID(), chatId: chat.id, task: 'Oprav součet', mode: 'demo', maxSteps: 16 };
  return { root, db, projectId, projects, chats, chat, requests, input };
}
it('atomically deduplicates acceptance and rejects changed request content and active project', async () => {
  const f = await fixture(); const first = await f.requests.accept(f.input, f.projectId, model);
  expect(await f.requests.accept(f.input, f.projectId, model)).toEqual({ ...first, duplicate: true });
  await expect(f.requests.accept({ ...f.input, task: 'Different' }, f.projectId, model)).rejects.toThrow('R3_REQUEST_MISMATCH');
  await expect(f.requests.accept({ ...f.input, requestId: randomUUID() }, f.projectId, model)).rejects.toThrow('R3_PROJECT_BUSY');
  expect(f.db.prepare('SELECT count(*) AS n FROM chat_messages').get()?.n).toBe(1);
  expect(f.db.prepare('SELECT count(*) AS n FROM desktop_jobs').get()?.n).toBe(1);
  await expect(f.chats.archive(f.chat.id)).rejects.toThrow('R3_PROJECT_BUSY');
});
it('rolls back the message and job together on a real SQLite failure', async () => {
  const f = await fixture();
  f.db.exec("CREATE TRIGGER inject_failure BEFORE INSERT ON chat_messages BEGIN SELECT RAISE(ABORT, 'injected'); END;");
  await expect(f.requests.accept(f.input, f.projectId, model)).rejects.toThrow('injected');
  expect(f.db.prepare('SELECT count(*) AS n FROM desktop_jobs').get()?.n).toBe(0);
  expect(f.db.prepare('SELECT count(*) AS n FROM chat_messages').get()?.n).toBe(0);
});
it('preserves archived chats and immutable request metadata across reopen without replay', async () => {
  const f = await fixture(); const accepted = await f.requests.accept(f.input, f.projectId, model);
  f.db.close(); const db = openR0Database(join(f.root, 'codryn.sqlite')); databases.push(db); runMigrations(db, now);
  const requests = new SqliteDesktopRequestStore(db, clock, ids); await requests.interruptUnfinished(f.projectId);
  expect((await requests.get(accepted.jobId))?.state).toBe('interrupted');
  expect((await requests.get(accepted.jobId))?.model).toEqual(model);
  const chats = new SqliteChatStore(db, clock, ids); await chats.archive(f.chat.id);
  expect((await chats.list(f.projectId, true))[0]?.archived).toBe(true);
  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  await expect(requests.accept({ ...f.input, requestId: randomUUID() }, randomUUID(), model)).rejects.toThrow();
});
it('rejects a retry parent from another chat', async () => {
  const f = await fixture(); const first = await f.requests.accept(f.input, f.projectId, model); await f.requests.interruptUnfinished(f.projectId);
  const other = await f.chats.create(f.projectId, 'Other');
  await expect(f.requests.accept({ ...f.input, chatId: other.id, requestId: randomUUID(), retryOfRequestId: first.requestId }, f.projectId, model)).rejects.toThrow('R3_REQUEST_MISMATCH');
});
it('backs up a legacy WAL database before upgrade and preserves all legacy checksums', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codryn-r3-upgrade-')); roots.push(root);
  const filename = join(root, 'codryn.sqlite'); const old = openR0Database(filename); databases.push(old);
  for (const migration of migrations.filter(m => m.version <= 9)) {
    old.exec(migration.sql); old.prepare('INSERT INTO schema_migrations VALUES (?, ?, ?, ?)').run(migration.version, migration.name, migration.checksum, now);
  }
  old.prepare("INSERT INTO sessions VALUES (?, 'diagnostic', ?, ?)").run('11111111-1111-4111-8111-111111111111', now, now);
  old.prepare("INSERT INTO diagnostic_sessions VALUES (?, 'created', ?, ?)").run('11111111-1111-4111-8111-111111111111', now, now);
  const handle = await openDesktopDatabase(root); databases.push(handle.database);
  expect(handle.database.prepare('SELECT count(*) AS n FROM diagnostic_sessions').get()?.n).toBe(1);
  expect(handle.database.prepare('SELECT version, checksum FROM schema_migrations WHERE version <= 9 ORDER BY version').all()).toEqual(migrations.filter(m => m.version <= 9).map(m => ({ version: m.version, checksum: m.checksum })));
  expect(handle.database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});
