import { describe, expect, it } from 'vitest';
import { collectModelResponse } from '@codryn/core';
import { GeminiAdapter, OpenAIResponsesAdapter, ProviderAdapterError } from '../src/index.js';
import { ProviderHttpError } from '../src/model/provider-transport.js';
import type { ProviderTransport } from '../src/model/provider-transport.js';
import { externalToolMap } from '../src/model/provider-tool-names.js';
import { modelRequestSchema } from '@codryn/shared';
import type { ModelRequest } from '@codryn/shared';

const ids = (() => {
  let index = 0;
  const values = [
    '91111111-1111-4111-8111-111111111111',
    '92222222-2222-4222-8222-222222222222'
  ];
  return { next: () => {
    const value = values[index++] ?? values[0];
    if (value === undefined) throw new Error('test id exhausted');
    return value;
  } };
})();

const request: ModelRequest = {
  runId: '93333333-3333-4333-8333-333333333333', task: 'Read the fixture.', project: { id: 'project' }, context: [],
  tools: [{ toolId: 'file.read', toolVersion: 1, description: 'Read a file.', inputSchema: { type: 'object' } }], previousToolResults: []
};

it('bounds prior conversation independently of tool history in the model contract', () => {
  const pair = [{ role: 'user', text: 'ě'.repeat(16_383) }, { role: 'assistant', text: 'ok' }];
  expect(modelRequestSchema.safeParse(request).success).toBe(true);
  expect(modelRequestSchema.safeParse({ ...request, priorConversation: pair }).success).toBe(true);
  expect(modelRequestSchema.safeParse({ ...request, priorConversation: [...pair, ...pair] }).success).toBe(false);
  expect(modelRequestSchema.safeParse({ ...request, priorConversation: [...pair].reverse() }).success).toBe(false);
  const tooMany = Array.from({ length: 9 }, () => [{ role: 'user', text: 'x' }, { role: 'assistant', text: 'y' }]).flat();
  expect(modelRequestSchema.safeParse({ ...request, priorConversation: tooMany }).success).toBe(false);
});

async function* failingStream(error: unknown): AsyncGenerator<unknown> {
  yield await Promise.reject(error);
}

function failingTransport(error: unknown): ProviderTransport {
  return { stream: () => failingStream(error) };
}

interface GeminiContentFixture {
  readonly role: string;
  readonly parts: readonly unknown[];
}

function geminiContents(sent: readonly unknown[], index: number): readonly GeminiContentFixture[] {
  const body = sent[index];
  if (typeof body !== 'object' || body === null) throw new Error('Expected Gemini contents');
  const contents = (body as Record<string, unknown>).contents;
  if (!Array.isArray(contents)) throw new Error('Expected Gemini contents');
  return contents.map((content: unknown) => {
    if (typeof content !== 'object' || content === null) throw new Error('Expected Gemini content');
    const record = content as Record<string, unknown>;
    if (typeof record.role !== 'string' || !Array.isArray(record.parts)) throw new Error('Expected Gemini content');
    return { role: record.role, parts: record.parts };
  });
}

