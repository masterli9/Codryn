import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { r3ModelDescriptor,type IdGenerator,type ModelAdapter,type SecretStore } from '@codryn/core';
import type { R3Mode } from '@codryn/shared';
import { SessionSecret } from './session-secret.js';
import { OpenAIResponsesAdapter } from './openai-responses-adapter.js';
import { FetchProviderTransport,type ProviderTransport } from './provider-transport.js';
import { ScriptedModelAdapter } from './scripted-model-adapter.js';
import { changeVerifyReturnScenario } from './change-verify-return-scenario.js';
export async function createR3Provider(options:{mode:R3Mode;secrets:SecretStore;ids:IdGenerator;projectRoot:string;nodeExecutable?:string|null;transport?:ProviderTransport}):Promise<{model:ModelAdapter;dispose():void}> {
  if(options.mode==='demo') {
    try {
      const originalContent=await readFile(join(options.projectRoot,'sum.mjs'),'utf8'),test=await readFile(join(options.projectRoot,'sum.test.mjs'),'utf8');
      if(!originalContent.includes('return a - b')||createHash('sha256').update(test.replaceAll('\r\n','\n')).digest('hex')!=='66c51424f33087ac403d414fe1ef35b5ac8e4e976ed674687fcd85fafc7384d8')throw new Error('unsupported');
      const executable=options.nodeExecutable??(process.versions.electron?null:process.execPath);if(!executable)throw new Error('runtime');
      const scripted=new ScriptedModelAdapter(changeVerifyReturnScenario({projectRoot:options.projectRoot,originalContent,expectedHash:createHash('sha256').update(originalContent).digest('hex'),runtimeExecutable:executable,callIds:{search:options.ids.next(),read:options.ids.next(),patch:options.ids.next(),command:options.ids.next()}}));
      return {model:{descriptor:r3ModelDescriptor('demo'),stream:(request,signal)=>scripted.stream(request,signal)},dispose(){}};
    }catch{throw new Error('R3_DEMO_UNSUPPORTED');}
  }
  return createLive(options);
}
async function createLive(options:{secrets:SecretStore;ids:IdGenerator;transport?:ProviderTransport}) {
  const value=await options.secrets.read('openai'),secret=new SessionSecret(()=>value);
  const model=new OpenAIResponsesAdapter({modelId:'gpt-6-luna',key:()=>secret.get(),transport:options.transport??new FetchProviderTransport({maxRateLimitRetries:4}),ids:options.ids});
  return {model,dispose(){secret.clear();}};
}
