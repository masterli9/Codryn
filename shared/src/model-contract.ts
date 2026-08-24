import { z } from 'zod';
import { uuidSchema } from './ids.js';
import { jsonValueSchema } from './json-value.js';
import { modelToolCallSchema, toolResultSchema } from './tool-contract.js';

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
  path: z.string().min(1),
  content: z.string(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  byteLength: z.number().int().nonnegative(),
  reason: z.literal('explicit_reference')
}).strict();

export const modelToolDefinitionSchema = z.object({
  toolId: z.string().min(1),
  toolVersion: z.number().int().positive(),
  description: z.string().min(1),
  inputSchema: z.record(z.string(), jsonValueSchema)
}).strict();

export const modelRequestSchema = z.object({
  runId: uuidSchema,
  task: z.string().trim().min(1).max(16_384),
  project: z.object({ id: z.string().min(1) }).strict(),
  context: z.array(modelContextSourceSchema).max(8),
  tools: z.array(modelToolDefinitionSchema),
  previousToolResults: z.array(toolResultSchema)
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
export type ModelStreamEvent = z.infer<typeof modelStreamEventSchema>;
