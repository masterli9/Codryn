import { z } from 'zod';
import { projectRelativePathSchema } from './r1-agent.js';

export const fileDiffSchema = z.object({
  path: projectRelativePathSchema,
  beforeHash: z.string().regex(/^[0-9a-f]{64}$/),
  afterHash: z.string().regex(/^[0-9a-f]{64}$/),
  status: z.enum(['changed', 'reverted', 'conflicted']),
  lines: z.array(z.object({
    kind: z.enum(['context', 'removed', 'added']),
    text: z.string()
  }).strict()),
  truncated: z.boolean()
}).strict();

export type FileDiff = z.infer<typeof fileDiffSchema>;
