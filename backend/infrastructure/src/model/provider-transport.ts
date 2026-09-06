export type ProviderTransportErrorCode = 'timeout' | 'interrupted';

export class ProviderTransportError extends Error {
  constructor(readonly code: ProviderTransportErrorCode) {
    super('Provider transport failed.');
    this.name = 'ProviderTransportError';
  }
}

export interface ProviderTransport {
  stream(request: {
    url: string;
    headers: Readonly<Record<string, string>>;
    body: unknown;
  }, signal: AbortSignal): AsyncIterable<unknown>;
}

export class FetchProviderTransport implements ProviderTransport {
  async *stream(request: Parameters<ProviderTransport['stream']>[0], signal: AbortSignal): AsyncIterable<unknown> {
    const controller = new AbortController();
    let timedOut = false;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const totalTimer = setTimeout(() => { timedOut = true; controller.abort(); }, 120_000);
    const abortFromCaller = () => controller.abort();
    signal.addEventListener('abort', abortFromCaller, { once: true });
    if (signal.aborted) controller.abort();
    const armIdleTimer = () => {
      if (idleTimer !== undefined) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => { timedOut = true; controller.abort(); }, 30_000);
    };
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      armIdleTimer();
      const response = await fetch(request.url, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify(request.body),
        signal: controller.signal
      });
      if (!response.ok) {
        throw Object.assign(new Error('R2_PROVIDER_HTTP_ERROR'), { status: response.status });
      }
      if (response.body === null) throw new Error('R2_PROVIDER_EMPTY_STREAM');
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let bytes = 0;
      while (true) {
        armIdleTimer();
        const next = await reader.read();
        if (idleTimer !== undefined) clearTimeout(idleTimer);
        if (next.done) break;
        armIdleTimer();
        bytes += next.value.byteLength;
        if (bytes > 2 * 1024 * 1024) throw new Error('R2_PROVIDER_RESPONSE_LIMIT');
        buffer += decoder.decode(next.value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const value = line.startsWith('data:') ? line.slice(5).trim() : line.trim();
          if (value.length === 0 || value === '[DONE]') continue;
          yield JSON.parse(value) as unknown;
        }
      }
      buffer += decoder.decode();
      const value = buffer.startsWith('data:') ? buffer.slice(5).trim() : buffer.trim();
      if (value.length > 0 && value !== '[DONE]') yield JSON.parse(value) as unknown;
    } catch (error) {
      if (signal.aborted) throw new ProviderTransportError('interrupted');
      if (timedOut) throw new ProviderTransportError('timeout');
      throw error;
    } finally {
      clearTimeout(totalTimer);
      if (idleTimer !== undefined) clearTimeout(idleTimer);
      signal.removeEventListener('abort', abortFromCaller);
      await reader?.cancel().catch(() => undefined);
    }
  }
}
