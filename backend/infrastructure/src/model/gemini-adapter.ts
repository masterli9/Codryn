import { Buffer } from 'node:buffer';
import { modelToolCallSchema, type ModelDescriptor, type ModelRequest, type ModelStreamEvent } from '@codryn/shared';
import type { ModelAdapter } from '@codryn/core';
import { ProviderAdapterError, normalizeProviderError, providerStatus } from './provider-errors.js';
import { ProviderHttpError, ProviderTransportError } from './provider-transport.js';
import type { ProviderAdapterOptions } from './openai-responses-adapter.js';
import { externalToolMap, externalToolName } from './provider-tool-names.js';
import type { ModelToolDefinition } from '@codryn/shared';

interface GeminiFunctionCallState {
  readonly name: string;
  readonly id?: string;
}

interface GeminiRunState {
  readonly assistantPartsByTurn: Map<number, readonly unknown[]>;
  readonly functionCallsByInternal: Map<string, GeminiFunctionCallState>;
}

const MAX_RUN_HISTORIES = 32;

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
  return [{ functionDeclarations: request.tools.map((tool) => ({ name: externalToolName(tool.toolId, tool.toolVersion), description: tool.description, parameters: geminiSchema(tool.inputSchema) })) }];
}

function geminiSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(geminiSchema);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !['$schema', 'additionalProperties', 'exclusiveMinimum', 'exclusiveMaximum'].includes(key))
      .map(([key, child]) => [key, geminiSchema(child)])
  );
}

export class GeminiAdapter implements ModelAdapter {
  readonly descriptor: ModelDescriptor;
  private readonly runs = new Map<string, GeminiRunState>();
  private readonly activeRuns = new Set<string>();

  constructor(private readonly options: ProviderAdapterOptions, private readonly endpoint = 'https://generativelanguage.googleapis.com/v1beta/models') {
    this.descriptor = descriptor(options.modelId);
  }

  async *stream(request: ModelRequest, signal: AbortSignal): AsyncIterable<ModelStreamEvent> {
    if (this.activeRuns.has(request.runId)) throw new ProviderAdapterError('provider_error');
    this.activeRuns.add(request.runId);
    try {
      yield* this.streamLocked(request, signal);
    } finally {
      this.activeRuns.delete(request.runId);
    }
  }

