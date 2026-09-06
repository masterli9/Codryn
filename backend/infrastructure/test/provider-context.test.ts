import { describe, expect, it } from 'vitest';
import { ContextPathPolicy, ContextPathPolicyError } from '../src/filesystem/context-path-policy.js';

describe('ContextPathPolicy', () => {
  it('applies root-relative ignore patterns while keeping sensitive defaults blocked', () => {
    const policy = new ContextPathPolicy(['# generated', 'src/**', '!src/keep.ts']);
    expect(policy.allowed('src/generated.ts')).toBe(false);
    expect(policy.allowed('src/keep.ts')).toBe(true);
    expect(policy.allowed('.env')).toBe(false);
    expect(policy.allowed('.git/config')).toBe(false);
  });

  it('rejects unsupported policy syntax instead of silently widening context', () => {
    expect(() => new ContextPathPolicy(['/absolute'])).toThrow(ContextPathPolicyError);
    expect(() => new ContextPathPolicy(['src/[a-z]'])).toThrow(ContextPathPolicyError);
  });
});
