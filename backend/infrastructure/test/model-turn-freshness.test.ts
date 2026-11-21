import { randomUUID, createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createR2Project } from '@codryn/test-support';
import type { ModelRequest } from '@codryn/shared';
import { jsonValueSchema } from '@codryn/shared';
import { ModelTurnFreshness } from '../src/context/model-turn-freshness.js';
import { ContextPathPolicy } from '../src/filesystem/context-path-policy.js';
import { FileWorkspaceObserver } from '../src/filesystem/workspace-observer.js';
import { emptyTypeScriptQuery } from '../src/typescript/typescript-query-result.js';
const marker = 'STALE_CONTEXT_CANARY';
const hash = createHash('sha256').update(marker).digest('hex');
it('preserves empty worker failure diagnostics but strips unproven source-bearing failures', async () => {
  const fixture=await createR2Project('non-git');
  const policy=await ContextPathPolicy.fromProjectRoot(fixture.root);
  const observer=new FileWorkspaceObserver(fixture.root,{contextPolicy:policy});
  const signal=AbortSignal.timeout(10000);
  try{
    const freshness=new ModelTurnFreshness(fixture.root,policy,async input=>({...await observer.inspect(input),revision:1}));
    const emptyId=randomUUID(),sourceId=randomUUID();
    const empty=jsonValueSchema.parse(emptyTypeScriptQuery(0,'worker_failed'));
    const request:ModelRequest={runId:randomUUID(),task:'Inspect.',project:{id:randomUUID()},tools:[],context:[],previousToolResults:[],history:[
      {kind:'assistant',text:'',calls:[emptyId,sourceId].map(callId=>({callId,toolId:'typescript.query',toolVersion:1,arguments:{kind:'exports',path:'sum.mjs'}}))},
      {kind:'tool',result:{ok:true,callId:emptyId,output:empty}},
      {kind:'tool',result:{ok:true,callId:sourceId,output:jsonValueSchema.parse({...emptyTypeScriptQuery(0,'worker_failed'),targetHash:hash})}}
    ]};
    const next=await freshness.refresh(request,signal);
    expect(next.previousToolResults[0]).toEqual(request.history?.[1]?.kind==='tool'?request.history[1].result:undefined);
    expect(next.previousToolResults[1]).toMatchObject({ok:true,output:{status:'stale'}});
    await writeFile(join(fixture.root,'.codrynignore'),'sum.mjs\n');
    expect((await freshness.refresh({...request,history:next.history},signal)).previousToolResults[0]).toMatchObject({ok:true,output:empty});
  }finally{observer.close();await fixture.close();}
});
it('restores redaction from the resume stale placeholder without needsFreshRead', async () => {
  const fixture=await createR2Project('non-git');
  const policy=await ContextPathPolicy.fromProjectRoot(fixture.root);
  const observer=new FileWorkspaceObserver(fixture.root,{contextPolicy:policy});
  const signal=AbortSignal.timeout(10000);
  const freshness=new ModelTurnFreshness(fixture.root,policy,async input=>({...await observer.inspect(input),revision:1}));
  try{
    const readId=randomUUID(),searchId=randomUUID(),marker='RESUME_OLD_SOURCE_CANARY';
    const staleReason='Prior tool output requires a fresh read after a user decision.';
    const request:ModelRequest={runId:randomUUID(),task:'Continue after answering.',project:{id:randomUUID()},tools:[],context:[],previousToolResults:[],
      priorConversation:[{role:'user',text:'Continue.'},{role:'assistant',text:`Earlier source was ${marker}`}],history:[
        {kind:'assistant',text:`Old source summary ${marker}`,calls:[
          {callId:readId,toolId:'file.read',toolVersion:1,arguments:{path:'note.ts'}},
          {callId:searchId,toolId:'text.search',toolVersion:1,arguments:{query:marker}}
        ]},
        {kind:'tool',result:{ok:true,callId:readId,output:{status:'stale',reason:staleReason}}},
        {kind:'tool',result:{ok:true,callId:searchId,output:{status:'stale',reason:staleReason}}}
      ]};
    const restored=await freshness.refresh(request,signal);
    expect(JSON.stringify(restored)).not.toContain(marker);
    expect(restored.priorConversation).toBeUndefined();
    expect(restored.history?.[0]).toMatchObject({kind:'assistant',text:'',calls:[
      {callId:readId,arguments:{historical:true}},{callId:searchId,arguments:{historical:true}}
    ]});
    expect(restored.previousToolResults).toMatchObject([
      {ok:true,callId:readId,output:{status:'stale',needsFreshRead:true}},
      {ok:true,callId:searchId,output:{status:'stale',needsFreshRead:true}}
    ]);
  }finally{observer.close();await fixture.close();}
});
it('redacts command output across policy toggles and restores the command resume placeholder', async () => {
  const fixture=await createR2Project('non-git');
  const policy=await ContextPathPolicy.fromProjectRoot(fixture.root);
  const observer=new FileWorkspaceObserver(fixture.root,{contextPolicy:policy});
  const signal=AbortSignal.timeout(10000);
  const makeFreshness=()=>new ModelTurnFreshness(fixture.root,policy,async input=>({...await observer.inspect(input),revision:1}));
  try{
    const marker='COMMAND_OUTPUT_CANARY',callId=randomUUID();
    const request:ModelRequest={runId:randomUUID(),task:'Run the check.',project:{id:randomUUID()},tools:[],context:[],previousToolResults:[],
      priorConversation:[{role:'user',text:'Run the check.'},{role:'assistant',text:`The command printed ${marker}`}],history:[
        {kind:'assistant',text:`Command result ${marker}`,calls:[{callId,toolId:'command.run',toolVersion:1,arguments:{command:'npm test',reason:'Check the change.',impact:'Runs the existing tests.'}}]},
        {kind:'tool',result:{ok:true,callId,output:{status:'succeeded',exitCode:0,stdout:marker,stderr:''}}}
      ]};
    const freshness=makeFreshness();
    await freshness.refresh(request,signal);
    await writeFile(join(fixture.root,'.codrynignore'),'note.ts\n');
    const changed=await freshness.refresh(request,signal);
    expect(JSON.stringify(changed)).not.toContain(marker);
    expect(changed.history?.[0]).toMatchObject({kind:'assistant',text:'',calls:[{callId,arguments:{historical:true}}]});
    expect(changed.previousToolResults[0]).toMatchObject({ok:true,callId,output:{status:'stale',needsFreshExecution:true}});
    expect(changed.priorConversation).toBeUndefined();
    await writeFile(join(fixture.root,'.codrynignore'),'');
    expect(JSON.stringify(await freshness.refresh(request,signal))).not.toContain(marker);

    const resumedRaw:ModelRequest={...request,history:[
      {kind:'assistant',text:`Command result ${marker}`,calls:[{callId,toolId:'command.run',toolVersion:1,arguments:{command:'npm test',reason:'Check the change.',impact:'Runs the existing tests.'}}]},
      {kind:'tool',result:{ok:true,callId,output:{status:'stale',reason:'Prior tool output requires a fresh read after a user decision.'}}}
    ]};
    const resumed=await makeFreshness().refresh(resumedRaw,signal);
    expect(JSON.stringify(resumed)).not.toContain(marker);
    expect(resumed.priorConversation).toBeUndefined();
    expect(resumed.history?.[0]).toMatchObject({kind:'assistant',text:'',calls:[{callId,arguments:{historical:true}}]});
    expect(resumed.previousToolResults[0]).toMatchObject({ok:true,callId,output:{status:'stale',needsFreshExecution:true}});
  }finally{observer.close();await fixture.close();}
});
it('always redacts historical patch arguments even when the workspace is fresh', async () => {
  const fixture=await createR2Project('non-git');
  const policy=await ContextPathPolicy.fromProjectRoot(fixture.root);
  const observer=new FileWorkspaceObserver(fixture.root,{contextPolicy:policy});
  const signal=AbortSignal.timeout(10000);
  const freshness=new ModelTurnFreshness(fixture.root,policy,async input=>({...await observer.inspect(input),revision:1}));
  try{
    const callId=randomUUID(),secret='PATCH_ARGUMENT_CANARY';
    const request:ModelRequest={runId:randomUUID(),task:'Apply the patch.',project:{id:randomUUID()},tools:[],context:[],previousToolResults:[],history:[
      {kind:'assistant',text:'Patch was applied.',calls:[{callId,toolId:'file.patch',toolVersion:1,arguments:{path:'note.ts',expectedHash:'a'.repeat(64),edits:[{oldText:secret,newText:'updated'}]}}]},
      {kind:'tool',result:{ok:true,callId,output:{status:'applied',path:'note.ts',beforeHash:'a'.repeat(64),afterHash:'b'.repeat(64),changeId:randomUUID(),revision:1}}}
    ]};
    const first=await freshness.refresh(request,signal);
    expect(first.history?.[0]).toMatchObject({kind:'assistant',text:'Patch was applied.',calls:[{callId,arguments:{historical:true}}]});
    expect(JSON.stringify(first)).not.toContain(secret);
    const repeated=await freshness.refresh(request,signal);
    expect(repeated.history?.[0]).toMatchObject({kind:'assistant',text:'Patch was applied.',calls:[{callId,arguments:{historical:true}}]});
    expect(JSON.stringify(repeated)).not.toContain(secret);
  }finally{observer.close();await fixture.close();}
});
it('keeps fresh reads and paired calls but removes stale file/search/TS payloads and quoted arguments after a policy change', async () => {
  const fixture = await createR2Project('non-git');
  const policy = await ContextPathPolicy.fromProjectRoot(fixture.root);
  const observer = new FileWorkspaceObserver(fixture.root, { contextPolicy: policy });
  let revision=0,lastFingerprint='';
  const observe=async(signal:AbortSignal)=>{
    const observed=await observer.inspect(signal);
    if(observed.fingerprint!==lastFingerprint){revision++;lastFingerprint=observed.fingerprint;}
    return {...observed,revision};
  };
  const freshness=new ModelTurnFreshness(fixture.root,policy,observe);
  const signal=AbortSignal.timeout(10000);
  try {
    await writeFile(join(fixture.root,'note.ts'),marker);
    const readId=randomUUID(),searchId=randomUUID(),tsId=randomUUID(),questionId=randomUUID();
    const before=await observe(signal);
    freshness.recordSearch(searchId,before,before);
    const request:ModelRequest={runId:randomUUID(),task:'Inspect current files.',project:{id:randomUUID()},tools:[],context:[],
      previousToolResults:[],priorConversation:[{role:'user',text:'Inspect this file.'},{role:'assistant',text:marker}],history:[
        {kind:'assistant',text:marker,calls:[{callId:readId,toolId:'file.read',toolVersion:1,arguments:{path:'note.ts'}},{callId:searchId,toolId:'text.search',toolVersion:1,arguments:{query:marker}},{callId:tsId,toolId:'typescript.query',toolVersion:1,arguments:{path:'note.ts',kind:'type',symbol:'value'}}]},
        {kind:'tool',result:{ok:true,callId:readId,output:{path:'note.ts',content:marker,contentHash:hash}}},
        {kind:'tool',result:{ok:true,callId:searchId,output:{matches:[{path:'note.ts',preview:marker}]}}},
        {kind:'tool',result:{ok:true,callId:tsId,output:{revision:before.revision,policyRevision:policy.revision,targetHash:hash,items:[{display:marker}]}}},
        {kind:'assistant',text:'',calls:[{callId:questionId,toolId:'ask_user',toolVersion:1,arguments:{}}]},
        {kind:'tool',result:{ok:true,callId:questionId,output:{kind:'option',optionId:'local'}}}
      ]};
    const fresh=await freshness.refresh(request,signal);
    expect(JSON.stringify(fresh)).toContain(marker);
    await writeFile(join(fixture.root,'.codrynignore'),'note.ts\n');
    const current=await freshness.refresh(request,signal);
    expect(JSON.stringify(current)).not.toContain(marker);
    expect(current.history?.filter(turn=>turn.kind==='assistant').flatMap(turn=>turn.calls.map(call=>call.callId))).toEqual([readId,searchId,tsId,questionId]);
    expect(current.history?.at(-1)).toEqual(request.history?.at(-1));
    expect(current.previousToolResults).toHaveLength(4);
    const later=await freshness.refresh({...request,history:current.history},signal);
    expect(JSON.stringify(later)).not.toContain(marker);
    expect(later.priorConversation).toBeUndefined();
  }finally{observer.close();await fixture.close();}
});

