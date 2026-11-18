import { expect, it } from 'vitest';
import { sameCheckInputs } from '@codryn/core';

it('invalidates a generic check on changed or newly introduced non-code project inputs', () => {
  const before = { '@policy': 'rules', '@tsc': 'tool', 'main.ts': 'source', 'data.txt': 'old' };
  expect(sameCheckInputs(before, { ...before, 'data.txt': 'new' })).toBe(false);
  expect(sameCheckInputs(before, { ...before, 'other.snap': 'extra' })).toBe(false);
  expect(sameCheckInputs(before, { ...before, '@node': 'unrelated-tool' })).toBe(true);
});
