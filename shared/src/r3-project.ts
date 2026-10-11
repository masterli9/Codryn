import { z } from 'zod';
import { uuidSchema } from './ids.js';
export const r3ProjectSchema = z.object({ id: uuidSchema, displayName: z.string().min(1).max(4096), available: z.boolean(), mode: z.enum(['git', 'non-git', 'git-unavailable']), limitations: z.array(z.object({ code: z.enum(['detached_head', 'git_conflict', 'git_unavailable', 'project_unavailable', 'runtime_unavailable']), message: z.string().min(1).max(4096) }).strict()) }).strict();
export type R3Project = z.infer<typeof r3ProjectSchema>;
