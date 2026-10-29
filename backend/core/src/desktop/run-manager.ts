import { r3ErrorCodeSchema, r3SubmitInputSchema } from '@codryn/shared';
import type { R3Accepted,R3RunView,R3SubmitInput,Uuid } from '@codryn/shared';
import type { ChatStore,DesktopProjectionStore,DesktopRequestStore,DesktopRuntimeFactory } from './ports.js';
import type { R3ProjectService } from './project-service.js';
import type { ProviderAccessGate } from '../secrets/ports.js';
import { r3ModelDescriptor } from './model-catalog.js';
interface Active {view:R3RunView;controller:AbortController;done:Promise<void>}
function sameInput(a:R3SubmitInput,b:R3SubmitInput):boolean{return a.chatId===b.chatId&&a.task===b.task&&a.maxSteps===b.maxSteps&&a.mode===b.mode&&a.retryOfRequestId===b.retryOfRequestId;}
export class DesktopRunManager {
  private readonly running=new Map<Uuid,Active>();private readonly jobs=new Map<Uuid,Promise<void>>();private closing=false;
  constructor(private readonly dependencies:{requests:DesktopRequestStore;chats:ChatStore;projections:DesktopProjectionStore;projects:R3ProjectService;createRun:DesktopRuntimeFactory;providerAccess:ProviderAccessGate;beforeAccept?:(input:R3SubmitInput)=>Promise<void>;operationLease?:(projectId:Uuid)=>()=>void}){}
  async submit(raw:R3SubmitInput):Promise<R3Accepted>{
    if(this.closing)throw new Error('R3_PROJECT_BUSY');const parsed=r3SubmitInputSchema.safeParse(raw);if(!parsed.success)throw new Error('R3_INPUT_INVALID');const input=parsed.data;
    const previous=await this.dependencies.requests.getByRequestId(input.requestId);if(previous){if(!sameInput(previous.input,input))throw new Error('R3_REQUEST_MISMATCH');return {...previous.accepted,duplicate:true};}
    const chat=await this.dependencies.chats.get(input.chatId);if(!chat)throw new Error('R3_NOT_FOUND');if(chat.archived)throw new Error('R3_INPUT_INVALID');const releaseOperation=this.dependencies.operationLease?.(chat.projectId)??(()=>undefined);try{const project=await this.dependencies.projects.get(chat.projectId);if(!project?.available)throw new Error('R3_PROJECT_UNAVAILABLE');
    const release=await this.dependencies.providerAccess.acquireRunLease();let accepted:R3Accepted;
    try{await this.dependencies.beforeAccept?.(input);if(this.closing)throw new Error('R3_PROJECT_BUSY');accepted=await this.dependencies.requests.accept(input,chat.projectId,r3ModelDescriptor(input.mode));if(accepted.duplicate){release();return accepted;}}
    catch(error){release();throw error;}
    const view=await this.dependencies.requests.get(accepted.jobId);if(!view){release();throw new Error('R3_INTERNAL');}
    const controller=new AbortController();const active:Active={view,controller,done:Promise.resolve()};this.running.set(chat.projectId,active);
    active.done=Promise.resolve().then(async()=>{
      let runtime:Awaited<ReturnType<DesktopRuntimeFactory>>|undefined;
      try{
        if(controller.signal.aborted){await this.dependencies.requests.setState(accepted.jobId,'interrupted');return;}
        runtime=await this.dependencies.createRun({projectId:chat.projectId,request:input,signal:controller.signal,onRunCreated:async runId=>{await this.dependencies.requests.attachRun(input.requestId,runId);const linked=await this.dependencies.requests.get(accepted.jobId);if(linked)active.view=linked;}});
        const result=await runtime.execute();await this.dependencies.requests.finish(accepted.jobId,result);
      }catch(error){
        const parsed=r3ErrorCodeSchema.safeParse(error instanceof Error?error.message:undefined);
        await this.dependencies.requests.setState(accepted.jobId,'interrupted',controller.signal.aborted
          ? {code:'R1_CANCELLED',message:'Běh byl zastaven.'}
          : {code:parsed.success?parsed.data:'R3_INTERNAL',message:'Běh se nepodařilo spustit nebo dokončit.'});
      }
      finally{runtime?.close();release();this.running.delete(chat.projectId);this.jobs.delete(accepted.jobId);}
    });
    this.jobs.set(accepted.jobId,active.done);return accepted;}finally{releaseOperation();}
  }
  async stop(projectId:Uuid,jobId:Uuid):Promise<'requested'|'already_terminal'>{const record=await this.dependencies.requests.getByRequestId((await this.dependencies.requests.get(jobId))?.requestId??jobId);if(!record)throw new Error('R3_NOT_FOUND');if(record.projectId!==projectId)throw new Error('R3_CHAT_PROJECT_MISMATCH');if(['finished','interrupted'].includes(record.view.state))return 'already_terminal';const active=this.running.get(projectId);if(!active||active.view.jobId!==jobId)throw new Error('R3_RECOVERY_REQUIRED');await this.dependencies.requests.setState(jobId,'stopping');active.view={...active.view,state:'stopping'};active.controller.abort();return 'requested';}
  async wait(jobId:Uuid):Promise<R3RunView>{await this.jobs.get(jobId);const view=await this.dependencies.requests.get(jobId);if(!view)throw new Error('R3_NOT_FOUND');return view;}
  active(projectId:Uuid):R3RunView|null{return this.running.get(projectId)?.view??null;}
  async shutdown(signal:AbortSignal):Promise<{stopped:boolean}>{this.closing=true;for(const [project,active]of this.running)await this.stop(project,active.view.jobId);await Promise.race([Promise.allSettled([...this.running.values()].map(active=>active.done)),new Promise<void>(resolve=>{if(signal.aborted)resolve();else signal.addEventListener('abort',()=>resolve(),{once:true});})]);return {stopped:this.running.size===0};}
}
