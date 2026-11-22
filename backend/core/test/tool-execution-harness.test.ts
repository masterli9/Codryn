import { describe, expect, it, vi } from 'vitest';
import type { EventEnvelope, Uuid } from '@codryn/shared';
import type { ProjectFileReadResult, ToolCallStore } from '../src/agent/ports.js';
import { R1PersistenceFailure, ControlledPermissionPolicy, ToolExecutionHarness, ToolRegistry, filePatchTool, fileReadTool } from '../src/index.js';

const ids = (...values: string[]) => ({ next: () => values.shift() as Uuid });
const clock = { now: () => '2026-08-24T00:00:00.000Z' };
const call = { callId: '11111111-1111-4111-8111-111111111111', toolId: 'file.read', toolVersion: 1, arguments: { path: 'README.md' } } as const;
const runId = '22222222-2222-4222-8222-222222222222' as Uuid;

function store(): ToolCallStore & { created: unknown[]; events: EventEnvelope[]; transitions: Array<{ to: string; event: EventEnvelope; safeResult?: unknown }> } {
  const created: unknown[] = [];
  const events: EventEnvelope[] = [];
  const transitions: Array<{ to: string; event: EventEnvelope; safeResult?: unknown }> = [];
  return {
    created,
    events,
    transitions,
    async createWithInitialEvent(call, event) { created.push(call); events.push(event); },
    async transitionWithEvent(input) {
      events.push(input.event);
      transitions.push({ to: input.to, event: input.event, ...(input.safeResult === undefined ? {} : { safeResult: input.safeResult }) });
    }
  };
}

type ReadHandler = (input: { path: string; startLine: number; maxLines: number }, signal: AbortSignal) => Promise<ProjectFileReadResult>;

