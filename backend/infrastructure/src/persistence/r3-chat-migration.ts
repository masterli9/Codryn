export const r3ChatSql = `
CREATE TABLE desktop_projects (
  project_id TEXT PRIMARY KEY REFERENCES workspaces(id),
  root TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, created_at TEXT NOT NULL
) STRICT;
CREATE TABLE chats (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES workspaces(id),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 120),
  archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(id,project_id)
) STRICT;
CREATE TABLE desktop_jobs (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES workspaces(id),
  chat_id TEXT NOT NULL, request_id TEXT NOT NULL UNIQUE,
  message_id TEXT NOT NULL UNIQUE, input_digest TEXT NOT NULL, input_json TEXT NOT NULL CHECK(json_valid(input_json)),
  descriptor_json TEXT NOT NULL CHECK(json_valid(descriptor_json)),
  retry_of_request_id TEXT REFERENCES desktop_jobs(request_id),
  state TEXT NOT NULL CHECK(state IN ('queued','running','stopping','finished','interrupted')),
  run_id TEXT UNIQUE REFERENCES agent_runs(run_id), created_at TEXT NOT NULL, started_at TEXT, ended_at TEXT,
  result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
  failure_json TEXT CHECK(failure_json IS NULL OR json_valid(failure_json)),
  provider_error_json TEXT CHECK(provider_error_json IS NULL OR json_valid(provider_error_json)),
  usage_json TEXT CHECK(usage_json IS NULL OR json_valid(usage_json)),
  FOREIGN KEY(chat_id,project_id) REFERENCES chats(id,project_id)
) STRICT;
CREATE UNIQUE INDEX desktop_one_active_project ON desktop_jobs(project_id) WHERE state IN ('queued','running','stopping');
CREATE INDEX desktop_jobs_chat ON desktop_jobs(chat_id,created_at);
CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY, chat_id TEXT NOT NULL REFERENCES chats(id),
  request_id TEXT NOT NULL REFERENCES desktop_jobs(request_id), run_id TEXT REFERENCES agent_runs(run_id),
  retry_of_request_id TEXT REFERENCES desktop_jobs(request_id),
  role TEXT NOT NULL CHECK(role IN ('user','assistant')), sequence INTEGER NOT NULL CHECK(sequence > 0),
  text TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('streaming','complete','interrupted')),
  step INTEGER, created_at TEXT NOT NULL,
  UNIQUE(chat_id,sequence), UNIQUE(request_id,role,step)
) STRICT;
CREATE TRIGGER desktop_archive_active BEFORE UPDATE OF archived ON chats
WHEN NEW.archived = 1 AND EXISTS(SELECT 1 FROM desktop_jobs WHERE chat_id=NEW.id AND state IN ('queued','running','stopping'))
BEGIN SELECT RAISE(ABORT,'R3_PROJECT_BUSY'); END;
CREATE TRIGGER desktop_accept_archived BEFORE INSERT ON desktop_jobs
WHEN EXISTS(SELECT 1 FROM chats WHERE id=NEW.chat_id AND archived=1)
BEGIN SELECT RAISE(ABORT,'R3_INPUT_INVALID'); END;
`;
