import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { decideSensitivePath } from './sensitive-path-policy.js';
import type { ContextPathPolicy } from './context-path-policy.js';

interface ProjectFileReadInput {
  readonly path: string;
  readonly startLine?: number;
  readonly maxLines?: number;
}

interface ProjectFileReadResult {
  readonly path: string;
  readonly content: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly totalLines: number;
  readonly truncated: boolean;
  readonly contentHash: string;
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

const MAX_FILE_BYTES = 1024 * 1024;
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

function decodeText(bytes: Buffer): string | null {
  if (bytes.includes(0)) return null;
  const text = bytes.toString('utf8');
  return Buffer.from(text, 'utf8').equals(bytes) ? text : null;
}

function rejectContextPath(relativePath: string, contextPolicy?: Pick<ContextPathPolicy, 'decide'>): void {
  const decision = contextPolicy?.decide(relativePath) ?? decideSensitivePath(relativePath);
  if (!decision.allowed) {
    throw new ProjectFilesystemFailure(decision.code ?? 'R1_PATH_SENSITIVE', decision.reason ?? 'Path is sensitive.');
  }
}

export interface ProjectFilesystemOptions {
  readonly contextPolicy?: Pick<ContextPathPolicy, 'decide' | 'refresh'>;
}

export class ProjectFilesystem {
  readonly #rootReady: Promise<string>;

  constructor(root: string, private readonly options: ProjectFilesystemOptions = {}) {
    this.#rootReady = realpath(root);
  }

  async readFile(input: ProjectFileReadInput, signal: AbortSignal): Promise<ProjectFileReadResult> {
    abortIfNeeded(signal);
    await this.options.contextPolicy?.refresh?.();
    const path = normalizeRelativePath(input.path);
    rejectContextPath(path, this.options.contextPolicy);
    const root = await this.#rootReady;
    const candidate = resolve(root, path);
    let target: string;
    try { target = await realpath(candidate); } catch { throw new ProjectFilesystemFailure('R1_FILE_NOT_FOUND', 'Project file was not found.'); }
    if (!isWithin(root, target)) throw new ProjectFilesystemFailure('R1_PATH_OUTSIDE_ROOT', 'Project path resolves outside root.');
    rejectContextPath(relative(root, target).replaceAll('\\', '/') || '.', this.options.contextPolicy);
    let details;
    try { details = await stat(target); } catch { throw new ProjectFilesystemFailure('R1_FILE_NOT_FOUND', 'Project file was not found.'); }
    if (!details.isFile()) throw new ProjectFilesystemFailure('R1_FILE_NOT_REGULAR', 'Project path is not a regular file.');
    if (details.size > MAX_FILE_BYTES) throw new ProjectFilesystemFailure('R1_FILE_TOO_LARGE', 'Project file exceeds the read limit.');
    abortIfNeeded(signal);
    const bytes = await readFile(target);
    const text = decodeText(bytes);
    if (text === null) throw new ProjectFilesystemFailure('R1_FILE_NOT_TEXT', 'Project file is not valid UTF-8 text.');
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
      contentHash: createHash('sha256').update(bytes).digest('hex')
    };
  }

  async searchText(input: ProjectTextSearchInput, signal: AbortSignal): Promise<ProjectTextSearchResult> {
    abortIfNeeded(signal);
    await this.options.contextPolicy?.refresh?.();
    if (typeof input.query !== 'string' || input.query.length < 1 || input.query.length > 512) {
      throw new ProjectFilesystemFailure('R1_SEARCH_INPUT_INVALID', 'Search query is invalid.');
    }
    const path = normalizeRelativePath(input.path ?? '.');
    const maxResults = input.maxResults ?? 50;
    if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > MAX_SEARCH_RESULTS) {
      throw new ProjectFilesystemFailure('R1_SEARCH_INPUT_INVALID', 'Search result limit is invalid.');
    }
    rejectContextPath(path, this.options.contextPolicy);
    const root = await this.#rootReady;
    const start = resolve(root, path);
    let canonicalStart: string;
    try { canonicalStart = await realpath(start); } catch { throw new ProjectFilesystemFailure('R1_FILE_NOT_FOUND', 'Search path was not found.'); }
    if (!isWithin(root, canonicalStart)) throw new ProjectFilesystemFailure('R1_PATH_OUTSIDE_ROOT', 'Project path resolves outside root.');
    rejectContextPath(relative(root, canonicalStart).replaceAll('\\', '/') || '.', this.options.contextPolicy);
    const paths: string[] = [];
    let fileLimitExceeded = false;
    const visit = async (current: string): Promise<void> => {
      abortIfNeeded(signal);
      const info = await lstat(current);
      if (info.isSymbolicLink()) return;
      const rel = relative(root, current).replaceAll('\\', '/') || '.';
      if (!(this.options.contextPolicy?.decide(rel) ?? decideSensitivePath(rel)).allowed) return;
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
    try { await visit(start); } catch (error) {
      if (error instanceof ProjectFilesystemFailure) throw error;
      throw new ProjectFilesystemFailure('R1_FILE_NOT_FOUND', 'Search path was not found.');
    }
    const matches: { path: string; line: number; column: number; preview: string }[] = [];
    let bytesSearched = 0;
    let truncated = fileLimitExceeded;
    let filesSearched = 0;
    for (const file of paths) {
      abortIfNeeded(signal);
      if (bytesSearched >= MAX_SEARCH_BYTES || matches.length >= maxResults) { truncated = true; break; }
      const size = (await lstat(file)).size;
      if (size > MAX_FILE_BYTES || bytesSearched + size > MAX_SEARCH_BYTES) { truncated = true; continue; }
      const bytes = await readFile(file);
      const text = decodeText(bytes);
      if (text === null) continue;
      filesSearched += 1;
      bytesSearched += bytes.length;
      const relativePath = relative(root, file).replaceAll('\\', '/');
      if (!(this.options.contextPolicy?.decide(relativePath) ?? decideSensitivePath(relativePath)).allowed) continue;
      const lines = text.split('\n');
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
    return { matches, truncated, filesSearched, bytesSearched };
  }
}
