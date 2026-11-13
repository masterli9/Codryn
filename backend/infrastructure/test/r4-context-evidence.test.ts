import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { expect, it } from 'vitest';
import { r3ModelDescriptor, type ModelAdapter } from '@codryn/core';
import type { ModelRequest } from '@codryn/shared';
import { createR2Project } from '@codryn/test-support';
import { createR3Infrastructure } from '../src/create-r3-infrastructure.js';
import { createDesktopRuntimeFactory } from '../src/model/r3-runtime-factory.js';
import { scanRepoMap } from '../src/context/repo-map-scan.js';
import { ProjectFilesystem } from '../src/filesystem/project-filesystem.js';

const secret = 'SYNTHETIC_R4_CONTEXT_CANARY';
const visible = 'R4_VISIBLE_EXCERPT';
const cases = [
  { task: 'Najdi deklaraci GaugeWidget.', symbol: 'GaugeWidget', path: 'src/GaugeWidget.tsx' },
  { task: 'Najdi deklaraci parseConfig.', symbol: 'parseConfig', path: 'src/parseConfig.ts' }
] as const;

function deterministicTokenCount(text: string): number {
  return text.match(/[\p{L}\p{N}_]+|[^\s]/gu)?.length ?? 0;
}

it('opens the desktop project during a held scan and audits an explicit excerpt through the fake runtime', async () => {
  const fixture = await createR2Project('non-git');
  const signal = AbortSignal.timeout(30_000);
  let release = () => {};
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const requests: ModelRequest[] = [];
  const model: ModelAdapter = { descriptor: r3ModelDescriptor('demo'), async *stream(request) {
    requests.push(request);
    yield { type: 'text_delta', text: 'Hotovo.' };
    yield { type: 'completed' };
  } };
  const host = await createR3Infrastructure({
    userDataPath: fixture.userData,
    runtimeFactory: resources => createDesktopRuntimeFactory({ ...resources, userDataPath: fixture.userData, nodeExecutable: process.execPath, providerFactory: async () => ({ model, dispose() {} }) }),
    repoMapWorker: async request => { await barrier; return scanRepoMap(request, request.signal, request.report); }
  });
  try {
    await mkdir(join(fixture.root, 'src'));
    await writeFile(join(fixture.root, 'src', 'GaugeWidget.tsx'), `${visible}\n${'ě'.repeat(9_000)}`);
    await writeFile(join(fixture.root, '.env.local'), secret);
    await writeFile(join(fixture.root, '.codrynignore'), '!.env.local\n');

    const opening = performance.now();
    const project = await host.projects.open(fixture.root, signal);
    const openMs = performance.now() - opening;
    expect(host.contextMap.status(project.id).state).toBe('indexing');
    const chat = await host.chats.create(project.id, 'R4 audit');
    expect((await host.snapshot(chat.id, signal)).chat.id).toBe(chat.id);
    const references = await host.referenceSearch(project.id, chat.id, { query: 'GaugeWidget' }, signal);
    expect(references.items).toHaveLength(1);
    const before = performance.now();
    const submitted = await host.manager.submit({ requestId: randomUUID(), chatId: chat.id, mode: 'demo', maxSteps: 3, task: cases[0].task, references: references.items });
    expect((await host.manager.wait(submitted.jobId)).result?.status).toBe('completed');
    expect(requests).toHaveLength(1);
    expect(requests[0]?.context).toContainEqual(expect.objectContaining({ path: cases[0].path, reason: 'loaded_excerpt', byteLength: expect.any(Number), content: expect.stringContaining(visible) }));
    expect(JSON.stringify(requests)).not.toContain(secret);
    const detail = await host.inspectRun(chat.id, submitted.requestId, signal);
    expect(detail.contextAudit?.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'user_text', used: 1 }),
      expect.objectContaining({ source: 'project_reference', used: 1 }),
      expect.objectContaining({ source: 'loaded_excerpt', truncated: 1 }),
      expect.objectContaining({ source: 'repo_map', omitted: 1, reasons: ['map_building'] })
    ]));
    const audit = host.resources.database.prepare("SELECT payload_json FROM events WHERE session_id=? AND event_type='context.assembled'").all(detail.run.runId);
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain(visible);
    expect(JSON.stringify(audit)).not.toContain(secret);
    const executionMs = performance.now() - before;

    await writeFile(join(fixture.root, 'src', 'GaugeWidget.tsx'), 'New revision');
    await expect(host.manager.submit({ requestId: randomUUID(), chatId: chat.id, mode: 'demo', maxSteps: 3, task: cases[0].task, references: references.items })).rejects.toThrow();
    expect(requests).toHaveLength(1);
    await writeFile(join(fixture.root, '.codrynignore'), '# example\n[bad]\n');
    expect((await host.snapshot(chat.id, signal)).chat.id).toBe(chat.id);
    await expect(host.manager.submit({ requestId: randomUUID(), chatId: chat.id, mode: 'demo', maxSteps: 3, task: cases[0].task })).rejects.toMatchObject({ line: 2, reason: 'unsupported_character_class' });
    expect(requests).toHaveLength(1);

    release();
    await host.resources.repoMap.drain(signal);
    console.log(JSON.stringify({ profile: 'R4 held-worker desktop backend', openMs, executionMs, indexStateAtOpen: 'indexing', modelCalls: requests.length }));
  } finally { release(); await host.shutdown(AbortSignal.timeout(10_000)); host.close(); await fixture.close(); }
}, 45_000);

