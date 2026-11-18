import { createHash, randomUUID, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { r3ModelDescriptor, type ModelAdapter, type SecretProtector } from '@codryn/core';
import { createR3Infrastructure, createDesktopRuntimeFactory, FetchProviderTransport, OpenAIResponsesAdapter, UuidGenerator } from '@codryn/infrastructure';
import type { ProviderTransport } from '@codryn/infrastructure';
import { builtinWorkflowSchema, type ModelRequest, type JsonValue } from '@codryn/shared';
import { sourceHash } from './r3-build-identity.mjs';
import { r4EvalReportSchema } from './r4-eval-report.mjs';
import { R4RequestBudget } from './r4-eval-budget.mjs';

interface EvalCase { id: string; mode: 'git'|'non-git'; variant: string; prompt: string; expected: string; workflow?: string }
const args = process.argv.slice(2);
const value = (flag: string) => {const index=args.indexOf(flag);return index<0?undefined:args[index+1];};
const live = args.includes('--live');
const maxRequests = live ? Number(value('--max-requests')) : 0;
const maxCost = live ? Number(value('--max-cost-usd')) : 0;
const inputPrice = Number(value('--input-usd-per-million'));
const outputPrice = Number(value('--output-usd-per-million'));
const budget = live ? new R4RequestBudget({maxRequests,maxCostUsd:maxCost,inputPrice,outputPrice}) : null;
const datasetBytes = await readFile('tests/support/r4-eval/dataset-v1.json');
const dataset = JSON.parse(datasetBytes.toString('utf8')) as { schemaVersion: number; maxSteps: number; cases: EvalCase[] };
if (dataset.schemaVersion !== 1 || dataset.cases.length !== 9 || new Set(dataset.cases.map(item => item.id)).size !== 9) throw new Error('R4_EVAL_DATASET_INVALID');
const key = live ? process.env.R2_PROVIDER_API_KEY ?? '' : '';
if (live && (!args.includes('--confirm-paid-api') || value('--consent-version')!=='openai-api-2026-11-14'
  || !key || !Number.isFinite(maxCost) || maxCost <= 0 || !Number.isInteger(maxRequests) || maxRequests < 1 || maxRequests>100
  || !(inputPrice>0) || !(outputPrice>0) || !/^https:\/\//u.test(value('--pricing-source')??''))) throw new Error('R4_EVAL_NOT_AUTHORIZED');
const results: Record<string, unknown>[] = [];
const root = await realpath(await mkdtemp(join(tmpdir(), 'codryn-r4-eval-')));
const fixtureSource = 'export function nextCount(value: number) { return value - 1; }\n';
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');

// Test-owned profiles use an ephemeral authenticated key. No provider key is
// persisted in plaintext or included in the exported report.
const encryptionKey = randomBytes(32);
const protector: SecretProtector = {
  async available() { return true; },
  async encrypt(text) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
    const bytes = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), bytes]);
  },
  async decrypt(input) {
    const bytes = Buffer.from(input), decipher = createDecipheriv('aes-256-gcm', encryptionKey, bytes.subarray(0,12));
    decipher.setAuthTag(bytes.subarray(12,28));
    return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8');
  }
};

