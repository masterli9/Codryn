import { opendir } from 'node:fs/promises';
import { basename, extname, posix } from 'node:path';
import type { R4RepoMapStatus } from '@codryn/shared';
import { ContextPathPolicy, ContextPathPolicyError } from '../filesystem/context-path-policy.js';
import { mapPath, mapRootStamp, readMapFile } from './repo-map-files.js';
import type { RepoMapInstruction, RepoMapMetadata } from './repo-map-store.js';

export type ScanMode = R4RepoMapStatus['mode'];
export interface ScanLimits { entries: number; bytes: number; milliseconds: number }
export interface ScanInput { root: string; mode: ScanMode; limits: ScanLimits }
export interface ScanResult {
  status: R4RepoMapStatus;
  policyRevision: string | null;
  items: RepoMapMetadata[];
  instructions: RepoMapInstruction[];
  verification?: { root: string; stamps: [string, string][] };
}

const supportedSource = /\.(?:[cm]?[jt]s|[jt]sx)$/i;
const binaryExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.zip', '.exe', '.dll', '.woff', '.woff2', '.mp4', '.sqlite', '.ico']);

function role(path: string): RepoMapMetadata['role'] {
  if (/(?:^|\/)(?:__tests__|tests?)\/|\.(?:test|spec)\.[^.]+$/i.test(path)) return 'test';
  if (/(?:^|\/)(?:tsconfig[^/]*\.json|package\.json|\.codrynignore|[^/]+\.config\.[^/]+)$/i.test(path)) return 'config';
  if (/\.(?:mdx?|txt|rst)$/i.test(path)) return 'docs';
  return supportedSource.test(path) ? 'source' : 'other';
}

