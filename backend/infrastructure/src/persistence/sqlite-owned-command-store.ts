import type { DatabaseSync } from 'node:sqlite';
import type { ChangeActor, CommandOwnership, CommandResult, OwnedCommandStore } from '@codryn/core';
import { uuidSchema } from '@codryn/shared';
import { transaction, text, integer } from './r3-sqlite-helpers.js';
export class SqliteOwnedCommandStore implements OwnedCommandStore {
  constructor(private readonly database: DatabaseSync) {}
  private actor(actor: ChangeActor): void {
    for(const id of [actor.projectId,actor.runId,actor.callId])uuidSchema.parse(id);
    if(!this.database.prepare('SELECT 1 FROM tool_calls WHERE call_id=? AND run_id=? AND project_id=?').get(actor.callId,actor.runId,actor.projectId))throw new Error('R3_CHAT_PROJECT_MISMATCH');
  }
  async recordOwned(actor: ChangeActor,evidence: CommandOwnership): Promise<void> {
    this.actor(actor);
    if(!/^Codryn-R3-[a-f0-9-]{36}$/.test(evidence.jobName)||[evidence.worker,evidence.target].some(p=>!Number.isSafeInteger(p.pid)||p.pid<1||!/^\d{15,20}$/.test(p.creationTime)))throw new Error('R3_INPUT_INVALID');
    transaction(this.database,()=>{
      const old=this.database.prepare('SELECT * FROM desktop_command_owners WHERE call_id=?').get(actor.callId);
      if(old){if(old.job_name!==evidence.jobName||old.worker_pid!==evidence.worker.pid||old.worker_creation_time!==evidence.worker.creationTime||old.target_pid!==evidence.target.pid||old.target_creation_time!==evidence.target.creationTime)throw new Error('R3_REQUEST_MISMATCH');return;}
      this.database.prepare('INSERT INTO desktop_command_owners VALUES(?,?,?,?,?,?,?,?,0)').run(actor.callId,actor.runId,actor.projectId,evidence.jobName,evidence.worker.pid,evidence.worker.creationTime,evidence.target.pid,evidence.target.creationTime);
    });
  }
  async recordResult(actor: ChangeActor,result: CommandResult): Promise<void> {
    this.actor(actor);
    const metadata={status:result.status,exitCode:result.exitCode,durationMs:result.durationMs,truncated:result.truncated,treeStopped:result.treeStopped};
    transaction(this.database,()=>{
      this.database.prepare('INSERT INTO desktop_command_results VALUES(?,?) ON CONFLICT(call_id) DO UPDATE SET result_json=excluded.result_json').run(actor.callId,JSON.stringify(metadata));
      if(result.treeStopped)this.database.prepare('UPDATE desktop_command_owners SET stopped=1 WHERE call_id=?').run(actor.callId);
    });
  }
  async pending(projectId?: string) {
    if(projectId)uuidSchema.parse(projectId);
    return this.database.prepare('SELECT * FROM desktop_command_owners WHERE stopped=0 AND (? IS NULL OR project_id=?)').all(projectId??null,projectId??null).map(row=>({callId:text(row.call_id),runId:text(row.run_id),projectId:text(row.project_id),jobName:text(row.job_name),worker:{pid:integer(row.worker_pid),creationTime:text(row.worker_creation_time)},target:{pid:integer(row.target_pid),creationTime:text(row.target_creation_time)}}));
  }
  async markStopped(callId: string): Promise<void> { this.database.prepare('UPDATE desktop_command_owners SET stopped=1 WHERE call_id=?').run(uuidSchema.parse(callId)); }
}
