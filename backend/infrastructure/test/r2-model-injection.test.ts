import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createR2Infrastructure, ScriptedModelAdapter, changeVerifyReturnScenario } from '../src/index.js';
import { createR2Project } from '@codryn/test-support';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { WindowsGuardedWriter } from '../src/filesystem/windows-guarded-writer.js';
import { R2CommandRunner } from '../src/process/r2-command-runner.js';
import { ProjectGitState } from '../src/git/project-git-state.js';
import { openR0Database } from '../src/persistence/open-database.js';

// Lifecycle regressions use deterministic OS boundaries; separate host suites prove guards/process ownership.
function deterministicBoundaries(root: string) {
  vi.spyOn(WindowsGuardedWriter.prototype, 'open').mockImplementation(async (path, expectedHash) => {
    const bytes = await readFile(`${root}/${path}`);
    if (createHash('sha256').update(bytes).digest('hex') !== expectedHash) throw new Error('R2_PATCH_STALE');
    return { bytes, publish: async (value) => { await writeFile(`${root}/${path}`, value); }, close: async () => {} };
  });
  vi.spyOn(R2CommandRunner.prototype, 'run').mockResolvedValue({ status: 'succeeded', exitCode: 0,
    stdout: '', stderr: '', treeStopped: true, truncated: false, durationMs: 1 });
}

afterEach(() => vi.restoreAllMocks());

