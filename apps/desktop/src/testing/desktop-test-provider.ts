import { createHash,randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { r3ModelDescriptor } from '@codryn/core';
import { ScriptedModelAdapter,changeVerifyReturnScenario } from '@codryn/infrastructure';
import type { createR3Provider } from '@codryn/infrastructure';
import type { ModelStreamEvent } from '@codryn/shared';
export type DesktopTestScenario='stream'|'two-patches'|'interrupted-model';
// Main-only, fixed fixtures. No renderer hook, arbitrary code or paid provider is accepted.
export function desktopTestProvider(scenario:DesktopTestScenario):typeof createR3Provider {
  return async options=>{
    if(options.mode!=='demo')throw new Error('R3_INPUT_INVALID');const descriptor=r3ModelDescriptor('demo');
    if(scenario==='two-patches'){
      const original=await readFile(join(options.projectRoot,'sum.mjs'),'utf8'),other=await readFile(join(options.projectRoot,'other.ts'),'utf8'),reference=changeVerifyReturnScenario({projectRoot:options.projectRoot,originalContent:original,expectedHash:createHash('sha256').update(original).digest('hex'),runtimeExecutable:options.nodeExecutable??'',callIds:{search:randomUUID(),read:randomUUID(),patch:randomUUID(),command:randomUUID()}});
      const extra:{events:ModelStreamEvent[];assertRequest:()=>void}={assertRequest:()=>undefined,events:[{type:'tool_call',call:{callId:randomUUID(),toolId:'file.patch',toolVersion:1,arguments:{path:'other.ts',expectedHash:createHash('sha256').update(other).digest('hex'),edits:[{oldText:other,newText:other.replace('1','2')}]}}},{type:'completed'}]};
      const steps=[...reference.steps.slice(0,3),extra,...reference.steps.slice(3).map(step=>({...step,assertRequest:()=>undefined}))],scripted=new ScriptedModelAdapter({id:'desktop-two-patches',steps});return {model:{descriptor,stream:(request,signal)=>scripted.stream(request,signal)},dispose(){}};
    }
    const marker=await options.secrets.state('openai')==='stored'?await options.secrets.read('openai'):'synthetic-no-key';let turn=0;
    return {model:{descriptor,async *stream(_request,signal){
      if(turn++===0){yield {type:'text_delta',text:'Potvrzený průběžný text. '+marker.slice(0,8)};yield {type:'text_delta',text:marker.slice(8)+' Konec zprávy. '};
        if(scenario==='interrupted-model'){await new Promise<void>(resolve=>{if(signal.aborted)resolve();else signal.addEventListener('abort',()=>resolve(),{once:true});});return;}
        yield {type:'tool_call',call:{callId:randomUUID(),toolId:'command.run',toolVersion:1,arguments:{command:{executable:options.nodeExecutable??'',args:['stream-child.mjs'],cwd:options.projectRoot,timeoutMs:10000,maxOutputBytes:256*1024},reason:'Test skutečného proudu a zastavení fixture.',impact:'Spustí pouze testem vlastněný proces ve fixture.'}}};
      }else yield {type:'text_delta',text:'Výsledek '+marker};yield {type:'completed'};
    }},dispose(){}};
  };
}
