import { realpath,stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { ChatService,DesktopRunManager,DesktopPermissionBroker,InMemoryProviderAccessGate,R3ProjectService,SubscriptionService,ProviderSettingsService,r3ModelDescriptor } from '@codryn/core';
import type { Clock,DesktopProjectionStore,DesktopRuntimeFactory,IdGenerator,ProviderAccessGate,SecretProtector,SecretStore,OwnedCommandStore,WorkspaceStore,WorkspaceObserver,WorkspaceObservation,ModelAdapter } from '@codryn/core';
import { r3ChangeViewSchema,r3RevertInputSchema,r3RevertResultSchema,permissionDecisionInputSchema,uuidSchema } from '@codryn/shared';
import type { R3RevertInput,PermissionDecisionInput } from '@codryn/shared';
import { openDesktopDatabase } from './persistence/open-desktop-database.js';
import { SqliteChatStore } from './persistence/sqlite-chat-store.js';
import { SqliteDesktopProjectStore } from './persistence/sqlite-desktop-project-store.js';
import { SqliteDesktopRequestStore } from './persistence/sqlite-desktop-request-store.js';
import { SqliteDesktopProjectionStore } from './persistence/sqlite-desktop-projection-store.js';
import { SqliteDesktopActionStore } from './persistence/sqlite-desktop-action-store.js';
import { SqliteWorkspaceStore } from './persistence/sqlite-workspace-store.js';
import { SqliteOwnedCommandStore } from './persistence/sqlite-owned-command-store.js';
import { SqliteProviderSettingsStore } from './persistence/sqlite-provider-settings-store.js';
import { SqliteProjectBaselineStore } from './persistence/sqlite-project-baseline-store.js';
import { SqliteMutationJournal } from './persistence/sqlite-mutation-journal.js';
import { SqlitePermissionStore } from './persistence/sqlite-permission-store.js';
import { EncryptedSecretStore } from './secrets/encrypted-secret-store.js';
import { ProjectGitState } from './git/project-git-state.js';
import { FileWorkspaceObserver } from './filesystem/workspace-observer.js';
import { ContextPathPolicy } from './filesystem/context-path-policy.js';
import { recoverOwnedCommands } from './process/recover-owned-commands.js';
import { testProviderConnection } from './model/provider-connection-test.js';
import { createR2Infrastructure } from './create-r2-infrastructure.js';
import { StreamRedactor } from './logging/stream-redactor.js';
import { SystemClock } from './system/system-clock.js';
import { UuidGenerator } from './system/uuid-generator.js';
export interface R3InfrastructureResources {
  database:DatabaseSync;projects:R3ProjectService;projections:DesktopProjectionStore;providerAccess:ProviderAccessGate;
  secrets:SecretStore;settings:ProviderSettingsService;ownedCommands:OwnedCommandStore;permissionBroker:DesktopPermissionBroker;
  filesystemEffect:<T>(projectId:string,effect:()=>Promise<T>)=>Promise<T>;workspace:WorkspaceStore;observer:(projectId:string)=>Promise<WorkspaceObserver>;ids:IdGenerator;
}
const unavailableProtector:SecretProtector={available:async()=>false,encrypt:async()=>{throw new Error('R3_SECRET_UNAVAILABLE');},decrypt:async()=>{throw new Error('R3_SECRET_UNAVAILABLE');}};
export async function createR3Infrastructure(options:{userDataPath:string;runtimeFactory:(resources:R3InfrastructureResources)=>DesktopRuntimeFactory;secretProtector?:SecretProtector;clock?:Clock;ids?:IdGenerator;preflight?:(mode:'demo'|'openai',root:string)=>Promise<void>}) {
  const handle=await openDesktopDatabase(options.userDataPath),database=handle.database,clock=options.clock??new SystemClock(),ids=options.ids??new UuidGenerator();
  const observers=new Map<string,FileWorkspaceObserver>(),scans=new Map<string,Promise<WorkspaceObservation>>(),refreshes=new Map<string,Promise<void>>(),opened=new Set<string>(),locks=new Set<string>();
  const filesystemTails=new Map<string,Promise<void>>();
  const filesystemEffect=async<T>(projectId:string,effect:()=>Promise<T>):Promise<T>=>{const previous=filesystemTails.get(projectId)??Promise.resolve();let release:()=>void=()=>undefined;const done=new Promise<void>(resolve=>{release=resolve;});const tail=previous.then(()=>done);filesystemTails.set(projectId,tail);try{await previous;return await effect();}finally{release();if(filesystemTails.get(projectId)===tail)filesystemTails.delete(projectId);}};
  let periodic:ReturnType<typeof setInterval>|undefined,closed=false;
  try {
    const store=new SqliteDesktopProjectStore(database,clock),workspace=new SqliteWorkspaceStore(database),chatsStore=new SqliteChatStore(database,clock,ids),requests=new SqliteDesktopRequestStore(database,clock,ids),projections=new SqliteDesktopProjectionStore(database,clock,ids),actions=new SqliteDesktopActionStore(database),providerAccess=new InMemoryProviderAccessGate(),ownedCommands=new SqliteOwnedCommandStore(database),permissionBroker=new DesktopPermissionBroker();
    const projects=new R3ProjectService({store,ids,canonicalizeRoot:async(root,signal)=>{signal.throwIfAborted();const canonical=await realpath(root);if(!(await stat(canonical)).isDirectory())throw new Error('R3_PROJECT_UNAVAILABLE');return {root:canonical,identity:process.platform==='win32'?canonical.toLowerCase():canonical};},openWorkspace:async(identity,id)=>workspace.open(identity,id),inspectGit:(root,signal)=>{const id=database.prepare('SELECT project_id FROM desktop_projects WHERE root=?').get(root)?.project_id;return filesystemEffect(String(id??root),()=>new ProjectGitState(root).inspect(signal));}});
    const chats=new ChatService({chats:chatsStore,projects}),secrets=new EncryptedSecretStore(options.userDataPath,options.secretProtector??unavailableProtector);
    const activeJob=()=>database.prepare("SELECT 1 FROM desktop_jobs WHERE state IN ('queued','running','stopping') LIMIT 1").get()!==undefined;
    const settings=new ProviderSettingsService({secrets,settings:new SqliteProviderSettingsStore(database),access:providerAccess,assertIdle:async()=>{if(activeJob())throw new Error('R3_PROJECT_BUSY');},clock,testConnection:testProviderConnection});
    const observer=async(projectId:string):Promise<WorkspaceObserver>=>{
      if(closed)throw new Error('R3_PROJECT_BUSY');opened.add(projectId);const root=await projects.root(projectId);if(closed)throw new Error('R3_PROJECT_BUSY');
      if(!observers.has(projectId)){const policy=await ContextPathPolicy.fromProjectRoot(root);if(closed)throw new Error('R3_PROJECT_BUSY');observers.set(projectId,new FileWorkspaceObserver(root,{git:new ProjectGitState(root),contextPolicy:policy}));}
      return {inspect:async(signal)=>{if(closed)throw new Error('R3_PROJECT_BUSY');signal.throwIfAborted();let pending=scans.get(projectId);if(!pending){const scanner=observers.get(projectId);if(!scanner)throw new Error('R3_INTERNAL');pending=filesystemEffect(projectId,()=>scanner.inspect(AbortSignal.timeout(5000))).finally(()=>scans.delete(projectId));scans.set(projectId,pending);}const result=await pending;signal.throwIfAborted();return result;}};
    };
    const refresh=(projectId:string,signal:AbortSignal):Promise<void>=>{
      if(closed)return Promise.reject(new Error('R3_PROJECT_BUSY'));const previous=refreshes.get(projectId);if(previous)return previous;
      const pending=(async()=>{const project=await projects.get(projectId,signal);if(!project)throw new Error('R3_NOT_FOUND');
        if(!project.available){const current=await workspace.current(projectId);await workspace.observe(projectId,{...current,complete:false});observers.get(projectId)?.close();observers.delete(projectId);return;}
        const observation=await (await observer(projectId)).inspect(signal);if(!closed)await workspace.observe(projectId,observation);
      })().finally(()=>refreshes.delete(projectId));refreshes.set(projectId,pending);return pending;
    };
    const lease=(projectId:string)=>{if(closed||locks.has(projectId))throw new Error('R3_PROJECT_BUSY');locks.add(projectId);return ()=>locks.delete(projectId);};
    const readOnlyModel:ModelAdapter={descriptor:r3ModelDescriptor('demo'),async *stream(){throw new Error('R3_INTERNAL');yield {type:'completed'};}};
    const utility=async(projectId:string)=>createR2Infrastructure({userDataPath:options.userDataPath,projectRoot:await projects.root(projectId),database,model:readOnlyModel,workspaceStore:workspace,workspaceObserver:await observer(projectId),clock,ids});
    const journal=new SqliteMutationJournal(database,clock,ids),permissionStore=new SqlitePermissionStore(database,clock,ids);
    const recover=async()=>{
      if(activeJob()&&opened.size>0)throw new Error('R3_PROJECT_BUSY');
      actions.interruptUnfinished();await recoverOwnedCommands(ownedCommands);
      for(const project of await store.list()) {
        await requests.interruptUnfinished(project.id);
        for(const permission of await permissionStore.listPending(project.id))await permissionStore.closePending(permission.id,'expired');
        await permissionStore.expireAllowedUnclaimed(project.id);
        if((await projects.get(project.id))?.available){const runtime=await utility(project.id);try{await runtime.recover.execute(project.id,AbortSignal.timeout(10000));}finally{runtime.close();}}
      }
    };
    await recover();
    const resources:R3InfrastructureResources={database,projects,projections,providerAccess,secrets,settings,ownedCommands,permissionBroker,workspace,observer,ids,filesystemEffect};
    const manager=new DesktopRunManager({requests,chats:chatsStore,projections,projects,providerAccess,operationLease:lease,createRun:options.runtimeFactory(resources),beforeAccept:async(input)=>{
      const chat=await chatsStore.get(input.chatId);if(!chat)throw new Error('R3_NOT_FOUND');
      if((await ownedCommands.pending(chat.projectId)).length||(await journal.pending(chat.projectId)).length)throw new Error('R3_RECOVERY_REQUIRED');
      if(input.mode==='openai')await settings.ensureProjectTransmissionAllowed();
      const protectedState=await secrets.state('openai');const known=protectedState==='stored'?await secrets.read('openai'):null;
      if((known&&input.task.includes(known))||/(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD)\s*[=:]\s*\S+/i.test(input.task))throw new Error('R3_INPUT_INVALID');
      await options.preflight?.(input.mode,await projects.root(chat.projectId));await refresh(chat.projectId,AbortSignal.timeout(6000));
    }});
    const chatOwner=async(chatId:string,projectId?:string)=>{const chat=await chatsStore.get(uuidSchema.parse(chatId));if(!chat)throw new Error('R3_NOT_FOUND');if(projectId&&chat.projectId!==projectId)throw new Error('R3_CHAT_PROJECT_MISMATCH');return chat;};
    const history=async(chatId:string,before:number|null)=>{await chatOwner(chatId);const messages=await projections.messages(chatId,before),first=messages[0]?.sequence;const older=first!==undefined&&database.prepare('SELECT 1 FROM chat_messages WHERE chat_id=? AND sequence<? LIMIT 1').get(chatId,first)!==undefined;return {messages,beforeMessageSequence:older&&first!==undefined?first:null};};
    const stop=async(chatId:string,projectId:string,jobId:string)=>{await chatOwner(chatId,projectId);const job=database.prepare('SELECT chat_id FROM desktop_jobs WHERE id=?').get(uuidSchema.parse(jobId));if(!job)throw new Error('R3_NOT_FOUND');if(job.chat_id!==chatId)throw new Error('R3_CHAT_PROJECT_MISMATCH');return manager.stop(projectId,jobId);};
    const snapshot=async(chatId:string,signal:AbortSignal=AbortSignal.timeout(6000))=>{const chat=await chatOwner(chatId);await refresh(chat.projectId,signal);const result=await projections.snapshot(chatId);return {...result,project:await projects.get(chat.projectId,signal)??result.project};};
    const inspectRun=async(chatId:string,targetRequestId:string,signal:AbortSignal=AbortSignal.timeout(6000))=>{const chat=await chatOwner(chatId);await refresh(chat.projectId,signal);return projections.inspectRun(chatId,targetRequestId);};
    const subscriptions=new SubscriptionService({snapshot,updates:(...args)=>projections.updates(...args)},ids);
    const setOwner=async(chatId:string,setId:string)=>{const chat=await chatOwner(chatId),set=database.prepare('SELECT s.* FROM change_sets s JOIN desktop_jobs j ON j.run_id=s.run_id WHERE s.id=? AND j.chat_id=?').get(uuidSchema.parse(setId),chatId);if(!set){if(database.prepare('SELECT 1 FROM change_sets WHERE id=?').get(setId))throw new Error('R3_CHAT_PROJECT_MISMATCH');throw new Error('R3_NOT_FOUND');}if(set.project_id!==chat.projectId)throw new Error('R3_CHAT_PROJECT_MISMATCH');return {chat,set};};
    const safeText=async()=>{const known=await secrets.state('openai')==='stored'?[await secrets.read('openai')]:[];return (text:string)=>{const redactor=new StreamRedactor({secrets:known});const result=redactor.push('model',text)+redactor.finish('model');redactor.dispose();return result;};};
    const diff=async(chatId:string,setId:string,signal:AbortSignal)=>{
      const {chat}=await setOwner(chatId,setId);await refresh(chat.projectId,signal);const runtime=await utility(chat.projectId);
      try {const diffs=await filesystemEffect(chat.projectId,()=>runtime.changes.diff.execute(setId,signal)),entries=await journal.entries(setId),baseline=await new SqliteProjectBaselineStore(database).get(setId),safe=await safeText(),set=database.prepare('SELECT state,next_sequence FROM change_sets WHERE id=?').get(setId);if(!set)throw new Error('R3_NOT_FOUND');
        return r3ChangeViewSchema.parse({summary:{setId,entryCount:entries.length,recoveryRequired:set.state==='recovery_required'},observedSetSequence:Number(set.next_sequence)-1,workspaceRevision:(await workspace.current(chat.projectId)).revision,entries:entries.map(e=>({id:e.id,path:safe(e.path),sequence:e.sequence,kind:e.kind,reversesId:e.reversesId})),diffs:diffs.map(file=>({...file,path:safe(file.path),lines:file.lines.map(line=>({...line,text:safe(line.text)}))})),baseline:baseline.mode==='non-git'?baseline:{mode:'git',head:baseline.head,branch:baseline.branch,status:baseline.status,conflicts:baseline.conflicts}});
      }finally{runtime.close();}
    };
    const reverts=new Map<string,{digest:string;promise:Promise<ReturnType<typeof r3RevertResultSchema.parse>>}>();
    const revert=async(raw:R3RevertInput,signal:AbortSignal)=>{
      const input=r3RevertInputSchema.parse(raw),digest=createHash('sha256').update(JSON.stringify(input)).digest('hex'),same=reverts.get(input.requestId);
      if(same){if(same.digest!==digest)throw new Error('R3_REQUEST_MISMATCH');return same.promise;}
      const execute=(async()=>{const previous=await actions.get(input.requestId);if(previous){if(previous.digest!==digest)throw new Error('R3_REQUEST_MISMATCH');if(previous.result)return previous.result;throw new Error('R3_RECOVERY_REQUIRED');}
        const {chat}=await setOwner(input.chatId,input.setId),release=lease(chat.projectId);try {
        if(manager.active(chat.projectId)||database.prepare("SELECT 1 FROM desktop_jobs WHERE project_id=? AND state IN ('queued','running','stopping')").get(chat.projectId))throw new Error('R3_PROJECT_BUSY');
        if((await ownedCommands.pending(chat.projectId)).length||(await journal.pending(chat.projectId)).length)throw new Error('R3_RECOVERY_REQUIRED');
        const view=await diff(input.chatId,input.setId,signal);if(view.observedSetSequence!==input.expectedSetSequence||view.workspaceRevision!==input.expectedWorkspaceRevision)throw new Error('R3_STALE_VIEW');
        await actions.begin(input,digest);const runtime=await utility(chat.projectId);
        try {const result=r3RevertResultSchema.parse(await filesystemEffect(chat.projectId,()=>runtime.changes.revert.execute({setId:input.setId,requestId:input.requestId,...(input.entryId?{entryId:input.entryId}:{})},signal)));await actions.finish(input.requestId,result);await refresh(chat.projectId,signal);return result;}finally{runtime.close();}
      }finally{release();}})().finally(()=>reverts.delete(input.requestId));reverts.set(input.requestId,{digest,promise:execute});return execute;
    };
    const answerPermission=async(chatId:string,projectId:string,raw:PermissionDecisionInput)=>{
      const input=permissionDecisionInputSchema.parse(raw);await chatOwner(chatId,projectId);
      const row=database.prepare('SELECT p.digest,p.state,j.state AS job_state,j.chat_id,t.project_id FROM permission_requests p JOIN tool_calls t ON t.call_id=p.call_id JOIN desktop_jobs j ON j.run_id=t.run_id WHERE p.id=?').get(input.id);
      if(!row)throw new Error('R3_NOT_FOUND');if(row.chat_id!==chatId||row.project_id!==projectId)throw new Error('R3_CHAT_PROJECT_MISMATCH');
      if(row.digest!==input.digest||!['running','stopping'].includes(String(row.job_state)))return 'rejected' as const;
      if(row.state!=='pending')return (input.decision==='deny'?row.state==='denied':row.state==='allowed_once')?'duplicate' as const:'rejected' as const;
      await refresh(projectId,AbortSignal.timeout(6000));return permissionBroker.answer(input.id,input.digest,input.decision);
    };
    periodic=setInterval(()=>{for(const project of opened)void refresh(project,AbortSignal.timeout(6000)).catch(()=>undefined);},1000);periodic.unref();
    const shutdown=async(signal:AbortSignal)=>{providerAccess.beginShutdown();if(periodic)clearInterval(periodic);const result=await manager.shutdown(signal);while((!providerAccess.idle()||refreshes.size||scans.size||filesystemTails.size||reverts.size)&&!signal.aborted)await new Promise(resolve=>setTimeout(resolve,25));return {stopped:!signal.aborted&&result.stopped&&providerAccess.idle()&&(await ownedCommands.pending()).length===0&&reverts.size===0&&refreshes.size===0&&scans.size===0&&filesystemTails.size===0};};
    return {projects,chats,requests,projections,manager,subscriptions,settings,resources,recover,snapshot,history,stop,inspectRun,diff,revert,answerPermission,shutdown,
      activity:(chatId:string,target:string,before:number|null)=>projections.activity(chatId,target,before),output:(chatId:string,callId:string,after:number|null)=>projections.output(chatId,callId,after),
      close:()=>{if(activeJob()||!providerAccess.idle()||reverts.size)throw new Error('R3_PROJECT_BUSY');closed=true;if(periodic)clearInterval(periodic);subscriptions.close();for(const scanner of observers.values())scanner.close();handle.close();}
    };
  }catch(error){if(periodic)clearInterval(periodic);for(const scanner of observers.values())scanner.close();handle.close();throw error;}
}
export type R3Infrastructure=Awaited<ReturnType<typeof createR3Infrastructure>>;
