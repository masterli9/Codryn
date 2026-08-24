import { describe, expect, it } from 'vitest';
import type { AgentRunStore, ModelAdapter } from '../src/agent/ports.js';
import type { RunAgentLoopDependencies } from '../src/agent/run-agent-loop.js';
import type { EventEnvelope, ModelRequest, ModelStreamEvent, RunAgentRequest, Uuid } from '@codryn/shared';
import { RunAgentLoop, ToolExecutionHarness, ToolRegistry, ControlledPermissionPolicy, fileReadTool, textSearchTool } from '../src/index.js';

const runId = '11111111-1111-4111-8111-111111111111' as Uuid;
const requestId = '22222222-2222-4222-8222-222222222222' as Uuid;
const callId = '33333333-3333-4333-8333-333333333333' as Uuid;
const secondCallId = '44444444-4444-4444-8444-444444444444' as Uuid;
const clock = { now: () => '2026-08-24T00:00:00.000Z' };

function stream(...events: ModelStreamEvent[]): AsyncIterable<ModelStreamEvent> { return (async function* () { yield* events; })(); }

const capabilities = (toolCalling: 'supported' | 'unsupported' | 'unknown' = 'supported') => ({ streaming: 'supported' as const, toolCalling, structuredOutput: 'unknown' as const, imageInput: 'unknown' as const, usageMetadata: 'unknown' as const, contextLimit: 'unknown' as const, compaction: 'unknown' as const });
const validRequest: RunAgentRequest = { requestId, projectRoot: 'logical-root', task: 'Read it', contextReferences: [], maxSteps: 2 };

