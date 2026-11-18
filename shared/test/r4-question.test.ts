import { expect, it } from 'vitest';
import { questionInputSchema, questionAnswerSchema } from '../src/r4-question.js';
const question = { reason: 'The choice changes storage scope.', prompt: 'Where should data live?', options: [{ id: 'local', label: 'Local' }, { id: 'shared', label: 'Shared' }] };
it('requires bounded distinct choices and supports one explicit answer', () => {
  expect(questionInputSchema.safeParse(question).success).toBe(true);
  for (const options of [question.options.slice(0, 1), Array(6).fill(question.options[0]), [question.options[0], question.options[0]]]) {
    expect(questionInputSchema.safeParse({ ...question, options }).success).toBe(false);
  }
  expect(questionInputSchema.safeParse({ ...question, reason: ' ' }).success).toBe(false);
  expect(questionInputSchema.safeParse({ ...question, prompt: 'Provide your API key' }).success).toBe(false);
  expect(questionAnswerSchema.safeParse({ kind: 'text', text: 'Use local files' }).success).toBe(true);
  expect(questionAnswerSchema.safeParse({ kind: 'declined' }).success).toBe(true);
  expect(questionAnswerSchema.safeParse({ kind: 'text', text: 'TOKEN=secret' }).success).toBe(false);
});
