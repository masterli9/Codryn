import { z } from 'zod';
import { uuidSchema } from './ids.js';
import { jsonValueSchema } from './json-value.js';
import { projectRelativePathSchema } from './r1-agent.js';
import { modelToolCallSchema, toolResultSchema } from './tool-contract.js';
import { modelTurnSchema } from './r2-agent.js';

export const modelCapabilityStatusSchema = z.enum(['supported', 'unsupported', 'unknown']);

export const modelCapabilitiesSchema = z.object({
  streaming: modelCapabilityStatusSchema,
  toolCalling: modelCapabilityStatusSchema,
  structuredOutput: modelCapabilityStatusSchema,
  imageInput: modelCapabilityStatusSchema,
  usageMetadata: modelCapabilityStatusSchema,
  contextLimit: modelCapabilityStatusSchema,
  compaction: modelCapabilityStatusSchema
}).strict();

export const modelDescriptorSchema = z.object({
  adapterId: z.string().min(1),
  modelId: z.string().min(1),
  capabilities: modelCapabilitiesSchema
}).strict();

export const modelContextSourceSchema = z.object({
  path: projectRelativePathSchema,
  content: z.string(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  byteLength: z.number().int().nonnegative(),
  reason: z.enum(['explicit_reference', 'chat_history', 'project_rules', 'directory_reference', 'loaded_excerpt', 'repo_map'])
}).strict();

export const modelToolDefinitionSchema = z.object({
  toolId: z.string().min(1),
  toolVersion: z.number().int().positive(),
  description: z.string().min(1),
  inputSchema: z.record(z.string(), jsonValueSchema)
}).strict();

export const maxPriorConversationMessages = 16;
export const maxPriorConversationBytes = 32 * 1024;
export const priorConversationSchema = z.array(z.object({
  role: z.enum(['user', 'assistant']),
  text: z.string().min(1)
}).strict()).max(maxPriorConversationMessages)
  .refine(messages => {
    const encoder = new TextEncoder();
    return messages.reduce((bytes, message) => bytes + encoder.encode(message.text).length, 0) <= maxPriorConversationBytes;
  })
  .refine(messages => messages.length % 2 === 0 && messages.every((message, index) => message.role === (index % 2 === 0 ? 'user' : 'assistant')));

export const conversationContextEventSchema = z.object({
  messageIds: z.array(uuidSchema).max(maxPriorConversationMessages),
  messageCount: z.number().int().min(0).max(maxPriorConversationMessages),
  byteLength: z.number().int().min(0).max(maxPriorConversationBytes),
  truncated: z.boolean(),
  reason: z.enum(['none', 'count_limit', 'byte_limit', 'oversized_latest'])
}).strict().refine(event => event.messageIds.length === event.messageCount && event.messageCount % 2 === 0 &&
  new Set(event.messageIds).size === event.messageCount && event.truncated === (event.reason !== 'none') &&
  (event.messageCount === 0) === (event.byteLength === 0) &&
  (event.reason !== 'oversized_latest' || event.messageCount === 0));

export const modelRequestSchema = z.object({
  runId: uuidSchema,
  task: z.string().trim().min(1).max(16_384),
  project: z.object({ id: z.string().min(1) }).strict(),
  context: z.array(modelContextSourceSchema).max(32),
  tools: z.array(modelToolDefinitionSchema),
  previousToolResults: z.array(toolResultSchema),
  history: z.array(modelTurnSchema).max(64).optional(),
  priorConversation: priorConversationSchema.optional()
}).strict();

const modelErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1)
}).strict();

export const modelStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text_delta'), text: z.string().min(1) }).strict(),
  z.object({ type: z.literal('tool_call'), call: modelToolCallSchema }).strict(),
  z.object({
    type: z.literal('usage'),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative()
  }).strict(),
  z.object({ type: z.literal('completed') }).strict(),
  z.object({ type: z.literal('failed'), error: modelErrorSchema }).strict()
]);

export type ModelCapabilityStatus = z.infer<typeof modelCapabilityStatusSchema>;
export type ModelCapabilities = z.infer<typeof modelCapabilitiesSchema>;
export type ModelDescriptor = z.infer<typeof modelDescriptorSchema>;
export type ModelContextSource = z.infer<typeof modelContextSourceSchema>;
export type ModelToolDefinition = z.infer<typeof modelToolDefinitionSchema>;
export type ModelRequest = z.infer<typeof modelRequestSchema>;
export type PriorConversationMessage = z.infer<typeof priorConversationSchema>[number];
export type ModelStreamEvent = z.infer<typeof modelStreamEventSchema>;
