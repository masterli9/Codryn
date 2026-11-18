export const r4QuestionSql = `
CREATE TABLE r4_questions (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES agent_runs(run_id),
 chat_id TEXT NOT NULL REFERENCES chats(id), request_id TEXT NOT NULL,
 sequence INTEGER NOT NULL, question_json TEXT NOT NULL CHECK(json_valid(question_json)),
 checkpoint_json TEXT NOT NULL CHECK(json_valid(checkpoint_json)),
 status TEXT NOT NULL CHECK(status IN ('waiting','answered','cancelled')),
 answer_request_id TEXT UNIQUE, answer_json TEXT CHECK(answer_json IS NULL OR json_valid(answer_json)),
 resume_state TEXT NOT NULL CHECK(resume_state IN ('ready','claimed')),
 created_at TEXT NOT NULL, UNIQUE(run_id,sequence)
) STRICT;
CREATE UNIQUE INDEX r4_one_waiting_question ON r4_questions(run_id) WHERE status='waiting';
`;
