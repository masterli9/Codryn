import { randomUUID } from 'node:crypto';
import { readFile,writeFile,readdir } from 'node:fs/promises';
import { backup } from 'node:sqlite';
import { join } from 'node:path';
import { expect,it } from 'vitest';
import { createR2Project } from '@codryn/test-support';
import { createR3Infrastructure } from '../src/create-r3-infrastructure.js';
import { createDesktopRuntimeFactory } from '../src/model/r3-runtime-factory.js';
import { r3ModelDescriptor,type ModelAdapter,type SecretProtector } from '@codryn/core';

// This protector proves backend persistence boundaries, not Windows DPAPI.
const storageProtector:SecretProtector={available:async()=>true,encrypt:async value=>Uint8Array.from(Buffer.from(value),byte=>byte^129),decrypt:async bytes=>({value:Buffer.from(bytes.map(byte=>byte^129)).toString(),shouldReEncrypt:false})};
async function waitFor<T>(read:()=>Promise<T>,ready:(value:T)=>boolean):Promise<T>{
  const end=Date.now()+10000;let value=await read();while(!ready(value)&&Date.now()<end){await new Promise(resolve=>setTimeout(resolve,25));value=await read();}expect(ready(value),'backend barrier timed out').toBe(true);return value;
}
async function scanStorage(directory:string,secret:string):Promise<void>{
  for(const entry of await readdir(directory,{withFileTypes:true})){const path=join(directory,entry.name);if(entry.isDirectory())await scanStorage(path,secret);else {const bytes=await readFile(path);expect(bytes.includes(Buffer.from(secret)),entry.name).toBe(false);expect(bytes.includes(Buffer.from(secret,'utf16le')),entry.name).toBe(false);}}
}

for(const overflow of [false,true])it(`persists safe real command and split model streams with truthful truncation (${overflow?'capped':'complete'})`,async()=>{
  const fixture=await createR2Project('non-git'),secret='synthetic-r3-persistence-marker-483921',callId=randomUUID(),readId=randomUUID(),latch=join(fixture.root,'release-stream');let turn=0,disposed=false,readObserved=false;
  const model:ModelAdapter={descriptor:r3ModelDescriptor('demo'),async *stream(request){
    if(turn++===0){yield {type:'tool_call',call:{callId,toolId:'command.run',toolVersion:1,arguments:{command:{executable:process.execPath,args:['stream.cjs'],cwd:fixture.root,timeoutMs:10000,maxOutputBytes:overflow?1024:65536},reason:'Synthetic output boundary',impact:'Local fixture only'}}};yield {type:'completed'};return;}
    if(turn===2){yield {type:'tool_call',call:{callId:readId,toolId:'file.read',toolVersion:1,arguments:{path:'fixture-text.txt'}}};yield {type:'completed'};return;}
    readObserved=JSON.stringify(request.previousToolResults.find(result=>result.callId===readId)).includes(secret);
    yield {type:'text_delta',text:'Model prefix '+secret.slice(0,17)};yield {type:'text_delta',text:secret.slice(17)+' model suffix'};yield {type:'completed'};
  }};
  const host=await createR3Infrastructure({userDataPath:fixture.userData,secretProtector:storageProtector,runtimeFactory:resources=>createDesktopRuntimeFactory({...resources,userDataPath:fixture.userData,nodeExecutable:process.execPath,providerFactory:async()=>({model,dispose(){disposed=true;}})})});
  try{
    await host.resources.settings.saveKey(secret);
    await writeFile(join(fixture.root,'fixture-text.txt'),'Ordinary project text '+secret+' fixture end');
    // The command gets a filename, never a credential argument or environment variable.
    await writeFile(join(fixture.root,'stream.cjs'),overflow?"process.stdout.write('x'.repeat(10000));setInterval(()=>{},1000);":`const fs=require('node:fs');process.stdout.write('Command prefix '+'.'.repeat(5000)+${JSON.stringify(secret.slice(0,17))});const timer=setInterval(()=>{if(fs.existsSync(${JSON.stringify(latch)})){clearInterval(timer);process.stdout.write(${JSON.stringify(secret.slice(17))}+' command suffix');process.stderr.write('stderr '+${JSON.stringify(secret.slice(0,17))});setTimeout(()=>process.stderr.write(${JSON.stringify(secret.slice(17))}+' stderr suffix'),50);}},10);`);
    const project=await host.projects.open(fixture.root,AbortSignal.timeout(10000)),chat=await host.chats.create(project.id,'Secret persistence');
    const accepted=await host.manager.submit({requestId:randomUUID(),chatId:chat.id,mode:'demo',maxSteps:4,task:'Exercise synthetic stream output.'});
    const pending=await waitFor(()=>host.resources.projections.snapshot(chat.id),view=>view.permissions.length>0),permission=pending.permissions[0];if(!permission)throw new Error('permission missing');
    await host.answerPermission(chat.id,project.id,{id:permission.id,digest:permission.digest,decision:'allow_once'});
    if(!overflow){const live=await waitFor(()=>host.resources.projections.output(chat.id,callId,null),page=>page.chunks.some(chunk=>chunk.text.includes('Command prefix')));expect(live.truncated).toBe(false);expect((await host.resources.projections.snapshot(chat.id)).run?.state).toBe('running');await scanStorage(fixture.userData,secret);await writeFile(latch,'release');}
    const finished=await host.manager.wait(accepted.jobId),snapshot=await host.resources.projections.snapshot(chat.id),output=await host.resources.projections.output(chat.id,callId,null);
    expect(disposed).toBe(true);
    expect(readObserved).toBe(true);
    expect(snapshot.commands[0]).toMatchObject({truncated:overflow,treeStopped:true});expect(output.truncated).toBe(overflow);
    expect(snapshot.messages.at(-1)).toMatchObject({text:'Model prefix [redacted] model suffix',state:'complete'});
    const captured=[finished,snapshot,output,await host.inspectRun(chat.id,accepted.requestId),await host.resources.projections.messages(chat.id,null),await host.resources.projections.updates(chat.id,0,256)];
    expect(JSON.stringify(captured)).not.toContain(secret);
    expect(host.resources.database.prepare('SELECT result_json FROM agent_run_details').all()).toHaveLength(1);
    expect(JSON.stringify(host.resources.database.prepare('SELECT result_json FROM agent_run_details').all())).toContain('[redacted]');
    expect(host.resources.database.prepare('SELECT safe_result_json FROM tool_calls WHERE call_id=?').get(readId)?.safe_result_json).toBe('{"ok":true,"outputType":"object"}');
    if(!overflow)expect(output.chunks.map(chunk=>chunk.text).join('')).toContain('[redacted] command suffix');
    await backup(host.resources.database,join(fixture.userData,'diagnostic-copy.sqlite'));await scanStorage(fixture.userData,secret);
  }finally{await host.shutdown(AbortSignal.timeout(10000));host.close();await fixture.close();}
},30000);

