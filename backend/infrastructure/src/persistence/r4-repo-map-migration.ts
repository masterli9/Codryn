export const r4RepoMapSql = `
CREATE TABLE repo_map_generations (
  project_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  next_generation INTEGER NOT NULL,
  published_generation INTEGER,
  policy_revision TEXT
) STRICT;
CREATE TABLE repo_map_items (
  project_id TEXT NOT NULL REFERENCES repo_map_generations(project_id) ON DELETE CASCADE,
  generation INTEGER NOT NULL,
  path TEXT NOT NULL,
  metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)),
  PRIMARY KEY(project_id, generation, path)
) STRICT;
CREATE TABLE repo_map_instructions (
  project_id TEXT NOT NULL REFERENCES repo_map_generations(project_id) ON DELETE CASCADE,
  generation INTEGER NOT NULL,
  path TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  PRIMARY KEY(project_id, generation, path)
) STRICT;
`;
