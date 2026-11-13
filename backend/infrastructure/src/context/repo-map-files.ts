import { createHash } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import type { Stats } from 'node:fs';
import type { ContextPathPolicy } from '../filesystem/context-path-policy.js';
import { MAX_CONTEXT_FILE_BYTES, readBoundedContextFile } from '../filesystem/read-bounded-context-file.js';

type MapAction = 'map' | 'deep_init' | 'context';

function identity(path: string): string {
  return process.platform === 'win32' ? path.toLowerCase() : path;
}

export async function mapRootStamp(root: string): Promise<string | null> {
  const details = await lstat(root);
  if (!details.isDirectory() || details.isSymbolicLink() || identity(await realpath(root)) !== identity(root)) return null;
  return fileStamp(details);
}

export function fileStamp(details: Stats): string {
  return [details.dev, details.ino, details.size, details.mtimeMs, details.ctimeMs].join(':');
}

export async function mapPath(root: string, path: string, policy: ContextPathPolicy, action: MapAction) {
  if (path.includes('\\') || path.split('/').some(segment => !segment || segment === '.' || segment === '..')) return null;
  const absolute = resolve(root, path);
  const rel = relative(root, absolute);
  if (rel !== path.split('/').join(sep) || !policy.decide(path, action).allowed) return null;
  try {
    const details = await lstat(absolute);
    const kind = details.isFile() ? 'file' : details.isDirectory() ? 'directory' : null;
    if (!kind || details.isSymbolicLink() || !policy.decide(path, action, { kind }).allowed) return null;
    if (identity(await realpath(absolute)) !== identity(absolute)) return null;
    return { absolute, details, kind, stamp: fileStamp(details) };
  } catch (error) {
    if (error instanceof Error && ['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM'].includes(String(Reflect.get(error, 'code')))) return null;
    throw error;
  }
}

export async function readMapFile(root: string, path: string, policy: ContextPathPolicy, action: MapAction, signal: AbortSignal, bytesRemaining: number) {
  const revision = policy.revision;
  const candidate = await mapPath(root, path, policy, action);
  if (candidate?.kind !== 'file') return { state: 'changed', bytes: 0 } as const;
  const size = candidate.details.size;
  const decision = policy.decide(path, action, { kind: 'file', size });
  if (!decision.allowed && decision.code !== 'R1_FILE_TOO_LARGE') return { state: 'excluded', bytes: 0 } as const;
  if (size > MAX_CONTEXT_FILE_BYTES || size > bytesRemaining) return { state: 'unread', bytes: 0, stamp: candidate.stamp } as const;
  if (await policy.refresh() !== revision) return { state: 'changed', bytes: 0 } as const;
  signal.throwIfAborted();
  const contents = await readBoundedContextFile(candidate.absolute, size, candidate.details).catch((error: unknown) => {
    if (error instanceof Error && ['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM', 'EISDIR'].includes(String(Reflect.get(error, 'code')))) return null;
    throw error;
  });
  signal.throwIfAborted();
  if (contents?.length !== size || (await mapPath(root, path, policy, action))?.stamp !== candidate.stamp
      || await policy.refresh() !== revision) return { state: 'changed', bytes: size } as const;
  if (!policy.decide(path, action, { kind: 'file', size, bytes: contents }).allowed) return { state: 'excluded', bytes: size } as const;
  return { state: 'read', bytes: size, stamp: candidate.stamp, text: contents.toString('utf8'), hash: createHash('sha256').update(contents).digest('hex') } as const;
}
