const refresh = (chat: string) => `INSERT INTO chat_cursors(chat_id,cursor) VALUES(${chat},1) ON CONFLICT(chat_id) DO UPDATE SET cursor=cursor+1;
INSERT INTO desktop_updates(chat_id,cursor,kind,payload_json) SELECT ${chat},cursor,'refresh','{}' FROM chat_cursors WHERE chat_id=${chat};`;
const eventJob = `(SELECT j.chat_id FROM desktop_jobs j JOIN agent_runs a ON a.request_id=j.request_id WHERE a.run_id=COALESCE(NEW.session_id,(SELECT run_id FROM tool_calls WHERE call_id=NEW.correlation_id)) LIMIT 1)`;
export const r3ProjectionSql = `
CREATE TABLE chat_cursors(chat_id TEXT PRIMARY KEY REFERENCES chats(id),cursor INTEGER NOT NULL CHECK(cursor>=0)) STRICT;
INSERT INTO chat_cursors SELECT id,0 FROM chats;
CREATE TABLE desktop_updates(chat_id TEXT NOT NULL REFERENCES chats(id),cursor INTEGER NOT NULL,kind TEXT NOT NULL,payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),PRIMARY KEY(chat_id,cursor)) STRICT;
CREATE TABLE desktop_activity(run_id TEXT NOT NULL REFERENCES agent_runs(run_id),sequence INTEGER NOT NULL,event_id TEXT NOT NULL UNIQUE REFERENCES events(event_id),PRIMARY KEY(run_id,sequence)) STRICT;
CREATE TABLE assistant_chunks(request_id TEXT NOT NULL REFERENCES desktop_jobs(request_id),step INTEGER NOT NULL,sequence INTEGER NOT NULL,text TEXT NOT NULL,PRIMARY KEY(request_id,step,sequence)) STRICT;
CREATE TABLE command_outputs(call_id TEXT NOT NULL REFERENCES tool_calls(call_id),sequence INTEGER NOT NULL,stream TEXT NOT NULL CHECK(stream IN ('stdout','stderr')),text TEXT NOT NULL,truncated INTEGER NOT NULL CHECK(truncated IN (0,1)),PRIMARY KEY(call_id,sequence)) STRICT;
CREATE TABLE desktop_actions(request_id TEXT PRIMARY KEY,chat_id TEXT NOT NULL REFERENCES chats(id),digest TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('started','finished','interrupted')),result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json))) STRICT;
CREATE TABLE desktop_verification_coverage(record_id TEXT PRIMARY KEY REFERENCES verification_records(id),profile_id TEXT NOT NULL,covered_paths_json TEXT NOT NULL CHECK(json_valid(covered_paths_json))) STRICT;
CREATE TABLE desktop_command_owners(call_id TEXT PRIMARY KEY REFERENCES tool_calls(call_id),run_id TEXT NOT NULL REFERENCES agent_runs(run_id),project_id TEXT NOT NULL REFERENCES workspaces(id),job_name TEXT NOT NULL UNIQUE,worker_pid INTEGER NOT NULL,worker_creation_time TEXT NOT NULL,target_pid INTEGER NOT NULL,target_creation_time TEXT NOT NULL,stopped INTEGER NOT NULL DEFAULT 0 CHECK(stopped IN (0,1))) STRICT;
CREATE TABLE desktop_command_results(call_id TEXT PRIMARY KEY REFERENCES tool_calls(call_id),result_json TEXT NOT NULL CHECK(json_valid(result_json))) STRICT;
CREATE TRIGGER desktop_chat_cursor AFTER INSERT ON chats BEGIN INSERT INTO chat_cursors VALUES(NEW.id,0); END;
CREATE TRIGGER desktop_workspace_refresh AFTER UPDATE OF revision,observation_complete ON workspaces WHEN NEW.revision<>OLD.revision OR NEW.observation_complete<>OLD.observation_complete BEGIN
UPDATE chat_cursors SET cursor=cursor+1 WHERE chat_id IN(SELECT id FROM chats WHERE project_id=NEW.id);
INSERT INTO desktop_updates(chat_id,cursor,kind,payload_json) SELECT c.chat_id,c.cursor,'refresh','{}' FROM chat_cursors c JOIN chats h ON h.id=c.chat_id WHERE h.project_id=NEW.id;
END;
CREATE TRIGGER desktop_update_retention AFTER INSERT ON desktop_updates BEGIN DELETE FROM desktop_updates WHERE chat_id=NEW.chat_id AND cursor<=NEW.cursor-1024; END;
CREATE TRIGGER desktop_event_projection AFTER INSERT ON events WHEN ${eventJob} IS NOT NULL BEGIN
INSERT INTO desktop_activity(run_id,sequence,event_id) SELECT a.run_id,COALESCE((SELECT MAX(sequence) FROM desktop_activity WHERE run_id=a.run_id),0)+1,NEW.event_id FROM agent_runs a JOIN desktop_jobs j ON j.request_id=a.request_id WHERE a.run_id=COALESCE(NEW.session_id,(SELECT run_id FROM tool_calls WHERE call_id=NEW.correlation_id));
${refresh(eventJob)} END;
CREATE TRIGGER desktop_job_insert AFTER INSERT ON desktop_jobs BEGIN ${refresh('NEW.chat_id')} END;
CREATE TRIGGER desktop_job_update AFTER UPDATE ON desktop_jobs BEGIN ${refresh('NEW.chat_id')} END;
CREATE TRIGGER desktop_message_insert AFTER INSERT ON chat_messages BEGIN ${refresh('NEW.chat_id')} END;
CREATE TRIGGER desktop_message_update AFTER UPDATE ON chat_messages BEGIN ${refresh('NEW.chat_id')} END;
CREATE TRIGGER desktop_output_insert AFTER INSERT ON command_outputs BEGIN ${refresh('(SELECT j.chat_id FROM desktop_jobs j JOIN tool_calls t ON t.run_id=j.run_id WHERE t.call_id=NEW.call_id)')} END;
CREATE TRIGGER desktop_command_result_insert AFTER INSERT ON desktop_command_results WHEN (SELECT j.chat_id FROM desktop_jobs j JOIN tool_calls t ON t.run_id=j.run_id WHERE t.call_id=NEW.call_id) IS NOT NULL BEGIN ${refresh('(SELECT j.chat_id FROM desktop_jobs j JOIN tool_calls t ON t.run_id=j.run_id WHERE t.call_id=NEW.call_id)')} END;
`;
