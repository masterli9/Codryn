import { randomUUID, createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createR2Project } from '@codryn/test-support';
import type { ModelRequest } from '@codryn/shared';
import { ModelTurnFreshness } from '../src/context/model-turn-freshness.js';
import { ContextPathPolicy } from '../src/filesystem/context-path-policy.js';
import { FileWorkspaceObserver } from '../src/filesystem/workspace-observer.js';
const marker = 'STALE_CONTEXT_CANARY';
const hash = createHash('sha256').update(marker).digest('hex');
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
