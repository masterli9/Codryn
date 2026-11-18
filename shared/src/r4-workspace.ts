import { z } from 'zod';

export const workspaceChangeSourceSchema = z.enum(['unknown', 'opened', 'external', 'git_external', 'patch', 'revert', 'git']);
export type WorkspaceChangeSource = z.infer<typeof workspaceChangeSourceSchema>;
