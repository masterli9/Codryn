import { Buffer } from 'node:buffer';
import {
  modelStreamEventSchema,
  type ModelStreamEvent,
  type ModelToolCall
} from '@codryn/shared';

const MAX_TEXT_BYTES = 64 * 1024;
const MAX_TOOL_CALLS = 32;

export interface ModelUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export type CollectedModelResponse =
  | {
      readonly kind: 'final';
      readonly text: string;
      readonly usage?: ModelUsage;
    }
  | {
      readonly kind: 'tool_calls';
      readonly calls: readonly ModelToolCall[];
      readonly text?: string;
      readonly usage?: ModelUsage;
    };

export type ModelResponseFailureCode =
  | 'R1_MODEL_ADAPTER_FAILED'
  | 'R1_MODEL_RESPONSE_UNSUPPORTED'
  | 'R1_FAKE_SCENARIO_MISMATCH'
  | 'R1_CANCELLED';

const publicMessages: Readonly<Record<ModelResponseFailureCode, string>> = Object.freeze({
  R1_MODEL_ADAPTER_FAILED: 'Model adapter failed.',
  R1_MODEL_RESPONSE_UNSUPPORTED: 'Model response is unsupported.',
  R1_FAKE_SCENARIO_MISMATCH: 'Scripted model scenario mismatch.',
  R1_CANCELLED: 'Model response collection cancelled.'
});

export class ModelResponseFailure extends Error {
  constructor(readonly code: ModelResponseFailureCode) {
    super(publicMessages[code]);
    this.name = 'ModelResponseFailure';
  }
}

function fail(code: ModelResponseFailureCode): never {
  throw new ModelResponseFailure(code);
}

function checkAbort(signal: AbortSignal): void {
  if (signal.aborted) {
    fail('R1_CANCELLED');
  }
}

function parseEvent(value: unknown): ModelStreamEvent {
  try {
    const parsed = modelStreamEventSchema.safeParse(value);
    if (!parsed.success) {
      fail('R1_MODEL_ADAPTER_FAILED');
    }
    return parsed.data;
  } catch {
    return fail('R1_MODEL_ADAPTER_FAILED');
  }
}

function failedEventCode(event: Extract<ModelStreamEvent, { type: 'failed' }>): ModelResponseFailureCode {
  return event.error.code === 'R1_FAKE_SCENARIO_MISMATCH'
    ? 'R1_FAKE_SCENARIO_MISMATCH'
    : 'R1_MODEL_ADAPTER_FAILED';
}

interface AsyncIteratorHandle {
  readonly target: object;
  readonly next: () => unknown;
}

function normalizeAdapterBoundaryError(): never {
  return fail('R1_MODEL_ADAPTER_FAILED');
}

function openIterator(events: AsyncIterable<unknown>): AsyncIteratorHandle {
  try {
    const target: unknown = events[Symbol.asyncIterator]();
    if (typeof target !== 'object' || target === null) {
      return fail('R1_MODEL_ADAPTER_FAILED');
    }
    const next: unknown = Reflect.get(target, 'next');
    if (typeof next !== 'function') {
      return fail('R1_MODEL_ADAPTER_FAILED');
    }
    return {
      target,
      next: () => Reflect.apply(next, target, [])
    };
  } catch {
    return normalizeAdapterBoundaryError();
  }
}

async function readIteratorResult(
  iterator: AsyncIteratorHandle,
  signal: AbortSignal
): Promise<{ readonly done: true } | { readonly done: false; readonly value: unknown }> {
  try {
    const result: unknown = await iterator.next();
    if (typeof result !== 'object' || result === null) {
      return fail('R1_MODEL_ADAPTER_FAILED');
    }
    const done: unknown = Reflect.get(result, 'done');
    if (typeof done !== 'boolean') {
      return fail('R1_MODEL_ADAPTER_FAILED');
    }
    if (done) {
      return { done: true };
    }
    if (!Object.hasOwn(result, 'value')) {
      return fail('R1_MODEL_ADAPTER_FAILED');
    }
    return { done: false, value: Reflect.get(result, 'value') };
  } catch {
    checkAbort(signal);
    return normalizeAdapterBoundaryError();
  }
}

async function closeIteratorWithoutMaskingFailure(iterator: AsyncIteratorHandle): Promise<void> {
  let close: unknown;
  try {
    close = Reflect.get(iterator.target, 'return');
  } catch {
    return;
  }
  if (typeof close !== 'function') {
    return;
  }
  try {
    await Reflect.apply(close, iterator.target, []);
  } catch {
    // Cleanup is best-effort and must not replace the normalized primary failure.
  }
}

export async function collectModelResponse(
  events: AsyncIterable<unknown>,
  signal: AbortSignal,
  options: { readonly allowCommentaryWithToolCalls?: boolean } = {}
): Promise<CollectedModelResponse> {
  checkAbort(signal);
  const iterator = openIterator(events);

  const textParts: string[] = [];
  let textBytes = 0;
  const calls: ModelToolCall[] = [];
  const callIds = new Set<string>();
  let usage: ModelUsage | undefined;
  let terminal: Extract<ModelStreamEvent, { type: 'completed' | 'failed' }> | undefined;
  let iteratorFinished = false;

  try {
    while (true) {
      checkAbort(signal);

      const next = await readIteratorResult(iterator, signal);

      checkAbort(signal);
      if (next.done) {
        iteratorFinished = true;
        break;
      }

      const event = parseEvent(next.value);
      if (terminal !== undefined) {
        return fail('R1_MODEL_ADAPTER_FAILED');
      }

      switch (event.type) {
        case 'text_delta':
          textBytes += Buffer.byteLength(event.text, 'utf8');
          if (textBytes > MAX_TEXT_BYTES) {
            return fail('R1_MODEL_RESPONSE_UNSUPPORTED');
          }
          textParts.push(event.text);
          break;
        case 'tool_call':
          if (calls.length === MAX_TOOL_CALLS || callIds.has(event.call.callId)) {
            return fail('R1_MODEL_RESPONSE_UNSUPPORTED');
          }
          callIds.add(event.call.callId);
          calls.push(event.call);
          break;
        case 'usage':
          if (usage !== undefined) {
            return fail('R1_MODEL_ADAPTER_FAILED');
          }
          usage = {
            inputTokens: event.inputTokens,
            outputTokens: event.outputTokens
          };
          break;
        case 'completed':
        case 'failed':
          terminal = event;
          break;
      }
    }
  } finally {
    if (!iteratorFinished) {
      await closeIteratorWithoutMaskingFailure(iterator);
    }
  }

  if (terminal === undefined) {
    return fail('R1_MODEL_ADAPTER_FAILED');
  }
  if (terminal.type === 'failed') {
    return fail(failedEventCode(terminal));
  }
  if (textParts.length > 0 && calls.length > 0 && options.allowCommentaryWithToolCalls !== true) {
    return fail('R1_MODEL_RESPONSE_UNSUPPORTED');
  }

  const usageResult = usage === undefined ? {} : { usage };
  if (calls.length > 0) {
    return { kind: 'tool_calls', calls, ...(textParts.length === 0 ? {} : { text: textParts.join('') }), ...usageResult };
  }
  if (textParts.length > 0) {
    return { kind: 'final', text: textParts.join(''), ...usageResult };
  }
  return fail('R1_MODEL_RESPONSE_UNSUPPORTED');
}
