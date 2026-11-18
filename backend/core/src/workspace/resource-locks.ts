export class ResourceLocks {
  private readonly tails = new Map<string, Promise<void>>();

  async withKey<T>(key: string, signal: AbortSignal, action: () => Promise<T>): Promise<T> {
    signal.throwIfAborted();
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const complete = new Promise<void>(resolve => { release = resolve; });
    const tail = previous.then(() => complete);
    this.tails.set(key, tail);
    let abort: () => void = () => undefined;
    try {
      await Promise.race([previous, new Promise<never>((_, reject) => {
        abort = () => reject(signal.reason);
        signal.addEventListener('abort', abort, { once: true });
      })]);
      signal.throwIfAborted();
      return await action();
    } finally {
      signal.removeEventListener('abort', abort);
      release();
      void tail.then(() => { if (this.tails.get(key) === tail) this.tails.delete(key); });
    }
  }
}
