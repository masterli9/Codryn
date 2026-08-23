import { describe, expect, it } from 'vitest';
import { eventEnvelopeSchema } from '../src/index.js';

const event = {
  eventId: '11111111-1111-4111-8111-111111111111',
  eventType: 'r0.diagnostic.started',
  eventVersion: 1,
  correlationId: '22222222-2222-4222-8222-222222222222',
  occurredAt: '2026-08-17T10:00:00.000Z',
  source: 'core',
  sessionId: '33333333-3333-4333-8333-333333333333',
  payload: { trigger: 'test' }
};

describe('event envelope contract', () => {
  it('accepts a valid v1 event envelope', () => {
    expect(eventEnvelopeSchema).toBeDefined();
    expect(eventEnvelopeSchema.parse(event)).toEqual(event);
  });

  it('rejects unknown envelope fields', () => {
    expect(eventEnvelopeSchema).toBeDefined();
    expect(() => eventEnvelopeSchema.parse({ ...event, unexpected: true })).toThrow();
  });

  it('rejects invalid event UUIDs', () => {
    expect(eventEnvelopeSchema).toBeDefined();
    expect(() => eventEnvelopeSchema.parse({ ...event, eventId: 'not-a-uuid' })).toThrow();
  });
});