function harness(handler: ReturnType<typeof vi.fn<ReadHandler>>, toolCallStore: ToolCallStore = store()): ToolExecutionHarness {
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
    expect(handler).toHaveBeenCalledWith(
      { path: 'README.md', startLine: 1, maxLines: 200 },
      expect.any(AbortSignal),
      { projectId: 'project', runId, callId: call.callId }
    );
    expect(toolCallStore.transitions.map((entry) => entry.to)).toEqual(['schema_validated', 'permission_decided', 'queued', 'running', 'succeeded']);
    expect(toolCallStore.transitions.map((entry) => entry.event.eventType)).toEqual(['tool_call.schema_validated', 'tool_call.permission_decided', 'tool_call.queued', 'tool_call.started', 'tool_call.succeeded']);
    expect(toolCallStore.transitions[1]?.event.payload).toMatchObject({
      permissionResult: 'allowed_by_rule',
      permissionRuleId: 'R1_SAFE_READ_WITHIN_PROJECT',
      permissionReason: 'Validated read-only path is within the open project.'
    });
    expect(JSON.stringify(toolCallStore.transitions)).not.toContain('fixture content');
  });

  it('propagates tool persistence failures so the agent run can terminate', async () => {
    const handler = vi.fn<ReadHandler>(async (input) => ({ path: input.path, content: 'fixture content', startLine: 1, endLine: 1, totalLines: 1, truncated: false, contentHash: 'a'.repeat(64) }));
    const persistenceFailureStore = {
      transitions: [],
      async createWithInitialEvent() {},
      async transitionWithEvent() { throw new R1PersistenceFailure('TOOL_CALL_WRITE_FAILED'); }
    };

    await expect(harness(handler, persistenceFailureStore).execute(call, runId, new AbortController().signal))
      .rejects.toMatchObject({ code: 'R1_PERSISTENCE_FAILED' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects unknown tools and invalid input without invoking a handler', async () => {
    const handler = vi.fn<ReadHandler>();
    const unknown = await harness(handler).execute({ ...call, toolId: 'unknown.tool' }, runId, new AbortController().signal);
    const invalid = await harness(handler).execute({ ...call, arguments: { path: 'README.md', extra: true } }, runId, new AbortController().signal);

    expect(unknown).toMatchObject({ ok: false, error: { code: 'R1_TOOL_UNKNOWN' } });
    expect(invalid).toMatchObject({ ok: false, error: { code: 'R1_TOOL_INPUT_INVALID' } });
    expect(invalid).toMatchObject({ error: { message: 'Tool input is invalid.' } });
    expect(handler).not.toHaveBeenCalled();
  });

  it('gives file.patch fixed schema guidance without echoing values or persisting details', async () => {
    const toolCallStore = store();
    const execute = vi.fn(async () => ({ status: 'rejected' as const, code: 'R2_PATCH_REJECTED' }));
    const patchHarness = new ToolExecutionHarness({
      registry: new ToolRegistry([filePatchTool({ execute })]),
      permissionPolicy: new ControlledPermissionPolicy(), toolCallStore, clock, ids: ids('99999999-9999-4999-8999-999999999999')
    });
    const result = await patchHarness.execute({ ...call, toolId: 'file.patch', arguments: {
      path: 'src/PATH_VALUE_CANARY.ts', expectedHash: 'HASH_VALUE_CANARY',
      edits: [{ oldText: 'OLD_VALUE_CANARY', newText: 'NEW_VALUE_CANARY' }], extraFieldCanary: 'KEY_VALUE_CANARY'
    } }, runId, new AbortController().signal, { projectId: runId, runId, callId: call.callId });

    expect(result).toMatchObject({ ok: false, error: {
      code: 'R1_TOOL_INPUT_INVALID',
      message: expect.stringContaining('existing project-relative path')
    } });
    if (result.ok) throw new Error('Expected an invalid patch result.');
    expect(result.error.message).toContain('64-character lowercase hexadecimal');
    expect(result.error.message).toContain('file.read');
    expect(result.error.message).toContain('1–16');
    expect(result.error.message).toContain('non-empty oldText and string newText');
    expect(result.error.message).toContain('64 KiB');
    expect(result.error.message).not.toMatch(/PATH_VALUE_CANARY|HASH_VALUE_CANARY|OLD_VALUE_CANARY|NEW_VALUE_CANARY|KEY_VALUE_CANARY|extraFieldCanary/u);
    expect(JSON.stringify({ created: toolCallStore.created, events: toolCallStore.events, transitions: toolCallStore.transitions, result }))
      .not.toMatch(/PATH_VALUE_CANARY|HASH_VALUE_CANARY|OLD_VALUE_CANARY|NEW_VALUE_CANARY|KEY_VALUE_CANARY|extraFieldCanary/u);
    expect(toolCallStore.transitions.map(item => item.to)).toEqual(['failed']);
    expect(execute).not.toHaveBeenCalled();
  });

  it('keeps pre-schema secret rejection generic and does not echo or persist the secret', async () => {
    const toolCallStore = store();
    const execute = vi.fn(async () => ({ status: 'rejected' as const, code: 'R2_PATCH_REJECTED' }));
    const patchHarness = new ToolExecutionHarness({
      registry: new ToolRegistry([filePatchTool({ execute })]), permissionPolicy: new ControlledPermissionPolicy(),
      toolCallStore, clock, ids: ids('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    });
    const result = await patchHarness.execute({ ...call, toolId: 'file.patch', arguments: {
      path: 'src/example.ts', expectedHash: 'a'.repeat(64),
      edits: [{ oldText: 'TOKEN=SECRET_VALUE_CANARY', newText: 'safe' }]
    } }, runId, new AbortController().signal, { projectId: runId, runId, callId: call.callId });

    expect(result).toMatchObject({ ok: false, error: { code: 'R1_TOOL_INPUT_INVALID', message: 'Tool input is invalid.' } });
    expect(JSON.stringify({ created: toolCallStore.created, events: toolCallStore.events, transitions: toolCallStore.transitions, result }))
      .not.toContain('SECRET_VALUE_CANARY');
    expect(toolCallStore.transitions.map(item => item.to)).toEqual(['failed']);
    expect(execute).not.toHaveBeenCalled();
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
