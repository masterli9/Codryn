import { z } from 'zod';
import { uuidSchema } from './ids.js';
import { r3AcceptedSchema, r3ChatSchema, r3ErrorCodeSchema, r3MessageSchema, r3ModeSchema, r3SubmitInputSchema, r3TitleSchema } from './r3-chat.js';
import { r3ProjectSchema } from './r3-project.js';
import { r3SnapshotSchema, r3RunDetailSchema } from './r3-stream.js';
import { r3ProviderSettingsSchema } from './r3-settings.js';
import { r3ActivityViewSchema, r3ChangeViewSchema, r3OutputPageSchema, r3RevertInputSchema, r3RevertResultSchema } from './r3-changes.js';
import { permissionDecisionInputSchema } from './r2-permission.js';
import { r4RepoMapStatusSchema } from './r4-repo-map.js';
import { r4ReferenceSchema, r4ReferencePermitInputSchema, r4ReferenceSearchPageSchema, r4ReferenceSearchSchema } from './r4-context.js';
import { gitBranchSchema, gitCommitFilesSchema, gitDiffSchema, gitHistorySchema, gitMessageSchema, gitObjectIdSchema, gitPathSchema, gitSideSchema, gitSnapshotIdSchema, gitSnapshotSchema, gitSuggestionSchema } from './r4-git.js';
import { questionSchema, questionAnswerSchema } from './r4-question.js';
const request = { requestId: uuidSchema };
const chat = { ...request, chatId: uuidSchema };
const owned = { ...chat, projectId: uuidSchema };
const before = z.number().int().nonnegative().nullable();
const gitProject = { projectId: uuidSchema };
const gitView = { ...gitProject, snapshotId: gitSnapshotIdSchema };
const operation = <O extends string, S extends z.ZodRawShape>(name: O, shape: S) => z.object({ operation: z.literal(name), ...request, ...shape }).strict();
export const r3IpcRequestSchema = z.discriminatedUnion('operation', [
  operation('project.open', {}), operation('project.list', {}),
  operation('question.current', owned),
  operation('question.answer', { ...owned, runId: uuidSchema, questionId: uuidSchema, answer: questionAnswerSchema }),
  operation('question.decline', { ...owned, runId: uuidSchema, questionId: uuidSchema }),
  operation('git.status', gitProject),
  operation('git.diff', { ...gitView, path: gitPathSchema, side: gitSideSchema }),
  operation('git.history', { ...gitView, cursor: z.number().int().min(0).max(5000) }),
  operation('git.commitFiles', { ...gitView, hash: gitObjectIdSchema }),
  operation('git.stage', { ...gitView, path: gitPathSchema }), operation('git.unstage', { ...gitView, path: gitPathSchema }),
  operation('git.switchBranch', { ...gitView, branch: gitBranchSchema }),
  operation('git.suggestMessage', gitView), operation('git.commit', { ...gitView, message: gitMessageSchema }),
  operation('context.map.activate', { projectId: uuidSchema }), operation('context.map.status', { projectId: uuidSchema }),
  operation('context.map.init', { projectId: uuidSchema }), operation('context.map.cancel', { projectId: uuidSchema }),
  operation('context.reference.search', { ...owned, ...r4ReferenceSearchSchema.shape }),
  operation('context.reference.permit', { ...owned, ...r4ReferencePermitInputSchema.shape }),
  operation('chat.create', { projectId: uuidSchema, title: r3TitleSchema }), operation('chat.list', { projectId: uuidSchema, archived: z.boolean() }),
  operation('chat.rename', { ...owned, title: r3TitleSchema }), operation('chat.archive', owned), operation('chat.snapshot', chat), operation('chat.history', { ...chat, beforeSequence: before }),
  operation('run.active', {}), operation('run.submit', r3SubmitInputSchema.shape), operation('run.stop', { ...owned, jobId: uuidSchema }), operation('run.inspect', { ...chat, targetRequestId: uuidSchema }), operation('run.activity', { ...chat, targetRequestId: uuidSchema, beforeSequence: before }),
  operation('permission.answer', { ...owned, decision: permissionDecisionInputSchema }), operation('changes.diff', { ...chat, setId: uuidSchema }), operation('changes.revert', r3RevertInputSchema.shape), operation('command.output', { ...chat, callId: uuidSchema, afterSequence: before }),
  operation('settings.get', {}), operation('settings.saveKey', { key: z.string().trim().min(1).max(4096).refine(value => !value.includes('\0')) }), operation('settings.removeKey', {}), operation('settings.testKey', {}), operation('settings.select', { mode: r3ModeSchema, maxSteps: z.number().int().min(1).max(32) }), operation('settings.consent', { version: z.string().min(1).max(120) }),
  operation('stream.attach', { ...chat, afterCursor: z.number().int().nonnegative() }), operation('stream.detach', { subscriptionId: uuidSchema })
]).refine(value => new TextEncoder().encode(JSON.stringify(value)).length <= 128 * 1024);
const error = z.object({ ok: z.literal(false), error: z.object({ code: r3ErrorCodeSchema, message: z.string().min(1).max(4096) }).strict() }).strict();
const response = <T extends z.ZodType>(value: T) => z.union([z.object({ ok: z.literal(true), value }).strict(), error]);
const pageLimit = (value: object) => new TextEncoder().encode(JSON.stringify(value)).length <= 1024 * 1024;
export const r3ResponseSchemas = {
  'question.current': response(questionSchema.nullable()),
  'question.answer': response(z.object({status:z.enum(['accepted','duplicate','rejected'])}).strict()),
  'question.decline': response(z.object({status:z.enum(['accepted','duplicate','rejected'])}).strict()),
  'run.active': response(z.object({projectId:uuidSchema,chatId:uuidSchema,jobId:uuidSchema}).strict().nullable()),
  'project.open': response(z.union([z.object({ cancelled: z.literal(true) }).strict(), r3ProjectSchema])), 'project.list': response(z.array(r3ProjectSchema)),
  'git.status': response(gitSnapshotSchema), 'git.diff': response(gitDiffSchema), 'git.history': response(gitHistorySchema),
  'git.commitFiles': response(gitCommitFilesSchema), 'git.stage': response(gitSnapshotSchema), 'git.unstage': response(gitSnapshotSchema),
  'git.switchBranch': response(gitSnapshotSchema), 'git.suggestMessage': response(gitSuggestionSchema), 'git.commit': response(gitSnapshotSchema),
  'context.map.activate': response(r4RepoMapStatusSchema), 'context.map.status': response(r4RepoMapStatusSchema),
  'context.map.init': response(r4RepoMapStatusSchema), 'context.map.cancel': response(r4RepoMapStatusSchema),
  'context.reference.search': response(r4ReferenceSearchPageSchema),
  'context.reference.permit': response(r4ReferenceSchema),
  'chat.create': response(r3ChatSchema), 'chat.list': response(z.array(r3ChatSchema)), 'chat.rename': response(r3ChatSchema), 'chat.archive': response(z.object({ archived: z.literal(true) }).strict()), 'chat.snapshot': response(r3SnapshotSchema), 'chat.history': response(z.object({ messages: z.array(r3MessageSchema).max(100), beforeMessageSequence: before }).strict().refine(pageLimit)),
  'run.submit': response(r3AcceptedSchema), 'run.stop': response(z.object({ status: z.enum(['requested', 'already_terminal']) }).strict()), 'run.inspect': response(r3RunDetailSchema), 'run.activity': response(z.object({ items: z.array(r3ActivityViewSchema).max(100), beforeSequence: before }).strict().refine(pageLimit)),
  'permission.answer': response(z.object({ status: z.enum(['accepted', 'duplicate', 'rejected']) }).strict()), 'changes.diff': response(r3ChangeViewSchema), 'changes.revert': response(r3RevertResultSchema), 'command.output': response(r3OutputPageSchema),
  'settings.get': response(r3ProviderSettingsSchema), 'settings.saveKey': response(r3ProviderSettingsSchema), 'settings.removeKey': response(r3ProviderSettingsSchema), 'settings.testKey': response(r3ProviderSettingsSchema), 'settings.select': response(r3ProviderSettingsSchema), 'settings.consent': response(r3ProviderSettingsSchema),
  'stream.attach': response(z.object({ subscriptionId: uuidSchema, snapshot: r3SnapshotSchema }).strict()), 'stream.detach': response(z.object({ detached: z.literal(true) }).strict())
} as const;
export type R3IpcRequest = z.infer<typeof r3IpcRequestSchema>;
export type R3Operation = R3IpcRequest['operation'];
export type R3ResponseFor<O extends R3Operation> = z.infer<(typeof r3ResponseSchemas)[O]>;
export type R3IpcResponse = R3ResponseFor<R3Operation>;