it('keeps redaction of raw stale history while preserving a later fresh read across repeated turns', async () => {
  const fixture=await createR2Project('non-git');
  const policy=await ContextPathPolicy.fromProjectRoot(fixture.root);
  const observer=new FileWorkspaceObserver(fixture.root,{contextPolicy:policy});
  const signal=AbortSignal.timeout(10000);
  const observe=async(input:AbortSignal)=>({...await observer.inspect(input),revision:1});
  const freshness=new ModelTurnFreshness(fixture.root,policy,observe);
  const oldText='OLD_SOURCE_CANARY';
  const newText='NEW_SOURCE_CANARY';
  const digest=(text:string)=>createHash('sha256').update(text).digest('hex');
  try{
    await writeFile(join(fixture.root,'note.ts'),oldText);
    const initial=await observe(signal);
    const oldCallId=randomUUID(),freshCallId=randomUUID();
    const oldHistory:NonNullable<ModelRequest['history']>=[
      {kind:'assistant',text:`Quoted old source: ${oldText}`,calls:[{callId:oldCallId,toolId:'file.read',toolVersion:1,arguments:{path:'note.ts',startLine:1,maxLines:20}}]},
      {kind:'tool',result:{ok:true,callId:oldCallId,output:{path:'note.ts',content:oldText,startLine:1,endLine:1,totalLines:1,truncated:false,contentHash:initial.inputHashes?.['note.ts']??digest(oldText)}}},
      {kind:'assistant',text:`Earlier summary without a tool call quoted ${oldText}`,calls:[]}
    ];
    const request:ModelRequest={runId:randomUUID(),task:'Inspect note.ts.',project:{id:randomUUID()},tools:[],context:[],previousToolResults:[],
      priorConversation:[{role:'user',text:'Inspect note.ts.'},{role:'assistant',text:`Previously quoted ${oldText}`}],history:oldHistory};
    expect(JSON.stringify(await freshness.refresh(request,signal))).toContain(oldText);

    await writeFile(join(fixture.root,'note.ts'),newText);
    const invalidated=await freshness.refresh(request,signal);
    expect(JSON.stringify(invalidated)).not.toContain(oldText);
    expect(invalidated.history?.[0]).toMatchObject({kind:'assistant',text:'',calls:[{callId:oldCallId,arguments:{historical:true}}]});
    expect(invalidated.previousToolResults[0]).toMatchObject({ok:true,callId:oldCallId,output:{status:'stale',needsFreshRead:true}});
    expect(invalidated.priorConversation).toBeUndefined();

    const current=await observe(signal);
    const newCallHistory:NonNullable<ModelRequest['history']>=[...oldHistory,
      {kind:'assistant',text:'Fresh read completed.',calls:[{callId:freshCallId,toolId:'file.read',toolVersion:1,arguments:{path:'note.ts',startLine:1,maxLines:20}}]},
      {kind:'tool',result:{ok:true,callId:freshCallId,output:{path:'note.ts',content:newText,startLine:1,endLine:1,totalLines:1,truncated:false,contentHash:current.inputHashes?.['note.ts']??digest(newText)}}}
    ];
    const resumed=await freshness.refresh({...request,history:newCallHistory},signal);
    expect(JSON.stringify(resumed)).not.toContain(oldText);
    expect(resumed.history?.[0]).toMatchObject({kind:'assistant',text:'',calls:[{callId:oldCallId,arguments:{historical:true}}]});
    expect(resumed.history?.[2]).toMatchObject({kind:'assistant',text:'',calls:[]});
    expect(resumed.history?.[3]).toMatchObject({kind:'assistant',text:'Fresh read completed.',calls:[{callId:freshCallId,arguments:{path:'note.ts',startLine:1,maxLines:20}}]});
    expect(resumed.previousToolResults).toContainEqual(expect.objectContaining({ok:true,callId:freshCallId,output:expect.objectContaining({content:newText})}));

    const repeated=await freshness.refresh({...request,history:newCallHistory},signal);
    expect(JSON.stringify(repeated)).not.toContain(oldText);
    expect(repeated.history?.[2]).toMatchObject({kind:'assistant',text:'',calls:[]});
    expect(repeated.history?.[3]).toMatchObject({kind:'assistant',text:'Fresh read completed.',calls:[{callId:freshCallId,arguments:{path:'note.ts',startLine:1,maxLines:20}}]});
    expect(repeated.previousToolResults).toContainEqual(expect.objectContaining({ok:true,callId:freshCallId,output:expect.objectContaining({content:newText})}));

    const newestText='LATEST_SOURCE_CANARY';
    const newestCallId=randomUUID();
    await writeFile(join(fixture.root,'note.ts'),newestText);
    const changedAgain=await freshness.refresh({...request,history:newCallHistory},signal);
    expect(JSON.stringify(changedAgain)).not.toContain(newText);
    expect(changedAgain.previousToolResults.find(result=>result.callId===freshCallId)).toMatchObject({ok:true,output:{status:'stale',needsFreshRead:true}});
    const latestSnapshot=await observe(signal);
    const latestHistory:NonNullable<ModelRequest['history']>=[...newCallHistory,
      {kind:'assistant',text:'Freshest read completed.',calls:[{callId:newestCallId,toolId:'file.read',toolVersion:1,arguments:{path:'note.ts',startLine:1,maxLines:20}}]},
      {kind:'tool',result:{ok:true,callId:newestCallId,output:{path:'note.ts',content:newestText,startLine:1,endLine:1,totalLines:1,truncated:false,contentHash:latestSnapshot.inputHashes?.['note.ts']??digest(newestText)}}}
    ];
    const latest=await freshness.refresh({...request,history:latestHistory},signal);
    expect(JSON.stringify(latest)).not.toContain(oldText);
    expect(JSON.stringify(latest)).not.toContain(newText);
    expect(latest.history?.[5]).toMatchObject({kind:'assistant',text:'Freshest read completed.',calls:[{callId:newestCallId,arguments:{path:'note.ts',startLine:1,maxLines:20}}]});
    expect(latest.previousToolResults).toContainEqual(expect.objectContaining({ok:true,callId:newestCallId,output:expect.objectContaining({content:newestText})}));
  }finally{observer.close();await fixture.close();}
});