function extract(text: string): { symbols: string[]; specifiers: string[] } {
  const symbols = new Set<string>();
  for (const match of text.matchAll(/^\s*export\s+(?:(?:default|declare|async|abstract)\s+)*(?:function|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]{0,119})\b/gm)) {
    if (match[1]) symbols.add(match[1]);
    if (symbols.size >= 64) break;
  }
  const specifiers = new Set<string>();
  for (const match of text.matchAll(/^\s*(?:import|export)\s+(?:[^;'"\n]*?\bfrom\s*)?['"](\.{1,2}\/[^'"\r\n]{1,240})['"]/gm)) {
    if (match[1]) specifiers.add(match[1]);
    if (specifiers.size >= 64) break;
  }
  return { symbols: [...symbols].sort(), specifiers: [...specifiers] };
}

function resolveImports(path: string, imports: string[], files: ReadonlySet<string>): string[] {
  const resolved = new Set<string>();
  for (const specifier of imports) {
    const candidate = posix.normalize(posix.join(posix.dirname(path), specifier));
    const sourceCandidate = candidate.replace(/\.[cm]?js$/, extension => extension.replace('j', 't'));
    const found = [candidate, sourceCandidate, ...['.ts', '.tsx', '.js', '.jsx'].flatMap(extension => [candidate + extension, candidate + '/index' + extension])]
      .find(option => files.has(option));
    if (found) resolved.add(found);
  }
  return [...resolved].sort();
}

export function initialMapStatus(mode: ScanMode): R4RepoMapStatus {
  return { state: 'indexing', mode, entries: 0, scanned: 0, instructions: 0 };
}

export async function scanRepoMap(input: ScanInput, signal: AbortSignal, report: (value: R4RepoMapStatus) => void): Promise<ScanResult> {
  const { root, mode, limits } = input;
  const action = mode === 'deep' ? 'deep_init' : 'map';
  let status = initialMapStatus(mode);
  let policyRevision: string | null = null;
  const items: RepoMapMetadata[] = [], instructions: RepoMapInstruction[] = [];
  const stamps = new Map<string, string>();
  let bytes = 0, partial = false, changed = false;
  const deadline = performance.now() + limits.milliseconds;
  const withinTime = () => performance.now() < deadline;
  try {
    const policy = await ContextPathPolicy.fromProjectRoot(root);
    policyRevision = policy.revision;
    const rootStamp = await mapRootStamp(root);
    if (rootStamp === null) throw new Error('R4_REPO_MAP_ROOT_CHANGED');
    const pending: string[] = [''];
    while (pending.length) {
      signal.throwIfAborted();
      if (!withinTime() || status.scanned === limits.entries) { partial = true; break; }
      const path = pending.pop() ?? '';
      const candidate = path ? await mapPath(root, path, policy, action) : null;
      if (path) status.scanned += 1;
      if (!path || candidate?.kind === 'directory') {
        if (path && candidate) {
          items.push({ path, kind: 'directory', role: role(path), symbols: [], imports: [], contentHash: 'unread', freshness: 'unread' });
          stamps.set(path, candidate.stamp);
        }
        const directory = await opendir(candidate?.absolute ?? root);
        const children: string[] = [];
        // Reserve the remaining entry budget for all names, even excluded paths.
        const available = Math.max(0, limits.entries - status.scanned - pending.length);
        for await (const child of directory) {
          if (!withinTime() || children.length === available) {
            partial = true;
            status.scanned += children.length;
            children.length = 0;
            break;
          }
          children.push(path ? path + '/' + child.name : child.name);
        }
        if (path && (await mapPath(root, path, policy, action))?.stamp !== candidate?.stamp) changed = true;
        pending.push(...children.sort().reverse());
      } else if (candidate && !binaryExtensions.has(extname(path).toLowerCase())) {
        const value = await readMapFile(root, path, policy, action, signal, limits.bytes - bytes);
        bytes += value.bytes;
        if (value.state === 'changed') changed = true;
        if (value.state === 'unread') partial = true;
        if (value.state === 'read' || value.state === 'unread') {
          stamps.set(path, value.stamp);
          const details = value.state === 'read' && supportedSource.test(path) ? extract(value.text) : { symbols: [], specifiers: [] };
          items.push({
            path, kind: 'file', role: role(path), symbols: details.symbols, imports: details.specifiers,
            contentHash: value.state === 'read' ? value.hash : 'unread', freshness: value.state === 'read' ? 'current' : 'unread'
          });
          if (mode === 'deep' && value.state === 'read' && basename(path).toLowerCase() === 'agents.md') {
            instructions.push({ path, contentHash: value.hash, authority: 'project_rules' });
          }
        }
      }
      if (status.scanned > 0 && status.scanned % 64 === 0) report({ ...status, entries: items.length, instructions: instructions.length });
    }
    const files = new Set(items.filter(item => item.kind === 'file').map(item => item.path));
    for (const item of items) item.imports = resolveImports(item.path, item.imports, files);
    if (await mapRootStamp(root) !== rootStamp || await policy.refresh() !== policyRevision) changed = true;
    if (changed) return { status: { ...status, state: 'partial', reason: 'changed' }, policyRevision: null, items: [], instructions: [] };
    status = { ...status, state: partial ? 'partial' : 'ready', ...(partial ? { reason: 'limit' as const } : {}), entries: items.length, instructions: instructions.length };
    return { status, policyRevision, items, instructions, verification: { root: rootStamp, stamps: [...stamps] } };
  } catch (error) {
    if (signal.aborted) throw error;
    const invalid = error instanceof ContextPathPolicyError;
    return {
      status: { ...status, state: 'error', reason: invalid ? 'policy_invalid' : 'unavailable', ...(invalid && error.line ? { policyLine: error.line } : {}) },
      policyRevision: null, items: [], instructions: []
    };
  }
}

export function instructionApplies(path: string, explicitPaths: readonly string[]): boolean {
  const directory = posix.dirname(path);
  return directory === '.' || explicitPaths.some(candidate => candidate === directory || candidate.startsWith(directory + '/'));
}

export function lexicalPathName(path: string): string {
  return basename(path, extname(path)).toLowerCase();
}
