import { describe, expect, it } from 'vitest';
import { collectModelResponse } from '@codryn/core';
import { GeminiAdapter, OpenAIResponsesAdapter, ProviderAdapterError } from '../src/index.js';
import type { ProviderTransport } from '../src/model/provider-transport.js';
import { externalToolMap } from '../src/model/provider-tool-names.js';
import type { ModelRequest } from '@codryn/shared';

const ids = (() => {
  let index = 0;
  const values = [
    '91111111-1111-4111-8111-111111111111',
    '92222222-2222-4222-8222-222222222222'
  ];
  return { next: () => {
    const value = values[index++] ?? values[0];
    if (value === undefined) throw new Error('test id exhausted');
    return value;
  } };
})();

const request: ModelRequest = {
  runId: '93333333-3333-4333-8333-333333333333', task: 'Read the fixture.', project: { id: 'project' }, context: [],
  tools: [{ toolId: 'file.read', toolVersion: 1, description: 'Read a file.', inputSchema: { type: 'object' } }], previousToolResults: []
};

async function* failingStream(error: unknown): AsyncGenerator<unknown> {
  yield await Promise.reject(error);
}

function failingTransport(error: unknown): ProviderTransport {
  return { stream: () => failingStream(error) };
}

describe('R2 provider adapters', () => {
  it('preserves OpenAI external call_id across a tool result turn', async () => {
    const sent: unknown[] = [];
    let turn = 0;
    const transport: ProviderTransport = { async *stream(input) {
      sent.push(input.body);
      if (turn++ === 0) {
        yield { type: 'response.output_item.added', item: { type: 'function_call', id: 'item-1', call_id: 'call-1', name: 'codryn_file_read_v1' } };
        yield { type: 'response.function_call_arguments.done', item_id: 'item-1', arguments: '{"path":"README.md"}' };
        yield { type: 'response.completed', response: { usage: { input_tokens: 3, output_tokens: 2 } } };
      } else {
        yield { type: 'response.output_text.delta', delta: 'done' };
        yield { type: 'response.completed' };
      }
    } };
    const adapter = new OpenAIResponsesAdapter({ modelId: 'fixture', key: () => 'TEST_SECRET_CANARY', transport, ids });
    const first = await collectModelResponse(adapter.stream(request, new AbortController().signal), new AbortController().signal);
    expect(first).toMatchObject({ kind: 'tool_calls', usage: { inputTokens: 3, outputTokens: 2 } });
    expect(JSON.stringify(sent[0])).toContain('codryn_file_read_v1');
    if (first.kind !== 'tool_calls') throw new Error('Expected tool calls');
    const firstCall = first.calls[0];
    if (firstCall === undefined) throw new Error('Expected one call');
    expect(firstCall.toolId).toBe('file.read');
    const nextRequest: ModelRequest = { ...request, history: [{ kind: 'assistant', text: '', calls: [...first.calls] }, { kind: 'tool', result: { ok: true, callId: firstCall.callId, output: { content: 'safe' } } }] };
    await expect(collectModelResponse(adapter.stream(nextRequest, new AbortController().signal), new AbortController().signal)).resolves.toMatchObject({ kind: 'final', text: 'done' });
    expect(JSON.stringify(sent[0])).not.toContain('TEST_SECRET_CANARY');
    expect(JSON.stringify(sent[1])).toContain('call-1');
  });

  it('maps Gemini functionCall and sends a functionResponse on the next turn', async () => {
    const sent: unknown[] = [];
    let turn = 0;
    const transport: ProviderTransport = { async *stream(input) {
      sent.push(input.body);
      if (turn++ === 0) yield {
        candidates: [{
          content: {
            role: 'model',
            parts: [{ functionCall: { name: 'codryn_file_read_v1', args: { path: 'README.md' } } }]
          }
        }],
        usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2 }
      };
      else yield { candidates: [{ content: { parts: [{ text: 'done' }] } }] };
    } };
    const adapter = new GeminiAdapter({ modelId: 'fixture', key: () => 'TEST_SECRET_CANARY', transport, ids });
    const first = await collectModelResponse(adapter.stream(request, new AbortController().signal), new AbortController().signal);
    expect(first).toMatchObject({ kind: 'tool_calls', usage: { inputTokens: 4, outputTokens: 2 } });
    expect(JSON.stringify(sent[0])).toContain('codryn_file_read_v1');
    if (first.kind !== 'tool_calls') throw new Error('Expected tool calls');
    const firstCall = first.calls[0];
    if (firstCall === undefined) throw new Error('Expected one call');
    expect(firstCall.toolId).toBe('file.read');
    const nextRequest: ModelRequest = { ...request, history: [{ kind: 'assistant', text: '', calls: [...first.calls] }, { kind: 'tool', result: { ok: true, callId: firstCall.callId, output: { content: 'safe' } } }] };
    await collectModelResponse(adapter.stream(nextRequest, new AbortController().signal), new AbortController().signal);
    expect(JSON.stringify(sent[1])).toContain('functionResponse');
    expect(JSON.stringify(sent)).not.toContain('TEST_SECRET_CANARY');
  });

  it('rejects provider-invented function names before the harness can see a call', async () => {
    const openai = new OpenAIResponsesAdapter({
      modelId: 'fixture', key: () => 'key', ids,
      transport: { async *stream() {
        yield { type: 'response.output_item.added', item: { type: 'function_call', id: 'item-unknown', call_id: 'call-unknown', name: 'codryn_invented_v1' } };
      } }
    });
    await expect((async () => { for await (const event of openai.stream(request, new AbortController().signal)) { void event; } })())
      .rejects.toMatchObject({ code: 'invalid_tool_call' });

    const gemini = new GeminiAdapter({
      modelId: 'fixture', key: () => 'key', ids,
      transport: { async *stream() {
        yield { candidates: [{ content: { parts: [{ functionCall: { name: 'codryn_invented_v1', args: {} } }] } }] };
      } }
    });
    await expect((async () => { for await (const event of gemini.stream(request, new AbortController().signal)) { void event; } })())
      .rejects.toMatchObject({ code: 'invalid_tool_call' });
  });

  it('rejects internal tool IDs that would collide at the provider boundary', () => {
    expect(() => externalToolMap([
      { toolId: 'file.read', toolVersion: 1, description: 'one', inputSchema: {} },
      { toolId: 'file_read', toolVersion: 1, description: 'two', inputSchema: {} }
    ])).toThrow(ProviderAdapterError);
  });

  it.each([
    ['OpenAI auth', new OpenAIResponsesAdapter({ modelId: 'fixture', key: () => 'key', ids, transport: failingTransport(Object.assign(new Error('unauthorized'), { status: 401 })) }), 'auth'],
    ['OpenAI rate limit', new OpenAIResponsesAdapter({ modelId: 'fixture', key: () => 'key', ids, transport: failingTransport(Object.assign(new Error('limited'), { status: 429 })) }), 'rate_limit'],
    ['Gemini auth', new GeminiAdapter({ modelId: 'fixture', key: () => 'key', ids, transport: failingTransport(Object.assign(new Error('unauthenticated'), { code: 401 })) }), 'auth'],
    ['Gemini rate limit', new GeminiAdapter({ modelId: 'fixture', key: () => 'key', ids, transport: failingTransport(Object.assign(new Error('limited'), { error: { code: 429 } })) }), 'rate_limit']
  ])('normalizes %s', async (_label, adapter, code) => {
    await expect((async () => {
      for await (const event of adapter.stream(request, new AbortController().signal)) void event;
    })()).rejects.toMatchObject({ code });
  });
});
