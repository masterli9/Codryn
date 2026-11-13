import { isR1SensitiveFilename, isR1SensitiveRelativePath } from '@codryn/core';
import { createHash } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { MAX_CONTEXT_FILE_BYTES, readBoundedContextFile } from './read-bounded-context-file.js';

export type ContextPathAction = 'crawl' | 'search' | 'typescript_index' | 'map' | 'deep_init' | 'context' | 'explicit_file';
export type ContextPathDecisionCode = 'R1_PATH_SENSITIVE' | 'R2_CONTEXT_PATH_IGNORED' | 'R1_PATH_INVALID'
  | 'R1_FILE_TOO_LARGE' | 'R1_FILE_NOT_TEXT' | 'R1_FILE_NOT_REGULAR' | 'R2_CONTEXT_POLICY_INVALID';

export interface ContextPathMetadata {
  readonly kind?: 'file' | 'directory';
  readonly size?: number;
  readonly bytes?: Uint8Array;
}

export interface ContextPathDecision {
  readonly allowed: boolean;
  readonly code?: ContextPathDecisionCode;
  readonly reason?: string;
  readonly permit?: 'ignored' | 'sensitive';
}

export type ContextPathPolicyInvalidReason =
  | 'empty_pattern'
  | 'absolute_pattern'
  | 'invalid_segment'
  | 'unsupported_character_class'
  | 'nul_byte'
  | 'unreadable_rules';

export class ContextPathPolicyError extends Error {
  constructor(
    readonly code: 'R2_CONTEXT_POLICY_INVALID',
    readonly line: number | undefined,
    readonly reason: ContextPathPolicyInvalidReason
  ) {
    super(line === undefined ? `Context path policy is invalid: ${reason}.` : `Invalid .codrynignore rule at line ${line}: ${reason}.`);
    this.name = 'ContextPathPolicyError';
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

function patternRegex(pattern: string): RegExp {
  const directoryOnly = pattern.endsWith('/');
  const barePattern = directoryOnly ? pattern.slice(0, -1) : pattern;
  const hasSlash = barePattern.includes('/');
  let expression = '';
  for (let index = 0; index < barePattern.length; index += 1) {
    const character = barePattern[index];
    if (character === '*') {
      if (barePattern[index + 1] === '*') {
        index += 1;
        if (barePattern[index + 1] === '/') {
          index += 1;
          expression += '(?:.*/)?';
        } else {
          expression += '.*';
        }
      } else {
        expression += '[^/]*';
      }
    } else if (character === '?') {
      expression += '[^/]';
    } else {
      expression += escapeRegex(character ?? '');
    }
  }
  if (!hasSlash) expression = `(?:.*/)?${expression}`;
  return new RegExp(`^${expression}$`, process.platform === 'win32' ? 'i' : '');
}

const policyVersion = 'codryn-context-path-v1';
const protectedDirectories = new Set(['userdata', 'user-data', 'blobs']);
const utf8 = new TextDecoder('utf-8', { fatal: true });

function decodeText(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) return null;
  try { return utf8.decode(bytes); } catch { return null; }
}

type Rule = { negate: boolean; pattern: string; regex: RegExp };

function isSensitiveFilename(name: string): boolean {
  return isR1SensitiveFilename(name) || name.toLowerCase().startsWith('.env');
}

export class ContextPathPolicy {
  private rules: readonly Rule[];
  private sourcePath: string | undefined;
  private currentRevision: string;
  private invalid: ContextPathPolicyError | undefined;
  private pendingRefresh: Promise<string> | undefined;

  constructor(lines: readonly string[]) {
    const rules: Rule[] = [];
    for (const [index, raw] of lines.entries()) {
      const line = raw.trim();
      if (line.length === 0 || line.startsWith('#')) continue;
      const negate = line.startsWith('!');
      let pattern = (negate ? line.slice(1) : line).replaceAll('\\', '/');
      if (pattern.startsWith('./')) pattern = pattern.slice(2);
      if (pattern.length === 0) {
        throw new ContextPathPolicyError('R2_CONTEXT_POLICY_INVALID', index + 1, 'empty_pattern');
      }
      if (/^(?:[A-Za-z]:|\/)/.test(pattern)) {
        throw new ContextPathPolicyError('R2_CONTEXT_POLICY_INVALID', index + 1, 'absolute_pattern');
      }
      if (pattern.includes('[') || pattern.includes(']')) {
        throw new ContextPathPolicyError('R2_CONTEXT_POLICY_INVALID', index + 1, 'unsupported_character_class');
      }
      if (pattern.includes('\0')) {
        throw new ContextPathPolicyError('R2_CONTEXT_POLICY_INVALID', index + 1, 'nul_byte');
      }
      if (pattern.replace(/\/$/, '').split('/').some((part) => part === '' || part === '..' || part === '.')) {
        throw new ContextPathPolicyError('R2_CONTEXT_POLICY_INVALID', index + 1, 'invalid_segment');
      }
      rules.push({ negate, pattern, regex: patternRegex(pattern) });
    }
    this.rules = rules;
    this.currentRevision = createHash('sha256').update(JSON.stringify([policyVersion, ...rules.map(({ negate, pattern }) => [negate, pattern])])).digest('hex');
  }