describe('R2 infrastructure model composition', () => {
  it('rejects foreign revert and recovery in a shared database without changing either project', async () => {
    const a = await createR2Project('non-git');
    const b = await createR2Project('non-git');
    deterministicBoundaries(b.root);
    const options = { userDataPath: a.userData, permissionResponder: async () => 'allow_once' as const };
    const first = await createR2Infrastructure({ ...options, projectRoot: a.root,
      scenario: { id: 'empty', steps: [{ assertRequest: () => {}, events: [{ type: 'text_delta', text: 'No changes' }, { type: 'completed' }] }] } });
    const second = await createR2Infrastructure({ ...options, projectRoot: b.root, scenario: 'change-verify-return' });
    const signal = new AbortController().signal;
    try {
      await first.agentLoop.executeR2({ requestId: randomUUID(), projectRoot: a.root,
        task: 'No changes', contextReferences: [], maxSteps: 8 }, signal);
      const result = await second.agentLoop.executeR2({ requestId: randomUUID(), projectRoot: b.root,
        task: 'Repair sum', contextReferences: [], maxSteps: 8 }, signal);
      if (result.changeSetId === null) throw new Error('Expected foreign change set');
      const bytes = await readFile(`${b.root}/sum.mjs`);
      await writeFile(`${a.root}/sum.mjs`, bytes);
      deterministicBoundaries(a.root);
      const db = openR0Database(`${a.userData}/codryn.sqlite`);
      try {
        const states = db.prepare('SELECT * FROM change_sets ORDER BY id').all();
        const intents = db.prepare('SELECT * FROM mutation_intents ORDER BY operation_id').all();
        await expect(first.changes.revert.execute({ setId: result.changeSetId, requestId: randomUUID() }, signal))
          .rejects.toThrow('R2_CHANGE_SET_PROJECT_MISMATCH');
        await expect(first.recover.execute(second.projectId, signal)).rejects.toThrow('R2_RECOVERY_PROJECT_MISMATCH');
        expect(await readFile(`${a.root}/sum.mjs`)).toEqual(bytes);
        expect(await readFile(`${b.root}/sum.mjs`)).toEqual(bytes);
        expect(db.prepare('SELECT * FROM change_sets ORDER BY id').all()).toEqual(states);
        expect(db.prepare('SELECT * FROM mutation_intents ORDER BY operation_id').all()).toEqual(intents);
      } finally { db.close(); }
    } finally { first.close(); second.close(); await a.close(); await b.close(); }
  }, 30_000);

  it.each(['sum.test.mjs', 'sum.mjs'])('does not verify when %s is excluded from observation', async (excluded) => {
    const fixture = await createR2Project('non-git');
    deterministicBoundaries(fixture.root);
    const infra = await createR2Infrastructure({ projectRoot: fixture.root, userDataPath: fixture.userData,
      scenario: 'change-verify-return', permissionResponder: async () => 'allow_once',
      onPatch: async () => { await writeFile(`${fixture.root}/.codrynignore`, excluded); } });
    try {
      const result = await infra.agentLoop.executeR2({ requestId: randomUUID(), projectRoot: fixture.root,
        task: 'Repair sum', contextReferences: [], maxSteps: 8 }, new AbortController().signal);
      expect(result.verification.status).toBe('unverified');
    } finally { infra.close(); await fixture.close(); }
  }, 30_000);
  it.each(['trusted', 'arbitrary', 'rewritten-test'] as const)('uses backend verification policy for %s commands', async (mode) => {
    const fixture = await createR2Project('non-git');
    deterministicBoundaries(fixture.root);
    const expectedHash = createHash('sha256').update(await readFile(`${fixture.root}/sum.mjs`)).digest('hex');
    const scenario = changeVerifyReturnScenario({ expectedHash, projectRoot: fixture.root });
    const steps = scenario.steps.map((step) => ({ ...step, events: step.events.map((event) =>
      mode === 'arbitrary' && event.type === 'tool_call' && event.call.toolId === 'command.run'
        ? { ...event, call: { ...event.call, arguments: { command: { executable: process.execPath,
          args: ['-e', 'process.exit(0)'], cwd: fixture.root, timeoutMs: 1000, maxOutputBytes: 1024 },
          reason: 'Claimed verification', impact: 'Runs a command' } } } : event) }));
    if (mode === 'rewritten-test') await writeFile(`${fixture.root}/sum.test.mjs`, 'process.exit(0);');
    const infra = await createR2Infrastructure({ projectRoot: fixture.root, userDataPath: fixture.userData,
      scenario: { ...scenario, steps }, permissionResponder: async () => 'allow_once' });
    try {
      const result = await infra.agentLoop.executeR2({ requestId: randomUUID(), projectRoot: fixture.root,
        task: 'Repair sum', contextReferences: [], maxSteps: 8 }, new AbortController().signal);
      expect(result.verification.status).toBe(mode === 'trusted' ? 'verified' : 'unverified');
    } finally { infra.close(); await fixture.close(); }
  }, 30_000);
  it('keeps recovery pending when the file cannot be read as a regular text file', async () => {
    const fixture = await createR2Project('non-git');
    deterministicBoundaries(fixture.root);
    const infra = await createR2Infrastructure({ projectRoot: fixture.root, userDataPath: fixture.userData,
      scenario: 'change-verify-return', permissionResponder: async () => 'allow_once' });
    try {
      await infra.agentLoop.executeR2({ requestId: randomUUID(), projectRoot: fixture.root,
        task: 'Repair sum', contextReferences: [], maxSteps: 8 }, new AbortController().signal);
      const db = openR0Database(`${fixture.userData}/codryn.sqlite`);
      try {
        db.prepare("UPDATE mutation_intents SET state = 'prepared'").run();
        await writeFile(`${fixture.root}/sum.mjs`, new Uint8Array([0, 1, 2]));
        await infra.recover.execute(infra.projectId, new AbortController().signal);
        expect(db.prepare('SELECT state FROM mutation_intents').get()?.state).toBe('prepared');
      } finally { db.close(); }
    } finally { infra.close(); await fixture.close(); }
  }, 30_000);

  it('rejects a patch targeting an unresolved Git conflict', async () => {
    const fixture = await createR2Project('non-git');
    deterministicBoundaries(fixture.root);
    vi.spyOn(ProjectGitState.prototype, 'inspect').mockResolvedValue({ mode: 'git', head: null,
      branch: 'main', indexHash: 'a'.repeat(64), worktreeIdentity: fixture.root,
      conflicts: ['sum.mjs'], status: [{ path: 'sum.mjs', xy: 'UU' }] });
    const infra = await createR2Infrastructure({ projectRoot: fixture.root, userDataPath: fixture.userData,
      scenario: 'change-verify-return', permissionResponder: async () => 'allow_once' });
    try {
      const result = await infra.agentLoop.executeR2({ requestId: randomUUID(), projectRoot: fixture.root,
        task: 'Repair sum', contextReferences: [], maxSteps: 8 }, new AbortController().signal);
      expect(await readFile(`${fixture.root}/sum.mjs`, 'utf8')).toContain('return a - b');
      expect(result.status).not.toBe('completed');
      if (result.changeSetId === null) throw new Error('Expected change set');
      expect(await infra.changes.diff.execute(result.changeSetId, new AbortController().signal)).toEqual([]);
    } finally { infra.close(); await fixture.close(); }
  }, 30_000);
  it('refreshes verification after the final model response changes project files', async () => {
    const fixture = await createR2Project('non-git');
    deterministicBoundaries(fixture.root);
    const expectedHash = createHash('sha256').update(await readFile(`${fixture.root}/sum.mjs`)).digest('hex');
    const scenario = changeVerifyReturnScenario({ expectedHash, projectRoot: fixture.root });
    const steps = [...scenario.steps];
    const final = steps.pop();
    if (final === undefined) throw new Error('Expected final fixture step');
    steps.push({ ...final, assertRequest: () => { writeFileSync(`${fixture.root}/late.txt`, 'manual edit after test'); } });
    const infra = await createR2Infrastructure({ projectRoot: fixture.root, userDataPath: fixture.userData,
      scenario: { ...scenario, steps }, permissionResponder: async () => 'allow_once' });
    try {
      const result = await infra.agentLoop.executeR2({ requestId: randomUUID(), projectRoot: fixture.root,
        task: 'Repair sum', contextReferences: [], maxSteps: 8 }, new AbortController().signal);
      expect(result.verification.status).toBe('stale');
      expect(result.status).not.toBe('completed');
    } finally { infra.close(); await fixture.close(); }
  }, 30_000);

  it('reopens the same project identity and reverts a persisted change set after restart', async () => {
    const fixture = await createR2Project('non-git');
    deterministicBoundaries(fixture.root);
    const options = { projectRoot: fixture.root, userDataPath: fixture.userData, scenario: 'change-verify-return' as const,
      permissionResponder: async () => 'allow_once' as const };
    let infra = await createR2Infrastructure(options);
    try {
      const projectId = infra.projectId;
      const result = await infra.agentLoop.executeR2({ requestId: randomUUID(), projectRoot: fixture.root,
        task: 'Repair sum', contextReferences: [], maxSteps: 8 }, new AbortController().signal);
      infra.close();
      infra = await createR2Infrastructure(options);
      expect(infra.projectId).toBe(projectId);
      if (result.changeSetId === null) throw new Error('Expected change set');
      const reverted = await infra.changes.revert.execute({ setId: result.changeSetId, requestId: randomUUID() }, new AbortController().signal);
      expect(reverted.status).toBe('reverted');
      expect(await readFile(`${fixture.root}/sum.mjs`, 'utf8')).toContain('return a - b');
    } finally { infra.close(); await fixture.close(); }
  }, 30_000);
  it('accepts an injected model adapter without requiring a scripted scenario option', async () => {
    const fixture = await createR2Project('non-git');
    const expectedHash = createHash('sha256').update(await readFile(`${fixture.root}\\sum.mjs`)).digest('hex');
    const model = new ScriptedModelAdapter(changeVerifyReturnScenario({ expectedHash, projectRoot: fixture.root }));
    const infrastructure = await createR2Infrastructure({
      projectRoot: fixture.root,
      userDataPath: fixture.userData,
      model,
      permissionResponder: async () => 'allow_once'
    });
    try {
      const result = await infrastructure.agentLoop.executeR2({
        requestId: '11111111-1111-4111-8111-111111111111',
        projectRoot: fixture.root,
        task: 'Oprav sum a ověř opravu.',
        contextReferences: [],
        maxSteps: 8
      }, new AbortController().signal);
      const events = await infrastructure.eventStore.findBySessionId(result.runId);
      expect(result, JSON.stringify({ result, eventTypes: events.map((event) => event.eventType) })).toMatchObject({ status: 'completed', verification: { status: 'verified' } });
    } finally {
      infrastructure.close();
      await fixture.close();
    }
  }, 30_000);

  it('accepts the packaged smoke runtime as the trusted verification executable', async () => {
    const fixture = await createR2Project('non-git');
    deterministicBoundaries(fixture.root);
    const runtimeExecutable = 'C:\\packaged\\node.exe';
    const expectedHash = createHash('sha256').update(await readFile(`${fixture.root}\\sum.mjs`)).digest('hex');
    const infrastructure = await createR2Infrastructure({
      projectRoot: fixture.root,
      userDataPath: fixture.userData,
      trustedVerificationExecutable: runtimeExecutable,
      scenario: changeVerifyReturnScenario({ expectedHash, projectRoot: fixture.root, runtimeExecutable }),
      permissionResponder: async () => 'allow_once'
    });
    try {
      const result = await infrastructure.agentLoop.executeR2({
        requestId: randomUUID(),
        projectRoot: fixture.root,
        task: 'Repair sum using packaged runtime.',
        contextReferences: [],
        maxSteps: 8
      }, new AbortController().signal);
      expect(result).toMatchObject({ status: 'completed', verification: { status: 'verified' } });
    } finally {
      infrastructure.close();
      await fixture.close();
    }
  }, 30_000);

  it('keeps the project line ending style in the scripted change cycle', async () => {
    const fixture = await createR2Project('non-git');
    const originalContent = 'export function sum(a, b) { return a - b; }\r\n';
    await writeFile(`${fixture.root}\\sum.mjs`, originalContent, 'utf8');
    const expectedHash = createHash('sha256').update(Buffer.from(originalContent, 'utf8')).digest('hex');
    const model = new ScriptedModelAdapter(changeVerifyReturnScenario({ expectedHash, originalContent, projectRoot: fixture.root }));
    const infrastructure = await createR2Infrastructure({
      projectRoot: fixture.root,
      userDataPath: fixture.userData,
      model,
      permissionResponder: async () => 'allow_once'
    });
    try {
      const result = await infrastructure.agentLoop.executeR2({
        requestId: '22222222-2222-4222-8222-222222222222',
        projectRoot: fixture.root,
        task: 'Oprav sum v CRLF fixture.',
        contextReferences: [],
        maxSteps: 8
      }, new AbortController().signal);
      expect(result, JSON.stringify(result)).toMatchObject({ status: 'completed', verification: { status: 'verified' } });
      expect((await readFile(`${fixture.root}\\sum.mjs`)).toString('utf8')).toBe('export function sum(a, b) { return a + b; }\r\n');
    } finally {
      infrastructure.close();
      await fixture.close();
    }
  }, 30_000);
});
