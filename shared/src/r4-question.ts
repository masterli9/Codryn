import { z } from 'zod';
import { uuidSchema, isoTimestampSchema } from './ids.js';
import { modelTurnSchema } from './r2-agent.js';
import { jsonValueSchema } from './json-value.js';

const secret = /(?:api[ _-]?key|password|heslo|access[ _-]?token|private[ _-]?key|privátní klíč)|(?:TOKEN|SECRET)\s*=/iu;
const text = (limit: number) => z.string().trim().min(1).max(limit).refine(value => !value.includes('\0') && !secret.test(value));
export const questionInputSchema = z.object({
  reason: text(500), prompt: text(1000),
  options: z.array(z.object({ id: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/), label: text(120), description: text(300).optional() }).strict()).min(2).max(5)
}).strict().refine(value => new Set(value.options.map(option => option.id)).size === value.options.length
  && new Set(value.options.map(option => option.label.toLocaleLowerCase())).size === value.options.length);
export const questionAnswerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('option'), optionId: z.string().min(1).max(40) }).strict(),
  z.object({ kind: z.literal('text'), text: text(2000) }).strict(),
  z.object({ kind: z.literal('declined') }).strict()
]);
export const questionSchema = z.object({
  id: uuidSchema, runId: uuidSchema, chatId: uuidSchema, reason: text(500), prompt: text(1000),
  options: questionInputSchema.shape.options,
  status: z.enum(['waiting', 'answered', 'cancelled']), createdAt: isoTimestampSchema, sequence: z.number().int().positive()
}).strict();
export const questionCheckpointSchema = z.object({
  runId: uuidSchema, stepCount: z.number().int().min(1).max(32), changeSetId: uuidSchema.nullable(),
  history: z.array(modelTurnSchema).max(64), failedTool: z.boolean(), providerState: jsonValueSchema.optional()
}).strict().refine(value => new TextEncoder().encode(JSON.stringify(value)).length <= 256 * 1024);
export type QuestionInput = z.infer<typeof questionInputSchema>;
export type QuestionAnswer = z.infer<typeof questionAnswerSchema>;
export type Question = z.infer<typeof questionSchema>;
export type QuestionCheckpoint = z.infer<typeof questionCheckpointSchema>;
