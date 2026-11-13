import { open } from 'node:fs/promises';
import type { Stats } from 'node:fs';

export const MAX_CONTEXT_FILE_BYTES = 1024 * 1024;

type FileIdentity = Pick<Stats, 'dev' | 'ino' | 'size' | 'mtimeMs' | 'ctimeMs'>;

function matches(left: FileIdentity, right: FileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size
    && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}

/** Returns null if the file changes or exceeds the byte limit. */
export async function readBoundedContextFile(path: string, limit = MAX_CONTEXT_FILE_BYTES, expected?: FileIdentity): Promise<Buffer | null> {
  const file = await open(path, 'r');
  try {
    const before = await file.stat();
    if (!before.isFile() || before.size > limit || (expected !== undefined && !matches(before, expected))) return null;
    const bytes = Buffer.allocUnsafe(before.size);
    let length = 0;
    while (length < bytes.length) {
      const result = await file.read(bytes, length, bytes.length - length, length);
      if (result.bytesRead === 0) break;
      length += result.bytesRead;
    }
    return length === before.size && matches(before, await file.stat()) ? bytes : null;
  } finally { await file.close(); }
}
