import { z } from 'zod';

export const r4ReferencePathSchema = z.string().min(1).max(1024).refine(path =>
  !/[\\:]/u.test(path) && !Array.from(path).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) &&
  path.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..' && !/[. ]$/u.test(segment))
);
const sha256 = z.string().regex(/^[0-9a-f]{64}$/u);
export const r4ReferenceSchema = z.object({
  path: r4ReferencePathSchema,
  kind: z.enum(['file', 'directory']),
  contentHash: sha256,
  policyRevision: sha256
}).strict();

export const maxR4References = 8;
export const r4ReferencesSchema = z.array(r4ReferenceSchema).max(maxR4References)
  .refine(references => new Set(references.map(reference => reference.path)).size === references.length);

const maxSearchEntries = 5000;
const maxSearchPageSize = 50;
export const r4ReferenceSearchSchema = z.object({
  query: z.string().max(200).refine(query => !query.includes('\0')),
  offset: z.number().int().min(0).max(maxSearchEntries).optional(),
  limit: z.number().int().min(1).max(maxSearchPageSize).optional()
}).strict();
export const r4ReferenceSearchPageSchema = z.object({
  items: z.array(r4ReferenceSchema).max(maxSearchPageSize),
  nextOffset: z.number().int().min(1).max(maxSearchEntries).nullable(),
  limited: z.boolean(),
  reason: z.string().min(1).max(4096).optional()
}).strict();
export const r4ReferencePermitInputSchema = z.object({
  path: r4ReferencePathSchema,
  kind: z.enum(['ignored', 'sensitive'])
}).strict();
export type R4ReferencePermitInput = z.infer<typeof r4ReferencePermitInputSchema>;

export type R4Reference = z.infer<typeof r4ReferenceSchema>;
export type R4ReferenceSearch = z.infer<typeof r4ReferenceSearchSchema>;
export type R4ReferenceSearchPage = z.infer<typeof r4ReferenceSearchPageSchema>;

export const r4ContextSourceSchema = z.enum(['user_text', 'chat_history', 'project_rules', 'project_reference', 'repo_map', 'loaded_excerpt']);
const auditReason = z.string().regex(/^[a-z][a-z0-9_]{0,47}$/u);
const auditBytes = z.number().int().nonnegative().max(1024 * 1024);
const auditLine = z.number().int().min(1).max(1024 * 1024);
export const r4ContextAuditSourceSchema = z.object({
  source: r4ContextSourceSchema,
  path: r4ReferencePathSchema.optional(),
  sourceId: z.uuid().optional(),
  hash: sha256.optional(),
  bytes: auditBytes,
  startLine: auditLine.optional(),
  endLine: auditLine.optional(),
  status: z.enum(['used', 'omitted', 'truncated']),
  reason: auditReason.optional()
}).strict().refine(item => (item.startLine === undefined && item.endLine === undefined)
  || (item.startLine !== undefined && item.endLine !== undefined && item.startLine <= item.endLine))
  .refine(item => item.status !== 'omitted' || (item.bytes === 0 && item.startLine === undefined && item.endLine === undefined))
  .refine(item => item.status === 'used' || item.reason !== undefined);

export const r4ContextAuditSchema = z.object({
  schemaVersion: z.literal(1),
  sources: z.array(r4ContextAuditSourceSchema).max(128),
  totalBytes: auditBytes
}).strict().refine(audit => audit.totalBytes === audit.sources.reduce((sum, item) => sum + item.bytes, 0))
  .refine(audit => new TextEncoder().encode(JSON.stringify(audit)).length <= 64 * 1024);

export const r4ContextAuditSummarySchema = z.object({
  totalBytes: auditBytes,
  sources: z.array(z.object({
    source: r4ContextSourceSchema,
    used: z.number().int().nonnegative().max(128),
    omitted: z.number().int().nonnegative().max(128),
    truncated: z.number().int().nonnegative().max(128),
    reasons: z.array(auditReason).max(16)
  }).strict()).max(6)
}).strict();

export type R4ContextAuditSource = z.infer<typeof r4ContextAuditSourceSchema>;
export type R4ContextAuditSummary = z.infer<typeof r4ContextAuditSummarySchema>;
