import { describe, expect, it } from 'vitest';
import {
  r0DiagnosticReportSchema,
  r0DiagnosticRequestSchema
} from '../src/index.js';

const request = {
  requestId: '11111111-1111-4111-8111-111111111111',
  requestedAt: '2026-08-17T10:00:00.000Z'
};

const report = {
  schemaVersion: 1,
  requestId: request.requestId,
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
    evidence: { path: 'fixture.db', attempt: 1 }
  }]
};

describe('R0 diagnostic contracts', () => {
  it('accepts a valid diagnostic request', () => {
    expect(r0DiagnosticRequestSchema).toBeDefined();
    expect(r0DiagnosticRequestSchema.parse(request)).toEqual(request);
  });

  it('rejects unknown request fields', () => {
    expect(r0DiagnosticRequestSchema).toBeDefined();
    expect(() => r0DiagnosticRequestSchema.parse({ ...request, unexpected: true })).toThrow();
  });

  it('rejects an invalid request UUID', () => {
    expect(r0DiagnosticRequestSchema).toBeDefined();
    expect(() => r0DiagnosticRequestSchema.parse({ ...request, requestId: 'not-a-uuid' })).toThrow();
  });

  it('accepts the strict diagnostic report shape', () => {
    expect(r0DiagnosticReportSchema).toBeDefined();
    expect(r0DiagnosticReportSchema.parse(report)).toEqual(report);
  });

  it('rejects unknown report fields', () => {
    expect(r0DiagnosticReportSchema).toBeDefined();
    expect(() => r0DiagnosticReportSchema.parse({ ...report, unexpected: true })).toThrow();
  });
});