it('reopens an interrupted split model stream with only its safe committed prefix',async()=>{
  const fixture=await createR2Project('non-git'),secret='synthetic-r3-interrupted-marker-9274';let release:()=>void=()=>undefined;
  const barrier=new Promise<void>(resolve=>{release=resolve;}),model:ModelAdapter={descriptor:r3ModelDescriptor('demo'),async *stream(){yield {type:'text_delta',text:'Safe prefix '+'.'.repeat(5000)+secret.slice(0,18)};yield {type:'text_delta',text:secret.slice(18)+' safe suffix'};await barrier;throw new Error(secret);}};
  const makeHost=()=>createR3Infrastructure({userDataPath:fixture.userData,secretProtector:storageProtector,runtimeFactory:resources=>createDesktopRuntimeFactory({...resources,userDataPath:fixture.userData,nodeExecutable:process.execPath,providerFactory:async()=>({model,dispose(){}})})});
  let host=await makeHost();
  try{
    await host.resources.settings.saveKey(secret);const project=await host.projects.open(fixture.root,AbortSignal.timeout(10000)),chat=await host.chats.create(project.id,'Interrupted secret');
    const accepted=await host.manager.submit({requestId:randomUUID(),chatId:chat.id,mode:'demo',maxSteps:4,task:'Exercise an interrupted stream.'});
    const live=await waitFor(()=>host.resources.projections.snapshot(chat.id),view=>view.messages.some(message=>message.role==='assistant'&&message.text.startsWith('Safe prefix')));expect(live.messages.at(-1)?.state).toBe('streaming');await scanStorage(fixture.userData,secret);release();
    const finished=await host.manager.wait(accepted.jobId);expect(finished.result?.status).toBe('failed');expect(JSON.stringify(finished)).not.toContain(secret);
    await host.shutdown(AbortSignal.timeout(10000));host.close();host=await makeHost();
    const reopened=await host.resources.projections.snapshot(chat.id);expect(reopened.messages.at(-1)).toMatchObject({text:'Safe prefix '+'.'.repeat(5000)+'[redacted] safe suffix',state:'interrupted'});expect(JSON.stringify(reopened)).not.toContain(secret);await scanStorage(fixture.userData,secret);
  }finally{release();await host.shutdown(AbortSignal.timeout(10000));host.close();await fixture.close();}
},30000);
for(const mode of ['git','non-git'] as const)it(`executes the real R3 ${mode} approval, test, diff and safe return`,async()=>{
  const fixture=await createR2Project(mode),signal=AbortSignal.timeout(50000);
  const host=await createR3Infrastructure({userDataPath:fixture.userData,runtimeFactory:resources=>createDesktopRuntimeFactory({...resources,userDataPath:fixture.userData,nodeExecutable:process.execPath})});
  try {
    const project=await host.projects.open(fixture.root,signal),chat=await host.chats.create(project.id,'Reference');
    const accepted=await host.manager.submit({requestId:randomUUID(),chatId:chat.id,mode:'demo',maxSteps:16,task:'Oprav součet a ověř jej.'});
    let snapshot=await host.snapshot(chat.id,signal);for(let count=0;count<100&&!snapshot.permissions.length&&!['finished','interrupted'].includes(snapshot.run?.state??'');count++){await new Promise(resolve=>setTimeout(resolve,25));snapshot=await host.snapshot(chat.id,signal);}
    const permission=snapshot.permissions[0];expect(snapshot.run,JSON.stringify(snapshot)).not.toMatchObject({state:'interrupted'});expect(permission,JSON.stringify(host.resources.database.prepare("SELECT tool_id,safe_result_json FROM tool_calls WHERE run_id=?").all(snapshot.run?.runId??''))).toBeDefined();expect(snapshot.run?.phase).toBe('waiting_for_approval');if(!permission)throw new Error('missing permission');
    expect(await host.answerPermission(chat.id,project.id,{id:permission.id,digest:permission.digest,decision:'allow_once'})).toBe('accepted');
    const finished=await host.manager.wait(accepted.jobId);expect(finished.result).toMatchObject({status:'completed',verification:{status:'verified'}});
    snapshot=await host.snapshot(chat.id,signal);expect(snapshot.verification?.status).toBe('verified');expect(snapshot.messages.at(-1)).toMatchObject({state:'complete'});expect(snapshot.commands[0]?.treeStopped).toBe(true);
    const setId=snapshot.changes?.setId;if(!setId)throw new Error('missing set');const diff=await host.diff(chat.id,setId,signal);expect(diff.diffs[0]?.lines.some(line=>line.kind==='added'&&line.text.includes('a + b'))).toBe(true);
    const input={requestId:randomUUID(),chatId:chat.id,setId,expectedSetSequence:diff.observedSetSequence,expectedWorkspaceRevision:diff.workspaceRevision};
    const [first,duplicate]=await Promise.all([host.revert(input,signal),host.revert(input,signal)]);expect(first).toMatchObject({status:'reverted'});expect(duplicate).toEqual(first);expect(await host.revert(input,signal)).toMatchObject({status:'reverted'});expect(await readFile(join(fixture.root,'sum.mjs'),'utf8')).toContain('a - b');
    expect(host.resources.database.prepare("SELECT state FROM tool_calls WHERE tool_id='change.revert'").all()).toEqual([{state:'succeeded'}]);
  }finally{await host.shutdown(AbortSignal.timeout(10000));host.close();await fixture.close();}
},60000);
it('cancels a real waiting harness without executing the approved command',async()=>{
  const fixture=await createR2Project('non-git'),signal=AbortSignal.timeout(50000),host=await createR3Infrastructure({userDataPath:fixture.userData,runtimeFactory:resources=>createDesktopRuntimeFactory({...resources,userDataPath:fixture.userData,nodeExecutable:process.execPath})});
  try {
    const project=await host.projects.open(fixture.root,signal),chat=await host.chats.create(project.id,'Stop'),accepted=await host.manager.submit({requestId:randomUUID(),chatId:chat.id,mode:'demo',maxSteps:16,task:'Oprav součet.'});
    let snapshot=await host.snapshot(chat.id,signal);for(let count=0;count<100&&!snapshot.permissions.length&&!['finished','interrupted'].includes(snapshot.run?.state??'');count++){await new Promise(resolve=>setTimeout(resolve,25));snapshot=await host.snapshot(chat.id,signal);}
    expect(snapshot.permissions).toHaveLength(1);await host.manager.stop(project.id,accepted.jobId);expect((await host.manager.wait(accepted.jobId)).result?.status).toBe('cancelled');
    expect(host.resources.database.prepare('SELECT count(*) AS n FROM desktop_command_owners').get()?.n).toBe(0);
    const permission=snapshot.permissions[0];if(!permission)throw new Error('missing');expect(await host.answerPermission(chat.id,project.id,{id:permission.id,digest:permission.digest,decision:'allow_once'})).toBe('rejected');
    await writeFile(join(fixture.root,'external.txt'),'outside edit');
  }finally{await host.shutdown(AbortSignal.timeout(10000));host.close();await fixture.close();}
},60000);
