import type { DatabaseSync } from 'node:sqlite';
import type { DesktopActionStore } from '@codryn/core';
import { r3RevertInputSchema,r3RevertResultSchema,uuidSchema } from '@codryn/shared';
import type { R3RevertInput,R3RevertResult,Uuid } from '@codryn/shared';
import { parseJson,text,transaction } from './r3-sqlite-helpers.js';
export class SqliteDesktopActionStore implements DesktopActionStore {
  constructor(private readonly database: DatabaseSync) {}
  async get(requestId: Uuid): ReturnType<DesktopActionStore['get']> {
    const row=this.database.prepare('SELECT * FROM desktop_actions WHERE request_id=?').get(uuidSchema.parse(requestId)); if (!row) return null;
    const state=text(row.state); if (state!=='started' && state!=='finished' && state!=='interrupted') throw new Error('R3_INTERNAL');
    return {digest:text(row.digest),state,result:row.result_json===null?null:r3RevertResultSchema.parse(parseJson(row.result_json))};
  }
  async begin(raw: R3RevertInput,digest: string): Promise<void> {
    const input=r3RevertInputSchema.parse(raw); if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error('R3_INPUT_INVALID');
    transaction(this.database,()=>{ const old=this.database.prepare('SELECT digest FROM desktop_actions WHERE request_id=?').get(input.requestId); if(old) {if(old.digest!==digest) throw new Error('R3_REQUEST_MISMATCH');return;} this.database.prepare("INSERT INTO desktop_actions VALUES(?,?,?,'started',NULL)").run(input.requestId,input.chatId,digest); });
  }
  async finish(requestId: Uuid,result: R3RevertResult): Promise<void> {
    if(!this.database.prepare("UPDATE desktop_actions SET state='finished',result_json=? WHERE request_id=? AND state='started'").run(JSON.stringify(r3RevertResultSchema.parse(result)),uuidSchema.parse(requestId)).changes) throw new Error('R3_STALE_VIEW');
  }
  interruptUnfinished(): void {this.database.exec("UPDATE desktop_actions SET state='interrupted' WHERE state='started'");}
}