function loopFor(overrides: Partial<RunAgentLoopDependencies> = {}) {
  const events: EventEnvelope[] = [];
  const transitions: string[] = [];
  const dependencies: RunAgentLoopDependencies = {
    contextAssembler: { async assemble() { return { modelContent: [], sources: [], totalBytes: 0 }; } },
    model: { descriptor: { adapterId: 'fake', modelId: 'fake', capabilities: capabilities() }, stream() { return stream({ type: 'text_delta', text: 'done' }, { type: 'completed' }); } },
    registry: new ToolRegistry([]),
    toolExecutionHarness: { async execute() { return { ok: false, callId, error: { code: 'R1_TOOL_UNKNOWN', message: 'Tool is not registered.' } }; } },
    agentRunStore: { async createWithInitialEvent(_run, event) { events.push(event); }, async transitionWithEvent(input) { transitions.push(input.to); events.push(input.event); }, async findById() { return null; } },
    eventStore: { async append(event) { events.push(event); }, async findBySessionId() { return []; } },
    clock, ids: { next: () => runId }, ...overrides
  };
  return { loop: new RunAgentLoop(dependencies), events, transitions };
}

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

  it('rejects invalid input before creating any projection', async () => {
    const { loop, events } = loopFor();
    await expect(loop.execute({ ...validRequest, maxSteps: 0 }, new AbortController().signal)).resolves.toMatchObject({ status: 'failed', failure: { code: 'R1_INPUT_INVALID' } });
    expect(events).toEqual([]);
  });

  it('normalizes malformed runtime input without reading request fields or persisting', async () => {
    const { loop, events } = loopFor();
    await expect(loop.execute(null as unknown as RunAgentRequest, new AbortController().signal)).resolves.toMatchObject({ status: 'failed', failure: { code: 'R1_INPUT_INVALID' } });
    expect(events).toEqual([]);
  });

  it.each([
    ['context failure', { contextAssembler: { async assemble() { throw { code: 'R1_CONTEXT_REFERENCE_INVALID' }; } } }, 'R1_CONTEXT_REFERENCE_INVALID'],
    ['missing capability', { model: { descriptor: { adapterId: 'fake', modelId: 'fake', capabilities: capabilities('unsupported') }, stream() { return stream(); } } }, 'R1_MODEL_CAPABILITY_MISSING'],
    ['mixed model response', { model: { descriptor: { adapterId: 'fake', modelId: 'fake', capabilities: capabilities() }, stream() { return stream({ type: 'text_delta', text: 'text' }, { type: 'tool_call', call: { callId, toolId: 'x', toolVersion: 1, arguments: {} } }, { type: 'completed' }); } } }, 'R1_MODEL_RESPONSE_UNSUPPORTED'],
    ['adapter failure', { model: { descriptor: { adapterId: 'fake', modelId: 'fake', capabilities: capabilities() }, stream() { return stream({ type: 'failed', error: { code: 'remote', message: 'hidden' } }); } } }, 'R1_MODEL_ADAPTER_FAILED']
  ] as const)('maps %s to stable failure', async (_name, overrides, failure) => {
    const { loop } = loopFor(overrides);
    await expect(loop.execute(validRequest, new AbortController().signal)).resolves.toMatchObject({ status: 'failed', failure: { code: failure } });
  });

  it('feeds a failed tool result to the next model turn', async () => {
    const requests: ModelRequest[] = [];
    const { loop } = loopFor({
      model: { descriptor: { adapterId: 'fake', modelId: 'fake', capabilities: capabilities() }, stream(request) { requests.push(request); return requests.length === 1 ? stream({ type: 'tool_call', call: { callId, toolId: 'x', toolVersion: 1, arguments: {} } }, { type: 'completed' }) : stream({ type: 'text_delta', text: 'recovered' }, { type: 'completed' }); } },
      toolExecutionHarness: { async execute() { return { ok: false, callId, error: { code: 'R1_TOOL_UNKNOWN', message: 'Tool is not registered.' } }; } }
    });
    await expect(loop.execute(validRequest, new AbortController().signal)).resolves.toMatchObject({ status: 'completed', stepCount: 2 });
    expect(requests[1]?.previousToolResults).toEqual([{ ok: false, callId, error: { code: 'R1_TOOL_UNKNOWN', message: 'Tool is not registered.' } }]);
  });

  it('rejects a duplicate model call ID across responses before another execution', async () => {
    let executions = 0;
    let turns = 0;
    const { loop } = loopFor({
      model: { descriptor: { adapterId: 'fake', modelId: 'fake', capabilities: capabilities() }, stream() { turns++; return stream({ type: 'tool_call', call: { callId, toolId: 'x', toolVersion: 1, arguments: {} } }, { type: 'completed' }); } },
      toolExecutionHarness: { async execute() { executions++; return { ok: false, callId, error: { code: 'R1_TOOL_UNKNOWN', message: 'Tool is not registered.' } }; } }
    });
    await expect(loop.execute({ ...validRequest, maxSteps: 2 }, new AbortController().signal)).resolves.toMatchObject({ status: 'failed', failure: { code: 'R1_MODEL_RESPONSE_UNSUPPORTED' } });
    expect([turns, executions]).toEqual([2, 1]);
  });

  it('maps standalone event persistence failure without claiming a later projection', async () => {
    const { loop, transitions } = loopFor({ eventStore: { async append() { throw new Error('db hidden'); }, async findBySessionId() { return []; } } });
    await expect(loop.execute(validRequest, new AbortController().signal)).resolves.toMatchObject({ status: 'failed', failure: { code: 'R1_PERSISTENCE_FAILED' } });
    expect(transitions).toEqual(['preparing_context']);
  });

  it('maps a projection transition failure to persistence failed', async () => {
    const { loop } = loopFor({ agentRunStore: { async createWithInitialEvent() {}, async transitionWithEvent() { throw new Error('db hidden'); }, async findById() { return null; } } });
    await expect(loop.execute(validRequest, new AbortController().signal)).resolves.toMatchObject({ status: 'failed', failure: { code: 'R1_PERSISTENCE_FAILED' } });
  });

  it.each(['context', 'adapter', 'tool'] as const)('cancels during %s with one terminal event and no later operation', async (phase) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let entered!: () => void;
    const enteredGate = new Promise<void>((resolve) => { entered = resolve; });
    let modelCalls = 0;
    let toolCalls = 0;
    const contextAssembler = { async assemble() { if (phase === 'context') { entered(); await gate; } return { modelContent: [], sources: [], totalBytes: 0 }; } };
    const model: ModelAdapter = { descriptor: { adapterId: 'fake', modelId: 'fake', capabilities: capabilities() }, stream() { modelCalls++; return phase === 'adapter' ? (async function* () { entered(); await gate; yield { type: 'text_delta', text: 'late' } as const; yield { type: 'completed' } as const; })() : stream({ type: 'tool_call', call: { callId, toolId: 'x', toolVersion: 1, arguments: {} } }, { type: 'completed' }); } };
    const toolExecutionHarness = { async execute() { toolCalls++; if (phase === 'tool') { entered(); await gate; } return { ok: false as const, callId, error: { code: 'R1_TOOL_UNKNOWN', message: 'Tool is not registered.' } }; } };
    const { loop, events } = loopFor({ contextAssembler, model, toolExecutionHarness });
    const controller = new AbortController();
    const running = loop.execute(validRequest, controller.signal);
    await enteredGate;
    controller.abort(); release();
    await expect(running).resolves.toMatchObject({ status: 'cancelled', failure: { code: 'R1_CANCELLED' } });
    expect(events.filter((event) => event.eventType === 'agent_run.cancelled')).toHaveLength(1);
    expect(phase === 'context' ? [modelCalls, toolCalls] : phase === 'adapter' ? [modelCalls, toolCalls] : [modelCalls, toolCalls]).toEqual(phase === 'context' ? [0, 0] : phase === 'adapter' ? [1, 0] : [1, 1]);
  });
});
