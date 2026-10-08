import { describe, expect, it } from 'vitest';
import { preparePatch } from '../src/changes/prepare-patch.js';

describe('preparePatch', () => {
  it('applies one unambiguous edit preserving CRLF', () => {
    expect(preparePatch('a\r\nb\r\n', [{ oldText: 'b', newText: 'c' }]))
      .toBe('a\r\nc\r\n');
  });

  it('rejects an ambiguous or missing source', () => {
    expect(() => preparePatch('aa', [{ oldText: 'a', newText: 'b' }]))
      .toThrow('R2_PATCH_AMBIGUOUS');
    expect(() => preparePatch('a', [{ oldText: 'z', newText: 'b' }]))
      .toThrow('R2_PATCH_SOURCE_MISSING');
  });

  it('rejects overlaps, no-ops and applies multiple ranges against one input', () => {
    expect(() => preparePatch('abcd', [
      { oldText: 'ab', newText: 'x' },
      { oldText: 'bc', newText: 'y' }
    ])).toThrow('R2_PATCH_OVERLAP');
    expect(() => preparePatch('same', [{ oldText: 'same', newText: 'same' }]))
      .toThrow('R2_PATCH_NO_CHANGE');
    expect(preparePatch('zero one two', [
      { oldText: 'zero', newText: '0' },
      { oldText: 'two', newText: '2' }
    ])).toBe('0 one 2');
  });

  it('preserves BOM and line-ending bytes represented by the input string', () => {
    expect(preparePatch('\uFEFFa\nb\n', [{ oldText: 'b\n', newText: 'c\n' }]))
      .toBe('\uFEFFa\nc\n');
    expect(preparePatch('a\r\nb\r\n', [{ oldText: 'b\r\n', newText: 'c\r\n' }]))
      .toBe('a\r\nc\r\n');
  });

  it('allows an edit to produce an empty file and handles surrogate pairs', () => {
    expect(preparePatch('only', [{ oldText: 'only', newText: '' }])).toBe('');
    expect(preparePatch('A😀B', [{ oldText: '😀', newText: '🧪' }])).toBe('A🧪B');
  });
});
