import { describe, expect, it, vi } from 'vitest';
import { FetchProviderTransport } from '../src/index.js';
import type { ProviderTransport, ProviderTransportError } from '../src/index.js';
import { ProviderHttpError } from '../src/model/provider-transport.js';

async function collectEvents(transport: ProviderTransport, signal = new AbortController().signal): Promise<unknown[]> {
  const events: unknown[] = [];
  for await (const event of transport.stream({ url: 'https://example.invalid', headers: {}, body: {} }, signal)) events.push(event);
  return events;
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
}

describe('FetchProviderTransport', () => {
  it('ignores SSE event metadata and yields only data payloads', async () => {
    const fetchMock = vi.fn(async () => new Response([
      'event: response.created',
      'data: {"type":"response.created"}',
      '',
      'event: response.completed',
      'data: {"type":"response.completed"}',
      '',
      'data: [DONE]',
      ''
    ].join('\n'), { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const events: unknown[] = [];
      const transport = new FetchProviderTransport();
      for await (const event of transport.stream({ url: 'https://example.invalid', headers: {}, body: {} }, new AbortController().signal)) events.push(event);
      expect(events).toEqual([{ type: 'response.created' }, { type: 'response.completed' }]);
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('normalizes an idle timeout and aborts the pending fetch', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn((_url: string, init: RequestInit | undefined) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      }));
      vi.stubGlobal('fetch', fetchMock);
      const transport = new FetchProviderTransport();
      const running = (async () => {
        for await (const event of transport.stream({ url: 'https://example.invalid', headers: {}, body: {} }, new AbortController().signal)) {
          // The request is expected to time out before a response exists.
          void event;
        }
      })();
      const expectedFailure = expect(running).rejects.toMatchObject({ code: 'timeout' } satisfies Partial<ProviderTransportError>);
      await vi.advanceTimersByTimeAsync(30_000);
      await expectedFailure;
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it('retries a 429 after the server Retry-After delay', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => fetchMock.mock.calls.length === 1
      ? new Response(null, { status: 429, headers: { 'retry-after': '2' } })
      : new Response('data: {"type":"response.completed"}\n\n', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const running = collectEvents(new FetchProviderTransport({ maxRateLimitRetries: 1 }));
      const completion = running.then(
        (events) => ({ ok: true as const, events }),
        (error: unknown) => ({ ok: false as const, error })
      );
      await flushMicrotasks();
      expect(fetchMock).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(1_999);
      expect(fetchMock).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(1);
      await expect(completion).resolves.toEqual({ ok: true, events: [{ type: 'response.completed' }] });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it('uses jittered exponential backoff and preserves 429 after exhausting retries', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => new Response(null, { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const running = collectEvents(new FetchProviderTransport({ maxRateLimitRetries: 2, random: () => 0.5 }));
      const result = running.then(
        () => ({ ok: true as const }),
        (error: unknown) => ({ ok: false as const, error })
      );
      await flushMicrotasks();
      expect(fetchMock).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(499);
      expect(fetchMock).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(1);
      await flushMicrotasks();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(999);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      await expect(result).resolves.toMatchObject({ ok: false, error: { status: 429 } });
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it('does not retry when Retry-After exceeds the bounded wait', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 429, headers: { 'retry-after': '61' } }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(collectEvents(new FetchProviderTransport({ maxRateLimitRetries: 4 })))
        .rejects.toMatchObject({ status: 429 });
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('caps configured rate-limit retries at four', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(collectEvents(new FetchProviderTransport({ maxRateLimitRetries: 99, random: () => 0 })))
        .rejects.toMatchObject({ status: 429 });
      expect(fetchMock).toHaveBeenCalledTimes(5);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([400, 401, 500])('does not retry HTTP %i', async (status) => {
    const fetchMock = vi.fn(async () => new Response(null, { status }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const error = await collectEvents(new FetchProviderTransport({ maxRateLimitRetries: 4 })).then(
        () => null,
        (reason: unknown) => reason
      );
      expect(error).toBeInstanceOf(ProviderHttpError);
      expect(error).toMatchObject({ status });
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('aborts while waiting to retry a rate-limited request', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => new Response(null, { status: 429, headers: { 'retry-after': '60' } }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const controller = new AbortController();
      const running = collectEvents(new FetchProviderTransport({ maxRateLimitRetries: 1 }), controller.signal);
      const result = running.then(
        () => ({ ok: true as const }),
        (error: unknown) => ({ ok: false as const, error })
      );
      await flushMicrotasks();
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(2);
      controller.abort();
      await expect(result).resolves.toMatchObject({ ok: false, error: { code: 'interrupted' } satisfies Partial<ProviderTransportError> });
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it('spaces requests made through a shared transport by its configured minimum interval', async () => {
    vi.useFakeTimers();
    const startedAt: number[] = [];
    const fetchMock = vi.fn(async () => {
      startedAt.push(Date.now());
      return new Response('data: {"type":"response.completed"}\n\n', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const transport = new FetchProviderTransport({ minRequestIntervalMs: 15_000 });
      await collectEvents(transport);
      const second = collectEvents(transport);
      const completion = second.then(
        (events) => ({ ok: true as const, events }),
        (error: unknown) => ({ ok: false as const, error })
      );
      await flushMicrotasks();
      expect(fetchMock).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(14_999);
      expect(fetchMock).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(1);
      await expect(completion).resolves.toEqual({ ok: true, events: [{ type: 'response.completed' }] });
      const firstStart = startedAt[0];
      const secondStart = startedAt[1];
      if (firstStart === undefined || secondStart === undefined) throw new Error('Expected two request start times');
      expect(secondStart - firstStart).toBe(15_000);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it('interrupts a request queued behind an occupied pacing slot without starting fetch', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => new Response('data: {"type":"response.completed"}\n\n', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const transport = new FetchProviderTransport({ minRequestIntervalMs: 15_000 });
    const ownerController = new AbortController();
    const queuedController = new AbortController();
    let ownerError: unknown;
    let queuedError: unknown;
    try {
      await collectEvents(transport);
      const owner = collectEvents(transport, ownerController.signal).then(
        () => undefined,
        (error: unknown) => { ownerError = error; }
      );
      await flushMicrotasks();
      expect(fetchMock).toHaveBeenCalledOnce();

      const queued = collectEvents(transport, queuedController.signal).then(
        () => undefined,
        (error: unknown) => { queuedError = error; }
      );
      await flushMicrotasks();
      queuedController.abort();
      await flushMicrotasks();

      expect(queuedError).toMatchObject({ code: 'interrupted' } satisfies Partial<ProviderTransportError>);
      expect(fetchMock).toHaveBeenCalledOnce();
      ownerController.abort();
      await Promise.all([owner, queued]);
      expect(ownerError).toMatchObject({ code: 'interrupted' } satisfies Partial<ProviderTransportError>);
    } finally {
      ownerController.abort();
      queuedController.abort();
      await vi.runOnlyPendingTimersAsync();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});
