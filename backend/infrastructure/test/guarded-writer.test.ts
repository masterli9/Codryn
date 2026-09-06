import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WindowsGuardedWriter } from '../src/index.js';
import { createHash } from 'node:crypto';

function digest(value: string): string {
  return createHash('sha256').update(Buffer.from(value, 'utf8')).digest('hex');
}

describe('WindowsGuardedWriter', () => {
  it.runIf(process.platform === 'win32')('reads and publishes through the native guard', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codryn-r2-guarded-writer-'));
    try {
      await writeFile(join(directory, 'example.ts'), 'before\r\n', 'utf8');
      const writer = new WindowsGuardedWriter(directory);
      const guard = await writer.open('example.ts', digest('before\r\n'), new AbortController().signal);
      expect(new TextDecoder().decode(guard.bytes)).toBe('before\r\n');
      await guard.publish(new TextEncoder().encode('after\r\n'));
      await guard.close();
      await expect(readFile(join(directory, 'example.ts'), 'utf8')).resolves.toBe('after\r\n');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);

  it('fails closed outside Windows instead of using an unsafe fallback', async () => {
    if (process.platform === 'win32') return;
    const writer = new WindowsGuardedWriter(process.cwd());
    await expect(writer.open('package.json', 'a'.repeat(64), new AbortController().signal))
      .rejects.toThrow('R2_GUARD_UNSUPPORTED');
  });
});
