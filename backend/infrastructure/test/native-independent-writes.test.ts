import { createHash } from 'node:crypto';
import { readFile,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect,it,vi } from 'vitest';
import { createR2Project } from '@codryn/test-support';
import { WindowsGuardedWriter } from '../src/filesystem/windows-guarded-writer.js';
import { createR2Infrastructure } from '../src/create-r2-infrastructure.js';
import { workspaceAccess } from '../src/filesystem/workspace-access.js';
import { FileWorkspaceObserver } from '../src/filesystem/workspace-observer.js';
import { r3ModelDescriptor,type ModelAdapter } from '@codryn/core';
import { randomUUID } from 'node:crypto';
it('holds two native guards for different files in one directory and publishes both',async()=>{
  const fixture=await createR2Project('non-git'),writer=new WindowsGuardedWriter(fixture.root);
  const guards:Awaited<ReturnType<WindowsGuardedWriter['open']>>[]=[];
  try{
    await writeFile(join(fixture.root,'first.txt'),'before');await writeFile(join(fixture.root,'second.txt'),'before');
    const hash=createHash('sha256').update('before').digest('hex'),signal=AbortSignal.timeout(30000);
    guards.push(await writer.open('first.txt',hash,signal));
    guards.push(await writer.open('second.txt',hash,signal));
    await Promise.all(guards.map(guard=>guard.publish(Buffer.from('after'))));
    await Promise.all(guards.map(guard=>guard.close()));guards.splice(0);
    expect(await readFile(join(fixture.root,'first.txt'),'utf8')).toBe('after');
    expect(await readFile(join(fixture.root,'second.txt'),'utf8')).toBe('after');
  }finally{await Promise.allSettled(guards.map(guard=>guard.close()));await fixture.close();}
},45000);

it('lets two real R2 actors hold distinct native writes while the full observer waits for both',async()=>{
  const fixture=await createR2Project('non-git'),signal=AbortSignal.timeout(30000),scanner=new FileWorkspaceObserver(fixture.root);
  const runtimes:Awaited<ReturnType<typeof createR2Infrastructure>>[]=[];
  let allowPublish:()=>void=()=>undefined,modelsReady:()=>void=()=>undefined,guardsReady:()=>void=()=>undefined,readyModels=0,readyGuards=0;
  const publishing=new Promise<void>(resolve=>{allowPublish=resolve;}),prepared=new Promise<void>(resolve=>{modelsReady=resolve;}),
    guarded=new Promise<void>(resolve=>{guardsReady=resolve;});
  const original=WindowsGuardedWriter.prototype.open;
  const spy=vi.spyOn(WindowsGuardedWriter.prototype,'open').mockImplementation(async function(this:WindowsGuardedWriter,...args){
    const guard=await original.apply(this,args);
    if(++readyGuards===2)guardsReady();
    try{
      await Promise.race([publishing,new Promise<never>((_,reject)=>{signal.addEventListener('abort',()=>reject(signal.reason),{once:true});})]);
      return guard;
    }catch(error){await guard.close();throw error;}
  });
  try{
    const hash=createHash('sha256').update('before').digest('hex');
    for(const path of ['first.txt','second.txt']){
      await writeFile(join(fixture.root,path),'before');
      let calls=0;
      const model:ModelAdapter={descriptor:r3ModelDescriptor('demo'),async *stream(){
        if(calls++===0){
          if(++readyModels===2)modelsReady();
          await prepared;
          yield {type:'tool_call',call:{callId:randomUUID(),toolId:'file.patch',toolVersion:1,arguments:{path,expectedHash:hash,edits:[{oldText:'before',newText:'after'}]}}};
        }else yield {type:'text_delta',text:'Applied.'};
        yield {type:'completed'};
      }};
      runtimes.push(await createR2Infrastructure({userDataPath:join(fixture.userData,path),projectRoot:fixture.root,model}));
    }
    const runs=runtimes.map(runtime=>runtime.agentLoop.executeR2({requestId:randomUUID(),projectRoot:fixture.root,task:'Patch the assigned file.',maxSteps:4,contextReferences:[]},signal));
    await Promise.race([guarded,new Promise<never>((_,reject)=>{signal.addEventListener('abort',()=>reject(signal.reason),{once:true});})]);
    let observerStarted=false;
    const observation=workspaceAccess.observe(fixture.root,signal,async()=>{observerStarted=true;return scanner.inspect(signal);});
    await Promise.resolve();
    expect(readyGuards).toBe(2);expect(observerStarted).toBe(false);
    allowPublish();
    const snapshot=await observation;
    const results=await Promise.all(runs);
    expect(observerStarted).toBe(true);
    expect(snapshot.inputHashes?.['first.txt']).toBe(createHash('sha256').update('after').digest('hex'));
    expect(snapshot.inputHashes?.['second.txt']).toBe(snapshot.inputHashes?.['first.txt']);
    expect(results.every(result=>!result.recoveryRequired)).toBe(true);
  }finally{allowPublish();spy.mockRestore();scanner.close();for(const runtime of runtimes)runtime.close();await fixture.close();}
},45000);
