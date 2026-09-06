import { isR1SensitiveRelativePath } from '@codryn/core';

export class ContextPathPolicyError extends Error {
  constructor(readonly code: 'R2_CONTEXT_POLICY_INVALID') { super('Context path policy is invalid.'); }
}

function patternMatch(pattern: string, path: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]');
  return new RegExp(`^${escaped}${pattern.endsWith('/') ? '.*' : '$'}`).test(path);
}

export class ContextPathPolicy {
  private readonly rules: readonly { negate: boolean; pattern: string }[];

  constructor(lines: readonly string[]) {
    const rules: { negate: boolean; pattern: string }[] = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (line.length === 0 || line.startsWith('#')) continue;
      const negate = line.startsWith('!');
      const pattern = (negate ? line.slice(1) : line).replaceAll('\\', '/');
      if (pattern.length === 0 || pattern.startsWith('/') || pattern.includes('[') || pattern.includes(']')) throw new ContextPathPolicyError('R2_CONTEXT_POLICY_INVALID');
      rules.push({ negate, pattern });
    }
    this.rules = rules;
  }

  allowed(relativePath: string): boolean {
    const path = relativePath.replaceAll('\\', '/');
    if (isR1SensitiveRelativePath(path) || path === '.git' || path.startsWith('.git/') || path === 'userData' || path.startsWith('userData/')) return false;
    let allowed = true;
    for (const rule of this.rules) if (patternMatch(rule.pattern, path)) allowed = rule.negate;
    return allowed;
  }
}
