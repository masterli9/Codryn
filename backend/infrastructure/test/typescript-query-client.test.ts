import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { TypeScriptQueryClient } from '../src/typescript/typescript-query-client.js';

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); });

async function fixture(script: string, timeoutMs = 5000) {
  const root = await mkdtemp(join(tmpdir(), 'codryn-ts-worker-'));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const file = join(root, 'worker.cjs');
  await writeFile(file, `const { parentPort, workerData } = require('node:worker_threads'); ${script}`);
  const client = new TypeScriptQueryClient(file, { timeoutMs });
  cleanup.unshift(() => client.close());
  return { client, query: (signal = new AbortController().signal) => client.query(root, { kind: 'exports', path: 'app.ts', maxResults: 20 }, 3, signal) };
}

it.each([
  ['throw new Error("CRASH");', 'worker_failed'],
  ['parentPort.postMessage({ unexpected: true });', 'worker_failed'],
  ['parentPort.postMessage("x".repeat(40000));', 'worker_failed'],
  ['while (true) {}', 'worker_timeout']
] as const)('contains an invalid reply, crash or CPU-bound timeout', async (script, reason) => {
  const { query } = await fixture(script, 500);
  expect(await query()).toMatchObject({ status: 'limited', items: [], revision: 3, reason });
});

it('terminates on abort, closes all active workers and rejects calls after close', async () => {
  const { client, query } = await fixture('while (true) {}');
  const controller = new AbortController();
  const pending = query(controller.signal);
  controller.abort();
  expect(await pending).toMatchObject({ reason: 'cancelled' });
  const another = query();
  await client.close();
  expect(await another).toMatchObject({ reason: 'cancelled' });
  expect(await query()).toMatchObject({ reason: 'cancelled' });
});
