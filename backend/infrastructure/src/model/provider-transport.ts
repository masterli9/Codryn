export interface ProviderTransport {
  stream(request: {
    url: string;
    headers: Readonly<Record<string, string>>;
    body: unknown;
  }, signal: AbortSignal): AsyncIterable<unknown>;
}

export class FetchProviderTransport implements ProviderTransport {
  async *stream(request: Parameters<ProviderTransport['stream']>[0], signal: AbortSignal): AsyncIterable<unknown> {
    const response = await fetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal
    });
    if (!response.ok) {
      throw Object.assign(new Error('R2_PROVIDER_HTTP_ERROR'), { status: response.status });
    }
    if (response.body === null) throw new Error('R2_PROVIDER_EMPTY_STREAM');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let bytes = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
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
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  }
}
