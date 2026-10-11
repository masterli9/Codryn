import { randomUUID } from 'node:crypto';
import { expect,it,vi } from 'vitest';
import { R3Subscriptions } from '../src/ipc/r3-subscriptions.js';
import type { SubscriptionService } from '@codryn/core';
it('binds subscription IDs to one sender and bounds unacknowledged deliveries',async()=>{
  let receiver:(update:{kind:'refresh';chatId:string;cursor:number})=>void=()=>undefined;const id=randomUUID(),chatId=randomUUID(),detach=vi.fn(),service={attach:async(_chat:string,_after:number,send:typeof receiver)=>{receiver=send;return {id,snapshot:{cursor:0}};},detach} as unknown as SubscriptionService;
  const sender={id:1,send:vi.fn(),isDestroyed:()=>false};const subscriptions=new R3Subscriptions(service);await subscriptions.attach({sender} as never,chatId,0);
  expect(()=>subscriptions.detach({sender:{...sender,id:2}} as never,id)).toThrow('R3_SENDER_REJECTED');
  for(let cursor=1;cursor<=257;cursor++)receiver({kind:'refresh',chatId,cursor});expect(detach).toHaveBeenCalledWith(id);expect(sender.send.mock.calls.at(-1)?.[1]).toMatchObject({kind:'resync_required'});
});
