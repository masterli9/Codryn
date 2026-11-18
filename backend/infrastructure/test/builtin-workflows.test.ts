import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { r3ModelDescriptor, type ModelAdapter } from '@codryn/core';
import { createR2Project } from '@codryn/test-support';
import { createR3Infrastructure } from '../src/create-r3-infrastructure.js';
import { createDesktopRuntimeFactory } from '../src/model/r3-runtime-factory.js';
import { builtinCatalog } from '../src/extensions/builtin-catalog.js';

for(const mode of ['git','non-git'] as const)for(const workflow of ['planning@1.0.0','verification@1.0.0'] as const){
  it(`runs curated ${workflow} through the existing harness in ${mode}`,async()=>{
    const fixture=await createR2Project(mode);
    await writeFile(join(fixture.root,'sum.mjs'),(await readFile(join(fixture.root,'sum.mjs'),'utf8')).replace('a - b','a + b'));
    let count=0;
    const model:ModelAdapter={descriptor:r3ModelDescriptor('demo'),async *stream(request){
      expect(request.workflowInstructions?.length).toBeGreaterThan(30);
      expect(request.tools.some(tool=>tool.toolId==='file.patch')).toBe(false);
      expect(request.tools.some(tool=>tool.toolId==='command.run')).toBe(workflow.startsWith('verification'));
      if(count++===0)yield {type:'tool_call',call:{callId:randomUUID(),toolVersion:1,
        ...(workflow.startsWith('planning')?{toolId:'file.read',arguments:{path:'sum.mjs'}}:{toolId:'command.run',arguments:{
          command:{executable:process.execPath,args:['--test','sum.test.mjs'],cwd:fixture.root,timeoutMs:30000,maxOutputBytes:256*1024},
          reason:'Verify the current change.',impact:'Runs the existing fixture test.'
        }})
      }};
      else yield {type:'text_delta',text:'Relevant files checked. Plan and verification result are available.'};
      yield {type:'completed'};
    }};
    const host=await createR3Infrastructure({userDataPath:fixture.userData,runtimeFactory:resources=>createDesktopRuntimeFactory({...resources,userDataPath:fixture.userData,nodeExecutable:process.execPath,providerFactory:async()=>({model,dispose(){}})})});
    try{
      expect(builtinCatalog().map(item=>item.kind).sort()).toEqual(['plugin','skill']);
      const project=await host.projects.open(fixture.root,AbortSignal.timeout(10000)),chat=await host.chats.create(project.id,'Workflow');
      const accepted=await host.manager.submit({requestId:randomUUID(),chatId:chat.id,mode:'demo',maxSteps:8,task:'Check this change.',workflow});
      if(workflow.startsWith('verification')){
        let pending=await host.snapshot(chat.id);
        for(let n=0;n<100&&!pending.permissions.length;n++){await new Promise(resolve=>setTimeout(resolve,30));pending=await host.snapshot(chat.id);}
        const permission=pending.permissions[0];expect(permission).toBeDefined();if(!permission)throw new Error('Missing permission.');
        await host.answerPermission(chat.id,project.id,{id:permission.id,digest:permission.digest,decision:'allow_once'});
      }
      expect((await host.manager.wait(accepted.jobId)).result?.status).toBe('completed');
      expect(host.resources.database.prepare("SELECT COUNT(*) AS n FROM events WHERE event_type='workflow.selected'").get()?.n).toBe(1);
      if(workflow.startsWith('verification'))expect((await host.snapshot(chat.id)).commands[0]).toMatchObject({exitCode:0,treeStopped:true});
    }finally{await host.shutdown(AbortSignal.timeout(10000));host.close();await fixture.close();}
  },45000);
}
