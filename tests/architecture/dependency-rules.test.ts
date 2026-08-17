import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const manifests = [
  ['apps/desktop/package.json', '@codryn/desktop'],
  ['backend/core/package.json', '@codryn/core'],
  ['backend/infrastructure/package.json', '@codryn/infrastructure'],
  ['shared/package.json', '@codryn/shared'],
  ['tests/support/package.json', '@codryn/test-support']
] as const;

describe('workspace boundaries', () => {
  it.each(manifests)('%s is a private workspace named %s', async (file, name) => {
    const manifest = JSON.parse(await readFile(file, 'utf8')) as {
      name: string;
      private: boolean;
    };
    expect(manifest).toMatchObject({ name, private: true });
  });
});
