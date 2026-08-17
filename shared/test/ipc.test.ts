import { describe, expect, it } from 'vitest';
import { r0IpcResponseSchema, R0_DIAGNOSTICS_CHANNEL } from '../src/index.js';

const report = {
  schemaVersion: 1,
  requestId: '11111111-1111-4111-8111-111111111111',
  sessionId: '22222222-2222-4222-8222-222222222222',
  overallStatus: 'passed',
  startedAt: '2026-08-17T10:00:00.000Z',
  finishedAt: '2026-08-17T10:00:01.000Z',
  durationMs: 1000,
  checks: [{
    checkId: 'database-open',
    status: 'pass',
    code: 'R0_OK',
    message: 'Database opened successfully.',
    startedAt: '2026-08-17T10:00:00.000Z',
    finishedAt: '2026-08-17T10:00:00.100Z',
    durationMs: 100,
    evidence: { path: 'fixture.db' }
  }]
};

describe('renderer IPC contract', () => {
  it('uses the sole R0 diagnostics channel', () => {
    expect(R0_DIAGNOSTICS_CHANNEL).toBe('r0:diagnostics:run');
  });

  it('accepts a successful response containing a diagnostic report', () => {
    expect(r0IpcResponseSchema).toBeDefined();
    expect(r0IpcResponseSchema.parse({ ok: true, report })).toEqual({ ok: true, report });
  });

  it('accepts a strict invalid-input error response', () => {
    expect(r0IpcResponseSchema).toBeDefined();
    expect(r0IpcResponseSchema.parse({
      ok: false,
      error: { code: 'R0_IPC_INVALID_INPUT', message: 'Invalid diagnostic request.' }
    })).toEqual({
      ok: false,
      error: { code: 'R0_IPC_INVALID_INPUT', message: 'Invalid diagnostic request.' }
    });
  });

  it('rejects a response containing non-JSON evidence', () => {
    expect(r0IpcResponseSchema).toBeDefined();
    expect(r0IpcResponseSchema.safeParse({
      ok: true,
      report: { checks: [{ evidence: { pid: 1n } }] }
    }).success).toBe(false);
  });

  it('rejects unknown response fields', () => {
    expect(r0IpcResponseSchema).toBeDefined();
    expect(r0IpcResponseSchema.safeParse({ ok: true, report, unexpected: true }).success).toBe(false);
  });
});
