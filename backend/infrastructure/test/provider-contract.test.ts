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

interface GeminiContentFixture {
  readonly role: string;
  readonly parts: readonly unknown[];
}

function geminiContents(sent: readonly unknown[], index: number): readonly GeminiContentFixture[] {
  const body = sent[index];
  if (typeof body !== 'object' || body === null) throw new Error('Expected Gemini contents');
  const contents = (body as Record<string, unknown>).contents;
  if (!Array.isArray(contents)) throw new Error('Expected Gemini contents');
  return contents.map((content: unknown) => {
    if (typeof content !== 'object' || content === null) throw new Error('Expected Gemini content');
    const record = content as Record<string, unknown>;
    if (typeof record.role !== 'string' || !Array.isArray(record.parts)) throw new Error('Expected Gemini content');
    return { role: record.role, parts: record.parts };
  });
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
      if (turn++ === 0) {
        yield {
          candidates: [{
            content: {
              role: 'model',
              parts: [{ functionCall: { name: 'codryn_file_read_v1', args: { path: 'README.md' } } }]
            }
          }],
          usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2 }
        };
        yield { candidates: [{ content: { parts: [{ text: '' }] }, finishReason: 'STOP' }] };
      } else yield { candidates: [{ content: { parts: [{ text: 'done' }] }, finishReason: 'STOP' }] };
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

  it('removes JSON Schema keywords unsupported by Gemini function declarations', async () => {
    const sent: unknown[] = [];
    const transport: ProviderTransport = { async *stream(input) {
      sent.push(input.body);
      yield { candidates: [{ content: { parts: [{ text: 'done' }] }, finishReason: 'STOP' }] };
    } };
    const adapter = new GeminiAdapter({ modelId: 'fixture', key: () => 'key', transport, ids });
    const firstTool = request.tools[0];
    if (firstTool === undefined) throw new Error('Expected one request tool');
    const schemaRequest: ModelRequest = {
      ...request,
      tools: [{ ...firstTool, inputSchema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', additionalProperties: false,
        properties: { value: { type: 'number', exclusiveMinimum: 0 } }
      } }]
    };

    await collectModelResponse(adapter.stream(schemaRequest, new AbortController().signal), new AbortController().signal);

    expect(JSON.stringify(sent[0])).not.toContain('$schema');
    expect(JSON.stringify(sent[0])).not.toContain('additionalProperties');
    expect(JSON.stringify(sent[0])).not.toContain('exclusiveMinimum');
  });

  it('sets the configured Gemini thinking level in generationConfig', async () => {
    const sent: unknown[] = [];
    const transport: ProviderTransport = { async *stream(input) {
      sent.push(input.body);
      yield { candidates: [{ content: { parts: [{ text: 'done' }] }, finishReason: 'STOP' }] };
    } };
    const adapter = new GeminiAdapter({ modelId: 'gemini-3.6-flash', key: () => 'key', transport, ids, thinkingLevel: 'minimal' });

    await collectModelResponse(adapter.stream(request, new AbortController().signal), new AbortController().signal);

    expect(sent[0]).toMatchObject({ generationConfig: { thinkingConfig: { thinkingLevel: 'minimal' } } });
    expect(sent[0]).not.toMatchObject({ generationConfig: { temperature: expect.anything() } });
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

  it('serializes complete Gemini parts per run turn and returns each matching function call id', async () => {
    const sent: unknown[] = [];
    let turn = 0;
    const localIds = (() => {
      const values = [
        'a1111111-1111-4111-8111-111111111111',
        'a2222222-2222-4222-8222-222222222222'
      ];
      let index = 0;
      return { next: () => values[index++] ?? 'a1111111-1111-4111-8111-111111111111' };
    })();
    const transport: ProviderTransport = { async *stream(input) {
      sent.push(input.body);
      if (turn++ === 0) {
        yield { candidates: [{ content: { role: 'model', parts: [{ text: 'First ' }] } }] };
        yield { candidates: [{ content: { role: 'model', parts: [{ text: 'turn' }, { thoughtSignature: 'opaque-thought-1', functionCall: { id: 'gemini-call-1', name: 'codryn_file_read_v1', args: { path: 'first.md' } } }] }, finishReason: 'STOP' }] };
      } else if (turn === 2) {
        yield { candidates: [{ content: { role: 'model', parts: [{ functionCall: { id: 'gemini-call-2', name: 'codryn_file_read_v1', args: { path: 'second.md' } } }] }, finishReason: 'STOP' }] };
      } else {
        yield { candidates: [{ content: { role: 'model', parts: [{ text: 'done' }] }, finishReason: 'STOP' }] };
      }
    } };
    const adapter = new GeminiAdapter({ modelId: 'fixture', key: () => 'key', transport, ids: localIds });

    const first = await collectModelResponse(adapter.stream(request, new AbortController().signal), new AbortController().signal, { allowCommentaryWithToolCalls: true });
    if (first.kind !== 'tool_calls') throw new Error('Expected first tool call');
    const firstCall = first.calls[0];
    if (firstCall === undefined) throw new Error('Expected first call details');
    const secondRequest: ModelRequest = {
      ...request,
      history: [
        { kind: 'assistant', text: 'First turn', calls: [...first.calls] },
        { kind: 'tool', result: { ok: true, callId: firstCall.callId, output: { content: 'first' } } }
      ]
    };
    const second = await collectModelResponse(adapter.stream(secondRequest, new AbortController().signal), new AbortController().signal);
    if (second.kind !== 'tool_calls') throw new Error('Expected second tool call');
    const secondCall = second.calls[0];
    if (secondCall === undefined) throw new Error('Expected second call details');
    const thirdRequest: ModelRequest = {
      ...request,
      history: [
        ...(secondRequest.history ?? []),
        { kind: 'assistant', text: '', calls: [...second.calls] },
        { kind: 'tool', result: { ok: true, callId: secondCall.callId, output: { content: 'second' } } }
      ]
    };

    await expect(collectModelResponse(adapter.stream(thirdRequest, new AbortController().signal), new AbortController().signal)).resolves.toMatchObject({ kind: 'final', text: 'done' });

    expect(geminiContents(sent, 2)).toEqual([
      { role: 'user', parts: [{ text: 'Read the fixture.' }] },
      { role: 'model', parts: [
        { text: 'First ' },
        { text: 'turn' },
        { thoughtSignature: 'opaque-thought-1', functionCall: { id: 'gemini-call-1', name: 'codryn_file_read_v1', args: { path: 'first.md' } } }
      ] },
      { role: 'user', parts: [{ functionResponse: { name: 'codryn_file_read_v1', id: 'gemini-call-1', response: { result: { ok: true, callId: firstCall.callId, output: { content: 'first' } } } } }] },
      { role: 'model', parts: [{ functionCall: { id: 'gemini-call-2', name: 'codryn_file_read_v1', args: { path: 'second.md' } } }] },
      { role: 'user', parts: [{ functionResponse: { name: 'codryn_file_read_v1', id: 'gemini-call-2', response: { result: { ok: true, callId: secondCall.callId, output: { content: 'second' } } } } }] }
    ]);
  });

  it.each([
    ['ends without a finish reason', undefined],
    ['ends at the token limit', 'MAX_TOKENS']
  ])('buffers Gemini output when the provider %s', async (_label, finishReason) => {
    const emitted: unknown[] = [];
    const adapter = new GeminiAdapter({
      modelId: 'fixture', key: () => 'key', ids,
      transport: { async *stream() {
        yield {
          candidates: [{
            content: { parts: [{ text: 'partial' }, { functionCall: { id: 'unfinished-call', name: 'codryn_file_read_v1', args: { path: 'partial.md' } } }] },
            ...(finishReason === undefined ? {} : { finishReason })
          }]
        };
      } }
    });

    await expect((async () => {
      for await (const event of adapter.stream(request, new AbortController().signal)) emitted.push(event);
    })()).rejects.toMatchObject({ code: 'provider_error' });
    expect(emitted).toEqual([]);
  });

  it('rejects Gemini model parts after STOP without emitting a response', async () => {
    const emitted: unknown[] = [];
    const adapter = new GeminiAdapter({
      modelId: 'fixture', key: () => 'key', ids,
      transport: { async *stream() {
        yield { candidates: [{ content: { parts: [{ text: 'done' }] }, finishReason: 'STOP' }] };
        yield { candidates: [{ content: { parts: [{ text: 'late' }] } }] };
      } }
    });

    await expect((async () => {
      for await (const event of adapter.stream(request, new AbortController().signal)) emitted.push(event);
    })()).rejects.toMatchObject({ code: 'provider_error' });
    expect(emitted).toEqual([]);
  });

  it('keeps interleaved Gemini run histories isolated after a multi-chunk transport failure', async () => {
    const sent: unknown[] = [];
    const runA: ModelRequest = { ...request, runId: 'a3333333-3333-4333-8333-333333333333' };
    const runB: ModelRequest = { ...request, runId: 'b3333333-3333-4333-8333-333333333333' };
    let turn = 0;
    const transport: ProviderTransport = { async *stream(input) {
      sent.push(input.body);
      if (turn++ === 0) yield { candidates: [{ content: { parts: [{ thoughtSignature: 'thought-a', functionCall: { id: 'provider-a', name: 'codryn_file_read_v1', args: { path: 'a.md' } } }] }, finishReason: 'STOP' }] };
      else if (turn === 2) yield { candidates: [{ content: { parts: [{ functionCall: { id: 'provider-b', name: 'codryn_file_read_v1', args: { path: 'b.md' } } }] }, finishReason: 'STOP' }] };
      else if (turn === 3) {
        yield { candidates: [{ content: { parts: [{ text: 'partial ' }] } }] };
        yield { candidates: [{ content: { parts: [{ thoughtSignature: 'discard-this' }] } }] };
        throw new Error('transport disconnected');
      } else yield { candidates: [{ content: { parts: [{ text: 'recovered' }] }, finishReason: 'STOP' }] };
    } };
    const adapter = new GeminiAdapter({ modelId: 'fixture', key: () => 'key', transport, ids });
    const first = await collectModelResponse(adapter.stream(runA, new AbortController().signal), new AbortController().signal);
    const second = await collectModelResponse(adapter.stream(runB, new AbortController().signal), new AbortController().signal);
    if (first.kind !== 'tool_calls' || second.kind !== 'tool_calls') throw new Error('Expected tool calls');
    const firstCall = first.calls[0];
    if (firstCall === undefined) throw new Error('Expected first call');
    const resumeA: ModelRequest = { ...runA, history: [
      { kind: 'assistant', text: '', calls: [...first.calls] },
      { kind: 'tool', result: { ok: true, callId: firstCall.callId, output: { content: 'a result' } } }
    ] };
    const emitted: unknown[] = [];
    await expect((async () => {
      for await (const event of adapter.stream(resumeA, new AbortController().signal)) emitted.push(event);
    })()).rejects.toMatchObject({ code: 'provider_error' });
    expect(emitted).toEqual([]);

    await expect(collectModelResponse(adapter.stream(resumeA, new AbortController().signal), new AbortController().signal)).resolves.toMatchObject({ kind: 'final', text: 'recovered' });
    expect(geminiContents(sent, 3)).toEqual([
      { role: 'user', parts: [{ text: 'Read the fixture.' }] },
      { role: 'model', parts: [{ thoughtSignature: 'thought-a', functionCall: { id: 'provider-a', name: 'codryn_file_read_v1', args: { path: 'a.md' } } }] },
      { role: 'user', parts: [{ functionResponse: { name: 'codryn_file_read_v1', id: 'provider-a', response: { result: { ok: true, callId: firstCall.callId, output: { content: 'a result' } } } } }] }
    ]);
  });

  it('rejects concurrent Gemini streams for one run', async () => {
    let release: () => void = () => undefined;
    const unblock = new Promise<void>((resolve) => { release = resolve; });
    let started: () => void = () => undefined;
    const startedStream = new Promise<void>((resolve) => { started = resolve; });
    let streamCount = 0;
    const adapter = new GeminiAdapter({
      modelId: 'fixture', key: () => 'key', ids,
      transport: { async *stream() {
        if (streamCount++ === 0) {
          started();
          await unblock;
        }
        yield { candidates: [{ content: { parts: [{ text: 'done' }] }, finishReason: 'STOP' }] };
      } }
    });
    const first = (async () => {
      for await (const event of adapter.stream(request, new AbortController().signal)) void event;
    })();
    await startedStream;

    let concurrentError: unknown;
    try {
      for await (const event of adapter.stream(request, new AbortController().signal)) void event;
    } catch (error) { concurrentError = error; }
    release();
    await expect(first).resolves.toBeUndefined();
    expect(concurrentError).toMatchObject({ code: 'provider_error' });
  });

  it('evicts the oldest unfinished Gemini run history', async () => {
    let calls = 0;
    const adapter = new GeminiAdapter({
      modelId: 'fixture', key: () => 'key', ids,
      transport: { async *stream() {
        calls += 1;
        yield { candidates: [{ content: { parts: [{ functionCall: { id: `provider-${calls}`, name: 'codryn_file_read_v1', args: { path: `${calls}.md` } } }] }, finishReason: 'STOP' }] };
      } }
    });
    let oldest: { readonly request: ModelRequest; readonly callId: string } | undefined;
    for (let index = 0; index < 33; index += 1) {
      const run = { ...request, runId: `a${index.toString(16).padStart(7, '0')}-1111-4111-8111-111111111111` };
      const response = await collectModelResponse(adapter.stream(run, new AbortController().signal), new AbortController().signal);
      if (response.kind !== 'tool_calls') throw new Error('Expected tool call');
      const call = response.calls[0];
      if (call === undefined) throw new Error('Expected call details');
      if (index === 0) oldest = { request: run, callId: call.callId };
    }
    if (oldest === undefined) throw new Error('Expected oldest run');
    const oldHistory: ModelRequest = { ...oldest.request, history: [
      { kind: 'assistant', text: '', calls: [{ callId: oldest.callId, toolId: 'file.read', toolVersion: 1, arguments: { path: '1.md' } }] },
      { kind: 'tool', result: { ok: true, callId: oldest.callId, output: { content: 'old' } } }
    ] };
    await expect((async () => {
      for await (const event of adapter.stream(oldHistory, new AbortController().signal)) void event;
    })()).rejects.toMatchObject({ code: 'invalid_tool_call' });
  });

  it('cleans Gemini run state after a final turn', async () => {
    let turn = 0;
    const sent: unknown[] = [];
    const adapter = new GeminiAdapter({
      modelId: 'fixture', key: () => 'key', ids,
      transport: { async *stream(input) {
        sent.push(input.body);
        if (turn++ === 0) yield { candidates: [{ content: { parts: [{ functionCall: { id: 'cleanup-call', name: 'codryn_file_read_v1', args: { path: 'cleanup.md' } } }] }, finishReason: 'STOP' }] };
        else yield { candidates: [{ content: { parts: [{ text: 'done' }] }, finishReason: 'STOP' }] };
      } }
    });
    const first = await collectModelResponse(adapter.stream(request, new AbortController().signal), new AbortController().signal);
    if (first.kind !== 'tool_calls') throw new Error('Expected tool call');
    const call = first.calls[0];
    if (call === undefined) throw new Error('Expected call details');
    const history: ModelRequest = { ...request, history: [
      { kind: 'assistant', text: '', calls: [...first.calls] },
      { kind: 'tool', result: { ok: true, callId: call.callId, output: { content: 'cleanup' } } }
    ] };
    await expect(collectModelResponse(adapter.stream(history, new AbortController().signal), new AbortController().signal)).resolves.toMatchObject({ kind: 'final', text: 'done' });
    await expect((async () => {
      for await (const event of adapter.stream(history, new AbortController().signal)) void event;
    })()).rejects.toMatchObject({ code: 'invalid_tool_call' });
    expect(sent).toHaveLength(2);
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
