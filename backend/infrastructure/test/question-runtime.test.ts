import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createR2Project } from '@codryn/test-support';
import { r3ModelDescriptor, type ModelAdapter } from '@codryn/core';
import type { ModelRequest } from '@codryn/shared';
import { createR3Infrastructure } from '../src/create-r3-infrastructure.js';
import { createDesktopRuntimeFactory } from '../src/model/r3-runtime-factory.js';

for (const restart of [false, true]) it(`resumes the same durable run once with fresh reads after ${restart ? 'desktop restart' : 'answer'}`, async () => {
  const fixture = await createR2Project('non-git');
  const requests: ModelRequest[] = [];
  let step = 0;
  const model: ModelAdapter = { descriptor: r3ModelDescriptor('demo'), async *stream(request) {
    requests.push(request);
    const next = step++;
    if (next === 1) yield { type: 'tool_call', call: { callId: randomUUID(), toolId: 'ask_user', toolVersion: 1, arguments: {
      reason: 'Storage scope affects the implementation.', prompt: 'Which storage should the feature use?',
      options: [{ id: 'local', label: 'Local files' }, { id: 'shared', label: 'Shared storage' }]
    } } };
    else if (next < 3) yield { type: 'tool_call', call: { callId: randomUUID(), toolId: 'file.read', toolVersion: 1, arguments: { path: 'note.txt' } } };
    else yield { type: 'text_delta', text: 'Current value checked.' };
    yield { type: 'completed' };
  } };
  const open = () => createR3Infrastructure({ userDataPath: fixture.userData,
    runtimeFactory: resources => createDesktopRuntimeFactory({ ...resources, userDataPath: fixture.userData, nodeExecutable: process.execPath,
      providerFactory: async () => ({ model, dispose() {} }) }) });
  let host = await open();
  try {
    await writeFile(join(fixture.root, 'note.txt'), 'old value');
    const project = await host.projects.open(fixture.root, AbortSignal.timeout(10_000));
    const chat = await host.chats.create(project.id, 'Question');
    const accepted = await host.manager.submit({ requestId: randomUUID(), chatId: chat.id, mode: 'demo', maxSteps: 8, task: 'Implement a feature.' });
    const waiting = await host.manager.wait(accepted.jobId);
    expect(waiting).toMatchObject({ state: 'running', phase: 'waiting_for_user_input', stepCount: 2 });
    expect(requests).toHaveLength(2);
    const question = await host.questionCurrent(chat.id, project.id);
    if (!question) throw new Error('Missing durable question.');
    if (restart) {
      await host.shutdown(AbortSignal.timeout(10_000)); host.close(); host = await open();
      expect(await host.questionCurrent(chat.id, project.id)).toEqual(question);
    }
    await writeFile(join(fixture.root, 'note.txt'), 'new value');
    const answerId = randomUUID(), answer = { kind: 'option' as const, optionId: 'local' };
    expect(await host.answerQuestion(chat.id, project.id, question.runId, question.id, answerId, answer)).toEqual({ status: 'accepted' });
    expect(await host.answerQuestion(chat.id, project.id, question.runId, question.id, answerId, answer)).toEqual({ status: 'duplicate' });
    const done = await host.manager.wait(accepted.jobId);
    expect(done.result).toMatchObject({ runId: waiting.runId, status: 'completed' });
    expect(requests).toHaveLength(4);
    expect(requests[2]?.previousToolResults[0]).toMatchObject({ output: { status: 'stale' } });
    expect(JSON.stringify(requests[3]?.previousToolResults)).toContain('new value');
    expect(host.resources.database.prepare("SELECT COUNT(*) AS n FROM tool_calls WHERE tool_id='file.read'").get()?.n).toBe(2);
  } finally { await host.shutdown(AbortSignal.timeout(10_000)); host.close(); await fixture.close(); }
}, 45_000);

