export type ProviderTransportErrorCode = 'timeout' | 'interrupted';

const maxRateLimitRetries = 4;
const maxRetryDelayMs = 60_000;
const baseRetryDelayMs = 1_000;
const totalTimeoutMs = 120_000;

export class ProviderTransportError extends Error {
  constructor(readonly code: ProviderTransportErrorCode) {
    super('Provider transport failed.');
    this.name = 'ProviderTransportError';
  }
}

export class ProviderHttpError extends Error {
  constructor(readonly status: number) {
    super('Provider returned an unsuccessful HTTP response.');
    this.name = 'ProviderHttpError';
  }
}

export interface ProviderTransport {
  stream(request: {
    url: string;
    headers: Readonly<Record<string, string>>;
    body: unknown;
  }, signal: AbortSignal): AsyncIterable<unknown>;
}

export interface FetchProviderTransportOptions {
  readonly maxRateLimitRetries?: number;
  readonly minRequestIntervalMs?: number;
  readonly random?: () => number;
}

function abortError(): Error {
  return new DOMException('The operation was aborted.', 'AbortError');
}

function delayAbortably(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError());
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const finish = () => signal.removeEventListener('abort', onAbort);
    const timer = setTimeout(() => {
      finish();
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      finish();
      reject(abortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}

function waitAbortably(pending: Promise<void>, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      finish();
      reject(abortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
    pending.then(
      () => {
        if (settled) return;
        settled = true;
        finish();
        resolve();
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        finish();
        reject(error);
      }
    );
    if (signal.aborted) onAbort();
  });
}

function parseRetryAfter(value: string | null, now: number): number | undefined {
  if (value === null || value.length > 128) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    if (!Number.isSafeInteger(seconds)) return maxRetryDelayMs + 1;
    return seconds * 1_000;
  }
  if (!/^(?:[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT|[A-Za-z]+, \d{2}-[A-Z][a-z]{2}-\d{2} \d{2}:\d{2}:\d{2} GMT|[A-Z][a-z]{2} [A-Z][a-z]{2} (?:\d{2}| \d) \d{2}:\d{2}:\d{2} \d{4})$/.test(trimmed)) return undefined;
  const retryAt = Date.parse(trimmed);
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - now) : undefined;
}

function rateLimitDelayMs(response: Response, retryNumber: number, random: () => number): number | null {
  const providedDelay = parseRetryAfter(response.headers.get('retry-after'), Date.now());
  if (providedDelay !== undefined) return providedDelay <= maxRetryDelayMs ? providedDelay : null;
  const ceiling = Math.min(baseRetryDelayMs * 2 ** (retryNumber - 1), maxRetryDelayMs);
  const sample = random();
  const jitter = Number.isFinite(sample) ? Math.max(0, Math.min(0.999_999, sample)) : 0.5;
  return Math.floor(ceiling * jitter);
}

export class FetchProviderTransport implements ProviderTransport {
  private readonly maxRateLimitRetries: number;
  private readonly minRequestIntervalMs: number;
  private readonly random: () => number;
  private lastRequestStartedAt: number | undefined;
  private pacingQueue: Promise<void> = Promise.resolve();

  constructor(options: FetchProviderTransportOptions = {}) {
    const configuredRetries = options.maxRateLimitRetries ?? 0;
    this.maxRateLimitRetries = Number.isInteger(configuredRetries)
      ? Math.max(0, Math.min(maxRateLimitRetries, configuredRetries)) : 0;
    const configuredInterval = options.minRequestIntervalMs ?? 0;
    this.minRequestIntervalMs = Number.isFinite(configuredInterval)
      ? Math.max(0, Math.min(maxRetryDelayMs, Math.floor(configuredInterval))) : 0;
    this.random = options.random ?? Math.random;
  }

