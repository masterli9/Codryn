import { z } from 'zod';

export const r4RepoMapStatusSchema = z.object({
  state: z.enum(['indexing', 'ready', 'partial', 'error']),
  mode: z.enum(['quick', 'deep']),
  entries: z.number().int().nonnegative(),
  scanned: z.number().int().nonnegative(),
  instructions: z.number().int().nonnegative(),
  reason: z.enum(['limit', 'cancelled', 'changed', 'policy_invalid', 'unavailable']).optional(),
  policyLine: z.number().int().positive().optional()
}).strict();

export type R4RepoMapStatus = z.infer<typeof r4RepoMapStatusSchema>;
