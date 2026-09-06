import { z } from 'zod';
import { commandSpecSchema } from './r2-permission.js';
import { uuidSchema } from './ids.js';

export const verificationRecordSchema = z.object({
  id: uuidSchema,
  runId: uuidSchema,
  callId: uuidSchema,
  projectId: uuidSchema,
  kind: z.literal('test'),
  command: commandSpecSchema,
  scope: z.literal('project'),
  revision: z.number().int().nonnegative(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  occurredAt: z.string().datetime({ offset: true }),
  result: z.enum(['passed', 'failed', 'incomplete']),
  stale: z.boolean(),
  reason: z.string().min(1).max(4096),
  exitCode: z.number().int().nullable()
}).strict();

export type VerificationRecord = z.infer<typeof verificationRecordSchema>;
