import { describe, expect, it, vi } from 'vitest';
import type { EventEnvelope, Uuid } from '@codryn/shared';
import type { ApplyPatch } from '../src/changes/apply-patch.js';
import type { ToolCallStore } from '../src/agent/ports.js';
import {
  ControlledPermissionPolicy,
  ToolExecutionHarness,
  ToolRegistry,
  filePatchTool
} from '../src/index.js';

const projectId = '40000000-0000-4000-8000-000000000001' as Uuid;
const runId = '40000000-0000-4000-8000-000000000002' as Uuid;
const callId = '40000000-0000-4000-8000-000000000003' as Uuid;
const actor = { projectId, runId, callId };
const input = {
  path: 'src/example.ts',
  expectedHash: 'a'.repeat(64),
  edits: [{ oldText: 'before', newText: 'after' }]
};

function ids(...values: string[]) {
  return { next: () => values.shift() as Uuid };
}

function store(): ToolCallStore & { transitions: Array<{ to: string; event: EventEnvelope }> } {
  const transitions: Array<{ to: string; event: EventEnvelope }> = [];
  return {
    transitions,
    async createWithInitialEvent() {},
    async transitionWithEvent(value) { transitions.push({ to: value.to, event: value.event }); }
  };
}

function harness(apply: Pick<ApplyPatch, 'execute'>, toolCallStore = store()): ToolExecutionHarness {
  return new ToolExecutionHarness({
    registry: new ToolRegistry([filePatchTool(apply)]),
    permissionPolicy: new ControlledPermissionPolicy(),
    toolCallStore,
    clock: { now: () => '2026-09-06T00:00:00.000Z' },
    ids: ids(
      '40000000-0000-4000-8000-000000000010',
      '40000000-0000-4000-8000-000000000011',
      '40000000-0000-4000-8000-000000000012',
      '40000000-0000-4000-8000-000000000013',
      '40000000-0000-4000-8000-000000000014',
      '40000000-0000-4000-8000-000000000015'
    )
  });
}

describe('file.patch tool', () => {
  it('passes only backend actor context to ApplyPatch and returns safe change metadata', async () => {
    const execute = vi.fn(async (_input: unknown, receivedActor: typeof actor) => ({
      status: 'applied' as const,
      entry: {
        id: '40000000-0000-4000-8000-000000000020',
        setId: '40000000-0000-4000-8000-000000000021',
        projectId: receivedActor.projectId,
        runId: receivedActor.runId,
        callId: receivedActor.callId,
        sequence: 1,
        path: 'src/example.ts',
        beforeHash: 'a'.repeat(64),
        afterHash: 'b'.repeat(64),
        beforeBlob: 'c'.repeat(64),
        afterBlob: 'd'.repeat(64),
        kind: 'patch' as const,
        reversesId: null
      },
      revision: 4
    }));
    const result = await harness({ execute }).execute(
      { callId, toolId: 'file.patch', toolVersion: 1, arguments: input },
      runId,
      new AbortController().signal,
      actor
    );

    expect(result).toEqual({
      ok: true,
      callId,
      output: {
        status: 'applied',
        path: 'src/example.ts',
        beforeHash: 'a'.repeat(64),
        afterHash: 'b'.repeat(64),
        changeId: '40000000-0000-4000-8000-000000000020',
        revision: 4
      }
    });
    expect(execute).toHaveBeenCalledWith(input, actor, expect.any(AbortSignal));
    expect(JSON.stringify(execute.mock.calls)).not.toContain('SECRET');
  });

  it('rejects actor spoofing before the handler executes', async () => {
    const execute = vi.fn();
    const result = await harness({ execute }).execute(
      { callId, toolId: 'file.patch', toolVersion: 1, arguments: input },
      runId,
      new AbortController().signal,
      { ...actor, runId: '40000000-0000-4000-8000-000000000099' }
    );
    expect(result).toMatchObject({ ok: false, error: { code: 'R2_TOOL_CONTEXT_INVALID' } });
    expect(execute).not.toHaveBeenCalled();
  });

  it('denies a sensitive target before writer execution', async () => {
    const execute = vi.fn();
    const result = await harness({ execute }).execute(
      { callId, toolId: 'file.patch', toolVersion: 1, arguments: { ...input, path: '.env' } },
      runId,
      new AbortController().signal,
      actor
    );
    expect(result).toMatchObject({ ok: false, error: { code: 'R1_TOOL_PERMISSION_DENIED' } });
    expect(execute).not.toHaveBeenCalled();
  });
});
