import { describe, expect, it } from 'vitest';
import type { CommandResult } from '../src/process/ports.js';
import { VerifyCommand, assessVerification } from '../src/verification/verify-command.js';

const before = { revision: 1, fingerprint: 'a'.repeat(64), gitIdentity: null, complete: true };
const command = { executable: 'node', args: ['--test'], cwd: 'E:\\fixture', timeoutMs: 30_000, maxOutputBytes: 1024 };
const actor = {
  projectId: '51111111-1111-4111-8111-111111111111',
  runId: '52222222-2222-4222-8222-222222222222',
  callId: '53333333-3333-4333-8333-333333333333'
};

const processResult: CommandResult = {
  status: 'succeeded', exitCode: 0, stdout: '', stderr: '', truncated: false, durationMs: 10, treeStopped: true
};

describe('verification', () => {
  it.each([
    ['node-tap', 'TAP version 13\n1..0\n# tests 0\n# suites 0\n# pass 0\n# fail 0\n', 'incomplete'],
    ['node-tap', 'TAP version 13\n1..1\n# tests 1\n# suites 0\n# pass 1\n# fail 0\n', 'passed'],
    ['vitest-json', '{"numTotalTests":0,"numPassedTests":0,"numFailedTests":0}', 'incomplete'],
    ['vitest-json', '{"numTotalTests":1,"numPassedTests":1,"numFailedTests":0}', 'passed'],
    [null, '', 'passed']
  ] as const)('requires bounded %s evidence before recording a verified check', async (evidenceFormat, stdout, result) => {
    const saved: unknown[] = [];
    const service = new VerifyCommand({
      runner: { run: async () => ({ ...processResult, stdout }) },
      observer: { inspect: async () => before },
      workspaces: { observe: async () => before, current: async () => before },
      store: { append: async (record, evidence) => { saved.push({ record, evidence }); }, current: async () => null },
      ids: { next: () => '54444444-4444-4444-8444-444444444444' }, clock: { now: () => '2026-09-06T10:30:00.000Z' },
      classify: async () => ({
        kind: evidenceFormat ? 'test' : 'typecheck', profileId: 'r4-ts-v1', coveredPaths: ['src/app.ts'],
        inputHashes: { 'src/app.ts': 'a'.repeat(64) }, evidenceFormat
      })
    });
    expect(await service.execute(command, actor, new AbortController().signal)).toMatchObject({ result, kind: evidenceFormat ? 'test' : 'typecheck' });
    expect(saved[0]).toMatchObject({ evidence: { profileId: 'r4-ts-v1', coveredPaths: ['src/app.ts'] } });
  });
  it('includes relevance inspection in the observed verification interval', async () => {
    let generation = '1';
    const service = new VerifyCommand({
      runner: { run: async () => processResult },
      observer: { inspect: async () => ({ ...before, watcherGeneration: generation }) },
      workspaces: { observe: async (_id, value) => ({ ...value, revision: 1 }), current: async () => before },
      store: { append: async () => {}, current: async () => null },
      ids: { next: () => '54444444-4444-4444-8444-444444444444' },
      clock: { now: () => '2026-09-06T10:30:00.000Z' },
      isRelevant: () => { generation = '2'; return true; }
    });
    expect((await service.execute(command, actor, new AbortController().signal)).result).toBe('incomplete');
  });
  it('rejects a changed Git identity even if a store returns the same revision', () => {
    expect(assessVerification({ exitCode: 0, treeStopped: true, truncated: false, processStatus: 'succeeded',
      before, after: { ...before, gitIdentity: 'new-head' }, watcherChanged: false, relevant: true })).toBe('incomplete');
  });
  it.each([
    { name: 'an arbitrary successful command', relevant: false, generations: ['1', '1'] },
    { name: 'an ABA edit during a relevant command', relevant: true, generations: ['1', '3'] }
  ])('rejects $name', async ({ relevant, generations }) => {
    let index = 0;
    const service = new VerifyCommand({
      runner: { run: async () => processResult },
      observer: { inspect: async () => ({ ...before, watcherGeneration: generations[index++] ?? 'unknown' }) },
      workspaces: { observe: async (_id, value) => ({ ...value, revision: 1 }), current: async () => before },
      store: { append: async () => {}, current: async () => null },
      ids: { next: () => '54444444-4444-4444-8444-444444444444' },
      clock: { now: () => '2026-09-06T10:30:00.000Z' },
      isRelevant: () => relevant
    });
    expect((await service.execute(command, actor, new AbortController().signal)).result).toBe('incomplete');
  });
  it('does not call a green process verified when the workspace changed', () => {
    expect(assessVerification({
      exitCode: 0, treeStopped: true, truncated: false, processStatus: 'succeeded',
      before, after: { ...before, revision: 2, fingerprint: 'b'.repeat(64) }, watcherChanged: true, relevant: true
    })).toBe('incomplete');
  });

  it('records an incomplete result after a change during the command', async () => {
    const saved: unknown[] = [];
    let observations = 0;
    const commandService = new VerifyCommand({
      runner: { run: async () => processResult },
      observer: { inspect: async () => ({ fingerprint: observations++ === 0 ? 'a'.repeat(64) : 'b'.repeat(64), gitIdentity: null, complete: true }) },
      workspaces: {
        observe: async (_projectId, observation) => ({ ...observation, revision: observations }),
        current: async () => before
      },
      store: { append: async (record) => { saved.push(record); }, current: async () => null },
      ids: { next: () => '54444444-4444-4444-8444-444444444444' },
      clock: { now: () => '2026-09-06T10:30:00.000Z' }
    });
    const result = await commandService.execute(command, actor, new AbortController().signal);
    expect(result.result).toBe('incomplete');
    expect(result.stale).toBe(false);
    expect(saved).toHaveLength(1);
  });
});
