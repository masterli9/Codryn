import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { SqliteWorkspaceStore } from '../src/persistence/sqlite-workspace-store.js';
import { runMigrations } from '../src/persistence/run-migrations.js';

it('records provenance, rejects stale revisions and makes a retried mutation idempotent across store restart', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    runMigrations(database, '2026-11-14T12:00:00.000Z');
    const store = new SqliteWorkspaceStore(database);
    const id = store.open('workspace', randomUUID()), mutationId = randomUUID();
    const initial = { fingerprint: 'a'.repeat(64), gitIdentity: null, complete: true };
    const first = await store.observe(id, initial);
    expect(first).toMatchObject({ changeSource: 'opened', observedAt: expect.any(String) });
    expect((await store.observe(id, initial)).revision).toBe(first.revision);
    const next = await store.advance(id, { changeSource: 'git', mutationId }, first.revision);
    expect(next).toMatchObject({ revision: first.revision + 1, changeSource: 'git', complete: false });
    expect((await new SqliteWorkspaceStore(database).advance(id, { changeSource: 'git', mutationId }, first.revision)).revision).toBe(next.revision);
    await expect(store.advance(id, { changeSource: 'git', mutationId: randomUUID() }, first.revision)).rejects.toThrow('R3_STALE_VIEW');
    expect(await store.observe(id, { ...initial, fingerprint: 'b'.repeat(64), gitIdentity: 'changed-head' })).toMatchObject({ changeSource: 'git_external' });
  } finally { database.close(); }
});
