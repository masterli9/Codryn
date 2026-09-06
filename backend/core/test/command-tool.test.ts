import { describe, expect, it, vi } from 'vitest';
import { commandRunTool } from '../src/tools/command-tool.js';
import { ControlledPermissionPolicy, ToolExecutionHarness, ToolRegistry } from '../src/index.js';
import type { ToolCallStore } from '../src/agent/ports.js';

describe('command.run tool', () => {
  it('does not invoke its executor without a backend execution context', async () => {
    let calls = 0;
    const tool = commandRunTool({
      async run() { calls += 1; return { status: 'succeeded', exitCode: 0, stdout: '', stderr: '', truncated: false, durationMs: 1, treeStopped: true }; }
    });
    const result = await tool.handler({
      command: { executable: 'node', args: ['--version'], cwd: 'C:\\project', timeoutMs: 30_000, maxOutputBytes: 1024 },
      reason: 'Run the test.',
      impact: 'The process may read project files.'
    }, new AbortController().signal);
    expect(result).toMatchObject({ status: 'rejected', code: 'R2_TOOL_CONTEXT_INVALID' });
    expect(calls).toBe(0);
  });

  it('keeps a command pending without a responder and never invokes the runner', async () => {
    let calls = 0;
    const toolCallStore: ToolCallStore & { transitions: string[] } = {
      transitions: [],
      async createWithInitialEvent() {},
      async transitionWithEvent(input) { this.transitions.push(input.to); }
    };
    const runId = '71111111-1111-4111-8111-111111111111';
    const callId = '72222222-2222-4222-8222-222222222222';
    const tool = commandRunTool({
      async run() { calls += 1; return { status: 'succeeded', exitCode: 0, stdout: '', stderr: '', truncated: false, durationMs: 1, treeStopped: true }; }
    });
    const permissionService = {
      request: async () => ({
        id: '73444444-4444-4444-8444-444444444444', callId,
        digest: 'a'.repeat(64),
        command: { executable: 'node', args: ['--version'], cwd: 'E:\\fixture', timeoutMs: 30_000, maxOutputBytes: 1024 },
        reason: 'Run the fixture test.', impact: 'The command can read or change files in the project.', state: 'pending' as const
      })
    };
    const harness = new ToolExecutionHarness({
      registry: new ToolRegistry([tool]),
      permissionPolicy: new ControlledPermissionPolicy(),
      toolCallStore,
      clock: { now: () => '2026-09-06T10:00:00.000Z' },
      ids: { next: () => '73333333-3333-4333-8333-333333333333' },
      permissionService: permissionService as never
    });
    const result = await harness.execute({
      callId, toolId: 'command.run', toolVersion: 1,
      arguments: {
        command: { executable: 'node', args: ['--version'], cwd: 'E:\\fixture', timeoutMs: 30_000, maxOutputBytes: 1024 },
        reason: 'Run the fixture test.', impact: 'The command can read or change files in the project.'
      }
    }, runId, new AbortController().signal, {
      projectId: '74444444-4444-4444-8444-444444444444', runId, callId
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'R2_PERMISSION_PENDING' } });
    expect(calls).toBe(0);
    expect(toolCallStore.transitions).toEqual(['schema_validated', 'waiting_for_approval', 'failed']);
  });

  it('claims one explicit approval before invoking the runner', async () => {
    const transitions: string[] = [];
    const permissionId = '75555555-5555-4555-8555-555555555555';
    const callId = '76666666-6666-4666-8666-666666666666';
    const runId = '77777777-7777-4777-8777-777777777777';
    const projectId = '78888888-8888-4888-8888-888888888888';
    const command = { executable: 'node', args: ['--version'], cwd: 'E:\\fixture', timeoutMs: 30_000, maxOutputBytes: 1024 };
    const execute = vi.fn(async () => ({ status: 'succeeded' as const, exitCode: 0, stdout: 'ok', stderr: '', truncated: false, durationMs: 1, treeStopped: true }));
    const permission = {
      id: permissionId, callId, digest: 'a'.repeat(64), command,
      reason: 'Run the fixture test.', impact: 'The command can read or change files in the project.', state: 'pending' as const
    };
    const service = {
      request: vi.fn(async () => permission),
      decide: vi.fn(async () => 'accepted' as const),
      claim: vi.fn(async () => true),
      closePending: vi.fn(async () => true)
    };
    const harness = new ToolExecutionHarness({
      registry: new ToolRegistry([commandRunTool({ run: execute })]),
      permissionPolicy: new ControlledPermissionPolicy(),
      toolCallStore: {
        async createWithInitialEvent() {},
        async transitionWithEvent(input) { transitions.push(input.to); }
      },
      clock: { now: () => '2026-09-06T10:00:00.000Z' },
      ids: { next: () => '79999999-9999-4999-8999-999999999999' },
      permissionService: service as never,
      permissionResponder: async () => 'allow_once'
    });
    const result = await harness.execute({
      callId, toolId: 'command.run', toolVersion: 1,
      arguments: { command, reason: permission.reason, impact: permission.impact }
    }, runId, new AbortController().signal, { projectId, runId, callId });
    expect(result).toMatchObject({ ok: true, output: { status: 'succeeded' } });
    expect(service.decide).toHaveBeenCalledWith({ id: permissionId, digest: 'a'.repeat(64), decision: 'allow_once' });
    expect(service.claim).toHaveBeenCalledWith(permissionId, 'a'.repeat(64));
    expect(execute).toHaveBeenCalledOnce();
    expect(transitions).toEqual(['schema_validated', 'waiting_for_approval', 'permission_decided', 'queued', 'running', 'succeeded']);
  });
});
