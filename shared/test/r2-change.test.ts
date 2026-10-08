import { describe, expect, it } from 'vitest';
import { patchInputSchema } from '../src/index.js';

const validInput = {
  path: 'src/example.ts',
  expectedHash: 'a'.repeat(64),
  edits: [{ oldText: 'before', newText: 'after' }]
};

describe('R2 patch contract', () => {
  it('accepts a bounded targeted text patch', () => {
    expect(patchInputSchema.parse(validInput)).toEqual(validInput);
  });

  it('rejects too many edits, NULs, invalid hashes and unknown keys', () => {
    expect(() => patchInputSchema.parse({
      ...validInput,
      edits: Array.from({ length: 17 }, () => ({ oldText: 'a', newText: 'b' }))
    })).toThrow();
    expect(() => patchInputSchema.parse({ ...validInput, path: 'src/\0example.ts' })).toThrow();
    expect(() => patchInputSchema.parse({ ...validInput, expectedHash: 'A'.repeat(64) })).toThrow();
    expect(() => patchInputSchema.parse({ ...validInput, unexpected: true })).toThrow();
  });

  it('enforces the combined UTF-8 edit budget', () => {
    const withinLimit = 'ž'.repeat(32_768);
    expect(() => patchInputSchema.parse({
      ...validInput,
      edits: [{ oldText: withinLimit, newText: '' }]
    })).not.toThrow();
    expect(() => patchInputSchema.parse({
      ...validInput,
      edits: [{ oldText: `${withinLimit}a`, newText: '' }]
    })).toThrow();
  });

  it('accepts exactly sixteen edits and rejects the seventeenth', () => {
    const edits = Array.from({ length: 16 }, (_, index) => ({
      oldText: `part-${index}`,
      newText: `replacement-${index}`
    }));
    expect(() => patchInputSchema.parse({ ...validInput, edits })).not.toThrow();
    expect(() => patchInputSchema.parse({
      ...validInput,
      edits: [...edits, { oldText: 'part-16', newText: 'replacement-16' }]
    })).toThrow();
  });

  it('rejects a NUL in replacement text', () => {
    expect(() => patchInputSchema.parse({
      ...validInput,
      edits: [{ oldText: 'before', newText: 'after\0' }]
    })).toThrow();
  });
});
