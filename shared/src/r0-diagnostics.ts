import { z } from 'zod';
import { isoTimestampSchema, uuidSchema } from './ids.js';
import { jsonValueSchema } from './json-value.js';

export const r0CheckStatusSchema = z.enum(['pass', 'fail', 'skipped']);
export const r0ReportStatusSchema = z.enum(['passed', 'failed']);
export const r0CheckCodeSchema = z.enum([
  'R0_OK',
  'R0_SKIPPED_DEPENDENCY',
  'R0_DB_OPEN_FAILED',
  'R0_DB_MIGRATION_FAILED',
  'R0_DB_INTEGRITY_FAILED',
  'R0_DB_BACKUP_FAILED',
  'R0_PROCESS_SPAWN_FAILED',
  'R0_PROCESS_EXIT_NONZERO',
  'R0_PROCESS_TIMED_OUT',
  'R0_PROCESS_TREE_REMAINS',
  'R0_PROCESS_OUTPUT_LIMIT',
  'R0_GIT_NOT_AVAILABLE',
  'R0_GIT_FIXTURE_FAILED',
  'R0_GIT_CREDENTIAL_UNSAFE',
  'R0_INTERNAL_ERROR'
]);

export const r0DiagnosticRequestSchema = z.object({
  requestId: uuidSchema,
  requestedAt: isoTimestampSchema
}).strict();

export const r0CheckResultSchema = z.object({
  checkId: z.string().min(1),
  status: r0CheckStatusSchema,
  code: r0CheckCodeSchema,
  message: z.string().min(1),
  startedAt: isoTimestampSchema,
  finishedAt: isoTimestampSchema,
  durationMs: z.number().int().nonnegative(),
  evidence: z.record(z.string(), jsonValueSchema)
}).strict();

export const r0DiagnosticReportSchema = z.object({
  schemaVersion: z.literal(1),
  requestId: uuidSchema,
  sessionId: uuidSchema,
  overallStatus: r0ReportStatusSchema,
  startedAt: isoTimestampSchema,
  finishedAt: isoTimestampSchema,
  durationMs: z.number().int().nonnegative(),
  checks: z.array(r0CheckResultSchema).min(1)
}).strict();

export type R0DiagnosticRequest = z.infer<typeof r0DiagnosticRequestSchema>;
export type R0CheckResult = z.infer<typeof r0CheckResultSchema>;
export type R0DiagnosticReport = z.infer<typeof r0DiagnosticReportSchema>;
