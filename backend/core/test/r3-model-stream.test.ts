import { expect,it,vi } from 'vitest';
import { StreamBatcher } from '../src/desktop/stream-batcher.js';
import { collectModelResponse } from '../src/agent/model-response-collector.js';
it('publishes validated deltas before completion and never exposes an invalid event to the sink',async()=>{
  const observed:string[]=[];let release:()=>void=()=>undefined;const barrier=new Promise<void>(resolve=>{release=resolve;});
  const stream=(async function*(){yield {type:'text_delta',text:'Prefix'};await barrier;yield {type:'completed'};})();
  const response=collectModelResponse(stream,new AbortController().signal,{onValidatedEvent:async event=>{if(event.type==='text_delta'){observed.push(event.text);release();}}});
  expect((await response).text).toBe('Prefix');expect(observed).toEqual(['Prefix']);
  await expect(collectModelResponse((async function*(){yield {type:'text_delta',text:'',secret:'x'};})(),new AbortController().signal,{onValidatedEvent:async()=>{observed.push('invalid');}})).rejects.toThrow();expect(observed).toEqual(['Prefix']);
});
it('flushes at UTF-8 byte and time limits with monotonic committed batches',async()=>{
  vi.useFakeTimers();const chunks:{sequence:number;text:string}[]=[];
  const batcher=new StreamBatcher({flushBytes:4096,flushMs:50,write:async(sequence,text)=>{chunks.push({sequence,text});}});
  try{await batcher.push('😀'.repeat(1025));expect(chunks[0]?.sequence).toBe(1);expect(Buffer.byteLength(chunks[0]?.text??'')).toBe(4096);await vi.advanceTimersByTimeAsync(50);expect(chunks.map(c=>c.text).join('')).toBe('😀'.repeat(1025));await batcher.close('complete');expect(chunks.map(c=>c.sequence)).toEqual([1,2]);}finally{vi.useRealTimers();}
});
it('retains and propagates an asynchronous timer write failure without an unhandled rejection',async()=>{
  vi.useFakeTimers();const batcher=new StreamBatcher({flushBytes:4096,flushMs:50,write:async()=>{throw new Error('disk failed');}});
  try{await batcher.push('prefix');await vi.advanceTimersByTimeAsync(50);await expect(batcher.close('interrupted')).rejects.toThrow('disk failed');}finally{vi.useRealTimers();}
});
