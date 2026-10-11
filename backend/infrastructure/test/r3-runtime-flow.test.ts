import { randomUUID } from 'node:crypto';
import { readFile,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect,it } from 'vitest';
import { createR2Project } from '@codryn/test-support';
import { createR3Infrastructure } from '../src/create-r3-infrastructure.js';
import { createDesktopRuntimeFactory } from '../src/model/r3-runtime-factory.js';
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
