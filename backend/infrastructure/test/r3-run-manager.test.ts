import { randomUUID } from 'node:crypto';
import { mkdtemp,rm,realpath,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect,it } from 'vitest';
import { createR3Infrastructure } from '../src/create-r3-infrastructure.js';
import { createR2Infrastructure } from '../src/create-r2-infrastructure.js';
import type { DesktopRuntimeFactory,ModelAdapter } from '@codryn/core';
import type { DatabaseSync } from 'node:sqlite';
import type { R3SubmitInput } from '@codryn/shared';
const descriptor={adapterId:'scripted-fake',modelId:'r3-demo-reference',capabilities:{streaming:'supported',toolCalling:'supported',structuredOutput:'unsupported',imageInput:'unsupported',usageMetadata:'unknown',contextLimit:'unknown',compaction:'unsupported'}} as const;
it('deduplicates active requests, isolates projects on one DB and completes read-only without verified',async()=>{
  const root=await mkdtemp(join(tmpdir(),'codryn-r3-manager-')),profile=join(root,'profile'),project=join(root,'project'),other=join(root,'other');
  const {mkdir}=await import('node:fs/promises');await mkdir(project);await mkdir(other);await writeFile(join(project,'README.md'),'ordinary folder');
  let release:()=>void=()=>undefined;const barrier=new Promise<void>(resolve=>{release=resolve;});let modelCalls=0,shared:DatabaseSync|undefined;
  const factory=(resources:Parameters<Parameters<typeof createR3Infrastructure>[0]['runtimeFactory']>[0]):DesktopRuntimeFactory=>async input=>{
    shared=resources.database;const model:ModelAdapter={descriptor,async *stream(){modelCalls++;await barrier;yield {type:'text_delta',text:'Read-only answer'};yield {type:'completed'};}};
    const runtime=await createR2Infrastructure({userDataPath:profile,projectRoot:await resources.projects.root(input.projectId),database:resources.database,model,allowReadOnlyCompletion:true,onRunCreated:input.onRunCreated});
    return {execute:()=>runtime.agentLoop.executeR2({requestId:input.request.requestId,projectRoot:project,task:input.request.task,maxSteps:input.request.maxSteps,contextReferences:[]},input.signal),close:()=>runtime.close()};
  };
  const host=await createR3Infrastructure({userDataPath:profile,runtimeFactory:factory});
  try{
    const p=await host.projects.open(project,new AbortController().signal),alias=await host.projects.open(await realpath(project),new AbortController().signal);expect(alias.id).toBe(p.id);
    const chat=await host.chats.create(p.id,'Chat');const input:R3SubmitInput={requestId:randomUUID(),chatId:chat.id,task:'Explain',maxSteps:16,mode:'demo'};
    const accepted=await host.manager.submit(input);expect(await host.manager.submit(input)).toEqual({...accepted,duplicate:true});
    await expect(host.manager.submit({...input,requestId:randomUUID()})).rejects.toThrow('R3_PROJECT_BUSY');
    await expect(host.manager.submit({...input,task:'Changed'})).rejects.toThrow('R3_REQUEST_MISMATCH');
    const p2=await host.projects.open(other,new AbortController().signal),chat2=await host.chats.create(p2.id,'Chat');const second=await host.manager.submit({...input,requestId:randomUUID(),chatId:chat2.id});
    release();expect((await host.manager.wait(accepted.jobId)).result).toMatchObject({status:'completed',verification:{status:'unverified',reason:'R3_READ_ONLY_RESULT'}});
    expect((await host.manager.wait(second.jobId)).result?.status).toBe('completed');expect(shared?.isOpen).toBe(true);expect(modelCalls).toBe(2);
    expect(shared?.prepare('SELECT count(*) AS n FROM agent_runs').get()?.n).toBe(2);
  }finally{release();await host.manager.shutdown(new AbortController().signal);host.close();await rm(root,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
});
