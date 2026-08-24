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
  } catch (error) {
    if (error instanceof ModelResponseFailure) {
      throw error;
    }
    return fail('R1_MODEL_ADAPTER_FAILED');
  }
}

function failedEventCode(event: Extract<ModelStreamEvent, { type: 'failed' }>): ModelResponseFailureCode {
  return event.error.code === 'R1_FAKE_SCENARIO_MISMATCH'
    ? 'R1_FAKE_SCENARIO_MISMATCH'
    : 'R1_MODEL_ADAPTER_FAILED';
}

export async function collectModelResponse(
  events: AsyncIterable<unknown>,
  signal: AbortSignal
): Promise<CollectedModelResponse> {
  checkAbort(signal);

  let iterator: AsyncIterator<unknown>;
  try {
    iterator = events[Symbol.asyncIterator]();
  } catch {
    return fail('R1_MODEL_ADAPTER_FAILED');
  }

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

      let next: IteratorResult<unknown>;
      try {
        next = await iterator.next();
      } catch {
        checkAbort(signal);
        return fail('R1_MODEL_ADAPTER_FAILED');
      }

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
    if (!iteratorFinished && iterator.return !== undefined) {
      try {
        await iterator.return();
      } catch {
        // The original normalized failure remains authoritative.
      }
    }
  }

  if (terminal === undefined) {
    return fail('R1_MODEL_ADAPTER_FAILED');
  }
  if (terminal.type === 'failed') {
    return fail(failedEventCode(terminal));
  }
  if (textParts.length > 0 && calls.length > 0) {
    return fail('R1_MODEL_RESPONSE_UNSUPPORTED');
  }

  const usageResult = usage === undefined ? {} : { usage };
  if (calls.length > 0) {
    return { kind: 'tool_calls', calls, ...usageResult };
  }
  if (textParts.length > 0) {
    return { kind: 'final', text: textParts.join(''), ...usageResult };
  }
  return fail('R1_MODEL_RESPONSE_UNSUPPORTED');
}
