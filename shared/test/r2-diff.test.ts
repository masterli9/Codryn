import { describe, expect, it } from 'vitest';
import { fileDiffSchema } from '../src/r2-diff.js';

describe('fileDiffSchema', () => {
  it('rejects missing or malformed hashes', () => {
    expect(fileDiffSchema.safeParse({
      path: 'src/a.ts', beforeHash: '', afterHash: 'b', status: 'changed', lines: [], truncated: false
    }).success).toBe(false);
  });
});
