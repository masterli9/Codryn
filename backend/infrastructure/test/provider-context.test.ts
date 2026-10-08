import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

  it('matches nested glob paths and exposes a stable reason for blocked context', () => {
    const policy = new ContextPathPolicy(['generated/', '*.secret', '**/*.map', '!generated/keep.txt']);

    expect(policy.allowed('generated/deep/output.js')).toBe(false);
    expect(policy.allowed('generated/keep.txt')).toBe(true);
    expect(policy.allowed('config.secret')).toBe(false);
    expect(policy.allowed('nested/app.js')).toBe(true);
    expect(policy.allowed('nested/app.js.map')).toBe(false);
    expect(policy.decide('generated/deep/output.js')).toEqual({
      allowed: false,
      code: 'R2_CONTEXT_PATH_IGNORED',
      reason: 'Path is excluded by .codrynignore.'
    });
    expect(policy.decide('.env')).toEqual({
      allowed: false,
      code: 'R1_PATH_SENSITIVE',
      reason: 'Path is sensitive.'
    });
    expect(policy.allowed('UserData/codryn.sqlite')).toBe(false);
    expect(policy.allowed('blobs/change')).toBe(false);
  });

  it('loads the root policy and reports the source line for invalid syntax', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codryn-r2-context-policy-'));
    try {
      await mkdir(join(root, 'ignored'));
      await writeFile(join(root, '.codrynignore'), '# comment\nignored/**\n', 'utf8');
      const policy = await ContextPathPolicy.fromProjectRoot(root);
      expect(policy.allowed('ignored/file.txt')).toBe(false);

      await writeFile(join(root, '.codrynignore'), 'ignored/**\n/[invalid]\n', 'utf8');
      await expect(ContextPathPolicy.fromProjectRoot(root)).rejects.toMatchObject({
        code: 'R2_CONTEXT_POLICY_INVALID',
        line: 2,
        reason: 'absolute_pattern'
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
