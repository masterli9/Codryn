export interface EventuallyOptions {
  readonly timeoutMs: number;
  readonly intervalMs: number;
}

export async function eventually(
  assertion: () => void | Promise<void>,
  options: EventuallyOptions
): Promise<void> {
  const deadline = Date.now() + options.timeoutMs;
  let lastError: unknown;
  while (Date.now() <= deadline) {
    try {
      await assertion();
      return;
    } catch (error: unknown) {
      lastError = error;
    }
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    await new Promise<void>((resolve) => setTimeout(resolve, Math.min(options.intervalMs, remainingMs)));
  }
  throw lastError;
}
