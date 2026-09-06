export const r2PermissionSql = `
PRAGMA legacy_alter_table = ON;
ALTER TABLE tool_calls RENAME TO tool_calls_r2_old;

CREATE TABLE tool_calls (
  call_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  project_id TEXT REFERENCES workspaces(id),
  parent_call_id TEXT,
  tool_id TEXT NOT NULL CHECK (length(tool_id) > 0),
  tool_version INTEGER NOT NULL CHECK (tool_version > 0),
  state TEXT NOT NULL CHECK (state IN (
    'received', 'schema_validated', 'permission_decided', 'queued', 'running',
    'succeeded', 'failed', 'denied', 'timed_out', 'cancelled'
  )),
  arguments_json TEXT NOT NULL CHECK (json_valid(arguments_json)),
  permission_result TEXT CHECK (
    permission_result IS NULL OR permission_result IN ('allowed_by_rule', 'allowed_once', 'denied')
  ),
  permission_rule_id TEXT CHECK (permission_rule_id IS NULL OR length(permission_rule_id) > 0),
  permission_reason TEXT CHECK (permission_reason IS NULL OR length(permission_reason) > 0),
  safe_result_json TEXT CHECK (safe_result_json IS NULL OR json_valid(safe_result_json)),
  error_code TEXT CHECK (error_code IS NULL OR length(error_code) > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (parent_call_id IS NULL OR parent_call_id <> call_id),
  FOREIGN KEY (run_id) REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  FOREIGN KEY (run_id, parent_call_id)
    REFERENCES tool_calls(run_id, call_id) ON DELETE CASCADE,
  UNIQUE (run_id, call_id)
) STRICT;

INSERT INTO tool_calls (
  call_id, run_id, project_id, parent_call_id, tool_id, tool_version, state,
  arguments_json, permission_result, permission_rule_id, permission_reason,
  safe_result_json, error_code, created_at, updated_at
)
SELECT
  call_id, run_id, NULL, parent_call_id, tool_id, tool_version, state,
  arguments_json, permission_result, permission_rule_id, permission_reason,
  safe_result_json, error_code, created_at, updated_at
FROM tool_calls_r2_old;

DROP TABLE tool_calls_r2_old;
PRAGMA legacy_alter_table = OFF;

CREATE INDEX tool_calls_run_created_idx ON tool_calls(run_id, created_at, call_id);

CREATE TABLE permission_requests (
  id TEXT PRIMARY KEY,
  call_id TEXT NOT NULL UNIQUE REFERENCES tool_calls(call_id),
  digest TEXT NOT NULL CHECK (length(digest) = 64),
  safe_input_json TEXT NOT NULL CHECK (json_valid(safe_input_json)),
  state TEXT NOT NULL CHECK (state IN ('pending', 'allowed_once', 'denied', 'expired', 'cancelled')),
  claimed INTEGER NOT NULL DEFAULT 0 CHECK (claimed IN (0, 1)),
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX permission_requests_state_idx ON permission_requests(state);
`;
