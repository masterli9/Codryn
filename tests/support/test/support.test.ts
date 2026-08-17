import { access } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { createTempDirectory, eventually } from '../src/index.js';

describe('test support', () => {
  it('creates and removes a unique temporary directory', async () => {
    const directory = await createTempDirectory('codryn-r0-');

    await expect(access(directory.path)).resolves.toBeUndefined();
    await directory.cleanup();
    await expect(access(directory.path)).rejects.toThrow();
  });

  it('rejects a non-simple prefix before creating a temporary directory', async () => {
    let unexpectedDirectory: Awaited<ReturnType<typeof createTempDirectory>> | undefined;
    let rejection: unknown;
    try {
      unexpectedDirectory = await createTempDirectory('.');
    } catch (error: unknown) {
      rejection = error;
    }
    await unexpectedDirectory?.cleanup();

    expect(rejection).toMatchObject({ message: 'Temporary directory prefix must be a simple name.' });
  });

  it('retries an assertion until it succeeds', async () => {
    let attempts = 0;

    await eventually(() => {
      attempts += 1;
      if (attempts < 3) throw new Error('not yet');
    }, { timeoutMs: 100, intervalMs: 1 });

    expect(attempts).toBe(3);
  });

  it('preserves the last assertion error when its timeout expires', async () => {
    const expected = new Error('last failure');

    await expect(eventually(() => { throw expected; }, { timeoutMs: 10, intervalMs: 1 })).rejects.toBe(expected);
  });

  it('does not sleep past the remaining eventually timeout', async () => {
    const startedAt = Date.now();
    await expect(eventually(() => { throw new Error('not ready'); }, { timeoutMs: 20, intervalMs: 100 })).rejects.toThrow('not ready');
    expect(Date.now() - startedAt).toBeLessThan(80);
  });
});
