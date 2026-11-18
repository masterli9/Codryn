import { expect,it } from 'vitest';
import { ResourceBarrier } from '../src/workspace/resource-barrier.js';
it('shares independent mutations and fairly admits the queued exclusive observation before newer mutations',async()=>{
  const barrier=new ResourceBarrier(),order:string[]=[];
  const signal=AbortSignal.timeout(5000);
  let release:()=>void=()=>undefined;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const first=barrier.shared('workspace',signal,async()=>{order.push('first');await gate;});
  const second=barrier.shared('workspace',signal,async()=>{order.push('second');await gate;});
  const observe=barrier.exclusive('workspace',signal,async()=>{order.push('observer');});
  const last=barrier.shared('workspace',signal,async()=>{order.push('last');});
  await barrier.shared('independent',signal,async()=>{order.push('independent');});
  expect(order).toEqual(['first','second','independent']);
  release();await Promise.all([first,second,observe,last]);
  expect(order).toEqual(['first','second','independent','observer','last']);
});
it('removes cancelled waiters and releases after a failed action',async()=>{
  const barrier=new ResourceBarrier(),abort=new AbortController(),signal=AbortSignal.timeout(5000);
  let release:()=>void=()=>undefined;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const first=barrier.exclusive('same',signal,async()=>{await gate;throw new Error('failed');});
  const aborted=barrier.shared('same',abort.signal,async()=>{throw new Error('must not execute');});
  abort.abort();
  await expect(aborted).rejects.toThrow();
  const next=barrier.shared('same',signal,async()=>42);
  const failure=expect(first).rejects.toThrow('failed');
  release();await failure;expect(await next).toBe(42);
});
