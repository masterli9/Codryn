import { z } from 'zod';
import { uuidSchema } from './ids.js';
import { r3ProjectSchema } from './r3-project.js';
import { r3ChatSchema, r3MessageSchema, r3RunViewSchema } from './r3-chat.js';
import { permissionViewSchema } from './r2-permission.js';
import { r3ActivityViewSchema, r3ChangeSummarySchema, r3CommandViewSchema } from './r3-changes.js';
import { r3VerificationViewSchema } from './r3-verification.js';
const pageCursor = z.number().int().nonnegative().nullable();
const detail = { run: r3RunViewSchema, cursor: z.number().int().nonnegative(), changes: r3ChangeSummarySchema.nullable(), commands: z.array(r3CommandViewSchema).max(20), activity: z.array(r3ActivityViewSchema).max(100), verification: r3VerificationViewSchema.nullable(), beforeActivitySequence: pageCursor };
const byteLimit = (value: object) => new TextEncoder().encode(JSON.stringify(value)).length <= 1024 * 1024;
export const r3SnapshotSchema = z.object({ ...detail, run: r3RunViewSchema.nullable(), project: r3ProjectSchema, chat: r3ChatSchema, messages: z.array(r3MessageSchema).max(100), beforeMessageSequence: pageCursor, permissions: z.array(permissionViewSchema) }).strict().refine(byteLimit);
export const r3RunDetailSchema = z.object({ ...detail, chatId: uuidSchema }).strict().refine(byteLimit);
export const r3UpdateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('refresh'), chatId: uuidSchema, cursor: z.number().int().nonnegative() }).strict(),
  z.object({ kind: z.literal('message'), chatId: uuidSchema, cursor: z.number().int().nonnegative(), message: r3MessageSchema }).strict(),
  z.object({ kind: z.literal('command_output'), chatId: uuidSchema, cursor: z.number().int().nonnegative(), callId: uuidSchema, stream: z.enum(['stdout', 'stderr']), text: z.string().refine(value => new TextEncoder().encode(value).length <= 4096), truncated: z.boolean() }).strict(),
  z.object({ kind: z.literal('resync_required'), chatId: uuidSchema, cursor: z.number().int().nonnegative() }).strict()
]);
export type R3Snapshot = z.infer<typeof r3SnapshotSchema>;
export type R3RunDetail = z.infer<typeof r3RunDetailSchema>;
export type R3Update = z.infer<typeof r3UpdateSchema>;
