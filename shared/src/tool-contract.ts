import { z } from 'zod';
import { uuidSchema } from './ids.js';
import { jsonValueSchema } from './json-value.js';

export const modelToolCallSchema = z.object({
  callId: uuidSchema,
  toolId: z.string().min(1),
  toolVersion: z.number().int().positive(),
  arguments: jsonValueSchema
}).strict();

export const toolResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), callId: uuidSchema, output: jsonValueSchema }).strict(),
  z.object({
    ok: z.literal(false),
    callId: uuidSchema,
    error: z.object({ code: z.string().min(1), message: z.string().min(1) }).strict()
  }).strict()
]);

export type ModelToolCall = z.infer<typeof modelToolCallSchema>;
export type ToolResult = z.infer<typeof toolResultSchema>;
