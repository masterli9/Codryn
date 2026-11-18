import { randomUUID,createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect,it } from 'vitest';
import { r3ModelDescriptor,type ModelAdapter } from '@codryn/core';
import { createR2Project } from '@codryn/test-support';
import type { ModelRequest } from '@codryn/shared';
import { createR3Infrastructure } from '../src/create-r3-infrastructure.js';
import { createDesktopRuntimeFactory } from '../src/model/r3-runtime-factory.js';
import { searchReferences } from '../src/context/reference-search.js';
const marker='OLD_MODEL_TURN_CANARY';

it('omits newly ignored reference and old read/search history before the next model call without replay',async()=>{
  const fixture=await createR2Project('non-git'),requests:ModelRequest[]=[];
  const model:ModelAdapter={descriptor:r3ModelDescriptor('demo'),async *stream(request){
    requests.push(request);
    if(requests.length===1){
      yield {type:'text_delta',text:marker};
      yield {type:'tool_call',call:{callId:randomUUID(),toolId:'file.read',toolVersion:1,arguments:{path:'note.ts'}}};
      yield {type:'tool_call',call:{callId:randomUUID(),toolId:'text.search',toolVersion:1,arguments:{query:marker}}};
    }else if(requests.length===2){
      expect(JSON.stringify(request.previousToolResults)).toContain(marker);
      await writeFile(join(fixture.root,'.codrynignore'),'note.ts\n');
      yield {type:'tool_call',call:{callId:randomUUID(),toolId:'file.read',toolVersion:1,arguments:{path:'other.txt'}}};
    }else{
      expect(JSON.stringify(request)).not.toContain(marker);
      if(requests.length===3)yield {type:'tool_call',call:{callId:randomUUID(),toolId:'file.read',toolVersion:1,arguments:{path:'other.txt'}}};
      else yield {type:'text_delta',text:'Current permitted sources checked.'};
    }
    yield {type:'completed'};
  }};
  const host=await createR3Infrastructure({userDataPath:fixture.userData,runtimeFactory:resources=>createDesktopRuntimeFactory({...resources,userDataPath:fixture.userData,nodeExecutable:process.execPath,providerFactory:async()=>({model,dispose(){}})})});
  try{
    await writeFile(join(fixture.root,'note.ts'),marker);await writeFile(join(fixture.root,'other.txt'),'other');
    const project=await host.projects.open(fixture.root,AbortSignal.timeout(10000)),chat=await host.chats.create(project.id,'Fresh turns');
    const reference=(await searchReferences(fixture.root,{query:'note.ts'},AbortSignal.timeout(5000))).items[0];if(!reference)throw new Error('Missing reference.');
    const accepted=await host.manager.submit({requestId:randomUUID(),chatId:chat.id,mode:'demo',maxSteps:8,task:'Inspect current note.',references:[reference]});
    expect((await host.manager.wait(accepted.jobId)).result?.status).toBe('completed');
    expect(requests).toHaveLength(4);
    expect(requests[2]?.history?.filter(turn=>turn.kind==='tool')).toHaveLength(3);
    expect(host.resources.database.prepare("SELECT COUNT(*) AS n FROM tool_calls").get()?.n).toBe(4);
    expect(host.resources.database.prepare("SELECT COUNT(*) AS n FROM events WHERE event_type='context.refreshed'").get()?.n).toBe(3);
  }finally{await host.shutdown(AbortSignal.timeout(10000));host.close();await fixture.close();}
},45000);

