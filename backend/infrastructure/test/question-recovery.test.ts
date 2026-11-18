import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { runMigrations } from '../src/persistence/run-migrations.js';
import { SqliteQuestionStore } from '../src/persistence/sqlite-question-store.js';

it('atomically persists a question boundary and accepts one answer without replay after restart', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    runMigrations(db, '2026-11-18T12:00:00.000Z');
    const store = new SqliteQuestionStore(db);
    const projectId = randomUUID(), chatId = randomUUID(), runId = randomUUID(), requestId = randomUUID();
    db.prepare("INSERT INTO workspaces(id,root_identity,revision,fingerprint,observation_complete) VALUES(?,?,0,'unobserved',0)").run(projectId, projectId);
    db.prepare("INSERT INTO chats(id,project_id,title,created_at,updated_at) VALUES(?,?,?,?,?)").run(chatId, projectId, 'Test', '2026-11-18T12:00:00.000Z', '2026-11-18T12:00:00.000Z');
    db.prepare("INSERT INTO sessions(id,kind,created_at,updated_at) VALUES(?,'agent',?,?)").run(runId, '2026-11-18T12:00:00.000Z', '2026-11-18T12:00:00.000Z');
    db.prepare("INSERT INTO agent_runs(run_id,request_id,state,task,max_steps,step_count,adapter_id,model_id) VALUES(?,?,'waiting_for_model','Test',8,0,'fake','fake')").run(runId, requestId);
    const callId = randomUUID();
    await store.create(chatId, requestId, {
      reason: 'Changes storage scope', prompt: 'Which storage?',
      options: [{ id: 'local', label: 'Local' }, { id: 'shared', label: 'Shared' }]
    }, { runId, stepCount: 1, changeSetId: null, history: [{ kind: 'assistant', text: '', calls: [{ callId, toolId: 'ask_user', toolVersion: 1, arguments: {} }] }], failedTool: false });
    const question = store.current(chatId);
    if (!question) throw new Error('Missing question.');
    expect(db.prepare('SELECT state FROM agent_runs WHERE run_id=?').get(runId)?.state).toBe('waiting_for_user_input');
    const answerId = randomUUID(), answer = { kind: 'option' as const, optionId: 'local' };
    expect(store.answer(chatId, runId, question.id, answerId, answer)).toBe('accepted');
    expect(new SqliteQuestionStore(db).answer(chatId, runId, question.id, answerId, answer)).toBe('duplicate');
    expect(store.answer(chatId, runId, question.id, randomUUID(), { kind: 'declined' })).toBe('rejected');
    expect(store.answer(randomUUID(), runId, question.id, answerId, answer)).toBe('rejected');
    const resumed = store.claim(requestId);
    expect(resumed?.runId).toBe(runId);
    expect(resumed?.history.at(-1)).toMatchObject({ kind: 'tool', result: { ok: true, output: answer } });
    expect(store.claim(requestId)).toBeNull();
  } finally { db.close(); }
});
