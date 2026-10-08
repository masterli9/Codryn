import { z } from 'zod';
import { modelToolCallSchema, toolResultSchema, type ModelToolCall, type ToolResult } from './tool-contract.js';
import { uuidSchema } from './ids.js';

export const modelTurnSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('assistant'), text: z.string(), calls: z.array(modelToolCallSchema) }).strict(),
  z.object({ kind: z.literal('tool'), result: toolResultSchema }).strict()
]);

export const r2RunResultSchema = z.object({
  schemaVersion: z.literal(2),
  runId: uuidSchema,
  stepCount: z.number().int().nonnegative(),
  status: z.enum(['completed', 'failed', 'cancelled']),
  finalText: z.string(),
  changeSetId: uuidSchema.nullable(),
  verification: z.object({
    status: z.enum(['verified', 'unverified', 'stale']),
    recordId: uuidSchema.nullable(),
    reason: z.string().min(1)
  }).strict(),
  recoveryRequired: z.boolean()
}).strict();

export type ModelTurn = z.infer<typeof modelTurnSchema>;
export type R2RunResult = z.infer<typeof r2RunResultSchema>;
export type { ModelToolCall, ToolResult };
