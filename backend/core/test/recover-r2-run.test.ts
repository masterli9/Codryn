import { describe, expect, it, vi } from 'vitest';
import { RecoverR2Run } from '../src/index.js';

describe('RecoverR2Run', () => {
  it('expires unclaimed approvals, returns pending approvals, and marks in-flight effects without replaying a model', async () => {
    const order: string[] = [];
    const recover = new RecoverR2Run({
      permissions: {
        async expireAllowedUnclaimed() { order.push('expire'); return ['11111111-1111-4111-8111-111111111111']; },
        async listPending() {
          order.push('list');
          return [{
            id: '22222222-2222-4222-8222-222222222222',
            callId: '33333333-3333-4333-8333-333333333333',
            digest: 'a'.repeat(64),
            command: { executable: 'node', args: [], cwd: 'C:\\project', timeoutMs: 1_000, maxOutputBytes: 1_024 },
            reason: 'test',
            impact: 'test',
            state: 'pending'
          }];
        }
      },
      toolCalls: { async recoverInFlight() { order.push('tool-calls'); return 1; } },
      mutations: { async execute() { order.push('mutations'); } }
    });
    const result = await recover.execute('44444444-4444-4444-8444-444444444444', new AbortController().signal);
    expect(result).toMatchObject({
      expiredPermissionIds: ['11111111-1111-4111-8111-111111111111'],
      recoveredToolCalls: 1,
      pendingPermissions: [{ state: 'pending' }]
    });
    expect(order).toEqual(['expire', 'list', 'tool-calls', 'mutations']);
  });

  it('propagates cancellation to mutation recovery without invoking a model', async () => {
    const execute = vi.fn(async (_projectId: string, signal: AbortSignal) => {
      if (signal.aborted) throw new DOMException('The operation was aborted', 'AbortError');
    });
    const controller = new AbortController();
    controller.abort();
    const recover = new RecoverR2Run({ mutations: { execute } });
    await expect(recover.execute('44444444-4444-4444-8444-444444444444', controller.signal)).rejects.toThrow();
    expect(execute).toHaveBeenCalledOnce();
  });
});
