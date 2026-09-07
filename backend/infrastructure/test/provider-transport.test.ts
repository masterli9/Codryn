import { describe, expect, it, vi } from 'vitest';
import { FetchProviderTransport } from '../src/index.js';
import type { ProviderTransportError } from '../src/index.js';

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
});