it('does not restore stale history when ignore policy changes away and back', async () => {
  const fixture=await createR2Project('non-git');
  const policy=await ContextPathPolicy.fromProjectRoot(fixture.root);
  const observer=new FileWorkspaceObserver(fixture.root,{contextPolicy:policy});
  const signal=AbortSignal.timeout(10000);
  const freshness=new ModelTurnFreshness(fixture.root,policy,async input=>({...await observer.inspect(input),revision:1}));
  try{
    const marker='IGNORED_SOURCE_CANARY';
    await writeFile(join(fixture.root,'note.ts'),marker);
    const before=await observer.inspect(signal);
    const callId=randomUUID();
    const request:ModelRequest={runId:randomUUID(),task:'Inspect note.ts.',project:{id:randomUUID()},tools:[],context:[],previousToolResults:[],history:[
      {kind:'assistant',text:`Quoted ${marker}`,calls:[{callId,toolId:'file.read',toolVersion:1,arguments:{path:'note.ts'}}]},
      {kind:'tool',result:{ok:true,callId,output:{path:'note.ts',content:marker,contentHash:before.inputHashes?.['note.ts']??createHash('sha256').update(marker).digest('hex')}}}
    ]};
    await freshness.refresh(request,signal);
    await writeFile(join(fixture.root,'.codrynignore'),'note.ts\n');
    const ignored=await freshness.refresh(request,signal);
    expect(JSON.stringify(ignored)).not.toContain(marker);
    await writeFile(join(fixture.root,'.codrynignore'),'');
    const restoredPolicy=await freshness.refresh(request,signal);
    expect(JSON.stringify(restoredPolicy)).not.toContain(marker);
    expect(restoredPolicy.history?.[0]).toMatchObject({kind:'assistant',text:'',calls:[{callId,arguments:{historical:true}}]});
    expect(restoredPolicy.previousToolResults[0]).toMatchObject({ok:true,callId,output:{status:'stale',needsFreshRead:true}});
  }finally{observer.close();await fixture.close();}
});

