import { z } from 'zod';
import { r0DiagnosticReportSchema } from './r0-diagnostics.js';

export const R0_DIAGNOSTICS_CHANNEL = 'r0:diagnostics:run' as const;

const ipcErrorSchema = z.object({
  code: z.enum(['R0_IPC_INVALID_INPUT', 'R0_INTERNAL_ERROR']),
  message: z.string().min(1)
}).strict();

export const r0IpcResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), report: r0DiagnosticReportSchema }).strict(),
  z.object({ ok: z.literal(false), error: ipcErrorSchema }).strict()
]);

export type R0IpcResponse = z.infer<typeof r0IpcResponseSchema>;
