import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { SubscriptionService } from '../src/desktop/subscription-service.js';
import type { R3Snapshot, R3Update } from '@codryn/shared';
const id = randomUUID();
it('registers before snapshot and suppresses changes already included in its cursor', async () => {
  let cursor = 0; const updates: R3Update[] = [];
  const service = new SubscriptionService({ snapshot: async () => { updates.push({ kind: 'refresh', chatId: id, cursor: ++cursor }); return { cursor } as R3Snapshot; }, updates: async (_chatId, after) => updates.filter(u => u.cursor > after) }, { next: randomUUID });
  const received: R3Update[] = [];
  const attached = await service.attach(id, 0, update => received.push(update));
  expect(attached.snapshot.cursor).toBe(1); await service.drain(); expect(received).toEqual([]);
  updates.push({ kind: 'refresh', chatId: id, cursor: ++cursor }); await service.drain(); expect(received.map(u => u.cursor)).toEqual([2]);
  service.detach(attached.id); service.detach(attached.id); service.close();
});
it('resyncs a subscriber whose backlog exceeds 256 events and leaves other clients usable', async () => {
  const updates = Array.from({ length: 257 }, (_, i): R3Update => ({ kind: 'refresh', chatId: id, cursor: i + 1 }));
  const service = new SubscriptionService({ snapshot: async () => ({ cursor: 0 }) as R3Snapshot, updates: async (_chatId, after, limit) => updates.filter(u => u.cursor > after).slice(0, limit) }, { next: randomUUID });
  const received: R3Update[] = []; await service.attach(id, 0, update => received.push(update)); await service.drain();
  expect(received).toEqual([{ kind: 'resync_required', chatId: id, cursor: 257 }]); await service.drain(); expect(received).toHaveLength(1); service.close();
});
