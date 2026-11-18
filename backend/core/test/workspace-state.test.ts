import { expect, it } from 'vitest';
import { ResourceLocks } from '../src/workspace/resource-locks.js';

it('serializes the same key, runs independent keys and releases the queue on abort or failure', async () => {
  const locks = new ResourceLocks(), order: string[] = [];
  const signal = new AbortController().signal, abort = new AbortController();
  let release: () => void = () => undefined;
  const gate = new Promise<void>(done => { release = done; });
  const first = locks.withKey('a', signal, async () => { order.push('first'); await gate; throw new Error('failure'); });
  const interrupted = locks.withKey('a', abort.signal, async () => { order.push('unexpected'); });
  const last = locks.withKey('a', signal, async () => { order.push('last'); });
  await locks.withKey('b', signal, async () => { order.push('independent'); });
  abort.abort();
  await expect(interrupted).rejects.toThrow();
  expect(order).toEqual(['first', 'independent']);
  const failed = expect(first).rejects.toThrow('failure');
  release();
  await failed;
  await last;
  expect(order).toEqual(['first', 'independent', 'last']);
});
