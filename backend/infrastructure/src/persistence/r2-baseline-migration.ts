export const r2BaselineSql = `CREATE TABLE project_baselines (
  set_id TEXT PRIMARY KEY REFERENCES change_sets(id),
  baseline_json TEXT NOT NULL CHECK(json_valid(baseline_json))
) STRICT;`;
