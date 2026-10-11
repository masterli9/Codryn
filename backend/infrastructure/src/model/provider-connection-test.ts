import { randomUUID } from 'node:crypto';
import type { IsoTimestamp, R3RunView } from '@codryn/shared';
import { collectModelResponse } from '@codryn/core';
import { OpenAIResponsesAdapter } from './openai-responses-adapter.js';
import { FetchProviderTransport,type ProviderTransport } from './provider-transport.js';
import { ProviderAdapterError } from './provider-errors.js';
export function safeProviderError(error:unknown): R3RunView['providerError'] {
  const category=error instanceof ProviderAdapterError?error.code:'provider_error';
  const delay=error instanceof ProviderAdapterError?error.retryAfterMs:null;
  return {category:category==='provider_error'?'provider':category,retryAfterMs:typeof delay==='number'&&Number.isSafeInteger(delay)&&delay>=0&&delay<=60000?delay:null};
}
export async function testProviderConnection(secret:string,signal:AbortSignal,options:{transport?:ProviderTransport}={}):Promise<{passed:boolean;category:R3RunView['providerError'];at:IsoTimestamp}> {
  const bounded=AbortSignal.any([signal,AbortSignal.timeout(10000)]), transport=options.transport??new FetchProviderTransport({maxRateLimitRetries:0,totalTimeoutMs:10000});
  const adapter=new OpenAIResponsesAdapter({modelId:'gpt-6-luna',key:()=>secret,transport,ids:{next:()=>randomUUID()},maxOutputTokens:32});
  let category:R3RunView['providerError']=null;
  const wrapped={descriptor:adapter.descriptor,async *stream(...args:Parameters<typeof adapter.stream>){try{yield* adapter.stream(...args);}catch(error){category=safeProviderError(error);throw error;}}};
  try {await collectModelResponse(wrapped.stream({runId:randomUUID(),task:'Reply with OK.',project:{id:'connection-test'},context:[],tools:[],previousToolResults:[]},bounded),bounded);return {passed:true,category:null,at:new Date().toISOString()};}
  catch {return {passed:false,category:category??{category:signal.aborted?'interrupted':bounded.aborted?'timeout':'provider',retryAfterMs:null},at:new Date().toISOString()};}
}
