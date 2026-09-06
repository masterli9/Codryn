import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import type { Lease, LeaseStore } from '@codryn/core';

const leaseDurationMs = 30_000;

interface LeaseRow {
  readonly resource_key: SQLOutputValue;
  readonly owner: SQLOutputValue;
  readonly fence: SQLOutputValue;
  readonly expires_at: SQLOutputValue;
  readonly effect_active: SQLOutputValue;
}

function validText(value: string, code: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048 || value.includes('\0')) throw new TypeError(code);
  return value;
}

function validNow(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('R2_LEASE_TIME_INVALID');
  return value;
}

function rowLease(row: LeaseRow): Lease {
  if (typeof row.resource_key !== 'string' || typeof row.owner !== 'string'
    || typeof row.fence !== 'number' || !Number.isSafeInteger(row.fence) || row.fence < 1
    || typeof row.expires_at !== 'number' || !Number.isSafeInteger(row.expires_at)
    || (row.effect_active !== 0 && row.effect_active !== 1)) {
    throw new TypeError('R2_LEASE_ROW_INVALID');
  }
  return { key: row.resource_key, owner: row.owner, fence: row.fence, expiresAt: row.expires_at };
}

function rollback(database: DatabaseSync, started: boolean): void {
  if (!started) return;
  try { if (database.isTransaction) database.exec('ROLLBACK;'); }
  catch { /* Preserve the primary lease error. */ }
}

function leaseRow(database: DatabaseSync, key: string): LeaseRow | undefined {
  return database.prepare(`SELECT resource_key, owner, fence, expires_at, effect_active
    FROM resource_leases WHERE resource_key = ?`).get(key) as LeaseRow | undefined;
}

export class SqliteLeaseStore implements LeaseStore {
  constructor(private readonly database: DatabaseSync) {}

  async acquire(keyInput: string, ownerInput: string, nowInput: number): Promise<Lease | null> {
    const key = validText(keyInput, 'R2_LEASE_KEY_INVALID');
    const owner = validText(ownerInput, 'R2_LEASE_OWNER_INVALID');
    const now = validNow(nowInput);
    let started = false;
    try {
      this.database.exec('BEGIN IMMEDIATE;');
      started = true;
      const current = leaseRow(this.database, key);
      if (current === undefined) {
        this.database.prepare(`INSERT INTO resource_leases
          (resource_key, owner, fence, expires_at, effect_active)
          VALUES (?, ?, 1, ?, 0)`).run(key, owner, now + leaseDurationMs);
        this.database.exec('COMMIT;');
        started = false;
        return { key, owner, fence: 1, expiresAt: now + leaseDurationMs };
      }
      const lease = rowLease(current);
      if (lease.owner === owner && lease.expiresAt > now) {
        this.database.exec('COMMIT;');
        started = false;
        return lease;
      }
      if (lease.expiresAt > now || current.effect_active === 1) {
        this.database.exec('ROLLBACK;');
        started = false;
        return null;
      }
      const nextFence = lease.fence + 1;
      if (!Number.isSafeInteger(nextFence)) throw new Error('R2_LEASE_FENCE_EXHAUSTED');
      const update = this.database.prepare(`UPDATE resource_leases SET
        owner = ?, fence = ?, expires_at = ?, effect_active = 0
        WHERE resource_key = ? AND owner = ? AND fence = ? AND effect_active = 0`).run(
        owner, nextFence, now + leaseDurationMs, key, lease.owner, lease.fence
      );
      if (update.changes !== 1) throw new Error('R2_LEASE_ACQUIRE_RACE');
      this.database.exec('COMMIT;');
      started = false;
      return { key, owner, fence: nextFence, expiresAt: now + leaseDurationMs };
    } catch (error) {
      rollback(this.database, started);
      throw error;
    }
  }

  async renew(input: Lease, nowInput: number): Promise<Lease | null> {
    const lease = this.validateLease(input);
    const now = validNow(nowInput);
    let started = false;
    try {
      this.database.exec('BEGIN IMMEDIATE;');
      started = true;
      const update = this.database.prepare(`UPDATE resource_leases SET expires_at = ?
        WHERE resource_key = ? AND owner = ? AND fence = ? AND expires_at > ?`).run(
        now + leaseDurationMs, lease.key, lease.owner, lease.fence, now
      );
      if (update.changes !== 1) {
        this.database.exec('ROLLBACK;');
        started = false;
        return null;
      }
      this.database.exec('COMMIT;');
      started = false;
      return { ...lease, expiresAt: now + leaseDurationMs };
    } catch (error) {
      rollback(this.database, started);
      throw error;
    }
  }

  async release(input: Lease): Promise<boolean> {
    const lease = this.validateLease(input);
    let started = false;
    try {
      this.database.exec('BEGIN IMMEDIATE;');
      started = true;
      const update = this.database.prepare(`DELETE FROM resource_leases
        WHERE resource_key = ? AND owner = ? AND fence = ? AND effect_active = 0`).run(
        lease.key, lease.owner, lease.fence
      );
      if (update.changes === 0) {
        this.database.exec('ROLLBACK;');
        started = false;
        return false;
      }
      this.database.exec('COMMIT;');
      started = false;
      return true;
    } catch (error) {
      rollback(this.database, started);
      throw error;
    }
  }

  async markEffect(input: Lease, active: boolean, nowInput?: number): Promise<boolean> {
    const lease = this.validateLease(input);
    const now = nowInput === undefined ? Date.now() : validNow(nowInput);
    let started = false;
    try {
      this.database.exec('BEGIN IMMEDIATE;');
      started = true;
      const where = active
        ? 'resource_key = ? AND owner = ? AND fence = ? AND expires_at > ? AND effect_active = 0'
        : 'resource_key = ? AND owner = ? AND fence = ? AND effect_active = 1';
      const args = active
        ? [lease.key, lease.owner, lease.fence, now]
        : [lease.key, lease.owner, lease.fence];
      const update = this.database.prepare(`UPDATE resource_leases SET effect_active = ? WHERE ${where}`)
        .run(active ? 1 : 0, ...args);
      if (update.changes !== 1) {
        this.database.exec('ROLLBACK;');
        started = false;
        return false;
      }
      this.database.exec('COMMIT;');
      started = false;
      return true;
    } catch (error) {
      rollback(this.database, started);
      throw error;
    }
  }

  private validateLease(input: Lease): Lease {
    if (typeof input !== 'object' || input === null) throw new TypeError('R2_LEASE_INVALID');
    const key = validText(input.key, 'R2_LEASE_KEY_INVALID');
    const owner = validText(input.owner, 'R2_LEASE_OWNER_INVALID');
    if (!Number.isSafeInteger(input.fence) || input.fence < 1 || !Number.isSafeInteger(input.expiresAt) || input.expiresAt < 0) {
      throw new TypeError('R2_LEASE_INVALID');
    }
    return { key, owner, fence: input.fence, expiresAt: input.expiresAt };
  }
}
