import { StringDecoder } from 'node:string_decoder';
import { StreamBatcher,type DesktopRuntimeFactory,type ModelAdapter } from '@codryn/core';
import type { ModelStreamEvent } from '@codryn/shared';
import type { R3InfrastructureResources } from '../create-r3-infrastructure.js';
import { createR2Infrastructure } from '../create-r2-infrastructure.js';
import { StreamRedactor } from '../logging/stream-redactor.js';
import { createR3Provider } from './r3-provider-factory.js';
import { safeProviderError } from './provider-connection-test.js';
export function createDesktopRuntimeFactory(options:R3InfrastructureResources&{userDataPath:string;nodeExecutable:string|null;providerFactory?:typeof createR3Provider}):DesktopRuntimeFactory {
  return async input=>{
    const root=await options.projects.root(input.projectId),abort=new AbortController(),signal=AbortSignal.any([input.signal,abort.signal]);
    const keys:string[]=[];
    if(await options.secrets.state('openai')==='stored')keys.push(await options.secrets.read('openai'));
    const safe=(text:string)=>{const redact=new StreamRedactor({secrets:keys});const result=redact.push('model',text)+redact.finish('model');redact.dispose();return result;};
    const provider=await (options.providerFactory??createR3Provider)({mode:input.request.mode,secrets:options.secrets,ids:options.ids,projectRoot:root,nodeExecutable:options.nodeExecutable});
    const streams=new Map<number,{redactor:StreamRedactor;batcher:StreamBatcher;sealed:boolean}>();
    const getStream=(step:number)=>{
      let value=streams.get(step);if(!value){value={redactor:new StreamRedactor({secrets:keys}),sealed:false,batcher:new StreamBatcher({flushBytes:4096,flushMs:50,write:(sequence,text)=>options.projections.appendAssistant(input.request.requestId,step,sequence,text),onError:()=>abort.abort()})};streams.set(step,value);}return value;
    };
    let usageKnown=true,inputTokens=0,outputTokens=0;
    const model:ModelAdapter={descriptor:provider.model.descriptor,async *stream(request,runSignal){
      let usage:Extract<ModelStreamEvent,{type:'usage'}>|undefined;
      try{
        for await(const event of provider.model.stream(request,runSignal)){
          if(event.type==='usage')usage=event;
          yield event;
        }
      }catch(error){await options.projections.setProviderError(input.request.requestId,safeProviderError(error));throw error;}
      finally{
        if(!usage)usageKnown=false;
        if(usage&&Number.isSafeInteger(usage.inputTokens)&&Number.isSafeInteger(usage.outputTokens)&&usage.inputTokens>=0&&usage.outputTokens>=0){inputTokens+=usage.inputTokens;outputTokens+=usage.outputTokens;}
        else if(usage)usageKnown=false;
        if(usageKnown)await options.projections.setUsage(input.request.requestId,{inputTokens,outputTokens});
        else options.database.prepare('UPDATE desktop_jobs SET usage_json=NULL WHERE request_id=?').run(input.request.requestId);
      }
    }};
    const output=new Map<string,{redactor:StreamRedactor;stdout:StringDecoder;stderr:StringDecoder;stdoutBatch:StreamBatcher;stderrBatch:StreamBatcher}>(),permissionIds=new Set<string>();
    const commandStream=(callId:string)=>{
      let stream=output.get(callId);if(!stream){const make=(channel:'stdout'|'stderr')=>new StreamBatcher({flushBytes:4096,flushMs:50,write:(_sequence,text)=>options.projections.appendOutput(input.request.requestId,callId,channel,text,false),onError:()=>abort.abort()});stream={redactor:new StreamRedactor({secrets:keys}),stdout:new StringDecoder('utf8'),stderr:new StringDecoder('utf8'),stdoutBatch:make('stdout'),stderrBatch:make('stderr')};output.set(callId,stream);}return stream;
    };
    let runtime:Awaited<ReturnType<typeof createR2Infrastructure>>;
    try {
      runtime=await createR2Infrastructure({userDataPath:options.userDataPath,projectRoot:root,database:options.database,model,workspaceObserver:await options.observer(input.projectId),workspaceStore:options.workspace,allowReadOnlyCompletion:true,onRunCreated:input.onRunCreated,
        trustedVerificationExecutable:options.nodeExecutable??'__unavailable_node__',filesystemEffect:effect=>options.filesystemEffect(input.projectId,effect),safeModelText:safe,safeToolInput:args=>!keys.some(key=>JSON.stringify(args).includes(key)),
        onModelEvent:async({step,event})=>{if(event.type==='text_delta'){const stream=getStream(step);await stream.batcher.push(stream.redactor.push('model',event.text));}},
        onModelTurnCompleted:async({step})=>{const stream=streams.get(step);if(stream){await stream.batcher.push(stream.redactor.finish('model'));await stream.batcher.close('complete');await options.projections.sealAssistant(input.request.requestId,step,'complete');stream.sealed=true;}},
        permissionResponder:permission=>{permissionIds.add(permission.id);return options.permissionBroker.wait(permission.id,permission.digest,signal);},
        commandHooks:{owned:(actor,evidence)=>options.ownedCommands.recordOwned(actor,evidence),output:(actor,chunk)=>{const stream=commandStream(actor.callId),decoder=chunk.stream==='stdout'?stream.stdout:stream.stderr,batcher=chunk.stream==='stdout'?stream.stdoutBatch:stream.stderrBatch;void batcher.push(stream.redactor.push(chunk.stream,decoder.write(Buffer.from(chunk.bytes)))).catch(()=>abort.abort());},result:async(actor,result)=>{
          const stream=commandStream(actor.callId);
          for(const channel of ['stdout','stderr'] as const){const decoder=channel==='stdout'?stream.stdout:stream.stderr,batcher=channel==='stdout'?stream.stdoutBatch:stream.stderrBatch;await batcher.push(stream.redactor.push(channel,decoder.end())+stream.redactor.finish(channel));await batcher.close('complete');}
          await options.ownedCommands.recordResult(actor,result);
          return {...result,stdout:safe(result.stdout),stderr:safe(result.stderr)};
        }}
      });
    }catch(error){provider.dispose();keys.splice(0);throw error;}
    return {execute:async()=>{
      try{return await runtime.agentLoop.executeR2({requestId:input.request.requestId,projectRoot:root,task:input.request.task,maxSteps:input.request.maxSteps,contextReferences:[]},signal);}
      finally{
        for(const [step,stream] of streams)if(!stream.sealed){try{await stream.batcher.push(stream.redactor.finish('model'));await stream.batcher.close('interrupted');}catch{abort.abort();}await options.projections.sealAssistant(input.request.requestId,step,'interrupted');}
      }
    },close(){runtime.close();provider.dispose();keys.splice(0);for(const stream of streams.values())stream.redactor.dispose();for(const stream of output.values())stream.redactor.dispose();for(const id of permissionIds)options.permissionBroker.release(id);}};
  };
}
