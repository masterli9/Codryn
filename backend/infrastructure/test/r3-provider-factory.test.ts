import { randomUUID } from 'node:crypto';
import { expect,it } from 'vitest';
import { testProviderConnection } from '../src/model/provider-connection-test.js';
import { createR3Provider } from '../src/model/r3-provider-factory.js';
import type { ProviderTransport } from '../src/model/provider-transport.js';
it('sends exactly one bounded synthetic request without project data or tools',async()=>{
  const requests:unknown[]=[];
  const transport:ProviderTransport={async *stream(request){
    requests.push(request.body);
    yield {type:'response.output_text.delta',delta:'OK'};
    yield {type:'response.completed',response:{usage:{input_tokens:1,output_tokens:1}}};
  }};
  expect(await testProviderConnection('synthetic',new AbortController().signal,{transport})).toMatchObject({passed:true,category:null});
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({model:'gpt-6-luna',store:false,max_output_tokens:32,tools:[],input:[
    {role:'developer',content:[{type:'input_text',text:expect.stringContaining('Use actual tool results.')}]},
    {role:'user',content:[{type:'input_text',text:'Reply with OK.'}]}
  ]});
});
it('never reads a key in demo mode and rejects an unsupported folder without network or patch',async()=>{
  let reads=0;const secrets={read:async()=>{reads++;return 'synthetic';},state:async()=> 'stored' as const,save:async()=>undefined,remove:async()=>undefined};
  await expect(createR3Provider({mode:'demo',secrets,ids:{next:()=>randomUUID()},projectRoot:'does-not-exist'})).rejects.toThrow('R3_DEMO_UNSUPPORTED');expect(reads).toBe(0);
});
