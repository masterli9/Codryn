import { z } from 'zod';
import { isoTimestampSchema } from './ids.js';
import { verificationRecordSchema } from './r2-verification.js';
export const r3VerificationViewSchema = z.object({ status: z.enum(['verified', 'partially_verified', 'unverified', 'stale']), reason: z.string().min(1).max(4096), freshness: z.enum(['current', 'unavailable']), observedAt: isoTimestampSchema.nullable(), checks: z.array(z.object({ record: verificationRecordSchema, coveredPaths: z.array(z.string().max(4096)), durationMs: z.number().nonnegative().nullable() }).strict()), uncoveredPaths: z.array(z.string().max(4096)), missingChecks: z.array(z.string().max(4096)) }).strict();
export type R3VerificationView = z.infer<typeof r3VerificationViewSchema>;
