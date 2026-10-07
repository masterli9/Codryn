export const r2ChangeDataSql = `CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  root_identity TEXT NOT NULL UNIQUE,
  revision INTEGER NOT NULL CHECK(revision >= 0),
  fingerprint TEXT NOT NULL,
  git_identity TEXT,
  observation_complete INTEGER NOT NULL CHECK(observation_complete IN (0,1))
) STRICT;

CREATE TABLE change_sets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES workspaces(id),
  run_id TEXT NOT NULL UNIQUE REFERENCES agent_runs(run_id),
  state TEXT NOT NULL CHECK(state IN ('open','sealed','reverting','reverted','conflicted','recovery_required')),
  base_revision INTEGER NOT NULL,
  next_sequence INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE(id,project_id,run_id)
) STRICT;

CREATE TABLE change_entries (
  id TEXT PRIMARY KEY,
  set_id TEXT NOT NULL REFERENCES change_sets(id),
  project_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  call_id TEXT NOT NULL REFERENCES tool_calls(call_id),
  sequence INTEGER NOT NULL,
  path TEXT NOT NULL,
  before_hash TEXT NOT NULL,
  after_hash TEXT NOT NULL,
  before_blob TEXT NOT NULL,
  after_blob TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('patch','revert')),
  reverses_id TEXT REFERENCES change_entries(id),
  UNIQUE(set_id,sequence),
  FOREIGN KEY(set_id,project_id,run_id) REFERENCES change_sets(id,project_id,run_id),
  FOREIGN KEY(run_id,call_id) REFERENCES tool_calls(run_id,call_id)
) STRICT;

CREATE TABLE mutation_intents (
  operation_id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL UNIQUE REFERENCES change_entries(id),
  state TEXT NOT NULL CHECK(state IN ('prepared','applied','not_applied','conflicted')),
  confirmed_revision INTEGER,
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX change_entries_set_sequence_idx ON change_entries(set_id, sequence);
CREATE INDEX mutation_intents_state_idx ON mutation_intents(state);`;