  private async *streamLocked(request: ModelRequest, signal: AbortSignal): AsyncIterable<ModelStreamEvent> {
    const key = this.options.key();
    if (key.length === 0) throw new ProviderAdapterError('auth');
    let toolMap: Map<string, ModelToolDefinition>;
    try { toolMap = externalToolMap(request.tools); } catch (error) { throw this.normalize(error); }
    const run = this.getRun(request.runId);
    const contents: unknown[] = [{ role: 'user', parts: [{ text: request.task }] }];
    for (const source of request.context) contents.push({ role: 'user', parts: [{ text: `Context ${source.path}:\n${source.content}` }] });
    let assistantTurnIndex = 0;
    for (const turn of request.history ?? []) {
      if (turn.kind === 'assistant') {
        for (const call of turn.calls) {
          const tool = toolMap.get(externalToolName(call.toolId, call.toolVersion));
          if (tool?.toolId !== call.toolId || tool.toolVersion !== call.toolVersion) throw new ProviderAdapterError('invalid_tool_call');
          if (run?.functionCallsByInternal.has(call.callId) !== true) throw new ProviderAdapterError('invalid_tool_call');
        }
        const storedParts = run?.assistantPartsByTurn.get(assistantTurnIndex++);
        if (storedParts === undefined && turn.calls.length > 0) throw new ProviderAdapterError('invalid_tool_call');
        contents.push({ role: 'model', parts: storedParts ?? [{ text: turn.text }] });
      } else {
        const functionCall = run?.functionCallsByInternal.get(turn.result.callId);
        if (functionCall === undefined) throw new ProviderAdapterError('invalid_tool_call');
        contents.push({
          role: 'user',
          parts: [{
            functionResponse: {
              name: functionCall.name,
              ...(functionCall.id === undefined ? {} : { id: functionCall.id }),
              response: { result: turn.result }
            }
          }]
        });
      }
    }
    let events: AsyncIterable<unknown>;
    let usage: { inputTokens: number; outputTokens: number } | undefined;
    try {
      events = this.options.transport.stream({
        url: `${this.endpoint}/${encodeURIComponent(this.options.modelId)}:streamGenerateContent?alt=sse`,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: {
          contents,
          tools: tools(request),
          generationConfig: {
            maxOutputTokens: 4096,
            ...(this.options.thinkingLevel === undefined && this.options.thinkingBudget === undefined
              ? {}
              : {
                  thinkingConfig: this.options.thinkingLevel === undefined
                    ? { thinkingBudget: this.options.thinkingBudget }
                    : { thinkingLevel: this.options.thinkingLevel }
                })
          }
        }
      }, signal);
    } catch (error) { throw this.normalize(error); }
    try {
      const responseParts: unknown[] = [];
      const bufferedEvents: ModelStreamEvent[] = [];
      const bufferedCalls = new Map<string, GeminiFunctionCallState>();
      let completed = false;
      for await (const raw of events) {
        const payload = raw as Record<string, unknown>;
        if (payload.error !== undefined) throw this.normalize(payload.error);
        const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
        if (completed) {
          const usageMetadata = payload.usageMetadata as Record<string, unknown> | undefined;
          if (candidates.length > 0 || usageMetadata === undefined || typeof usageMetadata.promptTokenCount !== 'number' || typeof usageMetadata.candidatesTokenCount !== 'number') {
            throw new ProviderAdapterError('provider_error');
          }
          usage = { inputTokens: usageMetadata.promptTokenCount, outputTokens: usageMetadata.candidatesTokenCount };
          continue;
        }
        const content = candidates[0] as Record<string, unknown> | undefined;
        const parts = Array.isArray(content?.content && (content.content as Record<string, unknown>).parts)
          ? (content?.content as Record<string, unknown>).parts as unknown[] : [];
        responseParts.push(...parts);
        const finishReason = content?.finishReason;
        if (finishReason !== undefined) {
          if (finishReason !== 'STOP' || completed) throw new ProviderAdapterError('provider_error');
          completed = true;
        }
        for (const rawPart of parts) {
          const part = rawPart as Record<string, unknown>;
          if (typeof part.text === 'string' && part.text.length > 0) bufferedEvents.push({ type: 'text_delta', text: part.text });
          const functionCall = part.functionCall as Record<string, unknown> | undefined;
          if (functionCall !== undefined && typeof functionCall.name === 'string') {
            const tool = toolMap.get(functionCall.name);
            if (tool === undefined) throw new ProviderAdapterError('invalid_tool_call');
            if (Buffer.byteLength(JSON.stringify(functionCall.args ?? {}), 'utf8') > 64 * 1024) throw new ProviderAdapterError('invalid_tool_call');
            const call = modelToolCallSchema.parse({ callId: this.options.ids.next(), toolId: tool.toolId, toolVersion: tool.toolVersion, arguments: functionCall.args ?? {} });
            bufferedCalls.set(call.callId, {
              name: functionCall.name,
              ...(typeof functionCall.id === 'string' ? { id: functionCall.id } : {})
            });
            bufferedEvents.push({ type: 'tool_call', call });
          }
        }
        const usageMetadata = payload.usageMetadata as Record<string, unknown> | undefined;
        if (usageMetadata !== undefined && typeof usageMetadata.promptTokenCount === 'number' && typeof usageMetadata.candidatesTokenCount === 'number') {
          usage = { inputTokens: usageMetadata.promptTokenCount, outputTokens: usageMetadata.candidatesTokenCount };
        }
      }
      if (!completed) throw new ProviderAdapterError('provider_error');
      if (bufferedCalls.size === 0) this.runs.delete(request.runId);
      else {
        const nextRun = run ?? this.createRun(request.runId);
        nextRun.assistantPartsByTurn.set(assistantTurnIndex, [...responseParts]);
        for (const [callId, functionCall] of bufferedCalls) nextRun.functionCallsByInternal.set(callId, functionCall);
      }
      for (const event of bufferedEvents) yield event;
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
    const httpStatus = error instanceof ProviderHttpError && error.status >= 100 && error.status <= 599
      ? error.status : null;
    return new ProviderAdapterError(normalizeProviderError(providerStatus(error), false), httpStatus);
  }

  private getRun(runId: string): GeminiRunState | undefined {
    const run = this.runs.get(runId);
    if (run !== undefined) {
      this.runs.delete(runId);
      this.runs.set(runId, run);
    }
    return run;
  }

  private createRun(runId: string): GeminiRunState {
    if (this.runs.size === MAX_RUN_HISTORIES) {
      const evictedRunId = Array.from(this.runs.keys()).find((candidate) => !this.activeRuns.has(candidate));
      if (evictedRunId === undefined) throw new ProviderAdapterError('provider_error');
      this.runs.delete(evictedRunId);
    }
    const run = { assistantPartsByTurn: new Map<number, readonly unknown[]>(), functionCallsByInternal: new Map<string, GeminiFunctionCallState>() };
    this.runs.set(runId, run);
    return run;
  }
}