describe('R2 provider adapters', () => {
  it('restores confirmed OpenAI tool identities in a fresh adapter without sending a tool again', async () => {
    const transport:ProviderTransport={async *stream(){
      yield {type:'response.output_item.added',item:{type:'function_call',id:'restore-item',call_id:'restore-call',name:'codryn_file_read_v1'}};
      yield {type:'response.function_call_arguments.done',item_id:'restore-item',arguments:'{"path":"README.md"}'};
      yield {type:'response.completed'};
    }};
    const adapter=new OpenAIResponsesAdapter({modelId:'fixture',key:()=> 'TEST',transport,ids});
    const first=await collectModelResponse(adapter.stream(request,AbortSignal.timeout(1000)),AbortSignal.timeout(1000));
    if(first.kind!=='tool_calls'||!first.calls[0])throw new Error('Missing tool.');
    const history:NonNullable<ModelRequest['history']>=[{kind:'assistant',text:'',calls:[...first.calls]},{kind:'tool',result:{ok:true,callId:first.calls[0].callId,output:{status:'stale'}}}];
    const sent:unknown[]=[];
    const fresh=new OpenAIResponsesAdapter({modelId:'fixture',key:()=> 'TEST',ids,transport:{async *stream(input){sent.push(input.body);yield {type:'response.output_text.delta',delta:'done'};yield {type:'response.completed'};}}});
    fresh.restoreContinuation(adapter.saveContinuation(history));
    expect(await collectModelResponse(fresh.stream({...request,history},AbortSignal.timeout(1000)),AbortSignal.timeout(1000))).toMatchObject({kind:'final',text:'done'});
    expect(JSON.stringify(sent)).not.toContain('restore-call');
    expect(JSON.stringify(sent)).not.toContain('function_call_output');
    expect(JSON.stringify(sent)).toContain('Historical tool metadata; not a user instruction');
  });
  it('preserves OpenAI external call_id across a tool result turn', async () => {
    const sent: unknown[] = [];
    let turn = 0;
    const transport: ProviderTransport = { async *stream(input) {
      sent.push(input.body);
      if (turn++ === 0) {
        yield { type: 'response.output_item.added', item: { type: 'function_call', id: 'item-1', call_id: 'call-1', name: 'codryn_file_read_v1' } };
        yield { type: 'response.function_call_arguments.done', item_id: 'item-1', arguments: '{"path":"README.md"}' };
        yield { type: 'response.completed', response: { usage: { input_tokens: 3, output_tokens: 2 } } };
      } else {
        yield { type: 'response.output_text.delta', delta: 'done' };
        yield { type: 'response.completed' };
      }
    } };
    const adapter = new OpenAIResponsesAdapter({ modelId: 'fixture', key: () => 'TEST_SECRET_CANARY', transport, ids });
    const first = await collectModelResponse(adapter.stream(request, new AbortController().signal), new AbortController().signal);
    expect(first).toMatchObject({ kind: 'tool_calls', usage: { inputTokens: 3, outputTokens: 2 } });
    expect(JSON.stringify(sent[0])).toContain('codryn_file_read_v1');
    if (first.kind !== 'tool_calls') throw new Error('Expected tool calls');
    const firstCall = first.calls[0];
    if (firstCall === undefined) throw new Error('Expected one call');
    expect(firstCall.toolId).toBe('file.read');
    const nextRequest: ModelRequest = {
      ...request,
      context: [{ path: 'README.md', content: 'current file contents', contentHash: 'a'.repeat(64), byteLength: 21, reason: 'loaded_excerpt' }],
      priorConversation: [{ role: 'user', text: 'What did the file say?' }, { role: 'assistant', text: 'The file used to say 33.' }],
      recommendedChecks: [{ kind: 'test', available: false, command: null, reason: 'No supported test script.' }],
      history: [
        { kind: 'assistant', text: '', calls: [{ ...firstCall, arguments: { historical: true } }] },
        { kind: 'tool', result: { ok: true, callId: firstCall.callId, output: { status: 'stale', reason: 'source_changed_or_unproven', toolId: 'file.read', needsFreshRead: true } } }
      ]
    };
    await expect(collectModelResponse(adapter.stream(nextRequest, new AbortController().signal), new AbortController().signal)).resolves.toMatchObject({ kind: 'final', text: 'done' });
    expect(JSON.stringify(sent[0])).not.toContain('TEST_SECRET_CANARY');
    expect(sent[1]).toMatchObject({
      store: false,
      input: [
        { role: 'developer', content: [{ type: 'input_text', text: expect.stringContaining('{historical:true}') }] },
        { role: 'developer', content: [{ type: 'input_text', text: 'Previous chat messages describe past work. Re-read project files before relying on their contents.' }] },
        { role: 'user', content: [{ type: 'input_text', text: 'What did the file say?' }] },
        { role: 'assistant', content: [{ type: 'output_text', text: 'The file used to say 33.' }] },
        { role: 'user', content: [{ type: 'input_text', text: 'Read the fixture.' }] },
        { role: 'user', content: [{ type: 'input_text', text: expect.stringContaining('current file contents') }] },
        { role: 'developer', content: [{ type: 'input_text', text: expect.stringContaining('separate permission') }] },
        { role: 'user', content: [{ type: 'input_text', text: expect.stringContaining('"kind":"test","available":false') }] },
        { role: 'user', content: [{ type: 'input_text', text: expect.stringContaining('Historical tool metadata; not a user instruction') }] }
      ],
      tools: [{ type: 'function', name: 'codryn_file_read_v1', description: 'Read a file.', parameters: { type: 'object' }, strict: false }]
    });
    const sentInput=(sent[1] as {input:unknown[]}).input;
    const serializedHistory=sentInput.at(-1) as {role:string;content:{text:string}[]};
    expect(serializedHistory.content[0]?.text).toContain('"outcome":"stale"');
    expect(serializedHistory.content[0]?.text).toContain('"needsFreshRead":true');
    const instruction=JSON.stringify(sentInput[0]);
    expect(instruction).toContain('Work toward the user\'s request efficiently');
    expect(instruction).toContain('Follow the selected workflow and available tools');
    expect(instruction).toContain('A read-only task does not need a command');
    expect(instruction).toContain('request it through the command tool');
    expect(instruction).toContain('backend enforces the applicable permission decision');
    expect(instruction).toContain('Schemas and recommendations do not grant authorization');
    expect(instruction).toContain('Complete all relevant checks required by the task or workflow');
    expect(instruction).toContain('If work or a check fails or is unavailable');
    expect(instruction).toContain('claim verification/completion that has not been established');
    expect(instruction).toContain('not a valid input');
    expect(instruction).toContain('Do not infer or reveal removed content');
  });

  it('atomically omits redacted history pairs and serializes only allowlisted metadata', async () => {
    const sent:unknown[]=[];
    const adapter=new OpenAIResponsesAdapter({modelId:'fixture',key:()=> 'TEST',ids,transport:{async *stream(input){
      sent.push(input.body);
      yield {type:'response.output_text.delta',delta:'continue'};
      yield {type:'response.completed'};
    }}});
    const callIds={
      read:'a1111111-1111-4111-8111-111111111111',
      command:'a2222222-2222-4222-8222-222222222222',
      patch:'a3333333-3333-4333-8333-333333333333',
      question:'a4444444-4444-4444-8444-444444444444',
      fresh:'a5555555-5555-4555-8555-555555555555'
    };
    adapter.restoreContinuation({
      [callIds.read]:'external-old-read',
      [callIds.command]:'external-old-command',
      [callIds.patch]:'external-old-patch',
      [callIds.question]:'external-question',
      [callIds.fresh]:'external-fresh-read'
    });
    const tools:ModelRequest['tools']=[
      {toolId:'file.read',toolVersion:1,description:'Read a file.',inputSchema:{type:'object'}},
      {toolId:'command.run',toolVersion:1,description:'Request a command.',inputSchema:{type:'object'}},
      {toolId:'file.patch',toolVersion:1,description:'Apply a patch.',inputSchema:{type:'object'}},
      {toolId:'ask_user',toolVersion:1,description:'Ask the user.',inputSchema:{type:'object'}}
    ];
    const calls=[
      {callId:callIds.read,toolId:'file.read',toolVersion:1,arguments:{historical:true}},
      {callId:callIds.command,toolId:'command.run',toolVersion:1,arguments:{historical:true}},
      {callId:callIds.patch,toolId:'file.patch',toolVersion:1,arguments:{historical:true}},
      {callId:callIds.question,toolId:'ask_user',toolVersion:1,arguments:{historical:true}},
      {callId:callIds.fresh,toolId:'file.read',toolVersion:1,arguments:{path:'current.ts'}}
    ] as const;
    const history:NonNullable<ModelRequest['history']>=[
      {kind:'assistant',text:'OLD_ASSISTANT_COMMENTARY_CANARY',calls:[...calls]},
      {kind:'tool',result:{ok:true,callId:callIds.read,output:{status:'stale',needsFreshRead:true,toolId:'untrusted.tool',path:'OLD_PATH_CANARY',content:'OLD_READ_CONTENT_CANARY'}}},
      {kind:'tool',result:{ok:true,callId:callIds.command,output:{status:'stale',needsFreshExecution:true,exitCode:0,stdout:'OLD_COMMAND_STDOUT_CANARY',stderr:'OLD_COMMAND_STDERR_CANARY'}}},
      {kind:'tool',result:{ok:true,callId:callIds.patch,output:{status:'applied',path:'OLD_PATCH_PATH_CANARY',beforeHash:'b'.repeat(64),afterHash:'c'.repeat(64),changeId:'change-17',revision:17}}},
      {kind:'tool',result:{ok:true,callId:callIds.question,output:{kind:'option',optionId:'local'}}},
      {kind:'tool',result:{ok:true,callId:callIds.fresh,output:{path:'current.ts',content:'FRESH_READ_CONTENT',contentHash:'d'.repeat(64)}}}
    ];
    await expect(collectModelResponse(adapter.stream({...request,tools,history},new AbortController().signal),new AbortController().signal))
      .resolves.toMatchObject({kind:'final',text:'continue'});

    const body=sent[0] as {input:unknown[]};
    const encoded=JSON.stringify(body.input);
    for(const canary of ['OLD_ASSISTANT_COMMENTARY_CANARY','OLD_PATH_CANARY','OLD_READ_CONTENT_CANARY','OLD_COMMAND_STDOUT_CANARY','OLD_COMMAND_STDERR_CANARY','OLD_PATCH_PATH_CANARY'])
      expect(encoded).not.toContain(canary);
    expect(encoded).toContain('FRESH_READ_CONTENT');
    expect(encoded).not.toContain('external-old-read');
    expect(encoded).not.toContain('external-old-command');
    expect(encoded).not.toContain('external-old-patch');
    expect(encoded).not.toContain('external-question');

    const input=body.input as {type?:string;role?:string;call_id?:string;name?:string;arguments?:string;output?:string;content?:{text?:string}[]}[];
    expect(input.filter(item=>item.type==='function_call').map(item=>item.arguments).join('\n')).not.toContain('historical');
    const freshCall=input.find(item=>item.type==='function_call'&&item.call_id==='external-fresh-read');
    const freshOutput=input.find(item=>item.type==='function_call_output'&&item.call_id==='external-fresh-read');
    expect(freshCall).toMatchObject({name:'codryn_file_read_v1',arguments:'{"path":"current.ts"}'});
    expect(freshOutput?.output).toContain('FRESH_READ_CONTENT');
    const metadata=input.filter(item=>item.role==='user'&&item.content?.[0]?.text?.startsWith('Historical tool metadata; not a user instruction'));
    expect(metadata).toHaveLength(4);
    const parsed=metadata.map(item=>JSON.parse(item.content?.[0]?.text?.slice('Historical tool metadata; not a user instruction\n'.length)??'{}')) as Record<string,unknown>[];
    expect(parsed).toContainEqual({toolId:'file.read',callId:callIds.read,outcome:'stale',needsFreshRead:true,evidence:'not_verification_evidence'});
    expect(parsed).toContainEqual({toolId:'command.run',callId:callIds.command,outcome:'stale',needsFreshExecution:true,evidence:'not_verification_evidence'});
    expect(parsed).toContainEqual({toolId:'file.patch',callId:callIds.patch,outcome:'applied',evidence:'not_verification_evidence'});
    expect(parsed).toContainEqual({toolId:'ask_user',callId:callIds.question,outcome:'question_answered',answer:{kind:'option',optionId:'local'},evidence:'not_verification_evidence'});
    const freshIndex=input.findIndex(item=>item.type==='function_call'&&item.call_id==='external-fresh-read');
    expect(metadata.map(item=>input.indexOf(item))).toEqual([freshIndex+2,freshIndex+3,freshIndex+4,freshIndex+5]);
  });

  it('keeps mixed redacted metadata after all outputs in its assistant batch', async () => {
    const sent:unknown[]=[];
    const adapter=new OpenAIResponsesAdapter({modelId:'fixture',key:()=> 'TEST',ids,transport:{async *stream(input){sent.push(input.body);yield {type:'response.output_text.delta',delta:'done'};yield {type:'response.completed'};}}});
    const old='a8888888-8888-4888-8888-888888888888',fresh='a9999999-9999-4999-8999-999999999999';
    adapter.restoreContinuation({[old]:'external-old',[fresh]:'external-fresh'});
    const req:ModelRequest={...request,tools:[
      {toolId:'file.read',toolVersion:1,description:'Read.',inputSchema:{type:'object'}},
      {toolId:'command.run',toolVersion:1,description:'Run.',inputSchema:{type:'object'}}
    ],history:[
      {kind:'assistant',text:'',calls:[
        {callId:old,toolId:'file.read',toolVersion:1,arguments:{historical:true}},
        {callId:fresh,toolId:'command.run',toolVersion:1,arguments:{command:'safe'}}
      ]},
      {kind:'tool',result:{ok:true,callId:old,output:{status:'stale',content:'SECRET_CANARY'}}},
      {kind:'tool',result:{ok:true,callId:fresh,output:{status:'succeeded',exitCode:0,stdout:'fresh-output',stderr:'',truncated:false,durationMs:2,treeStopped:true}}},
      {kind:'assistant',text:'next turn',calls:[]}
    ]};
    await collectModelResponse(adapter.stream(req,new AbortController().signal),new AbortController().signal);
    const input=(sent[0] as {input:{type?:string;role?:string;call_id?:string;content?:{text?:string}[]}[]}).input;
    const outputIndex=input.findIndex(item=>item.type==='function_call_output'&&item.call_id==='external-fresh');
    const metadataIndex=input.findIndex(item=>item.role==='user'&&item.content?.[0]?.text?.startsWith('Historical tool metadata;'));
    const nextTurnIndex=input.findIndex(item=>item.role==='assistant'&&item.content?.[0]?.text==='next turn');
    expect(outputIndex).toBeGreaterThan(-1);
    expect(metadataIndex).toBeGreaterThan(outputIndex);
    expect(nextTurnIndex).toBeGreaterThan(metadataIndex);
    expect(JSON.stringify(input)).not.toContain('SECRET_CANARY');
  });

  it.each(['orphan-result','orphan-call','duplicate-result'] as const)('rejects redacted history with %s', async defect => {
    const adapter=new OpenAIResponsesAdapter({modelId:'fixture',key:()=> 'TEST',ids,transport:{async *stream(){yield {type:'response.completed'};}}});
    const callId='abbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    adapter.restoreContinuation({[callId]:'external-redacted'});
    const call={callId,toolId:'file.read',toolVersion:1,arguments:{historical:true}};
    const result={kind:'tool' as const,result:{ok:true as const,callId,output:{status:'stale'}}};
    const history:NonNullable<ModelRequest['history']>=defect==='orphan-result'?[result]:defect==='orphan-call'?[{kind:'assistant',text:'',calls:[call]}]:[{kind:'assistant',text:'',calls:[call]},result,result];
    await expect((async()=>{for await(const event of adapter.stream({...request,tools:[{toolId:'file.read',toolVersion:1,description:'Read.',inputSchema:{type:'object'}}],history},new AbortController().signal)) void event;})()).rejects.toMatchObject({code:'invalid_tool_call'});
  });

  it('preserves a valid ask_user checkpoint pair with its user answer', async () => {
    const sent:unknown[]=[];
    const adapter=new OpenAIResponsesAdapter({modelId:'fixture',key:()=> 'TEST',ids,transport:{async *stream(input){
      sent.push(input.body);
      yield {type:'response.output_text.delta',delta:'continue'};
      yield {type:'response.completed'};
    }}});
    const callId='a7777777-7777-4777-8777-777777777777';
    adapter.restoreContinuation({[callId]:'external-question-preserved'});
    const questionRequest:ModelRequest={...request,
      tools:[{toolId:'ask_user',toolVersion:1,description:'Ask a question.',inputSchema:{type:'object'}}],
      history:[
        {kind:'assistant',text:'',calls:[{callId,toolId:'ask_user',toolVersion:1,arguments:{reason:'Choose scope.',prompt:'Where should state live?',options:[{id:'local',label:'Local'},{id:'shared',label:'Shared'}]}}]},
        {kind:'tool',result:{ok:true,callId,output:{kind:'option',optionId:'local'}}}
      ]
    };
    await collectModelResponse(adapter.stream(questionRequest,new AbortController().signal),new AbortController().signal);
    const input=(sent[0] as {input:unknown[]}).input as {type?:string;call_id?:string;arguments?:string;output?:string}[];
    expect(input.slice(-2)).toMatchObject([
      expect.objectContaining({type:'function_call',call_id:'external-question-preserved'}),
      expect.objectContaining({type:'function_call_output',call_id:'external-question-preserved'})
    ]);
    expect(input.at(-2)?.arguments).toContain('Where should state live?');
    expect(input.at(-1)?.output).toContain('"optionId":"local"');
  });

  it.each([
    {
      selection:'planning@1.0.0',
      instructions:'Produce a read-only plan with explicit verification steps. Do not run commands.',
      task:'Plan the change.',
      tools:[{toolId:'file.read',toolVersion:1,description:'Read a file.',inputSchema:{type:'object'}}],
      names:['codryn_file_read_v1']
    },
    {
      selection:'verification@1.0.0',
      instructions:'Run the available typecheck and test candidates through command.run. Report each actual result.',
      task:'Verify the existing change.',
      tools:[
        {toolId:'file.read',toolVersion:1,description:'Read a file.',inputSchema:{type:'object'}},
        {toolId:'command.run',toolVersion:1,description:'Request a bounded project command.',inputSchema:{type:'object'}}
      ],
      names:['codryn_file_read_v1','codryn_command_run_v1']
    }
  ])('keeps the $selection workflow ahead of general guidance and bounds its tools', async workflow=>{
    const sent:unknown[]=[];
    const adapter=new OpenAIResponsesAdapter({modelId:'fixture',key:()=> 'TEST',ids,transport:{async *stream(input){
      sent.push(input.body);
      yield {type:'response.output_text.delta',delta:'done'};
      yield {type:'response.completed'};
    }}});
    const workflowRequest:ModelRequest={...request,task:workflow.task,tools:workflow.tools,workflowInstructions:workflow.instructions};
    await expect(collectModelResponse(adapter.stream(workflowRequest,new AbortController().signal),new AbortController().signal))
      .resolves.toMatchObject({kind:'final',text:'done'});
    const body=sent[0] as {input:unknown[];tools:{name:string}[]};
    expect(body.input[0]).toMatchObject({role:'developer',content:[{type:'input_text',text:workflow.instructions}]});
    expect(body.input[1]).toMatchObject({role:'developer',content:[{type:'input_text',text:expect.stringContaining('Complete all relevant checks required by the task or workflow')} ]});
    expect(body.input[2]).toMatchObject({role:'user',content:[{type:'input_text',text:workflow.task}]});
    expect(body.tools.map(tool=>tool.name)).toEqual(workflow.names);
    if(workflow.selection==='planning@1.0.0')expect(body.tools.some(tool=>tool.name==='codryn_command_run_v1')).toBe(false);
  });

  it('maps Gemini functionCall and sends a functionResponse on the next turn', async () => {
    const sent: unknown[] = [];
    let turn = 0;
    const transport: ProviderTransport = { async *stream(input) {
      sent.push(input.body);
      if (turn++ === 0) {
        yield {
          candidates: [{
            content: {
              role: 'model',
              parts: [{ functionCall: { name: 'codryn_file_read_v1', args: { path: 'README.md' } } }]
            }
          }],
          usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2 }
        };
        yield { candidates: [{ content: { parts: [{ text: '' }] }, finishReason: 'STOP' }] };
      } else yield { candidates: [{ content: { parts: [{ text: 'done' }] }, finishReason: 'STOP' }] };
    } };
    const adapter = new GeminiAdapter({ modelId: 'fixture', key: () => 'TEST_SECRET_CANARY', transport, ids });
    const first = await collectModelResponse(adapter.stream(request, new AbortController().signal), new AbortController().signal);
    expect(first).toMatchObject({ kind: 'tool_calls', usage: { inputTokens: 4, outputTokens: 2 } });
    expect(JSON.stringify(sent[0])).toContain('codryn_file_read_v1');
    if (first.kind !== 'tool_calls') throw new Error('Expected tool calls');
    const firstCall = first.calls[0];
    if (firstCall === undefined) throw new Error('Expected one call');
    expect(firstCall.toolId).toBe('file.read');
    const nextRequest: ModelRequest = { ...request, history: [{ kind: 'assistant', text: '', calls: [...first.calls] }, { kind: 'tool', result: { ok: true, callId: firstCall.callId, output: { content: 'safe' } } }] };
    await collectModelResponse(adapter.stream(nextRequest, new AbortController().signal), new AbortController().signal);
    expect(JSON.stringify(sent[1])).toContain('functionResponse');
    expect(JSON.stringify(sent)).not.toContain('TEST_SECRET_CANARY');
  });

  it('sends the Gemini API key only in the x-goog-api-key header', async () => {
    let sent: Parameters<ProviderTransport['stream']>[0] | undefined;
    const transport: ProviderTransport = { async *stream(input) {
      sent = input;
      yield { candidates: [{ content: { parts: [{ text: 'done' }] }, finishReason: 'STOP' }] };
    } };
    const adapter = new GeminiAdapter({ modelId: 'fixture', key: () => 'TEST_SECRET_CANARY', transport, ids });

    await collectModelResponse(adapter.stream(request, new AbortController().signal), new AbortController().signal);

    if (sent === undefined) throw new Error('Expected a Gemini request');
    expect(new URL(sent.url).searchParams.has('key')).toBe(false);
    expect(sent.url).not.toContain('TEST_SECRET_CANARY');
    expect(sent.headers['x-goog-api-key']).toBe('TEST_SECRET_CANARY');
  });

  it('removes JSON Schema keywords unsupported by Gemini function declarations', async () => {
    const sent: unknown[] = [];
    const transport: ProviderTransport = { async *stream(input) {
      sent.push(input.body);
      yield { candidates: [{ content: { parts: [{ text: 'done' }] }, finishReason: 'STOP' }] };
    } };
    const adapter = new GeminiAdapter({ modelId: 'fixture', key: () => 'key', transport, ids });
    const firstTool = request.tools[0];
    if (firstTool === undefined) throw new Error('Expected one request tool');
    const schemaRequest: ModelRequest = {
      ...request,
      tools: [{ ...firstTool, inputSchema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', additionalProperties: false,
        properties: { value: { type: 'number', exclusiveMinimum: 0 } }
      } }]
    };

    await collectModelResponse(adapter.stream(schemaRequest, new AbortController().signal), new AbortController().signal);

    expect(JSON.stringify(sent[0])).not.toContain('$schema');
    expect(JSON.stringify(sent[0])).not.toContain('additionalProperties');
    expect(JSON.stringify(sent[0])).not.toContain('exclusiveMinimum');
  });

  it('sets the configured Gemini thinking level in generationConfig', async () => {
    const sent: unknown[] = [];
    const transport: ProviderTransport = { async *stream(input) {
      sent.push(input.body);
      yield { candidates: [{ content: { parts: [{ text: 'done' }] }, finishReason: 'STOP' }] };
    } };
    const adapter = new GeminiAdapter({ modelId: 'gemini-3.6-flash', key: () => 'key', transport, ids, thinkingLevel: 'minimal' });

    await collectModelResponse(adapter.stream(request, new AbortController().signal), new AbortController().signal);

    expect(sent[0]).toMatchObject({ generationConfig: { thinkingConfig: { thinkingLevel: 'minimal' } } });
    expect(sent[0]).not.toMatchObject({ generationConfig: { temperature: expect.anything() } });
  });

  it('rejects provider-invented function names before the harness can see a call', async () => {
    const openai = new OpenAIResponsesAdapter({
      modelId: 'fixture', key: () => 'key', ids,
      transport: { async *stream() {
        yield { type: 'response.output_item.added', item: { type: 'function_call', id: 'item-unknown', call_id: 'call-unknown', name: 'codryn_invented_v1' } };
      } }
    });
    await expect((async () => { for await (const event of openai.stream(request, new AbortController().signal)) { void event; } })())
      .rejects.toMatchObject({ code: 'invalid_tool_call' });

    const gemini = new GeminiAdapter({
      modelId: 'fixture', key: () => 'key', ids,
      transport: { async *stream() {
        yield { candidates: [{ content: { parts: [{ functionCall: { name: 'codryn_invented_v1', args: {} } }] } }] };
      } }
    });
    await expect((async () => { for await (const event of gemini.stream(request, new AbortController().signal)) { void event; } })())
      .rejects.toMatchObject({ code: 'invalid_tool_call' });
  });

  it('serializes complete Gemini parts per run turn and returns each matching function call id', async () => {
    const sent: unknown[] = [];
    let turn = 0;
    const localIds = (() => {
      const values = [
        'a1111111-1111-4111-8111-111111111111',
        'a2222222-2222-4222-8222-222222222222'
      ];
      let index = 0;
      return { next: () => values[index++] ?? 'a1111111-1111-4111-8111-111111111111' };
    })();
    const transport: ProviderTransport = { async *stream(input) {
      sent.push(input.body);
      if (turn++ === 0) {
        yield { candidates: [{ content: { role: 'model', parts: [{ text: 'First ' }] } }] };
        yield { candidates: [{ content: { role: 'model', parts: [{ text: 'turn' }, { thoughtSignature: 'opaque-thought-1', functionCall: { id: 'gemini-call-1', name: 'codryn_file_read_v1', args: { path: 'first.md' } } }] }, finishReason: 'STOP' }] };
      } else if (turn === 2) {
        yield { candidates: [{ content: { role: 'model', parts: [{ functionCall: { id: 'gemini-call-2', name: 'codryn_file_read_v1', args: { path: 'second.md' } } }] }, finishReason: 'STOP' }] };
      } else {
        yield { candidates: [{ content: { role: 'model', parts: [{ text: 'done' }] }, finishReason: 'STOP' }] };
      }
    } };
    const adapter = new GeminiAdapter({ modelId: 'fixture', key: () => 'key', transport, ids: localIds });

    const first = await collectModelResponse(adapter.stream(request, new AbortController().signal), new AbortController().signal, { allowCommentaryWithToolCalls: true });
    if (first.kind !== 'tool_calls') throw new Error('Expected first tool call');
    const firstCall = first.calls[0];
    if (firstCall === undefined) throw new Error('Expected first call details');
    const secondRequest: ModelRequest = {
      ...request,
      history: [
        { kind: 'assistant', text: 'First turn', calls: [...first.calls] },
        { kind: 'tool', result: { ok: true, callId: firstCall.callId, output: { content: 'first' } } }
      ]
    };
    const second = await collectModelResponse(adapter.stream(secondRequest, new AbortController().signal), new AbortController().signal);
    if (second.kind !== 'tool_calls') throw new Error('Expected second tool call');
    const secondCall = second.calls[0];
    if (secondCall === undefined) throw new Error('Expected second call details');
    const thirdRequest: ModelRequest = {
      ...request,
      history: [
        ...(secondRequest.history ?? []),
        { kind: 'assistant', text: '', calls: [...second.calls] },
        { kind: 'tool', result: { ok: true, callId: secondCall.callId, output: { content: 'second' } } }
      ]
    };

    await expect(collectModelResponse(adapter.stream(thirdRequest, new AbortController().signal), new AbortController().signal)).resolves.toMatchObject({ kind: 'final', text: 'done' });

    expect(geminiContents(sent, 2)).toEqual([
      { role: 'user', parts: [{ text: 'Read the fixture.' }] },
      { role: 'model', parts: [
        { text: 'First ' },
        { text: 'turn' },
        { thoughtSignature: 'opaque-thought-1', functionCall: { id: 'gemini-call-1', name: 'codryn_file_read_v1', args: { path: 'first.md' } } }
      ] },
      { role: 'user', parts: [{ functionResponse: { name: 'codryn_file_read_v1', id: 'gemini-call-1', response: { result: { ok: true, callId: firstCall.callId, output: { content: 'first' } } } } }] },
      { role: 'model', parts: [{ functionCall: { id: 'gemini-call-2', name: 'codryn_file_read_v1', args: { path: 'second.md' } } }] },
      { role: 'user', parts: [{ functionResponse: { name: 'codryn_file_read_v1', id: 'gemini-call-2', response: { result: { ok: true, callId: secondCall.callId, output: { content: 'second' } } } } }] }
    ]);
  });

  it.each([
    ['ends without a finish reason', undefined],
    ['ends at the token limit', 'MAX_TOKENS']
  ])('buffers Gemini output when the provider %s', async (_label, finishReason) => {
    const emitted: unknown[] = [];
    const adapter = new GeminiAdapter({
      modelId: 'fixture', key: () => 'key', ids,
      transport: { async *stream() {
        yield {
          candidates: [{
            content: { parts: [{ text: 'partial' }, { functionCall: { id: 'unfinished-call', name: 'codryn_file_read_v1', args: { path: 'partial.md' } } }] },
            ...(finishReason === undefined ? {} : { finishReason })
          }]
        };
      } }
    });

    await expect((async () => {
      for await (const event of adapter.stream(request, new AbortController().signal)) emitted.push(event);
    })()).rejects.toMatchObject({ code: 'provider_error' });
    expect(emitted).toEqual([]);
  });

  it('rejects Gemini model parts after STOP without emitting a response', async () => {
    const emitted: unknown[] = [];
    const adapter = new GeminiAdapter({
      modelId: 'fixture', key: () => 'key', ids,
      transport: { async *stream() {
        yield { candidates: [{ content: { parts: [{ text: 'done' }] }, finishReason: 'STOP' }] };
        yield { candidates: [{ content: { parts: [{ text: 'late' }] } }] };
      } }
    });

    await expect((async () => {
      for await (const event of adapter.stream(request, new AbortController().signal)) emitted.push(event);
    })()).rejects.toMatchObject({ code: 'provider_error' });
    expect(emitted).toEqual([]);
  });

  it('keeps interleaved Gemini run histories isolated after a multi-chunk transport failure', async () => {
    const sent: unknown[] = [];
    const runA: ModelRequest = { ...request, runId: 'a3333333-3333-4333-8333-333333333333' };
    const runB: ModelRequest = { ...request, runId: 'b3333333-3333-4333-8333-333333333333' };
    let turn = 0;
    const transport: ProviderTransport = { async *stream(input) {
      sent.push(input.body);
      if (turn++ === 0) yield { candidates: [{ content: { parts: [{ thoughtSignature: 'thought-a', functionCall: { id: 'provider-a', name: 'codryn_file_read_v1', args: { path: 'a.md' } } }] }, finishReason: 'STOP' }] };
      else if (turn === 2) yield { candidates: [{ content: { parts: [{ functionCall: { id: 'provider-b', name: 'codryn_file_read_v1', args: { path: 'b.md' } } }] }, finishReason: 'STOP' }] };
      else if (turn === 3) {
        yield { candidates: [{ content: { parts: [{ text: 'partial ' }] } }] };
        yield { candidates: [{ content: { parts: [{ thoughtSignature: 'discard-this' }] } }] };
        throw new Error('transport disconnected');
      } else yield { candidates: [{ content: { parts: [{ text: 'recovered' }] }, finishReason: 'STOP' }] };
    } };
    const adapter = new GeminiAdapter({ modelId: 'fixture', key: () => 'key', transport, ids });
    const first = await collectModelResponse(adapter.stream(runA, new AbortController().signal), new AbortController().signal);
    const second = await collectModelResponse(adapter.stream(runB, new AbortController().signal), new AbortController().signal);
    if (first.kind !== 'tool_calls' || second.kind !== 'tool_calls') throw new Error('Expected tool calls');
    const firstCall = first.calls[0];
    if (firstCall === undefined) throw new Error('Expected first call');
    const resumeA: ModelRequest = { ...runA, history: [
      { kind: 'assistant', text: '', calls: [...first.calls] },
      { kind: 'tool', result: { ok: true, callId: firstCall.callId, output: { content: 'a result' } } }
    ] };
    const emitted: unknown[] = [];
    await expect((async () => {
      for await (const event of adapter.stream(resumeA, new AbortController().signal)) emitted.push(event);
    })()).rejects.toMatchObject({ code: 'provider_error' });
    expect(emitted).toEqual([]);

    await expect(collectModelResponse(adapter.stream(resumeA, new AbortController().signal), new AbortController().signal)).resolves.toMatchObject({ kind: 'final', text: 'recovered' });
    expect(geminiContents(sent, 3)).toEqual([
      { role: 'user', parts: [{ text: 'Read the fixture.' }] },
      { role: 'model', parts: [{ thoughtSignature: 'thought-a', functionCall: { id: 'provider-a', name: 'codryn_file_read_v1', args: { path: 'a.md' } } }] },
      { role: 'user', parts: [{ functionResponse: { name: 'codryn_file_read_v1', id: 'provider-a', response: { result: { ok: true, callId: firstCall.callId, output: { content: 'a result' } } } } }] }
    ]);
  });

  it('rejects concurrent Gemini streams for one run', async () => {
    let release: () => void = () => undefined;
    const unblock = new Promise<void>((resolve) => { release = resolve; });
    let started: () => void = () => undefined;
    const startedStream = new Promise<void>((resolve) => { started = resolve; });
    let streamCount = 0;
    const adapter = new GeminiAdapter({
      modelId: 'fixture', key: () => 'key', ids,
      transport: { async *stream() {
        if (streamCount++ === 0) {
          started();
          await unblock;
        }
        yield { candidates: [{ content: { parts: [{ text: 'done' }] }, finishReason: 'STOP' }] };
      } }
    });
    const first = (async () => {
      for await (const event of adapter.stream(request, new AbortController().signal)) void event;
    })();
    await startedStream;

    let concurrentError: unknown;
    try {
      for await (const event of adapter.stream(request, new AbortController().signal)) void event;
    } catch (error) { concurrentError = error; }
    release();
    await expect(first).resolves.toBeUndefined();
    expect(concurrentError).toMatchObject({ code: 'provider_error' });
  });

  it('evicts the oldest unfinished Gemini run history', async () => {
    let calls = 0;
    const adapter = new GeminiAdapter({
      modelId: 'fixture', key: () => 'key', ids,
      transport: { async *stream() {
        calls += 1;
        yield { candidates: [{ content: { parts: [{ functionCall: { id: `provider-${calls}`, name: 'codryn_file_read_v1', args: { path: `${calls}.md` } } }] }, finishReason: 'STOP' }] };
      } }
    });
    let oldest: { readonly request: ModelRequest; readonly callId: string } | undefined;
    for (let index = 0; index < 33; index += 1) {
      const run = { ...request, runId: `a${index.toString(16).padStart(7, '0')}-1111-4111-8111-111111111111` };
      const response = await collectModelResponse(adapter.stream(run, new AbortController().signal), new AbortController().signal);
      if (response.kind !== 'tool_calls') throw new Error('Expected tool call');
      const call = response.calls[0];
      if (call === undefined) throw new Error('Expected call details');
      if (index === 0) oldest = { request: run, callId: call.callId };
    }
    if (oldest === undefined) throw new Error('Expected oldest run');
    const oldHistory: ModelRequest = { ...oldest.request, history: [
      { kind: 'assistant', text: '', calls: [{ callId: oldest.callId, toolId: 'file.read', toolVersion: 1, arguments: { path: '1.md' } }] },
      { kind: 'tool', result: { ok: true, callId: oldest.callId, output: { content: 'old' } } }
    ] };
    await expect((async () => {
      for await (const event of adapter.stream(oldHistory, new AbortController().signal)) void event;
    })()).rejects.toMatchObject({ code: 'invalid_tool_call' });
  });

  it('cleans Gemini run state after a final turn', async () => {
    let turn = 0;
    const sent: unknown[] = [];
    const adapter = new GeminiAdapter({
      modelId: 'fixture', key: () => 'key', ids,
      transport: { async *stream(input) {
        sent.push(input.body);
        if (turn++ === 0) yield { candidates: [{ content: { parts: [{ functionCall: { id: 'cleanup-call', name: 'codryn_file_read_v1', args: { path: 'cleanup.md' } } }] }, finishReason: 'STOP' }] };
        else yield { candidates: [{ content: { parts: [{ text: 'done' }] }, finishReason: 'STOP' }] };
      } }
    });
    const first = await collectModelResponse(adapter.stream(request, new AbortController().signal), new AbortController().signal);
    if (first.kind !== 'tool_calls') throw new Error('Expected tool call');
    const call = first.calls[0];
    if (call === undefined) throw new Error('Expected call details');
    const history: ModelRequest = { ...request, history: [
      { kind: 'assistant', text: '', calls: [...first.calls] },
      { kind: 'tool', result: { ok: true, callId: call.callId, output: { content: 'cleanup' } } }
    ] };
    await expect(collectModelResponse(adapter.stream(history, new AbortController().signal), new AbortController().signal)).resolves.toMatchObject({ kind: 'final', text: 'done' });
    await expect((async () => {
      for await (const event of adapter.stream(history, new AbortController().signal)) void event;
    })()).rejects.toMatchObject({ code: 'invalid_tool_call' });
    expect(sent).toHaveLength(2);
  });

  it('rejects internal tool IDs that would collide at the provider boundary', () => {
    expect(() => externalToolMap([
      { toolId: 'file.read', toolVersion: 1, description: 'one', inputSchema: {} },
      { toolId: 'file_read', toolVersion: 1, description: 'two', inputSchema: {} }
    ])).toThrow(ProviderAdapterError);
  });

  it('retains only the HTTP status when normalizing an OpenAI provider error', async () => {
    const adapter = new OpenAIResponsesAdapter({
      modelId: 'fixture', key: () => 'key', ids,
      transport: failingTransport(new ProviderHttpError(404))
    });

    await expect((async () => {
      for await (const event of adapter.stream(request, new AbortController().signal)) void event;
    })()).rejects.toMatchObject({ code: 'provider_error', httpStatus: 404, message: 'Model provider request failed.' });
  });

  it.each([
    ['status field', Object.assign(new Error('private provider detail'), { status: 429 })],
    ['numeric code', Object.assign(new Error('private provider detail'), { code: 429 })],
    ['nested numeric code', Object.assign(new Error('private provider detail'), { error: { code: 429 } })]
  ])('does not report a generic %s as an HTTP response status', async (_label, error) => {
    const adapter = new OpenAIResponsesAdapter({
      modelId: 'fixture', key: () => 'key', ids,
      transport: failingTransport(error)
    });

    await expect((async () => {
      for await (const event of adapter.stream(request, new AbortController().signal)) void event;
    })()).rejects.toMatchObject({ code: 'rate_limit', httpStatus: null, message: 'Model provider request failed.' });
  });

  it.each([
    ['OpenAI auth', new OpenAIResponsesAdapter({ modelId: 'fixture', key: () => 'key', ids, transport: failingTransport(Object.assign(new Error('unauthorized'), { status: 401 })) }), 'auth'],
    ['OpenAI rate limit', new OpenAIResponsesAdapter({ modelId: 'fixture', key: () => 'key', ids, transport: failingTransport(Object.assign(new Error('limited'), { status: 429 })) }), 'rate_limit'],
    ['Gemini auth', new GeminiAdapter({ modelId: 'fixture', key: () => 'key', ids, transport: failingTransport(Object.assign(new Error('unauthenticated'), { code: 401 })) }), 'auth'],
    ['Gemini rate limit', new GeminiAdapter({ modelId: 'fixture', key: () => 'key', ids, transport: failingTransport(Object.assign(new Error('limited'), { error: { code: 429 } })) }), 'rate_limit']
  ])('normalizes %s', async (_label, adapter, code) => {
    await expect((async () => {
      for await (const event of adapter.stream(request, new AbortController().signal)) void event;
    })()).rejects.toMatchObject({ code, httpStatus: null });
  });
});
