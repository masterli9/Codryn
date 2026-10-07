import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Clock, IdGenerator } from '../src/diagnostics/ports.js';
import { PermissionService } from '../src/permissions/permission-service.js';
import type { PermissionStore } from '../src/permissions/ports.js';
import type { PermissionView } from '@codryn/shared';

const projectId = '40000000-0000-4000-8000-000000000201';
const runId = '40000000-0000-4000-8000-000000000202';
const callId = '40000000-0000-4000-8000-000000000203';
const permissionId = '40000000-0000-4000-8000-000000000204';

class MemoryPermissionStore implements PermissionStore {
  readonly values = new Map<string, PermissionView>();
  readonly claims = new Set<string>();

  async create(request: PermissionView): Promise<void> { this.values.set(request.id, request); }
  async get(id: string): Promise<PermissionView | null> { return this.values.get(id) ?? null; }
  async decide(input: { id: string; digest: string; decision: 'allow_once' | 'deny' }): Promise<'accepted' | 'duplicate' | 'rejected'> {
    const request = this.values.get(input.id);
    if (request === undefined || request.digest !== input.digest) return 'rejected';
    if (request.state !== 'pending') return request.state === (input.decision === 'allow_once' ? 'allowed_once' : 'denied') ? 'duplicate' : 'rejected';
    this.values.set(request.id, { ...request, state: input.decision === 'allow_once' ? 'allowed_once' : 'denied' });
    return 'accepted';
  }
  async claim(id: string, digest: string): Promise<boolean> {
    const request = this.values.get(id);
    if (request === undefined || request.digest !== digest || request.state !== 'allowed_once' || this.claims.has(id)) return false;
    this.claims.add(id);
    return true;
  }
  async closePending(id: string, state: 'expired' | 'cancelled'): Promise<boolean> {
    const request = this.values.get(id);
    if (request === undefined || request.state !== 'pending') return false;
    this.values.set(id, { ...request, state });
    return true;
  }
}

function createPermissionFixture() {
  const store = new MemoryPermissionStore();
  const ids: IdGenerator = { next: () => permissionId as `${string}-${string}-${string}-${string}-${string}` };
  const clock: Clock = { now: () => '2026-09-06T11:00:00.000Z' };
  const service = new PermissionService({
    store,
    calls: { findBinding: async () => ({ callId, runId, projectId }) },
    ids,
    clock,
    digest: (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
  });
  return { service, store };
}

describe('PermissionService', () => {
  it('approval and execution claim cannot be consumed twice', async () => {
    const { service, store } = createPermissionFixture();
    const request = await service.request({
      callId,
      command: { executable: 'node', args: ['--version'], cwd: 'C:\\project', timeoutMs: 30_000, maxOutputBytes: 256 * 1024 },
      reason: 'Run the approved project check.',
      impact: 'The command may read project files.'
    });
    const input = { id: request.id, digest: request.digest, decision: 'allow_once' as const };
    expect(await service.decide(input)).toBe('accepted');
    expect(await service.decide(input)).toBe('duplicate');
    expect(await service.claim(request.id, request.digest)).toBe(true);
    expect(await service.claim(request.id, request.digest)).toBe(false);
    expect(store.values.get(request.id)?.state).toBe('allowed_once');
  });

  it('rejects a secret-looking command before creating a request', async () => {
    const { service, store } = createPermissionFixture();
    await expect(service.request({
      callId,
      command: { executable: 'node', args: ['OPENAI_API_KEY=CANARY'], cwd: 'C:\\project', timeoutMs: 30_000, maxOutputBytes: 1024 },
      reason: 'test',
      impact: 'test'
    })).rejects.toThrow('R2_PERMISSION_SECRET_INPUT');
    expect(store.values).toHaveLength(0);
  });
});
