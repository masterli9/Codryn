import { z } from 'zod';
import { uuidSchema } from './ids.js';

export const projectRelativePathSchema = z.string().min(1).refine(
  (path) => !/^(?:[A-Za-z]:|[\\/])/.test(path),
  'Project paths must be relative.'
);

export const runAgentRequestSchema = z.object({
  requestId: uuidSchema,
  projectRoot: z.string().min(1),
  task: z.string().trim().min(1).max(16_384),
  contextReferences: z.array(projectRelativePathSchema).max(8),
  maxSteps: z.number().int().min(1).max(32)
}).strict();

export const agentRunFailureCodeSchema = z.enum([
  'R1_INPUT_INVALID',
  'R1_CONTEXT_REFERENCE_INVALID',
  'R1_CONTEXT_LIMIT_EXCEEDED',
  'R1_MODEL_CAPABILITY_MISSING',
  'R1_MODEL_ADAPTER_FAILED',
  'R1_MODEL_RESPONSE_UNSUPPORTED',
  'R1_FAKE_SCENARIO_MISMATCH',
  'R1_TOOL_UNKNOWN',
  'R1_TOOL_INPUT_INVALID',
  'R1_TOOL_PERMISSION_DENIED',
  'R1_TOOL_OUTPUT_INVALID',
  'R1_TOOL_EXECUTION_FAILED',
  'R1_STEP_LIMIT_EXCEEDED',
  'R1_CANCELLED',
  'R1_PERSISTENCE_FAILED',
  'R1_INTERNAL_ERROR'
]);

const verificationNotApplicableSchema = z.object({
  status: z.literal('not_applicable'),
  reason: z.literal('R1_READ_ONLY_RUN')
}).strict();

const runAgentResultBase = {
  schemaVersion: z.literal(1),
  runId: uuidSchema,
  stepCount: z.number().int().nonnegative(),
  verification: verificationNotApplicableSchema
};

export const runAgentResultSchema = z.discriminatedUnion('status', [
  z.object({
    ...runAgentResultBase,
    status: z.literal('completed'),
    finalText: z.string().min(1)
  }).strict(),
  z.object({
    ...runAgentResultBase,
    status: z.literal('cancelled'),
    failure: z.object({
      code: z.literal('R1_CANCELLED'),
      message: z.string().min(1)
    }).strict()
  }).strict(),
  z.object({
    ...runAgentResultBase,
    status: z.literal('failed'),
    failure: z.object({
      code: agentRunFailureCodeSchema,
      message: z.string().min(1)
    }).strict()
  }).strict()
]);

export type RunAgentRequest = z.infer<typeof runAgentRequestSchema>;
export type AgentRunFailureCode = z.infer<typeof agentRunFailureCodeSchema>;
export type RunAgentResult = z.infer<typeof runAgentResultSchema>;
