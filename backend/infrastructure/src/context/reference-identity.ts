import { createHash } from 'node:crypto';
import type { Dirent, Stats } from 'node:fs';
import { lstat, opendir, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { r4ReferencePathSchema } from '@codryn/shared';
import type { R4Reference } from '@codryn/shared';
import type { ContextPathAction, ContextPathDecisionCode, ContextPathPolicy } from '../filesystem/context-path-policy.js';
import { MAX_CONTEXT_FILE_BYTES, readBoundedContextFile } from '../filesystem/read-bounded-context-file.js';

export const maxReferenceEntries = 5000;
const maxDirectoryBytes = 8 * 1024 * 1024;
type ReferenceChild = Pick<R4Reference, 'kind' | 'path'>;
export type ReferenceFailure = {
  status: 'missing' | 'ignored' | 'sensitive' | 'oversized' | 'binary' | 'outside_root' | 'changed' | 'limited';
  reason: string;
};
export type ReferenceIdentity = ReferenceFailure | { status: 'ready'; reference: R4Reference; bytes?: Buffer; children?: ReferenceChild[] };
interface IdentityOptions {
  allow?: 'ignored' | 'sensitive';
  chargeBytes?: (bytes: number) => boolean;
}
const reasons: Record<ReferenceFailure['status'], string> = {
  missing: 'Soubor nebo složka už na této cestě není. Cíl mohl být přejmenován.',
  ignored: 'Cestu vylučuje pravidlo .codrynignore.',
  sensitive: 'Cesta může obsahovat citlivé údaje.',
  oversized: 'Soubor překračuje limit pro čtení.',
  binary: 'Soubor není text v kódování UTF-8.',
  outside_root: 'Cesta míří mimo projekt nebo prochází přes odkaz.',
  changed: 'Cíl se při kontrole změnil. Vyberte referenci znovu.',
  limited: 'Cestu nelze zkontrolovat v rámci limitů.'
};

function failure(status: ReferenceFailure['status']): ReferenceFailure {
  return { status, reason: reasons[status] };
}

function denied(code: ContextPathDecisionCode | undefined): ReferenceFailure {
  switch (code) {
    case 'R1_PATH_SENSITIVE': return failure('sensitive');
    case 'R2_CONTEXT_PATH_IGNORED': return failure('ignored');
    case 'R1_FILE_TOO_LARGE': return failure('oversized');
    case 'R1_FILE_NOT_TEXT': return failure('binary');
    case 'R1_PATH_INVALID': return failure('outside_root');
    default: return failure('limited');
  }
}

function unchanged(before: Stats, after: Stats): boolean {
  return before.dev === after.dev && before.ino === after.ino && before.mtimeMs === after.mtimeMs &&
    before.ctimeMs === after.ctimeMs && before.size === after.size;
}

export async function readReferenceDirectory(path: string, limit: number, signal: AbortSignal) {
  const directory = await opendir(path);
  const entries: Dirent[] = [];
  for await (const entry of directory) {
    signal.throwIfAborted();
    if (entries.length === limit) return { entries: [], limited: true };
    entries.push(entry);
  }
  entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  return { entries, limited: false };
}

export async function referenceTarget(root: string, path: string) {
  const candidate = resolve(root, path);
  const canonical = await realpath(candidate);
  const canonicalRelative = relative(root, canonical);
  if (canonicalRelative === '..' || canonicalRelative.startsWith(`..${sep}`) || isAbsolute(canonicalRelative) ||
    canonicalRelative.split(sep).join('/') !== path) return null;
  const stats = await lstat(candidate);
  return stats.isSymbolicLink() ? null : { candidate, stats };
}

async function directoryIdentity(root: string, path: string, candidate: string, policy: ContextPathPolicy, action: ContextPathAction, signal: AbortSignal, chargeBytes?: IdentityOptions['chargeBytes']) {
  const listing = await readReferenceDirectory(candidate, maxReferenceEntries, signal);
  if (listing.limited) return null;
  const children: ReferenceChild[] = [];
  let remainingBytes = maxDirectoryBytes;
  for (const entry of listing.entries) {
    signal.throwIfAborted();
    const child = `${path}/${entry.name}`;
    const kind = entry.isDirectory() ? 'directory' : 'file';
    if ((!entry.isFile() && !entry.isDirectory()) || !r4ReferencePathSchema.safeParse(child).success ||
      !policy.decide(child, action, { kind }).allowed) continue;
    const target = await referenceTarget(root, child).catch(() => null);
    if (!target || (kind === 'file' ? !target.stats.isFile() : !target.stats.isDirectory())) continue;
    if (!policy.decide(child, action, { kind, ...(kind === 'file' ? { size: target.stats.size } : {}) }).allowed) continue;
    if (kind === 'file') {
      if (target.stats.size > remainingBytes || chargeBytes?.(target.stats.size) === false) return null;
      remainingBytes -= target.stats.size;
      const bytes = await readBoundedContextFile(target.candidate, target.stats.size, target.stats).catch(() => null);
      if (!bytes || !policy.decide(child, action, { kind, bytes }).allowed) continue;
    }
    children.push({ path: child, kind });
  }
  return children;
}

export async function readReferenceIdentity(root: string, path: string, policy: ContextPathPolicy, action: ContextPathAction, signal: AbortSignal, options: IdentityOptions = {}): Promise<ReferenceIdentity> {
  signal.throwIfAborted();
  if (!r4ReferencePathSchema.safeParse(path).success) return failure('outside_root');
  const revision = await policy.refresh();
  const initial = policy.decide(path, action);
  // Directory-only rules require the actual kind. Hard-denied sensitive paths need a file permit.
  if (!initial.allowed && initial.code !== 'R2_CONTEXT_PATH_IGNORED' && !(action === 'explicit_file' && options.allow === 'sensitive')) return denied(initial.code);
  try {
    const target = await referenceTarget(root, path);
    if (!target) return failure('outside_root');
    const { candidate, stats } = target;
    if (!stats.isFile() && !stats.isDirectory()) return failure('missing');
    const kind = stats.isDirectory() ? 'directory' : 'file';
    const size = kind === 'file' ? stats.size : undefined;
    const decision = policy.decide(path, action, { kind, ...(size === undefined ? {} : { size }) });
    const permitted = kind === 'file' && decision.permit !== undefined && decision.permit === options.allow;
    if (!decision.allowed && !permitted) return denied(decision.code);
    if (size !== undefined && size > MAX_CONTEXT_FILE_BYTES) return failure('oversized');
    if (size !== undefined && options.chargeBytes?.(size) === false) return failure('limited');
    const bytes = size === undefined ? undefined : await readBoundedContextFile(candidate, size, stats);
    if (kind === 'file' && (!bytes || bytes.length !== size)) return failure('changed');
    if (bytes) {
      // An authorized exception overrides path rules only. Apply content validation independently.
      const content = policy.decide(path, action, { kind, bytes });
      if (!content.allowed && !(permitted && content.permit === options.allow)) return denied(content.code);
      if (bytes.includes(0)) return failure('binary');
      try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return failure('binary'); }
    }
    const children = kind === 'directory' ? await directoryIdentity(root, path, candidate, policy, action, signal, options.chargeBytes) : undefined;
    if (children === null) return failure('limited');
    const after = await referenceTarget(root, path);
    signal.throwIfAborted();
    if (!after || !unchanged(stats, after.stats) || await policy.refresh() !== revision) return failure('changed');
    const contentHash = createHash('sha256').update(bytes ?? JSON.stringify(children)).digest('hex');
    return { status: 'ready', reference: { path, kind, contentHash, policyRevision: revision }, ...(bytes ? { bytes } : {}), ...(children ? { children } : {}) };
  } catch (error) {
    signal.throwIfAborted();
    if (typeof error === 'object' && error !== null && 'code' in error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return failure('missing');
      if (error.code === 'ELOOP') return failure('outside_root');
      if (error.code === 'EACCES' || error.code === 'EPERM') return failure('limited');
    }
    throw error;
  }
}
