export const r2VerificationSql = `CREATE TABLE verification_records (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(run_id),
  call_id TEXT NOT NULL REFERENCES tool_calls(call_id),
  project_id TEXT NOT NULL REFERENCES workspaces(id),
  revision INTEGER NOT NULL CHECK(revision >= 0),
  record_json TEXT NOT NULL CHECK(json_valid(record_json)),
  occurred_at TEXT NOT NULL,
  FOREIGN KEY(run_id, call_id) REFERENCES tool_calls(run_id, call_id)
) STRICT;

CREATE INDEX verification_records_run_idx ON verification_records(run_id, occurred_at, id);`;
