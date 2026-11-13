import { createHash } from 'node:crypto';
import { lstat, readdir, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { ContextPathPolicy, type ContextPathAction, type ContextPathMetadata } from './context-path-policy.js';
import { MAX_CONTEXT_FILE_BYTES, readBoundedContextFile } from './read-bounded-context-file.js';

interface ProjectFileReadInput {
  readonly path: string;
  readonly startLine?: number;
  readonly maxLines?: number;
  readonly action?: 'context' | 'explicit_file';
}

interface ProjectFileReadResult {
  readonly path: string;
  readonly content: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly totalLines: number;
  readonly truncated: boolean;
  readonly contentHash: string;
  readonly policyRevision?: string;
}

interface ProjectTextSearchInput {
  readonly query: string;
  readonly path?: string;
  readonly maxResults?: number;
}

interface ProjectTextSearchResult {
  readonly matches: readonly { readonly path: string; readonly line: number; readonly column: number; readonly preview: string }[];
  readonly truncated: boolean;
  readonly filesSearched: number;
  readonly bytesSearched: number;
}

const MAX_READ_BYTES = 64 * 1024;
const MAX_SEARCH_FILES = 500;
const MAX_SEARCH_BYTES = 8 * 1024 * 1024;
const MAX_SEARCH_RESULTS = 100;
const MAX_PREVIEW_CHARS = 400;

export class ProjectFilesystemFailure extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ProjectFilesystemFailure';
  }
}

function abortIfNeeded(signal: AbortSignal): void {
  if (signal.aborted) throw new ProjectFilesystemFailure('R1_CANCELLED', 'Operation cancelled.');
}

function normalizeRelativePath(value: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0') || isAbsolute(value) || /^(?:[A-Za-z]:|[\\/])/.test(value)) {
    throw new ProjectFilesystemFailure('R1_PATH_INVALID', 'Project path must be a non-empty relative path.');
  }
  const normalized = value.replaceAll('\\', '/');
  if (normalized.split('/').some((segment) => segment === '..' || segment.length === 0 && normalized !== '.')) {
    throw new ProjectFilesystemFailure('R1_PATH_INVALID', 'Project path contains an invalid segment.');
  }
  return normalized === '.' ? '.' : normalized;
}

function isWithin(root: string, target: string): boolean {
  const value = relative(root, target);
  return value === '' || (!isAbsolute(value) && !value.startsWith(`..${sep}`) && value !== '..');
}

function rejectContextPath(policy: ProjectFilesystemPolicy, relativePath: string, action: ContextPathAction, metadata?: ContextPathMetadata): void {
  const decision = policy.decide(relativePath, action, metadata);
  if (!decision.allowed) {
    throw new ProjectFilesystemFailure(decision.code ?? 'R1_PATH_SENSITIVE', decision.reason ?? 'Path is sensitive.');
  }
}

type ProjectFilesystemPolicy = Pick<ContextPathPolicy, 'decide' | 'refresh'>;

async function requirePolicyRevision(policy: ProjectFilesystemPolicy, revision: string): Promise<void> {
  if (await policy.refresh() !== revision) throw new ProjectFilesystemFailure('R4_CONTEXT_POLICY_CHANGED', 'Project context rules changed during the operation.');
}

async function canonicalPath(root: string, candidate: string): Promise<string> {
  let target: string;
  try { target = await realpath(candidate); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    throw new ProjectFilesystemFailure('R1_FILE_NOT_FOUND', 'Project path was not found.');
  }
  if (!isWithin(root, target)) throw new ProjectFilesystemFailure('R1_PATH_OUTSIDE_ROOT', 'Project path resolves outside root.');
  return target;
}

export interface ProjectFilesystemOptions {
  readonly contextPolicy?: ProjectFilesystemPolicy;
}

export class ProjectFilesystem {
  readonly #rootReady: Promise<string>;
  #policyReady: Promise<ProjectFilesystemPolicy> | undefined;

  constructor(root: string, private readonly options: ProjectFilesystemOptions = {}) {
    this.#rootReady = realpath(root);
  }

