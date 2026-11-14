import { expect, it } from 'vitest';
import { typescriptQueryInputSchema, typescriptQueryOutputSchema } from '../src/index.js';

it('validates a bounded query and requires exactly one symbol selector', () => {
  const input = { kind: 'definition', path: 'src/app.ts' };
  expect(typescriptQueryInputSchema.parse({ ...input, symbol: 'Thing' })).toMatchObject({ maxResults: 20 });
  for (const update of [{}, { line: 0, column: 1 }, { line: 1 }, { symbol: 'Thing', line: 1, column: 1 }, { symbol: 'X', maxResults: 51 },
    ...['', '/tmp/a.ts', '../x.ts', 'src\\x.ts', 'x\0.ts', 'C:/x.ts'].map(path => ({ path, symbol: 'Thing' }))]) {
    expect(typescriptQueryInputSchema.safeParse({ ...input, ...update }).success).toBe(false);
  }
  expect(typescriptQueryInputSchema.safeParse({ ...input, kind: 'syntaxTree' }).success).toBe(false);
});

it('rejects raw content, stale items and oversized UTF-8 output', () => {
  const item = { path: 'src/app.ts', line: 1, column: 1, endLine: 1, endColumn: 2, display: 'ě'.repeat(400) };
  const output = { status: 'ok', mode: 'configured', revision: 1, targetHash: 'a'.repeat(64), policyRevision: 'b'.repeat(64), items: [item], truncated: false, reason: null };
  expect(typescriptQueryOutputSchema.safeParse(output).success).toBe(true);
  expect(typescriptQueryOutputSchema.safeParse({ ...output, status: 'stale' }).success).toBe(false);
  expect(typescriptQueryOutputSchema.safeParse({ ...output, items: [{ ...item, source: 'raw source' }] }).success).toBe(false);
  expect(typescriptQueryOutputSchema.safeParse({ ...output, items: Array.from({ length: 50 }, () => item) }).success).toBe(false);
});
