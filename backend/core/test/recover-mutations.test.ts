import { describe, expect, it } from 'vitest';
import { classifyRecovery } from '../src/changes/recover-mutations.js';

describe('classifyRecovery', () => {
  it.each([
    ['a', 'b', 'a', 'not_applied'],
    ['a', 'b', 'b', 'applied'],
    ['a', 'b', 'c', 'conflicted'],
    ['a', 'b', null, 'conflicted']
  ] as const)('classifies before=%s after=%s actual=%s as %s', (before, after, actual, state) => {
    expect(classifyRecovery(before, after, actual)).toBe(state);
  });
});
