import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SqliteLeaseStore } from '../src/persistence/sqlite-lease-store.js';
import { openR0Database } from '../src/persistence/open-database.js';
import { runMigrations } from '../src/persistence/run-migrations.js';

describe('SqliteLeaseStore', () => {
  it('uses fencing and never hands an active expired effect to a new owner', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codryn-r2-lease-'));
    const database = openR0Database(join(directory, 'codryn.sqlite'));
    try {
      runMigrations(database, '2026-09-06T10:00:00.000Z');
      const store = new SqliteLeaseStore(database);
      const first = await store.acquire('worktree:E:/fixture', 'owner-a', 0);
      expect(first).toMatchObject({ owner: 'owner-a', fence: 1, expiresAt: 30_000 });
      if (first === null) throw new Error('Expected first lease');
      expect(await store.acquire(first.key, 'owner-b', 1_000)).toBeNull();
      expect(await store.markEffect(first, true, 1_000)).toBe(true);
      expect(await store.release(first)).toBe(false);
      expect(await store.acquire(first.key, 'owner-b', 31_000)).toBeNull();
      expect(await store.markEffect(first, false)).toBe(true);
      const second = await store.acquire(first.key, 'owner-b', 31_000);
      expect(second).toMatchObject({ owner: 'owner-b', fence: 2 });
      expect(await store.release(first)).toBe(false);
      if (second === null) throw new Error('Expected second lease');
      expect(await store.release(second)).toBe(true);
    } finally {
      database.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
