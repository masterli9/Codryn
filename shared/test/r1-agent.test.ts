import { describe, expect, it } from 'vitest';
import {
  runAgentRequestSchema,
  runAgentResultSchema
} from '../src/index.js';

const requestId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';

const request = {
  requestId,
  projectRoot: 'fixture-project',
  task: 'Najdi definici souhrnu.',
  contextReferences: ['README.md'],
  maxSteps: 8
};

describe('R1 agent contracts', () => {
  it('accepts a strict read-only request with relative context references', () => {
    expect(runAgentRequestSchema.parse(request)).toEqual(request);
  });

  it('rejects unknown request fields and absolute context references', () => {
    expect(() => runAgentRequestSchema.parse({ ...request, unexpected: true })).toThrow();
    expect(() => runAgentRequestSchema.parse({ ...request, contextReferences: ['/README.md'] })).toThrow();
    expect(() => runAgentRequestSchema.parse({ ...request, contextReferences: ['C:\\README.md'] })).toThrow();
  });

  it.each([0, 33, 1.5])('rejects a maxSteps value outside the 1..32 integer range: %s', (maxSteps) => {
    expect(() => runAgentRequestSchema.parse({ ...request, maxSteps })).toThrow();
  });

  it('accepts a completed result only with explicit R1 read-only verification metadata', () => {
    expect(runAgentResultSchema.parse({
      schemaVersion: 1,
      runId,
      status: 'completed',
      stepCount: 3,
      finalText: 'Hotovo.',
      verification: { status: 'not_applicable', reason: 'R1_READ_ONLY_RUN' }
    })).toMatchObject({ status: 'completed', finalText: 'Hotovo.' });
  });

  it('rejects a completed result without its final text', () => {
    expect(() => runAgentResultSchema.parse({
      schemaVersion: 1,
      runId,
      status: 'completed',
      stepCount: 3,
      verification: { status: 'not_applicable', reason: 'R1_READ_ONLY_RUN' }
    })).toThrow();
  });

  it('rejects a completed result with altered verification metadata or unknown fields', () => {
    const completed = {
      schemaVersion: 1,
      runId,
      status: 'completed',
      stepCount: 3,
      finalText: 'Hotovo.',
      verification: { status: 'not_applicable', reason: 'R1_READ_ONLY_RUN' }
    } as const;

    expect(() => runAgentResultSchema.parse({
      ...completed,
      verification: { status: 'verified', reason: 'R1_READ_ONLY_RUN' }
    })).toThrow();
    expect(() => runAgentResultSchema.parse({ ...completed, unexpected: true })).toThrow();
  });
});