it('keeps a concurrent-change stale marker while accepting a fresh read on the following turn', async () => {
  const fixture=await createR2Project('non-git');
  const policy=await ContextPathPolicy.fromProjectRoot(fixture.root);
  const observer=new FileWorkspaceObserver(fixture.root,{contextPolicy:policy});
  const signal=AbortSignal.timeout(10000);
  let raceNext=false;
  const observe=async(input:AbortSignal)=>{
    const snapshot=await observer.inspect(input);
    if(raceNext){raceNext=false;await writeFile(join(fixture.root,'note.ts'),'CONCURRENT_SOURCE_CANARY');}
    return {...snapshot,revision:1};
  };
  const freshness=new ModelTurnFreshness(fixture.root,policy,observe);
  try{
    const original='PRE_RACE_SOURCE_CANARY';
    await writeFile(join(fixture.root,'note.ts'),original);
    const before=await observe(signal);
    const oldCallId=randomUUID(),freshCallId=randomUUID();
    const oldHistory:NonNullable<ModelRequest['history']>=[
      {kind:'assistant',text:`Quoted ${original}`,calls:[{callId:oldCallId,toolId:'file.read',toolVersion:1,arguments:{path:'note.ts'}}]},
      {kind:'tool',result:{ok:true,callId:oldCallId,output:{path:'note.ts',content:original,contentHash:before.inputHashes?.['note.ts']??createHash('sha256').update(original).digest('hex')}}}
    ];
    const request:ModelRequest={runId:randomUUID(),task:'Inspect note.ts.',project:{id:randomUUID()},tools:[],context:[],previousToolResults:[],history:oldHistory};
    await freshness.refresh(request,signal);
    raceNext=true;
    const raced=await freshness.refresh(request,signal);
    expect(JSON.stringify(raced)).not.toContain(original);
    expect(raced.previousToolResults[0]).toMatchObject({ok:true,output:{status:'stale',needsFreshRead:true}});

    const content='CONCURRENT_SOURCE_CANARY';
    const current=await observer.inspect(signal);
    const withFreshRead:NonNullable<ModelRequest['history']>=[...oldHistory,
      {kind:'assistant',text:'Read after concurrent change.',calls:[{callId:freshCallId,toolId:'file.read',toolVersion:1,arguments:{path:'note.ts'}}]},
      {kind:'tool',result:{ok:true,callId:freshCallId,output:{path:'note.ts',content,contentHash:current.inputHashes?.['note.ts']??createHash('sha256').update(content).digest('hex')}}}
    ];
    const next=await freshness.refresh({...request,history:withFreshRead},signal);
    expect(JSON.stringify(next)).not.toContain(original);
    expect(next.history?.[2]).toMatchObject({kind:'assistant',text:'Read after concurrent change.',calls:[{callId:freshCallId,arguments:{path:'note.ts'}}]});
    expect(next.previousToolResults).toContainEqual(expect.objectContaining({ok:true,callId:freshCallId,output:expect.objectContaining({content})}));
  }finally{observer.close();await fixture.close();}
});