  static async fromProjectRoot(root: string, deferRefresh = false): Promise<ContextPathPolicy> {
    const policy = new ContextPathPolicy([]);
    policy.sourcePath = join(await realpath(root), '.codrynignore');
    if (!deferRefresh) await policy.refresh();
    return policy;
  }

  get revision(): string { return this.currentRevision; }

  async refresh(): Promise<string> {
    if (this.sourcePath === undefined) return this.revision;
    const pending = this.pendingRefresh;
    const path = this.sourcePath;
    const refresh = pending === undefined ? this.reload(path) : pending.catch(() => undefined).then(() => this.reload(path));
    this.pendingRefresh = refresh;
    try {
      return await refresh;
    } finally {
      if (this.pendingRefresh === refresh) this.pendingRefresh = undefined;
    }
  }

  private async reload(path: string): Promise<string> {
    try {
      const before = await lstat(path).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
        return undefined;
      });
      let contents = '';
      if (before !== undefined) {
        if (!before.isFile() || before.isSymbolicLink()) throw new ContextPathPolicyError('R2_CONTEXT_POLICY_INVALID', undefined, 'unreadable_rules');
        const bytes = await readBoundedContextFile(path, MAX_CONTEXT_FILE_BYTES, before);
        const after = await lstat(path);
        const decoded = bytes === null ? null : decodeText(bytes);
        if (decoded === null || !after.isFile() || after.ino !== before.ino || after.dev !== before.dev
          || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs || after.size !== before.size) {
          throw new ContextPathPolicyError('R2_CONTEXT_POLICY_INVALID', undefined, 'unreadable_rules');
        }
        contents = decoded;
      }
      const policy = new ContextPathPolicy(contents.split(/\r?\n/));
      this.rules = policy.rules;
      this.currentRevision = policy.revision;
      this.invalid = undefined;
      return this.revision;
    } catch (error) {
      this.invalid = error instanceof ContextPathPolicyError ? error : new ContextPathPolicyError('R2_CONTEXT_POLICY_INVALID', undefined, 'unreadable_rules');
      throw this.invalid;
    }
  }

  decide(relativePath: string, action: ContextPathAction = 'context', metadata: ContextPathMetadata = {}): ContextPathDecision {
    if (this.invalid !== undefined) return { allowed: false, code: this.invalid.code, reason: this.invalid.message };
    const normalized = relativePath.replaceAll('\\', '/');
    if (normalized.length === 0 || /^(?:[A-Za-z]:|\/)/.test(normalized) || normalized.includes('\0')
      || normalized.split('/').some((part) => part === '' || part === '..' || (process.platform === 'win32' && part.includes(':')))) {
      return { allowed: false, code: 'R1_PATH_INVALID', reason: 'Project path is not a valid relative path.' };
    }
    const segments = normalized.split('/').filter((part) => part !== '.');
    const permitAction = action === 'explicit_file' && metadata.kind === 'file';
    const name = segments.at(-1) ?? '';
    if (Math.max(metadata.size ?? 0, metadata.bytes?.byteLength ?? 0) > MAX_CONTEXT_FILE_BYTES) {
      return { allowed: false, code: 'R1_FILE_TOO_LARGE', reason: 'Project file exceeds the read limit.' };
    }
    if (metadata.bytes !== undefined && decodeText(metadata.bytes) === null) {
      return { allowed: false, code: 'R1_FILE_NOT_TEXT', reason: 'Project file is not valid UTF-8 text.' };
    }
    const protectedPath = segments.some((segment) => isR1SensitiveRelativePath(`${segment}/.`) || protectedDirectories.has(segment.toLowerCase()));
    const protectedParent = segments.slice(0, -1).some(isSensitiveFilename);
    if (protectedPath || protectedParent || isSensitiveFilename(name)) {
      return { allowed: false, code: 'R1_PATH_SENSITIVE', reason: 'Path is sensitive.',
        ...(permitAction && !protectedPath && !protectedParent ? { permit: 'sensitive' as const } : {}) };
    }
    const path = segments.join('/') || '.';
    const ancestors = segments.slice(0, -1).map((_segment, index) => segments.slice(0, index + 1).join('/'));
    let allowed = true;
    for (const rule of this.rules) {
      if ((!rule.pattern.endsWith('/') || metadata.kind !== 'file') && rule.regex.test(path)
        || ancestors.some((ancestor) => rule.regex.test(ancestor))) allowed = rule.negate;
    }
    if (!allowed) return { allowed: false, code: 'R2_CONTEXT_PATH_IGNORED', reason: 'Path is excluded by .codrynignore.',
      ...(permitAction ? { permit: 'ignored' as const } : {}) };
    if (action === 'explicit_file' && metadata.kind === 'directory') {
      return { allowed: false, code: 'R1_FILE_NOT_REGULAR', reason: 'Project path is not a regular file.' };
    }
    return { allowed: true };
  }

  allowed(relativePath: string): boolean {
    return this.decide(relativePath).allowed;
  }
}
