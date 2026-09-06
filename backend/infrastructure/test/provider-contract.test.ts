import { describe, expect, it } from 'vitest';
import { collectModelResponse } from '@codryn/core';
import { GeminiAdapter, OpenAIResponsesAdapter } from '../src/index.js';
import type { ProviderTransport } from '../src/model/provider-transport.js';
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

describe('R2 provider adapters', () => {
  it('preserves OpenAI external call_id across a tool result turn', async () => {
    const sent: unknown[] = [];
    let turn = 0;
    const transport: ProviderTransport = { async *stream(input) {
      sent.push(input.body);
      if (turn++ === 0) {
        yield { type: 'response.output_item.added', item: { type: 'function_call', id: 'item-1', call_id: 'call-1', name: 'file.read' } };
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
    if (first.kind !== 'tool_calls') throw new Error('Expected tool calls');
    const firstCall = first.calls[0];
    if (firstCall === undefined) throw new Error('Expected one call');
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
            parts: [{ functionCall: { name: 'file.read', args: { path: 'README.md' } } }]
          }
        }],
        usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2 }
      };
      else yield { candidates: [{ content: { parts: [{ text: 'done' }] } }] };
    } };
    const adapter = new GeminiAdapter({ modelId: 'fixture', key: () => 'TEST_SECRET_CANARY', transport, ids });
    const first = await collectModelResponse(adapter.stream(request, new AbortController().signal), new AbortController().signal);
    expect(first).toMatchObject({ kind: 'tool_calls', usage: { inputTokens: 4, outputTokens: 2 } });
    if (first.kind !== 'tool_calls') throw new Error('Expected tool calls');
    const firstCall = first.calls[0];
    if (firstCall === undefined) throw new Error('Expected one call');
    const nextRequest: ModelRequest = { ...request, history: [{ kind: 'assistant', text: '', calls: [...first.calls] }, { kind: 'tool', result: { ok: true, callId: firstCall.callId, output: { content: 'safe' } } }] };
    await collectModelResponse(adapter.stream(nextRequest, new AbortController().signal), new AbortController().signal);
    expect(JSON.stringify(sent[1])).toContain('functionResponse');
    expect(JSON.stringify(sent)).not.toContain('TEST_SECRET_CANARY');
  });
});
