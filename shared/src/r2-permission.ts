import { z } from 'zod';
import { uuidSchema } from './ids.js';

export const commandSpecSchema = z.object({
  executable: z.string().min(1).max(4096),
  args: z.array(z.string().max(4096)).max(128),
  cwd: z.string().min(1).max(4096),
  timeoutMs: z.number().int().positive().max(120_000),
  maxOutputBytes: z.number().int().positive().max(256 * 1024)
}).strict();

export const permissionStateSchema = z.enum([
  'pending', 'allowed_once', 'denied', 'expired', 'cancelled'
]);

export const permissionViewSchema = z.object({
  id: uuidSchema,
  callId: uuidSchema,
  digest: z.string().regex(/^[0-9a-f]{64}$/),
  command: commandSpecSchema,
  reason: z.string().min(1).max(4096),
  impact: z.string().min(1).max(4096),
  state: permissionStateSchema
}).strict();

export const permissionDecisionInputSchema = z.object({
  id: uuidSchema,
  digest: z.string().regex(/^[0-9a-f]{64}$/),
  decision: z.enum(['allow_once', 'deny'])
}).strict();

export type CommandSpec = z.infer<typeof commandSpecSchema>;
export type PermissionRequestState = z.infer<typeof permissionStateSchema>;
export type PermissionView = z.infer<typeof permissionViewSchema>;
export type PermissionDecisionInput = z.infer<typeof permissionDecisionInputSchema>;
