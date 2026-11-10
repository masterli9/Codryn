import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Clock, DesktopRequestStore, IdGenerator } from '@codryn/core';
import { modelDescriptorSchema, r2RunResultSchema, r3AcceptedSchema, r3JobStateSchema, r3RunViewSchema, r3SubmitInputSchema, uuidSchema } from '@codryn/shared';
import type { ModelDescriptor, R2RunResult, R3Accepted, R3JobState, R3RunView, R3SubmitInput, Uuid } from '@codryn/shared';
import { desktopPhase, parseJson, text, transaction } from './r3-sqlite-helpers.js';
export function desktopRequestDigest(input: R3SubmitInput, projectId: Uuid): string {
  return createHash('sha256').update(JSON.stringify({ projectId, chatId: input.chatId, task: input.task, mode: input.mode, maxSteps: input.maxSteps, retryOfRequestId: input.retryOfRequestId ?? null })).digest('hex');
}
export class SqliteDesktopRequestStore implements DesktopRequestStore {
  constructor(private readonly database: DatabaseSync, private readonly clock: Clock, private readonly ids: IdGenerator) {}
  async getByRequestId(requestId: Uuid) {
    const row = this.database.prepare('SELECT * FROM desktop_jobs WHERE request_id=?').get(uuidSchema.parse(requestId));
    if (!row) return null;
    const view = await this.get(text(row.id)); if (!view) throw new Error('R3_INTERNAL');
    return { input: r3SubmitInputSchema.parse(parseJson(row.input_json)), projectId: uuidSchema.parse(row.project_id), accepted: r3AcceptedSchema.parse({ requestId: row.request_id, jobId: row.id, messageId: row.message_id, duplicate: true }), view };
  }
  async get(jobId: Uuid): Promise<R3RunView | null> {
    const row = this.database.prepare('SELECT j.*, a.state AS phase, a.step_count FROM desktop_jobs j LEFT JOIN agent_runs a ON a.run_id=j.run_id WHERE j.id=?').get(uuidSchema.parse(jobId));
    if (!row) return null;
    const input = r3SubmitInputSchema.parse(parseJson(row.input_json));
    const failure = r3RunViewSchema.shape.failure.parse(row.failure_json === null ? null : parseJson(row.failure_json));
    return r3RunViewSchema.parse({ jobId: row.id, requestId: row.request_id, runId: row.run_id, state: row.state, phase: desktopPhase(row.phase, failure), mode: input.mode, model: parseJson(row.descriptor_json), maxSteps: input.maxSteps, result: row.result_json === null ? null : parseJson(row.result_json), failure, stepCount: row.step_count ?? 0, startedAt: row.started_at, endedAt: row.ended_at, usage: row.usage_json === null ? null : parseJson(row.usage_json), providerError: row.provider_error_json === null ? null : parseJson(row.provider_error_json) });
  }
  async accept(raw: R3SubmitInput, projectId: Uuid, model: ModelDescriptor): Promise<R3Accepted> {
    const input = r3SubmitInputSchema.parse(raw); uuidSchema.parse(projectId); modelDescriptorSchema.parse(model);
    const digest = desktopRequestDigest(input, projectId);
    return transaction(this.database, () => {
      const old = this.database.prepare('SELECT * FROM desktop_jobs WHERE request_id=?').get(input.requestId);
      if (old) {
        if (old.input_digest !== digest) throw new Error('R3_REQUEST_MISMATCH');
        return r3AcceptedSchema.parse({ requestId: input.requestId, jobId: old.id, messageId: old.message_id, duplicate: true });
      }
      const chat = this.database.prepare('SELECT * FROM chats WHERE id=?').get(input.chatId);
      if (!chat) throw new Error('R3_NOT_FOUND');
      if (chat.project_id !== projectId) throw new Error('R3_CHAT_PROJECT_MISMATCH');
      if (chat.archived === 1) throw new Error('R3_INPUT_INVALID');
      if (this.database.prepare("SELECT 1 FROM desktop_jobs WHERE project_id=? AND state IN ('queued','running','stopping')").get(projectId)) throw new Error('R3_PROJECT_BUSY');
      if (input.retryOfRequestId) {
        const parent = this.database.prepare('SELECT chat_id FROM desktop_jobs WHERE request_id=?').get(input.retryOfRequestId);
        if (!parent || parent.chat_id !== input.chatId) throw new Error('R3_REQUEST_MISMATCH');
      }
      const jobId = this.ids.next(), messageId = this.ids.next(), now = this.clock.now();
      this.database.prepare(`INSERT INTO desktop_jobs(id,project_id,chat_id,request_id,message_id,input_digest,input_json,descriptor_json,retry_of_request_id,state,created_at) VALUES(?,?,?,?,?,?,?,?,?,'queued',?)`).run(jobId, projectId, input.chatId, input.requestId, messageId, digest, JSON.stringify(input), JSON.stringify(model), input.retryOfRequestId ?? null, now);
      this.database.prepare(`INSERT INTO chat_messages(id,chat_id,request_id,run_id,retry_of_request_id,role,sequence,text,state,step,created_at) SELECT ?,?,?,NULL,?,'user',COALESCE(MAX(sequence),0)+1,?,'complete',NULL,? FROM chat_messages WHERE chat_id=?`).run(messageId, input.chatId, input.requestId, input.retryOfRequestId ?? null, input.task, now, input.chatId);
      return { requestId: input.requestId, jobId, messageId, duplicate: false };
    });
  }
  async attachRun(requestId: Uuid, runId: Uuid): Promise<void> {
    transaction(this.database, () => {
      const run = this.database.prepare('SELECT request_id FROM agent_runs WHERE run_id=?').get(uuidSchema.parse(runId));
      const job = this.database.prepare('SELECT run_id,state FROM desktop_jobs WHERE request_id=?').get(uuidSchema.parse(requestId));
      if (!job || !run || run.request_id !== requestId || (job.run_id !== null && job.run_id !== runId) || !['queued', 'running'].includes(text(job.state))) throw new Error('R3_REQUEST_MISMATCH');
      this.database.prepare("UPDATE desktop_jobs SET run_id=?,state='running',started_at=COALESCE(started_at,?) WHERE request_id=?").run(runId, this.clock.now(), requestId);
      this.database.prepare('UPDATE chat_messages SET run_id=? WHERE request_id=?').run(runId, requestId);
    });
  }
  async setState(jobId: Uuid, state: R3JobState, failure?: NonNullable<R3RunView['failure']>): Promise<void> {
    const current = await this.get(jobId); if (!current) throw new Error('R3_NOT_FOUND');
    r3JobStateSchema.parse(state);
    const safeFailure = failure === undefined ? undefined : r3RunViewSchema.shape.failure.parse(failure);
    const allowed = current.state === state || (current.state === 'queued' && ['running', 'stopping', 'interrupted'].includes(state)) || (current.state === 'running' && ['stopping', 'finished', 'interrupted'].includes(state)) || (current.state === 'stopping' && ['finished', 'interrupted'].includes(state));
    if (!allowed) throw new Error('R3_STALE_VIEW');
    transaction(this.database,()=>{
      if (safeFailure !== undefined) this.database.prepare('UPDATE desktop_jobs SET failure_json=? WHERE id=?').run(JSON.stringify(safeFailure), jobId);
      this.database.prepare('UPDATE desktop_jobs SET state=?,ended_at=CASE WHEN ? IN (\'finished\',\'interrupted\') THEN ? ELSE ended_at END WHERE id=?').run(state,state,this.clock.now(),jobId);
      if(state==='interrupted')this.database.prepare("UPDATE chat_messages SET state='interrupted' WHERE request_id=? AND state='streaming'").run(current.requestId);
    });
  }
  async finish(jobId: Uuid, raw: R2RunResult): Promise<void> {
    const validated = r2RunResultSchema.parse(raw);
    const result = { schemaVersion: validated.schemaVersion, runId: validated.runId, stepCount: validated.stepCount, status: validated.status, changeSetId: validated.changeSetId, verification: validated.verification, recoveryRequired: validated.recoveryRequired };
    const job = await this.get(jobId); if (!job || job.runId !== result.runId) throw new Error('R3_REQUEST_MISMATCH');
    transaction(this.database, () => {
      this.database.prepare("UPDATE chat_messages SET state=? WHERE request_id=? AND state='streaming'").run(result.status === 'completed' ? 'complete' : 'interrupted', job.requestId);
      this.database.prepare("UPDATE desktop_jobs SET state='finished',result_json=?,ended_at=? WHERE id=?").run(JSON.stringify(result), this.clock.now(), jobId);
    });
  }
  async interruptUnfinished(projectId: Uuid): Promise<void> {
    transaction(this.database, () => {
      const jobs = this.database.prepare("SELECT request_id FROM desktop_jobs WHERE project_id=? AND state IN ('queued','running','stopping')").all(uuidSchema.parse(projectId));
      for (const job of jobs) {
        const runs = this.database.prepare('SELECT run_id FROM agent_runs WHERE request_id=?').all(text(job.request_id));
        if (runs.length > 1) throw new Error('R3_RECOVERY_REQUIRED');
        const runId = runs[0]?.run_id ?? null;
        this.database.prepare("UPDATE chat_messages SET state=CASE WHEN state='streaming' THEN 'interrupted' ELSE state END, run_id=COALESCE(run_id,?) WHERE request_id=?").run(runId, text(job.request_id));
        this.database.prepare("UPDATE desktop_jobs SET state='interrupted',ended_at=?,run_id=COALESCE(run_id,?) WHERE request_id=?").run(this.clock.now(), runId, text(job.request_id));
      }
    });
  }
}
