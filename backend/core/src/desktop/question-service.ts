import type { ModelToolDefinition, QuestionCheckpoint, QuestionInput } from '@codryn/shared';
import { questionInputSchema } from '@codryn/shared';

export const questionTool: ModelToolDefinition = {
  toolId: 'ask_user', toolVersion: 1,
  description: 'Ask for a consequential missing user decision. Provide a reason and 2–5 distinct choices. Never ask for credentials, permission to run tools or destructive confirmation. Use this call alone.',
  inputSchema: {
    type: 'object', properties: {
      reason: { type: 'string' }, prompt: { type: 'string' },
      options: { type: 'array', minItems: 2, maxItems: 5, items: {
        type: 'object', properties: { id: { type: 'string' }, label: { type: 'string' }, description: { type: 'string' } }, required: ['id', 'label'], additionalProperties: false
      } }
    }, required: ['reason', 'prompt', 'options'], additionalProperties: false
  }
};
export interface QuestionBoundary {
  save(input: QuestionInput, checkpoint: QuestionCheckpoint): Promise<void>;
  readonly resume?: QuestionCheckpoint;
}
export class QuestionSuspended extends Error {
  constructor() { super('R4_QUESTION_SUSPENDED'); }
}
export function validateQuestion(input: unknown, safe: (value: string) => string): QuestionInput {
  const question = questionInputSchema.parse(input);
  if (safe(JSON.stringify(question)) !== JSON.stringify(question)
    || /(?:allow|approve|permission|spustit příkaz|povolit|schválit|delete|smazat|reset --hard|force push)/iu.test(question.prompt)) {
    throw new Error('R3_INPUT_INVALID');
  }
  return question;
}
