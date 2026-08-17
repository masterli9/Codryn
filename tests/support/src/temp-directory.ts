import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

export interface TempDirectory {
  readonly path: string;
  cleanup(): Promise<void>;
}

export async function createTempDirectory(prefix: string): Promise<TempDirectory> {
  const temporaryRoot = resolve(tmpdir());
  const path = await mkdtemp(resolve(temporaryRoot, prefix));
  const resolvedPath = resolve(path);
  if (!resolvedPath.startsWith(`${temporaryRoot}\\`) && resolvedPath !== temporaryRoot) {
    throw new Error('Temporary directory must be created under the system temp directory.');
  }
  return {
    path: resolvedPath,
    cleanup: async () => rm(resolvedPath, { recursive: true, force: true })
  };
}
