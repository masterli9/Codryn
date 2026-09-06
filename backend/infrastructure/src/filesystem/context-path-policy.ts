import { isR1SensitiveRelativePath } from '@codryn/core';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export type ContextPathDecisionCode = 'R1_PATH_SENSITIVE' | 'R2_CONTEXT_PATH_IGNORED';

export interface ContextPathDecision {
  readonly allowed: boolean;
  readonly code?: ContextPathDecisionCode;
  readonly reason?: string;
}

export type ContextPathPolicyInvalidReason =
  | 'empty_pattern'
  | 'absolute_pattern'
  | 'unsupported_character_class'
  | 'nul_byte';

export class ContextPathPolicyError extends Error {
  constructor(
    readonly code: 'R2_CONTEXT_POLICY_INVALID',
    readonly line: number | undefined,
    readonly reason: ContextPathPolicyInvalidReason
  ) {
    super(`Context path policy is invalid: ${reason}.`);
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
  return new RegExp(`^${expression}${directoryOnly ? '(?:/.*)?' : ''}$`);
}

export class ContextPathPolicy {
  private rules: readonly { negate: boolean; pattern: string; regex: RegExp }[];
  private sourcePath: string | undefined;

  constructor(lines: readonly string[]) {
    const rules: { negate: boolean; pattern: string; regex: RegExp }[] = [];
    for (const [index, raw] of lines.entries()) {
      const line = raw.trim();
      if (line.length === 0 || line.startsWith('#')) continue;
      const negate = line.startsWith('!');
      let pattern = (negate ? line.slice(1) : line).replaceAll('\\', '/');
      if (pattern.startsWith('./')) pattern = pattern.slice(2);
      if (pattern.length === 0) {
        throw new ContextPathPolicyError('R2_CONTEXT_POLICY_INVALID', index + 1, 'empty_pattern');
      }
      if (pattern.startsWith('/')) {
        throw new ContextPathPolicyError('R2_CONTEXT_POLICY_INVALID', index + 1, 'absolute_pattern');
      }
      if (pattern.includes('[') || pattern.includes(']')) {
        throw new ContextPathPolicyError('R2_CONTEXT_POLICY_INVALID', index + 1, 'unsupported_character_class');
      }
      if (pattern.includes('\0')) {
        throw new ContextPathPolicyError('R2_CONTEXT_POLICY_INVALID', index + 1, 'nul_byte');
      }
      rules.push({ negate, pattern, regex: patternRegex(pattern) });
    }
    this.rules = rules;
  }

  static async fromProjectRoot(root: string): Promise<ContextPathPolicy> {
    const sourcePath = join(root, '.codrynignore');
    try {
      const contents = await readFile(sourcePath, 'utf8');
      const policy = new ContextPathPolicy(contents.split(/\r?\n/));
      policy.sourcePath = sourcePath;
      return policy;
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
        const policy = new ContextPathPolicy([]);
        policy.sourcePath = sourcePath;
        return policy;
      }
      throw error;
    }
  }

  async refresh(): Promise<void> {
    if (this.sourcePath === undefined) return;
    try {
      const contents = await readFile(this.sourcePath, 'utf8');
      this.rules = new ContextPathPolicy(contents.split(/\r?\n/)).rules;
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
        this.rules = [];
        return;
      }
      throw error;
    }
  }

  decide(relativePath: string): ContextPathDecision {
    const path = relativePath.replaceAll('\\', '/');
    const segments = path.toLowerCase().split('/');
    if (isR1SensitiveRelativePath(path)
      || segments.some((segment) => segment === 'userdata' || segment === 'user-data' || segment === 'blobs')) {
      return { allowed: false, code: 'R1_PATH_SENSITIVE', reason: 'Path is sensitive.' };
    }
    let allowed = true;
    for (const rule of this.rules) if (rule.regex.test(path)) allowed = rule.negate;
    return allowed
      ? { allowed: true }
      : { allowed: false, code: 'R2_CONTEXT_PATH_IGNORED', reason: 'Path is excluded by .codrynignore.' };
  }

  allowed(relativePath: string): boolean {
    return this.decide(relativePath).allowed;
  }
}
