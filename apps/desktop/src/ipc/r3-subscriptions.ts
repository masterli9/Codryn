import type { SubscriptionService } from '@codryn/core';
import { r3UpdateSchema } from '@codryn/shared';
import type { R3Update } from '@codryn/shared';
import type { R3SenderEvent } from './r3-handler.js';
interface Receiver {owner:number;chatId:string;pending:Map<number,number>;bytes:number;send:(update:R3Update)=>void;detached:boolean}
export class R3Subscriptions {
  private readonly receivers=new Map<string,Receiver>();
  constructor(private readonly service:SubscriptionService){}
  async attach(event:R3SenderEvent,chatId:string,afterCursor:number){
    const receiver:Receiver={owner:event.sender.id,chatId,pending:new Map(),bytes:0,detached:false,send:update=>event.sender.send('r3:update',update)};const identity:{id?:string}={};
    const attached=await this.service.attach(chatId,afterCursor,raw=>{
      if(receiver.detached||event.sender.isDestroyed()){if(identity.id)this.service.detach(identity.id);return;}
      const update=r3UpdateSchema.parse(raw),bytes=new TextEncoder().encode(JSON.stringify(update)).length;
      receiver.pending.set(update.cursor,bytes);receiver.bytes+=bytes;
      if(receiver.pending.size>256||receiver.bytes>1024*1024||update.kind==='resync_required'){
        receiver.detached=true;if(identity.id){this.service.detach(identity.id);this.receivers.delete(identity.id);}receiver.send({kind:'resync_required',chatId,cursor:update.cursor});return;
      }
      receiver.send(update);
    });identity.id=attached.id;if(receiver.detached)this.service.detach(attached.id);else this.receivers.set(attached.id,receiver);return {subscriptionId:attached.id,snapshot:attached.snapshot};
  }
  detach(event:R3SenderEvent,id:string):void {const receiver=this.receivers.get(id);if(!receiver)return;if(receiver.owner!==event.sender.id)throw new Error('R3_SENDER_REJECTED');receiver.detached=true;this.service.detach(id);this.receivers.delete(id);}
  acknowledge(owner:number,chatId:string,cursor:number):void {for(const receiver of this.receivers.values())if(receiver.owner===owner&&receiver.chatId===chatId){for(const [sequence,size]of receiver.pending)if(sequence<=cursor){receiver.bytes-=size;receiver.pending.delete(sequence);}}}
  detachOwner(owner:number):void {for(const [id,receiver]of this.receivers)if(receiver.owner===owner){receiver.detached=true;this.service.detach(id);this.receivers.delete(id);}}
  close():void {for(const receiver of this.receivers.values())this.detachOwner(receiver.owner);}
}
