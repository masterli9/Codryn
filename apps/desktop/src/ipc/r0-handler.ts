import type { RunR0Diagnostics } from '@codryn/core';
import {
  r0DiagnosticRequestSchema,
  r0IpcResponseSchema,
  type R0IpcResponse
} from '@codryn/shared';

export function createR0Handler(service: Pick<RunR0Diagnostics, 'execute'>) {
  return async (_event: unknown, input: unknown): Promise<R0IpcResponse> => {
    const parsed = r0DiagnosticRequestSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: 'R0_IPC_INVALID_INPUT',
          message: 'Neplatný požadavek diagnostiky R0.'
        }
      };
    }

    try {
      return r0IpcResponseSchema.parse({
        ok: true,
        report: await service.execute(parsed.data)
      });
    } catch {
      return {
        ok: false,
        error: {
          code: 'R0_INTERNAL_ERROR',
          message: 'Diagnostiku R0 se nepodařilo dokončit.'
        }
      };
    }
  };
}
