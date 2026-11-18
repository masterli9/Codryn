import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { r3ModelDescriptor } from '@codryn/core';
import type { ModelAdapter } from '@codryn/core';
import { createR3Infrastructure } from '../src/create-r3-infrastructure.js';
import { createDesktopRuntimeFactory } from '../src/model/r3-runtime-factory.js';

const source = fileURLToPath(new URL('../../../tests/support/fixtures/r4-ts-project/', import.meta.url));
const hash = (content: string | Buffer) => createHash('sha256').update(content).digest('hex');
const relativeSource = 'src/discount.ts';

for (const mode of ['git', 'non-git'] as const) it(`approves, retries, invalidates and reverts a real TypeScript workflow (${mode})`, async () => {
  const handle = await realpath(await mkdtemp(join(tmpdir(), 'codryn-r4-verification-')));
  const root = join(handle, 'project'), userDataPath = join(handle, 'profile');
  const signal = AbortSignal.timeout(85_000);
  const git = (args: string[]) => execFileSync('git', args, { cwd: root, windowsHide: true, timeout: 6000, env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1' } });
  let host: Awaited<ReturnType<typeof createR3Infrastructure>> | undefined;
  try {
    await mkdir(root); await cp(source, root, { recursive: true });
    if (mode === 'git') {
      git(['init', '-b', 'main']);
      git(['-c', 'user.name=Codryn Test', '-c', 'user.email=test@example.invalid', 'add', '.']);
      git(['-c', 'user.name=Codryn Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'Fixture']);
    }
    const filepath = join(root, relativeSource), original = await readFile(filepath, 'utf8');
    const wrong = original.replace('return total;', 'return total - 5;');
    const commands = ['typecheck', 'test', 'typecheck', 'test', 'typecheck'] as const;
    let checks = 0, repairs = 0;
    const model: ModelAdapter = { descriptor: r3ModelDescriptor('demo'), async *stream(request) {
      const past = request.previousToolResults.at(-1);
      let call;
      if (!past || (checks === 2 && repairs === 0)) {
        const repair = !!past;
        if (repair) {
          expect(past).toMatchObject({ ok: true, output: { status: 'failed', exitCode: 1 } });
          repairs++;
        }
        call = { callId: randomUUID(), toolId: 'file.patch', toolVersion: 1, arguments: {
          path: relativeSource, expectedHash: hash(repair ? wrong : original),
          edits: [{ oldText: repair ? 'return total - 5;' : 'return total;', newText: repair ? 'return total - 10;' : 'return total - 5;' }]
        } };
      } else if (checks < commands.length) {
        const kind = commands[checks++];
        const command = request.recommendedChecks?.find(item => item.kind === kind && item.available)?.command;
        if (!command) throw new Error('Missing proposed check.');
        call = { callId: randomUUID(), toolId: 'command.run', toolVersion: 1, arguments: { command, reason: `Verify ${kind}.`, impact: 'Run the local fixture check.' } };
      }
      if (call) yield { type: 'tool_call', call };
      else yield { type: 'text_delta', text: 'Cena používá opravenou slevu.' };
      yield { type: 'completed' };
    } };
    host = await createR3Infrastructure({
      userDataPath, runtimeFactory: resources => createDesktopRuntimeFactory({
        ...resources, userDataPath, nodeExecutable: process.execPath, providerFactory: async () => ({ model, dispose() {} })
      })
    });
    const desktop = host;
    const project = await desktop.projects.open(root, signal), chat = await desktop.chats.create(project.id, 'Ověření slevy');
    const accepted = await desktop.manager.submit({ requestId: randomUUID(), chatId: chat.id, task: 'Oprav slevu na deset korun.', mode: 'demo', maxSteps: 16 });
    for (let attempt = 0; attempt < commands.length; attempt++) {
      let snapshot = await desktop.snapshot(chat.id, signal);
      while (!snapshot.permissions.length && snapshot.run?.phase !== 'failed' && snapshot.run?.state !== 'interrupted') {
        signal.throwIfAborted();
        await new Promise(resolve => setTimeout(resolve, 40));
        snapshot = await desktop.snapshot(chat.id, signal);
      }
      const permission = snapshot.permissions[0];
      if (!permission) throw new Error(JSON.stringify(snapshot.run));
      expect(desktop.resources.database.prepare('SELECT count(*) AS n FROM desktop_command_results').get()?.n).toBe(attempt);
      if (attempt === 1) expect(snapshot.verification?.status).toBe('partially_verified');
      if (attempt === 3) {
        expect(snapshot.verification?.status).toBe('partially_verified');
        await writeFile(join(root, 'src', 'Price.tsx'), '\n', { flag: 'a' });
      }
      if (attempt === 4) expect(snapshot.verification?.status).toBe('stale');
      expect(await desktop.answerPermission(chat.id, project.id, { id: permission.id, digest: permission.digest, decision: 'allow_once' })).toBe('accepted');
    }
    const finished = await desktop.manager.wait(accepted.jobId);
    expect(finished.result).toMatchObject({ status: 'completed', verification: { status: 'verified' } });
    let detail = await desktop.inspectRun(chat.id, accepted.requestId, signal);
    expect(detail.verification?.status).toBe('verified');
    expect(detail.verification?.checks.map(check => check.record.kind)).toEqual(['typecheck', 'test', 'typecheck', 'test', 'typecheck']);
    expect(detail.verification?.checks.some(check => check.record.result === 'failed')).toBe(true);
    await writeFile(join(handle, 'notes.md'), 'Independent edit outside the opened project.');
    detail = await desktop.inspectRun(chat.id, accepted.requestId, signal);
    expect(detail.verification?.status).toBe('verified');
    await writeFile(join(root, 'test-data.txt'), 'A generic test may read this new input.');
    expect((await desktop.inspectRun(chat.id, accepted.requestId, signal)).verification?.status).toBe('stale');
    const setId = detail.changes?.setId;
    if (!setId) throw new Error('Missing change set.');
    const diff = await desktop.diff(chat.id, setId, signal);
    expect(await desktop.revert({ chatId: chat.id, requestId: randomUUID(), setId, expectedSetSequence: diff.observedSetSequence,
      expectedWorkspaceRevision: diff.workspaceRevision }, signal)).toMatchObject({ status: 'reverted' });
    expect(hash(await readFile(filepath))).toBe(hash(original));
  } finally {
    if (host) { await host.shutdown(AbortSignal.timeout(10000)); host.close(); }
    await rm(handle, { recursive: true, force: true });
  }
}, 90000);
