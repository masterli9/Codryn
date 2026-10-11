import { z } from 'zod';
import { uuidSchema, isoTimestampSchema } from './ids.js';
import { modelDescriptorSchema } from './model-contract.js';
import { agentRunFailureCodeSchema } from './r1-agent.js';
import { r2RunResultSchema } from './r2-agent.js';

export const r3ErrorCodeSchema = z.enum(['R3_INPUT_INVALID', 'R3_NOT_FOUND', 'R3_CHAT_PROJECT_MISMATCH', 'R3_PROJECT_BUSY', 'R3_RECOVERY_REQUIRED', 'R3_SECRET_UNAVAILABLE', 'R3_CONSENT_REQUIRED', 'R3_RUNTIME_UNAVAILABLE', 'R3_PROJECT_UNAVAILABLE', 'R3_STALE_VIEW', 'R3_REQUEST_MISMATCH', 'R3_SENDER_REJECTED', 'R3_INTERNAL']);
export const r3ModeSchema = z.enum(['demo', 'openai']);
export const r3JobStateSchema = z.enum(['queued', 'running', 'stopping', 'finished', 'interrupted']);
export const r3TitleSchema = z.string().trim().min(1).max(120).refine(value => !value.includes('\0'));
export const r3SubmitInputSchema = z.object({ requestId: uuidSchema, chatId: uuidSchema, task: z.string().trim().min(1).max(16_384).refine(value => !value.includes('\0')), maxSteps: z.number().int().min(1).max(32), mode: r3ModeSchema, retryOfRequestId: uuidSchema.optional() }).strict();
export const r3AcceptedSchema = z.object({ requestId: uuidSchema, messageId: uuidSchema, jobId: uuidSchema, duplicate: z.boolean() }).strict();
export const r3ChatSchema = z.object({ id: uuidSchema, projectId: uuidSchema, title: r3TitleSchema, archived: z.boolean(), createdAt: isoTimestampSchema }).strict();
export const r3MessageSchema = z.object({ id: uuidSchema, chatId: uuidSchema, requestId: uuidSchema, runId: uuidSchema.nullable(), retryOfRequestId: uuidSchema.nullable(), role: z.enum(['user', 'assistant']), text: z.string().refine(value => new TextEncoder().encode(value).length <= 64 * 1024), sequence: z.number().int().positive(), state: z.enum(['streaming', 'complete', 'interrupted']), createdAt: isoTimestampSchema }).strict();
export const r3ProviderErrorSchema = z.object({ category: z.enum(['auth', 'rate_limit', 'timeout', 'interrupted', 'invalid_tool_call', 'provider']), retryAfterMs: z.number().int().nonnegative().max(120000).nullable() }).strict();
export const r3RunViewSchema = z.object({
  jobId: uuidSchema, requestId: uuidSchema, runId: uuidSchema.nullable(), state: r3JobStateSchema,
  phase: z.enum(['idle', 'preparing_context', 'waiting_for_model', 'waiting_for_user_input', 'waiting_for_approval', 'executing_tool', 'verifying', 'completed', 'cancelled', 'failed']).nullable(),
  mode: r3ModeSchema, model: modelDescriptorSchema, maxSteps: z.number().int().min(1).max(32),
  result: r2RunResultSchema.omit({ finalText: true }).nullable(),
  failure: z.object({ code: z.union([agentRunFailureCodeSchema, r3ErrorCodeSchema]), message: z.string().min(1).max(4096) }).strict().nullable(),
  stepCount: z.number().int().nonnegative(), startedAt: isoTimestampSchema.nullable(), endedAt: isoTimestampSchema.nullable(),
  usage: z.object({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative() }).strict().nullable(), providerError: r3ProviderErrorSchema.nullable()
}).strict();
export type R3Mode = z.infer<typeof r3ModeSchema>;
export type R3JobState = z.infer<typeof r3JobStateSchema>;
export type R3ErrorCode = z.infer<typeof r3ErrorCodeSchema>;
export type R3SubmitInput = z.infer<typeof r3SubmitInputSchema>;
export type R3Accepted = z.infer<typeof r3AcceptedSchema>;
export type R3Chat = z.infer<typeof r3ChatSchema>;
export type R3Message = z.infer<typeof r3MessageSchema>;
export type R3RunView = z.infer<typeof r3RunViewSchema>;
