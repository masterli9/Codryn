import { z } from 'zod';
import { commandSpecSchema } from './r2-permission.js';
import { r4ReferencePathSchema } from './r4-context.js';
/** SHA-256 of bounded-project-inputs-v3. Older scope proofs need a fresh check. */
export const projectCheckScopeHash = '33822087cc97f3d16031cc0e2c9684c671f8f77e00ec236e68c84f1a232027e8';
export function hasProjectCheckScope(hashes: Readonly<Record<string,string>> | undefined): boolean {
  return hashes?.['@scope'] === projectCheckScopeHash;
}

export const projectCheckKindSchema = z.enum(['typecheck', 'test']);
export const projectCheckCandidateSchema = z.object({
  kind: projectCheckKindSchema,
  available: z.boolean(),
  command: commandSpecSchema.nullable(),
  reason: z.string().min(1).max(400)
}).strict().refine(candidate => candidate.available === (candidate.command !== null));

export const projectCheckCatalogSchema = z.object({
  level: z.enum(['supported', 'limited', 'unsupported']),
  framework: z.enum(['node', 'react', 'next', 'unknown']),
  typescriptVersion: z.string().min(1).max(40),
  configPaths: z.array(r4ReferencePathSchema).max(8),
  includedFiles: z.array(r4ReferencePathSchema).max(5000),
  checks: z.array(projectCheckCandidateSchema).max(2),
  reasons: z.array(z.string().min(1).max(400)).max(12),
  digest: z.string().regex(/^[a-f0-9]{64}$/u)
}).strict();
export const projectChecksDiscoveredSchema = projectCheckCatalogSchema.pick({ level: true, framework: true, typescriptVersion: true, reasons: true }).extend({
  checks: z.array(z.object({ kind: projectCheckKindSchema, available: z.boolean(), reason: z.string().min(1).max(400) }).strict()).max(2)
}).strict();

export type ProjectCheckKind = z.infer<typeof projectCheckKindSchema>;
export type ProjectCheckCandidate = z.infer<typeof projectCheckCandidateSchema>;
export type ProjectCheckCatalog = z.infer<typeof projectCheckCatalogSchema>;
