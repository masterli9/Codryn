import { z } from 'zod';
import { r4ReferencePathSchema } from './r4-context.js';

export const gitSnapshotIdSchema = z.string().regex(/^[a-f0-9]{64}$/u);
export const gitObjectIdSchema = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u);
export const gitBranchSchema = z.string().min(1).max(240).regex(/^[A-Za-z0-9_][A-Za-z0-9_./-]*$/u)
  .refine(name => !name.includes('..') && name.split('/').every(part => part && !part.startsWith('.') && !part.endsWith('.lock') && !part.endsWith('.')));
export const gitMessageSchema = z.string().trim().min(1).max(4096).refine(message => !message.includes('\0'));
export const gitPathSchema = r4ReferencePathSchema;
export const gitSideSchema = z.enum(['staged', 'unstaged', 'untracked', 'conflict']);
const label = z.string().min(1).max(4096);
export const gitItemSchema = z.object({
  path: gitPathSchema, originalPath: gitPathSchema.optional(), side: gitSideSchema, status: z.string().length(1),
  actionable: z.boolean()
}).strict();
export const gitSnapshotSchema = z.object({
  mode: z.enum(['git', 'non-git', 'unavailable']), snapshotId: gitSnapshotIdSchema.nullable(), projectPrefix: z.string().max(1024),
  head: gitObjectIdSchema.nullable(), branch: label.nullable(), upstream: label.nullable(), ahead: z.number().int().nonnegative().nullable(), behind: z.number().int().nonnegative().nullable(),
  branches: z.array(gitBranchSchema).max(100), items: z.array(gitItemSchema).max(250), limited: z.boolean(), reason: label.nullable(),
  canCommit: z.boolean(), canSwitch: z.boolean()
}).strict();
export const gitDiffSchema = z.object({ snapshotId: gitSnapshotIdSchema, text: z.string().max(32768), truncated: z.boolean() }).strict();
export const gitHistorySchema = z.object({
  snapshotId: gitSnapshotIdSchema, next: z.number().int().nonnegative().max(5000).nullable(),
  commits: z.array(z.object({ hash: gitObjectIdSchema, title: z.string().max(1024), author: z.string().max(256),
    at: z.string().max(64), parents: z.array(gitObjectIdSchema).max(32), refs: z.string().max(1024) }).strict()).max(20)
}).strict();
export const gitCommitFilesSchema = z.object({ snapshotId: gitSnapshotIdSchema, paths: z.array(gitPathSchema).max(250), truncated: z.boolean() }).strict();
export const gitSuggestionSchema = z.object({ sourceSnapshotId: gitSnapshotIdSchema, message: gitMessageSchema }).strict();
export type GitSnapshot = z.infer<typeof gitSnapshotSchema>;
export type GitItem = z.infer<typeof gitItemSchema>;
export type GitSide = z.infer<typeof gitSideSchema>;