for(const change of ['external','own-patch'] as const)it(`does not resend a selected old excerpt after ${change}`,async()=>{
  const fixture=await createR2Project('non-git'),requests:ModelRequest[]=[];
  const initial=`export const value = '${marker}';\n`,current="export const value = 'CURRENT';\n";
  const model:ModelAdapter={descriptor:r3ModelDescriptor('demo'),async *stream(request){
    requests.push(request);
    if(requests.length===1){
      yield {type:'text_delta',text:marker};
      if(change==='external'){
        await writeFile(join(fixture.root,'note.ts'),current);
        yield {type:'tool_call',call:{callId:randomUUID(),toolId:'file.read',toolVersion:1,arguments:{path:'note.ts'}}};
      }else yield {type:'tool_call',call:{callId:randomUUID(),toolId:'file.patch',toolVersion:1,arguments:{
        path:'note.ts',expectedHash:createHash('sha256').update(initial).digest('hex'),edits:[{oldText:initial,newText:current}]
      }}};
    }else{
      expect(JSON.stringify(request)).not.toContain(marker);
      expect(request.previousToolResults[0]).toMatchObject({ok:true});
      if(change==='external')expect(JSON.stringify(request.previousToolResults)).toContain('CURRENT');
      yield {type:'text_delta',text:'Continued using current state.'};
    }
    yield {type:'completed'};
  }};
  const host=await createR3Infrastructure({userDataPath:fixture.userData,runtimeFactory:resources=>createDesktopRuntimeFactory({...resources,userDataPath:fixture.userData,nodeExecutable:process.execPath,providerFactory:async()=>({model,dispose(){}})})});
  try{
    await writeFile(join(fixture.root,'note.ts'),initial);
    const project=await host.projects.open(fixture.root,AbortSignal.timeout(10000)),chat=await host.chats.create(project.id,'Changed reference');
    const reference=(await searchReferences(fixture.root,{query:'note.ts'},AbortSignal.timeout(5000))).items[0];if(!reference)throw new Error('Missing reference.');
    const accepted=await host.manager.submit({requestId:randomUUID(),chatId:chat.id,mode:'demo',maxSteps:8,task:'Inspect current note.',references:[reference]});
    const done=await host.manager.wait(accepted.jobId);
    expect(requests).toHaveLength(2);
    expect(done.result?.status).toBe(change==='external'?'completed':'failed');
    expect(done.result?.recoveryRequired).toBe(false);
  }finally{await host.shutdown(AbortSignal.timeout(10000));host.close();await fixture.close();}
},45000);

it('consumes an explicit ignored-file permit only for the first assembly and removes its quoted text afterwards',async()=>{
  const fixture=await createR2Project('non-git'),requests:ModelRequest[]=[];
  const model:ModelAdapter={descriptor:r3ModelDescriptor('demo'),async *stream(request){
    requests.push(request);
    if(requests.length===1){
      expect(JSON.stringify(request.context)).toContain(marker);
      yield {type:'text_delta',text:marker};
      yield {type:'tool_call',call:{callId:randomUUID(),toolId:'file.read',toolVersion:1,arguments:{path:'other.txt'}}};
    }else{
      expect(JSON.stringify(request)).not.toContain(marker);
      yield {type:'text_delta',text:'The one-time source is no longer included.'};
    }
    yield {type:'completed'};
  }};
  const host=await createR3Infrastructure({userDataPath:fixture.userData,runtimeFactory:resources=>createDesktopRuntimeFactory({...resources,userDataPath:fixture.userData,nodeExecutable:process.execPath,providerFactory:async()=>({model,dispose(){}})})});
  try{
    await writeFile(join(fixture.root,'private.txt'),marker);await writeFile(join(fixture.root,'other.txt'),'other');await writeFile(join(fixture.root,'.codrynignore'),'private.txt\n');
    const project=await host.projects.open(fixture.root,AbortSignal.timeout(10000)),chat=await host.chats.create(project.id,'One-time reference'),requestId=randomUUID();
    const reference=await host.referencePermit(project.id,chat.id,requestId,{path:'private.txt',kind:'ignored'},AbortSignal.timeout(5000));
    const accepted=await host.manager.submit({requestId,chatId:chat.id,mode:'demo',maxSteps:8,task:'Inspect the authorized excerpt.',references:[reference]});
    const done=await host.manager.wait(accepted.jobId);
    expect(done.result?.status,JSON.stringify(requests.map(request=>({context:request.context,history:request.history})))).toBe('completed');
    expect(requests).toHaveLength(2);
  }finally{await host.shutdown(AbortSignal.timeout(10000));host.close();await fixture.close();}
},45000);
