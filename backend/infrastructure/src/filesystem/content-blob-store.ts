import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, open, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import type { BlobStore } from '@codryn/core';

const defaultMaxBytes = 256 * 1024 * 1024;
const hashPattern = /^[0-9a-f]{64}$/;

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function requireHash(hash: string): string {
  if (!hashPattern.test(hash)) throw new Error('R2_BLOB_HASH_INVALID');
  return hash;
}

async function directoryBytes(directory: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    total += (await stat(join(directory, entry.name))).size;
  }
  return total;
}

export class ContentBlobStore implements BlobStore {
  private readonly directory: string;
  private readonly maxBytes: number;

  constructor(rootDirectory: string, options: { readonly maxBytes?: number } = {}) {
    const root = resolve(rootDirectory);
    if (!isAbsolute(rootDirectory)) throw new Error('R2_BLOB_ROOT_NOT_ABSOLUTE');
    this.directory = join(root, 'change-blobs');
    this.maxBytes = options.maxBytes ?? defaultMaxBytes;
    if (!Number.isSafeInteger(this.maxBytes) || this.maxBytes < 1) {
      throw new Error('R2_BLOB_LIMIT_INVALID');
    }
  }

  async put(input: Uint8Array): Promise<string> {
    if (!(input instanceof Uint8Array)) throw new Error('R2_BLOB_BYTES_INVALID');
    const bytes = new Uint8Array(input);
    const hash = digest(bytes);
    await mkdir(this.directory, { recursive: true });
    const destination = join(this.directory, hash);
    try {
      const existing = await readFile(destination);
      if (digest(existing) !== hash) throw new Error('R2_BLOB_HASH_MISMATCH');
      return hash;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    if (await directoryBytes(this.directory) + bytes.byteLength > this.maxBytes) {
      throw new Error('R2_BLOB_RETENTION_LIMIT');
    }
    const temporaryDirectory = await mkdtemp(join(this.directory, '.tmp-'));
    const temporary = join(temporaryDirectory, 'blob');
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(temporary, 'w');
      await handle.write(bytes);
      await handle.sync();
      await handle.close();
      handle = undefined;
      try {
        await rename(temporary, destination);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const existing = await readFile(destination);
        if (digest(existing) !== hash) throw new Error('R2_BLOB_HASH_MISMATCH');
      }
      return hash;
    } finally {
      await handle?.close().catch(() => undefined);
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }

  async get(hashInput: string): Promise<Uint8Array> {
    const hash = requireHash(hashInput);
    const bytes = await readFile(join(this.directory, hash));
    if (digest(bytes) !== hash) throw new Error('R2_BLOB_HASH_MISMATCH');
    return new Uint8Array(bytes);
  }
}
