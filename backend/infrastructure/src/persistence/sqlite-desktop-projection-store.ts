import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import type { Clock, DesktopProjectionStore, IdGenerator } from '@codryn/core';
import { permissionViewSchema, r3ActivityViewSchema, r3CommandViewSchema, r3MessageSchema, r3OutputPageSchema, r3ProviderErrorSchema, r3RunDetailSchema, r3RunViewSchema, r3SnapshotSchema, r3UpdateSchema, verificationRecordSchema, uuidSchema } from '@codryn/shared';
import type { R3ActivityView, R3Message, R3OutputPage, R3RunDetail, R3RunView, R3Snapshot, R3Update, R3VerificationView, Uuid } from '@codryn/shared';
import { desktopPhase, integer, nullableText, parseJson, text, transaction } from './r3-sqlite-helpers.js';
import { SqliteDesktopProjectStore } from './sqlite-desktop-project-store.js';

type Row = Record<string, SQLOutputValue>;
function object(value: unknown): Record<string, unknown> { return typeof value==='object' && value!==null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function message(row: Row): R3Message { return r3MessageSchema.parse({id:row.id,chatId:row.chat_id,requestId:row.request_id,runId:row.run_id,retryOfRequestId:row.retry_of_request_id,role:row.role,text:row.text,sequence:row.sequence,state:row.state,createdAt:row.created_at}); }
export function desktopRunView(database: DatabaseSync, jobId: Uuid): R3RunView|null {
  const row=database.prepare('SELECT j.*,a.state AS phase,a.step_count FROM desktop_jobs j LEFT JOIN agent_runs a ON a.run_id=j.run_id WHERE j.id=?').get(jobId); if(!row) return null;
  const input=object(parseJson(row.input_json));
  const failure=r3RunViewSchema.shape.failure.parse(row.failure_json===null?null:parseJson(row.failure_json));
  return r3RunViewSchema.parse({jobId:row.id,requestId:row.request_id,runId:row.run_id,state:row.state,phase:desktopPhase(row.phase,failure),mode:input.mode,model:parseJson(row.descriptor_json),maxSteps:input.maxSteps,result:row.result_json===null?null:parseJson(row.result_json),failure,stepCount:row.step_count??0,startedAt:row.started_at,endedAt:row.ended_at,usage:row.usage_json===null?null:parseJson(row.usage_json),providerError:row.provider_error_json===null?null:parseJson(row.provider_error_json)});
}
const summaries: Record<string,string>={'agent_run.created':'Běh založen','agent_run.state_changed':'Změna fáze běhu','tool_call.received':'Přijat nástroj','tool_call.state_changed':'Změna stavu nástroje','permission.requested':'Čeká na schválení příkazu','permission.decided':'Rozhodnutí o oprávnění','permission.claimed':'Jednorázové oprávnění použito','permission.closed':'Žádost uzavřena','verification.recorded':'Uložen výsledek kontroly','change.mutation_prepared':'Změna připravena','change.mutation_applied':'Změna zapsána','change.mutation_not_applied':'Změna neprovedena','change.mutation_conflicted':'Konflikt při změně'};
function activityView(row: Row): R3ActivityView {
  const payload=object(parseJson(row.payload_json)), type=text(row.event_type);
  const details:{label:string;value:string}[]=[]; let detailsTruncated=false;
  // Explicit scalar allowlist excludes file contents, raw arguments, native responses and blobs.
  for(const field of ['state','from','to','toolId','path','decision','result','exitCode','revision','errorCode']) {
    const value=payload[field]; if(typeof value!=='string' && typeof value!=='number' && typeof value!=='boolean') continue;
    const item={label:field,value:String(value)}; if(Buffer.byteLength(JSON.stringify([...details,item]))>4096){detailsTruncated=true;break;} details.push(item);
  }
  return r3ActivityViewSchema.parse({eventId:row.event_id,sequence:row.activity_sequence,runId:row.run_id,type,occurredAt:row.occurred_at,callId:typeof payload.callId==='string' && uuidSchema.safeParse(payload.callId).success?payload.callId:row.tool_call_id??null,summary:summaries[type]??'Událost běhu',details,detailsTruncated});
}
export class SqliteDesktopProjectionStore implements DesktopProjectionStore {
  constructor(private readonly database: DatabaseSync,private readonly clock: Clock,private readonly ids: IdGenerator) {}
  private chat(chatId: Uuid): Row {const row=this.database.prepare('SELECT * FROM chats WHERE id=?').get(uuidSchema.parse(chatId)); if(!row)throw new Error('R3_NOT_FOUND');return row;}
  private job(chatId: Uuid,requestId: Uuid): Row {this.chat(chatId);const job=this.database.prepare('SELECT * FROM desktop_jobs WHERE request_id=?').get(uuidSchema.parse(requestId));if(!job)throw new Error('R3_NOT_FOUND');if(job.chat_id!==chatId)throw new Error('R3_CHAT_PROJECT_MISMATCH');return job;}
  private cursor(chatId: Uuid): number {return integer(this.database.prepare('SELECT cursor FROM chat_cursors WHERE chat_id=?').get(chatId)?.cursor??0);}
  private activityPage(runId: Uuid|null,before: number|null) {
    if(!runId)return {items:[],beforeSequence:null};
    const rows=this.database.prepare(`SELECT e.*,a.run_id,a.sequence AS activity_sequence,t.call_id AS tool_call_id FROM desktop_activity a JOIN events e ON e.event_id=a.event_id LEFT JOIN tool_calls t ON t.call_id=e.correlation_id WHERE a.run_id=? AND (? IS NULL OR a.sequence<?) ORDER BY a.sequence DESC LIMIT 100`).all(runId,before,before).reverse();
    const items=rows.map(activityView),earliest=items[0]?.sequence;
    return {items,beforeSequence:earliest && this.database.prepare('SELECT 1 FROM desktop_activity WHERE run_id=? AND sequence<? LIMIT 1').get(runId,earliest)?earliest:null};
  }
  private messagePage(chatId: Uuid,before: number|null): R3Message[] {
    const messages=this.database.prepare('SELECT * FROM chat_messages WHERE chat_id=? AND (? IS NULL OR sequence<?) ORDER BY sequence DESC LIMIT 100').all(chatId,before,before).reverse().map(message);
    while(messages.length>1 && Buffer.byteLength(JSON.stringify(messages))>768*1024)messages.shift();return messages;
  }
  private verification(run: R3RunView,available: boolean): R3VerificationView|null {
    if(!run.runId)return null;
    const workspace=this.database.prepare('SELECT w.* FROM workspaces w JOIN desktop_jobs j ON j.project_id=w.id WHERE j.id=?').get(run.jobId);
    const rows=this.database.prepare('SELECT r.record_json,c.covered_paths_json FROM verification_records r LEFT JOIN desktop_verification_coverage c ON c.record_id=r.id WHERE r.run_id=? ORDER BY r.occurred_at DESC,r.id DESC LIMIT 20').all(run.runId);
    const paths=this.database.prepare(`SELECT DISTINCT e.path FROM change_entries e JOIN mutation_intents m ON m.entry_id=e.id WHERE e.run_id=? AND e.kind='patch' AND m.state='applied' AND NOT EXISTS(SELECT 1 FROM change_entries r JOIN mutation_intents rm ON rm.entry_id=r.id WHERE r.reverses_id=e.id AND rm.state='applied')`).all(run.runId).map(row=>text(row.path));
    const checks=rows.map(row=>{const record=verificationRecordSchema.parse(parseJson(row.record_json));const coverage:unknown=row.covered_paths_json===null?[]:parseJson(row.covered_paths_json);if(!Array.isArray(coverage)||coverage.some(p=>typeof p!=='string'))throw new Error('R3_INTERNAL');return {record:{...record,stale:record.stale||!available||workspace?.observation_complete!==1||record.revision!==workspace.revision||record.fingerprint!==workspace.fingerprint},coveredPaths:coverage as string[],durationMs:null};});
    const covered=new Set(checks.filter(c=>c.record.result==='passed'&&!c.record.stale).flatMap(c=>c.coveredPaths));const uncoveredPaths=paths.filter(p=>!covered.has(p));
    const status=!available?'unverified':paths.length>0&&uncoveredPaths.length===0?'verified':paths.some(p=>covered.has(p))?'partially_verified':checks.some(c=>c.record.result==='passed'&&c.record.stale)?'stale':'unverified';
    return {status,reason:!available?'Složka není dostupná; historické kontroly nemají aktuální platnost.':status==='verified'?'Aktuální relevantní kontrola pokrývá všechny změny.':'Referenční kontrola pokrývá pouze sum.mjs; platnost závisí na celém projektu.',freshness:available?'current':'unavailable',observedAt:available?this.clock.now():null,checks,uncoveredPaths,missingChecks:uncoveredPaths.length?['Chybí aktuální relevantní kontrola nepokrytých cest.']:[]};
  }
  private detail(chatId: Uuid,job: Row,available: boolean): R3RunDetail {
    const run=desktopRunView(this.database,text(job.id));if(!run)throw new Error('R3_NOT_FOUND');
    const set=run.runId?this.database.prepare('SELECT id,state,(SELECT count(*) FROM change_entries WHERE set_id=s.id) AS entry_count FROM change_sets s WHERE run_id=?').get(run.runId):null;
    const activity=this.activityPage(run.runId,null);
    while(activity.items.length>1&&Buffer.byteLength(JSON.stringify(activity.items))>256*1024){activity.items.shift();activity.beforeSequence=activity.items[0]?.sequence??null;}
    const commands=run.runId?this.database.prepare("SELECT * FROM tool_calls WHERE run_id=? AND tool_id='command.run' ORDER BY created_at DESC,call_id DESC LIMIT 20").all(run.runId).reverse().map(row=>{
      const permission=this.database.prepare('SELECT safe_input_json FROM permission_requests WHERE call_id=?').get(text(row.call_id));
      const input=permission?object(parseJson(permission.safe_input_json)):object(parseJson(row.arguments_json)),command=object(input.command),terminal=this.database.prepare('SELECT result_json FROM desktop_command_results WHERE call_id=?').get(text(row.call_id)),result=terminal?object(parseJson(terminal.result_json)):{};
      const output=this.database.prepare('SELECT stream,text,truncated FROM command_outputs WHERE call_id=? ORDER BY sequence DESC LIMIT 16').all(text(row.call_id)).reverse();
      const tail=(stream:string)=>{const points=Array.from(output.filter(c=>c.stream===stream).map(c=>text(c.text)).join(''));let bytes=0;const kept:string[]=[];for(const point of points.reverse()){bytes+=Buffer.byteLength(point);if(bytes>1536)break;kept.push(point);}return kept.reverse().join('');};
      return r3CommandViewSchema.parse({callId:row.call_id,executable:typeof command.executable==='string'?command.executable:'[redacted]',args:Array.isArray(command.args)?command.args:[],cwd:typeof command.cwd==='string'?command.cwd:'.',status:result.status??(row.state==='succeeded'?'succeeded':['failed','denied','timed_out','cancelled'].includes(text(row.state))?row.state==='denied'?'failed':row.state:'running'),exitCode:result.exitCode??null,durationMs:result.durationMs??null,treeStopped:result.treeStopped??null,stdoutTail:tail('stdout'),stderrTail:tail('stderr'),truncated:output.some(c=>c.truncated===1),outputAvailable:output.length>0});
    }):[];
    while(commands.length>1&&Buffer.byteLength(JSON.stringify(commands))>384*1024)commands.shift();
    return r3RunDetailSchema.parse({chatId,run,cursor:this.cursor(chatId),changes:set?{setId:set.id,entryCount:set.entry_count,recoveryRequired:set.state==='recovery_required'}:null,verification:this.verification(run,available),commands,activity:activity.items,beforeActivitySequence:activity.beforeSequence});
  }
  async snapshot(chatId: Uuid): Promise<R3Snapshot> {
    const owner=this.chat(chatId);const project=await new SqliteDesktopProjectStore(this.database,this.clock).get(text(owner.project_id));if(!project)throw new Error('R3_NOT_FOUND');
    // No asynchronous work inside the read transaction.
    this.database.exec('BEGIN');
    try {
      const chat=this.chat(chatId),messages=this.messagePage(chatId,null),job=this.database.prepare("SELECT * FROM desktop_jobs WHERE chat_id=? ORDER BY CASE WHEN state IN ('queued','running','stopping') THEN 0 ELSE 1 END,created_at DESC,rowid DESC LIMIT 1").get(chatId);
      const detail=job?this.detail(chatId,job,project.available):null;
      const permissions=job?.run_id?this.database.prepare("SELECT p.* FROM permission_requests p JOIN tool_calls t ON t.call_id=p.call_id WHERE t.run_id=? AND p.state='pending' ORDER BY p.created_at,p.id").all(text(job.run_id)).map(row=>{const input=object(parseJson(row.safe_input_json));return permissionViewSchema.parse({id:row.id,callId:row.call_id,digest:row.digest,command:input.command,reason:input.reason,impact:input.impact,state:row.state});}):[];
      const first=messages[0]?.sequence;const snapshot={project,chat:{id:chat.id,projectId:chat.project_id,title:chat.title,archived:chat.archived===1,createdAt:chat.created_at},cursor:this.cursor(chatId),messages,beforeMessageSequence:first&&this.database.prepare('SELECT 1 FROM chat_messages WHERE chat_id=? AND sequence<? LIMIT 1').get(chatId,first)?first:null,run:detail?.run??null,permissions,activity:detail?.activity??[],changes:detail?.changes??null,commands:detail?.commands??[],verification:detail?.verification??null,beforeActivitySequence:detail?.beforeActivitySequence??null};
      while(Buffer.byteLength(JSON.stringify(snapshot))>1024*1024&&snapshot.messages.length>1){snapshot.messages.shift();snapshot.beforeMessageSequence=snapshot.messages[0]?.sequence??null;}
      const result=r3SnapshotSchema.parse(snapshot);this.database.exec('COMMIT');return result;
    }catch(error){if(this.database.isTransaction)this.database.exec('ROLLBACK');throw error;}
  }
  async inspectRun(chatId: Uuid,targetRequestId: Uuid): Promise<R3RunDetail> {const job=this.job(chatId,targetRequestId),project=await new SqliteDesktopProjectStore(this.database,this.clock).get(text(job.project_id));return this.detail(chatId,job,project?.available??false);}
  async activity(chatId: Uuid,targetRequestId: Uuid,beforeSequence: number|null) {return this.activityPage(nullableText(this.job(chatId,targetRequestId).run_id),beforeSequence);}
  async messages(chatId: Uuid,beforeSequence: number|null): Promise<readonly R3Message[]> {this.chat(chatId);return this.messagePage(chatId,beforeSequence);}
  async appendAssistant(requestId: Uuid,step: number,sequence: number,value: string): Promise<void> {
    if(!Number.isSafeInteger(step)||step<1||!Number.isSafeInteger(sequence)||sequence<1||Buffer.byteLength(value)>4096)throw new Error('R3_INPUT_INVALID');
    transaction(this.database,()=>{
      const job=this.database.prepare('SELECT * FROM desktop_jobs WHERE request_id=?').get(uuidSchema.parse(requestId));if(!job)throw new Error('R3_NOT_FOUND');
      const old=this.database.prepare('SELECT text FROM assistant_chunks WHERE request_id=? AND step=? AND sequence=?').get(requestId,step,sequence);if(old){if(old.text!==value)throw new Error('R3_REQUEST_MISMATCH');return;}
      const last=this.database.prepare('SELECT COALESCE(MAX(sequence),0) AS seq FROM assistant_chunks WHERE request_id=? AND step=?').get(requestId,step);if(integer(last?.seq)+1!==sequence)throw new Error('R3_STALE_VIEW');
      const total=this.database.prepare("SELECT COALESCE(SUM(length(CAST(text AS BLOB))),0) AS bytes FROM chat_messages WHERE request_id=? AND role='assistant'").get(requestId);if(integer(total?.bytes)+Buffer.byteLength(value)>1024*1024)throw new Error('R3_INPUT_INVALID');
      const existing=this.database.prepare("SELECT * FROM chat_messages WHERE request_id=? AND role='assistant' AND step=?").get(requestId,step);if(existing&&(existing.state!=='streaming'||Buffer.byteLength(text(existing.text))+Buffer.byteLength(value)>64*1024))throw new Error('R3_INPUT_INVALID');
      this.database.prepare('INSERT INTO assistant_chunks VALUES(?,?,?,?)').run(requestId,step,sequence,value);
      if(existing)this.database.prepare('UPDATE chat_messages SET text=text||? WHERE id=?').run(value,text(existing.id));
      else this.database.prepare(`INSERT INTO chat_messages(id,chat_id,request_id,run_id,retry_of_request_id,role,sequence,text,state,step,created_at) SELECT ?,?,?,?,?, 'assistant',COALESCE(MAX(sequence),0)+1,?,'streaming',?,? FROM chat_messages WHERE chat_id=?`).run(this.ids.next(),text(job.chat_id),requestId,job.run_id??null,job.retry_of_request_id??null,value,step,this.clock.now(),text(job.chat_id));
    });
  }
  async sealAssistant(requestId: Uuid,step: number,state: 'complete'|'interrupted'): Promise<void> {this.database.prepare("UPDATE chat_messages SET state=? WHERE request_id=? AND role='assistant' AND step=? AND state='streaming'").run(state,uuidSchema.parse(requestId),step);}
  async setUsage(requestId: Uuid,usage: {inputTokens:number;outputTokens:number}): Promise<void> {const parsed=r3RunViewSchema.shape.usage.parse(usage);this.database.prepare('UPDATE desktop_jobs SET usage_json=? WHERE request_id=?').run(JSON.stringify(parsed),uuidSchema.parse(requestId));}
  async setProviderError(requestId: Uuid,error: R3RunView['providerError']): Promise<void> {const parsed=error===null?null:r3ProviderErrorSchema.parse(error);this.database.prepare('UPDATE desktop_jobs SET provider_error_json=? WHERE request_id=?').run(parsed===null?null:JSON.stringify(parsed),uuidSchema.parse(requestId));}
  async appendOutput(requestId: Uuid,callId: Uuid,stream: 'stdout'|'stderr',value: string,truncated: boolean): Promise<void> {
    if(Buffer.byteLength(value)>4096||!['stdout','stderr'].includes(stream))throw new Error('R3_INPUT_INVALID');
    transaction(this.database,()=>{
      if(!this.database.prepare('SELECT j.id FROM desktop_jobs j JOIN tool_calls t ON t.run_id=j.run_id WHERE j.request_id=? AND t.call_id=?').get(uuidSchema.parse(requestId),uuidSchema.parse(callId)))throw new Error('R3_CHAT_PROJECT_MISMATCH');
      const total=this.database.prepare('SELECT COALESCE(SUM(length(CAST(text AS BLOB))),0) AS bytes FROM command_outputs WHERE call_id=?').get(callId);if(integer(total?.bytes)+Buffer.byteLength(value)>256*1024)throw new Error('R3_INPUT_INVALID');
      this.database.prepare('INSERT INTO command_outputs SELECT ?,COALESCE(MAX(sequence),0)+1,?,?,? FROM command_outputs WHERE call_id=?').run(callId,stream,value,truncated?1:0,callId);
    });
  }
  async output(chatId: Uuid,callId: Uuid,afterSequence: number|null): Promise<R3OutputPage> {
    this.chat(chatId);const owner=this.database.prepare('SELECT j.chat_id FROM desktop_jobs j JOIN tool_calls t ON t.run_id=j.run_id WHERE t.call_id=?').get(uuidSchema.parse(callId));if(!owner)throw new Error('R3_NOT_FOUND');if(owner.chat_id!==chatId)throw new Error('R3_CHAT_PROJECT_MISMATCH');
    const chunks:R3OutputPage['chunks']=[];let bytes=100,truncated=false;
    for(const row of this.database.prepare('SELECT * FROM command_outputs WHERE call_id=? AND sequence>? ORDER BY sequence LIMIT 256').all(callId,afterSequence??0)) {const chunk={sequence:integer(row.sequence),stream:text(row.stream) as 'stdout'|'stderr',text:text(row.text)},size=Buffer.byteLength(JSON.stringify(chunk))+1;if(bytes+size>64*1024)break;chunks.push(chunk);bytes+=size;truncated ||= row.truncated===1;}
    return r3OutputPageSchema.parse({callId,chunks,truncated,afterSequence:chunks.at(-1)?.sequence??afterSequence});
  }
  async updates(chatId: Uuid,afterCursor: number,limit: number): Promise<readonly R3Update[]> {
    this.chat(chatId);if(!Number.isSafeInteger(afterCursor)||afterCursor<0||!Number.isSafeInteger(limit)||limit<1||limit>257)throw new Error('R3_INPUT_INVALID');
    const cursor=this.cursor(chatId),earliest=this.database.prepare('SELECT MIN(cursor) AS cursor FROM desktop_updates WHERE chat_id=?').get(chatId)?.cursor;
    if(afterCursor>cursor||(typeof earliest==='number'&&afterCursor<earliest-1))return [{kind:'resync_required',chatId,cursor}];
    return this.database.prepare('SELECT * FROM desktop_updates WHERE chat_id=? AND cursor>? ORDER BY cursor LIMIT ?').all(chatId,afterCursor,limit).map(row=>r3UpdateSchema.parse({kind:row.kind,chatId,cursor:row.cursor,...object(parseJson(row.payload_json))}));
  }
}
