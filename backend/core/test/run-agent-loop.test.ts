import { describe, expect, it } from 'vitest';
import type { AgentRunStore, ModelAdapter } from '../src/agent/ports.js';
import type { EventEnvelope, ModelRequest, ModelStreamEvent, Uuid } from '@codryn/shared';
import { RunAgentLoop, ToolExecutionHarness, ToolRegistry, ControlledPermissionPolicy, fileReadTool, textSearchTool } from '../src/index.js';

const runId = '11111111-1111-4111-8111-111111111111' as Uuid;
const requestId = '22222222-2222-4222-8222-222222222222' as Uuid;
const callId = '33333333-3333-4333-8333-333333333333' as Uuid;
const secondCallId = '44444444-4444-4444-8444-444444444444' as Uuid;
const clock = { now: () => '2026-08-24T00:00:00.000Z' };

function stream(...events: ModelStreamEvent[]): AsyncIterable<ModelStreamEvent> { return (async function* () { yield* events; })(); }

describe('RunAgentLoop', () => {
  it('orchestrates one completed adapter response per sequential step and persists only safe event metadata', async () => {
    const requests: ModelRequest[] = [];
    const model: ModelAdapter = {
      descriptor: { adapterId: 'fake', modelId: 'fake-1', capabilities: { streaming: 'supported', toolCalling: 'supported', structuredOutput: 'unknown', imageInput: 'unsupported', usageMetadata: 'unknown', contextLimit: 'unknown', compaction: 'unknown' } },
      stream(request) { requests.push(request); return requests.length === 1 ? stream({ type: 'tool_call', call: { callId, toolId: 'text.search', toolVersion: 1, arguments: { query: 'symbol' } } }, { type: 'completed' }) : requests.length === 2 ? stream({ type: 'tool_call', call: { callId: secondCallId, toolId: 'file.read', toolVersion: 1, arguments: { path: 'README.md' } } }, { type: 'completed' }) : stream({ type: 'text_delta', text: 'Hotovo.' }, { type: 'completed' }); }
    };
    const events: EventEnvelope[] = [];
    const agentRunStore: AgentRunStore = {
      async createWithInitialEvent(_run, event) { events.push(event); },
      async transitionWithEvent(input) { events.push(input.event); },
      async findById() { return null; }
    };
    const toolCallStore = { async createWithInitialEvent(_call: unknown, event: EventEnvelope) { events.push(event); }, async transitionWithEvent(input: { event: EventEnvelope }) { events.push(input.event); } };
    const registry = new ToolRegistry([fileReadTool(async () => ({ path: 'README.md', content: 'fixture secret', startLine: 1, endLine: 1, totalLines: 1, truncated: false, contentHash: 'a'.repeat(64) })), textSearchTool(async () => ({ matches: [], truncated: false, filesSearched: 1, bytesSearched: 14 }))]);
    const harness = new ToolExecutionHarness({ registry, permissionPolicy: new ControlledPermissionPolicy(), toolCallStore, clock, ids: { next: () => runId } });
    const eventStore = { async append(event: EventEnvelope) { events.push(event); }, async findBySessionId() { return []; } };
    const loop = new RunAgentLoop({ contextAssembler: { async assemble() { return { modelContent: [{ path: 'README.md', content: 'fixture secret', contentHash: 'a'.repeat(64), byteLength: 14, reason: 'explicit_reference' as const }], sources: [{ path: 'README.md', contentHash: 'a'.repeat(64), byteLength: 14, reason: 'explicit_reference' as const }], totalBytes: 14 }; } }, model, registry, toolExecutionHarness: harness, agentRunStore, eventStore, clock, ids: { next: () => runId } });

    await expect(loop.execute({ requestId, projectRoot: 'C:\\Users\\secret\\project', task: 'Read it', contextReferences: ['README.md'], maxSteps: 3 }, new AbortController().signal)).resolves.toMatchObject({ status: 'completed', runId, stepCount: 3, finalText: 'Hotovo.', verification: { status: 'not_applicable', reason: 'R1_READ_ONLY_RUN' } });
    expect(requests).toHaveLength(3);
    expect(requests[2]?.previousToolResults[1]).toMatchObject({ ok: true, output: expect.objectContaining({ content: 'fixture secret' }) });
    expect(JSON.stringify(events)).not.toContain('fixture secret');
    expect(JSON.stringify(events)).not.toContain('C:\\Users\\secret\\project');
    expect(events.map((event) => event.eventType)).toEqual(expect.arrayContaining(['context.assembled', 'model.requested', 'model.response_received']));
  });

  it('stops at max steps before an extra adapter call', async () => {
    let calls = 0;
    const loop = new RunAgentLoop({ contextAssembler: { async assemble() { return { modelContent: [], sources: [], totalBytes: 0 }; } }, model: { descriptor: { adapterId: 'fake', modelId: 'fake', capabilities: { streaming: 'supported', toolCalling: 'supported', structuredOutput: 'unknown', imageInput: 'unknown', usageMetadata: 'unknown', contextLimit: 'unknown', compaction: 'unknown' } }, stream() { calls++; return stream({ type: 'tool_call', call: { callId, toolId: 'unknown', toolVersion: 1, arguments: {} } }, { type: 'completed' }); } }, registry: new ToolRegistry([]), toolExecutionHarness: { async execute() { return { ok: false as const, callId, error: { code: 'R1_TOOL_UNKNOWN', message: 'Tool is not registered.' } }; } }, agentRunStore: { async createWithInitialEvent() {}, async transitionWithEvent() {}, async findById() { return null; } }, eventStore: { async append() {}, async findBySessionId() { return []; } }, clock, ids: { next: () => runId } });
    await expect(loop.execute({ requestId, projectRoot: 'logical-root', task: 'Read it', contextReferences: [], maxSteps: 1 }, new AbortController().signal)).resolves.toMatchObject({ status: 'failed', failure: { code: 'R1_STEP_LIMIT_EXCEEDED' } });
    expect(calls).toBe(1);
  });
});
