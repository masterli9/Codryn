import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { questionInputSchema, questionAnswerSchema, questionCheckpointSchema, questionSchema, uuidSchema } from '@codryn/shared';
import type { QuestionAnswer, QuestionCheckpoint, QuestionInput, Question } from '@codryn/shared';
import { insertEvent, validateEvent } from './sqlite-event-store.js';
import { parseJson, text, transaction } from './r3-sqlite-helpers.js';

export class SqliteQuestionStore {
  constructor(private readonly database: DatabaseSync) {}
  private event(runId: string, requestId: string, eventType: string, payload: Record<string, string | number>) {
    insertEvent(this.database, validateEvent({ eventId: randomUUID(), eventType, eventVersion: 1,
      correlationId: requestId, sessionId: runId, source: 'core', occurredAt: new Date().toISOString(), payload }));
  }
  async create(chatId: string, requestId: string, raw: QuestionInput, checkpoint: QuestionCheckpoint): Promise<void> {
    const input = questionInputSchema.parse(raw), saved = questionCheckpointSchema.parse(checkpoint);
    uuidSchema.parse(chatId); uuidSchema.parse(requestId);
    transaction(this.database, () => {
      const run = this.database.prepare('SELECT state,request_id FROM agent_runs WHERE run_id=?').get(saved.runId);
      if (run?.state !== 'waiting_for_model' || run.request_id !== requestId) throw new Error('R3_STALE_VIEW');
      const question = questionSchema.parse({ ...input, id: randomUUID(), runId: saved.runId, chatId,
        sequence: saved.stepCount, status: 'waiting', createdAt: new Date().toISOString() });
      this.database.prepare("INSERT INTO r4_questions VALUES(?,?,?,?,?,?,?,'waiting',NULL,NULL,'ready',?)")
        .run(question.id, saved.runId, chatId, requestId, saved.stepCount, JSON.stringify(question), JSON.stringify(saved), question.createdAt);
      this.database.prepare("UPDATE agent_runs SET state='waiting_for_user_input',step_count=? WHERE run_id=?")
        .run(saved.stepCount, saved.runId);
      this.database.prepare('UPDATE sessions SET updated_at=? WHERE id=?').run(question.createdAt, saved.runId);
      this.event(saved.runId, requestId, 'question.created', { questionId: question.id, sequence: question.sequence });
      this.event(saved.runId, requestId, 'agent_run.state_changed', { from: 'waiting_for_model', to: 'waiting_for_user_input', stepCount: saved.stepCount });
    });
  }
  current(chatId: string): Question | null {
    const row = this.database.prepare("SELECT q.question_json FROM r4_questions q JOIN agent_runs a ON a.run_id=q.run_id WHERE q.chat_id=? AND q.status='waiting' AND a.state='waiting_for_user_input' ORDER BY q.created_at DESC LIMIT 1").get(uuidSchema.parse(chatId));
    return row ? questionSchema.parse(parseJson(row.question_json)) : null;
  }
  answer(chatId: string, runId: string, questionId: string, requestId: string, raw: QuestionAnswer): 'accepted' | 'duplicate' | 'rejected' {
    const value = questionAnswerSchema.parse(raw);
    [chatId, runId, questionId, requestId].forEach(id => uuidSchema.parse(id));
    return transaction(this.database, () => {
      const row = this.database.prepare('SELECT * FROM r4_questions WHERE id=? AND chat_id=? AND run_id=?').get(questionId, chatId, runId);
      if (!row) return 'rejected';
      const encoded = JSON.stringify(value);
      if (row.status === 'answered') return row.answer_request_id === requestId && row.answer_json === encoded ? 'duplicate' : 'rejected';
      const question = questionSchema.parse(parseJson(row.question_json));
      if (row.status !== 'waiting' || (value.kind === 'option' && !question.options.some(option => option.id === value.optionId))) return 'rejected';
      const changed = this.database.prepare("UPDATE r4_questions SET status='answered',answer_request_id=?,answer_json=? WHERE id=? AND status='waiting'").run(requestId, encoded, questionId);
      if (!changed.changes) return 'rejected';
      this.event(runId, text(row.request_id), 'question.answered', { questionId, decision: value.kind });
      return 'accepted';
    });
  }
  claim(requestId: string): QuestionCheckpoint | null {
    return transaction(this.database, () => {
      const row = this.database.prepare("SELECT * FROM r4_questions WHERE request_id=? AND status='answered' AND resume_state='ready' ORDER BY sequence DESC LIMIT 1").get(uuidSchema.parse(requestId));
      if (!row) return null;
      const saved = questionCheckpointSchema.parse(parseJson(row.checkpoint_json)), answer = questionAnswerSchema.parse(parseJson(row.answer_json));
      const last = saved.history.at(-1);
      if (last?.kind !== 'assistant' || last.calls.length !== 1 || !last.calls[0]) throw new Error('R3_RECOVERY_REQUIRED');
      this.database.prepare("UPDATE r4_questions SET resume_state='claimed' WHERE id=?").run(text(row.id));
      this.event(saved.runId,requestId,'question.resumed',{questionId:text(row.id),stepCount:saved.stepCount});
      return questionCheckpointSchema.parse({ ...saved, history: [...saved.history, {
        kind: 'tool', result: { ok: true, callId: last.calls[0].callId, output: answer }
      }] });
    });
  }
  cancel(runId: string): void {
    this.database.prepare("UPDATE r4_questions SET status='cancelled' WHERE run_id=? AND status='waiting'").run(uuidSchema.parse(runId));
  }
}
