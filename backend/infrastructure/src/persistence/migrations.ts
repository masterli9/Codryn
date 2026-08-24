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

const genericAgentSessionsSql = `CREATE TABLE sessions_new (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('diagnostic', 'agent')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

INSERT INTO sessions_new (id, kind, created_at, updated_at)
SELECT id, 'diagnostic', created_at, updated_at FROM diagnostic_sessions;

CREATE TABLE diagnostic_sessions_new (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('created')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (id) REFERENCES sessions_new(id) ON DELETE CASCADE
) STRICT;

INSERT INTO diagnostic_sessions_new (id, status, created_at, updated_at)
SELECT id, status, created_at, updated_at FROM diagnostic_sessions;

CREATE TABLE events_new (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  event_version INTEGER NOT NULL CHECK (event_version = 1),
  correlation_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('core', 'database', 'process', 'git', 'desktop')),
  session_id TEXT,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  FOREIGN KEY (session_id) REFERENCES sessions_new(id) ON DELETE CASCADE
) STRICT;

INSERT INTO events_new (
  sequence, event_id, event_type, event_version, correlation_id,
  occurred_at, source, session_id, payload_json
)
SELECT
  sequence, event_id, event_type, event_version, correlation_id,
  occurred_at, source, session_id, payload_json
FROM events;

DROP TABLE events;
DROP TABLE diagnostic_sessions;
ALTER TABLE sessions_new RENAME TO sessions;
ALTER TABLE diagnostic_sessions_new RENAME TO diagnostic_sessions;
ALTER TABLE events_new RENAME TO events;

CREATE INDEX events_session_sequence_idx ON events(session_id, sequence);

CREATE TABLE agent_runs (
  run_id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN (
    'idle', 'preparing_context', 'waiting_for_model', 'waiting_for_user_input',
    'waiting_for_approval', 'executing_tool', 'verifying', 'completed',
    'cancelled', 'failed'
  )),
  task TEXT NOT NULL CHECK (length(task) > 0),
  max_steps INTEGER NOT NULL CHECK (max_steps BETWEEN 1 AND 32),
  step_count INTEGER NOT NULL CHECK (step_count >= 0),
  adapter_id TEXT NOT NULL CHECK (length(adapter_id) > 0),
  model_id TEXT NOT NULL CHECK (length(model_id) > 0),
  failure_code TEXT CHECK (failure_code IS NULL OR failure_code IN (
    'R1_INPUT_INVALID', 'R1_CONTEXT_REFERENCE_INVALID', 'R1_CONTEXT_LIMIT_EXCEEDED',
    'R1_MODEL_CAPABILITY_MISSING', 'R1_MODEL_ADAPTER_FAILED',
    'R1_MODEL_RESPONSE_UNSUPPORTED', 'R1_FAKE_SCENARIO_MISMATCH', 'R1_TOOL_UNKNOWN',
    'R1_TOOL_INPUT_INVALID', 'R1_TOOL_PERMISSION_DENIED', 'R1_TOOL_OUTPUT_INVALID',
    'R1_TOOL_EXECUTION_FAILED', 'R1_STEP_LIMIT_EXCEEDED', 'R1_CANCELLED',
    'R1_PERSISTENCE_FAILED', 'R1_INTERNAL_ERROR'
  )),
  FOREIGN KEY (run_id) REFERENCES sessions(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE tool_calls (
  call_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  parent_call_id TEXT,
  tool_id TEXT NOT NULL CHECK (length(tool_id) > 0),
  tool_version INTEGER NOT NULL CHECK (tool_version > 0),
  state TEXT NOT NULL CHECK (state IN (
    'received', 'schema_validated', 'permission_decided', 'queued', 'running',
    'succeeded', 'failed', 'denied', 'timed_out', 'cancelled'
  )),
  arguments_json TEXT NOT NULL CHECK (json_valid(arguments_json)),
  permission_result TEXT CHECK (
    permission_result IS NULL OR permission_result IN ('allowed_by_rule', 'denied')
  ),
  safe_result_json TEXT CHECK (safe_result_json IS NULL OR json_valid(safe_result_json)),
  error_code TEXT CHECK (error_code IS NULL OR length(error_code) > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (parent_call_id IS NULL OR parent_call_id <> call_id),
  UNIQUE (run_id, call_id),
  FOREIGN KEY (run_id) REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  FOREIGN KEY (run_id, parent_call_id)
    REFERENCES tool_calls(run_id, call_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX tool_calls_run_created_idx ON tool_calls(run_id, created_at, call_id);`;

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
  },
  {
    version: 2,
    name: 'generic_agent_sessions',
    sql: genericAgentSessionsSql,
    checksum: sha256(genericAgentSessionsSql)
  }
];
