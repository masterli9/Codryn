import { Buffer } from 'node:buffer';
import { modelToolCallSchema, type ModelRequest, type ModelStreamEvent, type ModelDescriptor, type ModelToolDefinition } from '@codryn/shared';
import type { IdGenerator, ModelAdapter } from '@codryn/core';
import { ProviderTransportError, type ProviderTransport } from './provider-transport.js';
import { ProviderAdapterError, normalizeProviderError, providerStatus } from './provider-errors.js';
import { externalToolMap, externalToolName } from './provider-tool-names.js';

export interface ProviderAdapterOptions {
  readonly modelId: string;
  readonly key: () => string;
  readonly transport: ProviderTransport;
  readonly ids: IdGenerator;
  readonly reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high';
}

interface CallState { readonly toolId: string; readonly toolVersion: number; readonly externalId: string; }

function descriptor(modelId: string): ModelDescriptor {
  return {
    adapterId: 'openai-responses', modelId,
    capabilities: {
      streaming: 'supported', toolCalling: 'supported', structuredOutput: 'unknown',
      imageInput: 'unsupported', usageMetadata: 'supported', contextLimit: 'unknown', compaction: 'unsupported'
    }
  };
}

function functionTools(request: ModelRequest): unknown[] {
  return request.tools.map((tool) => ({ type: 'function', name: externalToolName(tool.toolId, tool.toolVersion), description: tool.description, parameters: tool.inputSchema, strict: false }));
}

function inputItems(request: ModelRequest, externalByInternal: ReadonlyMap<string, string>, tools: ReadonlyMap<string, ModelToolDefinition>): unknown[] {
  const items: unknown[] = [{ role: 'user', content: [{ type: 'input_text', text: request.task }] }];
  for (const source of request.context) items.push({ role: 'user', content: [{ type: 'input_text', text: `Context ${source.path}:\n${source.content}` }] });
  for (const turn of request.history ?? []) {
    if (turn.kind === 'assistant') {
      if (turn.text.length > 0) items.push({ role: 'assistant', content: [{ type: 'output_text', text: turn.text }] });
      for (const call of turn.calls) {
        const externalId = externalByInternal.get(call.callId);
        const tool = tools.get(externalToolName(call.toolId, call.toolVersion));
        if (externalId === undefined || tool?.toolId !== call.toolId || tool.toolVersion !== call.toolVersion) throw new ProviderAdapterError('invalid_tool_call');
        items.push({ type: 'function_call', call_id: externalId, name: externalToolName(call.toolId, call.toolVersion), arguments: JSON.stringify(call.arguments) });
      }
    } else {
      const externalId = externalByInternal.get(turn.result.callId);
      if (externalId === undefined) throw new ProviderAdapterError('invalid_tool_call');
      items.push({ type: 'function_call_output', call_id: externalId, output: JSON.stringify(turn.result) });
    }
  }
  return items;
}

export class OpenAIResponsesAdapter implements ModelAdapter {
  readonly descriptor: ModelDescriptor;
  private readonly externalByInternal = new Map<string, string>();
  private readonly calls = new Map<string, CallState>();

  constructor(private readonly options: ProviderAdapterOptions, private readonly endpoint = 'https://api.openai.com/v1/responses') {
    this.descriptor = descriptor(options.modelId);
  }

  async *stream(request: ModelRequest, signal: AbortSignal): AsyncIterable<ModelStreamEvent> {
    const key = this.options.key();
    if (key.length === 0) throw new ProviderAdapterError('auth');
    let events: AsyncIterable<unknown>;
    let tools: Map<string, ModelToolDefinition>;
    try {
      tools = externalToolMap(request.tools);
      events = this.options.transport.stream({
        url: this.endpoint,
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: {
          model: this.options.modelId,
          store: false,
          stream: true,
          input: inputItems(request, this.externalByInternal, tools),
          tools: functionTools(request),
          parallel_tool_calls: false,
          max_output_tokens: 4096,
          ...(this.options.reasoningEffort === undefined ? {} : { reasoning: { effort: this.options.reasoningEffort } })
        }
      }, signal);
    } catch (error) {
      throw this.normalize(error);
    }
    try {
      for await (const raw of events) {
        const event = raw as Record<string, unknown>;
        const type = event.type;
        if (type === 'response.output_text.delta' && typeof event.delta === 'string') yield { type: 'text_delta', text: event.delta };
        else if (type === 'response.output_item.added') {
          const item = event.item as Record<string, unknown> | undefined;
          if (item?.type === 'function_call' && typeof item.call_id === 'string' && typeof item.name === 'string' && typeof item.id === 'string') {
            const tool = tools.get(item.name);
            if (tool === undefined) throw new ProviderAdapterError('invalid_tool_call');
            this.calls.set(item.id, { toolId: tool.toolId, toolVersion: tool.toolVersion, externalId: item.call_id });
            this.externalByInternal.set(item.id, item.call_id);
          }
        } else if (type === 'response.function_call_arguments.done') {
          const itemId = typeof event.item_id === 'string' ? event.item_id : '';
          const state = this.calls.get(itemId);
          if (state === undefined || typeof event.arguments !== 'string') throw new ProviderAdapterError('invalid_tool_call');
          if (Buffer.byteLength(event.arguments, 'utf8') > 64 * 1024) throw new ProviderAdapterError('invalid_tool_call');
          let args: unknown;
          try { args = JSON.parse(event.arguments); } catch { throw new ProviderAdapterError('invalid_tool_call'); }
          const call = modelToolCallSchema.parse({ callId: this.options.ids.next(), toolId: state.toolId, toolVersion: state.toolVersion, arguments: args });
          this.externalByInternal.set(call.callId, state.externalId);
          yield { type: 'tool_call', call };
        } else if (type === 'response.completed') {
          const response = event.response as Record<string, unknown> | undefined;
          const usage = response?.usage as Record<string, unknown> | undefined;
          if (usage !== undefined && typeof usage.input_tokens === 'number' && typeof usage.output_tokens === 'number') yield { type: 'usage', inputTokens: usage.input_tokens, outputTokens: usage.output_tokens };
          yield { type: 'completed' };
        } else if (type === 'response.failed' || type === 'error') {
          throw this.normalize(event);
        }
      }
    } catch (error) {
      if (signal.aborted) throw new ProviderAdapterError('interrupted');
      if (error instanceof ProviderAdapterError) throw error;
      throw this.normalize(error);
    }
  }

  private normalize(error: unknown): ProviderAdapterError {
    if (error instanceof ProviderTransportError) return new ProviderAdapterError(error.code);
    return new ProviderAdapterError(normalizeProviderError(providerStatus(error), false));
  }
}
