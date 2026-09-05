import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ModelRequest,
  ModelStreamEvent,
  ModelToolDefinition,
  ToolResult
} from '@codryn/shared';
import {
  ScriptedModelAdapter,
  type FakeScenario,
  type FakeScenarioStep
} from '../src/index.js';

const searchTool: ModelToolDefinition = {
  toolId: 'project.search_text',
  toolVersion: 1,
  description: 'Search project text.',
  inputSchema: { type: 'object' }
};

const searchResult: ToolResult = {
  ok: true,
  callId: '11111111-1111-4111-8111-111111111111',
  output: { matches: [{ path: 'README.md', line: 1 }] }
};

function request(overrides: Partial<ModelRequest> = {}): ModelRequest {
  return {
    runId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    task: 'Inspect README.',
    project: { id: 'fixture' },
    context: [],
    tools: [searchTool],
    previousToolResults: [],
    ...overrides
  };
}

async function collect(events: AsyncIterable<ModelStreamEvent>): Promise<ModelStreamEvent[]> {
  const collected: ModelStreamEvent[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}

function twoTurnScenario(): FakeScenario {
  return {
    id: 'readme-two-turn',
    steps: [
      {
        assertRequest(value) {
          expect(value.tools.map(({ toolId, toolVersion }) => ({ toolId, toolVersion }))).toEqual([
            { toolId: 'project.search_text', toolVersion: 1 }
          ]);
          expect(value.previousToolResults).toEqual([]);
        },
        events: [
          {
            type: 'tool_call',
            call: {
              callId: '11111111-1111-4111-8111-111111111111',
              toolId: 'project.search_text',
              toolVersion: 1,
              arguments: { query: 'Codryn' }
            }
          },
          { type: 'completed' }
        ]
      },
      {
        assertRequest(value) {
          expect(value.tools).toEqual([searchTool]);
          expect(value.previousToolResults).toEqual([searchResult]);
        },
        events: [
          { type: 'text_delta', text: 'README describes Codryn.' },
          { type: 'usage', inputTokens: 24, outputTokens: 5 },
          { type: 'completed' }
        ]
      }
    ]
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ScriptedModelAdapter', () => {
  it('emits an exact deterministic two-turn scenario without network access', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const adapter = new ScriptedModelAdapter(twoTurnScenario());
    const signal = new AbortController().signal;

    await expect(collect(adapter.stream(request(), signal))).resolves.toEqual([
      {
        type: 'tool_call',
        call: {
          callId: '11111111-1111-4111-8111-111111111111',
          toolId: 'project.search_text',
          toolVersion: 1,
          arguments: { query: 'Codryn' }
        }
      },
      { type: 'completed' }
    ]);
    await expect(collect(adapter.stream(request({
      previousToolResults: [searchResult]
    }), signal))).resolves.toEqual([
      { type: 'text_delta', text: 'README describes Codryn.' },
      { type: 'usage', inputTokens: 24, outputTokens: 5 },
      { type: 'completed' }
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns a stable mismatch for a wrong tool list and does not advance the scenario', async () => {
    const adapter = new ScriptedModelAdapter(twoTurnScenario());
    const signal = new AbortController().signal;

    await expect(collect(adapter.stream(request({ tools: [] }), signal))).resolves.toEqual([{
      type: 'failed',
      error: {
        code: 'R1_FAKE_SCENARIO_MISMATCH',
        message: 'Scripted scenario request mismatch.'
      }
    }]);
    await expect(collect(adapter.stream(request(), signal))).resolves.toEqual([
      expect.objectContaining({ type: 'tool_call' }),
      { type: 'completed' }
    ]);
  });

  it('normalizes a non-Error request assertion mismatch without advancing', async () => {
    let shouldMismatch = true;
    const adapter = new ScriptedModelAdapter({
      id: 'non-error-mismatch',
      steps: [{
        assertRequest() {
          if (shouldMismatch) {
            throw { privatePath: 'C:\\Users\\private\\secret.txt' };
          }
        },
        events: [{ type: 'text_delta', text: 'Same step' }, { type: 'completed' }]
      }]
    });
    const signal = new AbortController().signal;

    await expect(collect(adapter.stream(request(), signal))).resolves.toEqual([{
      type: 'failed',
      error: {
        code: 'R1_FAKE_SCENARIO_MISMATCH',
        message: 'Scripted scenario request mismatch.'
      }
    }]);
    shouldMismatch = false;
    await expect(collect(adapter.stream(request(), signal))).resolves.toEqual([
      { type: 'text_delta', text: 'Same step' },
      { type: 'completed' }
    ]);
  });

  it('returns the same stable mismatch for a wrong previous result', async () => {
    const adapter = new ScriptedModelAdapter(twoTurnScenario());
    const signal = new AbortController().signal;
    await collect(adapter.stream(request(), signal));

    await expect(collect(adapter.stream(request({ previousToolResults: [] }), signal))).resolves.toEqual([{
      type: 'failed',
      error: {
        code: 'R1_FAKE_SCENARIO_MISMATCH',
        message: 'Scripted scenario request mismatch.'
      }
    }]);
  });

  it('returns a stable failure after all scripted turns are exhausted', async () => {
    const adapter = new ScriptedModelAdapter({ id: 'empty', steps: [] });

    await expect(collect(adapter.stream(request(), new AbortController().signal))).resolves.toEqual([{
      type: 'failed',
      error: {
        code: 'R1_FAKE_SCENARIO_MISMATCH',
        message: 'Scripted scenario exhausted.'
      }
    }]);
  });

  it('clones scenario arrays so later caller mutations cannot alter emitted events', async () => {
    const nestedArguments = { nested: { query: 'Original' } };
    const events: ModelStreamEvent[] = [
      {
        type: 'tool_call',
        call: {
          callId: '11111111-1111-4111-8111-111111111111',
          toolId: 'project.search_text',
          toolVersion: 1,
          arguments: nestedArguments
        }
      },
      { type: 'completed' }
    ];
    const steps: FakeScenarioStep[] = [{ assertRequest() {}, events }];
    const adapter = new ScriptedModelAdapter({ id: 'immutable', steps });

    nestedArguments.nested.query = 'Mutated';
    events.splice(0, events.length, { type: 'failed', error: { code: 'MUTATED', message: 'Mutated.' } });
    steps.splice(0, steps.length);

    await expect(collect(adapter.stream(request(), new AbortController().signal))).resolves.toEqual([
      {
        type: 'tool_call',
        call: {
          callId: '11111111-1111-4111-8111-111111111111',
          toolId: 'project.search_text',
          toolVersion: 1,
          arguments: { nested: { query: 'Original' } }
        }
      },
      { type: 'completed' }
    ]);
  });

  it('exposes a deeply frozen descriptor with deterministic capabilities', () => {
    const adapter = new ScriptedModelAdapter({ id: 'descriptor', steps: [] });

    expect(adapter.descriptor).toEqual({
      adapterId: 'scripted-fake',
      modelId: 'descriptor',
      capabilities: {
        streaming: 'supported',
        toolCalling: 'supported',
        structuredOutput: 'unknown',
        imageInput: 'unsupported',
        usageMetadata: 'supported',
        contextLimit: 'unknown',
        compaction: 'unsupported'
      }
    });
    expect(Object.isFrozen(adapter.descriptor)).toBe(true);
    expect(Object.isFrozen(adapter.descriptor.capabilities)).toBe(true);
  });
});
