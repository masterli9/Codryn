import { z } from 'zod';
import { r4ReferencePathSchema } from './r4-context.js';

const coordinate = z.number().int().min(1).max(1024 * 1024);
const base = { path: r4ReferencePathSchema, maxResults: z.number().int().min(1).max(50).default(20) };
const select = { ...base, symbol: z.string().min(1).max(160).regex(/^[$_\p{ID_Start}][$\p{ID_Continue}]*$/u).optional(),
  line: coordinate.optional(), column: coordinate.optional() };
export const typescriptQueryInputSchema = z.discriminatedUnion('kind', [
  z.object({ ...select, kind: z.literal('definition') }).strict(),
  z.object({ ...select, kind: z.literal('references') }).strict(),
  z.object({ ...select, kind: z.literal('type') }).strict(),
  z.object({ ...select, kind: z.literal('signature') }).strict(),
  z.object({ ...base, kind: z.literal('exports') }).strict(),
  z.object({ ...base, kind: z.literal('diagnostics') }).strict(),
  z.object({ ...base, kind: z.literal('imports') }).strict()
]).refine(input => !('symbol' in input || 'line' in input || 'column' in input) ||
  ('symbol' in input && input.symbol !== undefined ? input.line === undefined && input.column === undefined : input.line !== undefined && input.column !== undefined))
  .refine(input => input.kind === 'exports' || input.kind === 'diagnostics' || input.kind === 'imports' ||
    ('symbol' in input && input.symbol !== undefined) || ('line' in input && 'column' in input && input.line !== undefined && input.column !== undefined));

const shortText = z.string().min(1).max(400);
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
export const typescriptQueryItemSchema = z.object({
  path: r4ReferencePathSchema, line: coordinate, column: coordinate, endLine: coordinate, endColumn: coordinate,
  name: shortText.optional(), symbolKind: shortText.optional(), display: shortText.optional(),
  code: z.number().int().nonnegative().optional(), category: z.enum(['error', 'warning', 'suggestion', 'message']).optional(),
  relation: z.enum(['import', 're-export']).optional(), target: r4ReferencePathSchema.optional(), declaration: z.boolean().optional()
}).strict().refine(item => item.endLine > item.line || (item.endLine === item.line && item.endColumn >= item.column));

export const maxTypeScriptQueryOutputBytes = 32 * 1024;
export const typescriptQueryOutputSchema = z.object({
  status: z.enum(['ok', 'limited', 'unsupported', 'stale']), mode: z.enum(['configured', 'fallback']),
  revision: z.number().int().nonnegative(), targetHash: hash.nullable(), policyRevision: hash.nullable(),
  items: z.array(typescriptQueryItemSchema).max(50), truncated: z.boolean(),
  reason: z.enum(['invalid_config', 'target_not_in_config', 'target_unavailable', 'policy_invalid', 'dependency_unavailable', 'workspace_incomplete',
    'workspace_changed', 'budget_exceeded', 'worker_failed', 'worker_timeout', 'cancelled', 'unsupported_extension', 'position_invalid', 'ambiguous_symbol']).nullable()
}).strict().refine(output => (output.status === 'ok' ? output.reason === null : output.reason !== null) &&
  ((output.status !== 'stale' && output.status !== 'unsupported') || output.items.length === 0))
  .refine(output => new TextEncoder().encode(JSON.stringify(output)).length <= maxTypeScriptQueryOutputBytes);

export type TypeScriptQueryInput = z.infer<typeof typescriptQueryInputSchema>;
export type TypeScriptQueryOutput = z.infer<typeof typescriptQueryOutputSchema>;
export type TypeScriptQueryItem = z.infer<typeof typescriptQueryItemSchema>;
