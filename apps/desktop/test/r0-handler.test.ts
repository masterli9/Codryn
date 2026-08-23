import { describe, expect, it, vi } from 'vitest';
import type { R0DiagnosticReport } from '@codryn/shared';
import { createR0Handler } from '../src/ipc/r0-handler.js';

const request = {
  requestId: '11111111-1111-4111-8111-111111111111',
  requestedAt: '2026-08-17T10:00:00.000Z'
} as const;

const report: R0DiagnosticReport = {
  schemaVersion: 1,
  requestId: request.requestId,
  sessionId: '22222222-2222-4222-8222-222222222222',
  overallStatus: 'passed',
  startedAt: '2026-08-17T10:00:00.000Z',
  finishedAt: '2026-08-17T10:00:01.000Z',
  durationMs: 1_000,
  checks: [{
    checkId: 'sqlite-open',
    status: 'pass',
    code: 'R0_OK',
    message: 'SQLite je dostupná.',
    startedAt: '2026-08-17T10:00:00.000Z',
    finishedAt: '2026-08-17T10:00:01.000Z',
    durationMs: 1_000,
    evidence: {}
  }]
};

describe('createR0Handler', () => {
  it('rejects an invalid request before invoking the service', async () => {
    const execute = vi.fn();

    const response = await createR0Handler({ execute })(undefined, { requestId: 'invalid' });

    expect(execute).not.toHaveBeenCalled();
    expect(response).toEqual({
      ok: false,
      error: {
        code: 'R0_IPC_INVALID_INPUT',
        message: 'Neplatný požadavek diagnostiky R0.'
      }
    });
  });

  it('returns a schema-validated success response', async () => {
    const execute = vi.fn().mockResolvedValue(report);

    const response = await createR0Handler({ execute })(undefined, request);

    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith(request);
    expect(response).toEqual({ ok: true, report });
  });

  it('maps an unknown exception to a fixed public error without its message', async () => {
    const execute = vi.fn().mockRejectedValue(new Error('renderer-must-never-see-this'));

    const response = await createR0Handler({ execute })(undefined, request);

    expect(response).toEqual({
      ok: false,
      error: {
        code: 'R0_INTERNAL_ERROR',
        message: 'Diagnostiku R0 se nepodařilo dokončit.'
      }
    });
    expect(JSON.stringify(response)).not.toContain('renderer-must-never-see-this');
  });
});