it('preserves an earlier patch across restart and still requires command approval after declining the question', async () => {
  const fixture = await createR2Project('git');
  const requests: ModelRequest[] = [];
  const original = await readFile(join(fixture.root,'sum.mjs'),'utf8');
  const hash = createHash('sha256').update(original).digest('hex');
  let step=0;
  const model:ModelAdapter={descriptor:r3ModelDescriptor('demo'),async *stream(request){
    requests.push(request);
    const calls=[
      {toolId:'file.patch',arguments:{path:'sum.mjs',expectedHash:hash,edits:[{oldText:'a - b',newText:'a + b'}]}},
      {toolId:'ask_user',arguments:{reason:'The next feature needs a storage decision.',prompt:'Choose a storage location.',options:[{id:'local',label:'Local'},{id:'shared',label:'Shared'}]}},
      {toolId:'command.run',arguments:{command:{executable:process.execPath,args:['--test','sum.test.mjs'],cwd:fixture.root,timeoutMs:30000,maxOutputBytes:256*1024},reason:'Check current fixture.',impact:'Runs the project test.'}}
    ];
    const call=calls[step++];
    if(call)yield {type:'tool_call',call:{...call,callId:randomUUID(),toolVersion:1}};
    else yield {type:'text_delta',text:'Checked.'};
    yield {type:'completed'};
  }};
  const open=()=>createR3Infrastructure({userDataPath:fixture.userData,runtimeFactory:resources=>createDesktopRuntimeFactory({...resources,userDataPath:fixture.userData,nodeExecutable:process.execPath,providerFactory:async()=>({model,dispose(){}})})});
  let host=await open();
  try{
    const project=await host.projects.open(fixture.root,AbortSignal.timeout(10000)),chat=await host.chats.create(project.id,'Patch then question');
    const accepted=await host.manager.submit({requestId:randomUUID(),chatId:chat.id,mode:'demo',maxSteps:8,task:'Repair and verify.'});
    const waiting=await host.manager.wait(accepted.jobId),before=await host.snapshot(chat.id);
    expect(waiting.phase).toBe('waiting_for_user_input');
    expect(await readFile(join(fixture.root,'sum.mjs'),'utf8')).toContain('a + b');
    await host.shutdown(AbortSignal.timeout(10000));host.close();host=await open();
    const question=await host.questionCurrent(chat.id,project.id);if(!question)throw new Error('Missing question.');
    expect(await host.answerQuestion(chat.id,project.id,question.runId,question.id,randomUUID(),{kind:'declined'})).toEqual({status:'accepted'});
    let pending=await host.snapshot(chat.id);
    for(let count=0;count<100&&!pending.permissions.length;count++){await new Promise(resolve=>setTimeout(resolve,30));pending=await host.snapshot(chat.id);}
    expect(pending.permissions).toHaveLength(1);
    expect(pending.changes?.setId).toBe(before.changes?.setId);
    expect(pending.commands.every(command=>command.state!=='running')).toBe(true);
    const permission=pending.permissions[0];if(!permission)throw new Error('Missing separate permission.');
    await host.answerPermission(chat.id,project.id,{id:permission.id,digest:permission.digest,decision:'allow_once'});
    const completed=await host.manager.wait(accepted.jobId);
    expect(completed.result).toMatchObject({runId:waiting.runId,status:'completed'});
    expect(host.resources.database.prepare("SELECT COUNT(*) AS n FROM tool_calls WHERE tool_id='file.patch'").get()?.n).toBe(1);
    expect(JSON.stringify(requests[2]?.previousToolResults.at(-1))).toContain('declined');
  }finally{await host.shutdown(AbortSignal.timeout(10000));host.close();await fixture.close();}
},60000);

for(const outcome of ['cancel','accepted-crash'] as const)it(`releases the waiting project after ${outcome} without replay`,async()=>{
  const fixture=await createR2Project('non-git');
  let calls=0;
  const model:ModelAdapter={descriptor:r3ModelDescriptor('demo'),async *stream(request){
    calls++;
    if(request.task==='Next task')yield {type:'text_delta',text:'Done.'};
    else yield {type:'tool_call',call:{callId:randomUUID(),toolId:'ask_user',toolVersion:1,arguments:{
      reason:'A decision changes scope.',prompt:'Which scope?',options:[{id:'local',label:'Local'},{id:'shared',label:'Shared'}]
    }}};
    yield {type:'completed'};
  }};
  const open=()=>createR3Infrastructure({userDataPath:fixture.userData,runtimeFactory:resources=>createDesktopRuntimeFactory({...resources,userDataPath:fixture.userData,nodeExecutable:process.execPath,providerFactory:async()=>({model,dispose(){}})})});
  let host=await open();
  try{
    const project=await host.projects.open(fixture.root,AbortSignal.timeout(10000)),chat=await host.chats.create(project.id,'Cancellation');
    const first=await host.manager.submit({requestId:randomUUID(),chatId:chat.id,mode:'demo',maxSteps:8,task:'Question'});
    await host.manager.wait(first.jobId);
    const question=await host.questionCurrent(chat.id,project.id);if(!question)throw new Error('Missing question.');
    if(outcome==='cancel'){
      expect(await host.stop(chat.id,project.id,first.jobId)).toBe('requested');
      expect((await host.manager.wait(first.jobId)).failure?.code).toBe('R1_CANCELLED');
    }else{
      expect(host.resources.questions.answer(chat.id,question.runId,question.id,randomUUID(),{kind:'option',optionId:'local'})).toBe('accepted');
      await host.shutdown(AbortSignal.timeout(10000));host.close();host=await open();
      const interrupted=await host.manager.wait(first.jobId);
      expect(interrupted).toMatchObject({state:'interrupted',failure:{code:'R3_RECOVERY_REQUIRED'}});
    }
    expect(calls).toBe(1);
    expect(await host.questionCurrent(chat.id,project.id)).toBeNull();
    const next=await host.manager.submit({requestId:randomUUID(),chatId:chat.id,mode:'demo',maxSteps:8,task:'Next task'});
    expect((await host.manager.wait(next.jobId)).result?.status).toBe('completed');
  }finally{await host.shutdown(AbortSignal.timeout(10000));host.close();await fixture.close();}
},45000);
