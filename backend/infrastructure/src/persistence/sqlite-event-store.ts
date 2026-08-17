import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import { R0DiagnosticFailure } from '@codryn/core';
import type { EventStore } from '@codryn/core';
import {
  eventEnvelopeSchema,
  uuidSchema,
  type EventEnvelope,
  type JsonValue,
  type Uuid
} from '@codryn/shared';

function isPlainRecord(value: object): boolean {
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requirePersistableJson(value: unknown, seen = new Set<object>()): asserts value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('EVENT_PAYLOAD_NOT_JSON');
    return;
  }
  if (typeof value !== 'object' || seen.has(value)) throw new TypeError('EVENT_PAYLOAD_NOT_JSON');

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      for (const item of value) requirePersistableJson(item, seen);
      return;
    }
    if (!isPlainRecord(value)) throw new TypeError('EVENT_PAYLOAD_NOT_JSON');
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !('value' in descriptor)) throw new TypeError('EVENT_PAYLOAD_NOT_JSON');
      requirePersistableJson(descriptor.value, seen);
    }
  } finally {
    seen.delete(value);
  }
}

export function validateEvent(event: unknown): EventEnvelope {
  if (typeof event !== 'object' || event === null) throw new TypeError('EVENT_ENVELOPE_INVALID');
  const payload = Reflect.get(event, 'payload');
  requirePersistableJson(payload);
  if (Object.prototype.hasOwnProperty.call(event, 'sessionId') && Reflect.get(event, 'sessionId') === undefined) {
    throw new TypeError('EVENT_ENVELOPE_INVALID');
  }
  return eventEnvelopeSchema.parse(event);
}

export function insertEvent(database: DatabaseSync, event: EventEnvelope): void {
  database.prepare(`INSERT INTO events (
    event_id, event_type, event_version, correlation_id, occurred_at, source, session_id, payload_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    event.eventId,
    event.eventType,
    event.eventVersion,
    event.correlationId,
    event.occurredAt,
    event.source,
    event.sessionId ?? null,
    JSON.stringify(event.payload)
  );
}

function requireString(value: SQLOutputValue | undefined): string {
  if (typeof value !== 'string') throw new TypeError('EVENT_ROW_INVALID');
  return value;
}

function eventFromRow(row: Record<string, SQLOutputValue>): EventEnvelope {
  const payloadJson = requireString(row.payload_json);
  const payload: unknown = JSON.parse(payloadJson);
  requirePersistableJson(payload);
  const sessionId = row.session_id;
  if (sessionId !== null && typeof sessionId !== 'string') throw new TypeError('EVENT_ROW_INVALID');

  return validateEvent({
    eventId: requireString(row.event_id),
    eventType: requireString(row.event_type),
    eventVersion: row.event_version,
    correlationId: requireString(row.correlation_id),
    occurredAt: requireString(row.occurred_at),
    source: requireString(row.source),
    ...(typeof sessionId === 'string' ? { sessionId } : {}),
    payload
  });
}

export class SqliteEventStore implements EventStore {
  constructor(private readonly database: DatabaseSync) {}

  async append(input: EventEnvelope): Promise<void> {
    const event = validateEvent(input);
    try {
      insertEvent(this.database, event);
    } catch {
      throw new R0DiagnosticFailure('R0_DB_OPEN_FAILED', 'EVENT_WRITE_FAILED');
    }
  }

  async findBySessionId(sessionId: Uuid): Promise<readonly EventEnvelope[]> {
    const validSessionId = uuidSchema.parse(sessionId);
    try {
      return this.database.prepare(`SELECT
        event_id, event_type, event_version, correlation_id, occurred_at, source, session_id, payload_json
      FROM events
      WHERE session_id = ?
      ORDER BY sequence ASC`).all(validSessionId).map(eventFromRow);
    } catch (error) {
      if (error instanceof R0DiagnosticFailure) throw error;
      throw new R0DiagnosticFailure('R0_DB_OPEN_FAILED', 'EVENT_READ_FAILED');
    }
  }
}
