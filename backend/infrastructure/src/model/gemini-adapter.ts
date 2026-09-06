import { Buffer } from 'node:buffer';
import { modelToolCallSchema, type ModelDescriptor, type ModelRequest, type ModelStreamEvent } from '@codryn/shared';
import type { ModelAdapter } from '@codryn/core';
import { ProviderAdapterError, normalizeProviderError, providerStatus } from './provider-errors.js';
import { ProviderTransportError } from './provider-transport.js';
import type { ProviderAdapterOptions } from './openai-responses-adapter.js';
import { externalToolMap, externalToolName } from './provider-tool-names.js';
import type { ModelToolDefinition } from '@codryn/shared';

function descriptor(modelId: string): ModelDescriptor {
  return {
    adapterId: 'gemini-generate-content', modelId,
    capabilities: {
      streaming: 'supported', toolCalling: 'supported', structuredOutput: 'unknown',
      imageInput: 'unsupported', usageMetadata: 'supported', contextLimit: 'unknown', compaction: 'unsupported'
    }
  };
}

function tools(request: ModelRequest): unknown[] {
  return [{ functionDeclarations: request.tools.map((tool) => ({ name: externalToolName(tool.toolId, tool.toolVersion), description: tool.description, parameters: tool.inputSchema })) }];
}

export class GeminiAdapter implements ModelAdapter {
  readonly descriptor: ModelDescriptor;
  private readonly externalByInternal = new Map<string, string>();
  private lastAssistantParts: unknown[] = [];

  constructor(private readonly options: ProviderAdapterOptions, private readonly endpoint = 'https://generativelanguage.googleapis.com/v1beta/models') {
    this.descriptor = descriptor(options.modelId);
  }

  async *stream(request: ModelRequest, signal: AbortSignal): AsyncIterable<ModelStreamEvent> {
    const key = this.options.key();
    if (key.length === 0) throw new ProviderAdapterError('auth');
    let toolMap: Map<string, ModelToolDefinition>;
    try { toolMap = externalToolMap(request.tools); } catch (error) { throw this.normalize(error); }
    const contents: unknown[] = [{ role: 'user', parts: [{ text: request.task }] }];
    for (const source of request.context) contents.push({ role: 'user', parts: [{ text: `Context ${source.path}:\n${source.content}` }] });
    for (const turn of request.history ?? []) {
      if (turn.kind === 'assistant') {
        for (const call of turn.calls) {
          const tool = toolMap.get(externalToolName(call.toolId, call.toolVersion));
          if (tool?.toolId !== call.toolId || tool.toolVersion !== call.toolVersion) throw new ProviderAdapterError('invalid_tool_call');
        }
        contents.push({ role: 'model', parts: this.lastAssistantParts.length > 0 ? this.lastAssistantParts : [{ text: turn.text }] });
      } else {
        const externalId = this.externalByInternal.get(turn.result.callId);
        if (externalId === undefined) throw new ProviderAdapterError('invalid_tool_call');
        contents.push({ role: 'user', parts: [{ functionResponse: { name: externalId, response: { result: turn.result } } }] });
      }
    }
    let events: AsyncIterable<unknown>;
    let usage: { inputTokens: number; outputTokens: number } | undefined;
    try {
      events = this.options.transport.stream({
        url: `${this.endpoint}/${encodeURIComponent(this.options.modelId)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`,
        headers: { 'content-type': 'application/json' },
        body: { contents, tools: tools(request), generationConfig: { temperature: 0, maxOutputTokens: 4096 } }
      }, signal);
    } catch (error) { throw this.normalize(error); }
    try {
      for await (const raw of events) {
        const payload = raw as Record<string, unknown>;
        if (payload.error !== undefined) throw this.normalize(payload.error);
        const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
        const content = candidates[0] as Record<string, unknown> | undefined;
        const parts = Array.isArray(content?.content && (content.content as Record<string, unknown>).parts)
          ? (content?.content as Record<string, unknown>).parts as unknown[] : [];
        this.lastAssistantParts = parts;
        for (const rawPart of parts) {
          const part = rawPart as Record<string, unknown>;
          if (typeof part.text === 'string') yield { type: 'text_delta', text: part.text };
          const functionCall = part.functionCall as Record<string, unknown> | undefined;
          if (functionCall !== undefined && typeof functionCall.name === 'string') {
            const tool = toolMap.get(functionCall.name);
            if (tool === undefined) throw new ProviderAdapterError('invalid_tool_call');
            const externalId = functionCall.name;
            if (Buffer.byteLength(JSON.stringify(functionCall.args ?? {}), 'utf8') > 64 * 1024) throw new ProviderAdapterError('invalid_tool_call');
            const call = modelToolCallSchema.parse({ callId: this.options.ids.next(), toolId: tool.toolId, toolVersion: tool.toolVersion, arguments: functionCall.args ?? {} });
            this.externalByInternal.set(call.callId, externalId);
            yield { type: 'tool_call', call };
          }
        }
        const usageMetadata = payload.usageMetadata as Record<string, unknown> | undefined;
        if (usageMetadata !== undefined && typeof usageMetadata.promptTokenCount === 'number' && typeof usageMetadata.candidatesTokenCount === 'number') {
          usage = { inputTokens: usageMetadata.promptTokenCount, outputTokens: usageMetadata.candidatesTokenCount };
        }
      }
      if (usage !== undefined) yield { type: 'usage', ...usage };
      yield { type: 'completed' };
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