try {
  for (const item of dataset.cases) {
    const started = performance.now(), projectRoot = join(root,item.id), profile = join(root,item.id+'-profile');
    await mkdir(join(projectRoot,'src'),{recursive:true});
    await mkdir(join(projectRoot,'private'));
    await writeFile(join(projectRoot,'src/counter.ts'), item.variant==='verification' ? fixtureSource.replace('value - 1','value + 1') : fixtureSource);
    await writeFile(join(projectRoot,'src/Counter.tsx'), 'import { nextCount } from "./counter";\nexport const Counter = () => <button>{nextCount(1)}</button>;\n');
    await writeFile(join(projectRoot,'counter.test.mjs'), 'import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { nextCount } from "./src/counter.ts";\ntest("increments",()=>assert.equal(nextCount(1),2));\n');
    await writeFile(join(projectRoot,'package.json'),JSON.stringify({type:'module',scripts:{test:'node --test',typecheck:'tsc --noEmit'},devDependencies:{typescript:'6.0.3'}}));
    await writeFile(join(projectRoot,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',strict:true},include:['src/counter.ts']}));
    await writeFile(join(projectRoot,'.codrynignore'),'private/\n');
    await writeFile(join(projectRoot,'private/data.txt'),'SYNTHETIC_IGNORED_MARKER');
    if(item.mode==='git')for(const command of [['init','-b','main'],['config','user.name','R4 Eval'],['config','user.email','r4@invalid.local'],['add','.'],['commit','-m','fixture']]){
      execFileSync('git',command,{cwd:projectRoot,windowsHide:true,timeout:5000,stdio:'ignore'});
    }
    const trace: {toolId:string}[] = [], captured:ModelRequest[]=[];
    let inputTokens=0,outputTokens=0,reasoningTokens=0,usageKnown=true,reasoningKnown=true,actualCost=0,requestCount=0;
    let budgetHit=false,validArguments=0;
    const transport:ProviderTransport={async *stream(request,signal){
      if(!budget)throw new Error('R4_EVAL_NOT_AUTHORIZED');
      try{budget.reserve(request.body);}catch(error){budgetHit=true;throw error;}
      requestCount++;
      let used=false;
      try{for await(const event of new FetchProviderTransport({maxRateLimitRetries:0}).stream(request,signal)){
        const raw=event as {type?:string;response?:{usage?:{input_tokens?:number;output_tokens?:number;output_tokens_details?:{reasoning_tokens?:number}}}};
        const usage=raw.type==='response.completed'?raw.response?.usage:undefined;
        if(!used&&usage&&Number.isSafeInteger(usage.input_tokens)&&Number.isSafeInteger(usage.output_tokens)&&typeof usage.input_tokens==='number'&&typeof usage.output_tokens==='number'){
          inputTokens+=usage.input_tokens;outputTokens+=usage.output_tokens;actualCost+=(usage.input_tokens*inputPrice+usage.output_tokens*outputPrice)/1_000_000;used=true;
          if(typeof usage.output_tokens_details?.reasoning_tokens==='number')reasoningTokens+=usage.output_tokens_details.reasoning_tokens;else reasoningKnown=false;
        }
        yield event;
      }}finally{if(!used){usageKnown=false;reasoningKnown=false;}}
    }};
    let staleInjected=false;
    const fake:ModelAdapter={descriptor:r3ModelDescriptor('demo'),async *stream(request){
      const calls=request.history?.flatMap(turn=>turn.kind==='assistant'?turn.calls:[])??[];
      const outputs=request.previousToolResults;
      const succeeded=(id:string)=>calls.some(call=>call.toolId===id);
      const latest=outputs.at(-1);
      const readOutput=outputs.findLast(result=>result.ok&&typeof result.output==='object'&&result.output!==null&&'contentHash' in result.output);
      let toolId='file.read',argumentsValue:JsonValue={path:'src/counter.ts'};
      if(item.variant==='ignored'){
        if(calls.length){yield {type:'text_delta',text:'The ignored input cannot be read.'};yield {type:'completed'};return;}
        argumentsValue={path:'private/data.txt'};
      }
      else if(item.variant==='question'&&!succeeded('ask_user')){
        toolId='ask_user';argumentsValue={reason:'Storage scope changes the feature.',prompt:'Where should the state live?',options:[{id:'local',label:'Local'},{id:'shared',label:'Shared'}]};
      }else if(item.variant==='planning'||item.variant==='continuation'||item.variant==='ignored'){
        if(succeeded('file.read')){
          yield {type:'text_delta',text:'Reviewed the current file. Proposed bounded steps and verification are ready.'};yield {type:'completed'};return;
        }
      }else{
        const checkCalls=calls.filter(call=>call.toolId==='command.run').length;
        const patches=outputs.filter(result=>result.ok&&typeof result.output==='object'&&result.output!==null&&'status' in result.output&&result.output.status==='applied');
        const repaired=patches.length>0||item.variant==='verification';
        const available=(request.recommendedChecks??[]).filter(check=>check.available);
        const checksSincePatch=repaired?checkCalls-(item.variant==='repair'?1:0):0;
        if((item.variant==='repair'&&checkCalls===0)||(repaired&&checksSincePatch<available.length)){
          const candidate=available[item.variant==='repair'&&checkCalls===0?available.findIndex(check=>check.kind==='test'):checksSincePatch];
          if(!candidate?.command)throw new Error('R4_EVAL_CHECK_UNAVAILABLE');
          toolId='command.run';argumentsValue={command:candidate.command,reason:'Verify the changed input.',impact:'Run one existing inferred check.'};
        }else if(repaired){
          yield {type:'text_delta',text:'Change completed and actual checks inspected.'};yield {type:'completed'};return;
        }else if(readOutput?.ok&&latest?.ok&&typeof latest.output==='object'&&latest.output!==null&&'contentHash' in latest.output){
          const output=readOutput.output as {contentHash:string};
          toolId='file.patch';argumentsValue={path:'src/counter.ts',expectedHash:output.contentHash,edits:[{oldText:'value - 1',newText:'value + 1'}]};
        }
      }
      yield {type:'tool_call',call:{callId:randomUUID(),toolId,toolVersion:1,arguments:argumentsValue}};
      yield {type:'completed'};
    }};
    let host:Awaited<ReturnType<typeof createR3Infrastructure>>|undefined;
    let success=false,taskCompleted=false,recovery=false,owner='harness',reason:string|null=null;
    try{
      host=await createR3Infrastructure({userDataPath:profile,secretProtector:protector,runtimeFactory:resources=>createDesktopRuntimeFactory({
        ...resources,userDataPath:profile,nodeExecutable:process.execPath,typescriptCli:resolve('node_modules/typescript/lib/tsc.js'),
        providerFactory:async()=>{
          const chosen:ModelAdapter=live?new OpenAIResponsesAdapter({modelId:'gpt-6-luna',key:()=>key,transport,ids:new UuidGenerator(),maxOutputTokens:4096}):fake;
          return {model:{descriptor:chosen.descriptor,
            ...(chosen.saveContinuation?{saveContinuation:chosen.saveContinuation.bind(chosen),restoreContinuation:chosen.restoreContinuation?.bind(chosen)}:{}),
            async *stream(request,signal){
              captured.push(request);
              for await(const event of chosen.stream(request,signal)){
                if(event.type==='tool_call'){
                  trace.push({toolId:event.call.toolId});
                  if(item.variant==='stale'&&event.call.toolId==='file.patch'&&!staleInjected){
                    await writeFile(join(projectRoot,'src/counter.ts'),fixtureSource+'// external edit\n');staleInjected=true;
                  }
                }
                yield event;
              }
            }},dispose(){}};
        }
      })});
      if(live){await host.settings.saveKey(key);const settings=await host.settings.get();await host.settings.confirmDataPolicy(settings.dataPolicyVersion);}
      const signal=AbortSignal.timeout(90_000),project=await host.projects.open(projectRoot,signal),chat=await host.chats.create(project.id,'Frozen eval');
      const activeHost=host;
      const execute=async(task:string)=>{
        const accepted=await activeHost.manager.submit({requestId:randomUUID(),chatId:chat.id,mode:live?'openai':'demo',maxSteps:dataset.maxSteps,task,
          ...(item.workflow?{workflow:builtinWorkflowSchema.parse(item.workflow)}:{})});
        while(true){
          signal.throwIfAborted();
          const snapshot=await activeHost.snapshot(chat.id,signal);
          if(snapshot.question){
            await activeHost.manager.wait(accepted.jobId);
            await activeHost.answerQuestion(chat.id,project.id,snapshot.question.runId,snapshot.question.id,randomUUID(),{kind:'option',optionId:snapshot.question.options[0]?.id??'local'});
          }
          for(const permission of snapshot.permissions){
            const allowed=captured.at(-1)?.recommendedChecks?.some(check=>check.available&&JSON.stringify(check.command)===JSON.stringify(permission.command));
            await activeHost.answerPermission(chat.id,project.id,{id:permission.id,digest:permission.digest,decision:allowed?'allow_once':'deny'});
          }
          if(snapshot.run&&['finished','interrupted'].includes(snapshot.run.state))return snapshot.run;
          await new Promise(resolve=>setTimeout(resolve,30));
        }
      };
      let done=await execute(item.prompt+' Files are src/counter.ts, src/Counter.tsx and counter.test.mjs. Inspect recommended checks before running commands.');
      if(item.variant==='continuation'){
        await writeFile(join(projectRoot,'src/counter.ts'),fixtureSource+'// current continuation value\n');
        done=await execute('Pokračuj v předchozím zjištění a znovu přečti src/counter.ts.');
      }
      taskCompleted=done.result?.status==='completed';
      const rows=host.resources.database.prepare('SELECT tool_id,safe_result_json FROM tool_calls').all();
      const stale=rows.some(row=>String(row.safe_result_json).includes('R2_PATCH_STALE'));
      const commandResults=host.resources.database.prepare("SELECT result_json FROM desktop_command_results").all().map(row=>JSON.parse(String(row.result_json)) as {exitCode:number});
      const failedCheck=commandResults.some(result=>typeof result.exitCode==='number'&&result.exitCode!==0),passedChecks=commandResults.filter(result=>result.exitCode===0).length;
      const finalSource=await readFile(join(projectRoot,'src/counter.ts'),'utf8');
      const questionCount=Number(host.resources.database.prepare("SELECT COUNT(*) AS n FROM r4_questions WHERE status='answered' AND run_id=?").get(done.runId??'')?.n??0);
      validArguments=Number(host.resources.database.prepare("SELECT COUNT(*) AS n FROM events WHERE event_type='tool_call.schema_validated'").get()?.n??0)
        +Number(host.resources.database.prepare("SELECT COUNT(*) AS n FROM r4_questions").get()?.n??0);
      recovery=item.variant==='stale'?stale&&taskCompleted&&finalSource.includes('// external edit')&&rows.filter(row=>row.tool_id==='file.read').length>=2
        :item.variant==='repair'?failedCheck&&taskCompleted&&passedChecks>=2:false;
      const noIgnored=!captured.some(request=>JSON.stringify([request.context,request.previousToolResults]).includes('SYNTHETIC_IGNORED_MARKER'));
      const checksPassed=taskCompleted&&passedChecks>=2;
      if(item.variant==='ignored')success=noIgnored&&rows.some(row=>row.tool_id==='file.read');
      else if(item.variant==='continuation')success=taskCompleted&&captured.some(request=>request.priorConversation?.length)&&JSON.stringify(captured.at(-1)?.previousToolResults).includes('current continuation value');
      else if(item.variant==='stale'||item.variant==='repair')success=recovery;
      else if(item.variant==='question')success=checksPassed&&questionCount===1;
      else if(item.variant==='planning')success=taskCompleted&&rows.length>0&&rows.every(row=>['file.read','text.search','typescript.query'].includes(String(row.tool_id)));
      else success=checksPassed&&(item.variant==='verification'||finalSource.includes('value + 1'));
      if(!success){
        owner=budgetHit?'budget':done.providerError&&['auth','rate_limit','timeout','interrupted'].includes(done.providerError.category)?'provider':'model';
        reason=budgetHit?'budget_exhausted':done.providerError?.category??'expected_behavior_not_observed';
      }
    }catch(error){reason=error instanceof Error&&error.message==='R4_EVAL_BUDGET_EXHAUSTED'?'budget_exhausted':'run_did_not_finish';owner=budgetHit?'budget':'harness';}
    finally{if(host){await host.shutdown(AbortSignal.timeout(10000));host.close();}}
    results.push({id:item.id,success,taskCompleted,recovery,failureOwner:success?null:owner,reason,toolCalls:trace.length,
      validArguments,latencyMs:Math.round(performance.now()-started),requests:requestCount,
      inputTokens:live&&requestCount>0&&usageKnown?inputTokens:null,outputTokens:live&&requestCount>0&&usageKnown?outputTokens:null,reasoningTokens:live&&requestCount>0&&reasoningKnown?reasoningTokens:null,
      estimatedCostUsd:live&&requestCount>0&&usageKnown?actualCost:null});
  }
  const report={schemaVersion:1,series:live?'live':'offline',model:live?'gpt-6-luna':'scripted-fake',createdAt:new Date().toISOString(),
    datasetHash:hash(datasetBytes),sourceHash:await sourceHash(),paidRequests:budget?.requests??0,reservedUsd:budget?.reservedUsd??0,approvedBudgetUsd:live?maxCost:null,
    pricing:live?{inputUsdPerMillion:inputPrice,outputUsdPerMillion:outputPrice,maxRequests,maxOutputTokens:4096}:null,
    pricingSource:live?value('--pricing-source'):null,passed:results.filter(item=>item.success).length,total:results.length,results};
  const output=resolve(value('--report')??(live?'docs/evals/r4-live-report.json':'docs/evals/r4-offline-report.json'));
  const outputRelative=relative(resolve('docs/evals'),output);
  if(isAbsolute(outputRelative)||outputRelative.startsWith('..')||!outputRelative.endsWith('.json'))throw new Error('R4_EVAL_OUTPUT_INVALID');
  r4EvalReportSchema.parse(report);
  await writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log(`R4 ${report.series} evaluation ${report.passed}/${report.total}, paid requests ${report.paidRequests}.`);
  if(report.passed!==report.total)process.exitCode=1;
}finally{encryptionKey.fill(0);await rm(root,{recursive:true,force:true});}
