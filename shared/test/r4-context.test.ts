import { expect, it } from 'vitest';
import { r3IpcRequestSchema, r3SubmitInputSchema } from '../src/index.js';

const id = '11111111-1111-4111-8111-111111111111';
const input = { requestId: id, chatId: id, task: 'Zkontroluj změnu', mode: 'demo', maxSteps: 8 };
const reference = { path: 'src/ui/část s mezerou.ts', kind: 'file', contentHash: 'a'.repeat(64), policyRevision: 'b'.repeat(64) };

it('round-trips structured references in submit IPC', () => {
  expect(r3IpcRequestSchema.parse({ operation: 'run.submit', ...input, references: [reference] })).toMatchObject({ references: [reference] });
});

it.each(['/tmp/x', 'C:/secret', '../x', 'src/../x', 'src//x', 'src\\x', 'src/x:stream', 'a'.repeat(1025)])(
  'rejects an unsafe or overlong reference path %s',
  path => expect(r3SubmitInputSchema.safeParse({ ...input, references: [{ ...reference, path }] }).success).toBe(false)
);

it('bounds the number of unique references and disallows duplicate paths', () => {
  const references = Array.from({ length: 8 }, (_, i) => ({ ...reference, path: `src/${i}.ts` }));
  expect(r3SubmitInputSchema.safeParse({ ...input, references }).success).toBe(true);
  expect(r3SubmitInputSchema.safeParse({ ...input, references: [...references, reference] }).success).toBe(false);
  expect(r3SubmitInputSchema.safeParse({ ...input, references: [reference, { ...reference, kind: 'directory' }] }).success).toBe(false);
});

it('accepts an empty picker query and bounds search input', () => {
  const search = { operation: 'context.reference.search', requestId: id, chatId: id, projectId: id, query: '', limit: 50 };
  expect(r3IpcRequestSchema.safeParse(search).success).toBe(true);
  expect(r3IpcRequestSchema.safeParse({ ...search, limit: 51 }).success).toBe(false);
  expect(r3IpcRequestSchema.safeParse({ ...search, query: 'a'.repeat(201) }).success).toBe(false);
});
