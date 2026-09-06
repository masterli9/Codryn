export const r2AgentDetailsSql = `CREATE TABLE agent_run_details (
  run_id TEXT PRIMARY KEY REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  failure_code TEXT CHECK(failure_code IS NULL OR length(failure_code) > 0),
  result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json))
) STRICT;`;
