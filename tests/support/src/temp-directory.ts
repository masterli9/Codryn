import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';

export interface TempDirectory {
  readonly path: string;
  cleanup(): Promise<void>;
}

export async function createTempDirectory(prefix: string): Promise<TempDirectory> {
  const temporaryRoot = resolve(tmpdir());
  if (prefix.length === 0 || prefix === '.' || prefix === '..' || prefix !== basename(prefix) || isAbsolute(prefix)) {
    throw new Error('Temporary directory prefix must be a simple name.');
  }
  const path = await mkdtemp(join(temporaryRoot, prefix));
  const resolvedPath = resolve(path);
  const relativePath = relative(temporaryRoot, resolvedPath);
  if (relativePath === '' || relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error('Temporary directory must be created under the system temp directory.');
  }
  return {
    path: resolvedPath,
    cleanup: async () => rm(resolvedPath, { recursive: true, force: true })
  };
}
