import { expect,it,vi } from 'vitest';
import type { R3Snapshot,R3Update } from '@codryn/shared';
import { DesktopStore } from '../src/renderer/desktop-store.js';
function snapshot(id:string,cursor:number):R3Snapshot{return {chat:{id},cursor} as R3Snapshot;}
it('keeps selected chat ownership when an older attach resolves later and detaches without stop',async()=>{
  const waiting=new Map<string,(value:{subscriptionId:string;snapshot:R3Snapshot})=>void>(),detach=vi.fn();
  const client={attach:(id:string)=>new Promise<{subscriptionId:string;snapshot:R3Snapshot}>(resolve=>waiting.set(id,resolve)),detach,snapshot:vi.fn(),onUpdate:()=>()=>undefined};
  const store=new DesktopStore(client);const a=store.select('a'),b=store.select('b');
  waiting.get('b')?.({subscriptionId:'sb',snapshot:snapshot('b',8)});await b;
  waiting.get('a')?.({subscriptionId:'sa',snapshot:snapshot('a',3)});await a;
  expect(store.get().snapshot?.chat.id).toBe('b');expect(detach).toHaveBeenCalledWith('sa');store.dispose();expect(detach).toHaveBeenCalledWith('sb');
});
it('resynchronizes a cursor gap and never applies a foreign chat update',async()=>{
  let listener:(value:R3Update)=>void=()=>undefined;let next=2;
  const snapshotRead=vi.fn(async()=>snapshot('a',5)),client={attach:async()=>({subscriptionId:`s${next++}`,snapshot:snapshot('a',5)}),detach:vi.fn(),snapshot:snapshotRead,onUpdate:(callback:(value:R3Update)=>void)=>{listener=callback;return ()=>undefined;}};
  const store=new DesktopStore(client);await store.select('a');listener({kind:'refresh',chatId:'b',cursor:6});expect(snapshotRead).not.toHaveBeenCalled();listener({kind:'refresh',chatId:'a',cursor:8});await new Promise(resolve=>setTimeout(resolve,10));expect(client.detach).toHaveBeenCalledWith('s2');expect(store.get().snapshot?.cursor).toBe(5);store.dispose();
});
