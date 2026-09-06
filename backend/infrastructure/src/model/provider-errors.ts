export type ProviderErrorCode = 'auth' | 'rate_limit' | 'timeout' | 'interrupted' | 'invalid_tool_call' | 'provider_error';

export function providerStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;
  for (const key of ['status', 'code']) {
    const value = error[key as keyof typeof error];
    if (typeof value === 'number' && Number.isInteger(value)) return value;
  }
  const nested = error['error' as keyof typeof error];
  if (nested !== error) return providerStatus(nested);
  return null;
}

export function normalizeProviderError(status: number | null, timedOut: boolean): ProviderErrorCode {
  if (timedOut) return 'timeout';
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  return 'provider_error';
}

export class ProviderAdapterError extends Error {
  constructor(readonly code: ProviderErrorCode) {
    super('Model provider request failed.');
    this.name = 'ProviderAdapterError';
  }
}