it('compares map and baseline for the fixed lookup cases with a deterministic fake model', async () => {
  const fixture = await createR2Project('non-git');
  const signal = AbortSignal.timeout(30_000);
  const host = await createR3Infrastructure({
    userDataPath: fixture.userData,
    runtimeFactory: () => async () => { throw new Error('This evaluation invokes the same map selector directly.'); },
    repoMapWorker: request => scanRepoMap(request, request.signal, request.report)
  });
  try {
    await mkdir(join(fixture.root, 'src'));
    for (const item of cases) await writeFile(join(fixture.root, item.path), `export function ${item.symbol}() {}\n`);
    const project = await host.projects.open(fixture.root, signal);
    await host.resources.repoMap.drain(signal);
    expect(host.contextMap.status(project.id).state).toBe('ready');

    const measurements = [];
    const filesystem = new ProjectFilesystem(fixture.root);
    for (const item of cases) {
      const selected = await host.resources.repoMap.deepen(project.id, item.task, [], signal);
      for (const withMap of [false, true]) {
        const hints = withMap ? selected.items.map(row => ({ path: row.path, symbols: row.symbols })) : [];
        const hintedPath = hints.find(hint => hint.symbols.includes(item.symbol))?.path;
        const prompt = JSON.stringify({ task: item.task, hints });
        // The fake takes a second turn after a literal lookup when the prompt has no answer.
        const lookup = hintedPath === undefined ? await filesystem.searchText({ query: `function ${item.symbol}` }, signal) : undefined;
        const answer = hintedPath ?? lookup?.matches[0]?.path;
        const followup = lookup === undefined ? '' : JSON.stringify({ task: item.task, matches: lookup.matches });
        measurements.push({ task: item.symbol, withMap, inputTokens: deterministicTokenCount(prompt) + deterministicTokenCount(followup),
          outputTokens: deterministicTokenCount(answer ?? '') + (lookup === undefined ? 0 : deterministicTokenCount(`function ${item.symbol}`)),
          steps: lookup === undefined ? 1 : 2, success: answer === item.path });
      }
    }
    expect(measurements).toHaveLength(cases.length * 2);
    expect(measurements.every(item => item.success)).toBe(true);
    console.log(JSON.stringify({ tokenizer: 'Unicode word plus punctuation tokens', profile: 'R4 fixed fake lookup', measurements }));
  } finally { await host.shutdown(AbortSignal.timeout(10_000)); host.close(); await fixture.close(); }
}, 45_000);
