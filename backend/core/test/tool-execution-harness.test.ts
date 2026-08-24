import { describe, expect, it, vi } from 'vitest';
import type { EventEnvelope, Uuid } from '@codryn/shared';
import type { ProjectFileReadResult, ToolCallStore } from '../src/agent/ports.js';
import { ControlledPermissionPolicy, ToolExecutionHarness, ToolRegistry, fileReadTool } from '../src/index.js';

const ids = (...values: string[]) => ({ next: () => values.shift() as Uuid });
const clock = { now: () => '2026-08-24T00:00:00.000Z' };
const call = { callId: '11111111-1111-4111-8111-111111111111', toolId: 'file.read', toolVersion: 1, arguments: { path: 'README.md' } } as const;
const runId = '22222222-2222-4222-8222-222222222222' as Uuid;

function store(): ToolCallStore & { transitions: Array<{ to: string; event: EventEnvelope }> } {
  const transitions: Array<{ to: string; event: EventEnvelope }> = [];
  return {
    transitions,
    async createWithInitialEvent() {},
    async transitionWithEvent(input) { transitions.push({ to: input.to, event: input.event }); }
  };
}

type ReadHandler = (input: { path: string; startLine: number; maxLines: number }, signal: AbortSignal) => Promise<ProjectFileReadResult>;

function harness(handler: ReturnType<typeof vi.fn<ReadHandler>>, toolCallStore = store()): ToolExecutionHarness {
  return new ToolExecutionHarness({
    registry: new ToolRegistry([fileReadTool(handler)]),
    permissionPolicy: new ControlledPermissionPolicy(),
    toolCallStore,
    clock,
    ids: ids('33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777', '88888888-8888-4888-8888-888888888888')
  });
}

describe('ToolExecutionHarness', () => {
  it('persists the exact successful lifecycle and invokes the parsed handler exactly once', async () => {
    const handler = vi.fn<ReadHandler>(async (input) => ({ path: input.path, content: 'fixture content', startLine: input.startLine, endLine: 1, totalLines: 1, truncated: false, contentHash: 'a'.repeat(64) }));
    const toolCallStore = store();
    const result = await harness(handler, toolCallStore).execute(call, runId, new AbortController().signal);

    expect(result).toEqual({ ok: true, callId: call.callId, output: expect.objectContaining({ path: 'README.md' }) });
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ path: 'README.md', startLine: 1, maxLines: 200 }, expect.any(AbortSignal));
    expect(toolCallStore.transitions.map((entry) => entry.to)).toEqual(['schema_validated', 'permission_decided', 'queued', 'running', 'succeeded']);
    expect(toolCallStore.transitions.map((entry) => entry.event.eventType)).toEqual(['tool_call.schema_validated', 'tool_call.permission_decided', 'tool_call.queued', 'tool_call.started', 'tool_call.succeeded']);
    expect(JSON.stringify(toolCallStore.transitions)).not.toContain('fixture content');
  });

  it('rejects unknown tools and invalid input without invoking a handler', async () => {
    const handler = vi.fn<ReadHandler>();
    const unknown = await harness(handler).execute({ ...call, toolId: 'unknown.tool' }, runId, new AbortController().signal);
    const invalid = await harness(handler).execute({ ...call, arguments: { path: 'README.md', extra: true } }, runId, new AbortController().signal);

    expect(unknown).toMatchObject({ ok: false, error: { code: 'R1_TOOL_UNKNOWN' } });
    expect(invalid).toMatchObject({ ok: false, error: { code: 'R1_TOOL_INPUT_INVALID' } });
    expect(handler).not.toHaveBeenCalled();
  });

  it('maps handler failures and invalid output to stable safe errors', async () => {
    const throwing = vi.fn<ReadHandler>(async () => { throw new Error('do not leak'); });
    const invalid = vi.fn<ReadHandler>(async () => ({ path: 'README.md', content: 'bad', startLine: 1 } as unknown as ProjectFileReadResult));
    await expect(harness(throwing).execute(call, runId, new AbortController().signal)).resolves.toMatchObject({ ok: false, error: { code: 'R1_TOOL_EXECUTION_FAILED', message: 'Tool execution failed.' } });
    await expect(harness(invalid).execute(call, runId, new AbortController().signal)).resolves.toMatchObject({ ok: false, error: { code: 'R1_TOOL_OUTPUT_INVALID' } });
  });

  it('returns cancellation before handler execution when already aborted', async () => {
    const handler = vi.fn<ReadHandler>();
    const controller = new AbortController();
    controller.abort();
    await expect(harness(handler).execute(call, runId, controller.signal)).resolves.toMatchObject({ ok: false, error: { code: 'R1_CANCELLED' } });
    expect(handler).not.toHaveBeenCalled();
  });

  it.each(['.GIT/config', 'keys/id_rsa', 'keys/secret.pem'])('does not invoke a handler for a fixed-sensitive path: %s', async (path) => {
    const handler = vi.fn<ReadHandler>();
    await expect(harness(handler).execute({ ...call, arguments: { path } }, runId, new AbortController().signal)).resolves.toMatchObject({ ok: false, error: { code: 'R1_TOOL_PERMISSION_DENIED' } });
    expect(handler).not.toHaveBeenCalled();
  });
});