  private async policy(root: string): Promise<ProjectFilesystemPolicy> {
    if (this.options.contextPolicy !== undefined) return this.options.contextPolicy;
    this.#policyReady ??= ContextPathPolicy.fromProjectRoot(root).catch((error: unknown) => {
      this.#policyReady = undefined;
      throw error;
    });
    return this.#policyReady;
  }

  async refreshPolicyRevision(): Promise<string> {
    return (await this.policy(await this.#rootReady)).refresh();
  }

  async readFile(input: ProjectFileReadInput, signal: AbortSignal): Promise<ProjectFileReadResult> {
    abortIfNeeded(signal);
    const path = normalizeRelativePath(input.path);
    const root = await this.#rootReady;
    const policy = await this.policy(root);
    const revision = await policy.refresh();
    const action = input.action ?? 'explicit_file';
    rejectContextPath(policy, path, action, { kind: 'file' });
    const candidate = resolve(root, path);
    const target = await canonicalPath(root, candidate);
    const targetPath = relative(root, target).replaceAll('\\', '/') || '.';
    rejectContextPath(policy, targetPath, action, { kind: 'file' });
    let details;
    try { details = await stat(target); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      throw new ProjectFilesystemFailure('R1_FILE_NOT_FOUND', 'Project file was not found.');
    }
    if (!details.isFile()) throw new ProjectFilesystemFailure('R1_FILE_NOT_REGULAR', 'Project path is not a regular file.');
    rejectContextPath(policy, targetPath, action, { kind: 'file', size: details.size });
    await requirePolicyRevision(policy, revision);
    abortIfNeeded(signal);
    const bytes = await readBoundedContextFile(target, MAX_CONTEXT_FILE_BYTES, details);
    if (bytes === null) throw new ProjectFilesystemFailure('R1_FILE_TOO_LARGE', 'Project file exceeds the read limit or changed during reading.');
    if (await canonicalPath(root, candidate) !== target) throw new ProjectFilesystemFailure('R1_PATH_INVALID', 'Project path changed during reading.');
    await requirePolicyRevision(policy, revision);
    abortIfNeeded(signal);
    rejectContextPath(policy, path, action, { kind: 'file', bytes });
    rejectContextPath(policy, targetPath, action, { kind: 'file' });
    const text = bytes.toString('utf8');
    const startLine = input.startLine ?? 1;
    const maxLines = input.maxLines ?? 200;
    if (!Number.isInteger(startLine) || startLine < 1 || !Number.isInteger(maxLines) || maxLines < 1 || maxLines > 400) {
      throw new ProjectFilesystemFailure('R1_READ_INPUT_INVALID', 'Read line range is invalid.');
    }
    const lines = text.split('\n');
    const selected = lines.slice(startLine - 1, startLine - 1 + maxLines);
    const output: string[] = [];
    let outputBytes = 0;
    for (const line of selected) {
      const next = output.length === 0 ? line : `\n${line}`;
      if (outputBytes + Buffer.byteLength(next, 'utf8') > MAX_READ_BYTES) break;
      output.push(line);
      outputBytes += Buffer.byteLength(next, 'utf8');
    }
    return {
      path,
      content: output.join('\n'),
      startLine,
      endLine: output.length === 0 ? startLine - 1 : startLine + output.length - 1,
      totalLines: lines.length,
      truncated: output.length < selected.length || startLine - 1 + selected.length < lines.length,
      contentHash: createHash('sha256').update(bytes).digest('hex'),
      ...(action === 'context' ? { policyRevision: revision } : {})
    };
  }

  async searchText(input: ProjectTextSearchInput, signal: AbortSignal): Promise<ProjectTextSearchResult> {
    abortIfNeeded(signal);
    if (typeof input.query !== 'string' || input.query.length < 1 || input.query.length > 512) {
      throw new ProjectFilesystemFailure('R1_SEARCH_INPUT_INVALID', 'Search query is invalid.');
    }
    const path = normalizeRelativePath(input.path ?? '.');
    const maxResults = input.maxResults ?? 50;
    if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > MAX_SEARCH_RESULTS) {
      throw new ProjectFilesystemFailure('R1_SEARCH_INPUT_INVALID', 'Search result limit is invalid.');
    }
    const root = await this.#rootReady;
    const policy = await this.policy(root);
    const revision = await policy.refresh();
    const start = resolve(root, path);
    const canonicalStart = await canonicalPath(root, start);
    const scopeKind = (await stat(canonicalStart)).isDirectory() ? 'directory' : 'file';
    rejectContextPath(policy, path, 'search', { kind: scopeKind });
    rejectContextPath(policy, relative(root, canonicalStart).replaceAll('\\', '/') || '.', 'search', { kind: scopeKind });
    const paths: string[] = [];
    let fileLimitExceeded = false;
    const visit = async (current: string): Promise<void> => {
      abortIfNeeded(signal);
      const info = await lstat(current);
      if (info.isSymbolicLink()) return;
      const rel = relative(root, current).replaceAll('\\', '/') || '.';
      if (!policy.decide(rel, 'search', { kind: info.isDirectory() ? 'directory' : 'file' }).allowed) return;
      if (await canonicalPath(root, current) !== current) return;
      if (info.isFile()) {
        if (paths.length >= MAX_SEARCH_FILES) fileLimitExceeded = true;
        else paths.push(current);
        return;
      }
      if (!info.isDirectory()) return;
      const entries = await readdir(current, { withFileTypes: true });
      entries.sort((left, right) => left.name.localeCompare(right.name));
      for (const entry of entries) {
        await visit(resolve(current, entry.name));
      }
    };
    const sameStart = process.platform === 'win32' ? canonicalStart.toLowerCase() === start.toLowerCase() : canonicalStart === start;
    try { if (sameStart) await visit(canonicalStart); } catch (error) {
      if (error instanceof ProjectFilesystemFailure) throw error;
      throw new ProjectFilesystemFailure('R1_FILE_NOT_FOUND', 'Search path was not found.');
    }
    const matches: { path: string; line: number; column: number; preview: string }[] = [];
    let bytesSearched = 0;
    let bytesRead = 0;
    let truncated = fileLimitExceeded;
    let filesSearched = 0;
    for (const file of paths) {
      abortIfNeeded(signal);
      if (bytesRead >= MAX_SEARCH_BYTES || matches.length >= maxResults) { truncated = true; break; }
      await requirePolicyRevision(policy, revision);
      const relativePath = relative(root, file).replaceAll('\\', '/');
      const details = await lstat(file);
      if (!details.isFile() || await canonicalPath(root, file) !== file || !policy.decide(relativePath, 'search', { kind: 'file' }).allowed) continue;
      const limit = Math.min(MAX_CONTEXT_FILE_BYTES, MAX_SEARCH_BYTES - bytesRead);
      if (!policy.decide(relativePath, 'search', { kind: 'file', size: details.size }).allowed || details.size > limit) { truncated = true; continue; }
      const bytes = await readBoundedContextFile(file, limit, details);
      if (bytes === null) { truncated = true; continue; }
      bytesRead += bytes.length;
      if (await canonicalPath(root, file) !== file || !policy.decide(relativePath, 'search', { kind: 'file', bytes }).allowed) continue;
      filesSearched += 1;
      bytesSearched += bytes.length;
      const lines = bytes.toString('utf8').split('\n');
      for (let index = 0; index < lines.length; index += 1) {
        abortIfNeeded(signal);
        const line = lines[index];
        if (line === undefined) continue;
        let offset = line.indexOf(input.query);
        while (offset !== -1) {
          if (matches.length >= maxResults) { truncated = true; break; }
          matches.push({ path: relativePath, line: index + 1, column: offset + 1, preview: line.replace(/\r$/, '').slice(0, MAX_PREVIEW_CHARS) });
          offset = line.indexOf(input.query, offset + input.query.length);
        }
        if (truncated && matches.length >= maxResults) break;
      }
    }
    await requirePolicyRevision(policy, revision);
    abortIfNeeded(signal);
    return { matches, truncated, filesSearched, bytesSearched };
  }
}
