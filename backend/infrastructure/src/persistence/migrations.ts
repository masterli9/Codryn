import { createHash } from 'node:crypto';

export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
  readonly checksum: string;
}

const schemaMigrationsSql = `CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
) STRICT;`;

const r0DiagnosticDataSql = `CREATE TABLE diagnostic_sessions (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('created')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  event_version INTEGER NOT NULL CHECK (event_version = 1),
  correlation_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('core', 'database', 'process', 'git', 'desktop')),
  session_id TEXT,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  FOREIGN KEY (session_id) REFERENCES diagnostic_sessions(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX events_session_sequence_idx ON events(session_id, sequence);`;

function sha256(sql: string): string {
  return createHash('sha256').update(sql, 'utf8').digest('hex');
}

export const migrations: readonly Migration[] = [
  {
    version: 0,
    name: 'schema_migrations',
    sql: schemaMigrationsSql,
    checksum: sha256(schemaMigrationsSql)
  },
  {
    version: 1,
    name: 'r0_diagnostic_data',
    sql: r0DiagnosticDataSql,
    checksum: sha256(r0DiagnosticDataSql)
  }
];