  private async waitForRequestSlot(signal: AbortSignal): Promise<void> {
    if (this.minRequestIntervalMs === 0) {
      if (signal.aborted) throw abortError();
      return;
    }
    let release!: () => void;
    const turn = new Promise<void>((resolve) => { release = resolve; });
    const previous = this.pacingQueue;
    this.pacingQueue = previous.then(() => turn, () => turn);
    try {
      await waitAbortably(previous, signal);
      const nextStartAt = this.lastRequestStartedAt === undefined
        ? Date.now() : this.lastRequestStartedAt + this.minRequestIntervalMs;
      await delayAbortably(Math.max(0, nextStartAt - Date.now()), signal);
      if (signal.aborted) throw abortError();
      this.lastRequestStartedAt = Date.now();
    } finally {
      release();
    }
  }

  async *stream(request: Parameters<ProviderTransport['stream']>[0], signal: AbortSignal): AsyncIterable<unknown> {
    const controller = new AbortController();
    let timedOut = false;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    const totalTimer = setTimeout(() => { timedOut = true; controller.abort(); }, totalTimeoutMs);
    const abortFromCaller = () => controller.abort();
    signal.addEventListener('abort', abortFromCaller, { once: true });
    if (signal.aborted) controller.abort();
    const armIdleTimer = () => {
      if (idleTimer !== undefined) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => { timedOut = true; controller.abort(); }, 30_000);
    };
    const clearIdleTimer = () => {
      if (idleTimer !== undefined) clearTimeout(idleTimer);
      idleTimer = undefined;
    };
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      let response: Response | undefined;
      let retries = 0;
      while (true) {
        await this.waitForRequestSlot(controller.signal);
        armIdleTimer();
        response = await fetch(request.url, {
          method: 'POST',
          headers: request.headers,
          body: JSON.stringify(request.body),
          signal: controller.signal
        });
        if (response.status !== 429 || retries >= this.maxRateLimitRetries) break;
        clearIdleTimer();
        const delayMs = rateLimitDelayMs(response, retries + 1, this.random);
        if (delayMs === null) break;
        const pacingDelayMs = this.minRequestIntervalMs > 0 && this.lastRequestStartedAt !== undefined
          ? Math.max(0, this.lastRequestStartedAt + this.minRequestIntervalMs - Date.now()) : 0;
        if (Math.max(delayMs, pacingDelayMs) >= startedAt + totalTimeoutMs - Date.now()) break;
        await response.body?.cancel().catch(() => undefined);
        await delayAbortably(delayMs, controller.signal);
        retries += 1;
      }
      if (response === undefined) throw new Error('R2_PROVIDER_EMPTY_RESPONSE');
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new ProviderHttpError(response.status);
      }
      if (response.body === null) throw new Error('R2_PROVIDER_EMPTY_STREAM');
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let bytes = 0;
      const parseLine = (line: string): unknown | undefined => {
        const trimmed = line.trim();
        if (trimmed.length === 0 || trimmed === '[DONE]' || trimmed.startsWith(':') || /^(event|id|retry):/.test(trimmed)) return undefined;
        const value = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
        if (value.length === 0 || value === '[DONE]') return undefined;
        return JSON.parse(value) as unknown;
      };
      while (true) {
        armIdleTimer();
        const next = await reader.read();
        clearIdleTimer();
        if (next.done) break;
        armIdleTimer();
        bytes += next.value.byteLength;
        if (bytes > 2 * 1024 * 1024) throw new Error('R2_PROVIDER_RESPONSE_LIMIT');
        buffer += decoder.decode(next.value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const parsed = parseLine(line);
          if (parsed !== undefined) yield parsed;
        }
      }
      buffer += decoder.decode();
      const parsed = parseLine(buffer);
      if (parsed !== undefined) yield parsed;
    } catch (error) {
      if (signal.aborted) throw new ProviderTransportError('interrupted');
      if (timedOut) throw new ProviderTransportError('timeout');
      throw error;
    } finally {
      clearTimeout(totalTimer);
      clearIdleTimer();
      signal.removeEventListener('abort', abortFromCaller);
      await reader?.cancel().catch(() => undefined);
    }
  }
}
