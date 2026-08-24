import { describe, expect, it } from 'vitest';
import type { ModelStreamEvent, ModelToolCall } from '@codryn/shared';
import { collectModelResponse, ModelResponseFailure } from '../src/index.js';

const firstCall: ModelToolCall = {
  callId: '11111111-1111-4111-8111-111111111111',
  toolId: 'project.search_text',
  toolVersion: 1,
  arguments: { query: 'Codryn' }
};

const secondCall: ModelToolCall = {
  callId: '22222222-2222-4222-8222-222222222222',
  toolId: 'project.read_file',
  toolVersion: 1,
  arguments: { path: 'README.md' }
};

async function* stream(...events: readonly unknown[]): AsyncIterable<unknown> {
  for (const event of events) {
    yield event;
  }
}

async function expectFailure(
  promise: Promise<unknown>,
  code: ModelResponseFailure['code'],
  message?: string
): Promise<void> {
  try {
    await promise;
    expect.unreachable('Expected model response collection to fail.');
  } catch (error) {
    expect(error).toBeInstanceOf(ModelResponseFailure);
    expect(error).toMatchObject({ code, ...(message === undefined ? {} : { message }) });
  }
}

describe('collectModelResponse', () => {
  it('joins text deltas and includes usage in a final response', async () => {
    const result = await collectModelResponse(stream(
      { type: 'text_delta', text: 'Ahoj ' },
      { type: 'text_delta', text: 'svete.' },
      { type: 'usage', inputTokens: 12, outputTokens: 4 },
      { type: 'completed' }
    ), new AbortController().signal);

    expect(result).toEqual({
      kind: 'final',
      text: 'Ahoj svete.',
      usage: { inputTokens: 12, outputTokens: 4 }
    });
  });

  it('returns one tool call without inventing usage', async () => {
    const result = await collectModelResponse(stream(
      { type: 'tool_call', call: firstCall },
      { type: 'completed' }
    ), new AbortController().signal);

    expect(result).toEqual({ kind: 'tool_calls', calls: [firstCall] });
  });

  it('preserves the order of multiple tool calls', async () => {
    const result = await collectModelResponse(stream(
      { type: 'tool_call', call: firstCall },
      { type: 'tool_call', call: secondCall },
      { type: 'usage', inputTokens: 20, outputTokens: 8 },
      { type: 'completed' }
    ), new AbortController().signal);

    expect(result).toEqual({
      kind: 'tool_calls',
      calls: [firstCall, secondCall],
      usage: { inputTokens: 20, outputTokens: 8 }
    });
  });

  it('propagates a normalized terminal adapter failure', async () => {
    await expectFailure(collectModelResponse(stream({
      type: 'failed',
      error: { code: 'R1_MODEL_ADAPTER_FAILED', message: 'secret provider detail' }
    }), new AbortController().signal), 'R1_MODEL_ADAPTER_FAILED', 'Model adapter failed.');
  });

  it('preserves the scripted scenario mismatch failure code', async () => {
    await expectFailure(collectModelResponse(stream({
      type: 'failed',
      error: { code: 'R1_FAKE_SCENARIO_MISMATCH', message: 'untrusted detail' }
    }), new AbortController().signal), 'R1_FAKE_SCENARIO_MISMATCH', 'Scripted model scenario mismatch.');
  });

  it('redacts unknown provider failure codes and messages', async () => {
    await expectFailure(collectModelResponse(stream({
      type: 'failed',
      error: { code: 'PROVIDER_SECRET_CODE', message: 'C:\\Users\\private\\secret.txt' }
    }), new AbortController().signal), 'R1_MODEL_ADAPTER_FAILED', 'Model adapter failed.');
  });

  it('normalizes an exception thrown while reading the provider stream', async () => {
    async function* throwingStream(): AsyncIterable<ModelStreamEvent> {
      yield { type: 'text_delta', text: 'Partial' };
      throw new Error('C:\\Users\\private\\provider-secret.txt');
    }

    await expectFailure(
      collectModelResponse(throwingStream(), new AbortController().signal),
      'R1_MODEL_ADAPTER_FAILED',
      'Model adapter failed.'
    );
  });

  it('rejects a stream without a terminal event', async () => {
    await expectFailure(collectModelResponse(stream(
      { type: 'text_delta', text: 'Incomplete' }
    ), new AbortController().signal), 'R1_MODEL_ADAPTER_FAILED');
  });

  it('rejects duplicate terminal events', async () => {
    await expectFailure(collectModelResponse(stream(
      { type: 'text_delta', text: 'Complete' },
      { type: 'completed' },
      { type: 'completed' }
    ), new AbortController().signal), 'R1_MODEL_ADAPTER_FAILED');
  });

  it('rejects final text mixed with tool calls', async () => {
    await expectFailure(collectModelResponse(stream(
      { type: 'text_delta', text: 'Mixed' },
      { type: 'tool_call', call: firstCall },
      { type: 'completed' }
    ), new AbortController().signal), 'R1_MODEL_RESPONSE_UNSUPPORTED');
  });

  it('validates every yielded event', async () => {
    await expectFailure(collectModelResponse(stream(
      { type: 'text_delta', text: 'Before invalid event' },
      { type: 'unexpected', secret: 'must not pass through' },
      { type: 'completed' }
    ), new AbortController().signal), 'R1_MODEL_ADAPTER_FAILED');
  });

  it('rejects multiple usage events as an ambiguous provider response', async () => {
    await expectFailure(collectModelResponse(stream(
      { type: 'text_delta', text: 'Response' },
      { type: 'usage', inputTokens: 1, outputTokens: 1 },
      { type: 'usage', inputTokens: 2, outputTokens: 2 },
      { type: 'completed' }
    ), new AbortController().signal), 'R1_MODEL_ADAPTER_FAILED');
  });

  it('rejects duplicate model tool call IDs', async () => {
    await expectFailure(collectModelResponse(stream(
      { type: 'tool_call', call: firstCall },
      { type: 'tool_call', call: { ...secondCall, callId: firstCall.callId } },
      { type: 'completed' }
    ), new AbortController().signal), 'R1_MODEL_RESPONSE_UNSUPPORTED');
  });

  it('accepts exactly 64 KiB of UTF-8 text and rejects one byte more', async () => {
    const exact = 'x'.repeat(64 * 1024);
    await expect(collectModelResponse(stream(
      { type: 'text_delta', text: exact },
      { type: 'completed' }
    ), new AbortController().signal)).resolves.toEqual({ kind: 'final', text: exact });

    await expectFailure(collectModelResponse(stream(
      { type: 'text_delta', text: `${exact}x` },
      { type: 'completed' }
    ), new AbortController().signal), 'R1_MODEL_RESPONSE_UNSUPPORTED');
  });

  it('counts UTF-8 bytes rather than JavaScript string length', async () => {
    const multibyteText = 'ž'.repeat(32 * 1024 + 1);

    await expectFailure(collectModelResponse(stream(
      { type: 'text_delta', text: multibyteText },
      { type: 'completed' }
    ), new AbortController().signal), 'R1_MODEL_RESPONSE_UNSUPPORTED');
  });

  it('accepts 32 tool calls and rejects the thirty-third', async () => {
    const calls = Array.from({ length: 33 }, (_, index): ModelStreamEvent => ({
      type: 'tool_call',
      call: {
        ...firstCall,
        callId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
      }
    }));

    await expect(collectModelResponse(stream(
      ...calls.slice(0, 32),
      { type: 'completed' }
    ), new AbortController().signal)).resolves.toMatchObject({ kind: 'tool_calls' });

    await expectFailure(collectModelResponse(stream(
      ...calls,
      { type: 'completed' }
    ), new AbortController().signal), 'R1_MODEL_RESPONSE_UNSUPPORTED');
  });

  it('checks cancellation before consuming the next event', async () => {
    const controller = new AbortController();
    let yielded = 0;
    async function* abortingStream(): AsyncIterable<ModelStreamEvent> {
      yielded += 1;
      yield { type: 'text_delta', text: 'First' };
      controller.abort();
      yielded += 1;
      yield { type: 'completed' };
    }

    await expectFailure(
      collectModelResponse(abortingStream(), controller.signal),
      'R1_CANCELLED'
    );
    expect(yielded).toBe(2);
  });

  it('opens the async iterable only once', async () => {
    let iteratorRequests = 0;
    const events: AsyncIterable<ModelStreamEvent> = {
      [Symbol.asyncIterator]() {
        iteratorRequests += 1;
        if (iteratorRequests > 1) {
          throw new Error('STREAM_CONSUMED_MORE_THAN_ONCE');
        }
        return stream(
          { type: 'text_delta', text: 'Once' },
          { type: 'completed' }
        )[Symbol.asyncIterator]() as AsyncIterator<ModelStreamEvent>;
      }
    };

    await expect(collectModelResponse(events, new AbortController().signal)).resolves.toEqual({
      kind: 'final',
      text: 'Once'
    });
    expect(iteratorRequests).toBe(1);
  });
});
