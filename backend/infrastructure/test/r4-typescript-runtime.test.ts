import { randomUUID } from 'node:crypto';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { r3ModelDescriptor } from '@codryn/core';
import type { ModelAdapter, WorkspaceSnapshot } from '@codryn/core';
import { ContextPathPolicy } from '../src/filesystem/context-path-policy.js';
import { FileWorkspaceObserver } from '../src/filesystem/workspace-observer.js';
import { freshTypeScriptQuery } from '../src/typescript/fresh-typescript-query.js';
import { executeTypeScriptQuery } from '../src/typescript/typescript-query-engine.js';
import type { TypeScriptQueryRunner } from '../src/typescript/typescript-query-client.js';
import { createR3Infrastructure } from '../src/create-r3-infrastructure.js';
import { createDesktopRuntimeFactory } from '../src/model/r3-runtime-factory.js';

it('withholds stale output across an edit and returns fresh or denied data on the next query', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'codryn-ts-fresh-'))), observer = new FileWorkspaceObserver(root);
  const signal = AbortSignal.timeout(15000);
  const source = join(root, 'app.ts');
  let revision = 1, last: WorkspaceSnapshot | undefined, change = true;
  const observe = async (signal: AbortSignal) => {
    const next = await observer.inspect(signal);
    if (last && next.fingerprint !== last.fingerprint) revision++;
    return last = { ...next, revision };
  };
  const runner: TypeScriptQueryRunner = { async query(root, input, expectedRevision, signal) {
    const result = await executeTypeScriptQuery(input, { root, expectedRevision, signal, policy: await ContextPathPolicy.fromProjectRoot(root) });
    if (change) {
      change = false;
      await writeFile(source, 'export const updated = 2;\n');
    }
    return result;
  } };
  try {
    await writeFile(source, 'export const original = 1;\n');
    await writeFile(join(root, 'tsconfig.json'), '{"files":["app.ts"],"compilerOptions":{"types":[]}}');
    const query = freshTypeScriptQuery(root, runner, observe), input = { kind: 'exports' as const, path: 'app.ts', maxResults: 20 };
    expect(await query(input, signal)).toMatchObject({ status: 'stale', items: [] });
    expect(await query(input, signal)).toMatchObject({ status: 'ok', items: [{ name: 'updated' }] });
    await writeFile(join(root, 'tsconfig.json'), '{');
    expect(await query(input, signal)).toMatchObject({ status: 'limited', mode: 'fallback', reason: 'invalid_config' });
    await writeFile(join(root, '.codrynignore'), 'app.ts\n');
    expect(await query(input, signal)).toMatchObject({ status: 'unsupported', items: [] });
  } finally { observer.close(); await rm(root, { recursive: true, force: true }); }
}, 20000);

it('keeps normal read and search tools available in the desktop run after a structural worker failure', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'codryn-ts-runtime-'))), userDataPath = join(root, 'user-data');
  const signal = AbortSignal.timeout(18000), received: string[] = [];
  const model: ModelAdapter = { descriptor: r3ModelDescriptor('demo'), async *stream(request) {
    expect(request.tools.map(tool => tool.toolId)).toContain('typescript.query');
    const previous = request.previousToolResults.at(-1);
    if (previous?.ok) received.push(JSON.stringify(previous.output));
    const next = [
      { toolId: 'typescript.query', arguments: { kind: 'exports', path: 'app.ts' } },
      { toolId: 'file.read', arguments: { path: 'app.ts' } },
      { toolId: 'text.search', arguments: { path: '.', query: 'constant' } }
    ][request.previousToolResults.length];
    if (next) yield { type: 'tool_call', call: { callId: randomUUID(), toolVersion: 1, ...next } };
    else yield { type: 'text_delta', text: 'Hotovo.' };
    yield { type: 'completed' };
  } };
  let host: Awaited<ReturnType<typeof createR3Infrastructure>> | undefined;
  try {
    await writeFile(join(root, 'app.ts'), 'export const constant = 1;\n');
    host = await createR3Infrastructure({ userDataPath, runtimeFactory: resources => createDesktopRuntimeFactory({
      ...resources, userDataPath, nodeExecutable: process.execPath, providerFactory: async () => ({ model, dispose() {} }),
      typescriptQueries: { async query() { throw new Error('Simulated worker error'); } }
    }) });
    const project = await host.projects.open(root, signal), chat = await host.chats.create(project.id, 'Structural');
    const accepted = await host.manager.submit({ requestId: randomUUID(), chatId: chat.id, task: 'Prohlédni zdroj.', mode: 'demo', maxSteps: 8 });
    expect((await host.manager.wait(accepted.jobId)).result?.status).toBe('completed');
    expect(received[0]).toContain('worker_failed');
    expect(received[1]).toContain('export const constant');
    expect(received[2]).toContain('matches');
    expect((await host.inspectRun(chat.id, accepted.requestId, signal)).activity.some(item => item.type === 'tool_call.received' && item.details.some(detail => detail.value === 'typescript.query'))).toBe(true);
    expect(host.resources.database.prepare('SELECT count(*) AS n FROM permission_requests').get()?.n).toBe(0);
  } finally {
    if (host) { await host.shutdown(AbortSignal.timeout(10000)); host.close(); }
    await rm(root, { recursive: true, force: true });
  }
}, 25000);
