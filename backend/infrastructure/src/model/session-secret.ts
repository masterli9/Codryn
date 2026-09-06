export class SessionSecret {
  #value: string | undefined;

  constructor(read: () => string) {
    const value = read();
    if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) throw new Error('R2_PROVIDER_KEY_MISSING');
    this.#value = value;
  }

  get(): string {
    if (this.#value === undefined) throw new Error('R2_PROVIDER_KEY_CLEARED');
    return this.#value;
  }

  clear(): void { this.#value = undefined; }
}
