import { r3IpcRequestSchema,r3ResponseSchemas,r3ErrorCodeSchema } from '@codryn/shared';
import type { R3IpcResponse,R3ErrorCode } from '@codryn/shared';
import type { R3Infrastructure } from '@codryn/infrastructure';
export interface R3Sender {readonly id:number;readonly mainFrame:{readonly url:string};isDestroyed():boolean;send(channel:string,value:unknown):void}
export interface R3SenderEvent {readonly sender:R3Sender;readonly senderFrame:{readonly url:string}|null}
export type R3Services=Pick<R3Infrastructure,'projects'|'chats'|'manager'|'snapshot'|'history'|'inspectRun'|'activity'|'diff'|'revert'|'output'|'answerPermission'|'settings'|'stop'>;
export function assertR3Sender(event:{sender:Pick<R3Sender,'id'|'isDestroyed'>;senderFrame:{url:string}|null},main:Pick<R3Sender,'id'|'mainFrame'|'isDestroyed'>,entry:string):void {
  if(main.isDestroyed()||event.sender.isDestroyed()||event.sender.id!==main.id||event.senderFrame!==main.mainFrame||event.senderFrame.url!==new URL(entry).href)throw new Error('R3_SENDER_REJECTED');
}
const messages:Record<R3ErrorCode,string>={R3_INPUT_INVALID:'Požadavek je neplatný. Demo vyžaduje referenční projekt sum.mjs a sum.test.mjs.',R3_NOT_FOUND:'Požadovaná položka nebyla nalezena.',R3_CHAT_PROJECT_MISMATCH:'Položka nepatří k vybranému chatu nebo projektu.',R3_PROJECT_BUSY:'Probíhá běh nebo jiná operace. Nejprve jej dokončete nebo zastavte.',R3_RECOVERY_REQUIRED:'Nejistá operace vyžaduje bezpečnou obnovu. Nic se automaticky neopakuje.',R3_SECRET_UNAVAILABLE:'Chráněný klíč není dostupný. Zkontrolujte nastavení.',R3_CONSENT_REQUIRED:'Před odesláním projektových dat potvrďte aktuální upozornění v nastavení.',R3_RUNTIME_UNAVAILABLE:'Referenční kontrola vyžaduje systémový Node 24.19.0.',R3_PROJECT_UNAVAILABLE:'Složka projektu není dostupná. Historie zůstává zachována.',R3_STALE_VIEW:'Projekt nebo sada se změnily. Načtěte nový detail a znovu potvrďte rozsah.',R3_REQUEST_MISMATCH:'Stejné ID požadavku už označuje jiný obsah.',R3_SENDER_REJECTED:'Tento zdroj nemá přístup k desktopovým službám.',R3_INTERNAL:'Operaci se nepodařilo dokončit. Data se automaticky nemažou.'};
export function r3SafeError(error:unknown):R3IpcResponse {
  const parsed=r3ErrorCodeSchema.safeParse(error instanceof Error?error.message:undefined),code=parsed.success?parsed.data:'R3_INTERNAL';return {ok:false,error:{code,message:messages[code]}};
}
export function createR3Handler(dependencies:{services:R3Services;assertSender:(event:R3SenderEvent)=>void;chooseDirectory:()=>Promise<string|null>;subscriptions:{attach(event:R3SenderEvent,chatId:string,afterCursor:number):Promise<unknown>;detach(event:R3SenderEvent,id:string):void}}) {
  return async(event:R3SenderEvent,raw:unknown):Promise<R3IpcResponse>=>{
    try{
      dependencies.assertSender(event);const parsed=r3IpcRequestSchema.safeParse(raw);if(!parsed.success)throw new Error('R3_INPUT_INVALID');const request=parsed.data,services=dependencies.services,signal=AbortSignal.timeout(10000);let value:unknown;
      switch(request.operation){
        case 'project.open':{const root=await dependencies.chooseDirectory();value=root===null?{cancelled:true}:await services.projects.open(root,AbortSignal.timeout(10000));break;}
        case 'project.list':value=await services.projects.list();break;
        case 'chat.create':value=await services.chats.create(request.projectId,request.title);break;
        case 'chat.list':value=await services.chats.list(request.projectId,request.archived);break;
        case 'chat.rename':value=await services.chats.rename(request.projectId,request.chatId,request.title);break;
        case 'chat.archive':await services.chats.archive(request.projectId,request.chatId);value={archived:true};break;
        case 'chat.snapshot':value=await services.snapshot(request.chatId,signal);break;
        case 'chat.history':value=await services.history(request.chatId,request.beforeSequence);break;
        case 'run.submit':{const {operation,...input}=request;void operation;value=await services.manager.submit(input);break;}
        case 'run.stop':value={status:await services.stop(request.chatId,request.projectId,request.jobId)};break;
        case 'run.inspect':value=await services.inspectRun(request.chatId,request.targetRequestId,signal);break;
        case 'run.activity':value=await services.activity(request.chatId,request.targetRequestId,request.beforeSequence);break;
        case 'permission.answer':value={status:await services.answerPermission(request.chatId,request.projectId,request.decision)};break;
        case 'changes.diff':value=await services.diff(request.chatId,request.setId,signal);break;
        case 'changes.revert':{const {operation,...input}=request;void operation;value=await services.revert(input,signal);break;}
        case 'command.output':value=await services.output(request.chatId,request.callId,request.afterSequence);break;
        case 'settings.get':value=await services.settings.get();break;
        case 'settings.saveKey':await services.settings.saveKey(request.key);value=await services.settings.get();break;
        case 'settings.removeKey':await services.settings.removeKey();value=await services.settings.get();break;
        case 'settings.testKey':value=await services.settings.testKey(signal);break;
        case 'settings.select':await services.settings.select(request.mode,request.maxSteps);value=await services.settings.get();break;
        case 'settings.consent':await services.settings.confirmDataPolicy(request.version);value=await services.settings.get();break;
        case 'stream.attach':value=await dependencies.subscriptions.attach(event,request.chatId,request.afterCursor);break;
        case 'stream.detach':dependencies.subscriptions.detach(event,request.subscriptionId);value={detached:true};break;
      }
      return r3ResponseSchemas[request.operation].parse({ok:true,value});
    }catch(error){return r3SafeError(error);}
  };
}
