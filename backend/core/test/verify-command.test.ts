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
