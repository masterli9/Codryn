import { z } from 'zod';
import { isoTimestampSchema, uuidSchema } from './ids.js';
import { jsonValueSchema } from './json-value.js';

export const eventSourceSchema = z.enum([
  'core',
  'database',
  'process',
  'git',
  'desktop'
]);

export const eventEnvelopeSchema = z.object({
  eventId: uuidSchema,
  eventType: z.string().min(1),
  eventVersion: z.literal(1),
  correlationId: uuidSchema,
  occurredAt: isoTimestampSchema,
  source: eventSourceSchema,
  sessionId: uuidSchema.optional(),
  payload: jsonValueSchema
}).strict();

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;
